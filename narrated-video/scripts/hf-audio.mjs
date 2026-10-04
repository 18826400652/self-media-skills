#!/usr/bin/env node
// 用法：nv hf-audio <HyperFrames 工程目录> [--voice <音色>] [--speed <倍速>] [--provider <服务商>] [--model <模型>]
//
// 给 HyperFrames 官方工作流（/faceless-explainer 等）配音：用本模块的 TTS（默认读项目配置，如 CosyVoice）
// 代替它自带的 HeyGen / Kokoro，产出与它的音频引擎完全相同的文件，后续 sync-durations、fetch-sfx、
// captions、assemble-index 照常运行：
//   assets/voice/NN.wav        每帧一段配音（首尾静音已切）
//   audio_engine_meta.json     引擎的中性格式（fetch-sfx 会在它上面合并音效）
//   audio_meta.json            按帧组织的格式（captions / assemble-index 读取）
// 已有的音效（nv hf-sfx 写入的 sfx 段）会保留，重新配音后不用重放音效。
// 字幕的「词」按中文习惯生成：一个分句一屏；`**重点词:** 八秒钟、一下午` 里的词单独成段并以 * 标记，
// 由项目的字幕皮肤高亮（见 references/hyperframes.md）。
//
// 读取工程里的 SCRIPT.md：`## … (Frame N)` 开一句，缩进块是口播原文；
// 可选 `**Emotion:** 惊讶`（平静 开心 惊讶 难过 生气 害怕 厌恶）逐句指定情感；
// 可选 `**重点词:** 八秒钟、一下午` 指定字幕里要高亮的词。
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadConfig } from "./lib/config.mjs";
import { writeCues } from "./lib/cues.mjs";
import { isMain } from "./lib/is-main.mjs";
import { loadDotEnv, probeDuration, synthesizeClean } from "./lib/speech.mjs";

const OPTION_KEYS = ["voice", "speed", "provider", "model"];
const PUNCTUATION = /^[\p{P}\p{S}\s]+$/u;
const TAIL_SECONDS = 0.8; // 最后一帧结尾留白：口播说完后画面停一下再结束
const pad2 = (n) => String(n).padStart(2, "0");

function parseArgs(argv) {
  const [dir, ...rest] = argv;
  if (!dir) {
    console.error("用法：nv hf-audio <HyperFrames 工程目录> [--voice x] [--speed 1.1] [--provider x] [--model x]");
    process.exit(1);
  }
  const overrides = {};
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i].replace(/^--/, "");
    if (!OPTION_KEYS.includes(key) || rest[i + 1] === undefined) {
      throw new Error(`参数错误：${rest[i]}（可用：${OPTION_KEYS.map((k) => `--${k}`).join(" ")}）`);
    }
    overrides[key] = rest[i + 1];
  }
  return { dir: resolve(dir), overrides };
}

/** SCRIPT.md → [{ frame, text, emotion }]，规则与 HyperFrames 的 audio.mjs 相同，另读 **Emotion:** */
export function parseHfScript(md) {
  const out = [];
  let cur = null;
  const flush = () => {
    if (cur && cur.text.trim()) out.push({ ...cur, text: cur.text.trim() });
    cur = null;
  };
  for (const line of md.split(/\r?\n/)) {
    const h = line.match(/^#{2,3}\s+.*?\(frame\s+(\d+)\)/i);
    if (h) {
      flush();
      cur = { frame: Number(h[1]), text: "", emotion: "", keywords: [] };
      continue;
    }
    if (!cur) continue;
    const emotion = line.match(/^\s*\*\*(?:Emotion|情感)[:：]\*\*\s*(\S+)/i);
    if (emotion) cur.emotion = emotion[1];
    const keywords = line.match(/^\s*\*\*(?:Highlight|重点词)[:：]\*\*\s*(.+)$/i);
    if (keywords) cur.keywords = keywords[1].split(/[、,，\s]+/).filter(Boolean);
    if (/^\s*\*\*/.test(line)) continue;
    const m = line.match(/^(?: {4,}|\t)(.+)$/);
    if (m) cur.text += m[1].trim();
  }
  flush();
  return out;
}

// 中文标点 → 英文标点：HyperFrames 的字幕分组只认英文标点为「句末」，一个分句就成为一屏字幕
const ASCII_PUNCT = { "，": ",", "、": ",", "。": ".", "！": "!", "？": "?", "：": ":", "；": ";", "…": "." };
const KEYWORD_MARK = "*"; // 字幕「词」以 * 开头 = 重点词（项目字幕皮肤据此高亮，显示时去掉）

/** 逐字时间戳 → 按分句切开（遇标点断句） */
function toClauses(words) {
  const clauses = [];
  let cur = [];
  for (const w of words) {
    if (PUNCTUATION.test(w.text)) {
      if (cur.length) clauses.push({ chars: cur, punct: ASCII_PUNCT[w.text] ?? w.text });
      cur = [];
    } else {
      cur.push(...[...w.text].map((ch) => ({ text: ch, start: w.start, end: w.end })));
    }
  }
  if (cur.length) clauses.push({ chars: cur, punct: "" });
  return clauses;
}

/** 一个分句 → 在重点词边界处切段：[普通, *重点词, 普通…]；没有重点词就整句一段 */
function splitClause(chars, keywords) {
  const text = chars.map((c) => c.text).join("");
  const marks = new Array(chars.length).fill(false);
  for (const kw of keywords) {
    for (let i = text.indexOf(kw); i >= 0; i = text.indexOf(kw, i + kw.length)) {
      const from = [...text.slice(0, i)].length;
      for (let j = from; j < from + [...kw].length; j++) marks[j] = true;
    }
  }
  const chunks = [];
  chars.forEach((c, i) => {
    const last = chunks[chunks.length - 1];
    if (last && last.key === marks[i]) last.chars.push(c);
    else chunks.push({ key: marks[i], chars: [c] });
  });
  return chunks;
}

/** 字幕用的「词」：一个分句一屏，重点词单独成段；带真实起止时间，分句最后一段带英文标点 */
export function toCaptionWords(words, keywords) {
  return toClauses(words).flatMap(({ chars, punct }) => {
    const chunks = splitClause(chars, keywords);
    return chunks.map((chunk, i) => ({
      text: (chunk.key ? KEYWORD_MARK : "") + chunk.chars.map((c) => c.text).join("") + (i === chunks.length - 1 ? punct : ""),
      start: chunk.chars[0].start,
      end: chunk.chars[chunk.chars.length - 1].end,
    }));
  });
}

/** 逐字时间里的英文可能被 TTS 改成小写（deepseek），按口播原文恢复写法（DeepSeek） */
export function restoreCase(words, text) {
  const lower = text.toLowerCase();
  let pos = 0;
  return words.map((w) => {
    const i = lower.indexOf(w.text.toLowerCase(), pos);
    if (i < 0) return w;
    pos = i + w.text.length;
    return { ...w, text: text.slice(i, pos) };
  });
}

const withIds = (words) => words.map((w, i) => ({ id: `w${i}`, text: w.text, start: w.start, end: w.end }));

async function main() {
  const { dir, overrides } = parseArgs(process.argv.slice(2));
  const scriptPath = join(dir, "SCRIPT.md");
  if (!existsSync(scriptPath)) throw new Error(`找不到 ${scriptPath}`);
  const config = loadConfig(dir);
  loadDotEnv(config.root);
  const tts = { ...config.tts, ...overrides };
  const lines = parseHfScript(readFileSync(scriptPath, "utf8"));
  if (!lines.length) throw new Error(`${scriptPath} 里没有口播（需要 "## … (Frame N)" 标题 + 缩进的口播原文）`);

  const cacheDir = join(dir, ".media", "voice-cache");
  const voiceDir = join(dir, "assets", "voice");
  mkdirSync(cacheDir, { recursive: true });
  mkdirSync(voiceDir, { recursive: true });
  console.log(`读取 ${scriptPath}（${tts.provider} · ${tts.voice} · ${tts.speed}x）`);

  const voices = [];
  for (const line of lines) {
    const lineTts = line.emotion ? { ...tts, emotion: line.emotion } : tts;
    const clip = await synthesizeClean(line, lineTts, cacheDir, pad2(line.frame));
    clip.words = restoreCase(clip.words, line.text);
    if (!clip.words.length) throw new Error(`第 ${line.frame} 帧没有逐字时间戳（${tts.provider} 不提供），字幕无法对齐`);
    const rel = `assets/voice/${pad2(line.frame)}.wav`;
    const isLast = line === lines[lines.length - 1];
    if (isLast) {
      execFileSync("ffmpeg", ["-y", "-v", "error", "-i", clip.file, "-af", `apad=pad_dur=${TAIL_SECONDS}`, join(dir, rel)]);
    } else {
      copyFileSync(clip.file, join(dir, rel));
    }
    voices.push({
      id: pad2(line.frame),
      frame: line.frame,
      path: rel,
      duration_s: isLast ? Math.round(probeDuration(join(dir, rel)) * 1000) / 1000 : clip.speechDuration,
      words: withIds(toCaptionWords(clip.words, line.keywords)),
      chars: clip.words, // 逐字时间（nv hf-sfx 按关键词放音效时用）
    });
  }

  const previous = (file) => (existsSync(join(dir, file)) ? JSON.parse(readFileSync(join(dir, file), "utf8")) : {});
  const total = Math.round(voices.reduce((a, v) => a + v.duration_s, 0) * 1000) / 1000;
  const neutral = {
    tts_provider: tts.provider,
    voice_id: tts.voice,
    bgm: null,
    bgm_pending: false,
    voices: voices.map(({ frame, ...v }) => v),
    sfx: previous("audio_engine_meta.json").sfx ?? [],
    total_duration_s: total,
  };
  const frameKeyed = {
    bgm: null,
    bgm_pending: false,
    voices: voices.map(({ id, ...v }) => v),
    sfx: previous("audio_meta.json").sfx ?? [],
  };
  writeFileSync(join(dir, "audio_engine_meta.json"), `${JSON.stringify(neutral, null, 2)}\n`);
  writeFileSync(join(dir, "audio_meta.json"), `${JSON.stringify(frameKeyed, null, 2)}\n`);
  console.log(`✓ 配音完成：${voices.length} 帧，共 ${total} 秒 → audio_meta.json`);
  if (existsSync(join(dir, "compositions"))) console.log(`✓ 逐字时间 → compositions/kit/cues.js（${writeCues(dir)} 帧）`);
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  });
}
