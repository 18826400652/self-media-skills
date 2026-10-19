#!/usr/bin/env node
// vd measure <成片.mp4> [--json] [--out 文件]
// 量成片的注意力指标：时长、内容区静态率、变化率、最长静止、响度。
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { analyzeFrames, ffmpegFramesArgs } from "./lib/measure.mjs";
import { probeLoudness } from "./lib/loudness.mjs";
import { isMain } from "./lib/is-main.mjs";

export function probeDuration(file, run = spawnSync) {
  const r = run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file], { encoding: "utf8" });
  const d = Number(String(r.stdout ?? "").trim());
  if (r.status !== 0 || !Number.isFinite(d) || d <= 0) throw new Error(`读不到时长：${file}`);
  return d;
}

export function measure(file, { run = spawnSync } = {}) {
  const duration = probeDuration(file, run);
  const dec = run("ffmpeg", ffmpegFramesArgs(file), { maxBuffer: 64 * 1024 * 1024 });
  if (dec.status !== 0 || !dec.stdout?.length) {
    const tail = String(dec.stderr ?? "").trim().split("\n").at(-1) ?? "";
    throw new Error(`读不到画面帧：${file}（${tail}）`);
  }
  return { at: new Date().toISOString(), file, duration, video: analyzeFrames(dec.stdout), loudness: probeLoudness(file, run) };
}

const n1 = (x) => (Number.isFinite(x) ? Number(x.toFixed(1)).toString() : "—");

export function format(r) {
  const v = r.video;
  const loud = r.loudness ? `${n1(r.loudness.integrated)} LUFS / TP ${n1(r.loudness.truePeak)} dB` : "—";
  return [
    `时长 ${n1(r.duration)}s`,
    `静态率 ${Math.round(v.staticRatio * 100)}%`,
    `变化 ${n1(v.changeRate)} 次/分（${v.changeEvents} 次）`,
    `最长静止 ${n1(v.longestStill)}s`,
    `响度 ${loud}`,
  ].join("\n");
}

function main(argv) {
  const file = argv.find((a) => !a.startsWith("--") && argv[argv.indexOf(a) - 1] !== "--out");
  if (!file) { console.error("用法：vd measure <成片.mp4> [--json] [--out 文件]"); return 2; }
  const out = argv.includes("--out") ? argv[argv.indexOf("--out") + 1] : null;
  try {
    const r = measure(resolve(file));
    if (out) writeFileSync(out, JSON.stringify(r, null, 2) + "\n");
    if (argv.includes("--json")) console.log(JSON.stringify(r, null, 2));
    else console.log(format(r));
    return 0;
  } catch (err) {
    console.error(`✗ ${err.message}`);
    return 1;
  }
}

if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2));
