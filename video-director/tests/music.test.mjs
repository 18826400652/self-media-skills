import assert from "node:assert/strict";
import { test } from "node:test";
import { addMusic, alignMusic, parseResolved, pickBeat, resolveMusic } from "../scripts/lib/music.mjs";
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

test("alignMusic：beats 命令成功但没写出节拍文件时，退回从头播放（返回 0），不抛错", () => {
  const dir = project({ "assets/audio/bgm.wav": "x" });
  const ok = () => ({ status: 0, stdout: "", stderr: "" });
  assert.equal(alignMusic(dir, { src: "assets/audio/bgm.wav", drop: 10, duration: 20 }, "0.8.143", ok), 0);
});

test("addMusic：对位或避让失败时去掉配乐继续出片，并给出警告", () => {
  const calls = [];
  const deps = {
    resolveMusic: () => "assets/audio/bgm.wav",
    alignMusic: () => 1.5,
    carve: () => { throw new Error("人声避让失败：boom"); },
    assemble: (music) => calls.push(music),
  };
  const warns = [];
  const r = addMusic({ intent: "x", drop: 10, volume: 0.4 }, deps, (m) => warns.push(m));
  assert.equal(r, null);
  assert.equal(calls.at(-1), null, "最后一次总装必须不带配乐");
  assert.match(warns.join("\n"), /人声避让失败：boom/);
});

test("addMusic：一切正常时返回带 mediaStart 的配乐，最后一次总装带配乐", () => {
  const calls = [];
  const deps = { resolveMusic: () => "assets/audio/bgm.wav", alignMusic: () => 1.5, carve: () => {}, assemble: (m) => calls.push(m) };
  const r = addMusic({ intent: "x", drop: 10, volume: 0.4 }, deps, () => {});
  assert.deepEqual(r, { src: "assets/audio/bgm.wav", mediaStart: 1.5, volume: 0.4 });
  assert.deepEqual(calls.at(-1), r);
});
