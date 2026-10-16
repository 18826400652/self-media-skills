// 千问音频生成 qwen-audio-3.1-tts-next（阿里云，按描述「演」出口播，价格比 Seed-Audio 低）。
// 接口文档：https://platform.qianwenai.com/docs/api-reference/audio-generation（同步 HTTP，返回音频 URL）
// 用法和 seedaudio 一样：有 VOICE.md 时按导演稿整段生成，没有就逐帧；写法见 references/voice-direction.md。
// 它不返回时间戳：生成后把音频 URL 交给录音文件识别（fun-asr），再按字对齐回口播原文（scripts/lib/align.mjs）。
// 配置（tts 字段）：
//   provider  = "qwenaudio"
//   style     = 人设和场景，括号里自动补「饰演者为@voice1」
//   reference = 参考音频路径（相对项目根目录；≤30 秒、≤10MB，wav/mp3）。不支持系统音色 ID
//   speed     = 语速（0.5–2.0）
//   seed      = 随机种子（可选，默认 42；同一份提示想换个演法就改它）
// 密钥：DASHSCOPE_API_KEY（和 cosyvoice 共用），写在项目根目录 .env。
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { alignToText } from "../scripts/lib/align.mjs";
import { quotedText } from "../scripts/lib/voice-direction.mjs";
import { persona } from "./seedaudio.mjs";

const GENERATE = "https://maas.qianwenaiapi.com/api/v1/services/audio/tts/SpeechSynthesizer";
const ASR = "https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription";
const TASKS = "https://dashscope.aliyuncs.com/api/v1/tasks";
const MODEL = "qwen-audio-3.1-tts-next";
const ASR_MODEL = "fun-asr";
const SAMPLE_RATE = 24000;
const TIMEOUT_MS = 300_000;
const ASR_TIMEOUT_MS = 180_000;
const ATTEMPTS = 5;
const TAIL = "只说引号里的话，一字不改，不加背景音乐和音效。";
const MIME = { ".wav": "audio/wav", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".opus": "audio/ogg" };

/** 每句同时输出逐字时间戳（识别对齐得到） */
export const wordTimestamps = true;

/** 支持导演稿（VOICE.md）整段生成 */
export const direction = true;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function buildPrompt(opts) {
  const who = persona(opts, "@voice1");
  if (opts.direction) return `${who}。\n${opts.direction.trim()}\n${TAIL}`;
  return `${who}，说道：“${opts.text}”${TAIL}`;
}

export function buildBody(opts, root = process.cwd()) {
  const { reference, voice, speed, seed } = opts;
  if (voice) throw new Error("qwenaudio 不支持音色 ID（voice），请用参考音频 reference");
  const input = {
    text_prompt: buildPrompt(opts),
    format: "wav",
    sample_rate: SAMPLE_RATE,
    channels: 1,
    rate: Number(speed ?? 1),
    ...(seed !== undefined ? { seed: Number(seed) } : {}),
  };
  if (reference) {
    const file = resolve(root, reference);
    if (!existsSync(file)) throw new Error(`qwenaudio 找不到参考音频：${file}`);
    const mime = MIME[extname(file).toLowerCase()] ?? "audio/wav";
    input.references = [{ audio_data: `data:${mime};base64,${readFileSync(file).toString("base64")}` }];
  }
  return { model: MODEL, input };
}

/** 要念的原文：导演稿取引号里的台词（语气词已在里面），逐帧就是 text */
export const spokenText = (opts) => (opts.direction ? quotedText(opts.direction) : opts.text);

async function post(url, body, headers = {}) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`, ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    if (res.status === 429 && attempt < ATTEMPTS) {
      console.log(`     请求太频繁，${attempt * 5} 秒后重试`);
      await sleep(attempt * 5000);
      continue;
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`HTTP ${res.status} ${text.slice(0, 300)}`);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} ${data.code ?? ""} ${data.message ?? ""}（request_id ${data.request_id ?? ""}）`);
    return data;
  }
}

/** 录音文件识别（异步任务）：音频 URL → [{ text, start, end }]（秒） */
async function transcribe(url) {
  const sub = await post(ASR, { model: ASR_MODEL, input: { file_urls: [url] }, parameters: { language_hints: ["zh", "en"] } }, { "X-DashScope-Async": "enable" });
  const id = sub.output?.task_id;
  if (!id) throw new Error(`识别任务没有创建成功：${JSON.stringify(sub).slice(0, 300)}`);
  const deadline = Date.now() + ASR_TIMEOUT_MS;
  for (;;) {
    await sleep(1000);
    const res = await fetch(`${TASKS}/${id}`, { headers: { Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}` } });
    const task = await res.json();
    const status = task.output?.task_status;
    if (status === "SUCCEEDED") {
      const result = task.output.results?.[0];
      if (!result?.transcription_url) throw new Error(`识别失败：${JSON.stringify(result).slice(0, 300)}`);
      const transcript = await (await fetch(result.transcription_url)).json();
      return (transcript.transcripts?.[0]?.sentences ?? []).flatMap((s) =>
        (s.words ?? []).map((w) => ({ text: w.text, start: w.begin_time / 1000, end: w.end_time / 1000 })),
      );
    }
    if (status === "FAILED") throw new Error(`识别失败：${task.output?.message ?? JSON.stringify(task.output).slice(0, 300)}`);
    if (Date.now() > deadline) throw new Error(`识别超时（任务 ${id}）`);
  }
}

export async function synthesize(opts) {
  const { outFile } = opts;
  if (!process.env.DASHSCOPE_API_KEY) {
    throw new Error("qwenaudio 需要 DASHSCOPE_API_KEY：在阿里云百炼 / 千问平台创建 API Key，写进项目根目录 .env");
  }
  const text = spokenText(opts);
  try {
    const gen = await post(GENERATE, buildBody(opts));
    const url = gen.output?.audio?.url;
    if (!url) throw new Error(`没有返回音频：${JSON.stringify(gen).slice(0, 300)}`);
    const audio = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!audio.ok) throw new Error(`下载音频失败：HTTP ${audio.status}`);
    writeFileSync(outFile, Buffer.from(await audio.arrayBuffer()));
    const heard = await transcribe(url);
    if (!heard.length) throw new Error("识别结果是空的，音频可能没有人声");
    writeFileSync(outFile.replace(/\.wav$/, ".words.json"), JSON.stringify(alignToText(heard, text)));
  } catch (err) {
    throw new Error(`qwenaudio 生成失败：「${text}」：${err.message}`);
  }
}
