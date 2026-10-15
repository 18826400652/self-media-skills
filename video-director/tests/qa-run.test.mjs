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
