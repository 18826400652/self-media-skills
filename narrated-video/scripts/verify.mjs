#!/usr/bin/env node
// 用法：nv verify <成片.mp4> [--project <工程目录>]
//
// 渲染出的成片自检（思路借鉴 HyperFrames-RenderKit 的 final-file verification）：
// 「出了文件」不等于「渲染成功」，逐项核对：
//   - 有画面和声音两路流，画面是 H.264，尺寸、帧率符合预期
//   - 帧数 = 时长 × 帧率（没有丢帧、没有多出来的帧）
//   - 声音和画面一样长，不是静音，没有爆音（峰值不超过 -0.5 dB）
//   - 和工程 index.html 的总时长一致（给了 --project 或成片在 <工程>/renders/ 下时）
//   - 没有超过 0.5 秒的纯黑画面（通常是素材没加载或某一帧空白）
// 有 ✗ 时退出码为 1。nv render 渲染完会自动运行。
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { isMain } from "./lib/is-main.mjs";

const PEAK_MAX_DB = -0.5; // 峰值超过这个就可能爆音
const SILENT_MEAN_DB = -45; // 平均音量低于这个基本等于没声音
const DURATION_TOLERANCE = 0.1; // 秒
const BLACK_MIN_SECONDS = 0.5;

const ffprobeJson = (args) => JSON.parse(execFileSync("ffprobe", ["-v", "error", "-of", "json", ...args], { encoding: "utf8" }));

/** 纯函数：探测结果 → 检查项（便于测试） */
export function evaluate({ streams, packets, duration, volume, expected, blackSpans }) {
  const items = [];
  const ok = (msg) => items.push({ level: "✓", msg });
  const bad = (msg) => items.push({ level: "✗", msg });
  const warn = (msg) => items.push({ level: "⚠", msg });
  const v = streams.find((s) => s.codec_type === "video");
  const a = streams.find((s) => s.codec_type === "audio");
  if (!v) return [{ level: "✗", msg: "没有画面流" }];
  const [num, den] = String(v.avg_frame_rate || "0/1").split("/").map(Number);
  const fps = den ? num / den : 0;
  if (v.codec_name !== "h264") bad(`画面编码是 ${v.codec_name}，平台要求 H.264`);
  if (expected.width && (v.width !== expected.width || v.height !== expected.height)) bad(`尺寸 ${v.width}×${v.height}，应为 ${expected.width}×${expected.height}`);
  else ok(`画面 ${v.width}×${v.height} · ${v.codec_name} · ${Math.round(fps * 100) / 100} fps`);
  const wantFrames = Math.round(duration * fps);
  if (Math.abs(packets - wantFrames) > 1) bad(`帧数 ${packets}，按时长应为 ${wantFrames}（丢帧或多帧）`);
  else ok(`帧数 ${packets}（${duration.toFixed(2)} 秒）`);
  if (expected.duration && Math.abs(duration - expected.duration) > DURATION_TOLERANCE) bad(`时长 ${duration.toFixed(2)} 秒，工程是 ${expected.duration} 秒`);
  else if (expected.duration) ok("时长和工程一致");
  if (!a) bad("没有声音流（配音丢了）");
  else {
    const aDur = Number(a.duration);
    if (Number.isFinite(aDur) && Math.abs(aDur - duration) > DURATION_TOLERANCE) warn(`声音 ${aDur.toFixed(2)} 秒，画面 ${duration.toFixed(2)} 秒，长度不一致`);
    if (volume.mean < SILENT_MEAN_DB) bad(`平均音量 ${volume.mean} dB，基本没有声音`);
    else if (volume.max > PEAK_MAX_DB) warn(`峰值 ${volume.max} dB，可能爆音`);
    else ok(`声音：平均 ${volume.mean} dB，峰值 ${volume.max} dB`);
  }
  if (blackSpans.length) warn(`有 ${blackSpans.length} 段纯黑画面：${blackSpans.map(([s, e]) => `${s.toFixed(1)}–${e.toFixed(1)}s`).join("、")}`);
  return items;
}

/** 运行 ffmpeg，返回它的日志（统计结果都写在 stderr 里） */
const ffmpegLog = (args) => spawnSync("ffmpeg", ["-v", "info", ...args, "-f", "null", "-"], { encoding: "utf8" }).stderr ?? "";

function probeVolume(file) {
  const log = ffmpegLog(["-i", file, "-vn", "-af", "volumedetect"]);
  const pick = (k) => Number(log.match(new RegExp(`${k}:\\s*(-?[\\d.]+) dB`))?.[1] ?? -91);
  return { mean: pick("mean_volume"), max: pick("max_volume") };
}

function probeBlack(file) {
  const log = ffmpegLog(["-i", file, "-vf", `blackdetect=d=${BLACK_MIN_SECONDS}:pix_th=0.05`, "-an"]);
  return [...log.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
}

/** 工程 index.html 根合成的尺寸和时长 */
function projectExpectation(dir) {
  const index = join(dir, "index.html");
  if (!existsSync(index)) return {};
  const root = readFileSync(index, "utf8").match(/<div[^>]*data-composition-id="main"[^>]*>/)?.[0] ?? "";
  const num = (k) => Number(root.match(new RegExp(`data-${k}="([\\d.]+)"`))?.[1]) || undefined;
  return { width: num("width"), height: num("height"), duration: num("duration") };
}

function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--project");
  if (!file || !existsSync(file)) {
    console.error("用法：nv verify <成片.mp4> [--project <工程目录>]");
    process.exit(1);
  }
  const abs = resolve(file);
  const pIdx = args.indexOf("--project");
  const project = pIdx >= 0 ? resolve(args[pIdx + 1]) : basename(dirname(abs)) === "renders" ? dirname(dirname(abs)) : null;
  const info = ffprobeJson(["-show_streams", "-show_format", abs]);
  const packets = Number(ffprobeJson(["-select_streams", "v:0", "-count_packets", "-show_entries", "stream=nb_read_packets", abs]).streams[0].nb_read_packets);
  const items = evaluate({
    streams: info.streams,
    packets,
    duration: Number(info.format.duration),
    volume: probeVolume(abs),
    expected: project ? projectExpectation(project) : {},
    blackSpans: probeBlack(abs),
  });
  console.log(`成片检查：${abs}`);
  for (const { level, msg } of items) console.log(`  ${level} ${msg}`);
  const fails = items.filter((i) => i.level === "✗").length;
  console.log(fails ? `✗ ${fails} 项不合格` : "✓ 成片检查通过");
  process.exitCode = fails ? 1 : 0;
}

if (isMain(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  }
}
