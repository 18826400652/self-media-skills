#!/usr/bin/env node
// 用法：nv hf-build <HyperFrames 工程目录> [--no-check] [--snap | --motion]
//
// 配音（nv hf-audio）和画面（compositions/frames/）都写好之后，一条命令把工程组装成可渲染的状态：
//   组件库 + 逐字时间 → 同步帧时长 → 按 build 生成画面 → 音效 → 素材 → 字体 → 字幕 → 组装 index → 转场 → GSAP 本地化 → lint / check
// check 时竖屏工程加 --caption-zone：每帧结尾查文字有没有伸出内容框（y 1160 以下）压到字幕；
// 再做越框检查：截一套「干净画面」（只剩内容），每帧中段和结尾查面板、图片、文字有没有伸出四角框或占了角标行
// --snap：再按每帧结尾截图，拼成 snapshots/sheet.jpg，用来看图检查；并量每帧内容铺开多少，偏空的帧给出警告。
// --motion：每帧截入场、中段、落定三张（动画过程），检查元素是否按时出现、过程中有没有穿帮。
// 官方脚本来自 faceless-explainer skill（默认 ~/.claude/skills/faceless-explainer，可用 FACELESS_DIR 指定）。
import { CAPTION_ARGS, FACELESS_SCRIPTS, SYNC_ARGS } from "./lib/captions-step.mjs";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { SKILL_DIR } from "./lib/config.mjs";
import { isMain } from "./lib/is-main.mjs";
import { parseStoryboardFrames } from "./lib/frame-build.mjs";
import { localizeGsap } from "./lib/localize.mjs";

const FE = FACELESS_SCRIPTS;
const HF = join(SKILL_DIR, "node_modules", ".bin", "hyperframes");
const ASSET_SOURCES = ["capture/assets", "public"];
const SNAP_BEFORE_END = 0.3; // 截每帧结尾前 0.3 秒：动画已落定
const MOTION_ENTRANCE = 0.35; // 入场时刻：帧开始后 0.35 秒
const HOLD_GAP = 0.7; // 落定后还动不动：比较「落定」和它前 0.7 秒这两张
const MIN_HOLD_DIFF = 0.3; // 两张图内容区的平均像素差（0–255）低于它，算落定后静止
// 画面铺开检查（借鉴 nutllwhy/hyperframes-motion-library）：落定时内容外接框太小 = 下半屏空着
const MIN_SPAN_Y = 0.55; // 纵向至少铺开内容区的 55%（第 1 课校准：空的两帧是 0.46、0.50，正常帧 ≥ 0.6）
const MIN_OCCUPANCY = 0.4;
// 字幕带（竖屏 1080×1920）：glow 的四角框住内容区 y 200–1160，字幕从 1180 起、最低到 1440。
// 内容伸出框就会压到字幕：check 时加 --caption-zone，在每帧结尾查文字有没有进这条带（字幕本身不算）
const CAPTION_BAND = { top: 1160, bottom: 1440, height: 1920 };
const PYTHON = join(SKILL_DIR, ".venv", "bin", "python");

const gsapVersion = () => JSON.parse(readFileSync(join(SKILL_DIR, "node_modules", "gsap", "package.json"), "utf8")).version;

function run(label, cmd, args, cwd) {
  console.log(`\n▸ ${label}`);
  try {
    execFileSync(cmd, args, { cwd, stdio: "inherit" });
  } catch {
    throw new Error(`「${label}」失败（${[basename(cmd), ...args].join(" ")}），修好后重跑 nv hf-build`);
  }
}

const node = (label, script, args, cwd) => run(label, process.execPath, [script, ...args], cwd);

/** hyperframes check 只在一个采样点上看到的遮挡会降成 ℹ；文字被盖住就是看不见，一律当错误 */
export function occludedText(output) {
  return output.split("\n").filter((l) => /\btext_occluded\b/.test(l)).map((l) => l.trim());
}

/** 跑 check：输出照常打印，同时收下来查遮挡 */
function runCheck(label, args, cwd) {
  console.log(`\n▸ ${label}`);
  const r = spawnSync(HF, args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  process.stdout.write(r.stdout ?? "");
  process.stderr.write(r.stderr ?? "");
  if (r.status !== 0) throw new Error(`「${label}」失败（hyperframes ${args.join(" ")}），修好后重跑 nv hf-build`);
  const hidden = occludedText(`${r.stdout}\n${r.stderr}`);
  if (hidden.length) throw new Error(`有文字被别的元素盖住（check 只给了提示级别，但画面上看不见）：\n  ${hidden.join("\n  ")}`);
}

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

/** 每帧结尾时刻 + 总时长 → hyperframes check 的 --caption-zone 参数（seek 是占总时长的比例）；没有帧返回 null */
export function captionZoneSpec(ends, total) {
  if (!ends.length || !(total > 0)) return null;
  const f = (x) => Number(x.toFixed(4));
  const seek = ends.map((t) => f(t / total)).join(",");
  return `x0=0;y0=${f(CAPTION_BAND.top / CAPTION_BAND.height)};x1=1;y1=${f(CAPTION_BAND.bottom / CAPTION_BAND.height)};severity=error;seek=${seek}`;
}

/** 越框检查的取样时刻：每帧中段 + 结尾前 SNAP_BEFORE_END 秒（有转场重叠时取在下一帧进场之前） */
export function boundsTimes(frames) {
  const r2 = (x) => Math.round(x * 100) / 100;
  return frames.flatMap((f, i) => {
    const end = Math.min(f.end, frames[i + 1]?.start ?? Infinity);
    return [r2((f.start + end) / 2), r2(end - SNAP_BEFORE_END)];
  });
}

/** 「干净画面」：隐藏底色、光晕、四角框、角标、进度条和字幕，关掉阴影和外发光（光晕可以越过框线），底改纯黑，剩下的全是内容 */
export function cleanIndex(html) {
  const css = `<style data-nv-bounds>html,body,#root{background:#000!important}`
    + `#el-captions,.kit-hud,.kit-kicker,.kit-progress,.kit-atmo,[id$="-ground"]{visibility:hidden!important}`
    + `*,*::before,*::after{box-shadow:none!important;text-shadow:none!important;filter:none!important}</style>`;
  return html.replace("</head>", `${css}\n</head>`);
}

function indexFrames(dir) {
  const html = readFileSync(join(dir, "index.html"), "utf8");
  return [...html.matchAll(/<div[^>]*data-composition-src="compositions\/frames\/[^"]+"[^>]*>/g)]
    .map((m) => {
      const start = Number(m[0].match(/data-start="([\d.]+)"/)?.[1]);
      return { start, end: start + Number(m[0].match(/data-duration="([\d.]+)"/)?.[1]) };
    })
    .filter((f) => Number.isFinite(f.end))
    .sort((a, b) => a.start - b.start);
}

/** 越框检查：截干净画面，交给 bounds.py 找伸出四角框、占了角标行的内容（录屏帧铺满全屏，跳过） */
function checkBounds(dir) {
  const html = readFileSync(join(dir, "index.html"), "utf8");
  if (!/data-width="1080"/.test(html) || !/data-height="1920"/.test(html)) return;
  if (!existsSync(PYTHON)) return console.log("\n▸ 越框检查\n  ⚠ 跳过：没有 .venv（见 references/setup.md）");
  const frames = indexFrames(dir);
  const sb = parseStoryboardFrames(readFileSync(join(dir, "STORYBOARD.md"), "utf8")).frames;
  const tmp = join(dir, ".media", "bounds");
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  for (const name of readdirSync(dir)) {
    if ([".media", "index.html", "renders", "snapshots"].includes(name)) continue;
    cpSync(join(dir, name), join(tmp, name), { recursive: true }); // HyperFrames 打包不跟随软链接目录，只能复制
  }
  writeFileSync(join(tmp, "index.html"), cleanIndex(html));
  const times = boundsTimes(frames);
  run(`越框检查（${frames.length} 帧 × 中段、结尾）`, HF, ["snapshot", ".", "--at", times.join(","), "--no-end"], tmp);
  const shots = readdirSync(join(tmp, "snapshots")).filter((f) => /^frame-\d+.*\.png$/.test(f))
    .sort((a, b) => Number(a.match(/^frame-(\d+)/)[1]) - Number(b.match(/^frame-(\d+)/)[1]));
  const items = shots.map((f, i) => {
    const s = sb[Math.floor(i / 2)];
    return { file: join(tmp, "snapshots", f), frame: s?.n ?? Math.floor(i / 2) + 1, kicker: s?.build?.kicker !== false, rec: !!s?.build?.rec, at: times[i] };
  }).filter((x) => !x.rec);
  const out = JSON.parse(execFileSync(PYTHON, [join(SKILL_DIR, "scripts", "bounds.py")], { input: JSON.stringify(items), encoding: "utf8" }));
  if (!out.length) return console.log("  ✓ 内容都在四角框里（录屏帧不查）");
  const NAMES = { bottom: "伸出框底（会压到字幕）", side: "伸出左右框外", kicker: "占了角标那一行" };
  for (const r of out) {
    const at = items.find((x) => x.file === r.file)?.at;
    for (const z of r.zones) console.log(`  ✗ 第 ${r.frame} 帧 t=${at}s：${NAMES[z.zone]}，范围 x ${z.box[0]}–${z.box[2]}、y ${z.box[1]}–${z.box[3]}（干净画面：${relative(dir, r.file)}）`);
  }
  throw new Error("有内容伸出四角框：调小 size、少放一项或把元素往上 / 往下挪，改 STORYBOARD 后重跑");
}

/** 竖屏 1080×1920 的工程才查字幕带；返回 check 要加的参数 */
function captionZoneArgs(dir) {
  const html = readFileSync(join(dir, "index.html"), "utf8");
  if (!/data-width="1080"/.test(html) || !/data-height="1920"/.test(html)) return [];
  const ends = [...html.matchAll(/<div[^>]*data-composition-src="compositions\/frames\/[^"]+"[^>]*>/g)]
    .map((m) => Number(m[0].match(/data-start="([\d.]+)"/)?.[1]) + Number(m[0].match(/data-duration="([\d.]+)"/)?.[1]))
    .filter(Number.isFinite);
  const spec = captionZoneSpec(frameEndTimes(dir), Math.max(...ends));
  return spec ? ["--caption-zone", spec] : [];
}

/**
 * 动画过程：每帧取入场、中段、落定前 HOLD_GAP 秒、落定四个时刻（借鉴 HyperFrames-RenderKit「看连续帧，不只看结果」）。
 * 后两张用来自动检查落定后还在不在动：静止的画面就是一张带进度条的图片。
 */
export function frameMotionTimes(dir) {
  const ends = frameEndTimes(dir);
  const html = readFileSync(join(dir, "index.html"), "utf8");
  const starts = [...html.matchAll(/<div[^>]*data-composition-src="compositions\/frames\/[^"]+"[^>]*>/g)]
    .map((m) => Number(m[0].match(/data-start="([\d.]+)"/)?.[1]))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const r2 = (x) => Math.round(x * 100) / 100;
  return starts.flatMap((start, i) => {
    const mid = r2((start + ends[i]) / 2);
    return [r2(start + MOTION_ENTRANCE), mid, Math.max(mid, r2(ends[i] - HOLD_GAP)), ends[i]];
  });
}

/** 纯函数：stillness.py 的结果 → 落定后几乎不动的帧 */
export function stillFrames(results) {
  return results.filter((r) => r.diff < MIN_HOLD_DIFF);
}

/** 纯函数：occupancy.py 的结果 → 内容铺得太少的帧 */
export function sparseFrames(results) {
  return results.filter((r) => r.spanY < MIN_SPAN_Y || r.occupancy < MIN_OCCUPANCY);
}

/** 截图按序号排（frame-07-at-…），不按文件名字母顺序 */
function snapshotFiles(dir) {
  const idx = (f) => Number(f.match(/^frame-(\d+)/)[1]);
  return readdirSync(join(dir, "snapshots")).filter((f) => /^frame-\d+.*\.png$/.test(f)).sort((a, b) => idx(a) - idx(b)).map((f) => join("snapshots", f));
}

function checkStillness(dir) {
  if (!existsSync(PYTHON)) return console.log("  ⚠ 跳过落定后动静检查：没有 .venv（见 references/setup.md）");
  const files = snapshotFiles(dir);
  const pairs = files.filter((_, i) => i % 4 >= 2); // 每帧四张里的后两张：落定前、落定
  let out;
  try {
    out = execFileSync(PYTHON, [join(SKILL_DIR, "scripts", "stillness.py"), ...pairs], { cwd: dir, encoding: "utf8" });
  } catch (err) {
    return console.log(`  ⚠ 落定后动静检查没跑成：${err.message.split("\n")[0]}`);
  }
  const still = stillFrames(out.trim().split("\n").map((l) => JSON.parse(l)));
  if (!still.length) return console.log("  ✓ 每帧落定后都还在动（缓推、录屏或持续的小动作）");
  for (const r of still) console.log(`  ⚠ 第 ${r.frame} 帧落定后完全静止：去掉 "camera": false 用默认缓推，或加一个持续的小动作（数字在数、线在画、圈在抖）；光晕呼吸太轻，不算在动`);
}

function checkOccupancy(dir) {
  if (!existsSync(PYTHON)) return console.log("  ⚠ 跳过铺开检查：没有 .venv（见 references/setup.md）");
  const files = snapshotFiles(dir);
  let out;
  try {
    out = execFileSync(PYTHON, [join(SKILL_DIR, "scripts", "occupancy.py"), ...files], { cwd: dir, encoding: "utf8" });
  } catch (err) {
    return console.log(`  ⚠ 铺开检查没跑成：${err.message.split("\n")[0]}`);
  }
  const sparse = sparseFrames(out.trim().split("\n").map((l) => JSON.parse(l)));
  if (!sparse.length) return console.log("  ✓ 每帧内容都铺开了（纵向 ≥ 55%）");
  for (const r of sparse) console.log(`  ⚠ ${basename(r.file)}：内容只铺了纵向 ${Math.round(r.spanY * 100)}%，下半屏偏空（把元素往下排开、加一个和口播有关的图形，或适当放大字号；别伸出四角框，冲击帧、大字帧可以不管）`);
}

function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return htmlFiles(p);
    return e.name.endsWith(".html") ? [p] : [];
  });
}

/** index.html 和 compositions/ 下所有 HTML：CDN 上的 GSAP 换成本地 compositions/kit/gsap.min.js */
export function localizeProject(dir, gsapVersion) {
  const files = [join(dir, "index.html"), ...(existsSync(join(dir, "compositions")) ? htmlFiles(join(dir, "compositions")) : [])].filter(existsSync);
  const result = { files: 0, tags: 0, mismatched: [] };
  for (const f of files) {
    const r = localizeGsap(readFileSync(f, "utf8"), gsapVersion);
    if (!r.count) continue;
    writeFileSync(f, r.html);
    result.files++;
    result.tags += r.count;
    for (const v of r.mismatched) if (!result.mismatched.includes(v)) result.mismatched.push(v);
  }
  return result;
}

function snapshotSheet(dir, motion) {
  const times = motion ? frameMotionTimes(dir) : frameEndTimes(dir);
  if (!times.length) throw new Error("index.html 里没找到帧，无法截图");
  rmSync(join(dir, "snapshots"), { recursive: true, force: true });
  run(`截图（${times.length} 帧）`, HF, ["snapshot", ".", "--at", times.join(","), "--no-end"], dir);
  const cols = motion ? 8 : Math.min(7, times.length); // 动画过程：每行两帧，每帧「入场 / 中段 / 落定前 / 落定」
  execFileSync("ffmpeg", ["-v", "error", "-y", "-pattern_type", "glob", "-i", "snapshots/frame-*.png",
    "-vf", `scale=300:-1,tile=${cols}x${Math.ceil(times.length / cols)}:padding=6:color=0x444444`, "-frames:v", "1", "snapshots/sheet.jpg"], { cwd: dir });
  console.log(motion
    ? "  ✓ snapshots/sheet.jpg（每帧四张：入场 / 中段 / 落定前 / 落定，看元素是否按时出现、过程中有没有穿帮）"
    : "  ✓ snapshots/sheet.jpg（每帧结尾一张，看图检查断行、遮挡、安全区）");
  if (motion) checkStillness(dir);
  else checkOccupancy(dir);
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
  node("同步帧时长", join(FE, "audio.mjs"), SYNC_ARGS, dir);
  node("帧模板（STORYBOARD 的 build）", self("hf-frames"), [dir], dir);
  node("音效", self("hf-sfx"), [dir], dir);
  console.log("\n▸ 素材");
  stageAssets(dir);
  node("中文字体", self("hf-fonts"), [dir], dir);
  node("字幕", join(FE, "captions.mjs"), CAPTION_ARGS, dir);
  node("组装 index.html", join(FE, "assemble-index.mjs"), [...sb, "--hyperframes", "."], dir);
  node("转场", join(FE, "transitions.mjs"), ["inject", ...sb, "--hyperframes", "."], dir);
  node("转场校验", join(FE, "transitions.mjs"), ["verify", ...sb, "--index", "./index.html"], dir);
  console.log("\n▸ GSAP 换成本地文件（不走 CDN）");
  const loc = localizeProject(dir, gsapVersion());
  console.log(loc.tags ? `  ✓ ${loc.files} 个文件、${loc.tags} 处` : "  ✓ 已经都是本地文件");
  if (loc.mismatched.length) console.log(`  ⚠ 有文件写的是 GSAP ${loc.mismatched.join("、")}，本地是 ${gsapVersion()}，已统一用本地版本`);
  if (check) {
    run("lint", HF, ["lint", "."], dir);
    // 两项检查都跑完再报错，一次看到所有问题
    const errors = [];
    for (const step of [() => runCheck("check（含字幕带：内容不能伸出四角框压到字幕）", ["check", ".", ...captionZoneArgs(dir)], dir), () => checkBounds(dir)]) {
      try {
        step();
      } catch (err) {
        errors.push(err.message);
      }
    }
    if (errors.length) throw new Error(errors.join("\n✗ "));
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
