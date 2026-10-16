#!/usr/bin/env node
// 用法：
//   ic render  <卡片.md> [--preset xiaohongshu] [--out 目录]   截图成 PNG（默认输出到 <卡片.md 所在目录>/out/）
//   ic preview <卡片.md> [--preset xiaohongshu]                只生成 卡片预览.html，浏览器里看
//
// 卡片.md 格式：可选 frontmatter（preset / footer / theme），卡片之间用单独一行 --- 分隔，
// 版式用 <!-- layout: cover|content|list2|quote|end|image --> 指定；不指定时，以 # 一级标题开头的卡片为 cover，其余为 content。
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import MarkdownIt from "markdown-it";
import puppeteer from "puppeteer-core";
import YAML from "yaml";
import { findChrome } from "./lib/shared/chrome.mjs";

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_NAME = "image-cards.config.json";
const DEFAULTS = { preset: "xiaohongshu", theme: null, footer: "" };
const LAYOUTS = ["cover", "content", "list2", "quote", "end", "image"];
const LAYOUT_RE = /<!--\s*layout:\s*([a-z0-9-]+)\s*-->/;
const OUTPUT_RE = /^\d{2}\.png$/;

function findUp(start, name) {
  for (let dir = resolve(start); ; dir = dirname(dir)) {
    if (existsSync(join(dir, name))) return join(dir, name);
    if (dirname(dir) === dir) return null;
  }
}

function loadConfig(start) {
  const path = findUp(start, CONFIG_NAME);
  if (!path) return { ...DEFAULTS, root: resolve(start) };
  return { ...DEFAULTS, ...JSON.parse(readFileSync(path, "utf8")), root: dirname(path) };
}

function loadPreset(name) {
  const file = join(SKILL_DIR, "presets", `${name}.json`);
  if (!existsSync(file)) throw new Error(`未知的预设：${name}（见 ${join(SKILL_DIR, "presets")}）`);
  return { footer: true, ...JSON.parse(readFileSync(file, "utf8")) };
}

function parseArgs(argv) {
  const [cmd, file, ...rest] = argv;
  if (!["render", "preview"].includes(cmd) || !file) {
    throw new Error("用法：ic render|preview <卡片.md> [--preset 名称] [--out 目录]");
  }
  const opts = { cmd, file: resolve(file), preset: null, out: null };
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i].replace(/^--/, "");
    if (!["preset", "out"].includes(key) || rest[i + 1] === undefined) throw new Error(`参数错误：${rest[i]}`);
    opts[key] = rest[i + 1];
  }
  return opts;
}

/** 拆出 frontmatter 和卡片 */
function parseCardsFile(file) {
  const raw = readFileSync(file, "utf8");
  const fm = raw.match(/^---\n([\s\S]*?)\n---\n/);
  const meta = fm ? YAML.parse(fm[1]) ?? {} : {};
  const body = fm ? raw.slice(fm[0].length) : raw;
  const cards = body
    .split(/^---\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((src) => {
      const explicit = src.match(LAYOUT_RE)?.[1];
      if (explicit && !LAYOUTS.includes(explicit)) throw new Error(`未知版式：${explicit}（可选：${LAYOUTS.join("、")}）`);
      const layout = explicit ?? (/^(<!--.*-->\s*)*# /.test(src) ? "cover" : "content");
      return { layout, src: src.replace(LAYOUT_RE, "").trim() };
    });
  if (cards.length === 0) throw new Error(`${file} 里没有卡片`);
  return { meta, cards };
}

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function buildHtml({ cards, preset, themeCss, footer, baseDir }) {
  const md = new MarkdownIt({ html: true, linkify: true, breaks: true });
  const [pt, pr, pb, pl] = preset.padding;
  const vars = `--card-w:${preset.width}px;--card-h:${preset.height}px;--font-size:${preset.fontSize}px;` +
    `--pad-top:${pt}px;--pad-right:${pr}px;--pad-bottom:${pb}px;--pad-left:${pl}px;`;
  const sections = cards.map((c, i) => {
    const foot = preset.footer
      ? `<footer class="card-footer"><span>${escapeHtml(footer)}</span><span class="page">${i + 1} / ${cards.length}</span></footer>`
      : "";
    return `<section class="card layout-${c.layout}" data-index="${i + 1}"><div class="card-body">${md.render(c.src)}</div>${foot}</section>`;
  });
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8" />
<base href="${pathToFileURL(baseDir).href}/" />
<style>${readFileSync(join(SKILL_DIR, "layouts", "cards.css"), "utf8")}</style>
<style>${themeCss}</style>
<style>:root{${vars}}</style>
</head><body><div class="gallery">
${sections.join("\n")}
</div></body></html>`;
}

async function capture(htmlPath, outDir, preset) {
  const browser = await puppeteer.launch({ executablePath: findChrome(), args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: preset.width + 48, height: preset.height + 48, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
    await page.addStyleTag({ content: ".gallery{zoom:1}" });
    await page.evaluate(() => document.fonts.ready);

    const overflow = await page.$$eval(".card-body", (els) =>
      els.map((el, i) => (el.scrollHeight > el.clientHeight + 1 ? i + 1 : 0)).filter(Boolean),
    );

    mkdirSync(outDir, { recursive: true });
    for (const f of readdirSync(outDir).filter((f) => OUTPUT_RE.test(f))) rmSync(join(outDir, f));
    const cards = await page.$$(".card");
    for (const [i, card] of cards.entries()) {
      await card.screenshot({ path: join(outDir, `${String(i + 1).padStart(2, "0")}.png`) });
    }
    return { count: cards.length, overflow };
  } finally {
    await browser.close();
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!existsSync(opts.file)) throw new Error(`文件不存在：${opts.file}`);
  const baseDir = dirname(opts.file);
  const config = loadConfig(baseDir);
  const { meta, cards } = parseCardsFile(opts.file);

  const presetName = opts.preset ?? meta.preset ?? config.preset;
  const preset = loadPreset(presetName);
  const themePath = meta.theme ? resolve(baseDir, meta.theme)
    : config.theme ? resolve(config.root, config.theme)
    : join(SKILL_DIR, "themes", "default.css");
  if (!existsSync(themePath)) throw new Error(`主题文件不存在：${themePath}`);

  const html = buildHtml({
    cards, preset, baseDir,
    themeCss: readFileSync(themePath, "utf8"),
    footer: meta.footer ?? config.footer,
  });
  const htmlPath = join(baseDir, "卡片预览.html");
  writeFileSync(htmlPath, html);
  if (opts.cmd === "preview") {
    console.log(htmlPath);
    return;
  }

  const outDir = opts.out ? resolve(opts.out) : join(baseDir, "out");
  const { count, overflow } = await capture(htmlPath, outDir, preset);
  console.log(`已输出 ${count} 张（${presetName} ${preset.width}×${preset.height}）→ ${outDir}`);
  if (overflow.length) {
    console.warn(`⚠ 第 ${overflow.join("、")} 张内容超出卡片，请删减文字或拆成两张`);
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
