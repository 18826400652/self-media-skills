// HyperFrames 工作流相关的纯逻辑测试：node --test tests/*.test.mjs
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import vm from "node:vm";
import { parseHfScript, restoreCase, toCaptionWords } from "../scripts/hf-audio.mjs";
import { frameEndTimes, sparseFrames } from "../scripts/hf-build.mjs";
import { mergeTokens } from "../scripts/hf-kit.mjs";
import { parseStoryboardSfx } from "../scripts/hf-sfx.mjs";
import { writeCues } from "../scripts/lib/cues.mjs";

const KIT_SRC = readFileSync(new URL("../hf-kit/kit.js", import.meta.url), "utf8");
const chars = (s, t0 = 0, step = 0.1) => [...s].map((ch, i) => ({ text: ch, start: t0 + i * step, end: t0 + (i + 1) * step }));
const tmp = () => mkdtempSync(join(tmpdir(), "nv-test-"));

test("parseHfScript 读出帧号、口播、情感和重点词", () => {
  const md = `## Line 1 — 钩子 (Frame 1)\n\n**重点词:** 八秒钟、一下午\n**Emotion:** 惊讶\n\n    AI八秒钟，干完了我一下午的活。\n\n## Line 2 (Frame 2)\n\n    第二句。\n`;
  const lines = parseHfScript(md);
  assert.equal(lines.length, 2);
  assert.deepEqual([lines[0].frame, lines[0].text, lines[0].emotion], [1, "AI八秒钟，干完了我一下午的活。", "惊讶"]);
  assert.deepEqual(lines[0].keywords, ["八秒钟", "一下午"]);
  assert.equal(lines[1].emotion, "");
});

test("toCaptionWords 按分句切开、重点词单独成段并加 *、中文标点换成英文", () => {
  const words = chars("说好不重复，结果数错了！");
  const out = toCaptionWords(words, ["数错了"]);
  assert.deepEqual(out.map((w) => w.text), ["说好不重复,", "结果", "*数错了!"]);
  assert.equal(out[2].start, words[8].start);
});

test("restoreCase 把 TTS 小写的英文恢复成口播原文写法", () => {
  const words = [{ text: "我", start: 0 }, { text: "让deepseek", start: 0.1 }, { text: "整", start: 0.5 }];
  assert.deepEqual(restoreCase(words, "我让DeepSeek整理").map((w) => w.text), ["我", "让DeepSeek", "整"]);
});

test("parseStoryboardSfx 支持 @关键词、+秒数、none", () => {
  const md = "## Frame 1 — a\n- sfx: impact-bass-1 @八秒钟, ping +1.2, whoosh\n\n## Frame 2 — b\n- sfx: none\n";
  const frames = parseStoryboardSfx(md);
  assert.deepEqual(frames[0].cues, [
    { name: "impact-bass-1", word: "八秒钟", offset: 0 },
    { name: "ping", word: null, offset: 1.2 },
    { name: "whoosh", word: null, offset: 0 },
  ]);
  assert.deepEqual(frames[1].cues, []);
  assert.throws(() => parseStoryboardSfx("## Frame 1\n- sfx: 坏 写法 !!"), /写法不对/);
});

test("mergeTokens 用项目配置覆盖默认色，拒绝不认识的键", () => {
  const src = 'var T = /*KIT_TOKENS*/ { accent: "#000", ink: "#fff" } /*END_KIT_TOKENS*/;';
  assert.deepEqual(mergeTokens(src, { accent: "#FFD84D" }), { accent: "#FFD84D", ink: "#fff" });
  assert.throws(() => mergeTokens(src, { acent: "#f00" }), /不认识的键/);
});

test("writeCues 把逐字时间写成 cues.js；没有配音时返回 0", () => {
  const dir = tmp();
  assert.equal(writeCues(dir), 0);
  writeFileSync(join(dir, "audio_meta.json"), JSON.stringify({ voices: [{ frame: 3, chars: chars("你看第五条", 0.04) }] }));
  assert.equal(writeCues(dir), 1);
  const ctx = { window: {} };
  vm.runInNewContext(readFileSync(join(dir, "compositions", "kit", "cues.js"), "utf8"), ctx);
  assert.equal(ctx.window.KIT_CUES[3][2][0], "第");
});

test("frameEndTimes 取每帧结尾前 0.3 秒，有转场重叠时取在下一帧进场之前", () => {
  const dir = tmp();
  writeFileSync(join(dir, "index.html"), [
    '<div id="a" data-composition-src="compositions/frames/01.html" data-start="0" data-duration="3"></div>',
    '<div id="b" data-composition-src="compositions/frames/02.html" data-start="2.5" data-duration="2"></div>',
  ].join("\n"));
  assert.deepEqual(frameEndTimes(dir), [2.2, 4.2]);
});

function loadKit(cues) {
  const node = () => ({ setAttribute() {}, appendChild() {}, style: {} });
  const ctx = { window: { KIT_CUES: cues }, document: { createElement: node, head: node() } };
  vm.runInNewContext(KIT_SRC, ctx);
  return ctx.window.Kit;
}

test("Kit.cue 按词取时间：支持第几次出现、忽略大小写、跨多字 token；找不到就报错", () => {
  const Kit = loadKit({
    5: [["写", 2.0], ["、", 2.4], ["整", 3.0], ["理", 3.2], ["。", 3.4], ["是", 5.1], ["整", 5.3], ["理", 5.6]],
    6: [["丢", 1.3], ["给deepseek", 1.4], ["，", 1.9]],
  });
  assert.equal(Kit.cue(5, "整理"), 3.0);
  assert.equal(Kit.cue(5, "整理", 2), 5.3);
  assert.equal(Kit.cue(6, "DeepSeek"), 1.4);
  assert.throws(() => Kit.cue(5, "列编号"), /找不到「列编号」/);
  assert.throws(() => Kit.cue(5, "整理", 3), /第 3 次/);
  assert.throws(() => Kit.cue(9, "x"), /没有第 9 帧/);
});

test("帧模板：@词 转成按词取时间，build 解析与生成", async () => {
  const { toJs, parseStoryboardFrames, buildFrame } = await import("../scripts/lib/frame-build.mjs");
  assert.equal(toJs({ at: ["@两遍", "@整理#2", 1.5], s: "x" }), '{ "at": [C("两遍"), C("整理", 2), 1.5], "s": "x" }');
  const md = [
    "---", "kicker: 普通人的 AI 课 · 第 1 课", "---",
    "## Frame 1 — 钩子", "- duration: 3.2s", "- src: compositions/frames/01-hook.html",
    '- build: {"rec":{"mediaStart":4,"rate":1.5,"dim":true},"kit":{"name":"compare","opts":{"at":["@两遍"]}}}',
    "## Frame 2 — 手写", "- duration: 2s", "- src: compositions/frames/02-x.html",
  ].join("\n");
  const { kicker, frames } = parseStoryboardFrames(md);
  assert.equal(kicker, "普通人的 AI 课 · 第 1 课");
  assert.deepEqual(frames.map((f) => [f.n, f.id, f.duration, !!f.build]), [[1, "01-hook", 3.2, true], [2, "02-x", 2, false]]);
  const tokens = { accent: "#FFD84D", ink: "#F4F1EA", muted: "#888", bg: "#101114", surface: "#1B1D22", line: "#2C2F36", font: '"Noto Sans SC", sans-serif' };
  const html = buildFrame({ ...frames[0], kicker, tokens });
  assert.match(html, /data-composition-id="01-hook"/);
  assert.match(html, /data-media-start="4" data-playback-rate="1.5"/);
  assert.match(html, /Kit\.compare\(tl, "#p01-k", \{ "at": \[C\("两遍"\)\] \}\)/);
  assert.match(html, /Kit\.cue\(1, w, n\)/);
  assert.throws(() => parseStoryboardFrames("## Frame 1\n- build: {坏"), /不是合法 JSON/);
  assert.throws(() => buildFrame({ ...frames[0], kicker, tokens, build: { kit: {} } }), /缺少 name/);
});

test("toCaptionWords：TTS 把标点和后面的字并成一个时间戳，也要在标点处断句", () => {
  const words = [{ text: "为", start: 0, end: 0.2 }, { text: "啥", start: 0.2, end: 0.4 }, { text: "？AI", start: 0.4, end: 0.8 }, { text: "不", start: 0.8, end: 1 }, { text: "是", start: 1, end: 1.2 }];
  assert.deepEqual(toCaptionWords(words, []).map((w) => w.text), ["为啥?", "AI不是"]);
  assert.deepEqual(toCaptionWords([{ text: "「A/B」", start: 0, end: 1 }], []).map((w) => w.text), ["「A/B」"]);
});

test("verify.evaluate：帧数、时长、声音、尺寸逐项判断", async () => {
  const { evaluate } = await import("../scripts/verify.mjs");
  const streams = [{ codec_type: "video", codec_name: "h264", width: 1080, height: 1920, avg_frame_rate: "30/1" }, { codec_type: "audio", duration: "34.6" }];
  const good = evaluate({ streams, packets: 1038, duration: 34.6, volume: { mean: -22, max: -1.6 }, expected: { width: 1080, height: 1920, duration: 34.6 }, blackSpans: [] });
  assert.equal(good.filter((i) => i.level !== "✓").length, 0);
  const bad = evaluate({ streams: [streams[0]], packets: 900, duration: 34.6, volume: { mean: -91, max: -91 }, expected: { width: 1080, height: 1920, duration: 30 }, blackSpans: [[3, 4.2]] });
  const msgs = bad.map((i) => i.level + i.msg).join("\n");
  assert.match(msgs, /✗帧数 900/);
  assert.match(msgs, /✗时长 34.60 秒，工程是 30 秒/);
  assert.match(msgs, /✗没有声音流/);
  assert.match(msgs, /⚠有 1 段纯黑画面/);
});

test("sparseFrames：纵向铺开不到 55% 或面积不到 40% 的帧要警告", () => {
  const r = sparseFrames([
    { file: "a.png", occupancy: 0.85, spanX: 0.96, spanY: 0.88 },
    { file: "b.png", occupancy: 0.41, spanX: 0.89, spanY: 0.46 },
    { file: "c.png", occupancy: 0.35, spanX: 0.5, spanY: 0.7 },
  ]);
  assert.deepEqual(r.map((x) => x.file), ["b.png", "c.png"]);
});

test("帧模板：camera push 把内容包进推镜层（角标不动），title.center 居中", async () => {
  const { buildFrame } = await import("../scripts/lib/frame-build.mjs");
  const tokens = { accent: "#FFD84D", ink: "#F4F1EA", muted: "#888", bg: "#101114", surface: "#1B1D22", line: "#2C2F36", font: "sans-serif" };
  const f = { n: 3, id: "03-punch", duration: 1.2, kicker: "K", tokens };
  const html = buildFrame({ ...f, build: { camera: "push", title: { center: true, lines: ["**两遍**"] } } });
  assert.match(html, /<div id="p03-cam"[^>]*>\s*<div class="p03-h p03-center"/);
  assert.ok(html.indexOf('class="p03-kicker"') < html.indexOf('id="p03-cam"'), "角标在推镜层外面");
  assert.match(html, /tl\.fromTo\("#p03-cam", \{ scale: 1 \}, \{ scale: 1\.04, duration: 1\.2/);
  assert.doesNotMatch(buildFrame({ ...f, build: { title: { lines: ["x"] } } }), /-cam/);
  assert.throws(() => buildFrame({ ...f, build: { camera: "orbit" } }), /只支持 "push"/);
});

test("帧模板：kicker false 不显示角标", async () => {
  const { buildFrame } = await import("../scripts/lib/frame-build.mjs");
  const f = { n: 1, id: "01-hook", duration: 2, kicker: "第 1 课", tokens: { accent: "#FFD84D", bg: "#101114", font: "sans-serif" } };
  assert.doesNotMatch(buildFrame({ ...f, build: { kicker: false } }), /p01-kicker">/);
  assert.match(buildFrame({ ...f, build: {} }), /p01-kicker">第 1 课/);
});
