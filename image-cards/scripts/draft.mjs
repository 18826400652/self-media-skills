#!/usr/bin/env node
// ic draft <文案.md> [--images 目录] [--via phone|browser]：把卡片图片 + 文案存进小红书草稿箱
// （默认用 phone-draft 的 pd 操作手机上的小红书 App；browser 用 browser-draft 的 bd 操作已登录的浏览器）。
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
const VIA = { phone: "pd", browser: "bd" };
const VIA_SKILL = { phone: "phone-draft", browser: "browser-draft" };
const EXIT_NO_DEVICE = 3;

/** 从参数里取出 --via phone|browser（默认 phone），返回 [via, 其余参数] */
function takeVia(argv) {
  const i = argv.indexOf("--via");
  if (i < 0) return ["phone", argv];
  const via = argv[i + 1];
  if (!VIA[via]) throw new Error(`--via 只能是 phone 或 browser，收到：${via}`);
  return [via, [...argv.slice(0, i), ...argv.slice(i + 2)]];
}

/** phone 用 pd 操作手机，browser 用 bd 操作已登录的浏览器；手机不可用时报错，不回落到浏览器 */
function runDraft(via, steps, payloadFile) {
  const bin = VIA[via];
  try {
    execFileSync(bin, ["run", steps[via], payloadFile], { stdio: "inherit" });
  } catch (err) {
    if (err.code === "ENOENT") throw new Error(`需要 ${bin} 命令（skills/${VIA_SKILL[via]}，软链接到 PATH）`);
    if (via === "phone" && err.status === EXIT_NO_DEVICE) throw new Error("手机不可用（见上面的提示），也可以加 --via browser 改用浏览器");
    throw new Error("发草稿失败，看上面的输出");
  }
}

function parseArgs(argv) {
  const [file, ...rest] = argv;
  const i = rest.indexOf("--images");
  return { file: file && resolve(file), images: i >= 0 ? resolve(rest[i + 1]) : null };
}

function main() {
  const [via, rest] = takeVia(process.argv.slice(2));
  const opts = parseArgs(rest);
  if (!opts.file || !existsSync(opts.file)) throw new Error("用法：ic draft <文案.md> [--images 目录] [--via phone|browser]");

  const imageDir = opts.images ?? join(dirname(opts.file), "out");
  if (!existsSync(imageDir)) throw new Error(`图片目录不存在：${imageDir}（先运行 ic render）`);
  const images = readdirSync(imageDir).filter((f) => IMAGE_RE.test(f)).sort().map((f) => join(imageDir, f));
  if (!images.length) throw new Error(`${imageDir} 里没有图片`);
  if (images.length > MAX_IMAGES) throw new Error(`小红书最多 ${MAX_IMAGES} 张图，现在有 ${images.length} 张`);

  const payloadFile = join(mkdtempSync(join(tmpdir(), "ic-draft-")), "payload.json");
  writeFileSync(payloadFile, JSON.stringify({ copy: opts.file, images }));
  console.log(`文案：${opts.file}｜图片 ${images.length} 张`);
  runDraft(via, { phone: join(SKILL_DIR, "scripts", "phone_xiaohongshu.py"), browser: join(SKILL_DIR, "scripts", "draft_xiaohongshu.py") }, payloadFile);
}

try {
  main();
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exit(1);
}
