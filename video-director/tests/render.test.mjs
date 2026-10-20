// vd render 的输出文件名
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { main, renderTarget } from "../scripts/render.mjs";

test("renderTarget：视频目录在作品下（父目录带编号）→ 用作品名", () => {
  assert.equal(renderTarget("/p/04-作品/系列/02-导演做法/抖音"), "/p/04-作品/系列/02-导演做法/抖音/renders/02-导演做法.mp4");
});

test("renderTarget：独立的视频目录 → 用目录名", () => {
  assert.equal(renderTarget("/tmp/demo"), "/tmp/demo/renders/demo.mp4");
});

test("renderTarget：--sample 出风格样片 renders/sample.mp4（kv 不当正式成片）", () => {
  assert.equal(renderTarget("/p/04-作品/系列/02-导演做法/抖音", { sample: true }), "/p/04-作品/系列/02-导演做法/抖音/renders/sample.mp4");
});

test("vd render：hyperframes 没装时打印安装提示并返回 1", () => {
  const errs = [];
  const orig = console.error;
  console.error = (m) => errs.push(m);
  try {
    const missing = () => { throw new Error("video-director 还没装 hyperframes：cd /x && npm ci（或 st install --deps）"); };
    assert.equal(main(["/tmp/vd-render-missing"], { requireBin: missing }), 1);
  } finally { console.error = orig; }
  assert.match(errs.join("\n"), /还没装 hyperframes.*npm ci/);
});

const LOG = '{\n  "input_i" : "-21.80",\n  "input_tp" : "-3.40",\n  "input_lra" : "6.20",\n  "input_thresh" : "-32.90",\n  "target_offset" : "0.10"\n}';

test("parseLoudnorm：从 ffmpeg 的 JSON 日志读测量值", async () => {
  const { parseLoudnorm } = await import("../scripts/render.mjs");
  assert.deepEqual(parseLoudnorm(LOG), { input_i: -21.8, input_tp: -3.4, input_lra: 6.2, input_thresh: -32.9, target_offset: 0.1 });
  assert.equal(parseLoudnorm("nope"), null);
});

test("loudnormFilter / applyArgs：两遍 linear，视频流直接复制", async () => {
  const { applyArgs, loudnormFilter, parseLoudnorm } = await import("../scripts/render.mjs");
  const m = parseLoudnorm(LOG);
  assert.match(loudnormFilter(m), /measured_I=-21\.8:measured_TP=-3\.4:measured_LRA=6\.2:measured_thresh=-32\.9:offset=0\.1:linear=true/);
  const args = applyArgs("/x.mp4", "F", "/x.norm.mp4");
  assert.ok(args.includes("-c:v"));
  assert.ok(args.includes("copy"));
  assert.ok(args.includes("-af"));
  assert.equal(args.at(-1), "/x.norm.mp4");
});

test("vd render：成片已出、verify 通过时，measure 失败只打 ⚠，不算渲染失败", () => {
  const dir = mkdtempSync(join(tmpdir(), "vd-render-"));
  const calls = [];
  const run = (cmd, args) => {
    calls.push(args.find((a) => /(verify|measure)\.mjs$/.test(a)) ?? cmd);
    if (cmd === "ffmpeg") return { status: 1, stderr: "" };
    if (args.some((a) => a.endsWith("measure.mjs"))) return { status: 1 };
    return { status: 0 };
  };
  const warns = [];
  const orig = console.warn;
  console.warn = (m) => warns.push(m);
  try {
    assert.equal(main([dir], { requireBin: () => "hf", run }), 0);
  } finally { console.warn = orig; }
  assert.ok(calls.some((c) => c.endsWith("measure.mjs")), "要跑 measure");
  assert.match(warns.join("\n"), /注意力指标没量出来/);
});

test("vd render：verify 失败仍返回非 0", () => {
  const dir = mkdtempSync(join(tmpdir(), "vd-render-"));
  const run = (cmd, args) => (cmd === "ffmpeg" ? { status: 1, stderr: "" } : { status: args.some((a) => a.endsWith("verify.mjs")) ? 1 : 0 });
  const orig = console.warn;
  console.warn = () => {};
  try {
    assert.equal(main([dir], { requireBin: () => "hf", run }), 1);
  } finally { console.warn = orig; }
});

import { spawnSync as spawnSync2 } from "node:child_process";
import { FFMPEG_WRAPPER } from "../scripts/render.mjs";
import { project } from "./helpers.mjs";

test("ffmpeg 包装：-vf 里的 flags=neighbor 加上 accurate_rnd（右边 8 列不再变黑），已经有的不重复加，其他参数原样", () => {
  const r = spawnSync2(FFMPEG_WRAPPER, ["-i", "-", "-vf", "scale=in_range=pc:flags=neighbor,format=gbrp,scale=out_range=tv:flags=neighbor+accurate_rnd", "out.mp4"], { encoding: "utf8", env: { ...process.env, VD_REAL_FFMPEG: "/bin/echo" } });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), "-i - -vf scale=in_range=pc:flags=neighbor+accurate_rnd,format=gbrp,scale=out_range=tv:flags=neighbor+accurate_rnd out.mp4");
});

test("vd render：调 hyperframes 时 HYPERFRAMES_FFMPEG_PATH 指向包装脚本；用户自己设过的不覆盖", async () => {
  const { main } = await import("../scripts/render.mjs");
  const dir = project({ "抖音/x": "" });
  const seen = [];
  const run = (cmd, args, opts) => { seen.push(opts?.env?.HYPERFRAMES_FFMPEG_PATH); return { status: 1 }; };
  const orig = process.env.HYPERFRAMES_FFMPEG_PATH;
  try {
    delete process.env.HYPERFRAMES_FFMPEG_PATH;
    main([join(dir, "抖音")], { requireBin: () => "hf", run });
    process.env.HYPERFRAMES_FFMPEG_PATH = "/my/ffmpeg";
    main([join(dir, "抖音")], { requireBin: () => "hf", run });
  } finally { if (orig === undefined) delete process.env.HYPERFRAMES_FFMPEG_PATH; else process.env.HYPERFRAMES_FFMPEG_PATH = orig; }
  assert.deepEqual(seen, [FFMPEG_WRAPPER, "/my/ffmpeg"]);
});

test("响度标准化后声音和画面一样长（loudnorm 会把声音补到整秒，verify 就会报少帧）", async () => {
  const { normalizeAudio } = await import("../scripts/render.mjs");
  const dir = mkdtempSync(join(tmpdir(), "vd-norm-"));
  const file = join(dir, "x.mp4");
  const make = spawnSync2("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=gray:s=320x240:r=30:d=29.93", "-f", "lavfi", "-i", "sine=f=440:d=29.93:sample_rate=48000", "-c:v", "libx264", "-c:a", "aac", file]);
  assert.equal(make.status, 0, String(make.stderr));
  assert.equal(normalizeAudio(file), true);
  const probe = (sel) => Number(spawnSync2("ffprobe", ["-v", "error", "-select_streams", sel, "-show_entries", "stream=duration", "-of", "csv=p=0", file], { encoding: "utf8" }).stdout);
  assert.ok(Math.abs(probe("a:0") - probe("v:0")) < 0.03, `声音 ${probe("a:0")} 秒，画面 ${probe("v:0")} 秒`);
});
