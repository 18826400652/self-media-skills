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
