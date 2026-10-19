import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { douyinQa } from "../scripts/lib/qa-run.mjs";
import { project } from "./helpers.mjs";

const built = { cues: { 钩子: 1 }, segments: [{ id: "s1", start: 0, duration: 4 }], total: 4 };
const CONTENT = { sel: "#c", text: true, key: false, allowSafe: false, box: [100, 300, 500, 400], opacity: 1 }; // 一个位置正常的内容元素：画面不是空的
const blank = { elements: [CONTENT], cueMarks: [], kicker: { visible: true, occludedBy: null } };

function fakePage(dataAt) {
  const seen = [];
  return {
    seen,
    duration: 5,
    frame: async (t) => { seen.push(t); return dataAt(t); },
    shot: async (path) => { (await import("node:fs")).writeFileSync(path, "png"); },
    shot64: async () => "png-base64",
    pixels: async () => ({ vivid: 1.2, dark: 1.0, meanL: 88, stdL: 12 }),
  };
}

test("douyinQa：每个落定时刻截一张图；画面一直在变 → 通过", async () => {
  const dir = project({});
  const page = fakePage((t) => ({ ...blank, sig: String(t) }));
  const r = await douyinQa(built, page, join(dir, "snapshots/cues"));
  assert.equal(r.passed, true);
  assert.deepEqual(r.shots.map((s) => [s.t, s.label, s.file]), [[0.8, "首帧", "snapshots/cues/01.png"], [1.8, "@钩子", "snapshots/cues/02.png"], [3.7, "s1 结尾", "snapshots/cues/03.png"]]);
  assert.ok(existsSync(join(dir, "snapshots/cues/01.png")));
  assert.ok(page.seen.includes(0) && page.seen.includes(3.5), "grid 也取了");
});

test("douyinQa：有 ✗ 不通过；2 秒不动只给 ⚠，不影响通过", async () => {
  const dir = project({});
  const bad = await douyinQa(built, fakePage(() => ({ ...blank, sig: "x", elements: [{ sel: "#t", text: true, key: false, allowSafe: false, box: [100, 100, 300, 160], opacity: 1 }] })), join(dir, "a"));
  assert.equal(bad.passed, false);
  assert.ok(bad.issues.some((i) => i.level === "error" && /#t 进了顶部 200 像素.*（共 3 处）/.test(i.msg)));
  assert.ok(bad.issues.some((i) => i.level === "warn" && /0–3\.5 秒画面没有变化/.test(i.msg)));
  const still = await douyinQa(built, fakePage(() => ({ ...blank, sig: "x" })), join(dir, "b"));
  assert.equal(still.passed, true);
});

test("presentSegments：按 index.html 里的 host-<段id> 找出这次构建了哪些段", async () => {
  const { presentSegments } = await import("../scripts/lib/qa-run.mjs");
  const segs = [{ id: "seg-01" }, { id: "seg-02" }, { id: "seg-03" }];
  assert.deepEqual(presentSegments('<div id="host-seg-01"></div><div id="host-seg-03"></div><div id="host-brand-kicker">', segs).map((s) => s.id), ["seg-01", "seg-03"]);
  assert.throws(() => presentSegments("<html>", segs), /index\.html 里没有分段：先 vd build/);
});

test("staleBuild：cues.js 和 DIRECTOR.md 算出来的不一样（改了 @词或分段没重新构建）→ 提示先 vd build", async () => {
  const { writeFileSync } = await import("node:fs");
  const { staleBuild } = await import("../scripts/lib/qa-run.mjs");
  const { cuesJs } = await import("../scripts/lib/assemble.mjs");
  const dir = project({});
  const b = { cues: { 甲: 1 }, segments: [{ id: "s1", start: 0, duration: 5 }] };
  assert.match(staleBuild(dir, b), /还没有 cues\.js.*先 vd build/);
  writeFileSync(join(dir, "cues.js"), cuesJs(b));
  assert.equal(staleBuild(dir, b), null);
  assert.match(staleBuild(dir, { ...b, cues: { 甲: 1.5 } }), /DIRECTOR\.md 在上次 vd build 之后改过.*先 vd build/);
});

test("buildProblem：没构建过 / 上次检查没过 / 画面在构建后改过 → 都不让 vd qa 跑", async () => {
  const { mkdirSync, utimesSync, writeFileSync } = await import("node:fs");
  const { buildProblem, writeBuildStatus } = await import("../scripts/lib/qa-run.mjs");
  const dir = project({ "index.html": "<html>", "compositions/frames/s1.html": "<div>" });
  assert.match(buildProblem(dir), /先 vd build/);
  writeBuildStatus(dir, false);
  assert.match(buildProblem(dir), /上次 vd build 的检查没过/);
  writeBuildStatus(dir, true);
  assert.equal(buildProblem(dir), null);
  const later = Date.now() / 1000 + 60;
  utimesSync(join(dir, "compositions/frames/s1.html"), later, later);
  assert.match(buildProblem(dir), /s1\.html.*上次 vd build 之后改过/);
});

test("douyinQa：视觉工艺只给 warn，不影响 passed；返回 craft 指标", async () => {
  const dir = project({});
  const page = fakePage(() => ({
    ...blank,
    sig: String(Math.random()),
    blocks: [{ sel: "#c", box: [100, 300, 500, 800], opacity: 1, shadow: "none", rot: 0, bgImage: false }],
    texts: [{ sel: "#t", box: [100, 900, 900, 960], opacity: 1, fontSize: 46, fontWeight: 900, color: "rgb(0,0,0)" }],
  }));
  const r = await douyinQa(built, page, join(dir, "snapshots/cues"));
  assert.equal(r.passed, true);
  assert.ok(r.issues.some((i) => i.kind === "craft-type" && i.level === "warn"));
  assert.equal(r.craft.first.maxFont, 46);
});
