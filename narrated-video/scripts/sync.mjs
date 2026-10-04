#!/usr/bin/env node
// 用法：nv sync <视频目录>
// 把 timeline.json 的时间写进 index.html：
//   - data-lines="N" / "N-M" 的场景 → data-start / data-duration
//   - #root、#voice → 总时长
//   - <!-- captions:start --> 与 <!-- captions:end --> 之间 → 重新生成字幕
//   - <!-- sfx:start --> 与 <!-- sfx:end --> 之间 → 按 脚本.md「音效」列生成音效轨（音效文件复制到 sfx/）
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fromRoot, loadConfig } from "./lib/config.mjs";
import { findSfxFile, probe } from "./lib/sfx.mjs";

const CAPTIONS_RE = /(<!-- captions:start -->)[\s\S]*?(\n\s*<!-- captions:end -->)/;
const SFX_BLOCK_RE = /(<!-- sfx:start -->)[\s\S]*?(\n\s*<!-- sfx:end -->)/;
const DEFAULT_SFX_VOLUME = 0.35;
const SCENE_TAG_RE = /<[a-z]+\b[^>]*\sdata-lines="(\d+)(?:-(\d+))?"[^>]*>/g;

const fmt = (x) => String(Math.round(x * 1000) / 1000);

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

function setAttr(tag, name, value) {
  const re = new RegExp(`\\s${name}="[^"]*"`);
  return re.test(tag) ? tag.replace(re, ` ${name}="${value}"`) : tag.replace(/>$/, ` ${name}="${value}">`);
}

/** 第 n 句所在区间：从本句开始，到下一句开始（最后一句到视频结尾）。 */
function spanOf(timeline, first, last) {
  const idx = (n) => {
    const i = timeline.lines.findIndex((l) => l.n === n);
    if (i < 0) throw new Error(`index.html 引用了第 ${n} 句，但 脚本.md 里没有这一行`);
    return i;
  };
  const a = idx(first);
  const b = idx(last);
  const next = timeline.lines[b + 1];
  const end = next ? next.start : timeline.duration;
  return { start: timeline.lines[a].start, duration: end - timeline.lines[a].start };
}

const CAPTION_LINE_CHARS = 13; // 超过这个字数就会折成两行（竖屏 56px 字号约 14 字一行）
const CAPTION_FIT_CHARS = 14; // 折行后单行仍超过这个字数，字幕自动缩小（.caption-long）
const BREAK_AFTER = /[，、：；！？,:;!?]/;

/** 两行字幕在标点后换行（选让较长那行最短的位置），避免把一个词拆到两行；找不到标点就交给 CSS 平衡换行 */
function splitCaption(text) {
  if (text.length <= CAPTION_LINE_CHARS) return [text];
  const candidates = [...text]
    .map((ch, i) => (BREAK_AFTER.test(ch) && i < text.length - 2 ? i + 1 : -1))
    .filter((i) => i > 0);
  if (candidates.length === 0) return [text];
  const longest = (i) => Math.max(i, text.length - i);
  const cut = candidates.reduce((best, i) => (longest(i) < longest(best) ? i : best));
  return [text.slice(0, cut), text.slice(cut)];
}

function highlight(segment, words) {
  return words.reduce(
    (html, word) => html.split(escapeHtml(word)).join(`<mark>${escapeHtml(word)}</mark>`),
    escapeHtml(segment),
  );
}

function captionHtml(line, end) {
  const segments = splitCaption(line.text);
  const long = segments.some((seg) => [...seg].length > CAPTION_FIT_CHARS);
  const text = segments.map((seg) => highlight(seg, line.highlights)).join("<br />");
  // data-speech = 这句真正在说话的时长，components.js 用它估算关键词出现的时间（data-at="3@关键词"）
  return `      <div id="cap-${line.n}" class="clip caption${long ? " caption-long" : ""}" data-line="${line.n}" data-start="${fmt(line.start)}" data-duration="${fmt(end - line.start)}" data-speech="${fmt(line.end - line.start)}">${text}</div>`;
}

/** 关键词在这句里开始说的时间：有逐字时间戳就用真实时间，否则按字数比例估算（与 components.js 一致） */
export function wordTime(line, word) {
  const idx = line.text.indexOf(word);
  if (idx < 0) throw new Error(`第 ${line.n} 句里找不到关键词「${word}」`);
  const before = [...line.text.slice(0, idx)].length;
  if (line.words?.length) {
    let offset = 0;
    for (const w of line.words) {
      offset += [...w.text].length;
      if (offset > before) return w.start;
    }
  }
  return line.start + (before / [...line.text].length) * (line.end - line.start);
}

/** 脚本「音效」列 → <audio> 音效轨；音效文件复制进 <视频目录>/sfx/，让工程自包含 */
function sfxTracks(dir, timeline) {
  const config = loadConfig(dir);
  const dirs = [fromRoot(config, config.sfx?.dir)].filter(Boolean);
  const volume = Number(config.sfx?.volume ?? DEFAULT_SFX_VOLUME);
  const cues = timeline.lines.flatMap((line) =>
    (line.sfx || []).map((cue) => ({
      ...cue,
      at: (cue.word ? wordTime(line, cue.word) : line.start) + cue.offset,
    })),
  );
  if (cues.length) mkdirSync(join(dir, "sfx"), { recursive: true });
  return cues.map((cue, i) => {
    const src = findSfxFile(cue.name, dirs);
    const file = `sfx/${src.split("/").pop()}`;
    if (!existsSync(join(dir, file))) copyFileSync(src, join(dir, file));
    const end = Math.min(cue.at + probe(src), timeline.duration);
    return `      <audio id="sfx-${i + 1}" class="clip sfx" src="${file}" data-start="${fmt(cue.at)}" data-duration="${fmt(end - cue.at)}" data-volume="${volume}"></audio>`;
  });
}

export function syncEpisode(dir) {
  const timeline = JSON.parse(readFileSync(join(dir, "timeline.json"), "utf8"));
  const htmlPath = join(dir, "index.html");
  const original = readFileSync(htmlPath, "utf8");

  if (!CAPTIONS_RE.test(original)) {
    throw new Error(`${htmlPath}: 缺少 <!-- captions:start --> / <!-- captions:end --> 标记`);
  }

  const withScenes = original.replace(SCENE_TAG_RE, (tag, a, b) => {
    const { start, duration } = spanOf(timeline, Number(a), Number(b ?? a));
    return setAttr(setAttr(tag, "data-start", fmt(start)), "data-duration", fmt(duration));
  });

  const withTotals = withScenes.replace(/<(div|audio)\b[^>]*\sid="(root|voice)"[^>]*>/g, (tag) =>
    setAttr(tag, "data-duration", fmt(timeline.duration)),
  );

  const captions = timeline.lines.map((line, i) => {
    const next = timeline.lines[i + 1];
    return captionHtml(line, next ? next.start : line.end + 0.3);
  });
  const withCaptions = withTotals.replace(CAPTIONS_RE, `$1\n${captions.join("\n")}$2`);

  const tracks = sfxTracks(dir, timeline);
  if (tracks.length && !SFX_BLOCK_RE.test(withCaptions)) {
    throw new Error(`${htmlPath}: 脚本里写了音效，但缺少 <!-- sfx:start --> / <!-- sfx:end --> 标记`);
  }
  const result = withCaptions.replace(SFX_BLOCK_RE, `$1${tracks.length ? `\n${tracks.join("\n")}` : ""}$2`);

  writeFileSync(htmlPath, result);
  console.log(`已同步 ${htmlPath}：${timeline.lines.length} 条字幕，${tracks.length} 个音效，总时长 ${timeline.duration} 秒`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) {
    console.error("用法：nv sync <视频目录>");
    process.exit(1);
  }
  syncEpisode(resolve(dir));
}
