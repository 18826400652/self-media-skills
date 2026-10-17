import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  assert.equal(resolveMusic(dir, "lo-fi", fail), null);
});

test("resolveMusic：已有 assets/audio/bgm.* 时不再调用曲库", () => {
  const dir = project({ "assets/audio/bgm.mp3": "x" });
  const never = () => { throw new Error("不应调用"); };
  assert.equal(resolveMusic(dir, "lo-fi", never), "assets/audio/bgm.mp3");
});

test("alignMusic：beats 命令成功但没写出节拍文件时，退回从头播放（返回 0），不抛错", () => {
  const dir = project({ "assets/audio/bgm.wav": "x" });
  const ok = () => ({ status: 0, stdout: "", stderr: "" });
  assert.equal(alignMusic(dir, { src: "assets/audio/bgm.wav", drop: 10, duration: 20 }, ok), 0);
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

/** 假的外部命令：记录调用；media-use 返回 .media 里的曲子；ffmpeg 什么都不做 */
function fakeRun(calls) {
  return (cmd, args) => {
    calls.push([cmd.split("/").pop(), ...args]);
    if (args[0] === "media-use") return { status: 0, stdout: "resolved bgm_002 → .media/audio/bgm/bgm_002.wav (bgm, 95s)\n", stderr: "" };
    return { status: 0, stdout: "", stderr: "" };
  };
}
const lens = (map) => (p) => map[p.split("/").pop()] ?? 0;

test("resolveMusic：vd 以前取的 bgm.wav 比视频短 → 重新取，说法里带上视频时长", () => {
  const dir = project({ "assets/audio/bgm.wav": "old", ".media/audio/bgm/bgm_002.wav": "new" });
  const calls = [];
  // 按内容区分新旧两首：复制后 bgm.wav 就是新取的那首
  const probe = (p) => ({ old: 16, new: 95 })[readFileSync(p, "utf8")] ?? 0;
  const src = resolveMusic(dir, "lo-fi", fakeRun(calls), { duration: 91, probe, warn: () => {} });
  assert.equal(src, "assets/audio/bgm.wav");
  const mu = calls.find((c) => c[1] === "media-use");
  assert.ok(mu, "应重新取曲");
  assert.match(mu[mu.indexOf("--intent") + 1], /lo-fi.*around 91 seconds/);
  assert.ok(!calls.some((c) => c[0] === "ffmpeg"), "够长不用循环");
});

test("resolveMusic：取到的还是比视频短 → 循环补齐并提醒", () => {
  const dir = project({ ".media/audio/bgm/bgm_002.wav": "new" });
  const calls = [], warns = [];
  const src = resolveMusic(dir, "lo-fi", fakeRun(calls), { duration: 91, probe: lens({ "bgm.wav": 54 }), warn: (m) => warns.push(m) });
  assert.equal(src, "assets/audio/bgm.wav");
  const ff = calls.find((c) => c[0] === "ffmpeg");
  assert.ok(ff && ff.join(" ").includes("acrossfade") && ff.includes("91"), JSON.stringify(calls));
  assert.match(warns.join("\n"), /循环/);
  assert.match(warns.join("\n"), /接缝处淡入淡出.*不想听出重复.*assets\/audio\/bgm\.mp3/);
});

test("resolveMusic：用户自己放的 bgm.mp3 太短 → 不替换、不取曲，循环成 bgm-loop.wav", () => {
  const dir = project({ "assets/audio/bgm.mp3": "mine" });
  const calls = [];
  const src = resolveMusic(dir, "lo-fi", fakeRun(calls), { duration: 91, probe: lens({ "bgm.mp3": 30 }), warn: () => {} });
  assert.equal(src, "assets/audio/bgm-loop.wav");
  assert.ok(!calls.some((c) => c[1] === "media-use"));
  assert.ok(calls.some((c) => c[0] === "ffmpeg"));
});

test("resolveMusic：已有配乐够长 → 照旧用，不调用任何命令", () => {
  const dir = project({ "assets/audio/bgm.wav": "x" });
  const never = () => { throw new Error("不应调用"); };
  assert.equal(resolveMusic(dir, "lo-fi", never, { duration: 91, probe: () => 120 }), "assets/audio/bgm.wav");
});

const noHf = () => { throw new Error("video-director 还没装 hyperframes：cd /x && npm ci（或 st install --deps）"); };

test("resolveMusic：没装 hyperframes → 警告里带安装办法，不取曲、不抛错（不挡出片）", () => {
  const dir = project({ "index.html": "" });
  const warns = [];
  const never = () => { throw new Error("不应调用"); };
  assert.equal(resolveMusic(dir, "lo-fi", never, { warn: (m) => warns.push(m), requireBin: noHf }), null);
  assert.match(warns.join("\n"), /还没装 hyperframes.*npm ci.*本次不加配乐/);
});

test("alignMusic：没装 hyperframes → 警告里带安装办法，配乐从头播放（返回 0）", () => {
  const dir = project({ "index.html": "" });
  const warns = [];
  const never = () => { throw new Error("不应调用"); };
  assert.equal(alignMusic(dir, { src: "assets/audio/bgm.wav", drop: 10, duration: 20 }, never, { warn: (m) => warns.push(m), requireBin: noHf }), 0);
  assert.match(warns.join("\n"), /还没装 hyperframes.*npm ci.*配乐从头播放/);
});

test("loopArgs：短配乐循环时每个接缝 2 秒淡入淡出，份数够铺满视频；太短（≤ 4 秒）退回直接循环", async () => {
  const { loopArgs } = await import("../scripts/lib/music.mjs");
  const a = loopArgs("in.wav", "out.wav", 30, 112);
  assert.equal(a.filter((x) => x === "in.wav").length, 4, "4 份：4×30 − 3×2 = 114 ≥ 112");
  assert.equal((a.join(" ").match(/acrossfade=d=2/g) ?? []).length, 3);
  assert.deepEqual(a.slice(-3), ["-t", "112", "out.wav"]);
  const short = loopArgs("in.wav", "out.wav", 3, 60);
  assert.ok(short.includes("-stream_loop"));
});
