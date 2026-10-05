#!/usr/bin/env node
// ic draft <文案.md> [--images 目录]：把卡片图片 + 文案存进小红书草稿箱（用已登录的浏览器，依赖 browser-draft 的 bd）。
// 文案格式由 browser-draft 的 read_copy 解析：「## 标题」「## 正文」「## 话题」三段。
// 图片默认取文案同目录 out/ 下按文件名排序的 PNG / JPG / WebP（ic render 的输出）。
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IMAGE_RE = /\.(png|jpe?g|webp)$/i;
const MAX_IMAGES = 18;

function parseArgs(argv) {
  const [file, ...rest] = argv;
  const i = rest.indexOf("--images");
  return { file: file && resolve(file), images: i >= 0 ? resolve(rest[i + 1]) : null };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.file || !existsSync(opts.file)) throw new Error("用法：ic draft <文案.md> [--images 目录]");

  const imageDir = opts.images ?? join(dirname(opts.file), "out");
  if (!existsSync(imageDir)) throw new Error(`图片目录不存在：${imageDir}（先运行 ic render）`);
  const images = readdirSync(imageDir).filter((f) => IMAGE_RE.test(f)).sort().map((f) => join(imageDir, f));
  if (!images.length) throw new Error(`${imageDir} 里没有图片`);
  if (images.length > MAX_IMAGES) throw new Error(`小红书最多 ${MAX_IMAGES} 张图，现在有 ${images.length} 张`);

  const payloadFile = join(mkdtempSync(join(tmpdir(), "ic-draft-")), "payload.json");
  writeFileSync(payloadFile, JSON.stringify({ copy: opts.file, images }));
  console.log(`文案：${opts.file}｜图片 ${images.length} 张`);
  try {
    execFileSync("bd", ["run", join(SKILL_DIR, "scripts", "draft_xiaohongshu.py"), payloadFile], { stdio: "inherit" });
  } catch (err) {
    if (err.code === "ENOENT") throw new Error("需要 browser-draft 的 bd 命令（skills/browser-draft，软链接到 PATH）");
    throw new Error("发草稿失败，看上面的输出");
  }
}

try {
  main();
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exit(1);
}
