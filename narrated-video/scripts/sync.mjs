#!/usr/bin/env node
// 用法：nv sync <视频目录>
// 把 timeline.json 的时间写进 index.html：
//   - data-lines="N" / "N-M" 的场景 → data-start / data-duration
//   - #root、#voice → 总时长
//   - <!-- captions:start --> 与 <!-- captions:end --> 之间 → 重新生成字幕
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CAPTIONS_RE = /(<!-- captions:start -->)[\s\S]*?(\n\s*<!-- captions:end -->)/;
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
  return `      <div id="cap-${line.n}" class="clip caption${long ? " caption-long" : ""}" data-line="${line.n}" data-start="${fmt(line.start)}" data-duration="${fmt(end - line.start)}">${text}</div>`;
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
  const result = withTotals.replace(CAPTIONS_RE, `$1\n${captions.join("\n")}$2`);

  writeFileSync(htmlPath, result);
  console.log(`已同步 ${htmlPath}：${timeline.lines.length} 条字幕，总时长 ${timeline.duration} 秒`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) {
    console.error("用法：nv sync <视频目录>");
    process.exit(1);
  }
  syncEpisode(resolve(dir));
}
