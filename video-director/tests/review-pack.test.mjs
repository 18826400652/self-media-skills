import assert from "node:assert/strict";
import { test } from "node:test";
import { packPlan, parseArgs } from "../scripts/lib/review-pack.mjs";

test("packPlan：总览每 0.5 秒一张，最后补一张末帧（3 秒 → 7 张）", () => {
  assert.deepEqual(packPlan({ duration: 3, every: 0.5, at: [] }).contactTimes, [0, 0.5, 1, 1.5, 2, 2.5, 2.96]);
});

test("packPlan：每个 --at 一条连拍，前后各 0.3 秒、每 0.1 秒一帧，不超出片子", () => {
  const { strips } = packPlan({ duration: 3, every: 1, at: [1.2, 0.1] });
  assert.deepEqual(strips[0], { at: 1.2, times: [0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5] });
  assert.deepEqual(strips[1], { at: 0.1, times: [0, 0.1, 0.2, 0.3, 0.4] });
});

test("packPlan：超出片长的 --at 丢掉", () => {
  assert.deepEqual(packPlan({ duration: 3, every: 1, at: [5] }).strips, []);
});

test("parseArgs：--every、--at（逗号隔开）、--out；缺省每 0.5 秒、输出在视频旁边的 review/<名字>/", () => {
  assert.deepEqual(parseArgs(["/a/b/片.mp4", "--every", "1", "--at", "1.2,3.4", "--out", "/o"]), { file: "/a/b/片.mp4", every: 1, at: [1.2, 3.4], out: "/o" });
  assert.deepEqual(parseArgs(["/a/b/片.mp4"]), { file: "/a/b/片.mp4", every: 0.5, at: [], out: "/a/b/review/片" });
});
