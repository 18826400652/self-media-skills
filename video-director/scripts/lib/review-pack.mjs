// 评审素材包：给独立评审员看的总览图、关键时刻原尺寸帧、动作前后连拍条、规格（时长、尺寸、响度）
// 抽帧做法来自 mg-styles-15 rubric.md（MIT，https://github.com/Vincentwei1021/mg-styles-15）
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join } from "node:path";
import { probeLoudness } from "./loudness.mjs";

const END_GAP = 0.04; // 最后一帧取在片尾前这么多秒（正好在片尾取不到帧）
const STRIP_SPAN = 0.3;
const STRIP_STEP = 0.1;
const r2 = (x) => Math.round(x * 100) / 100;

/** 要抽哪些帧：总览每 every 秒一张 + 末帧；每个 at 一条 ±0.3 秒、每 0.1 秒的连拍 */
export function packPlan({ duration, every, at }) {
  const last = r2(duration - END_GAP);
  const contactTimes = [];
  for (let t = 0; t < last - 0.01; t = r2(t + every)) contactTimes.push(t);
  contactTimes.push(last);
  const strips = at.filter((a) => a < duration).map((a) => {
    const times = [];
    for (let t = r2(a - STRIP_SPAN); t <= a + STRIP_SPAN + 1e-9; t = r2(t + STRIP_STEP)) if (t >= 0 && t <= last) times.push(t);
    return { at: a, times };
  });
  return { contactTimes, strips };
}

export function parseArgs(argv) {
  const [file, ...rest] = argv;
  const val = (k) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : undefined; };
  const name = basename(file, extname(file));
  return {
    file,
    every: Number(val("--every") ?? 0.5),
    at: val("--at") ? val("--at").split(",").map(Number).filter(Number.isFinite) : [],
    out: val("--out") ?? join(dirname(file), "review", name),
  };
}

function probe(file, run) {
  const r = run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate:format=duration", "-of", "json", file], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`读不了视频 ${file}：${r.stderr}`);
  const j = JSON.parse(r.stdout);
  const [n, d] = j.streams[0].r_frame_rate.split("/").map(Number);
  return { duration: Number(j.format.duration), width: j.streams[0].width, height: j.streams[0].height, fps: r2(n / d) };
}

function grab(file, t, out, scale, run) {
  const r = run("ffmpeg", ["-v", "error", "-y", "-ss", String(t), "-i", file, "-frames:v", "1", ...(scale ? ["-vf", `scale=${scale}:-1`] : []), out], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`取不到 ${t} 秒的帧：${r.stderr}`);
}

function tile(pattern, count, cols, out, run) {
  const r = run("ffmpeg", ["-v", "error", "-y", "-pattern_type", "glob", "-i", pattern, "-vf", `tile=${cols}x${Math.ceil(count / cols)}:padding=4:color=0x333333`, "-frames:v", "1", out], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`拼图失败：${r.stderr}`);
}

/** 出素材包，返回输出目录 */
export function reviewPack({ file, every, at, out }, run = spawnSync) {
  const spec = probe(file, run);
  const plan = packPlan({ duration: spec.duration, every, at });
  mkdirSync(join(out, "full"), { recursive: true });
  const tmp = mkdtempSync(join(tmpdir(), "vd-review-"));
  try {
    plan.contactTimes.forEach((t, i) => grab(file, t, join(tmp, `c${String(i).padStart(4, "0")}.jpg`), 270, run));
    tile(join(tmp, "c*.jpg"), plan.contactTimes.length, 8, join(out, "contact.jpg"), run);
    for (const s of plan.strips) {
      grab(file, s.at, join(out, "full", `${s.at}.png`), null, run);
      const dir = join(tmp, `s${s.at}`);
      mkdirSync(dir);
      s.times.forEach((t, i) => grab(file, t, join(dir, `${i}.jpg`), 360, run));
      tile(join(dir, "*.jpg"), s.times.length, s.times.length, join(out, `strip-${s.at}.jpg`), run);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  writeFileSync(join(out, "spec.json"), JSON.stringify({ ...spec, loudness: probeLoudness(file, run), contact: { every, frames: plan.contactTimes.length }, strips: plan.strips.map((s) => s.at) }, null, 2) + "\n");
  return out;
}
