import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { douyinQa } from "../scripts/lib/qa-run.mjs";
import { project } from "./helpers.mjs";

const built = { cues: { 钩子: 1 }, segments: [{ id: "s1", start: 0, duration: 4 }], total: 4 };
const blank = { elements: [], cueMarks: [], kicker: { visible: true, occludedBy: null } };

function fakePage(dataAt) {
  const seen = [];
  return {
    seen,
    duration: 5,
    frame: async (t) => { seen.push(t); return dataAt(t); },
    shot: async (path) => { (await import("node:fs")).writeFileSync(path, "png"); },
  };
}

test("douyinQa：每个落定时刻截一张图；画面一直在变 → 通过", async () => {
  const dir = project({});
  const page = fakePage((t) => ({ ...blank, sig: String(t) }));
  const r = await douyinQa(built, page, join(dir, "snapshots/cues"));
  assert.equal(r.passed, true);
  assert.deepEqual(r.shots.map((s) => [s.t, s.label, s.file]), [[1.8, "@钩子", "snapshots/cues/01.png"], [3.7, "s1 结尾", "snapshots/cues/02.png"]]);
  assert.ok(existsSync(join(dir, "snapshots/cues/01.png")));
  assert.ok(page.seen.includes(0) && page.seen.includes(3.5), "grid 也取了");
});

test("douyinQa：有 ✗ 不通过；2 秒不动只给 ⚠，不影响通过", async () => {
  const dir = project({});
  const bad = await douyinQa(built, fakePage(() => ({ ...blank, sig: "x", elements: [{ sel: "#t", text: true, key: false, allowSafe: false, box: [100, 100, 300, 160], opacity: 1 }] })), join(dir, "a"));
  assert.equal(bad.passed, false);
  assert.ok(bad.issues.some((i) => i.level === "error" && /#t 进了顶部 200 像素.*（共 2 处）/.test(i.msg)));
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
