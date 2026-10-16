#!/usr/bin/env node
// vdraft <成片.mp4> --copy <发布文案.md> [--cover <封面图>] [--to douyin|xiaohongshu] [--via browser|phone]：把视频和文案存进抖音（默认）或小红书的草稿（不发布）。
// --cover：上传这张图做封面（只有浏览器端）；不传时抖音用视频画面、小红书用第一帧。
// 默认用 browser-draft 的 bd 操作已登录的浏览器（抖音创作者中心、小红书创作服务平台）；phone 用 phone-draft 的 pd 操作手机 App；文案格式由它的 read_copy 解析：「## 标题」（≤ 30 字）「## 正文」「## 话题」。
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runDraft, takeVia } from "./lib/shared/draft-run.mjs";

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const USAGE = "用法：vdraft <成片.mp4> --copy <发布文案.md> [--cover <封面图>] [--to douyin|xiaohongshu] [--via browser|phone]";
const COVER_RE = /\.(png|jpe?g)$/i;
/** 每个平台可用的发草稿步骤（都发视频） */
const STEPS = {
  douyin: { browser: "draft_douyin.py", phone: "phone_douyin.py" },
  xiaohongshu: { browser: "draft_xiaohongshu.py", phone: "phone_xiaohongshu.py" },
};

/** 从参数里取出 --to douyin|xiaohongshu（默认 douyin），返回 [to, 其余参数] */
function takeTo(argv) {
  const i = argv.indexOf("--to");
  if (i < 0) return ["douyin", argv];
  const to = argv[i + 1];
  if (!STEPS[to]) throw new Error(`--to 只能是 douyin 或 xiaohongshu，收到：${to}`);
  return [to, [...argv.slice(0, i), ...argv.slice(i + 2)]];
}

/** 从参数里取出 --cover <图片>，返回 [封面绝对路径或 null, 其余参数] */
function takeCover(argv) {
  const i = argv.indexOf("--cover");
  if (i < 0) return [null, argv];
  const cover = argv[i + 1];
  if (!cover || cover.startsWith("--")) throw new Error(USAGE);
  if (!COVER_RE.test(cover)) throw new Error(`封面图要是 png 或 jpg：${cover}`);
  if (!existsSync(cover)) throw new Error(`封面图不存在：${cover}`);
  return [resolve(cover), [...argv.slice(0, i), ...argv.slice(i + 2)]];
}

function parseArgs(argv) {
  const i = argv.indexOf("--copy");
  const video = argv.find((a, k) => !a.startsWith("--") && k !== i + 1);
  return { video: video && resolve(video), copy: i >= 0 && argv[i + 1] ? resolve(argv[i + 1]) : null };
}

function main() {
  const [to, afterTo] = takeTo(process.argv.slice(2));
  const [via, afterVia] = takeVia(afterTo);
  const [cover, rest] = takeCover(afterVia);
  if (cover && via !== "browser") throw new Error("上传封面图只做了浏览器端，去掉 --via phone（手机端在 App 里手动换封面）");
  const { video, copy } = parseArgs(rest);
  if (!video || !copy) throw new Error(USAGE);
  if (!existsSync(video)) throw new Error(`视频不存在：${video}`);
  if (!existsSync(copy)) throw new Error(`发布文案不存在：${copy}`);
  runDraft(via, { [via]: join(SKILL_DIR, "scripts", STEPS[to][via]) }, { video, copy, ...(cover ? { cover } : {}) }, { tmpPrefix: "vdraft-" });
}

try {
  main();
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exit(1);
}
