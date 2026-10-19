import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { readLedger, recordCustom, writeLedger } from "../scripts/lib/ledger.mjs";
import { project } from "./helpers.mjs";

const EMPTY = { version: 1, items: [] };
const ep = (work, segment = "seg-03", candidate = "dy-shot-diff", need = "两份文件逐行对照") => ({ work, segment, need, candidate });

test("readLedger：文件不存在时是空台账", () => {
  assert.deepEqual(readLedger(join(project({}), "00-规划/镜头候选.json")), EMPTY);
});

test("readLedger：不是合法 JSON 时报错带路径，文件原样不动", () => {
  const dir = project({ "00-规划/镜头候选.json": "{坏了" });
  const p = join(dir, "00-规划/镜头候选.json");
  assert.throws(() => readLedger(p), (err) => err.message.includes(p));
  assert.equal(readFileSync(p, "utf8"), "{坏了");
});

test("recordCustom：新的候选记成 once", () => {
  const { ledger, change } = recordCustom(EMPTY, ep("04-作品/a/01"));
  assert.deepEqual(ledger.items, [{ name: "dy-shot-diff", need: "两份文件逐行对照", status: "once", episodes: [{ work: "04-作品/a/01", segment: "seg-03" }] }]);
  assert.match(change, /新候选 dy-shot-diff/);
});

test("recordCustom：另一期用了同一个候选名 → queued，记下第二期", () => {
  const once = recordCustom(EMPTY, ep("04-作品/a/01")).ledger;
  const { ledger, change } = recordCustom(once, ep("04-作品/a/02", "seg-05"));
  assert.equal(ledger.items[0].status, "queued");
  assert.deepEqual(ledger.items[0].episodes.map((e) => e.work), ["04-作品/a/01", "04-作品/a/02"]);
  assert.match(change, /第 2 次出现.*该磨了/);
});

test("recordCustom：同一期同一段再跑一次不变（vd check 幂等）", () => {
  const once = recordCustom(EMPTY, ep("04-作品/a/01")).ledger;
  const again = recordCustom(once, ep("04-作品/a/01"));
  assert.deepEqual(again.ledger, once);
  assert.equal(again.change, null);
});

test("recordCustom：已入库的给出提示、状态不变；不做的保持 dropped", () => {
  const done = { version: 1, items: [{ name: "dy-shot-diff", need: "x", status: "done", shot: "dy-shot-diff", episodes: [] }] };
  const r = recordCustom(done, ep("04-作品/a/03"));
  assert.deepEqual(r.ledger, done);
  assert.match(r.change, /dy-shot-diff 已入库为 dy-shot-diff，这段可以直接用/);
  const dropped = { version: 1, items: [{ name: "dy-shot-diff", need: "x", status: "dropped", episodes: [] }] };
  assert.deepEqual(recordCustom(dropped, ep("04-作品/a/03")).ledger, dropped);
});

test("recordCustom：不改传进来的台账", () => {
  const once = recordCustom(EMPTY, ep("04-作品/a/01")).ledger;
  const before = JSON.stringify(once);
  recordCustom(once, ep("04-作品/a/02"));
  assert.equal(JSON.stringify(once), before);
});

test("writeLedger：建目录、写成带缩进的 JSON", () => {
  const p = join(project({}), "00-规划/镜头候选.json");
  writeLedger(p, recordCustom(EMPTY, ep("w")).ledger);
  assert.equal(readLedger(p).items[0].name, "dy-shot-diff");
  assert.match(readFileSync(p, "utf8"), /\n  "items"/);
});

test("recordLedger：工程里每个 custom 段记进台账，work 是作品目录相对项目根；有变化才写文件", async () => {
  const { recordLedger } = await import("../scripts/lib/ledger.mjs");
  const root = project({ "04-作品/a/01-周报/抖音/x": "" });
  const segs = [{ id: "seg-01", component: "dy-shot-proof" }, { id: "seg-03", custom: { reason: "r", need: "两份文件逐行对照", candidate: "dy-shot-diff" } }];
  const changes = recordLedger({ root, projectDir: join(root, "04-作品/a/01-周报/抖音"), segments: segs });
  assert.deepEqual(changes, ["新候选 dy-shot-diff：两份文件逐行对照（04-作品/a/01-周报 seg-03，第 1 次出现）"]);
  const p = join(root, "00-规划/镜头候选.json");
  assert.equal(readLedger(p).items[0].episodes[0].work, "04-作品/a/01-周报");
  writeFileSync(p, readFileSync(p, "utf8") + "\n");
  const before = readFileSync(p, "utf8");
  assert.deepEqual(recordLedger({ root, projectDir: join(root, "04-作品/a/01-周报/抖音"), segments: segs }), []);
  assert.equal(readFileSync(p, "utf8"), before, "没变化不重写");
});
