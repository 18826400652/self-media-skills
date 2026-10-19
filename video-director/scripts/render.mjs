// vd render <视频目录> [--sample] [hyperframes render 的其他参数]
// 渲染到 <视频目录>/renders/，完成后：响度标准化 → verify → measure（写 measure.json）。
// 视频目录是作品下的平台子目录（如 04-作品/<系列>/03-周报/抖音，成片叫 03-周报.mp4）时用作品名命名；--sample 出 renders/sample.mp4（风格样片）。
import { spawnSync } from "node:child_process";
import { mkdirSync, renameSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { requireHf } from "./lib/hyperframes.mjs";
import { isMain } from "./lib/is-main.mjs";

const SKILL_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

export function renderTarget(dir, { sample = false } = {}) {
  if (sample) return join(dir, "renders", "sample.mp4");
  const parent = basename(dirname(dir));
  const name = /^[0-9]+-/.test(parent) ? parent : basename(dir);
  return join(dir, "renders", `${name}.mp4`);
}

/** 从 ffmpeg 的 loudnorm 日志里读第一遍测量值；读不到返回 null */
export function parseLoudnorm(stderr) {
  const m = String(stderr ?? "").match(/\{[\s\S]*?"input_i"[\s\S]*?\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    const out = { input_i: Number(j.input_i), input_tp: Number(j.input_tp), input_lra: Number(j.input_lra), input_thresh: Number(j.input_thresh), target_offset: Number(j.target_offset) };
    return Object.values(out).every(Number.isFinite) ? out : null;
  } catch { return null; }
}

/** 第二遍：用第一遍的测量值做 linear，避免动态压缩把人声忽大忽小 */
export function loudnormFilter(m) {
  return `loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true:print_format=summary`;
}

export function applyArgs(file, filter, out) {
  return ["-y", "-hide_banner", "-loglevel", "warning", "-i", file, "-c:v", "copy", "-af", filter, "-ar", "48000", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out];
}

/** 两遍 loudnorm；失败只打 ⚠，保留原片（成片已经渲染出来了，不能因为混音失败丢掉） */
export function normalizeAudio(file, { run = spawnSync } = {}) {
  const probe = run("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-vn", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"], { encoding: "utf8" });
  const m = probe.status === 0 ? parseLoudnorm(probe.stderr) : null;
  if (!m) {
    console.warn("⚠ 响度标准化跳过（原片保留）：读不到响度测量值");
    return false;
  }
  const tmp = file.replace(/\.mp4$/i, "") + ".norm.mp4";
  const r = run("ffmpeg", applyArgs(file, loudnormFilter(m), tmp), { stdio: "inherit" });
  if (r.status !== 0) {
    console.warn(`⚠ 响度标准化失败（原片保留）：ffmpeg 返回 ${r.status ?? "?"}`);
    return false;
  }
  renameSync(tmp, file);
  return true;
}

export function main(argv, { requireBin = requireHf, run = spawnSync } = {}) {
  if (!argv[0] || argv[0].startsWith("--")) {
    console.error("用法：vd render <视频目录> [--sample] [参数]");
    return 2;
  }
  let hf;
  try { hf = requireBin(); } catch (err) { console.error(`✗ ${err.message}`); return 1; }
  const dir = resolve(argv[0]);
  const rest = argv.slice(1);
  const sample = rest.includes("--sample");
  const out = renderTarget(dir, { sample });
  mkdirSync(join(dir, "renders"), { recursive: true });
  const r = spawnSync(hf, ["render", dir, "-o", out, ...rest.filter((a) => a !== "--sample")], { stdio: "inherit" });
  if (r.status !== 0) return r.status ?? 1;
  normalizeAudio(out, { run });
  const verified = spawnSync(process.execPath, [join(SKILL_DIR, "scripts/verify.mjs"), out, "--project", dir], { stdio: "inherit" }).status ?? 1;
  const measured = spawnSync(process.execPath, [join(SKILL_DIR, "scripts/measure.mjs"), out, "--out", join(dir, "measure.json")], { stdio: "inherit" }).status ?? 1;
  return verified || measured;
}

if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2));
