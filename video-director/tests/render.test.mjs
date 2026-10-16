// vd render 的输出文件名
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderTarget } from "../scripts/render.mjs";

test("renderTarget：视频目录在作品下（父目录带编号）→ 用作品名", () => {
  assert.equal(renderTarget("/p/04-作品/系列/02-导演做法/抖音"), "/p/04-作品/系列/02-导演做法/抖音/renders/02-导演做法.mp4");
});

test("renderTarget：独立的视频目录 → 用目录名", () => {
  assert.equal(renderTarget("/tmp/demo"), "/tmp/demo/renders/demo.mp4");
});

test("renderTarget：--sample 出风格样片 renders/sample.mp4（kv 不当正式成片）", () => {
  assert.equal(renderTarget("/p/04-作品/系列/02-导演做法/抖音", { sample: true }), "/p/04-作品/系列/02-导演做法/抖音/renders/sample.mp4");
});
