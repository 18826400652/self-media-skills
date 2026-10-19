import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeFrames, ffmpegFramesArgs, SAMPLE } from "../scripts/lib/measure.mjs";

const W = 4, H = 2, N = W * H;
const f = (v) => Buffer.alloc(N, v);
// 8 帧：0-3 静止，4-5 变化，6-7 又静止
const buf = Buffer.concat([f(0), f(0), f(0), f(0), f(255), f(255), f(0), f(0)]);

test("analyzeFrames：相邻 1 秒差 + 2 秒窗口，算静态率 / 变化事件 / 最长静止", () => {
  const r = analyzeFrames(buf, { ...SAMPLE, width: W, height: H, fps: 1, window: 2, threshold: 0.01 });
  assert.equal(r.frames, 8);
  assert.equal(r.windows, 6);
  assert.equal(r.changedWindows, 4);
  assert.equal(r.staticRatio, 2 / 6);
  assert.equal(r.changeEvents, 2);
  assert.equal(r.longestStill, 2);
  assert.equal(Math.round(r.changeRate), 15);
});

test("analyzeFrames：帧数不够、全静止时不出 NaN", () => {
  const r = analyzeFrames(Buffer.alloc(N * 2), { ...SAMPLE, width: W, height: H, fps: 1, window: 2 });
  assert.deepEqual([r.windows, r.changedWindows, r.staticRatio], [0, 0, 1]);
  assert.equal(r.changeRate, 0);
  assert.equal(r.longestStill, 0);
});

test("ffmpegFramesArgs：只取内容区，字幕带和栏目标签不参与", () => {
  assert.deepEqual(ffmpegFramesArgs("/x.mp4"), [
    "-v", "error", "-i", "/x.mp4",
    "-vf", "fps=1,crop=960:920:60:230,scale=48:46,format=gray",
    "-f", "rawvideo", "-",
  ]);
});
