#!/usr/bin/env node
// 用法：nv rec-flow <输出.mp4> --steps <步骤.py> [--url 网址] [--size 1280x720] [--fps 15] [--timeout 分钟] [--downloads 目录]
//
// 录一段「按步骤操作网页」的电脑横屏录屏（软件演示、多步表单等），nv rec 只能录 AI 对话。
// 步骤脚本是 Python，在浏览器里真实执行；可用的函数见 scripts/rec/flow.py 开头。等待时持续录帧，最高帧率 --fps（默认 15，长时间录制省空间）。
// 只录网页内容，不录浏览器边框和桌面；按 1.5 倍像素录（1280x720 → 1920x1080）。
// 输出：<输出>.mp4、<输出>.json（每个 mark 在视频里的秒数、操作日志）、<输出>.txt（结束时的页面全文）。
// --downloads：网页里下载的文件存到这个目录（WSL 下自动转成 Windows 路径）。注意：Windows 的 Edge 下载到 \\wsl.localhost 路径实测没生效。
// 连接方式同 nv rec（BU_CDP_WS / 项目配置 rec.cdpPort / rec.devtoolsActivePort）。
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { SKILL_DIR, loadConfig } from "./lib/config.mjs";
import { cdpEndpoint, encode } from "./lib/rec-common.mjs";

const USAGE = "用法：nv rec-flow <输出.mp4> --steps <步骤.py> [--url 网址] [--size 1280x720] [--fps 15] [--timeout 分钟] [--downloads 目录]";

function parseArgs(argv) {
  const opts = { size: "1280x720", url: "", fps: "15", timeout: "30", downloads: "" };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const m = argv[i].match(/^--(steps|url|size|fps|timeout|downloads)$/);
    if (m) opts[m[1]] = argv[++i];
    else rest.push(argv[i]);
  }
  if (!rest[0] || !opts.steps) throw new Error(USAGE);
  const [w, h] = opts.size.split("x").map(Number);
  if (!w || !h) throw new Error(`--size 写法应为 宽x高：${opts.size}`);
  return { ...opts, out: resolve(rest[0]), steps: resolve(opts.steps), w, h };
}

/** 浏览器那一侧能用的路径：浏览器在 Windows、命令在 WSL 时转成 \\wsl.localhost\… */
function browserPath(dir) {
  mkdirSync(dir, { recursive: true });
  if (!process.env.WSL_DISTRO_NAME) return dir;
  return execFileSync("wslpath", ["-w", dir], { encoding: "utf8" }).trim();
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!existsSync(o.steps)) throw new Error(`找不到步骤脚本：${o.steps}`);
  const config = loadConfig(dirname(o.out));
  const dir = mkdtempSync(join(tmpdir(), "nv-rec-flow-"));
  try {
    const env = {
      // 单独的 browser-harness 连接：和别的会话（如同时在跑的 nv rec）共用默认连接时，对方新开标签页会把录制带走
      ...process.env, BU_NAME: process.env.BU_NAME || "nv-rec-flow", BU_CDP_WS: cdpEndpoint(config), REC_DIR: dir, REC_STEPS: o.steps, REC_URL: o.url,
      REC_W: String(o.w), REC_H: String(o.h), REC_FPS: o.fps, REC_THEME: config.rec?.flowTheme ?? "",
      REC_HIDE: config.rec?.hide || "", REC_DOWNLOAD_DIR: o.downloads ? browserPath(resolve(o.downloads)) : "",
    };
    const script = readFileSync(join(SKILL_DIR, "scripts", "rec", "flow.py"), "utf8");
    console.log("● 录制中（按步骤操作网页）……");
    execFileSync("browser-harness", ["-c", script], { env, stdio: ["ignore", "inherit", "inherit"], timeout: Number(o.timeout) * 60000 });
    const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));
    const t0 = meta.frames[0];
    encode(dir, meta.frames, o.out);
    const at = Object.fromEntries(Object.entries(meta.marks).map(([k, t]) => [k, Math.round((t - t0) * 10) / 10]));
    const base = o.out.replace(/\.mp4$/, "");
    writeFileSync(`${base}.json`, `${JSON.stringify({ marks: at, viewport: meta.viewport, failed: meta.failed, logs: meta.logs }, null, 2)}\n`);
    writeFileSync(`${base}.txt`, readFileSync(join(dir, "page.txt"), "utf8"));
    if (meta.failed) throw new Error(`步骤没走完：${meta.failed}（已录到的部分在 ${o.out}）`);
    console.log(`✓ ${o.out}（${Math.round(meta.frames.at(-1) - t0)} 秒；各步骤的时间点见 ${base}.json）`);
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
