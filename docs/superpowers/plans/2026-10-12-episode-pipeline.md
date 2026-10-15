# 一期内容固定流程（kv 管完整的一期）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实用类作品做新一期时，`kv status` 能说出 14 步每一步的状态和下一步；`kv gate` 按顺序记录四个确认节点、确认后改过就失效；`kv done` 记录三个草稿。

**Architecture:** `sc check --json` 输出带文件归属的问题；kv 新加纯函数模块 `practical.mjs`（14 步、确认规则）和读文件模块 `practical-facts.mjs`（收集事实、算指纹、调用 sc / nv）；`kv.mjs` 加 `init`、`gate`、`done` 命令，实用类 `status` 走新模块。概念科普的代码路径不动。

**Tech Stack:** Node 22 ESM，`node --test`，bash（new-episode.sh）。

**Spec:** `docs/superpowers/specs/2026-10-12-episode-pipeline-design.md`

## Global Constraints

- 概念科普（`run.json` 的 `type` 不是 `practical`）的 `kv check|brief|status` 行为和输出不变，现有测试全部通过。
- 文档、命令输出、报错一律中文。
- 不加 Claude Code hook；不给 nv、wa、ic 加拦截。
- `kv gate` / `kv done` 条件不满足时退出码 1、什么都不写。
- 代码在 worktree `/home/power/self-media-wt/kv-pipeline`（分支 `feat/kv-pipeline`）里改；合并前问用户；不推送。
- 不提交 `04-作品/`（gitignored）、视频、配音。

## 与设计文档的差异（Ruling）

- **「已写」的判断**：设计写「不是新建作品时的空模板」。实现：`kv init --fresh`（new-episode.sh 调用）把刚生成的模板文件的 sha256 记进 `run.json.templates`；文件内容和记录的哈希相同 = 没写。老作品 `kv init`（不加 `--fresh`）不记，已有文件都算写过。比猜占位文字可靠，各平台模板写法不同也不怕。
- **③ 分镜的指纹**：设计写 `STORYBOARD.md` + `sheet.jpg`。`sheet.jpg` 每次 `hf-build` 都会重新编码，字节可能不同，改为 `STORYBOARD.md` + `audio_meta.json`（配音改了也要重看）。
- **sc check 「选题关没确认」**：现在 `用户确认` 没填会混在「选题关未填写：…、用户确认」里。拆出来单独一条，带 `code: "topic-unconfirmed"`，kv 判断第 2 步时忽略这一条。
- **已出图**：`小红书/out/` 里有 `NN.png` 且最新的一张比 `卡片.md` 新；抖音封面同理看 `抖音/out/`。

## Review Focus

1. `sc` 或 `nv` 不在 PATH、运行出错：`kv status` 要给中文提示并把对应步骤算没做完，而不是崩溃 → Task 3 测试 `sc 跑不起来`。
2. `run.json` 是旧的概念科普格式却在实用类目录里（第 1 期没有 run.json）：`kv status` 提示先 `kv init`，不能误走概念科普流程 → Task 4 测试 `实用类目录没有 run.json`。
3. 确认之后又改了脚本：节点失效，后面步骤全不算 ✓，`kv gate` 下一个节点被拒 → Task 2 测试 `指纹不一致`。
4. `kv gate` 的用户原话里有换行、引号：写进 JSON 和 `选题关.md` 的那一行不能破坏格式（换行压成空格）→ Task 4 测试 `原话有换行`。
5. 渲染文件比 sheet 旧（改了分镜没重渲）：第 9 步不算做完 → Task 2 测试 `newer` 字段。

---

### Task 1: sc check 带文件归属，加 `--json`

**Files:**
- Modify: `skills/scenario-content/scripts/sc.mjs`（`makeReport`、各 `check*`、`main`）
- Test: `skills/scenario-content/tests/sc.test.mjs`

**Interfaces:**
- Produces: `export function runChecks(ep: string, config: object): {level: "✗"|"⚠"|"✓", msg: string, file: string|null, code?: string}[]`；`export function loadConfig(start)`；CLI `sc check <目录> --json` 输出 `{"items":[...同上]}`，退出码规则不变（有 ✗ 为 1）。

- [ ] **Step 1: 写失败的测试**（追加到 `sc.test.mjs`）

```js
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function ep(files) {
  const dir = mkdtempSync(join(tmpdir(), "sc-"));
  for (const [p, v] of Object.entries(files)) {
    mkdirSync(join(dir, p, ".."), { recursive: true });
    writeFileSync(join(dir, p), v);
  }
  return dir;
}

test("runChecks：每条问题带 file；选题关没确认单独一条 topic-unconfirmed", async () => {
  const { runChecks, loadConfig } = await import("../scripts/sc.mjs");
  const dir = ep({ "选题关.md": "- 标题候选 1：好\n- 用户确认：（用户看过后写）\n" });
  const items = runChecks(dir, loadConfig(dir));
  const gate = items.filter((i) => i.file === "选题关.md");
  assert.ok(gate.some((i) => i.code === "topic-unconfirmed" && i.level === "✗"));
  assert.ok(!gate.some((i) => /未填写：.*用户确认/.test(i.msg)));
  assert.ok(items.some((i) => i.file === "场景卡.md" && i.level === "✗"));
  assert.ok(items.some((i) => i.file === "实测记录.md"));
});

test("sc check --json 输出 items，有 ✗ 退出码 1", () => {
  const SC = fileURLToPath(new URL("../scripts/sc.mjs", import.meta.url));
  const r = spawnSync(process.execPath, [SC, "check", ep({}), "--json"], { encoding: "utf8" });
  assert.equal(r.status, 1);
  const { items } = JSON.parse(r.stdout);
  assert.ok(items.some((i) => i.file === "场景卡.md" && i.msg === "缺少 场景卡.md"));
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `cd skills/scenario-content && node --test tests/`
Expected: FAIL，`runChecks is not a function`（或 `loadConfig` 未导出）。

- [ ] **Step 3: 实现**

`makeReport` 改成带 file：

```js
function makeReport() {
  const items = [];
  const add = (level) => (msg, file = null, code) => items.push({ level, msg, file, ...(code ? { code } : {}) });
  return { fail: add("✗"), warn: add("⚠"), pass: add("✓"), items };
}
```

各检查传 file：`checkScenario` 全部用 `"场景卡.md"`；`checkGate` 用 `config.topicGate`；`checkTest` 用 `"实测记录.md"`；`checkDraft` 用 `"母稿.md"`；`checkFeynman` 用 `config.feynmanCheck`（术语那条 warn 也是）；`checkTextAll` 用 `rel`；`checkPlatforms` 用对应的 `f.wechat` / `f.xiaohongshuCopy` / `f.douyinScript`；「没有 AI 腔用语」pass 用 `null`。

`checkGate` 拆出确认：

```js
function checkGate(ep, config, r) {
  if (!config.topicGate) return;
  const file = config.topicGate;
  const p = join(ep, file);
  if (!existsSync(p)) return r.fail(`缺少 ${file}（实测前先过选题关：标题、封面、开头三秒、对标）`, file);
  const g = parseGate(readFileSync(p, "utf8"));
  const empty = g.empty.filter((k) => k !== "用户确认");
  if (empty.length) r.fail(`选题关未填写：${empty.join("、")}`, file);
  if (g.benchRows < config.minBenchmarks) r.fail(`选题关对标只有 ${g.benchRows} 条，至少 ${config.minBenchmarks} 条（可用 sc bench 抓）`, file);
  if (!empty.length && g.benchRows >= config.minBenchmarks) r.pass(`选题关已填写，对标 ${g.benchRows} 条`, file);
  if (!g.confirmed) r.fail("选题关用户还没确认（kv gate <作品> topic \"用户原话\"）", file, "topic-unconfirmed");
}
```

抽出 `runChecks` 并导出 `loadConfig`：

```js
export function runChecks(ep, config) {
  const r = makeReport();
  checkScenario(ep, r);
  checkGate(ep, config, r);
  checkTest(ep, r);
  checkDraft(ep, config, r);
  checkFeynman(ep, config, r);
  checkTextAll(ep, config, r);
  checkPlatforms(ep, config, r);
  return r.items;
}
```

`main` 的 check 分支：

```js
  const json = rest.includes("--json");
  const ep = resolve(dir);
  if (!existsSync(ep)) throw new Error(`目录不存在：${ep}`);
  const config = loadConfig(ep);
  const items = runChecks(ep, config);
  const fails = items.filter((i) => i.level === "✗").length;
  process.exitCode = fails ? 1 : 0;
  if (json) return console.log(JSON.stringify({ items }));
  for (const { level, msg } of items) console.log(`${level} ${msg}`);
  const warns = items.filter((i) => i.level === "⚠").length;
  console.log(`\n${fails} 项必须修改，${warns} 项需要判断${config.voiceGuide ? `；语气指南：${config.voiceGuide}` : ""}`);
```

（`main` 开头的 `const [cmd, dir, ...rest]` 已有；`bench` 分支不变。）用法说明第 2 行改成 `sc check <作品目录> [--json]`。

- [ ] **Step 4: 运行，确认通过**

Run: `cd skills/scenario-content && node --test tests/`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add skills/scenario-content && git commit -m "feat: sc check 每条问题带文件归属，加 --json；选题关没确认单独报"
```

---

### Task 2: 纯函数模块 practical.mjs（14 步 + 确认规则）

**Files:**
- Create: `skills/knowledge-video/scripts/lib/practical.mjs`
- Test: `skills/knowledge-video/tests/practical.test.mjs`

**Interfaces:**
- Consumes: 无（纯函数，输入是 facts 对象）。
- Produces:
  - `export const STEPS: {n: number, key: string, label: string, gate?: "topic"|"script"|"storyboard"|"final"}[]`
  - `export const GATES = ["topic", "script", "storyboard", "final"]`；`export const GATE_LABEL = {topic: "① 选题关", script: "② 脚本 + 配音稿", storyboard: "③ 分镜总览图", final: "④ 成片"}`
  - `export const DRAFT_KEYS = ["wechat", "xiaohongshu", "douyin"]`
  - facts 形状：`{ steps: {[key]: {ok: boolean, why: string}}, gates: {[gate]: {passed: boolean, at: string|null, quote: string|null, stale: boolean}} }`。`steps[key].ok` 只表示「这一步自己的条件满足」；顺序和确认由下面的函数处理。
  - `export function practicalStatus(facts): { rows: {n, key, label, done: boolean, gate?: string, gateState?: "passed"|"waiting"|"stale"|"pending"}[], next: string, waitingFor: string|null }`
  - `export function gateBlocker(facts, gate): string|null`（null = 可以记录）
  - `export function doneBlocker(facts, key): string|null`

- [ ] **Step 1: 写失败的测试**

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { STEPS, doneBlocker, gateBlocker, practicalStatus } from "../scripts/lib/practical.mjs";

const allOk = () => Object.fromEntries(STEPS.map((s) => [s.key, { ok: true, why: "" }]));
const gatesPassed = () => Object.fromEntries(["topic", "script", "storyboard", "final"].map((g) => [g, { passed: true, at: "2026-10-12", quote: "通过", stale: false }]));
const facts = (o = {}) => ({ steps: { ...allOk(), ...(o.steps ?? {}) }, gates: { ...gatesPassed(), ...(o.gates ?? {}) } });
const notOk = (why = "没做") => ({ ok: false, why });
const unpassed = { passed: false, at: null, quote: null, stale: false };

test("14 步，四个确认节点挂在 2、7、8、9", () => {
  assert.equal(STEPS.length, 14);
  assert.deepEqual(STEPS.filter((s) => s.gate).map((s) => [s.n, s.gate]), [[2, "topic"], [7, "script"], [8, "storyboard"], [9, "final"]]);
});

test("第一个没做完的步骤是下一步；后面的都不显示 ✓", () => {
  const s = practicalStatus(facts({ steps: { test: notOk("实测记录状态不是「已实测」") } }));
  assert.match(s.next, /实测/);
  assert.match(s.next, /已实测/);
  assert.deepEqual(s.rows.filter((r) => r.done).map((r) => r.n), [1, 2]);
});

test("步骤做完但节点没确认 → 等用户确认，后面不算 ✓", () => {
  const s = practicalStatus(facts({ gates: { script: unpassed } }));
  assert.equal(s.waitingFor, "script");
  assert.match(s.next, /等用户确认.*② 脚本/);
  assert.equal(s.rows.find((r) => r.n === 7).gateState, "waiting");
  assert.equal(s.rows.find((r) => r.n === 7).done, false);
  assert.ok(s.rows.filter((r) => r.n > 7).every((r) => !r.done));
});

test("指纹不一致：节点算没通过，显示「确认后改过」", () => {
  const s = practicalStatus(facts({ gates: { script: { passed: true, at: "2026-10-12", quote: "确认", stale: true } } }));
  assert.equal(s.waitingFor, "script");
  assert.equal(s.rows.find((r) => r.n === 7).gateState, "stale");
  assert.match(s.next, /确认后改过/);
});

test("全部做完 → 下一步「这期做完了」、waitingFor null", () => {
  const s = practicalStatus(facts());
  assert.ok(s.rows.every((r) => r.done));
  assert.equal(s.waitingFor, null);
  assert.equal(s.next, "这期做完了");
});

test("gateBlocker：前置步骤和前一个节点", () => {
  assert.equal(gateBlocker(facts({ gates: { topic: unpassed } }), "topic"), null);
  assert.match(gateBlocker(facts({ steps: { topic: notOk("对标只有 2 条") }, gates: { topic: unpassed } }), "topic"), /2 选题关.*对标只有 2 条/);
  assert.match(gateBlocker(facts({ gates: { topic: unpassed, script: unpassed } }), "script"), /① 选题关/);
  assert.match(gateBlocker(facts({ steps: { selfcheck: notOk("sc check 有 ✗") }, gates: { script: unpassed } }), "script"), /6 自检/);
  assert.match(gateBlocker(facts({ gates: { script: { passed: true, at: "x", quote: "y", stale: true }, storyboard: unpassed } }), "storyboard"), /② 脚本.*确认后改过/);
  assert.match(gateBlocker(facts(), "nope"), /没有这个确认节点/);
});

test("doneBlocker：只接受三个草稿键；内容没写好或前面没走完时拒绝", () => {
  assert.equal(doneBlocker(facts({ steps: { wechat: notOk("还没存草稿") } }), "wechat"), null);
  assert.match(doneBlocker(facts(), "blog"), /只能记 wechat、xiaohongshu、douyin/);
  assert.match(doneBlocker(facts({ steps: { wechat: { ok: false, why: "公众号/文章.md 还是空模板", content: false } } }), "wechat"), /空模板/);
  assert.match(doneBlocker(facts({ gates: { final: unpassed }, steps: { wechat: notOk("还没存草稿") } }), "wechat"), /④ 成片/);
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `cd skills/knowledge-video && node --test tests/practical.test.mjs`
Expected: FAIL，找不到模块 `practical.mjs`。

- [ ] **Step 3: 实现** `skills/knowledge-video/scripts/lib/practical.mjs`

```js
// 实用类一期的 14 步和 4 个确认节点（纯函数）。输入 facts 由 practical-facts.mjs 从作品目录读出来。
//   facts.steps[key] = { ok, why, content? }   这一步自己的条件满足没有；why 是没满足的原因；
//                                              content=false 表示草稿步骤的内容本身还没写好
//   facts.gates[gate] = { passed, at, quote, stale }   stale：确认后相关文件又改过
export const GATES = ["topic", "script", "storyboard", "final"];
export const GATE_LABEL = { topic: "① 选题关", script: "② 脚本 + 配音稿", storyboard: "③ 分镜总览图", final: "④ 成片" };
export const DRAFT_KEYS = ["wechat", "xiaohongshu", "douyin"];

export const STEPS = [
  { n: 1, key: "scenario", label: "场景卡" },
  { n: 2, key: "topic", label: "选题关", gate: "topic" },
  { n: 3, key: "test", label: "实测" },
  { n: 4, key: "draft", label: "母稿" },
  { n: 5, key: "feynman", label: "费曼检查" },
  { n: 6, key: "selfcheck", label: "自检" },
  { n: 7, key: "script", label: "抖音脚本 + 配音稿", gate: "script" },
  { n: 8, key: "storyboard", label: "配音 + 分镜", gate: "storyboard" },
  { n: 9, key: "render", label: "渲染 + QA", gate: "final" },
  { n: 10, key: "wechat", label: "公众号" },
  { n: 11, key: "xiaohongshu", label: "小红书" },
  { n: 12, key: "douyin", label: "抖音草稿" },
  { n: 13, key: "record", label: "发布记录" },
  { n: 14, key: "retro", label: "复盘" },
];

const HOW = {
  scenario: "按 scenario-content 第 1 步写 场景卡.md",
  topic: "按 scenario-content 第 2 步：sc bench 抓对标，写 选题关.md",
  test: "按 scenario-content 第 3 步实测（nv rec 录屏，同一提问跑两轮），写 实测记录.md",
  draft: "按 scenario-content 第 4 步写 母稿.md",
  feynman: "按 scenario-content 第 5 步写 费曼检查.md，补回母稿",
  selfcheck: "跑 sc check，修好所有 ✗",
  script: "按 content-repurpose 和 narrated-video 写 抖音/SCRIPT.md 和 抖音/VOICE.md（nv hf-audio 抖音 --check 要通过）",
  storyboard: "nv hf-audio 配音 → 写 STORYBOARD 的 build 行 → nv hf-build --snap（越框检查要通过）",
  render: "nv render 渲染，按 knowledge-video references/qa.md 写 qa.json",
  wechat: "写 公众号/文章.md（wa），wa draft 存草稿成功后 kv done <作品> wechat",
  xiaohongshu: "写 小红书/卡片.md 和 文案.md，ic render 出图，ic draft 存草稿成功后 kv done <作品> xiaohongshu",
  douyin: "ic render 抖音/封面.md 出封面，nv draft 存草稿成功后 kv done <作品> douyin",
  record: "在 发布记录.md 填置顶评论原文",
  retro: "在经验库写这期的复盘（文件名带作品简称）",
};

const gateState = (g) => (g.passed && !g.stale ? "passed" : g.passed && g.stale ? "stale" : "waiting");

export function practicalStatus(facts) {
  const rows = [];
  let next = null;
  let waitingFor = null;
  for (const s of STEPS) {
    const own = facts.steps[s.key];
    const g = s.gate ? facts.gates[s.gate] : null;
    const state = !g ? undefined : !next && own.ok ? gateState(g) : "pending";
    const done = !next && own.ok && (!g || state === "passed");
    rows.push({ n: s.n, key: s.key, label: s.label, done, ...(s.gate ? { gate: s.gate, gateState: state } : {}) });
    if (done || next) continue;
    if (!own.ok) next = `${s.n} ${s.label}：${HOW[s.key]}${own.why ? `（现在：${own.why}）` : ""}`;
    else {
      waitingFor = s.gate;
      const why = state === "stale" ? "确认后改过，需要重新确认，" : "";
      next = `${why}等用户确认 ${GATE_LABEL[s.gate]}；用户说通过后 kv gate <作品> ${s.gate} "用户原话"`;
    }
  }
  return { rows, next: next ?? "这期做完了", waitingFor };
}

/** 到第 n 步（含）为止，第一个挡路的原因；null = 都走完了 */
function blockerThrough(facts, n) {
  for (const s of STEPS.filter((x) => x.n <= n)) {
    const own = facts.steps[s.key];
    if (!own.ok) return `第 ${s.n} 步 ${s.label} 还没做完${own.why ? `：${own.why}` : ""}`;
    const g = s.gate && facts.gates[s.gate];
    if (g && s.n < n) {
      if (!g.passed) return `${GATE_LABEL[s.gate]} 还没确认`;
      if (g.stale) return `${GATE_LABEL[s.gate]} 确认后改过，需要重新确认`;
    }
  }
  return null;
}

export function gateBlocker(facts, gate) {
  const step = STEPS.find((s) => s.gate === gate);
  if (!step) return `没有这个确认节点：${gate}（可选：${GATES.join("、")}）`;
  return blockerThrough(facts, step.n);
}

export function doneBlocker(facts, key) {
  if (!DRAFT_KEYS.includes(key)) return `只能记 ${DRAFT_KEYS.join("、")}：${key}`;
  const step = STEPS.find((s) => s.key === key);
  const own = facts.steps[key];
  if (own.content === false) return own.why;
  const before = blockerThrough(facts, step.n - 1);
  if (before) return before;
  const g = facts.gates.final;
  return g.passed && !g.stale ? null : `${GATE_LABEL.final} 还没确认`;
}
```

注意：`blockerThrough(facts, n)` 只检查编号小于 n 的步骤的确认节点。公众号是第 10 步，`blockerThrough(facts, 9)` 不会检查 ④，所以最后一行单独检查 ④；小红书、抖音草稿时 ④ 会在 blockerThrough 里先被查到。

- [ ] **Step 4: 运行，确认通过**

Run: `cd skills/knowledge-video && node --test tests/practical.test.mjs`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add skills/knowledge-video/scripts/lib/practical.mjs skills/knowledge-video/tests/practical.test.mjs
git commit -m "feat: kv 实用类 14 步和 4 个确认节点的判断（纯函数）"
```

---

### Task 3: 从作品目录收集事实（practical-facts.mjs）

**Files:**
- Create: `skills/knowledge-video/scripts/lib/practical-facts.mjs`
- Create: `skills/knowledge-video/tests/helpers.mjs`；Modify: `skills/knowledge-video/tests/kv.test.mjs`（episode 挪出去）
- Test: `skills/knowledge-video/tests/practical-facts.test.mjs`

**Interfaces:**
- Consumes: Task 1 的 `sc check <dir> --json` 输出 `{items:[{level,msg,file,code?}]}`；Task 2 的 facts 形状和 `GATES`。
- Produces:
  - `export function fingerprint(dir: string, gate: string): string`（相关文件内容的 sha256 hex；文件不存在的跳过）
  - `export const GATE_FILES = { topic: ["选题关.md"], script: ["抖音/SCRIPT.md", "抖音/VOICE.md"], storyboard: ["抖音/STORYBOARD.md", "抖音/audio_meta.json"], final: ["<最新 renders/*.mp4>"] }`
  - `export function templateHashes(dir: string, files: string[]): {[rel]: string}`
  - `export function collectPracticalFacts(dir: string, run: object, opts: { runSc: (dir) => {items}|{error: string}, runVoiceCheck: (dir) => {ok: boolean, msg: string}, experienceDir: string }): facts`
  - `export function defaultRunners(): { runSc, runVoiceCheck }`（用 `KV_SC_CMD`（默认 `sc`）、`KV_NV_CMD`（默认 `nv`）环境变量里的命令）

- [ ] **Step 1: 写失败的测试**

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { episode } from "./helpers.mjs";
import { collectPracticalFacts, fingerprint, templateHashes } from "../scripts/lib/practical-facts.mjs";

const scOk = () => ({ items: [] });
const voiceOk = () => ({ ok: true, msg: "" });
const run = (o = {}) => ({ type: "practical", gates: {}, done: {}, templates: {}, ...o });
const collect = (dir, r = run(), o = {}) => collectPracticalFacts(dir, r, { runSc: scOk, runVoiceCheck: voiceOk, experienceDir: join(dir, "经验库"), ...o });
const touch = (dir, rel, sec) => utimesSync(join(dir, rel), sec, sec);

test("sc 的问题按文件归到第 1–6 步；topic-unconfirmed 不算", () => {
  const dir = episode({ "实测/录屏-1.mp4": "x" });
  const items = [
    { level: "✗", msg: "场景卡未填写：时间", file: "场景卡.md" },
    { level: "✗", msg: "选题关用户还没确认", file: "选题关.md", code: "topic-unconfirmed" },
    { level: "⚠", msg: "AI 腔", file: "母稿.md" },
  ];
  const f = collect(dir, run(), { runSc: () => ({ items }) });
  assert.equal(f.steps.scenario.ok, false);
  assert.match(f.steps.scenario.why, /时间/);
  assert.equal(f.steps.topic.ok, true);
  assert.equal(f.steps.draft.ok, true);
  assert.equal(f.steps.selfcheck.ok, false);
});

test("sc 跑不起来：第 1 步没做完，原因写清楚", () => {
  const f = collect(episode({}), run(), { runSc: () => ({ error: "找不到 sc 命令" }) });
  assert.equal(f.steps.scenario.ok, false);
  assert.match(f.steps.scenario.why, /找不到 sc 命令/);
});

test("实测要有录屏；脚本要写过且 VOICE 检查通过", () => {
  const tpl = { "抖音/SCRIPT.md": "## a (Frame 1)\n\n    （占位）\n" };
  const dir = episode(tpl);
  const r = run({ templates: templateHashes(dir, ["抖音/SCRIPT.md"]) });
  let f = collect(dir, r);
  assert.equal(f.steps.test.ok, false);
  assert.match(f.steps.test.why, /录屏/);
  assert.equal(f.steps.script.ok, false);
  assert.match(f.steps.script.why, /空模板/);
  const dir2 = episode({ "抖音/SCRIPT.md": "## a (Frame 1)\n\n    写了。\n" });
  f = collect(dir2, run(), { runVoiceCheck: () => ({ ok: false, msg: "VOICE.md 和 SCRIPT.md 对不上" }) });
  assert.equal(f.steps.script.ok, false);
  assert.match(f.steps.script.why, /对不上/);
});

test("newer：sheet 比 STORYBOARD 旧、mp4 比 sheet 旧都不算做完；qa 要 passed", () => {
  const dir = episode({ "抖音/audio_meta.json": "{}", "抖音/STORYBOARD.md": "x", "抖音/snapshots/sheet.jpg": "x", "抖音/renders/a.mp4": "x", "qa.json": '{"passed":true}' });
  touch(dir, "抖音/STORYBOARD.md", 1000); touch(dir, "抖音/snapshots/sheet.jpg", 2000); touch(dir, "抖音/renders/a.mp4", 3000);
  let f = collect(dir);
  assert.equal(f.steps.storyboard.ok, true);
  assert.equal(f.steps.render.ok, true);
  touch(dir, "抖音/STORYBOARD.md", 2500);
  f = collect(dir);
  assert.equal(f.steps.storyboard.ok, false);
  assert.match(f.steps.storyboard.why, /重新 nv hf-build/);
  touch(dir, "抖音/STORYBOARD.md", 1000); touch(dir, "抖音/renders/a.mp4", 1500);
  f = collect(dir);
  assert.equal(f.steps.render.ok, false);
});

test("确认节点：指纹一致 passed，不一致 stale", () => {
  const dir = episode({ "选题关.md": "v1" });
  const fp = fingerprint(dir, "topic");
  const r = run({ gates: { topic: { passed: true, at: "2026-10-12", quote: "通过", fingerprint: fp, edits: [] } } });
  assert.deepEqual(collect(dir, r).gates.topic, { passed: true, at: "2026-10-12", quote: "通过", stale: false });
  const dir2 = episode({ "选题关.md": "v2" });
  assert.equal(collect(dir2, r).gates.topic.stale, true);
  assert.equal(collect(dir, run()).gates.script.passed, false);
});

test("草稿步骤：内容空模板 content=false；写好没记 done 只差存草稿；出图要比源文件新", () => {
  const dir = episode({ "公众号/文章.md": "tpl", "小红书/卡片.md": "c", "小红书/文案.md": "w", "小红书/out/01.png": "p", "抖音/封面.md": "f" });
  touch(dir, "小红书/卡片.md", 2000); touch(dir, "小红书/out/01.png", 1000);
  const r = run({ templates: templateHashes(dir, ["公众号/文章.md"]) });
  let f = collect(dir, r);
  assert.equal(f.steps.wechat.content, false);
  assert.equal(f.steps.xiaohongshu.content, false);
  assert.match(f.steps.xiaohongshu.why, /ic render/);
  assert.equal(f.steps.douyin.content, false);
  touch(dir, "小红书/out/01.png", 3000);
  f = collect(dir, { ...r, done: { xiaohongshu: "2026-10-12" } });
  assert.equal(f.steps.xiaohongshu.ok, true);
});

test("发布记录看置顶评论；复盘看经验库里有没有带简称的文件", () => {
  const tpl = "### 置顶评论（原文）\n\n```\n（视频里承诺的模板或资料，直接可复制）\n```\n";
  const dir = episode({ "发布记录.md": tpl, "经验库/2026-10-12-别的.md": "x" });
  let f = collect(dir);
  assert.equal(f.steps.record.ok, false);
  assert.equal(f.steps.retro.ok, false);
  const dir2 = episode({ "发布记录.md": "### 置顶评论（原文）\n\n```\n选题关五问……\n```\n" });
  mkdirSync(join(dir2, "经验库"));
  writeFileSync(join(dir2, "经验库", `2026-10-12-${basename(dir2)}.md`), "x");
  f = collect(dir2);
  assert.equal(f.steps.record.ok, true);
  assert.equal(f.steps.retro.ok, true);
});
```

（`episode()` 创建的目录名是 `kv-XXXXXX`，没有编号前缀；复盘的判断用「去掉 `NN-` 前缀后的目录名」做简称。）

先把 `kv.test.mjs` 里的 `episode` 挪到 `tests/helpers.mjs`（`kv.test.mjs` 改成从 helpers 导入并继续 `export { episode }`），新测试从 helpers 导入——直接 import 一个测试文件会把它的测试再跑一遍。

```js
// tests/helpers.mjs
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** 建一个作品目录：files = { 相对路径: 内容（对象自动转 JSON） } */
export function episode(files) {
  const dir = mkdtempSync(join(tmpdir(), "kv-"));
  for (const [p, v] of Object.entries(files)) {
    mkdirSync(join(dir, p, ".."), { recursive: true });
    writeFileSync(join(dir, p), typeof v === "string" ? v : JSON.stringify(v));
  }
  return dir;
}
```

- [ ] **Step 2: 运行，确认失败**

Run: `cd skills/knowledge-video && node --test tests/practical-facts.test.mjs`
Expected: FAIL，找不到模块。

- [ ] **Step 3: 实现** `skills/knowledge-video/scripts/lib/practical-facts.mjs`

```js
// 从作品目录读出实用类 14 步的事实，交给 practical.mjs 判断。
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { isScriptFilled } from "./status.mjs";

const SC_STEPS = { scenario: "场景卡.md", topic: "选题关.md", test: "实测记录.md", draft: "母稿.md", feynman: "费曼检查.md" };
const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const mtime = (p) => (existsSync(p) ? statSync(p).mtimeMs : 0);
const ok = () => ({ ok: true, why: "" });
const no = (why, extra = {}) => ({ ok: false, why, ...extra });

function latest(dir, sub, re) {
  const p = join(dir, sub);
  if (!existsSync(p)) return null;
  const files = readdirSync(p).filter((f) => re.test(f)).map((f) => join(p, f));
  return files.sort((a, b) => mtime(b) - mtime(a))[0] ?? null;
}

export const GATE_FILES = {
  topic: () => ["选题关.md"],
  script: () => ["抖音/SCRIPT.md", "抖音/VOICE.md"],
  storyboard: () => ["抖音/STORYBOARD.md", "抖音/audio_meta.json"],
  final: (dir) => {
    const mp4 = latest(dir, "抖音/renders", /\.mp4$/);
    return mp4 ? [mp4.slice(dir.length + 1)] : [];
  },
};

export function fingerprint(dir, gate) {
  const h = createHash("sha256");
  for (const rel of GATE_FILES[gate](dir)) {
    const p = join(dir, rel);
    if (existsSync(p)) h.update(rel).update(readFileSync(p));
  }
  return h.digest("hex");
}

export function templateHashes(dir, files) {
  return Object.fromEntries(files.filter((f) => existsSync(join(dir, f))).map((f) => [f, sha(readFileSync(join(dir, f)))]));
}

/** 文件存在且不是新建作品时的空模板 */
function written(dir, rel, templates) {
  const p = join(dir, rel);
  if (!existsSync(p)) return false;
  return templates?.[rel] ? sha(readFileSync(p)) !== templates[rel] : true;
}

/** out/ 里最新的 NN.png 比源文件新 */
function rendered(dir, srcRel, outSub) {
  const png = latest(dir, outSub, /^\d{2}\.png$/);
  return !!png && mtime(png) >= mtime(join(dir, srcRel));
}

function scSteps(dir, runSc) {
  const res = runSc(dir);
  if (res.error) return Object.fromEntries([...Object.keys(SC_STEPS), "selfcheck"].map((k) => [k, no(`sc check 跑不起来：${res.error}`)]));
  const fails = res.items.filter((i) => i.level === "✗" && i.code !== "topic-unconfirmed");
  const out = {};
  for (const [key, file] of Object.entries(SC_STEPS)) {
    const mine = fails.filter((i) => i.file === file);
    out[key] = mine.length ? no(mine.map((i) => i.msg).join("；")) : ok();
  }
  if (out.test.ok && !latest(dir, "实测", /\.mp4$/)) out.test = no("实测/ 里没有录屏 mp4（nv rec）");
  out.selfcheck = fails.length ? no(`sc check 还有 ${fails.length} 项 ✗`) : ok();
  return out;
}

function videoSteps(dir, run, runVoiceCheck) {
  const script = join(dir, "抖音/SCRIPT.md");
  let s = written(dir, "抖音/SCRIPT.md", run.templates) && isScriptFilled(readFileSync(script, "utf8")) ? ok() : no("抖音/SCRIPT.md 还是空模板");
  if (s.ok) {
    const v = runVoiceCheck(join(dir, "抖音"));
    if (!v.ok) s = no(v.msg);
  }
  const sb = join(dir, "抖音/STORYBOARD.md");
  const sheet = join(dir, "抖音/snapshots/sheet.jpg");
  const board = !existsSync(join(dir, "抖音/audio_meta.json")) ? no("还没配音（nv hf-audio）")
    : !written(dir, "抖音/STORYBOARD.md", run.templates) ? no("STORYBOARD.md 还是空模板")
    : !existsSync(sheet) ? no("还没有 snapshots/sheet.jpg")
    : mtime(sheet) < mtime(sb) ? no("STORYBOARD 改过，要重新 nv hf-build --snap") : ok();
  const mp4 = latest(dir, "抖音/renders", /\.mp4$/);
  let qa = null;
  try { qa = JSON.parse(readFileSync(join(dir, "qa.json"), "utf8")); } catch { qa = null; }
  const render = !mp4 ? no("还没渲染") : mtime(mp4) < mtime(sheet) ? no("分镜改过，要重新 nv render")
    : !qa ? no("还没写 qa.json") : qa.passed !== true ? no("qa.json 有没修的问题") : ok();
  return { script: s, storyboard: board, render };
}

function draftSteps(dir, run) {
  const t = run.templates;
  const step = (key, contentWhy) => contentWhy ? no(contentWhy, { content: false }) : run.done?.[key] ? ok() : no("还没存草稿", { content: true });
  return {
    wechat: step("wechat", !written(dir, "公众号/文章.md", t) && "公众号/文章.md 还是空模板"),
    xiaohongshu: step("xiaohongshu",
      !written(dir, "小红书/卡片.md", t) ? "小红书/卡片.md 还是空模板"
        : !written(dir, "小红书/文案.md", t) ? "小红书/文案.md 还是空模板"
          : !rendered(dir, "小红书/卡片.md", "小红书/out") && "卡片改过还没出图（ic render 小红书/卡片.md）"),
    douyin: step("douyin", !rendered(dir, "抖音/封面.md", "抖音/out") && "抖音封面还没出图（ic render 抖音/封面.md）"),
  };
}

function recordStep(dir) {
  const p = join(dir, "发布记录.md");
  if (!existsSync(p)) return no("没有 发布记录.md");
  const body = readFileSync(p, "utf8").match(/### 置顶评论[^\n]*\n+```[^\n]*\n([\s\S]*?)```/)?.[1]?.trim() ?? "";
  return body && !body.startsWith("（") ? ok() : no("置顶评论原文还没填");
}

function retroStep(dir, experienceDir) {
  const name = basename(dir).replace(/^\d+-/, "");
  const hit = existsSync(experienceDir) && readdirSync(experienceDir).some((f) => f.includes(name));
  return hit ? ok() : no(`经验库里还没有文件名带「${name}」的记录`);
}

function gateFacts(dir, run) {
  return Object.fromEntries(Object.keys(GATE_FILES).map((g) => {
    const r = run.gates?.[g] ?? {};
    const passed = r.passed === true;
    return [g, { passed, at: r.at ?? null, quote: r.quote ?? null, stale: passed && r.fingerprint !== fingerprint(dir, g) }];
  }));
}

export function collectPracticalFacts(dir, run, { runSc, runVoiceCheck, experienceDir }) {
  return {
    steps: {
      ...scSteps(dir, runSc),
      ...videoSteps(dir, run, runVoiceCheck),
      ...draftSteps(dir, run),
      record: recordStep(dir),
      retro: retroStep(dir, experienceDir),
    },
    gates: gateFacts(dir, run),
  };
}

function runCmd(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (r.error) return { error: r.error.code === "ENOENT" ? `找不到 ${cmd} 命令` : r.error.message };
  return { status: r.status, out: r.stdout, err: r.stderr };
}

export function defaultRunners() {
  const sc = process.env.KV_SC_CMD || "sc";
  const nv = process.env.KV_NV_CMD || "nv";
  return {
    runSc: (dir) => {
      const r = runCmd(sc, ["check", dir, "--json"]);
      if (r.error) return r;
      try { return { items: JSON.parse(r.out).items }; } catch { return { error: (r.err || r.out).trim().slice(-300) || "输出不是 JSON" }; }
    },
    runVoiceCheck: (douyinDir) => {
      const r = runCmd(nv, ["hf-audio", douyinDir, "--check"]);
      if (r.error) return { ok: false, msg: r.error };
      return r.status === 0 ? { ok: true, msg: "" } : { ok: false, msg: (r.err || r.out).trim().slice(-300) };
    },
  };
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `cd skills/knowledge-video && node --test tests/practical-facts.test.mjs`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add skills/knowledge-video/scripts/lib/practical-facts.mjs skills/knowledge-video/tests/practical-facts.test.mjs
git commit -m "feat: kv 从作品目录收集实用类 14 步的事实、确认指纹"
```

---

### Task 4: kv 命令：init、gate、done、实用类 status

**Files:**
- Modify: `skills/knowledge-video/scripts/kv.mjs`
- Create: `skills/knowledge-video/templates/run-practical.json`
- Modify: `skills/knowledge-video/bin/kv`（注释的用法行）
- Test: `skills/knowledge-video/tests/kv-practical.test.mjs`

**Interfaces:**
- Consumes: Task 2 `practicalStatus`、`gateBlocker`、`doneBlocker`、`GATE_LABEL`、`GATES`、`DRAFT_KEYS`；Task 3 `collectPracticalFacts`、`defaultRunners`、`fingerprint`、`templateHashes`。
- Produces: CLI
  - `kv init <作品> [--fresh]`：已有 run.json 时报错；目录里有 `场景卡.md` → practical，否则 concept（复制 `templates/run.json`）。`--fresh` 时把 `TEMPLATE_FILES` 的哈希记进 `templates`。
  - `kv gate <作品> <节点> [--edit] "原话"`
  - `kv done <作品> <wechat|xiaohongshu|douyin>`
  - `kv status <作品>`：practical 走新输出；目录有 `场景卡.md` 但没有 run.json → 报「先 kv init」，退出码 1。
- `TEMPLATE_FILES = ["抖音/SCRIPT.md", "抖音/STORYBOARD.md", "公众号/文章.md", "小红书/卡片.md", "小红书/文案.md"]`

- [ ] **Step 1: 写失败的测试** `tests/kv-practical.test.mjs`

```js
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
```

- [ ] **Step 2: 运行，确认失败**

Run: `cd skills/knowledge-video && node --test tests/kv-practical.test.mjs`
Expected: FAIL（`init`、`gate`、`done` 不是合法命令，打印用法退出 1；status 走概念科普）。

- [ ] **Step 3: 实现**

`templates/run-practical.json`：

```json
{
  "type": "practical",
  "gates": {
    "topic": { "passed": false, "at": null, "quote": null, "fingerprint": null, "edits": [] },
    "script": { "passed": false, "at": null, "quote": null, "fingerprint": null, "edits": [] },
    "storyboard": { "passed": false, "at": null, "quote": null, "fingerprint": null, "edits": [] },
    "final": { "passed": false, "at": null, "quote": null, "fingerprint": null, "edits": [] }
  },
  "done": {},
  "templates": {}
}
```

`kv.mjs` 改动：

1. 文件头用法注释和 `USAGE` 改成：

```js
// 用法：kv check|brief|status|init|gate|done <作品目录> …
//   init    [--fresh]   新建 run.json（有 场景卡.md 为实用类）；--fresh 记下刚生成的模板，用来判断「还没写」
//   gate    <节点> [--edit] "用户原话"   记录用户确认（实用类：topic script storyboard final）
//   done    <wechat|xiaohongshu|douyin>   存草稿成功后记一笔
const USAGE = "用法：kv check|brief|status <作品目录>\n      kv init <作品目录> [--fresh]\n      kv gate <作品目录> <节点> [--edit] \"用户原话\"\n      kv done <作品目录> <wechat|xiaohongshu|douyin>";
```

2. 新的 import：

```js
// 合并进已有的 import 行：node:path 加 dirname，node:url 加 fileURLToPath
import { DRAFT_KEYS, GATE_LABEL as P_GATE_LABEL, doneBlocker, gateBlocker, practicalStatus } from "./lib/practical.mjs";
import { collectPracticalFacts, defaultRunners, fingerprint, templateHashes } from "./lib/practical-facts.mjs";
```

3. 新函数：

```js
const TEMPLATES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "templates");
const TEMPLATE_FILES = ["抖音/SCRIPT.md", "抖音/STORYBOARD.md", "公众号/文章.md", "小红书/卡片.md", "小红书/文案.md"];
const today = () => new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD，本地时区
const oneLine = (s) => s.replace(/\s*\n\s*/g, " ").trim();
const looksPractical = (dir) => existsSync(join(dir, "场景卡.md"));
const writeRun = (dir, run) => writeFileSync(join(dir, FILES.run), JSON.stringify(run, null, 2) + "\n");

function practicalFacts(dir, run) {
  const cfg = loadConfig(dir);
  return collectPracticalFacts(dir, run, { ...defaultRunners(), experienceDir: join(cfg.root, cfg.experienceDir) });
}

/** 读 run.json；实用类目录没有 run.json 时报错（不能当概念科普处理） */
function requirePracticalRun(dir) {
  const run = readRun(dir);
  if (!run && looksPractical(dir)) throw new Error("这是实用类作品，还没有 run.json：先跑 kv init <作品目录>");
  return run;
}

function initRun(dir, args) {
  if (readRun(dir)) throw new Error("已经有 run.json 了");
  const practical = looksPractical(dir);
  const run = JSON.parse(readFileSync(join(TEMPLATES_DIR, practical ? "run-practical.json" : "run.json"), "utf8"));
  if (practical && args.includes("--fresh")) run.templates = templateHashes(dir, TEMPLATE_FILES);
  writeRun(dir, run);
  console.log(`✓ run.json（${TYPE_LABEL[episodeType(run)]}）`);
  return 0;
}

function syncTopicFile(dir, quote) {
  const p = join(dir, "选题关.md");
  const md = readFileSync(p, "utf8");
  const line = `- 用户确认：${today()} 通过（用户：「${quote}」）`;
  const next = /^- 用户确认[：:].*$/m.test(md) ? md.replace(/^- 用户确认[：:].*$/m, line) : `${md.trimEnd()}\n${line}\n`;
  writeFileSync(p, next);
}

function recordGate(dir, args) {
  const run = requirePracticalRun(dir);
  if (episodeType(run) !== "practical") throw new Error("kv gate 只用于实用类作品（概念科普按 SKILL.md 手改 run.json）");
  const [gate, ...rest] = args;
  const edit = rest.includes("--edit");
  const quote = oneLine(rest.filter((a) => a !== "--edit").join(" "));
  if (!quote) throw new Error('要写用户原话：kv gate <作品> <节点> "用户原话"');
  const g = run.gates?.[gate];
  if (!g) throw new Error(`没有这个确认节点：${gate}（可选：${Object.keys(P_GATE_LABEL).join("、")}）`);
  if (edit) {
    g.edits = [...(g.edits ?? []), { at: today(), quote }];
    writeRun(dir, run);
    console.log(`✓ 记下 ${P_GATE_LABEL[gate]} 的修改意见，改完再请用户确认`);
    return 0;
  }
  const blocker = gateBlocker(practicalFacts(dir, run), gate);
  if (blocker) {
    console.log(`✗ 还不能记 ${P_GATE_LABEL[gate]}：${blocker}`);
    return 1;
  }
  if (gate === "topic") syncTopicFile(dir, quote);
  run.gates[gate] = { ...g, passed: true, at: today(), quote, fingerprint: fingerprint(dir, gate) };
  writeRun(dir, run);
  console.log(`✓ ${P_GATE_LABEL[gate]} 通过（${today()}「${quote}」）`);
  return 0;
}

function recordDone(dir, args) {
  const run = requirePracticalRun(dir);
  const [key] = args;
  if (!DRAFT_KEYS.includes(key)) throw new Error(`只能记 ${DRAFT_KEYS.join("、")}：${key ?? "（空）"}`);
  const blocker = doneBlocker(practicalFacts(dir, run), key);
  if (blocker) {
    console.log(`✗ 还不能记 ${key}：${blocker}`);
    return 1;
  }
  run.done = { ...(run.done ?? {}), [key]: today() };
  writeRun(dir, run);
  console.log(`✓ ${key} 草稿已记录`);
  return 0;
}

function printPracticalStatus(dir, run) {
  const s = practicalStatus(practicalFacts(dir, run));
  console.log("类型：实用技巧");
  for (const r of s.rows) {
    const g = run.gates?.[r.gate];
    const gate = !r.gate ? "" : r.gateState === "passed" ? `  ${P_GATE_LABEL[r.gate]} ✓ ${g.at}「${g.quote}」`
      : r.gateState === "stale" ? `  ${P_GATE_LABEL[r.gate]} 确认后改过` : r.gateState === "waiting" ? `  ${P_GATE_LABEL[r.gate]} 等用户确认` : "";
    console.log(` ${r.done ? "✓" : "·"} ${String(r.n).padStart(2)} ${r.label}${gate}`);
  }
  console.log(`下一步：${s.next}`);
  return 0;
}
```

4. `printStatus` 开头加分流：

```js
function printStatus(dir) {
  const run = requirePracticalRun(dir);
  if (episodeType(run) === "practical") return printPracticalStatus(dir, run);
  // ……原来的概念科普逻辑不变
```

5. `main`：

```js
function main(argv) {
  const [cmd, target, ...rest] = argv;
  if (!target || !["check", "brief", "status", "init", "gate", "done"].includes(cmd)) {
    console.error(USAGE);
    return 1;
  }
  const dir = resolve(target);
  if (!existsSync(dir)) {
    console.error(`找不到作品目录：${dir}`);
    return 1;
  }
  if (cmd === "check") return printCheck(dir);
  if (cmd === "brief") return writeBrief(dir);
  if (cmd === "init") return initRun(dir, rest);
  if (cmd === "gate") return recordGate(dir, rest);
  if (cmd === "done") return recordDone(dir, rest);
  return printStatus(dir);
}
```

（`requirePracticalRun` 抛出的错误由现有的 `catch` 打到 stderr、退出码 1。`kv done blog` 的「只能记」同理走 stderr。）

6. `bin/kv` 的注释改成 `# knowledge-video 入口：kv check|brief|status|init|gate|done <作品目录>`。

- [ ] **Step 4: 运行全部 kv 测试**

Run: `cd skills/knowledge-video && npm test`
Expected: 全部 PASS（含原有概念科普测试）。

- [ ] **Step 5: 提交**

```bash
git add skills/knowledge-video && git commit -m "feat: kv init/gate/done，实用类 kv status 管完整的一期（14 步、4 个确认节点、确认后改过要重新确认）"
```

---

### Task 5: 新建作品脚本和文档

**Files:**
- Modify: `scripts/new-episode.sh`（实用类和单篇在末尾跑 `kv init --fresh`；结尾提示改成 `kv status`）
- Modify: `CLAUDE.md`（「内容生产流程」那条）
- Modify: `skills/knowledge-video/SKILL.md`、`skills/knowledge-video/types/practical.md`
- Modify: `skills/scenario-content/SKILL.md`（开头说明入口在 kv；第 2 步确认用 `kv gate`）

**Interfaces:**
- Consumes: Task 4 的 `kv init --fresh`、`kv status`、`kv gate`、`kv done`。

- [ ] **Step 1: new-episode.sh**

在 `nv hf-kit "$ep/抖音" >/dev/null` 之后、`echo "已创建…"` 之前加：

```bash
if [[ -z "$douyin_only" && "$type" == practical ]]; then
  command -v kv >/dev/null || die "找不到 kv 命令，见 skills/knowledge-video"
  kv init "$ep" --fresh >/dev/null
fi
```

结尾 practical 分支的提示改成：

```bash
echo "下一步：kv status ${ep#$ROOT/}（每一步开始前都先跑它，只做它说的那一步）"
```

- [ ] **Step 2: 手动验证 new-episode.sh**

Run:
```bash
cd /home/power/self-media-wt/kv-pipeline && scripts/new-episode.sh 单篇 流程测试 --日期 2099-01-01 && kv status 04-作品/单篇/2099-01-01-流程测试; rm -rf 04-作品/单篇/2099-01-01-流程测试
```
Expected: 打印 `下一步：kv status …`；`kv status` 列出 14 步，第 1 步是 `·`，下一步指向场景卡。（worktree 里 `04-作品/` 是 gitignored 的空目录，测完删掉。若 worktree 缺 `nv` 依赖导致 `nv init` 失败，改在主目录运行同样命令再删除，并在 ledger 记 Ruling。）

- [ ] **Step 3: CLAUDE.md**

把「内容生产流程」整条替换为：

```markdown
- **做一期内容（实用类，主线「AI 做自媒体」）**：入口只有一个——`scripts/new-episode.sh <系列> <简称>` 建好目录后，**每一步开始前先跑 `kv status <作品目录>`，只做它说的那一步**。14 步：场景卡 → 选题关 → 实测 → 母稿 → 费曼检查 → sc check → 抖音脚本 + 配音稿 → 配音 + 分镜 → 渲染 + QA → 公众号 → 小红书 → 抖音草稿 → 发布记录 → 复盘。四个确认节点（① 选题关、② 脚本 + 配音稿、③ 分镜总览图、④ 成片）：**用户明确说通过后**才跑 `kv gate <作品> <节点> "用户原话"`，提修改意见用 `--edit`；确认后又改了相关文件要重新确认。三个草稿（`wa draft`、`ic draft`、`nv draft`）成功后跑 `kv done <作品> wechat|xiaohongshu|douyin`。每步具体怎么做：内容看 `skills/scenario-content`，改编看 `skills/content-repurpose`，视频看 `skills/narrated-video`。**实测绝不能编造结果。**写任何内容前先读 `00-规划/语气指南.md`。
```

同时把「AI 知识短视频」那条开头的「用户说「做一期 XX」时按它的导演手册走」改成「概念科普系列（`type: concept`）按它的导演手册走」。

- [ ] **Step 4: knowledge-video/SKILL.md**

在「## 阶段」之前加一节：

```markdown
## 实用类（type: practical）：kv 管完整的一期

新建作品时 `new-episode.sh` 已跑过 `kv init --fresh`。之后每一步开始前 `kv status <作品目录>`，只做它说的那一步：

| 命令 | 什么时候用 |
|---|---|
| `kv status <作品>` | 每一步开始前；列出 14 步 ✓/·、确认节点、下一步 |
| `kv gate <作品> <topic\|script\|storyboard\|final> "用户原话"` | 用户明确说通过之后。前面没做完会被拒绝 |
| `kv gate <作品> <节点> --edit "用户原话"` | 用户提了修改意见（不算通过） |
| `kv done <作品> <wechat\|xiaohongshu\|douyin>` | `wa draft` / `ic draft` / `nv draft` 成功之后 |
| `kv init <作品>` | 老作品补 run.json |

确认之后又改了相关文件（选题关.md；SCRIPT.md / VOICE.md；STORYBOARD.md / 配音；成片），这个节点自动失效，要重新请用户确认。下面「阶段」表是概念科普的流程。
```

frontmatter 的 description 里「提供 kv 命令：kv check（研究来源和脚本依据）、kv brief（研究简报）、kv status（进度）」改为「提供 kv 命令：kv status（进度，实用类管完整的一期）、kv gate（记用户确认）、kv done（记草稿）、kv check、kv brief」。

- [ ] **Step 5: types/practical.md**

「## 真实性靠什么」下面加一行：`整期的顺序和确认由 kv status / kv gate 管，见 SKILL.md「实用类」一节。`

- [ ] **Step 6: scenario-content/SKILL.md**

在「## 七步流程」之前加：

```markdown
> **入口在 knowledge-video**：做一期时先跑 `kv status <作品目录>`，它会指到这里的某一步。本文件讲这几步具体怎么做。
```

第 2 步第 4 条「给用户看标题、封面和开头，用户说通过后在「用户确认」写日期和「通过」」改为「给用户看标题、封面和开头，用户说通过后跑 `kv gate <作品> topic "用户原话"`（会同步写进「用户确认」）」。

- [ ] **Step 7: 跑全部测试**

Run: `cd skills/knowledge-video && npm test && cd ../scenario-content && node --test tests/`
Expected: 全部 PASS。

- [ ] **Step 8: 提交**

```bash
git add scripts/new-episode.sh CLAUDE.md skills/knowledge-video skills/scenario-content
git commit -m "docs: 做一期的入口统一到 kv status；new-episode.sh 新建时 kv init --fresh"
```

---

### Task 6: 用第 1 期实测

**Files:** 无代码改动（`04-作品/` gitignored，不提交）。在**主目录**的作品上跑 worktree 里的 kv：`node /home/power/self-media-wt/kv-pipeline/skills/knowledge-video/scripts/kv.mjs`，sc 用 `KV_SC_CMD="node /home/power/self-media-wt/kv-pipeline/skills/scenario-content/scripts/sc.mjs"`。

注意：`KV_SC_CMD` 是单个可执行文件路径（spawnSync 不经过 shell）。为此在 scratchpad 写一个包装脚本 `sc-wt`：`#!/bin/sh\nexec node /home/power/self-media-wt/kv-pipeline/skills/scenario-content/scripts/sc.mjs "$@"`，`chmod +x`，`KV_SC_CMD` 指向它。

- [ ] **Step 1:** `kv init 04-作品/AI做自媒体/01-不想看`（不加 `--fresh`）。Expected: `✓ run.json（实用技巧）`。
- [ ] **Step 2:** `kv status`。Expected: 第 1–6 步 ✓（若 `sc check` 有 ✗，记下来报告给用户，不擅自改作品）；第 2 步等确认 ①。
- [ ] **Step 3:** 补记已有的确认：`kv gate … topic "按你的建议"`；`kv gate … script "确认"`。③ 分镜用户没有单独确认过、④ 成片还没确认 → 不补记，在给用户的报告里说明。
- [ ] **Step 4:** `kv status`。Expected: 停在第 8 步 ③ 等用户确认（或第 8 步本身的原因），把输出原样贴给用户。

---

## Self-Review 记录

- 设计覆盖：入口（Task 5）、14 步（Task 2/3）、确认节点 + 指纹 + 选题关同步（Task 2/3/4）、`kv done`（Task 4）、status 输出（Task 4）、run.json（Task 4）、改动的文件（Task 1–5）、测试和实测（各 Task + Task 6）。
- 差异已写进「与设计文档的差异」。
- 名字一致性：`practicalStatus` / `gateBlocker` / `doneBlocker` / `collectPracticalFacts` / `defaultRunners` / `fingerprint` / `templateHashes` / `GATE_LABEL`（kv.mjs 里导入为 `P_GATE_LABEL`，避免和概念科普的 `GATE_LABEL` 冲突）。
