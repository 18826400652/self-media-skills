import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { episode } from "./helpers.mjs";

const KV = fileURLToPath(new URL("../scripts/kv.mjs", import.meta.url));
const bin = mkdtempSync(join(tmpdir(), "kvbin-"));
const fake = (name, body) => { const p = join(bin, name); writeFileSync(p, `#!/bin/sh\n${body}\n`); chmodSync(p, 0o755); return p; };
const SC_OK = fake("sc-ok", `echo '{"items":[]}'`);
const VO_OK = fake("vo-ok", "exit 0");
const kv = (env, ...args) => spawnSync(process.execPath, [KV, ...args], { encoding: "utf8", env: { ...process.env, KV_SC_CMD: SC_OK, KV_VO_CMD: VO_OK, ...env } });
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

test("kv gate 同一节点再确认：上一次的原话和日期留在 history 里，不被覆盖", () => {
  const dir = practical();
  kv({}, "init", dir);
  kv({}, "gate", dir, "topic", "第一次通过");
  writeFileSync(join(dir, "选题关.md"), readFileSync(join(dir, "选题关.md"), "utf8") + "\n实测后数字改了\n");
  assert.equal(kv({}, "gate", dir, "topic", "改后的也通过").status, 0);
  const g = readRun(dir).gates.topic;
  assert.equal(g.quote, "改后的也通过");
  assert.deepEqual(g.history.map((h) => h.quote), ["第一次通过"]);
  assert.match(g.history[0].at, /^\d{4}-\d{2}-\d{2}$/);
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

test("已通过的节点再提修改意见 → 变回没通过", () => {
  const dir = practical();
  kv({}, "init", dir);
  kv({}, "gate", dir, "topic", "通过");
  assert.equal(kv({}, "gate", dir, "topic", "--edit", "标题还是改一下").status, 0);
  const g = readRun(dir).gates.topic;
  assert.equal(g.passed, false);
  assert.match(kv({}, "status", dir).stdout, /① 选题关 等用户确认/);
});

const VD_OK = fake("vd-ok", "exit 0");

test("kv init：run.json 里没有 video 字段，也没有 storyboard 节点", () => {
  const dir = practical();
  assert.equal(kv({}, "init", dir).status, 0);
  const run = readRun(dir);
  assert.equal("video" in run, false);
  assert.deepEqual(Object.keys(run.gates), ["topic", "script", "director", "sample", "final"]);
});

test("老 run.json（带 video: director）：status 显示 15 步；kv gate director 前面没做完时拒绝，不报没有这个节点", () => {
  const dir = practical();
  writeFileSync(join(dir, "run.json"), JSON.stringify({ type: "practical", video: "director", gates: { topic: { passed: false } }, done: {}, templates: {} }));
  const s = kv({ KV_VD_CMD: VD_OK }, "status", dir);
  assert.equal(s.status, 0, s.stderr);
  assert.match(s.stdout, / 8 配音 \+ 导演脚本/);
  assert.match(s.stdout, / 9 风格样片/);
  assert.match(s.stdout, /15 复盘/);
  const g = kv({ KV_VD_CMD: VD_OK }, "gate", dir, "director", "通过");
  assert.equal(g.status, 1);
  assert.match(g.stdout, /还不能记 ③a 导演脚本/);
});

test("kv 传的不是一期作品目录（如作品根目录 04-作品）：报错并列出下面的作品，不当成一期来判断", () => {
  const works = mkdtempSync(join(tmpdir(), "kv-works-"));
  const ep = join(works, "AI办公", "01-群聊");
  mkdirSync(join(ep, "抖音"), { recursive: true });
  writeFileSync(join(ep, "场景卡.md"), "x");
  for (const cmd of ["status", "init", "check"]) {
    const r = kv({}, cmd, works);
    assert.equal(r.status, 1, cmd);
    assert.match(r.stderr, /不是一期作品的目录/, cmd);
    assert.match(r.stderr, /AI办公\/01-群聊/, cmd);
  }
  const empty = mkdtempSync(join(tmpdir(), "kv-works-"));
  assert.match(kv({}, "status", empty).stderr, /下面也没有作品：先 st new/);
  assert.equal(readdirSync(works).includes("run.json"), false, "不往根目录写 run.json");
});

test("确认 ① 后改了场景卡 → ① 也是确认后改过，说出改的是场景卡", () => {
  const dir = practical();
  kv({}, "init", dir);
  kv({}, "gate", dir, "topic", "通过");
  assert.deepEqual(Object.keys(readRun(dir).gates.topic.files).sort(), ["场景卡.md", "选题关.md"]);
  writeFileSync(join(dir, "场景卡.md"), "换了个人");
  assert.match(kv({}, "status", dir).stdout, /确认后改过[^\n]*场景卡\.md/);
});

test("老的 ① 记录（指纹只算选题关）照样认，不因为加了场景卡就失效", () => {
  const dir = practical();
  kv({}, "init", dir);
  kv({}, "gate", dir, "topic", "通过");
  const run = readRun(dir);
  const sel = readFileSync(join(dir, "选题关.md"));
  run.gates.topic = { passed: true, at: run.gates.topic.at, quote: "通过", fingerprint: createHash("sha256").update("选题关.md").update(sel).digest("hex") };
  writeFileSync(join(dir, "run.json"), JSON.stringify(run));
  assert.doesNotMatch(kv({}, "status", dir).stdout, /确认后改过/);
});

test("kv init --unsettled：记进 run.json，status 一直提醒这期是方向没定时开的", () => {
  const dir = practical();
  assert.equal(kv({}, "init", dir, "--fresh", "--unsettled", "账号方向还没填完").status, 0);
  assert.equal(readRun(dir).unsettled.note, "账号方向还没填完");
  assert.match(kv({}, "status", dir).stdout, /⚠ .*--先不定.*账号方向还没填完/);
});
