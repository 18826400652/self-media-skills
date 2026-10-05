#!/usr/bin/env node
// nv draft <成片.mp4> --copy <发布文案.md>：用已登录的浏览器把视频和文案暂存到抖音创作者中心（不发布）。
// 依赖 browser-draft 的 bd；文案格式由它的 read_copy 解析：「## 标题」（≤ 30 字）「## 正文」「## 话题」。
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const USAGE = "用法：nv draft <成片.mp4> --copy <发布文案.md>";

function parseArgs(argv) {
  const i = argv.indexOf("--copy");
  const video = argv.find((a, k) => !a.startsWith("--") && k !== i + 1);
  return { video: video && resolve(video), copy: i >= 0 && argv[i + 1] ? resolve(argv[i + 1]) : null };
}

function main() {
  const { video, copy } = parseArgs(process.argv.slice(2));
  if (!video || !copy) throw new Error(USAGE);
  if (!existsSync(video)) throw new Error(`视频不存在：${video}`);
  if (!existsSync(copy)) throw new Error(`发布文案不存在：${copy}`);
  const payloadFile = join(mkdtempSync(join(tmpdir(), "nv-draft-")), "payload.json");
  writeFileSync(payloadFile, JSON.stringify({ video, copy }));
  try {
    execFileSync("bd", ["run", join(SKILL_DIR, "scripts", "draft_douyin.py"), payloadFile], { stdio: "inherit" });
  } catch (err) {
    if (err.code === "ENOENT") throw new Error("需要 browser-draft 的 bd 命令（skills/browser-draft，软链接到 PATH）");
    throw new Error("暂存失败，看上面的输出");
  }
}

try {
  main();
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exit(1);
}
