import assert from "node:assert/strict";
import { test } from "node:test";
import { detectStatus } from "../scripts/lib/status.mjs";

const base = { type: "concept", hasBrief: true, hasEvidence: true, hasScript: true, checkOk: true, hasDirector: true, hasSample: true, sampleQa: { passed: true }, hasRender: true, vdQa: { passed: true }, qa: { passed: true }, gates: { script: true, director: true, sample: true, final: true } };
const at = (o) => detectStatus({ ...base, ...o, gates: { ...base.gates, ...(o.gates ?? {}) } });

test("按顺序找到第一个没完成的阶段", () => {
  assert.equal(at({ hasBrief: false }).stage, "brief");
  assert.equal(at({ hasEvidence: false }).stage, "research");
  assert.match(at({ hasEvidence: false }).next, /research\.json/);
  assert.match(at({ type: "practical", hasEvidence: false }).next, /实测记录\.md/);
  assert.equal(at({ hasScript: false }).stage, "script");
});

test("脚本写好：kv check 不过先修；过了等确认节点 ①", () => {
  assert.match(at({ checkOk: false, gates: { script: false } }).next, /kv check/);
  assert.deepEqual(at({ gates: { script: false } }), { stage: "script", next: "kv brief 生成研究简报，请用户确认研究简报和脚本（确认节点 ①）", waitingFor: "script" });
});

test("渲染、QA、成片确认", () => {
  assert.equal(at({ hasRender: false }).stage, "render");
  assert.equal(at({ qa: null }).stage, "review");
  assert.match(at({ qa: { passed: false } }).next, /qa\.json 有未修的问题/);
  assert.equal(at({ gates: { final: false } }).waitingFor, "final");
  assert.equal(at({}).stage, "done");
  assert.match(at({}).next, /经验库/);
});

test("空模板不算完成：实测记录要「已实测」，SCRIPT 不能还是占位口播", async () => {
  const { isEvidenceFilled, isScriptFilled } = await import("../scripts/lib/status.mjs");
  assert.equal(isEvidenceFilled("practical", "# 实测记录\n\n- 状态：待实测\n"), false);
  assert.equal(isEvidenceFilled("practical", "- 状态：已实测\n"), true);
  assert.equal(isEvidenceFilled("concept", "{}"), true);
  const tpl = "## Line 1 — 钩子 (Frame 1)\n\n**重点词:** \n\n    （一句话抛出冲突）\n";
  assert.equal(isScriptFilled(tpl), false);
  assert.equal(isScriptFilled("# 空\n"), false);
  assert.equal(isScriptFilled("## Line 1 — 钩子 (Frame 1)\n\n    它先翻资料再回答。\n"), true);
});

test("脚本确认后 → 导演脚本 → 等 ②a → 样片 → 等 ②b → 渲染 → vd qa → qa → ③", () => {
  const d = (o) => at(o);
  assert.equal(d({ hasDirector: false }).stage, "director");
  assert.match(d({ hasDirector: false }).next, /^vo 抖音 配音 → 写 抖音\/DIRECTOR\.md（vd cues 抖音 --check 通过）/);
  assert.equal(d({ gates: { director: false } }).waitingFor, "director");
  assert.equal(d({ hasSample: false }).stage, "sample");
  assert.match(d({ hasSample: false }).next, /vd build 抖音 --sample/);
  assert.match(d({ sampleQa: null, gates: { sample: false } }).next, /样片.*vd qa/);
  assert.equal(d({ sampleQa: null, gates: { sample: false } }).waitingFor, null);
  assert.equal(d({ gates: { sample: false } }).waitingFor, "sample");
  assert.equal(d({ hasRender: false }).stage, "render");
  assert.match(d({ hasRender: false }).next, /vd render 抖音/);
  assert.match(d({ vdQa: null }).next, /vd qa/);
  assert.match(d({ vdQa: { passed: false } }).next, /vd qa/);
  assert.equal(d({}).stage, "done");
  assert.doesNotMatch(JSON.stringify([d({ hasDirector: false }), d({ hasSample: false }), d({ hasRender: false })]), /nv |抖音-director/);
});
