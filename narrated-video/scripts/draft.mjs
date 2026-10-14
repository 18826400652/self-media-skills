#!/usr/bin/env node
// nv draft <成片.mp4> --copy <发布文案.md> [--to douyin|xiaohongshu] [--via phone|browser]：把视频和文案存进抖音（默认）或小红书的草稿（不发布）。
// 默认用 phone-draft 的 pd 操作手机上的抖音 App；browser 用 browser-draft 的 bd 操作已登录的浏览器；文案格式由它的 read_copy 解析：「## 标题」（≤ 30 字）「## 正文」「## 话题」。
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const USAGE = "用法：nv draft <成片.mp4> --copy <发布文案.md> [--to douyin|xiaohongshu] [--via phone|browser]";
/** 每个平台可用的发草稿步骤：小红书只做了手机端（发视频） */
const STEPS = {
  douyin: { phone: "phone_douyin.py", browser: "draft_douyin.py" },
  xiaohongshu: { phone: "phone_xiaohongshu.py" },
};

/** 从参数里取出 --to douyin|xiaohongshu（默认 douyin），返回 [to, 其余参数] */
function takeTo(argv) {
  const i = argv.indexOf("--to");
  if (i < 0) return ["douyin", argv];
  const to = argv[i + 1];
  if (!STEPS[to]) throw new Error(`--to 只能是 douyin 或 xiaohongshu，收到：${to}`);
  return [to, [...argv.slice(0, i), ...argv.slice(i + 2)]];
}
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
  const i = argv.indexOf("--copy");
  const video = argv.find((a, k) => !a.startsWith("--") && k !== i + 1);
  return { video: video && resolve(video), copy: i >= 0 && argv[i + 1] ? resolve(argv[i + 1]) : null };
}

function main() {
  const [to, afterTo] = takeTo(process.argv.slice(2));
  const [via, rest] = takeVia(afterTo);
  if (!STEPS[to][via]) throw new Error("小红书视频只做了手机端（--via phone），不支持浏览器");
  const { video, copy } = parseArgs(rest);
  if (!video || !copy) throw new Error(USAGE);
  if (!existsSync(video)) throw new Error(`视频不存在：${video}`);
  if (!existsSync(copy)) throw new Error(`发布文案不存在：${copy}`);
  const payloadFile = join(mkdtempSync(join(tmpdir(), "nv-draft-")), "payload.json");
  writeFileSync(payloadFile, JSON.stringify({ video, copy }));
  runDraft(via, { [via]: join(SKILL_DIR, "scripts", STEPS[to][via]) }, payloadFile);
}

try {
  main();
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exit(1);
}
