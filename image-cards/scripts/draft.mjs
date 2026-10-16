#!/usr/bin/env node
// ic draft <文案.md> [--images 目录]：把卡片图片 + 文案存进小红书草稿箱（用 browser-draft 的 bd 操作已登录的浏览器）。
// 小红书手机端发视频，用 vdraft <成片.mp4> --copy <文案.md> --to xiaohongshu。
// 文案格式由 browser-draft 的 read_copy 解析：「## 标题」「## 正文」「## 话题」三段。
// 图片默认取文案同目录 out/ 下按文件名排序的 PNG / JPG / WebP（ic render 的输出）。
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runDraft, takeVia } from "./lib/shared/draft-run.mjs";

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IMAGE_RE = /\.(png|jpe?g|webp)$/i;
const MAX_IMAGES = 18;

function parseArgs(argv) {
  const [file, ...rest] = argv;
  const i = rest.indexOf("--images");
  return { file: file && resolve(file), images: i >= 0 ? resolve(rest[i + 1]) : null };
}

function main() {
  const [via, rest] = takeVia(process.argv.slice(2));
  if (via === "phone") throw new Error("小红书手机端改发视频：用 vdraft <成片.mp4> --copy <文案.md> --to xiaohongshu；图文笔记用浏览器（--via browser，默认）");
  const opts = parseArgs(rest);
  if (!opts.file || !existsSync(opts.file)) throw new Error("用法：ic draft <文案.md> [--images 目录] [--via phone|browser]");

  const imageDir = opts.images ?? join(dirname(opts.file), "out");
  if (!existsSync(imageDir)) throw new Error(`图片目录不存在：${imageDir}（先运行 ic render）`);
  const images = readdirSync(imageDir).filter((f) => IMAGE_RE.test(f)).sort().map((f) => join(imageDir, f));
  if (!images.length) throw new Error(`${imageDir} 里没有图片`);
  if (images.length > MAX_IMAGES) throw new Error(`小红书最多 ${MAX_IMAGES} 张图，现在有 ${images.length} 张`);

  console.log(`文案：${opts.file}｜图片 ${images.length} 张`);
  runDraft(via, { browser: join(SKILL_DIR, "scripts", "draft_xiaohongshu.py") }, { copy: opts.file, images }, { tmpPrefix: "ic-draft-" });
}

try {
  main();
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exit(1);
}
