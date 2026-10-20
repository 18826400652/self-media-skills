// 长时间合成时定时报一声，看得出是慢不是卡住
import assert from "node:assert/strict";
import { test } from "node:test";
import { withHeartbeat } from "../scripts/lib/speech.mjs";

const wait = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));

test("withHeartbeat：没完成前按间隔打印已等多久，完成后停，返回原结果", async () => {
  const logs = [];
  const v = await withHeartbeat(wait(130, "ok"), { everyMs: 50, log: (m) => logs.push(m) });
  assert.equal(v, "ok");
  assert.equal(logs.length, 2);
  assert.match(logs[0], /这一段还没好，已等 \d+ 秒/);
  const n = logs.length;
  await wait(120);
  assert.equal(logs.length, n, "完成后不再打印");
});

test("withHeartbeat：出错照样抛出，定时器清掉", async () => {
  const logs = [];
  await assert.rejects(withHeartbeat(wait(20).then(() => { throw new Error("坏了"); }), { everyMs: 5, log: (m) => logs.push(m) }), /坏了/);
  const n = logs.length;
  await wait(30);
  assert.equal(logs.length, n);
});
