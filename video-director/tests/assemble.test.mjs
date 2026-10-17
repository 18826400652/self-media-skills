import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import { applyHead, audioHosts, brandHosts, cuesJs, customVars, headBlock, replaceBlock, segmentHosts, setRootDuration } from "../scripts/lib/assemble.mjs";

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

test("cuesJs：用下一段开头的词给本段做退场是允许的（超出段边界 1 秒以内）", () => {
  const ctx = { window: {} };
  vm.runInNewContext(cuesJs({ cues: { "因为它只记得": 7.17 }, segments: [{ id: "a", start: 0, duration: 7.13 }] }), ctx);
  assert.equal(ctx.window.VD.at("因为它只记得", "a"), 7.17);
});

const PAL = { bg: "#F1ECE2", ink: "#1C1A17", muted: "#6E675C", accent: "#FFD84D", alert: "#D2372A" };

test("segmentHosts：组件段带 --hf-safe-bottom:1150px（字幕带 1180 上方 30），dykit 组件按它收底边；手写段不带", () => {
  const segs = [{ id: "seg-01", start: 0, duration: 3, component: "dy-checklist", vars: {} }, { id: "seg-02", start: 3, duration: 2 }];
  const [comp, frame] = segmentHosts(segs, null, PAL).trim().split("\n");
  assert.match(comp, /--hf-safe-bottom:1150px/);
  assert.doesNotMatch(frame, /--hf-safe-bottom/);
});

test("customVars：配色和字体变成 --hf-custom-* 变量；荧光笔用 accent，组件强调色取和底色对比度够的", () => {
  const v = customVars(PAL, { title: "serif", body: "sans" });
  // 纸面上荧光黄当文字看不清（< 3:1），组件强调色改用 alert 红；荧光笔底色仍是黄
  assert.match(v, /--hf-custom-bg:#F1ECE2;--hf-custom-text:#1C1A17;--hf-custom-muted:#6E675C;--hf-custom-accent:#D2372A;--hf-custom-alert:#D2372A;--hf-custom-highlight:#FFD84D/);
  assert.match(v, /--hf-custom-font-title:var\(--vd-serif\);--hf-custom-font-body:var\(--vd-sans\)/);
  assert.match(v, /--hf-custom-on-accent:#FFFFFF;--hf-custom-on-alert:#FFFFFF;--hf-custom-on-highlight:#1C1A17/);
  // 深色底：荧光黄够亮，直接当强调色，上面的字用墨色
  const dark = customVars({ ...PAL, bg: "#101114", ink: "#F4F1EA", alert: "#FF5A5F" }, {});
  assert.match(dark, /--hf-custom-accent:#FFD84D;.*--hf-custom-on-accent:#1C1A17/);
  // accent、alert 都不够时退回正文色
  assert.match(customVars({ ...PAL, alert: "#F7D9D2" }, {}), /--hf-custom-accent:#1C1A17;--hf-custom-alert:#1C1A17/);
});

test("segmentHosts：组件段落用组件源文件、custom 主题、变量", () => {
  const segs = [{ id: "seg-02", start: 3, duration: 4, component: "dy-scene-steps", vars: { title: "三步" } }];
  const h = segmentHosts(segs, null, PAL, {});
  assert.match(h, /id="host-seg-02"[^>]*data-composition-id="dy-scene-steps" data-composition-src="compositions\/dy-scene-steps.html"/);
  assert.match(h, /data-theme="custom"/);
  assert.match(h, /--hf-custom-bg:#F1ECE2/);
  assert.match(h, /data-variable-values='\{"title":"三步"\}'/);
});

test("segmentHosts：手写段落不变，没有 custom 主题", () => {
  const h = segmentHosts([{ id: "seg-01", start: 0, duration: 3 }], null, PAL, {});
  assert.match(h, /id="host-seg-01" class="clip" data-composition-id="seg-01" data-composition-src="compositions\/frames\/seg-01.html"/);
  assert.doesNotMatch(h, /data-theme|--hf-custom/);
});

test("同一组件用两次：宿主 id 不重复，变量各自独立", () => {
  const segs = [{ id: "a", start: 0, duration: 2, component: "dy-scene-steps", vars: { title: "一" } }, { id: "b", start: 2, duration: 2, component: "dy-scene-steps", vars: { title: "二" } }];
  const h = segmentHosts(segs, null, PAL, {});
  assert.match(h, /id="host-a"[^>]*"title":"一"/);
  assert.match(h, /id="host-b"[^>]*"title":"二"/);
  assert.equal(h.match(/id="host-/g).length, 2);
});

test("headBlock：有组件才引入 dykit 样式和脚本", () => {
  assert.equal(headBlock(false), "");
  assert.match(headBlock(true), /<link rel="stylesheet" href="assets\/dykit\/dykit.css" \/>[\s\S]*<script src="assets\/dykit\/hf-kit.js"><\/script>/);
});

test("applyHead：旧工程没有 vd:head 标记、也没用组件时照常构建；用了组件才要求标记", () => {
  const old = "<head><script src=\"cues.js\"></script></head>";
  assert.equal(applyHead(old, false), old);
  assert.throws(() => applyHead(old, true), /index.html 缺少标记 <!-- vd:head -->/);
  assert.match(applyHead("<!-- vd:head --><!-- /vd:head -->", true), /dykit\.css/);
});

test("customVars：正文色和底色对比度都不够时报中文错误，指出该改哪个颜色", () => {
  assert.throws(() => customVars({ ...PAL, ink: "#E8E2D6", alert: "#F7D9D2" }, {}), /palette\.ink.*palette\.bg.*对比度/);
});
