import assert from "node:assert/strict";
import { test } from "node:test";
import { QA_CHECKS, validateQa } from "../scripts/lib/qa.mjs";

const ok = { passed: true, checked: [...QA_CHECKS], issues: [{ frame: 2, severity: "low", check: "rhythm", problem: "p", fix: "f" }] };
const msgs = (d) => validateQa(d).map((i) => i.msg);

test("合格的 qa.json 没有问题", () => {
  assert.deepEqual(QA_CHECKS, ["safe-area", "text-size", "density", "typo", "fact-on-screen", "rhythm"]);
  assert.deepEqual(validateQa(ok), []);
});

test("checked 缺项、severity 非法、passed 却有 high 级问题", () => {
  assert.match(msgs({ ...ok, checked: ["typo"] })[0], /checked 缺少：safe-area、text-size、density、fact-on-screen、rhythm/);
  assert.match(msgs({ ...ok, issues: [{ ...ok.issues[0], severity: "urgent" }] })[0], /第 1 个问题：severity 只能是 high、medium、low/);
  assert.match(msgs({ ...ok, issues: [{ ...ok.issues[0], severity: "high" }] })[0], /passed 为 true 时不能有 high 级问题/);
  assert.deepEqual(msgs({ ...ok, passed: false, issues: [{ ...ok.issues[0], severity: "high" }] }), []);
});

test("格式不对：不是对象、passed 不是布尔、issues 不是数组", () => {
  assert.match(msgs(null)[0], /qa\.json 必须是一个对象/);
  assert.ok(msgs({ ...ok, passed: "yes" }).some((m) => /passed 必须是 true 或 false/.test(m)));
  assert.ok(msgs({ ...ok, issues: {} }).some((m) => /issues 必须是数组/.test(m)));
});
