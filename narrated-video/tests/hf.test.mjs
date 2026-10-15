// HyperFrames 工作流相关的纯逻辑测试：node --test tests/*.test.mjs
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import vm from "node:vm";
import { parseHfScript, restoreCase, toCaptionWords } from "../scripts/hf-audio.mjs";
import { boundsTimes, captionZoneSpec, cleanIndex, frameEndTimes, frameMotionTimes, sparseFrames, stillFrames } from "../scripts/hf-build.mjs";
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

test("frameMotionTimes：每帧四张——入场、中段、落定前 0.7 秒、落定（后两张用来比较落定后还动不动）", () => {
  const dir = tmp();
  writeFileSync(join(dir, "index.html"), [
    '<div id="a" data-composition-src="compositions/frames/01.html" data-start="0" data-duration="4"></div>',
    '<div id="b" data-composition-src="compositions/frames/02.html" data-start="4" data-duration="1"></div>',
  ].join("\n"));
  // 第 2 帧太短：落定前 0.7 秒早于中段，就取中段
  assert.deepEqual(frameMotionTimes(dir), [0.35, 1.85, 3, 3.7, 4.35, 4.35, 4.35, 4.7]);
});

test("stillFrames：落定前后两张几乎没差别的帧算「落定后静止」", () => {
  const r = stillFrames([
    { frame: 1, diff: 2.4 },
    { frame: 2, diff: 0.02 },
    { frame: 3, diff: 0.6 },
  ]);
  assert.deepEqual(r.map((x) => x.frame), [2]);
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
  assert.throws(() => buildFrame({ ...f, build: { camera: "orbit" } }), /只支持 "push" 或 false/);
});

test("帧模板：没写 camera 时默认缓推；录屏帧、截图帧、camera false 不推", async () => {
  const { buildFrame } = await import("../scripts/lib/frame-build.mjs");
  const f = { n: 4, id: "04-x", duration: 5, kicker: "K", tokens: FLAT_TOKENS };
  assert.match(buildFrame({ ...f, build: { title: { lines: ["x"] } } }), /tl\.fromTo\("#p04-cam", \{ scale: 1 \}, \{ scale: 1\.04, duration: 5/);
  assert.match(buildFrame({ ...f, build: { kit: { name: "compare" } } }), /id="p04-cam"/);
  assert.doesNotMatch(buildFrame({ ...f, build: { rec: { mediaStart: 0 } } }), /-cam/);
  assert.doesNotMatch(buildFrame({ ...f, build: { kit: { name: "shot", opts: {} } } }), /-cam/);
  assert.doesNotMatch(buildFrame({ ...f, build: { camera: false, title: { lines: ["x"] } } }), /-cam/);
});

test("帧模板 glow：底色光晕慢呼吸，次数按帧长算（不用无限循环）；flat 不加", async () => {
  const { buildFrame } = await import("../scripts/lib/frame-build.mjs");
  const f = { n: 2, id: "02-x", kicker: "K", tokens: FLAT_TOKENS, total: 4, build: { title: { lines: ["x"] } } };
  const glow = buildFrame({ ...f, duration: 6.2, look: "glow" });
  assert.match(glow, /tl\.fromTo\("#p02-ground", \{ "--kit-atmo-glow": 1 \}, \{ "--kit-atmo-glow": 0\.7, duration: 1\.5, ease: "sine\.inOut", yoyo: true, repeat: 3 \}, 0\);/);
  assert.doesNotMatch(glow, /repeat: -1/);
  assert.match(buildFrame({ ...f, duration: 1, look: "glow" }), /duration: 1, ease: "sine\.inOut", yoyo: true, repeat: 0/);
  assert.doesNotMatch(buildFrame({ ...f, duration: 6.2, look: "flat" }), /kit-atmo-glow/);
});

test("帧模板：缓动分角色——大标题 expo.out，标签 back.out，说明文字 power3.out", async () => {
  const { buildFrame } = await import("../scripts/lib/frame-build.mjs");
  const html = buildFrame({ n: 1, id: "01-x", duration: 3, kicker: "K", tokens: FLAT_TOKENS, build: { lead: { text: "a" }, title: { label: "L", lines: ["b"] } } });
  assert.match(html, /tl\.fromTo\("#p01-h0", [^;]*ease: EH \}/);
  assert.match(html, /tl\.fromTo\("#p01-tl", [^;]*ease: EB \}/);
  assert.match(html, /tl\.fromTo\("#p01-l", [^;]*ease: E \}/);
  assert.match(html, /var EH = "expo\.out", EB = "back\.out\(1\.6\)";/);
});

test("帧模板：kicker false 不显示角标", async () => {
  const { buildFrame } = await import("../scripts/lib/frame-build.mjs");
  const f = { n: 1, id: "01-hook", duration: 2, kicker: "第 1 课", tokens: { accent: "#FFD84D", bg: "#101114", font: "sans-serif" } };
  assert.doesNotMatch(buildFrame({ ...f, build: { kicker: false } }), /p01-kicker">/);
  assert.match(buildFrame({ ...f, build: {} }), /p01-kicker">第 1 课/);
});

test("resolveLook：不填是 flat，只接受 glow / flat", async () => {
  const { resolveLook } = await import("../scripts/lib/config.mjs");
  assert.equal(resolveLook({}), "flat");
  assert.equal(resolveLook({ hfKit: {} }), "flat");
  assert.equal(resolveLook({ hfKit: { look: "glow" } }), "glow");
  assert.throws(() => resolveLook({ hfKit: { look: "neon" } }), /hfKit\.look 只能是 "glow" 或 "flat"，收到 "neon"/);
});

test("mergeTokens 认识 danger，kit.js 默认值是 #FF5A5F", () => {
  assert.equal(mergeTokens(KIT_SRC, {}).danger, "#FF5A5F");
  assert.equal(mergeTokens(KIT_SRC, { danger: "#E00" }).danger, "#E00");
});

const FLAT_TOKENS = { accent: "#FFD84D", ink: "#F4F1EA", muted: "#888", bg: "#101114", surface: "#1B1D22", line: "#2C2F36", font: "sans-serif" };
const FLAT_BUILD = { camera: "push", rec: { mediaStart: 1, chip: "录屏" }, timer: { value: 2, note: "原速" }, lead: { text: "**x**" }, kit: { name: "compare", opts: { at: [0, 1] } }, title: { label: "L", lines: ["a"] } };

test("帧模板 flat：输出和改动前逐字一致", async () => {
  const { buildFrame } = await import("../scripts/lib/frame-build.mjs");
  const html = buildFrame({ n: 2, id: "02-x", duration: 3, kicker: "K", tokens: FLAT_TOKENS, build: FLAT_BUILD, look: "flat", total: 5 })
    + buildFrame({ n: 3, id: "03-y", duration: 2, kicker: "K", tokens: FLAT_TOKENS, build: { ground: "accent", title: { lines: ["b"] } }, total: 5 });
  assert.equal(html, readFileSync(new URL("./fixtures/frame-flat.html", import.meta.url), "utf8"));
});

test("progressSegments：封顶 8 段，第一帧至少一段，最后一帧全亮", async () => {
  const { progressSegments } = await import("../scripts/lib/frame-build.mjs");
  assert.deepEqual(progressSegments(1, 5), { count: 5, lit: 1 });
  assert.deepEqual(progressSegments(3, 5), { count: 5, lit: 3 });
  assert.deepEqual(progressSegments(1, 19), { count: 8, lit: 1 });
  assert.deepEqual(progressSegments(10, 19), { count: 8, lit: 4 });
  assert.deepEqual(progressSegments(19, 19), { count: 8, lit: 8 });
});

test("帧模板 glow：底色层、HUD、进度条、kit-glow.js、样式钩子", async () => {
  const { buildFrame } = await import("../scripts/lib/frame-build.mjs");
  const f = { n: 2, id: "02-x", duration: 3, kicker: "K", tokens: FLAT_TOKENS, look: "glow", total: 4 };
  const html = buildFrame({ ...f, build: FLAT_BUILD });
  assert.match(html, /class="p02-ground kit-atmo clip"/);
  assert.match(html, /\.p02-ground \{ position: absolute; inset: 0; background-color: var\(--kit-bg\); \}/);
  assert.match(html, /<div class="kit-hud"><i class="c tl"><\/i><i class="c tr"><\/i><i class="c bl"><\/i><i class="c br"><\/i><div class="kit-progress"><i class="on"><\/i><i class="on"><\/i><i><\/i><i><\/i><\/div><\/div>/);
  assert.match(html, /class="p02-kicker kit-kicker">K/);
  assert.match(html, /class="p02-chip kit-chip"/);
  assert.match(html, /class="p02-panel kit-glass-panel"/);
  assert.match(html, /class="p02-label kit-label"/);
  assert.match(html, /<script src="compositions\/kit\/kit\.js"><\/script>\s*<script src="compositions\/kit\/kit-glow\.js"><\/script>/);
  assert.ok(html.indexOf('class="kit-hud"') < html.indexOf('id="p02-cam"'), "HUD 在推镜层外面，不跟着推");
});

test("帧模板 glow：accent 底不加光晕；kicker false 只去掉角标；glow 必须给 total", async () => {
  const { buildFrame } = await import("../scripts/lib/frame-build.mjs");
  const f = { n: 1, id: "01-h", duration: 2, kicker: "K", tokens: FLAT_TOKENS, look: "glow", total: 3 };
  const accent = buildFrame({ ...f, build: { ground: "accent", title: { lines: ["b"] } } });
  assert.match(accent, /class="p01-ground kit-atmo is-accent clip"/);
  assert.match(accent, /background-color: #FFD84D;/);
  assert.match(accent, /--kit-ink: #101114;/);
  const noKicker = buildFrame({ ...f, build: { kicker: false } });
  assert.doesNotMatch(noKicker, /class="p01-kicker/);
  assert.match(noKicker, /class="kit-hud"><i class="c tl">/);
  assert.doesNotMatch(noKicker, /kit-progress/, "钩子帧只留四角：不要「上课感」的进度条");
  assert.throws(() => buildFrame({ ...f, total: undefined, build: {} }), /glow 需要 total/);
});

test("帧模板：每帧都引用 kit-scenes.js（在 kit.js 之后）", async () => {
  const { buildFrame } = await import("../scripts/lib/frame-build.mjs");
  const html = buildFrame({ n: 1, id: "01-h", duration: 2, kicker: "K", tokens: FLAT_TOKENS, build: {} });
  assert.match(html, /<script src="compositions\/kit\/kit\.js"><\/script>\s*<script src="compositions\/kit\/kit-scenes\.js"><\/script>/);
  const glow = buildFrame({ n: 1, id: "01-h", duration: 2, kicker: "K", tokens: FLAT_TOKENS, build: {}, look: "glow", total: 2 });
  assert.match(glow, /kit\.js"><\/script>\s*<script src="compositions\/kit\/kit-glow\.js"><\/script>\s*<script src="compositions\/kit\/kit-scenes\.js"><\/script>/);
});

test("toJs：只有时间字段（at、xxxAt）里的 @词 才转成按词取时间，文字里的 @人 原样保留", async () => {
  const { toJs } = await import("../scripts/lib/frame-build.mjs");
  assert.equal(
    toJs({ messages: [{ from: "刘总", text: "@你 十分钟后发群里", at: "@十分钟" }], focus: { noteAt: "@王姐", note: "@某人" } }),
    '{ "messages": [{ "from": "刘总", "text": "@你 十分钟后发群里", "at": C("十分钟") }], "focus": { "noteAt": C("王姐"), "note": "@某人" } }',
  );
  assert.equal(toJs({ at: ["@两遍", "@整理#2", 1.5] }), '{ "at": [C("两遍"), C("整理", 2), 1.5] }');
});

test("toJs：until 和带大写的 xxxYyyAt 也是时间字段", async () => {
  const { toJs } = await import("../scripts/lib/frame-build.mjs");
  assert.equal(toJs({ until: "@讲完", zoomInAt: "@推近", label: "@不是时间" }), '{ "until": C("讲完"), "zoomInAt": C("推近"), "label": "@不是时间" }');
});

test("localizeGsap：CDN 地址换成本地，去掉 integrity / crossorigin，别的链接不动", async () => {
  const { localizeGsap, LOCAL_GSAP } = await import("../scripts/lib/localize.mjs");
  assert.equal(LOCAL_GSAP, "compositions/kit/gsap.min.js");
  const html = [
    '<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js" integrity="sha384-abc" crossorigin="anonymous"></script>',
    '<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>',
    '<link href="https://fonts.googleapis.com/css2?family=X" rel="stylesheet">',
  ].join("\n");
  const r = localizeGsap(html, "3.14.2");
  assert.equal(r.count, 2);
  assert.deepEqual(r.mismatched, []);
  assert.equal(r.html, [
    '<script src="compositions/kit/gsap.min.js"></script>',
    '<script src="compositions/kit/gsap.min.js"></script>',
    '<link href="https://fonts.googleapis.com/css2?family=X" rel="stylesheet">',
  ].join("\n"));
  assert.deepEqual(localizeGsap("<p>无脚本</p>", "3.14.2"), { html: "<p>无脚本</p>", count: 0, mismatched: [] });
});

test("localizeGsap：版本和本地不一致时照样换，但报出来", async () => {
  const { localizeGsap } = await import("../scripts/lib/localize.mjs");
  const r = localizeGsap('<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>', "3.14.2");
  assert.equal(r.count, 1);
  assert.deepEqual(r.mismatched, ["3.12.5"]);
});

test("帧模板直接引用本地 GSAP", async () => {
  const { buildFrame } = await import("../scripts/lib/frame-build.mjs");
  const html = buildFrame({ n: 1, id: "01-h", duration: 2, kicker: "K", tokens: FLAT_TOKENS, build: {} });
  assert.match(html, /<script src="compositions\/kit\/gsap\.min\.js"><\/script>/);
  assert.doesNotMatch(html, /cdn\.jsdelivr/);
});

test("installGsap：把 nv 自带的 GSAP 复制到工程的 compositions/kit/，返回版本", async () => {
  const { installGsap } = await import("../scripts/hf-kit.mjs");
  const { mkdtempSync, existsSync, statSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const out = mkdtempSync(join(tmpdir(), "kit-"));
  const version = installGsap(out);
  assert.equal(version, "3.14.2");
  assert.ok(existsSync(join(out, "gsap.min.js")));
  assert.ok(statSync(join(out, "gsap.min.js")).size > 50000);
});

test("localizeProject：index.html 和 compositions 下所有 HTML 都换成本地 GSAP", async () => {
  const { localizeProject } = await import("../scripts/hf-build.mjs");
  const { mkdirSync, mkdtempSync } = await import("node:fs");
  const dir = mkdtempSync(join(tmpdir(), "proj-"));
  const cdn = '<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js" integrity="sha384-x" crossorigin="anonymous"></script>';
  mkdirSync(join(dir, "compositions", "frames"), { recursive: true });
  writeFileSync(join(dir, "index.html"), cdn);
  writeFileSync(join(dir, "compositions", "captions.html"), cdn);
  writeFileSync(join(dir, "compositions", "frames", "01-a.html"), cdn + cdn);
  writeFileSync(join(dir, "compositions", "frames", "notes.txt"), cdn);
  const r = localizeProject(dir, "3.14.2");
  assert.deepEqual(r, { files: 3, tags: 4, mismatched: [] });
  assert.equal(readFileSync(join(dir, "compositions", "frames", "01-a.html"), "utf8"), '<script src="compositions/kit/gsap.min.js"></script>'.repeat(2));
  assert.equal(readFileSync(join(dir, "compositions", "frames", "notes.txt"), "utf8"), cdn, "只改 HTML");
  assert.deepEqual(localizeProject(dir, "3.14.2"), { files: 0, tags: 0, mismatched: [] }, "再跑一次没有可换的");
});

test("cueTime：按词取时间，支持第几次出现、忽略大小写和空格；找不到返回 null", async () => {
  const { cueTime } = await import("../scripts/lib/cues.mjs");
  const cues = [["问A", 0.04], ["I", 0.49], ["你", 0.84], ["们", 0.94], ["你", 2.2], ["们", 2.3]];
  assert.equal(cueTime(cues, "ai"), 0.04);
  assert.equal(cueTime(cues, "你们"), 0.84);
  assert.equal(cueTime(cues, "你们", 2), 2.2);
  assert.equal(cueTime(cues, "他们"), null);
});

test("textOnlyRuns：连着 3 帧以上纯文字（大字、说明、文字类组件）报出来；有图形组件、录屏或手写帧就断开", async () => {
  const { textOnlyRuns } = await import("../scripts/lib/frame-build.mjs");
  const fr = (n, build) => ({ n, build });
  const frames = [
    fr(8, { kit: { name: "steps" } }),
    fr(9, { title: { lines: ["a"] } }),
    fr(10, { lead: { text: "x" }, kit: { name: "prompt" } }),
    fr(11, { title: { lines: ["b"] } }),
    fr(12, { kit: { name: "template" } }),
    fr(13, { kit: { name: "compare" } }),
    fr(14, { title: { lines: ["c"] } }),
    fr(15, { kit: { name: "marker" } }),
    fr(16, null), // 手写帧：不知道画了什么，不算纯文字
    fr(17, { title: { lines: ["d"] } }),
  ];
  assert.deepEqual(textOnlyRuns(frames), [{ from: 9, to: 12, count: 4 }]);
  assert.deepEqual(textOnlyRuns(frames.slice(5)), []);
});

test("lateAnimations：动画挂在句尾、帧结尾前来不及播完时报出来", async () => {
  const { lateAnimations } = await import("../scripts/lib/frame-build.mjs");
  const cues = [["回", 0.2], ["答", 0.4], ["先", 1.0], ["去", 1.2], ["翻", 2.4], ["资", 2.6], ["料", 2.8]];
  const frame = (build) => ({ n: 4, duration: 3.0, build });
  const late = lateAnimations(frame({ kit: { name: "marker", opts: { inAt: 0.1, at: "@资料" } } }), cues);
  assert.deepEqual(late, [{ word: "资料", component: "marker", cue: 2.6, readable: 3.1, frameEnd: 3 }]);
  assert.deepEqual(lateAnimations(frame({ kit: { name: "marker", opts: { at: "@先去" } } }), cues), []);
  const title = lateAnimations(frame({ title: { lines: [{ text: "a", at: "@回答" }, { text: "b", at: "@料" }] } }), cues);
  assert.deepEqual(title.map((x) => [x.word, x.component]), [["料", "title"]]);
  assert.deepEqual(lateAnimations(frame({ kit: { name: "annotate", opts: { at: "@翻" } } }), cues).map((x) => x.readable), [3.4]);
  assert.deepEqual(lateAnimations(frame({ kit: { name: "marker", opts: { at: "@没有这个词" } } }), cues), [], "找不到的词交给运行时报错");
  assert.deepEqual(lateAnimations(frame({ kit: { name: "marker", opts: { at: 2.9 } } }), cues), [], "手写秒数不管");
  // 新组件：挑页要等几页都飞出来（约 0.9 秒），文件卡飞进来约 0.6 秒
  assert.deepEqual(lateAnimations(frame({ kit: { name: "pick", opts: { pickAt: "@翻" } } }), cues).map((x) => x.readable), [3.3]);
  assert.deepEqual(lateAnimations(frame({ kit: { name: "attach", opts: { fileAt: "@先去" } } }), cues), []);
});

test("captionZoneSpec：竖屏字幕带 y 1160–1440（内容框下沿到字幕带底），每帧结尾各查一次", () => {
  assert.equal(captionZoneSpec([2.2, 4.2], 5), "x0=0;y0=0.6042;x1=1;y1=0.75;severity=error;seek=0.44,0.84");
  assert.equal(captionZoneSpec([], 5), null);
});

test("boundsTimes：每帧取中段和结尾前 0.3 秒；有转场重叠时结尾取在下一帧进场之前", () => {
  assert.deepEqual(boundsTimes([{ start: 0, end: 4 }, { start: 3.5, end: 8 }]), [1.75, 3.2, 5.75, 7.7]);
});

test("cleanIndex：注入隐藏底色、四角框、角标、进度条、字幕的样式，根节点底色改黑", () => {
  const html = "<html><head><style>#root{background:#F4F1EA}</style></head><body></body></html>";
  const out = cleanIndex(html);
  assert.ok(out.indexOf("data-nv-bounds") < out.indexOf("</head>"));
  for (const sel of ["#el-captions", ".kit-hud", ".kit-kicker", ".kit-progress", ".kit-atmo", '[id$="-ground"]', "#root", "box-shadow:none"]) assert.ok(out.includes(sel), sel);
});

test("occludedText：check 输出里 text_occluded 不管 ℹ 还是 ✗ 都挑出来", async () => {
  const { occludedText } = await import("../scripts/hf-build.mjs");
  const out = [
    "  ℹ t=4.445s container_overflow div.kit-shot-world — Element extends outside a clipping layout container.",
    "  ℹ t=7.74s text_occluded #p01-l inside #p01-k > img \"十秒 · 一分钱没花\" — Text is hidden beneath an opaque element.",
    "  ✗ t=66.67-68.34s (2 samples) text_occluded #p12-l inside #p12-k > img \"就这三步，\" — Text is hidden beneath an opaque element.",
  ].join("\n");
  const found = occludedText(out);
  assert.equal(found.length, 2);
  assert.match(found[0], /#p01-l/);
  assert.match(found[1], /#p12-l/);
  assert.deepEqual(occludedText("  ◇ 0 issues"), []);
});

test("snapshotPaths：--motion 的过程图单独存，不碰 ③ 用的 sheet.jpg", async () => {
  const { snapshotPaths } = await import("../scripts/hf-build.mjs");
  assert.deepEqual(snapshotPaths(false), { dir: "snapshots", sheet: "snapshots/sheet.jpg" });
  assert.deepEqual(snapshotPaths(true), { dir: "snapshots/motion", sheet: "snapshots/motion-sheet.jpg" });
});
