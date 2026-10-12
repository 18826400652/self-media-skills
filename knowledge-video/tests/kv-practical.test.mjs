import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { episode } from "./helpers.mjs";

const KV = fileURLToPath(new URL("../scripts/kv.mjs", import.meta.url));
const bin = mkdtempSync(join(tmpdir(), "kvbin-"));
const fake = (name, body) => { const p = join(bin, name); writeFileSync(p, `#!/bin/sh\n${body}\n`); chmodSync(p, 0o755); return p; };
const SC_OK = fake("sc-ok", `echo '{"items":[]}'`);
const NV_OK = fake("nv-ok", "exit 0");
const kv = (env, ...args) => spawnSync(process.execPath, [KV, ...args], { encoding: "utf8", env: { ...process.env, KV_SC_CMD: SC_OK, KV_NV_CMD: NV_OK, ...env } });
const readRun = (dir) => JSON.parse(readFileSync(join(dir, "run.json"), "utf8"));
const practical = (files = {}) => episode({ "场景卡.md": "x", "选题关.md": "- 用户确认：（）\n", "实测/r.mp4": "x", ...files });

test("实用类目录没有 run.json：status 提示先 kv init", () => {
  const r = kv({}, "status", practical());
  assert.equal(r.status, 1);
  assert.match(r.stderr, /kv init/);
});

test("kv init：有场景卡 → practical；再 init 报错；--fresh 记模板哈希", () => {
  const dir = practical({ "公众号/文章.md": "tpl" });
  assert.equal(kv({}, "init", dir, "--fresh").status, 0);
  const run = readRun(dir);
  assert.equal(run.type, "practical");
  assert.ok(run.templates["公众号/文章.md"]);
  assert.equal(kv({}, "init", dir).status, 1);
  const concept = episode({ "brief.md": "x" });
  kv({}, "init", concept);
  assert.equal(readRun(concept).type, "concept");
});

test("status：前 6 步做完、选题关没确认 → 等用户确认 ①", () => {
  const dir = practical();
  kv({}, "init", dir);
  const r = kv({}, "status", dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /✓ +1 场景卡/);
  assert.match(r.stdout, /· +2 选题关 +① 选题关 等用户确认/);
  assert.match(r.stdout, /下一步：等用户确认 ① 选题关/);
});

test("kv gate topic：记原话、日期、指纹，同步写选题关.md；原话有换行压成一行", () => {
  const dir = practical();
  kv({}, "init", dir);
  const r = kv({}, "gate", dir, "topic", "按你的\n建议");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const g = readRun(dir).gates.topic;
  assert.equal(g.passed, true);
  assert.equal(g.quote, "按你的 建议");
  assert.match(g.at, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(readFileSync(join(dir, "选题关.md"), "utf8"), /^- 用户确认：\d{4}-\d{2}-\d{2} 通过（用户：「按你的 建议」）$/m);
  assert.match(kv({}, "status", dir).stdout, /✓ +2 选题关 +① 选题关 ✓/);
});

test("kv gate --edit：只追加修改意见，不通过", () => {
  const dir = practical();
  kv({}, "init", dir);
  assert.equal(kv({}, "gate", dir, "topic", "--edit", "标题再短点").status, 0);
  const g = readRun(dir).gates.topic;
  assert.equal(g.passed, false);
  assert.deepEqual(g.edits.map((e) => e.quote), ["标题再短点"]);
});

test("kv gate 被拒：前面没做完 / 跳节点 → 退出码 1，run.json 不变", () => {
  const SC_BAD = fake("sc-bad", `echo '{"items":[{"level":"✗","msg":"场景卡未填写：时间","file":"场景卡.md"}]}'`);
  const dir = practical();
  kv({}, "init", dir);
  const before = readFileSync(join(dir, "run.json"), "utf8");
  const r = kv({ KV_SC_CMD: SC_BAD }, "gate", dir, "topic", "通过");
  assert.equal(r.status, 1);
  assert.match(r.stdout + r.stderr, /场景卡未填写：时间/);
  const r2 = kv({}, "gate", dir, "script", "确认");
  assert.equal(r2.status, 1);
  assert.match(r2.stdout, /① 选题关 还没确认/);
  assert.equal(readFileSync(join(dir, "run.json"), "utf8"), before);
});

test("确认后改了选题关 → status 显示确认后改过", () => {
  const dir = practical();
  kv({}, "init", dir);
  kv({}, "gate", dir, "topic", "通过");
  writeFileSync(join(dir, "选题关.md"), readFileSync(join(dir, "选题关.md"), "utf8") + "\n改了\n");
  assert.match(kv({}, "status", dir).stdout, /确认后改过/);
});

test("kv done：未知键、前面没走完都拒绝", () => {
  const dir = practical();
  kv({}, "init", dir);
  assert.match(kv({}, "done", dir, "blog").stderr, /只能记/);
  const r = kv({}, "done", dir, "wechat");
  assert.equal(r.status, 1);
});

test("sc 命令不存在：status 不崩，说明原因", () => {
  const dir = practical();
  kv({}, "init", dir);
  const r = kv({ KV_SC_CMD: "/nonexistent/sc" }, "status", dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /找不到 \/nonexistent\/sc 命令/);
});
