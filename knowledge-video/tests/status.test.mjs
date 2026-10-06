import assert from "node:assert/strict";
import { test } from "node:test";
import { detectStatus } from "../scripts/lib/status.mjs";

const base = { type: "concept", hasBrief: true, hasEvidence: true, hasScript: true, checkOk: true, hasStoryboard: true, hasSheet: true, hasRender: true, qa: { passed: true }, gates: { script: true, storyboard: true, final: true } };
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

test("分镜、渲染、QA、成片确认", () => {
  assert.equal(at({ hasStoryboard: false, hasSheet: false, gates: { storyboard: false } }).stage, "storyboard");
  assert.equal(at({ gates: { storyboard: false } }).waitingFor, "storyboard");
  assert.equal(at({ hasRender: false }).stage, "render");
  assert.equal(at({ qa: null }).stage, "review");
  assert.match(at({ qa: { passed: false } }).next, /qa\.json 有未修的问题/);
  assert.equal(at({ gates: { final: false } }).waitingFor, "final");
  assert.equal(at({}).stage, "done");
  assert.match(at({}).next, /经验库/);
});
