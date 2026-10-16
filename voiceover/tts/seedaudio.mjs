// 火山引擎豆包音频生成模型 Seed-Audio 1.0（音频创作）：用一段自然语言描述「谁、用什么语气说」，生成接近真人的口播。
// 接口文档：https://docs.volcengine.com/docs/DoubaoVoice/audio-generation-http（非流式 HTTP）
// 两种用法：
//   - 导演稿（推荐）：工程里有 VOICE.md 时，vo 按段把表演提示（direction）交给它，整段一次生成，
//     说话前后连贯；写法见 references/voice-direction.md
//   - 逐帧：没有 VOICE.md 时一帧一次，提示只有人设 + 台词
// 配置（tts 字段）：
//   provider  = "seedaudio"
//   style     = 人设和场景（每期一样的部分），如「女性（28岁左右，嗓音温暖清亮），正在给抖音录口播……」；
//               括号里会自动补上「饰演者为@音频1」，把音色绑到 voice / reference
//   voice     = 音色 ID（可选），豆包语音合成 2.0 音色或声音复刻音色，如 zh_male_liufei_uranus_bigtts
//   reference = 参考音频路径（可选，相对项目根目录；≤30 秒、≤10MB，wav/mp3），音色和说话方式会向它靠拢
//               voice 和 reference 二选一；都不写就完全按 style 生成音色
//   speed     = 倍速（1 为原速）
// 逐字时间戳：开 enable_subtitle，写到 <音频名>.words.json（单位秒）。
// 模型会「演」，偶尔改字或加语气词；字幕按它实际说的字生成，重点词对不上时会报错，改提示或重配这一句。
// 密钥：和 volcengine 共用 VOLC_TTS_API_KEY。
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { analyzePcm, fixWords, speechRate } from "./volcengine.mjs";

const ENDPOINT = "https://openspeech.bytedance.com/api/v3/tts/create";
const MODEL = "seed-audio-1.0";
const SAMPLE_RATE = 24000;
const TIMEOUT_MS = 300_000;

/** 每句同时输出逐字时间戳 */
export const wordTimestamps = true;

/** 支持导演稿（VOICE.md）整段生成 */
export const direction = true;

const ATTEMPTS = 5; // 并发超限（429）时等一会儿再试
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TAIL = "只说引号里的话，一字不改，不加背景音乐和音效。";

/** 人设：有参考音色时，把「饰演者为@音频1」放进第一个括号（官方示例的写法），没有括号就补一个 */
export function persona({ style, voice, reference }, tag = "@音频1") {
  const actor = voice || reference ? `饰演者为${tag}` : "";
  const base = (style || "").trim().replace(/[。，,.\s]+$/, "");
  if (!actor) return base || "说话人";
  if (/（[^）]*）/.test(base)) return base.replace(/）/, `，${actor}）`);
  return base ? `说话人（${actor}），${base}` : `说话人（${actor}）`;
}

/** 有导演稿：人设 + 表演提示（台词在引号里）+ 约束；没有：人设说道：“台词” + 约束 */
export function buildPrompt(opts) {
  if (opts.direction) return `${persona(opts)}。\n${opts.direction.trim()}\n${TAIL}`;
  return `${persona(opts)}，说道：“${opts.text}”${TAIL}`;
}

export function buildBody(opts, root = process.cwd()) {
  const { voice, reference, speed } = opts;
  if (voice && reference) throw new Error("seedaudio 的 voice 和 reference 只能写一个");
  let references;
  if (voice) references = [{ speaker: voice }];
  if (reference) {
    const file = resolve(root, reference);
    if (!existsSync(file)) throw new Error(`seedaudio 找不到参考音频：${file}`);
    references = [{ audio_data: readFileSync(file).toString("base64") }];
  }
  return {
    model: MODEL,
    text_prompt: buildPrompt(opts),
    ...(references ? { references } : {}),
    audio_config: { format: "wav", sample_rate: SAMPLE_RATE, speech_rate: speechRate(speed), enable_subtitle: true },
  };
}

/** subtitle.sentences[].words（毫秒）→ [{ text, start, end }]（秒） */
export function toWords(subtitle) {
  return (subtitle?.sentences ?? []).flatMap((s) =>
    (s.words ?? []).map((w) => ({ text: String(w.text).trim(), start: w.start_time / 1000, end: w.end_time / 1000 })),
  ).filter((w) => w.text);
}

async function request(body) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": process.env.VOLC_TTS_API_KEY,
        "X-Api-Request-Id": randomUUID(),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const logId = res.headers.get("x-tt-logid") || "";
    const text = await res.text();
    if (res.status === 429 && attempt < ATTEMPTS) {
      console.log(`     并发超限，${attempt * 5} 秒后重试`);
      await sleep(attempt * 5000);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} ${text}（logid ${logId}）`);
    const data = JSON.parse(text);
    if (!data.audio) throw new Error(`没有返回音频：${data.code ?? ""} ${data.message ?? ""}（logid ${logId}）`);
    return data;
  }
}

export async function synthesize(opts) {
  const { text, outFile } = opts;
  if (!process.env.VOLC_TTS_API_KEY) {
    throw new Error("seedaudio 需要 VOLC_TTS_API_KEY：在火山引擎豆包语音控制台创建 API Key，写进项目根目录 .env");
  }
  let data;
  try {
    data = await request(buildBody(opts));
  } catch (err) {
    throw new Error(`seedaudio 生成失败：「${text}」：${err.message}`);
  }
  // 返回的是双声道 WAV，统一转成 24k 单声道
  const pcm = execFileSync("ffmpeg", ["-v", "error", "-i", "pipe:0", "-ac", "1", "-ar", String(SAMPLE_RATE), "-f", "s16le", "pipe:1"], {
    input: Buffer.from(data.audio, "base64"),
    maxBuffer: 64 * 1024 * 1024,
  });
  execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "s16le", "-ar", String(SAMPLE_RATE), "-ac", "1", "-i", "pipe:0", outFile], { input: pcm });
  // 句尾的字时间戳也会被压扁（实测「个？」只给 40ms，声音还要再响 0.2 秒），按真实声音校正，免得裁剪切掉尾音
  const words = fixWords(toWords(data.subtitle), analyzePcm(pcm, SAMPLE_RATE));
  writeFileSync(outFile.replace(/\.wav$/, ".words.json"), JSON.stringify(words));
}
