// 火山引擎豆包语音合成（官方付费接口，V3 HTTP Chunked 单向流式：一次送一句，流式拿回音频和字幕）。
// 接口文档：https://www.volcengine.com/docs/6561/1598757
// 配置（tts 字段）：
//   provider = "volcengine"
//   voice    = 音色 ID（speaker），如 zh_female_vv_uranus_bigtts，见音色列表 https://www.volcengine.com/docs/6561/1257544
//   model    = 资源 ID（X-Api-Resource-Id），默认 seed-tts-2.0；音色要和版本对应（2.0 音色只能用 seed-tts-2.0）
//   instruction = 语音指令（可选，仅 2.0 音色），如「你可以说慢一点吗？」，用来调语气、语速
// 逐字时间戳：2.0 用 enable_subtitle，1.0 用 enable_timestamp，写到 <音频名>.words.json（单位秒）。
// 不支持读音表（2.0 音色不支持 SSML，开 SSML 也不返回字幕）；scene / emotion 不生效。
// 密钥：环境变量 VOLC_TTS_API_KEY（新版控制台的 API Key），可写在项目根目录 .env。
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { rmSync, writeFileSync } from "node:fs";

const ENDPOINT = "https://openspeech.bytedance.com/api/v3/tts/unidirectional";
const DEFAULT_RESOURCE = "seed-tts-2.0";
const SAMPLE_RATE = 24000;
const DONE_CODE = 20000000;
const TIMEOUT_MS = 120_000;

/** 每句同时输出逐字时间戳 */
export const wordTimestamps = true;

/** 倍速 1.2 → speech_rate 20（取值 -50 ~ 100，100 为 2 倍速） */
export function speechRate(speed) {
  const rate = Math.round((Number(speed ?? 1) - 1) * 100);
  return Math.max(-50, Math.min(100, rate));
}

export function buildBody({ text, voice, speed, model, instruction }) {
  const isV1 = /-1\.0/.test(model || DEFAULT_RESOURCE);
  const additions = instruction ? { context_texts: [instruction] } : null;
  return {
    user: { uid: "narrated-video" },
    req_params: {
      text,
      speaker: voice,
      audio_params: {
        format: "pcm",
        sample_rate: SAMPLE_RATE,
        speech_rate: speechRate(speed),
        ...(isV1 ? { enable_timestamp: true } : { enable_subtitle: true }),
      },
      ...(additions ? { additions: JSON.stringify(additions) } : {}),
    },
  };
}

/** 流式响应是一个接一个的 JSON 对象（不保证按行分隔），按括号深度切开；返回切出的对象和剩下的半截 */
export function splitJsonObjects(buffer) {
  const objects = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let start = -1;
  for (let i = 0; i < buffer.length; i++) {
    const ch = buffer[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      if (depth++ === 0) start = i;
    } else if (ch === "}" && --depth === 0) {
      objects.push(JSON.parse(buffer.slice(start, i + 1)));
      start = -1;
    }
  }
  return { objects, rest: start >= 0 ? buffer.slice(start) : "" };
}

/** 一条响应 → 累加音频块和字幕；结束或出错时返回状态 */
export function collect(msg, state) {
  if (msg.code && msg.code !== DONE_CODE) {
    return { ...state, error: `${msg.code} ${msg.message || ""}`.trim() };
  }
  const audio = msg.data ? [...state.audio, Buffer.from(msg.data, "base64")] : state.audio;
  const words = msg.sentence?.words?.length
    ? [...state.words, ...msg.sentence.words.map((w) => ({ text: w.word.trim(), start: w.startTime, end: w.endTime }))]
    : state.words;
  return { ...state, audio, words, done: state.done || msg.code === DONE_CODE };
}

const FRAME_SECONDS = 0.02;
const LOUD_DB = -35; // 高于这个音量算有声音（句尾常有 -40dB 上下的底噪，不能算）
const MIN_GAP = 0.08; // 至少这么长的静音才算一次停顿
const SHORT_WORD = 0.06;

/** 16 位 PCM → 有声音的结束时间、句中停顿（静音段 [start, end]），按 20ms 一帧算音量 */
export function analyzePcm(pcm, sampleRate = SAMPLE_RATE) {
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
  const frame = Math.round(sampleRate * FRAME_SECONDS);
  const loud = [];
  for (let i = 0; i < samples.length; i += frame) {
    let sum = 0;
    const end = Math.min(i + frame, samples.length);
    for (let j = i; j < end; j++) sum += samples[j] * samples[j];
    const rms = Math.sqrt(sum / (end - i)) || 1;
    loud.push(20 * Math.log10(rms / 32768) > LOUD_DB);
  }
  const first = loud.indexOf(true);
  const last = loud.lastIndexOf(true);
  if (first < 0) return { speechEnd: 0, gaps: [] };
  const gaps = [];
  let quietFrom = null;
  for (let k = first; k <= last; k++) {
    if (!loud[k] && quietFrom === null) quietFrom = k;
    if (loud[k] && quietFrom !== null) {
      if ((k - quietFrom) * FRAME_SECONDS >= MIN_GAP) gaps.push([quietFrom * FRAME_SECONDS, k * FRAME_SECONDS]);
      quietFrom = null;
    }
  }
  return { speechEnd: (last + 1) * FRAME_SECONDS, gaps };
}

/**
 * 校正火山的字幕时间戳（实测 seed-tts-2.0）：
 * 1. 英文、数字只给一个几十毫秒的点，落在真实发音的末尾 → 开始时间接到上一个字的结束
 * 2. 最后一次停顿之后的几个字被压扁，结束得比声音早 → 这一段按真实的声音结束时间线性拉伸
 */
export function fixWords(words, { speechEnd, gaps }) {
  const round3 = (x) => Math.round(x * 1000) / 1000;
  const filled = words.map((w, i) =>
    i > 0 && w.end - w.start < SHORT_WORD && w.start > words[i - 1].end ? { ...w, start: words[i - 1].end } : w,
  );
  const lastEnd = filled.at(-1)?.end ?? 0;
  if (!filled.length || speechEnd <= lastEnd + 0.05) return filled;
  const lastGapEnd = gaps.length ? gaps.at(-1)[1] : 0;
  // 拉伸起点：最后一次停顿后的第一个字；停顿后只剩标点（字的时间落进了停顿里）时，退到最后一个真正的字
  const lastSpoken = filled.findLast((w) => !/^[\p{P}\p{S}]+$/u.test(w.text)) ?? filled.at(-1);
  const afterGap = filled.find((w) => w.start >= lastGapEnd - 0.05);
  const anchor = Math.min(afterGap?.start ?? filled[0].start, lastSpoken.start);
  const scale = (speechEnd - anchor) / (lastEnd - anchor);
  const stretch = (t) => (t <= anchor ? t : round3(anchor + (t - anchor) * scale));
  return filled.map((w) => ({ ...w, start: stretch(w.start), end: stretch(w.end) }));
}

async function request(opts) {
  const { model } = opts;
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": process.env.VOLC_TTS_API_KEY,
      "X-Api-Resource-Id": model || DEFAULT_RESOURCE,
      "X-Api-Request-Id": randomUUID(),
    },
    body: JSON.stringify(buildBody(opts)),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const logId = res.headers.get("x-tt-logid") || "";
  if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}（logid ${logId}）`);

  let state = { audio: [], words: [], done: false, error: null };
  let buffer = "";
  const decoder = new TextDecoder();
  for await (const chunk of res.body) {
    const { objects, rest } = splitJsonObjects(buffer + decoder.decode(chunk, { stream: true }));
    buffer = rest;
    for (const msg of objects) state = collect(msg, state);
    if (state.error) throw new Error(`${state.error}（logid ${logId}）`);
  }
  if (!state.done) throw new Error(`响应没有正常结束（logid ${logId}）`);
  return state;
}

export async function synthesize(opts) {
  const { text, outFile } = opts;
  if (!process.env.VOLC_TTS_API_KEY) {
    throw new Error("volcengine 需要 VOLC_TTS_API_KEY：在火山引擎豆包语音控制台创建 API Key，写进项目根目录 .env");
  }
  let state;
  try {
    state = await request(opts);
  } catch (err) {
    throw new Error(`volcengine 生成失败：「${text}」：${err.message}`);
  }
  const audio = Buffer.concat(state.audio);
  const pcm = `${outFile}.pcm`;
  try {
    writeFileSync(pcm, audio);
    execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "s16le", "-ar", String(SAMPLE_RATE), "-ac", "1", "-i", pcm, outFile]);
  } finally {
    rmSync(pcm, { force: true });
  }
  // 逐字时间戳写在音频旁边：xx.wav → xx.words.json
  const words = fixWords(state.words.filter((w) => w.text), analyzePcm(audio));
  writeFileSync(outFile.replace(/\.wav$/, ".words.json"), JSON.stringify(words));
}
