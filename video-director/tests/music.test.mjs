import assert from "node:assert/strict";
import { test } from "node:test";
import { parseResolved, pickBeat, resolveMusic } from "../scripts/lib/music.mjs";
import { project } from "./helpers.mjs";

const BEATS = [{ time: 0.007, strength: 1 }, { time: 14.0, strength: 0.6 }, { time: 16.596, strength: 0.857 }, { time: 17.0, strength: 0.857 }, { time: 29.5, strength: 1 }];

test("pickBeat：落在可用范围里最强的节拍，同强度取最早；mediaStart = 节拍 - 重拍时间", () => {
  const r = pickBeat(BEATS, 13.55, 14.5, 30);
  assert.equal(r.beat.time, 16.596);
  assert.equal(r.mediaStart, 3.046);
});

test("pickBeat 无候选返回 null（配乐太短或重拍太靠后）", () => {
  assert.equal(pickBeat(BEATS, 13.55, 63.6, 30), null);
  assert.equal(pickBeat([], 1, 5, 30), null);
});

test("parseResolved：从 media-use 输出取路径；没有就是 null", () => {
  assert.equal(parseResolved("resolved bgm_001 → .media/audio/bgm/bgm_001.wav (bgm, 30s)\n"), ".media/audio/bgm/bgm_001.wav");
  assert.equal(parseResolved("error: bgm needs the heygen CLI"), null);
});

test("resolveMusic 失败时返回 null（未登录、搜不到、网络失败都不阻塞出片）", () => {
  const dir = project({ "index.html": "" });
  const fail = () => ({ status: 1, stdout: "", stderr: "error: bgm needs the heygen CLI" });
  assert.equal(resolveMusic(dir, "lo-fi", "0.8.143", fail), null);
});

test("resolveMusic：已有 assets/audio/bgm.* 时不再调用曲库", () => {
  const dir = project({ "assets/audio/bgm.mp3": "x" });
  const never = () => { throw new Error("不应调用"); };
  assert.equal(resolveMusic(dir, "lo-fi", "0.8.143", never), "assets/audio/bgm.mp3");
});
