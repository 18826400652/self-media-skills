#!/usr/bin/env node
// 用法：vo <工程目录> [--voice <音色>] [--speed <倍速>] [--provider <服务商>] [--model <模型>] [--pause <秒>] [--check]
//
// 按工程里的 SCRIPT.md（+ 可选的配音导演稿 VOICE.md）配音，写出（格式见 README「文件接口」）：
//   assets/voice/NN.wav    每帧一段配音（首尾静音已切）
//   audio_meta.json        每帧的词和字时间（帧内秒数），重点词以 * 开头；原有的 sfx 保留
//   caption_groups.json    字幕分组（全片秒数），vd 的字幕组件读它
// SCRIPT.md：`## … (Frame N)` 开一句，缩进块是口播原文；可选 `**Emotion:** 惊讶`、`**重点词:** 八秒钟、一下午`。
// VOICE.md 存在且服务商支持（seedaudio、qwenaudio）时，按段整段生成再切回每帧；--pause 只加在段与段之间。
// --check：只检查 VOICE.md 和 SCRIPT.md 对不对得上，不生成、不花钱。
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildCaptionGroups } from "./lib/caption-groups.mjs";
import { configGate, loadConfig } from "./lib/config.mjs";
import { isMain } from "./lib/is-main.mjs";
import { loadDotEnv, probeDuration, synthesizeClean, synthesizeSegment } from "./lib/speech.mjs";
import { adoptLegacyCache, voiceCacheDir } from "./lib/voice-cache.mjs";
import { checkDirection, parseVoiceDirection } from "./lib/voice-direction.mjs";
import { getProvider } from "../tts/index.mjs";

const USAGE = "用法：vo <工程目录> [--voice x] [--speed 1.1] [--provider x] [--model x] [--pause 0.4] [--check]";
const OPTION_KEYS = ["voice", "speed", "provider", "model", "pause"];
const PUNCTUATION = /^[\p{P}\p{S}\s]+$/u;
const TAIL_SECONDS = 0.8; // 最后一帧结尾留白：口播说完后画面停一下再结束
const pad2 = (n) => String(n).padStart(2, "0");

function parseArgs(argv) {
  let [dir, ...rest] = argv;
  if (dir === "--help" || dir === "-h") {
    console.log(USAGE);
    process.exit(0);
  }
  if (!dir || dir.startsWith("--")) {
    console.error(USAGE);
    process.exit(1);
  }
  const overrides = {};
  const check = rest.includes("--check");
  rest = rest.filter((a) => a !== "--check");
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i].replace(/^--/, "");
    if (!OPTION_KEYS.includes(key) || rest[i + 1] === undefined) {
      throw new Error(`参数错误：${rest[i]}（可用：${OPTION_KEYS.map((k) => `--${k}`).join(" ")}）`);
    }
    overrides[key] = rest[i + 1];
  }
  return { dir: resolve(dir), overrides, check };
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
const CLAUSE_BREAK = /[，。！？、；：,.!?;:…]/; // 断句的标点；引号、括号、空格等不断句
const KEYWORD_MARK = "*"; // 字幕「词」以 * 开头 = 重点词（项目字幕皮肤据此高亮，显示时去掉）

/** 逐字时间戳 → 按分句切开（遇标点断句） */
function toClauses(words) {
  const clauses = [];
  let cur = [];
  // TTS 的时间戳有时把标点和相邻的字并成一个（如「？AI」），所以按单个字符判断是否断句
  for (const w of words) {
    for (const ch of w.text) {
      if (CLAUSE_BREAK.test(ch)) {
        if (cur.length) clauses.push({ chars: cur, punct: ASCII_PUNCT[ch] ?? ch });
        cur = [];
      } else {
        cur.push({ text: ch, start: w.start, end: w.end });
      }
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

/** 读 VOICE.md 并检查；没有文件或服务商不支持导演稿时返回 null */
function loadDirection(dir, lines, tts) {
  const file = join(dir, "VOICE.md");
  if (!existsSync(file)) return null;
  if (!getProvider(tts.provider).direction) {
    console.log(`⚠ 有 VOICE.md，但 ${tts.provider} 不支持导演稿，按逐帧配音`);
    return null;
  }
  const segments = parseVoiceDirection(readFileSync(file, "utf8"));
  if (!segments.length) throw new Error(`${file} 里没有段落（需要 "## 段名 (Frame 1-4)" 标题 + \`\`\`text 代码块）`);
  const problems = checkDirection(segments, lines);
  if (problems.length) throw new Error(`VOICE.md 和 SCRIPT.md 对不上：\n  - ${problems.join("\n  - ")}`);
  return segments;
}

/** 逐帧或按段生成，统一返回 [{ line, clip, segmentEnd }] */
async function synthesizeAll(lines, segments, tts, cacheDir) {
  if (!segments) {
    const out = [];
    for (const line of lines) {
      const lineTts = line.emotion ? { ...tts, emotion: line.emotion } : tts;
      out.push({ line, clip: await synthesizeClean(line, lineTts, cacheDir, pad2(line.frame)), segmentEnd: true });
    }
    return out;
  }
  const byFrame = new Map(lines.map((l) => [l.frame, l]));
  const out = [];
  for (const seg of [...segments].sort((a, b) => a.frames[0] - b.frames[0])) {
    const segLines = seg.frames.map((f) => byFrame.get(f));
    const clips = await synthesizeSegment(seg, segLines, tts, cacheDir);
    clips.forEach((clip, i) => out.push({ line: segLines[i], clip, segmentEnd: i === clips.length - 1 }));
  }
  return out;
}

const writeJson = (dir, file, data) => writeFileSync(join(dir, file), `${JSON.stringify(data, null, 2)}\n`);

/** 写 audio_meta.json（保留原有 sfx）和 caption_groups.json */
export function writeOutputs(dir, voices) {
  const file = join(dir, "audio_meta.json");
  const sfx = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")).sfx ?? [] : [];
  const meta = { bgm: null, bgm_pending: false, voices, sfx };
  writeJson(dir, "audio_meta.json", meta);
  const captions = buildCaptionGroups(meta);
  writeJson(dir, "caption_groups.json", captions);
  return { total: captions.total_duration_s, groups: captions.groups.length };
}

async function main() {
  const { dir, overrides, check } = parseArgs(process.argv.slice(2));
  const scriptPath = join(dir, "SCRIPT.md");
  if (!existsSync(scriptPath)) throw new Error(`找不到 ${scriptPath}`);
  const config = loadConfig(dir);
  const gate = configGate(config, dir);
  if (gate.refuse && !check) throw new Error(gate.refuse);
  if (gate.warn && !check) console.warn(gate.warn);
  loadDotEnv(config.root);
  // 停顿不参与合成，也不影响配音缓存
  const { pause: pauseRaw = 0, ...tts } = { ...config.tts, ...overrides };
  const pause = Number(pauseRaw);
  if (!(pause >= 0)) throw new Error(`--pause 要写秒数（如 0.4），现在是 ${pauseRaw}`);
  const lines = parseHfScript(readFileSync(scriptPath, "utf8"));
  if (!lines.length) throw new Error(`${scriptPath} 里没有口播（需要 "## … (Frame N)" 标题 + 缩进的口播原文）`);
  const segments = loadDirection(dir, lines, tts);
  if (check) {
    console.log(segments ? `✓ VOICE.md 没问题：${segments.length} 段，覆盖 ${lines.length} 帧` : "没有可用的 VOICE.md，会逐帧配音");
    return;
  }

  const cacheDir = voiceCacheDir(dir, config);
  adoptLegacyCache(join(dir, ".media", "voice-cache"), cacheDir);
  const voiceDir = join(dir, "assets", "voice");
  mkdirSync(cacheDir, { recursive: true });
  mkdirSync(voiceDir, { recursive: true });
  const mode = segments ? `导演稿 ${segments.length} 段` : `逐帧`;
  console.log(`读取 ${scriptPath}（${tts.provider} · ${tts.voice ?? tts.reference ?? ""} · ${tts.speed}x · ${mode} · 停顿 ${pause}s）`);

  const results = await synthesizeAll(lines, segments, tts, cacheDir);
  const voices = [];
  for (const [i, { line, clip, segmentEnd }] of results.entries()) {
    clip.words = restoreCase(clip.words, line.text);
    if (!clip.words.length) throw new Error(`第 ${line.frame} 帧没有逐字时间戳（${tts.provider} 不提供），字幕无法对齐`);
    const rel = `assets/voice/${pad2(line.frame)}.wav`;
    const isLast = i === results.length - 1;
    const padding = isLast ? TAIL_SECONDS : segmentEnd ? pause : 0;
    if (padding > 0) {
      execFileSync("ffmpeg", ["-y", "-v", "error", "-i", clip.file, "-af", `apad=pad_dur=${padding}`, join(dir, rel)]);
    } else {
      copyFileSync(clip.file, join(dir, rel));
    }
    voices.push({
      frame: line.frame,
      path: rel,
      duration_s: padding > 0 ? Math.round(probeDuration(join(dir, rel)) * 1000) / 1000 : clip.speechDuration,
      words: withIds(toCaptionWords(clip.words, line.keywords)),
      chars: clip.words, // 逐字时间（vd 按 @词 算时间时用）
    });
  }

  const { total, groups } = writeOutputs(dir, voices);
  console.log(`✓ 配音完成：${voices.length} 帧，共 ${total} 秒 → audio_meta.json、caption_groups.json（${groups} 组字幕）`);
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  });
}
