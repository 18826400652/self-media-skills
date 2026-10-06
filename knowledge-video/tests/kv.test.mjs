import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const KV = fileURLToPath(new URL("../scripts/kv.mjs", import.meta.url));
const claim = (id) => ({ id, text: "事实", kind: "fact", confidence: "high", sources: [{ title: "T", url: "https://a.com", type: "official", quote: "原文", accessed: "2026-10-07" }] });
const SCRIPT = "## Line 1 — 钩子 (Frame 1)\n\n**依据:** c01\n\n    它先翻资料再回答。\n";

/** 建一个作品目录：files = { 相对路径: 内容（对象自动转 JSON） } */
export function episode(files) {
  const dir = mkdtempSync(join(tmpdir(), "kv-"));
  for (const [p, v] of Object.entries(files)) {
    mkdirSync(join(dir, p, ".."), { recursive: true });
    writeFileSync(join(dir, p), typeof v === "string" ? v : JSON.stringify(v));
  }
  return dir;
}
const kv = (...args) => spawnSync(process.execPath, [KV, ...args], { encoding: "utf8" });

test("kv check：研究和脚本都合格 → 退出码 0", () => {
  const r = kv("check", episode({ "research.json": { claims: [claim("c01")] }, "抖音/SCRIPT.md": SCRIPT }));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /✓ research\.json：1 条事实/);
  assert.match(r.stdout, /✓ 抖音\/SCRIPT\.md：1 句口播都标了依据/);
});

test("kv check：引用不存在的 claim、research.json 坏了 → 退出码 1", () => {
  const r = kv("check", episode({ "research.json": { claims: [claim("c02")] }, "抖音/SCRIPT.md": SCRIPT }));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /✗ 第 1 句：引用的 c01 不在 research\.json 里/);
  assert.match(r.stdout, /⚠ c02 没被脚本用到/);
  const bad = kv("check", episode({ "research.json": "{坏", "抖音/SCRIPT.md": SCRIPT }));
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /✗ research\.json 不是合法 JSON/);
});

test("kv check：research.json 内容是 null 也要报错", () => {
  const r = kv("check", episode({ "research.json": "null" }));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /✗ research\.json 必须是一个对象/);
});

test("kv check：SCRIPT 一句都读不到 → 报错；qa.json 存在时一起检查", () => {
  const r = kv("check", episode({ "research.json": { claims: [claim("c01")] }, "抖音/SCRIPT.md": "# 空\n", "qa.json": { passed: true, checked: [], issues: [] } }));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /✗ SCRIPT\.md 里没有读到口播/);
  assert.match(r.stdout, /✗ qa\.json 的 checked 缺少/);
});

test("kv check：实用技巧类不要求 research.json；还没写的文件只提示", () => {
  const r = kv("check", episode({ "run.json": { type: "practical" }, "抖音/SCRIPT.md": "## Line 1 — a (Frame 1)\n\n**依据:** R1\n\n    口播。\n" }));
  assert.equal(r.status, 0, r.stdout);
  const empty = kv("check", episode({ "brief.md": "x" }));
  assert.equal(empty.status, 0);
  assert.match(empty.stdout, /还没有 research\.json/);
});

test("kv：用法错误时提示并退出码 1", () => {
  const r = kv("check");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /用法：kv check\|brief\|status <作品目录>/);
});

test("kv brief：写出研究简报.md；research.json 有错时拒绝", async () => {
  const { readFileSync } = await import("node:fs");
  const dir = episode({ "research.json": { topic: "RAG", claims: [claim("c01")] }, "抖音/SCRIPT.md": SCRIPT });
  const r = kv("brief", dir);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(readFileSync(join(dir, "研究简报.md"), "utf8"), /第 1 句「它先翻资料再回答。」/);
  const bad = kv("brief", episode({ "research.json": { claims: [{ id: "c01" }] } }));
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /research\.json 有错误，先修好（kv check）/);
});

test("kv status：没有 run.json 也能按文件判断；脚本写好后等确认 ①", () => {
  const fresh = kv("status", episode({ "brief.md": "x" }));
  assert.equal(fresh.status, 0, fresh.stderr);
  assert.match(fresh.stdout, /类型：概念科普/);
  assert.match(fresh.stdout, /阶段：research/);
  const waiting = kv("status", episode({ "brief.md": "x", "research.json": { claims: [claim("c01")] }, "抖音/SCRIPT.md": SCRIPT, "run.json": { type: "concept", gates: { script: { passed: false } } } }));
  assert.match(waiting.stdout, /阶段：script/);
  assert.match(waiting.stdout, /等用户确认：① 研究简报 \+ 脚本/);
});

test("kv check / status：claims 写成对象时给中文错误，不报内部错误", () => {
  const dir = episode({ "brief.md": "x", "research.json": { claims: {} }, "抖音/SCRIPT.md": SCRIPT });
  const r = kv("check", dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /✗ research\.json 的 claims 必须是数组/);
  assert.doesNotMatch(r.stdout + r.stderr, /is not a function/);
  const s = kv("status", dir);
  assert.equal(s.status, 0, s.stdout + s.stderr);
  assert.match(s.stdout, /先修好 kv check 报的 ✗/);
});

test("kv status：new-episode 生成的空模板不算做完（实用技巧仍在实测，概念科普仍要写脚本）", () => {
  const tplScript = "## Line 1 — 钩子 (Frame 1)\n\n**重点词:** \n\n    （一句话抛出冲突）\n";
  const practical = kv("status", episode({ "brief.md": "x", "run.json": { type: "practical" }, "实测记录.md": "- 状态：待实测\n", "抖音/SCRIPT.md": tplScript }));
  assert.match(practical.stdout, /阶段：research/);
  const concept = kv("status", episode({ "brief.md": "x", "research.json": { claims: [claim("c01")] }, "抖音/SCRIPT.md": tplScript }));
  assert.match(concept.stdout, /阶段：script/);
  assert.match(concept.stdout, /下一步：按类型档案的结构配方写/);
});
