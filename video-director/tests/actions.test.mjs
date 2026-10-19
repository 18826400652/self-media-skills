import assert from "node:assert/strict";
import { test } from "node:test";
import { actionsBlock, applyHead } from "../scripts/lib/assemble.mjs";
import { ACTIONS_JS } from "../scripts/lib/actions.mjs";

test("actionsBlock：注入动作库，段里能调 VDACT", () => {
  const js = actionsBlock();
  assert.match(js, /window\.VDACT/);
  for (const n of ["pushIn", "popIn", "stamp", "highlight", "maskReveal"]) assert.ok(js.includes(n), n);
});

test("ACTIONS_JS：动作先 set 初态再 to，不用 fromTo", () => {
  assert.doesNotMatch(ACTIONS_JS, /fromTo/);
  assert.match(ACTIONS_JS, /gsap\.set/);
});

test("applyHead：有 vd:head 标记时注入动作库；旧工程原样返回", () => {
  assert.match(applyHead("<!-- vd:head --><!-- /vd:head -->", false), /VDACT/);
  assert.equal(applyHead("<div></div>", false), "<div></div>");
});

import vm from "node:vm";

/** 在假的 gsap / 宿主里跑动作库，记下 set / to 调用 */
function runPan(attrs, endAt) {
  const calls = [];
  const host = { getAttribute: (k) => attrs[k] ?? null };
  const root = { parentElement: host };
  const ctx = { window: {}, gsap: { set: (el, v) => calls.push(["set", v]) } };
  vm.runInNewContext(ACTIONS_JS, ctx);
  const tl = { to: (el, v, at) => calls.push(["to", v, at]) };
  ctx.window.VDACT.panInOut(tl, root, endAt);
  return JSON.parse(JSON.stringify(calls)); // 沙箱里的对象原型不同，转成普通对象再比

}

test("VDACT.panInOut：pan-left 从右边进来（x 1080 → 0），段尾往左出去（0 → -1080），带运动模糊", () => {
  const calls = runPan({ "data-vd-enter": "pan-left:0.6", "data-vd-exit": "pan-left:0.6" }, 5);
  assert.deepEqual(calls[0], ["set", { x: 1080, y: 0, filter: "blur(12px)" }]);
  assert.deepEqual(calls[1], ["to", { x: 0, y: 0, filter: "blur(0px)", duration: 0.6, ease: "power2.inOut" }, 0]);
  assert.deepEqual(calls[2], ["to", { x: -1080, y: 0, filter: "blur(12px)", duration: 0.6, ease: "power2.inOut" }, 5]);
});

test("VDACT.panInOut：pan-up 在竖直方向走 1920；没有 data-vd-enter / exit 时什么都不做", () => {
  const calls = runPan({ "data-vd-exit": "pan-up:0.6" }, 3);
  assert.deepEqual(calls, [["to", { x: 0, y: -1920, filter: "blur(12px)", duration: 0.6, ease: "power2.inOut" }, 3]]);
  assert.deepEqual(runPan({}, 3), []);
});
