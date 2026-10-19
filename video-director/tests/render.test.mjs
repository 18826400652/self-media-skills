// vd render 的输出文件名
import assert from "node:assert/strict";
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
