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
