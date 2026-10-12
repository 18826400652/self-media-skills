import assert from "node:assert/strict";
import { test } from "node:test";
import { STEPS, doneBlocker, gateBlocker, practicalStatus } from "../scripts/lib/practical.mjs";

const allOk = () => Object.fromEntries(STEPS.map((s) => [s.key, { ok: true, why: "" }]));
const gatesPassed = () => Object.fromEntries(["topic", "script", "storyboard", "final"].map((g) => [g, { passed: true, at: "2026-10-12", quote: "通过", stale: false }]));
const facts = (o = {}) => ({ steps: { ...allOk(), ...(o.steps ?? {}) }, gates: { ...gatesPassed(), ...(o.gates ?? {}) } });
const notOk = (why = "没做") => ({ ok: false, why });
const unpassed = { passed: false, at: null, quote: null, stale: false };

test("14 步，四个确认节点挂在 2、7、8、9", () => {
  assert.equal(STEPS.length, 14);
  assert.deepEqual(STEPS.filter((s) => s.gate).map((s) => [s.n, s.gate]), [[2, "topic"], [7, "script"], [8, "storyboard"], [9, "final"]]);
});

test("第一个没做完的步骤是下一步；后面的都不显示 ✓", () => {
  const s = practicalStatus(facts({ steps: { test: notOk("实测记录状态不是「已实测」") } }));
  assert.match(s.next, /实测/);
  assert.match(s.next, /已实测/);
  assert.deepEqual(s.rows.filter((r) => r.done).map((r) => r.n), [1, 2]);
});

test("步骤做完但节点没确认 → 等用户确认，后面不算 ✓", () => {
  const s = practicalStatus(facts({ gates: { script: unpassed } }));
  assert.equal(s.waitingFor, "script");
  assert.match(s.next, /等用户确认.*② 脚本/);
  assert.equal(s.rows.find((r) => r.n === 7).gateState, "waiting");
  assert.equal(s.rows.find((r) => r.n === 7).done, false);
  assert.ok(s.rows.filter((r) => r.n > 7).every((r) => !r.done));
});

test("指纹不一致：节点算没通过，显示「确认后改过」", () => {
  const s = practicalStatus(facts({ gates: { script: { passed: true, at: "2026-10-12", quote: "确认", stale: true } } }));
  assert.equal(s.waitingFor, "script");
  assert.equal(s.rows.find((r) => r.n === 7).gateState, "stale");
  assert.match(s.next, /确认后改过/);
});

test("全部做完 → 下一步「这期做完了」、waitingFor null", () => {
  const s = practicalStatus(facts());
  assert.ok(s.rows.every((r) => r.done));
  assert.equal(s.waitingFor, null);
  assert.equal(s.next, "这期做完了");
});

test("gateBlocker：前置步骤和前一个节点", () => {
  assert.equal(gateBlocker(facts({ gates: { topic: unpassed } }), "topic"), null);
  assert.match(gateBlocker(facts({ steps: { topic: notOk("对标只有 2 条") }, gates: { topic: unpassed } }), "topic"), /第 2 步 选题关.*对标只有 2 条/);
  assert.match(gateBlocker(facts({ gates: { topic: unpassed, script: unpassed } }), "script"), /① 选题关/);
  assert.match(gateBlocker(facts({ steps: { selfcheck: notOk("sc check 有 ✗") }, gates: { script: unpassed } }), "script"), /第 6 步 自检/);
  assert.match(gateBlocker(facts({ gates: { script: { passed: true, at: "x", quote: "y", stale: true }, storyboard: unpassed } }), "storyboard"), /② 脚本.*确认后改过/);
  assert.match(gateBlocker(facts(), "nope"), /没有这个确认节点/);
});

test("doneBlocker：只接受三个草稿键；内容没写好或前面没走完时拒绝", () => {
  assert.equal(doneBlocker(facts({ steps: { wechat: notOk("还没存草稿") } }), "wechat"), null);
  assert.match(doneBlocker(facts(), "blog"), /只能记 wechat、xiaohongshu、douyin/);
  assert.match(doneBlocker(facts({ steps: { wechat: { ok: false, why: "公众号/文章.md 还是空模板", content: false } } }), "wechat"), /空模板/);
  assert.match(doneBlocker(facts({ gates: { final: unpassed }, steps: { wechat: notOk("还没存草稿") } }), "wechat"), /④ 成片/);
});
