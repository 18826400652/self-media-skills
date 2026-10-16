#!/usr/bin/env node
// 用法：sc rec <输出.mp4> --prompt <文字文件> --app deepseek|doubao [--think] [--search] [--timeout 秒]   （手机，推荐）
//       sc rec <输出.mp4> --prompt <文字文件> --url <网址> | --via browser [--input …] [--hide …] [--size 540x960] [--setup 文件|none] [--timeout 秒]   （浏览器）
//       浏览器打开 DeepSeek 时默认先关「深度思考」「智能搜索」（rec/setup/deepseek-off.py）；--setup 换成自己的准备脚本，none 不做
//
// 手机：调用 phone-draft 的 pd rec，在真手机的 AI App 里打字、发送、等回答结束并录屏（输出格式和浏览器版相同）。
//
// 录下「把一段提问粘贴进 AI 对话框 → 发送 → 回答输出完」的全过程，用作视频里的实测录屏。
// 通过浏览器调试接口（browser-harness）连接你正在用的浏览器，只录网页内容，不录浏览器边框和桌面；
// 页面模拟手机竖屏，按 2 倍像素录制（540x960 → 1080x1920，正好是抖音竖屏）。
// 输出：<输出>.mp4、<输出>.json（发送到回答结束的秒数、发送时刻在视频里的位置）、<输出>.txt（页面全文，用于实测记录）。
//
// 连接：环境变量 BU_CDP_WS，或项目配置 rec.cdpPort（推荐：自动化专用浏览器用 --remote-debugging-port 启动，不弹允许）/ rec.devtoolsActivePort。
// 录之前在网页里确认：已登录、新对话、模型开关和实测记录一致、侧边栏收起（不露个人记录）。
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { SKILL_DIR, loadRecConfig } from "./lib/rec-config.mjs";
import { browserSetup } from "./lib/rec-browser.mjs";
import { cdpEndpoint, encode } from "./lib/rec-common.mjs";

function parseArgs(argv) {
  const opts = { size: "540x960", input: "textarea", hide: "", url: "", app: "", via: "", timeout: "", setup: "", think: false, search: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const m = argv[i].match(/^--(prompt|url|input|hide|size|app|via|timeout|setup)$/);
    if (m) opts[m[1]] = argv[++i];
    else if (argv[i] === "--think" || argv[i] === "--search") opts[argv[i].slice(2)] = true;
    else rest.push(argv[i]);
  }
  const usage = "用法：sc rec <输出.mp4> --prompt <提问.txt> --app deepseek|doubao [--think] [--search] [--timeout 秒]（手机）\n" +
    "      sc rec <输出.mp4> --prompt <提问.txt> --url <网址> | --via browser [--setup 文件|none] [--timeout 秒]（浏览器）";
  if (!rest[0] || !opts.prompt) throw new Error(usage);
  const browser = Boolean(opts.url) || opts.via === "browser";
  if (opts.app && browser) throw new Error(`--app（手机）和 --url / --via browser（浏览器）只能选一种\n${usage}`);
  if (!opts.app && !browser) throw new Error(usage);
  const [w, h] = opts.size.split("x").map(Number);
  if (!w || !h) throw new Error(`--size 写法应为 宽x高：${opts.size}`);
  return { out: resolve(rest[0]), prompt: resolve(opts.prompt), w, h, ...opts };
}

const EXIT_NO_DEVICE = 3;

function recPhone(o) {
  const args = ["rec", o.app, o.prompt, o.out, ...(o.think ? ["--think"] : []), ...(o.search ? ["--search"] : []),
    ...(o.timeout ? ["--timeout", o.timeout] : [])];
  const r = spawnSync("pd", args, { stdio: "inherit" });
  if (r.error) throw new Error(`调用 pd 失败：${r.error.message}（phone-draft 装好了吗？）`);
  if (r.status === EXIT_NO_DEVICE) throw new Error("手机不可用（没连上或锁屏）。处理好再录，或改用 --url <网址> 走浏览器");
  if (r.status !== 0) throw new Error("手机录屏失败，看上面的输出");
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!existsSync(o.prompt)) throw new Error(`找不到提问文件：${o.prompt}`);
  if (o.app) return recPhone(o);
  const setup = process.env.REC_SETUP || browserSetup(o);
  if (setup && !existsSync(setup)) throw new Error(`找不到录前准备脚本：${setup}`);
  const config = loadRecConfig(dirname(o.out));
  const dir = mkdtempSync(join(tmpdir(), "sc-rec-"));
  try {
    const env = {
      ...process.env, BU_CDP_WS: cdpEndpoint(config), REC_DIR: dir, REC_PROMPT_FILE: o.prompt, REC_URL: o.url, REC_THEME: config.rec?.theme ?? "",
      REC_W: String(o.w), REC_H: String(o.h), REC_INPUT: o.input, REC_HIDE: o.hide || config.rec?.hide || "",
      REC_SETUP: setup, ...(o.timeout ? { REC_TIMEOUT: o.timeout } : {}),
    };
    // 判断回答结束的逻辑单独一个文件（可单测），拼在录屏脚本前面一起交给 browser-harness
    const script = ["answer_watch.py", "screencast.py"].map((f) => readFileSync(join(SKILL_DIR, "scripts", "rec", f), "utf8")).join("\n");
    console.log("● 录制中：粘贴 → 发送 → 等回答结束……");
    const res = execFileSync("browser-harness", ["-c", script], { env, encoding: "utf8", timeout: (Number(o.timeout) || 120) * 1000 + 180000 });
    const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));
    encode(dir, meta.frames, o.out);
    const t0 = meta.frames[0];
    const info = {
      seconds: Math.round((meta.marks.done - meta.marks.sent) * 100) / 100,
      pastedAt: Math.round((meta.marks.pasted - t0) * 100) / 100,
      sentAt: Math.round((meta.marks.sent - t0) * 100) / 100,
      doneAt: Math.round((meta.marks.done - t0) * 100) / 100,
      viewport: meta.viewport,
    };
    const base = o.out.replace(/\.mp4$/, "");
    writeFileSync(`${base}.json`, `${JSON.stringify(info, null, 2)}\n`);
    writeFileSync(`${base}.txt`, readFileSync(join(dir, "page.txt"), "utf8"));
    console.log(res.trim().split("\n").pop());
    console.log(`✓ ${o.out}（发送后 ${info.seconds} 秒回答完；视频里 ${info.sentAt}s 发送、${info.doneAt}s 结束）`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

try {
  main();
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exit(1);
}
