// 一句口播 → 干净的音频片段：合成（按内容缓存）→ 切掉首尾静音 → 逐字时间戳（若 TTS 提供）。
// nv voice（自带视频模板）和 nv hf-audio（HyperFrames 工作流）共用。
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getProvider } from "../../tts/index.mjs";
import { applyPronounce, restoreSpans } from "./pronounce.mjs";
import { adoptPunctuation, dropExtras, frameCuts, splitWordsByFrame, spokenPrompt } from "./voice-direction.mjs";

const KEEP_HEAD = 0.04; // 切静音时句首留一点，避免吃掉字头
const KEEP_TAIL = 0.08; // 句尾留一点，让尾音自然收住
const SILENCE_DB = -45;
const PUNCTUATION = /^[\p{P}\p{S}\s]+$/u;

export function probeDuration(file) {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return Number(out.toString().trim());
}

/** 读取项目根目录 .env（KEY=VALUE），已存在的环境变量不覆盖。密钥类配置放这里，不要写进配置文件 */
export function loadDotEnv(root) {
  const file = join(root, ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const round3 = (x) => Math.round(x * 1000) / 1000;

function cutClip(file, out, start, end) {
  execFileSync("ffmpeg", ["-y", "-v", "error", "-i", file, "-ss", String(start), "-to", String(end), out]);
}

/** 有逐字时间戳：按第一个字和最后一个「非标点」字精确裁剪，时间戳随之平移 */
function trimByWords(file, words, out) {
  const spoken = words.filter((w) => !PUNCTUATION.test(w.text));
  const start = Math.max(0, spoken[0].start - KEEP_HEAD);
  const end = Math.min(probeDuration(file), spoken[spoken.length - 1].end + KEEP_TAIL);
  cutClip(file, out, start, end);
  return words.map((w) => ({ text: w.text, start: round3(Math.max(0, w.start - start)), end: round3(Math.min(end, w.end) - start) }));
}

/** 没有时间戳：用 ffmpeg 静音检测切首尾 */
function trimBySilence(file, out) {
  const cut = `silenceremove=start_periods=1:start_threshold=${SILENCE_DB}dB:start_silence=${KEEP_HEAD}`;
  execFileSync("ffmpeg", ["-y", "-v", "error", "-i", file, "-af", `${cut},areverse,${cut},areverse`, out]);
}

/**
 * 合成并清理一句口播。
 * @param {{ text: string }} line
 * @param {object} tts  provider / model / voice / speed / scene / emotion / instruction / pronounce（读音表，见 pronounce.mjs）
 * @param {string} dir  缓存目录
 * @param {string} name 文件名前缀（如 "03"）
 * @returns {Promise<{ file: string, speechDuration: number, words: {text: string, start: number, end: number}[] }>}
 */
export async function synthesizeClean(line, tts, dir, name) {
  const provider = getProvider(tts.provider);
  // 读音表只对支持 SSML 的服务商生效；送出去的是 ttsText，字幕和关键词仍按 line.text
  const { ttsText, spans } = provider.ssml ? applyPronounce(line.text, tts.pronounce) : { ttsText: line.text, spans: [] };
  // style / reference / seed 只在填了时才进 key，旧缓存不失效
  const extra = [tts.style, tts.reference, tts.seed].filter((v) => v !== undefined && v !== "");
  const key = [tts.provider, tts.model, tts.voice, tts.speed, tts.scene, tts.emotion, tts.instruction, ...extra, ttsText].join("|");
  const hash = createHash("sha1").update(key).digest("hex").slice(0, 8);
  const raw = join(dir, `${name}-${hash}.wav`);
  const wordsRaw = raw.replace(/\.wav$/, ".words.json");
  // 旧缓存没有时间戳、而服务商能给时，重新合成一次
  if (existsSync(raw) && (existsSync(wordsRaw) || !provider.wordTimestamps)) {
    console.log(`  ✓  ${name}（缓存）`);
  } else {
    console.log(`  🎙  ${name}：${line.text}`);
    await provider.synthesize({ ...tts, text: ttsText, outFile: raw });
  }

  const file = raw.replace(/\.wav$/, ".trim.wav");
  const rawWords = restoreSpans(existsSync(wordsRaw) ? JSON.parse(readFileSync(wordsRaw, "utf8")) : [], line.text, spans);
  const hasWords = rawWords.some((w) => !PUNCTUATION.test(w.text));
  const words = hasWords ? trimByWords(raw, rawWords, file) : (trimBySilence(raw, file), []);
  if (hasWords) writeFileSync(file.replace(/\.wav$/, ".words.json"), JSON.stringify(words));
  return { file, speechDuration: probeDuration(file), words };
}

/**
 * 按导演稿整段生成几帧的口播，再按逐字时间戳切回每一帧（见 voice-direction.mjs）。
 * 帧与帧之间切在两句中间的停顿处，保留整段说话的自然衔接；只切掉整段的首尾静音。
 * {语气词} 不进逐字时间，标点按口播原文（导演稿里为停顿加的「…」不影响字幕断句）。
 * @param {{ name: string, frames: number[], prompt: string }} segment
 * @param {{ frame: number, text: string }[]} lines 这一段的口播（按帧顺序）
 * @returns {Promise<{ file: string, speechDuration: number, words: {text: string, start: number, end: number}[] }[]>}
 */
export async function synthesizeSegment(segment, lines, tts, dir) {
  const provider = getProvider(tts.provider);
  if (!provider.direction) throw new Error(`${tts.provider} 不支持导演稿（VOICE.md），只有 seedaudio 支持`);
  const text = lines.map((l) => l.text).join("");
  const extra = [tts.style, tts.reference, tts.seed].filter((v) => v !== undefined && v !== "");
  const key = [tts.provider, tts.model, tts.voice, tts.speed, ...extra, segment.prompt, text].join("|");
  const hash = createHash("sha1").update(key).digest("hex").slice(0, 8);
  const name = `seg-${String(lines[0].frame).padStart(2, "0")}-${String(lines.at(-1).frame).padStart(2, "0")}`;
  const raw = join(dir, `${name}-${hash}.wav`);
  const wordsRaw = raw.replace(/\.wav$/, ".words.json");
  if (existsSync(raw) && existsSync(wordsRaw)) {
    console.log(`  ✓  ${segment.name}（第 ${lines[0].frame}–${lines.at(-1).frame} 帧，缓存）`);
  } else {
    console.log(`  🎙  ${segment.name}（第 ${lines[0].frame}–${lines.at(-1).frame} 帧）：${text}`);
    await provider.synthesize({ ...tts, text, direction: spokenPrompt(segment.prompt), outFile: raw });
  }

  // {语气词} 照样念，但不进字幕：从时间戳里去掉，再按原文字数分帧
  const words = dropExtras(JSON.parse(readFileSync(wordsRaw, "utf8")), segment.prompt);
  const groups = splitWordsByFrame(words, lines.map((l) => l.text));
  const cuts = frameCuts(groups, probeDuration(raw), { head: KEEP_HEAD, tail: KEEP_TAIL });
  return lines.map((line, i) => {
    const { start, end } = cuts[i];
    const file = raw.replace(/\.wav$/, `.f${String(line.frame).padStart(2, "0")}.wav`);
    cutClip(raw, file, start, end);
    const shifted = adoptPunctuation(groups[i], line.text).map((w) => ({
      text: w.text,
      start: round3(Math.max(0, w.start - start)),
      end: round3(Math.min(end, w.end) - start),
    }));
    return { file, speechDuration: probeDuration(file), words: shifted };
  });
}
