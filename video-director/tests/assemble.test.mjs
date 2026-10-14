import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import { audioHosts, brandHosts, cuesJs, replaceBlock, segmentHosts, setRootDuration } from "../scripts/lib/assemble.mjs";

const HTML = `<div id="root" data-composition-id="main" data-start="0" data-duration="10">
<!-- vd:segments -->old<!-- /vd:segments -->
<div id="手写">贯穿元素</div>
</div>`;

test("replaceBlock 只替换标记之间，手写部分保留；重复执行结果相同（幂等）", () => {
  const a = replaceBlock(HTML, "segments", "\nNEW\n");
  assert.match(a, /<!-- vd:segments -->\nNEW\n<!-- \/vd:segments -->/);
  assert.match(a, /贯穿元素/);
  assert.equal(replaceBlock(a, "segments", "\nNEW\n"), a);
  assert.throws(() => replaceBlock(HTML, "brand", "x"), /index.html 缺少标记 <!-- vd:brand -->/);
});

test("setRootDuration：只改 main 根元素的 data-duration", () => {
  assert.match(setRootDuration(HTML, 63.6), /data-composition-id="main" data-start="0" data-duration="63.6"/);
});

test("cuesJs：VD.at 返回相对段开头的秒数；名字或段不存在时抛错", () => {
  const ctx = { window: {} };
  vm.runInNewContext(cuesJs({ cues: { "编一套": 2.82, "不在里面": 10.44 }, segments: [{ id: "a", start: 0, duration: 7.13 }, { id: "b", start: 7.13, duration: 4.05 }] }), ctx);
  assert.equal(ctx.window.VD.at("编一套", "a"), 2.82);
  assert.equal(Math.round(ctx.window.VD.at("不在里面", "b") * 100) / 100, 3.31);
  assert.throws(() => ctx.window.VD.at("没有", "a"), /cues 里没有「没有」/);
  assert.throws(() => ctx.window.VD.at("编一套", "z"), /没有段 z/);
});

test("segmentHosts：每段一个宿主，时间来自配音；only 只放样片的段", () => {
  const segs = [{ id: "seg-01-hook", start: 0, duration: 7.13 }, { id: "seg-02-why", start: 7.13, duration: 4.05 }];
  const h = segmentHosts(segs);
  assert.match(h, /data-composition-id="seg-01-hook" data-composition-src="compositions\/frames\/seg-01-hook.html" data-start="0" data-duration="7.13"/);
  assert.match(h, /class="clip"/);
  assert.doesNotMatch(segmentHosts(segs, ["seg-01-hook"]), /seg-02-why/);
});

test("brandHosts：字幕带重点词、栏目标签贯穿全片、结尾从最后一句开始；变量里的引号和 & 被转义", () => {
  const vd = { kicker: "AI 概念 · 第 1 期", palette: { bg: "#F1ECE2", ink: "#1C1A17", muted: "#6E675C", accent: "#FFD84D", alert: "#D2372A" }, ending: { next: "下一期 & 预告", question: "你被'编'过吗？", cta: "评论区", hold: 2 } };
  const h = brandHosts({ vd, groups: [{ start: 0.04, end: 2.1, text: "它敢给你 *编一套." }], lines: [{ line: 1, start: 0, end: 3.32 }, { line: 2, start: 3.32, end: 7.13 }], duration: 9.13 });
  assert.match(h, /data-composition-id="brand-kicker"[^>]*data-start="0" data-duration="9.13"/);
  assert.match(h, /data-composition-id="brand-ending"[^>]*data-start="3.32" data-duration="5.81"/);
  assert.match(h, /&amp;/);
  assert.match(h, /&#39;/);
  assert.doesNotMatch(h, /data-variable-values='[^']*'[^>]*'/);
});

test("audioHosts：配音一条；有配乐时第二条带 media-start 和音量", () => {
  assert.doesNotMatch(audioHosts({ duration: 10, music: null }), /id="music"/);
  const a = audioHosts({ duration: 10, music: { src: "assets/audio/bgm.wav", mediaStart: 3.046, volume: 0.4 } });
  assert.match(a, /<audio id="vo" src="assets\/audio\/vo.wav" data-start="0" data-duration="10"/);
  assert.match(a, /<audio id="music" src="assets\/audio\/bgm.wav" data-start="0" data-duration="10" data-media-start="3.046" data-volume="0.4"/);
});

test("brandHosts：样片总长不到最后一句时不放结尾（否则挂在时间轴外）", () => {
  const vd = { kicker: "k", palette: { bg: "#F1ECE2", ink: "#1C1A17", muted: "#6E675C", accent: "#FFD84D", alert: "#D2372A" }, ending: { next: "n", question: "q", cta: "c", hold: 2 } };
  const h = brandHosts({ vd, groups: [], lines: [{ line: 1, start: 0, end: 3.32 }, { line: 2, start: 57, end: 61.6 }], duration: 14.45 });
  assert.match(h, /brand-kicker/);
  assert.doesNotMatch(h, /brand-ending/);
});

test("cuesJs：VD.at 算出的时间落在本段之外时抛错（词锚到了别的段）", () => {
  const ctx = { window: {} };
  vm.runInNewContext(cuesJs({ cues: { "编一套": 2.82 }, segments: [{ id: "a", start: 0, duration: 7.13 }, { id: "b", start: 7.13, duration: 4.05 }] }), ctx);
  assert.throws(() => ctx.window.VD.at("编一套", "b"), /「编一套」在全片 2.82s，不在段 b（7.13–11.18s）里/);
});
