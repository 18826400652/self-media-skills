#!/usr/bin/env node
// 用法：nv hf-build <HyperFrames 工程目录> [--no-check] [--snap | --motion]
//
// 配音（nv hf-audio）和画面（compositions/frames/）都写好之后，一条命令把工程组装成可渲染的状态：
//   组件库 + 逐字时间 → 同步帧时长 → 按 build 生成画面 → 音效 → 素材 → 字体 → 字幕 → 组装 index → 转场 → lint / check
// --snap：再按每帧结尾截图，拼成 snapshots/sheet.jpg，用来看图检查。
// --motion：每帧截入场、中段、落定三张（动画过程），检查元素是否按时出现、过程中有没有穿帮。
// 官方脚本来自 faceless-explainer skill（默认 ~/.claude/skills/faceless-explainer，可用 FACELESS_DIR 指定）。
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { SKILL_DIR } from "./lib/config.mjs";
import { isMain } from "./lib/is-main.mjs";

const FE = join(process.env.FACELESS_DIR || join(homedir(), ".claude", "skills", "faceless-explainer"), "scripts");
const HF = join(SKILL_DIR, "node_modules", ".bin", "hyperframes");
const ASSET_SOURCES = ["capture/assets", "public"];
const SNAP_BEFORE_END = 0.3; // 截每帧结尾前 0.3 秒：动画已落定
const MOTION_ENTRANCE = 0.35; // 入场时刻：帧开始后 0.35 秒

function run(label, cmd, args, cwd) {
  console.log(`\n▸ ${label}`);
  try {
    execFileSync(cmd, args, { cwd, stdio: "inherit" });
  } catch {
    throw new Error(`「${label}」失败（${[basename(cmd), ...args].join(" ")}），修好后重跑 nv hf-build`);
  }
}

const node = (label, script, args, cwd) => run(label, process.execPath, [script, ...args], cwd);

/** 画面引用的 assets/<文件> 缺失时，从 capture/assets 或 public 补齐；哪里都没有就报错 */
function stageAssets(dir) {
  const framesDir = join(dir, "compositions", "frames");
  const refs = new Set();
  for (const f of readdirSync(framesDir).filter((f) => f.endsWith(".html"))) {
    for (const m of readFileSync(join(framesDir, f), "utf8").matchAll(/["'(]assets\/([^"'()\s]+\.(?:png|jpe?g|webp|gif|svg|mp4|webm))/gi)) refs.add(m[1]);
  }
  const missing = [];
  for (const name of refs) {
    const target = join(dir, "assets", name);
    if (existsSync(target)) continue;
    const src = ASSET_SOURCES.map((d) => join(dir, d, name)).find(existsSync);
    if (src) {
      copyFileSync(src, target);
      console.log(`  ✓ assets/${name}（来自 ${src.slice(dir.length + 1)}）`);
    } else missing.push(name);
  }
  if (missing.length) throw new Error(`画面引用的素材不存在：${missing.map((n) => `assets/${n}`).join("、")}（放到 capture/assets/ 或 assets/）`);
  console.log(`  ✓ ${refs.size} 个素材就绪`);
}

/** index.html 里每帧的起止时间 → 每帧结尾前的截图时刻 */
export function frameEndTimes(dir) {
  const html = readFileSync(join(dir, "index.html"), "utf8");
  const frames = [];
  for (const m of html.matchAll(/<div[^>]*data-composition-src="compositions\/frames\/[^"]+"[^>]*>/g)) {
    const start = Number(m[0].match(/data-start="([\d.]+)"/)?.[1]);
    const dur = Number(m[0].match(/data-duration="([\d.]+)"/)?.[1]);
    if (Number.isFinite(start) && Number.isFinite(dur)) frames.push({ start, end: start + dur });
  }
  frames.sort((a, b) => a.start - b.start);
  // 有转场时下一帧会提前进场，截图要取在转场开始之前
  return frames.map((f, i) => {
    const end = Math.min(f.end, frames[i + 1]?.start ?? Infinity);
    return Math.round((end - SNAP_BEFORE_END) * 100) / 100;
  });
}

/** 动画过程：每帧取入场、中段、落定三个时刻（借鉴 HyperFrames-RenderKit「看连续帧，不只看结果」） */
export function frameMotionTimes(dir) {
  const ends = frameEndTimes(dir);
  const html = readFileSync(join(dir, "index.html"), "utf8");
  const starts = [...html.matchAll(/<div[^>]*data-composition-src="compositions\/frames\/[^"]+"[^>]*>/g)]
    .map((m) => Number(m[0].match(/data-start="([\d.]+)"/)?.[1]))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const r2 = (x) => Math.round(x * 100) / 100;
  return starts.flatMap((start, i) => [r2(start + MOTION_ENTRANCE), r2((start + ends[i]) / 2), ends[i]]);
}

function snapshotSheet(dir, motion) {
  const times = motion ? frameMotionTimes(dir) : frameEndTimes(dir);
  if (!times.length) throw new Error("index.html 里没找到帧，无法截图");
  rmSync(join(dir, "snapshots"), { recursive: true, force: true });
  run(`截图（${times.length} 帧）`, HF, ["snapshot", ".", "--at", times.join(","), "--no-end"], dir);
  const cols = motion ? 6 : Math.min(7, times.length); // 动画过程：每行两帧，每帧「入场 / 中段 / 落定」
  execFileSync("ffmpeg", ["-v", "error", "-y", "-pattern_type", "glob", "-i", "snapshots/frame-*.png",
    "-vf", `scale=300:-1,tile=${cols}x${Math.ceil(times.length / cols)}:padding=6:color=0x444444`, "-frames:v", "1", "snapshots/sheet.jpg"], { cwd: dir });
  console.log(motion
    ? "  ✓ snapshots/sheet.jpg（每帧三张：入场 / 中段 / 落定，看元素是否按时出现、过程中有没有穿帮）"
    : "  ✓ snapshots/sheet.jpg（每帧结尾一张，看图检查断行、遮挡、安全区）");
}

function main() {
  const args = process.argv.slice(2);
  const dir = resolve(args.find((a) => !a.startsWith("--")) || "");
  const check = !args.includes("--no-check");
  for (const need of ["STORYBOARD.md", "audio_meta.json", "compositions/frames"]) {
    if (!existsSync(join(dir, need))) throw new Error(`缺少 ${need}：先写 STORYBOARD.md、运行 nv hf-audio、写好 compositions/frames/`);
  }
  if (!existsSync(join(FE, "assemble-index.mjs"))) throw new Error(`找不到 faceless-explainer 的脚本：${FE}（安装 HyperFrames skills，或设置 FACELESS_DIR）`);
  const sb = ["--storyboard", "./STORYBOARD.md"];
  const self = (name) => join(SKILL_DIR, "scripts", `${name}.mjs`);

  node("组件库 + 逐字时间", self("hf-kit"), [dir], dir);
  node("同步帧时长", join(FE, "audio.mjs"), ["sync-durations", "--audio-meta", "./audio_meta.json", ...sb], dir);
  node("帧模板（STORYBOARD 的 build）", self("hf-frames"), [dir], dir);
  node("音效", self("hf-sfx"), [dir], dir);
  console.log("\n▸ 素材");
  stageAssets(dir);
  node("中文字体", self("hf-fonts"), [dir], dir);
  node("字幕", join(FE, "captions.mjs"), ["build", ...sb, "--audio-meta", "./audio_meta.json", "--hyperframes", ".", "--out", "./caption_groups.json"], dir);
  node("组装 index.html", join(FE, "assemble-index.mjs"), [...sb, "--hyperframes", "."], dir);
  node("转场", join(FE, "transitions.mjs"), ["inject", ...sb, "--hyperframes", "."], dir);
  node("转场校验", join(FE, "transitions.mjs"), ["verify", ...sb, "--index", "./index.html"], dir);
  if (check) {
    run("lint", HF, ["lint", "."], dir);
    run("check", HF, ["check", "."], dir);
  }
  if (args.includes("--snap") || args.includes("--motion")) snapshotSheet(dir, args.includes("--motion"));
  console.log("\n✓ 组装完成。看完截图后：nv render <工程>");
}

if (isMain(import.meta.url)) try {
  main();
} catch (err) {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
}
