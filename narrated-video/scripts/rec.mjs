#!/usr/bin/env node
// 用法：nv rec <输出.mp4> --prompt <文字文件> [--url <网址>] [--input <输入框选择器>] [--hide <CSS 选择器>] [--size 540x960]
//
// 录下「把一段提问粘贴进 AI 对话框 → 发送 → 回答输出完」的全过程，用作视频里的实测录屏。
// 通过浏览器调试接口（browser-harness）连接你正在用的浏览器，只录网页内容，不录浏览器边框和桌面；
// 页面模拟手机竖屏，按 2 倍像素录制（540x960 → 1080x1920，正好是抖音竖屏）。
// 输出：<输出>.mp4、<输出>.json（发送到回答结束的秒数、发送时刻在视频里的位置）、<输出>.txt（页面全文，用于实测记录）。
//
// 连接：环境变量 BU_CDP_WS，或项目配置 rec.devtoolsActivePort（浏览器 DevToolsActivePort 文件的路径）。
// 录之前在网页里确认：已登录、新对话、模型开关和实测记录一致、侧边栏收起（不露个人记录）。
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { SKILL_DIR, fromRoot, loadConfig } from "./lib/config.mjs";

const OUT_FPS = 30;

function parseArgs(argv) {
  const opts = { size: "540x960", input: "textarea", hide: "", url: "" };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const m = argv[i].match(/^--(prompt|url|input|hide|size)$/);
    if (m) opts[m[1]] = argv[++i];
    else rest.push(argv[i]);
  }
  if (!rest[0] || !opts.prompt) throw new Error("用法：nv rec <输出.mp4> --prompt <文字文件> [--url 网址] [--input 选择器] [--hide 选择器] [--size 540x960]");
  const [w, h] = opts.size.split("x").map(Number);
  if (!w || !h) throw new Error(`--size 写法应为 宽x高：${opts.size}`);
  return { out: resolve(rest[0]), prompt: resolve(opts.prompt), w, h, ...opts };
}

/** BU_CDP_WS 优先；否则从 DevToolsActivePort 文件（第 1 行端口、第 2 行路径）拼出 WebSocket 地址 */
function cdpEndpoint(config) {
  if (process.env.BU_CDP_WS) return process.env.BU_CDP_WS;
  const file = fromRoot(config, config.rec?.devtoolsActivePort);
  if (!file || !existsSync(file)) throw new Error("连不上浏览器：设置环境变量 BU_CDP_WS，或在项目配置写 rec.devtoolsActivePort（浏览器需开启远程调试）");
  const [port, path] = readFileSync(file, "utf8").split(/\r?\n/);
  return `ws://127.0.0.1:${port.trim()}${path.trim()}`;
}

/** 帧（带时间戳）→ 恒定帧率 MP4 */
function encode(dir, meta, out) {
  const ts = meta.frames;
  if (!ts.length) throw new Error("没有录到画面（页面没有变化，或浏览器没响应）");
  const list = ts.map((t, i) => `file 'f${String(i).padStart(5, "0")}.jpg'\nduration ${Math.max((ts[i + 1] ?? t + 1) - t, 0.001).toFixed(4)}`);
  list.push(`file 'f${String(ts.length - 1).padStart(5, "0")}.jpg'`);
  writeFileSync(join(dir, "list.txt"), `${list.join("\n")}\n`);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", join(dir, "list.txt"),
    "-vf", `fps=${OUT_FPS},format=yuv420p`, "-c:v", "libx264", "-crf", "18", out]);
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!existsSync(o.prompt)) throw new Error(`找不到提问文件：${o.prompt}`);
  const config = loadConfig(dirname(o.out));
  const dir = mkdtempSync(join(tmpdir(), "nv-rec-"));
  try {
    const env = {
      ...process.env, BU_CDP_WS: cdpEndpoint(config), REC_DIR: dir, REC_PROMPT_FILE: o.prompt, REC_URL: o.url,
      REC_W: String(o.w), REC_H: String(o.h), REC_INPUT: o.input, REC_HIDE: o.hide || config.rec?.hide || "",
    };
    const script = readFileSync(join(SKILL_DIR, "scripts", "rec", "screencast.py"), "utf8");
    console.log("● 录制中：粘贴 → 发送 → 等回答结束……");
    const res = execFileSync("browser-harness", ["-c", script], { env, encoding: "utf8", timeout: 300000 });
    const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));
    encode(dir, meta, o.out);
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
