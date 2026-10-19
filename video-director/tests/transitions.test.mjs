import assert from "node:assert/strict";
import { test } from "node:test";
import { transitionPlan } from "../scripts/lib/transitions.mjs";

const shot = (id, start, duration, extra = {}) => ({ id, start, duration, component: "dy-shot-proof", transition: "auto", ...extra });

test("transitionPlan：前一段延长 0.6 秒、带 exit；后一段时间不变、带同方向的 enter", () => {
  const [a, b] = transitionPlan([shot("a", 0, 5), shot("b", 5, 4)]);
  assert.deepEqual(a, { id: "a", start: 0, duration: 5.6, enter: null, exit: "pan-left:0.6" });
  assert.deepEqual(b, { id: "b", start: 5, duration: 4, enter: "pan-left:0.6", exit: null });
});

test("transitionPlan：auto 的方向按交界依次轮换 pan-left、pan-up、pan-right、pan-down", () => {
  const plan = transitionPlan([shot("a", 0, 3), shot("b", 3, 3), shot("c", 6, 3), shot("d", 9, 3), shot("e", 12, 3)]);
  assert.deepEqual(plan.map((p) => p.exit), ["pan-left:0.6", "pan-up:0.6", "pan-right:0.6", "pan-down:0.6", null]);
});

test("transitionPlan：写了具体方向就用它；none 是硬切", () => {
  const plan = transitionPlan([shot("a", 0, 3, { transition: "pan-down" }), shot("b", 3, 3, { transition: "none" }), shot("c", 6, 3)]);
  assert.equal(plan[0].exit, "pan-down:0.6");
  assert.equal(plan[1].enter, "pan-down:0.6");
  assert.equal(plan[1].exit, null);
  assert.equal(plan[1].duration, 3);
  assert.equal(plan[2].enter, null);
});

test("transitionPlan：短于 1.2 秒的段两边都不做转场", () => {
  const plan = transitionPlan([shot("a", 0, 3), shot("b", 3, 1), shot("c", 4, 3)]);
  assert.deepEqual(plan.map((p) => [p.enter, p.exit, p.duration]), [[null, null, 3], [null, null, 1], [null, null, 3]]);
});

test("transitionPlan：一个镜头和 custom 都没有的老 DIRECTOR 保持硬切", () => {
  const plan = transitionPlan([{ id: "a", start: 0, duration: 3, transition: "auto" }, { id: "b", start: 3, duration: 3, component: "dy-stamp", transition: "auto" }]);
  assert.deepEqual(plan.map((p) => [p.enter, p.exit, p.duration]), [[null, null, 3], [null, null, 3]]);
});

test("transitionPlan：custom 段也参与转场", () => {
  const plan = transitionPlan([{ id: "a", start: 0, duration: 3, custom: { reason: "r" }, transition: "auto" }, shot("b", 3, 3)]);
  assert.equal(plan[0].exit, "pan-left:0.6");
});
