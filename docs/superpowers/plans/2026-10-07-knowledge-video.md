# 知识短视频生产 Skill（knowledge-video）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新建通用 Skill `knowledge-video`：导演手册 + 类型档案 + `kv check / brief / status` 三个命令，让 Claude 按阶段（理解任务 → 求真 → 脚本 → 分镜 → 渲染 → QA → 复盘）做 AI 知识短视频，下游复用 narrated-video。

**Architecture:** 纯函数库（`scripts/lib/`：研究校验、脚本依据解析与核对、QA 校验、简报渲染、阶段判断）+ 一个 CLI 入口 `scripts/kv.mjs`（读文件、调库、打印）。项目专属信息放项目根目录 `knowledge-video.config.json`。文档（SKILL.md、types、references）告诉 Claude 什么时候做什么、什么时候停。

**Tech Stack:** Node ESM（无第三方依赖）、`node --test`、bash 入口脚本。

**Spec:** `docs/superpowers/specs/2026-10-07-knowledge-video-design.md`

## Global Constraints

- Skill 与项目无关：Skill 目录里不出现「边学边用AI」「普通人的AI课」等项目名；项目信息只进 `knowledge-video.config.json`
- 软链接：`ln -s /home/power/self-media/skills/knowledge-video ~/.claude/skills/knowledge-video`
- 无第三方依赖（只用 Node 内置模块），不需要 `npm install`
- 检查结果三级：`✗`（错误，退出码 1）、`⚠`（警告，退出码 0）、`✓`
- research.json 规则（照抄 spec 第 4 节）：`id` 唯一且形如 `c` + 数字；`kind` ∈ {`fact`,`number`}；`confidence` ∈ {`high`,`medium`,`low`}；每条至少 1 个来源；`number` 类或 `confidence` 非 `high`：至少 2 个来源或至少 1 个 `official`；来源要有 `url`（http/https）、`quote`（非空）、`accessed`（YYYY-MM-DD）；`type` ∈ {`official`,`paper`,`media`,`other`}；只有 `media`/`other` 来源 → ⚠
- 脚本依据：每个 `## Line N … (Frame N)` 块要有 `**依据:**`；取值只能是 claim id 列表（逗号、顿号或空格分隔）、`类比`、`观点`（不能混用）；引用的 id 必须存在；有 claim 没被引用 → ⚠。实用技巧类（`type: "practical"`）只检查依据行存在且非空
- qa.json：`checked` 必须包含 `safe-area`、`text-size`、`density`、`typo`、`fact-on-screen`、`rhythm`；`severity` ∈ {`high`,`medium`,`low`}；`passed: true` 时不能有 `high` 级 issue
- 阶段：`brief` → `research` → `script` → `storyboard` → `render` → `review` → `done`；确认节点 `script`、`storyboard`、`final`
- 文档用中文；不提交视频、配音、录屏
- 提交信息 `<type>: <描述>`，结尾带：
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_016dF9DwFyHb12AkmwqgPqvC
  ```

## Review Focus

- research.json 不是合法 JSON，或 `claims` 不是数组：给出中文错误，不抛出未处理的异常（Task 1 测试）
- SCRIPT.md 用中文冒号 `**依据：**`、或依据值用顿号分隔 `c01、c02`：应与英文写法等价（Task 2 测试）
- 作品目录里没有 run.json（老作品或刚创建）：`kv status` 按文件推断阶段，类型默认 `concept`，不报错（Task 6 测试）
- SCRIPT.md 里一句口播都解析不到（格式写错）：`kv check` 报 ✗「没有读到口播」，而不是静默通过（Task 4 测试）
- 同一个 claim 被多句引用：简报里该 claim 下按句号顺序列出全部引用句，不重复列 claim（Task 5 测试）

## 文件结构

| 文件 | 职责 |
|---|---|
| `skills/knowledge-video/scripts/lib/research.mjs` | `validateResearch(data)`：research.json 规则 |
| `skills/knowledge-video/scripts/lib/script.mjs` | `parseScriptBasis(md)`、`checkBasis(lines, research, type)` |
| `skills/knowledge-video/scripts/lib/qa.mjs` | `validateQa(data)` |
| `skills/knowledge-video/scripts/lib/brief.mjs` | `renderBrief(research, lines)` → Markdown |
| `skills/knowledge-video/scripts/lib/status.mjs` | `detectStatus(facts)` → 阶段、下一步、待确认节点 |
| `skills/knowledge-video/scripts/lib/config.mjs` | `loadConfig(start)`：向上找 `knowledge-video.config.json` |
| `skills/knowledge-video/scripts/kv.mjs` | CLI：`check` / `brief` / `status`，负责读文件和打印 |
| `skills/knowledge-video/bin/kv` | bash 入口 |
| `skills/knowledge-video/tests/*.test.mjs` | 测试 |
| `skills/knowledge-video/SKILL.md`、`types/`、`references/`、`templates/` | 文档和模板 |
| 项目：`knowledge-video.config.json`、`00-规划/系列/系列.json`、`00-规划/系列/AI概念一分钟.md`、`00-规划/经验库/规律.md`、`CLAUDE.md` | 项目配置和登记 |

问题对象的统一形状（所有校验函数返回）：`{ level: "error" | "warn", msg: string }`。

---

### Task 1: research.json 校验

**Files:**
- Create: `skills/knowledge-video/scripts/lib/research.mjs`
- Test: `skills/knowledge-video/tests/research.test.mjs`

**Interfaces:**
- Produces: `validateResearch(data: unknown) → { level: "error"|"warn", msg: string }[]`
- Produces: `parseResearchJson(text: string) → { data: object|null, issues: Issue[] }`（JSON 解析失败时 `data` 为 null、issues 一条 error）

- [ ] **Step 1: 写失败的测试**

`skills/knowledge-video/tests/research.test.mjs`：

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseResearchJson, validateResearch } from "../scripts/lib/research.mjs";

const src = (o = {}) => ({ title: "T", url: "https://a.com", type: "official", quote: "原文", accessed: "2026-10-07", ...o });
const claim = (o = {}) => ({ id: "c01", text: "事实", kind: "fact", confidence: "high", sources: [src()], ...o });
const errors = (issues) => issues.filter((i) => i.level === "error").map((i) => i.msg);
const warns = (issues) => issues.filter((i) => i.level === "warn").map((i) => i.msg);

test("合格的 research.json 没有问题", () => {
  assert.deepEqual(validateResearch({ topic: "RAG", claims: [claim()] }), []);
});

test("JSON 坏了、claims 不是数组：中文错误，不抛异常", () => {
  const bad = parseResearchJson("{坏");
  assert.equal(bad.data, null);
  assert.match(errors(bad.issues)[0], /research\.json 不是合法 JSON/);
  assert.match(errors(validateResearch({ claims: "x" }))[0], /claims 必须是数组/);
  assert.match(errors(validateResearch(null))[0], /research\.json 必须是一个对象/);
});

test("id、kind、confidence 的取值", () => {
  const e = errors(validateResearch({ claims: [claim({ id: "x1", kind: "guess", confidence: "sure" }), claim({ id: "c02" }), claim({ id: "c02" })] }));
  assert.ok(e.some((m) => /x1：id 要写成 c 加数字/.test(m)));
  assert.ok(e.some((m) => /kind 只能是 fact 或 number/.test(m)));
  assert.ok(e.some((m) => /confidence 只能是 high、medium、low/.test(m)));
  assert.ok(e.some((m) => /c02：id 重复/.test(m)));
});

test("来源：至少一个；url、quote、accessed、type 都要对", () => {
  assert.match(errors(validateResearch({ claims: [claim({ sources: [] })] }))[0], /c01：至少要有 1 个来源/);
  const e = errors(validateResearch({ claims: [claim({ sources: [src({ url: "a.com", quote: " ", accessed: "10/7", type: "blog" })] })] }));
  assert.ok(e.some((m) => /url 要以 http/.test(m)));
  assert.ok(e.some((m) => /quote 不能为空/.test(m)));
  assert.ok(e.some((m) => /accessed 要写成 YYYY-MM-DD/.test(m)));
  assert.ok(e.some((m) => /type 只能是 official、paper、media、other/.test(m)));
});

test("number 类或可信度不高：要 2 个来源，或 1 个官方来源", () => {
  const one = [src({ type: "media" })];
  assert.match(errors(validateResearch({ claims: [claim({ kind: "number", sources: one })] }))[0], /c01：数字类或可信度不是 high，要 2 个来源或 1 个官方来源/);
  assert.match(errors(validateResearch({ claims: [claim({ confidence: "medium", sources: one })] }))[0], /要 2 个来源或 1 个官方来源/);
  assert.deepEqual(errors(validateResearch({ claims: [claim({ kind: "number", sources: [src()] })] })), []);
  assert.deepEqual(errors(validateResearch({ claims: [claim({ kind: "number", sources: [src({ type: "media" }), src({ type: "paper" })] })] })), []);
});

test("只有媒体或其他来源：警告", () => {
  assert.match(warns(validateResearch({ claims: [claim({ sources: [src({ type: "media" })] })] }))[0], /c01：只有媒体或其他来源/);
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `cd skills/knowledge-video && node --test tests/research.test.mjs`
Expected: FAIL（`Cannot find module '../scripts/lib/research.mjs'`）

- [ ] **Step 3: 实现 `scripts/lib/research.mjs`**

```js
// research.json 校验：每条事实（claim）都要有可追溯的来源。规则见 SKILL.md「研究」和 references/research.md。
const KINDS = ["fact", "number"];
const CONFIDENCES = ["high", "medium", "low"];
const SOURCE_TYPES = ["official", "paper", "media", "other"];
const ID_RE = /^c\d+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STRONG_MIN_SOURCES = 2; // 数字类、可信度不高的 claim：至少几个来源（或 1 个官方来源）

const error = (msg) => ({ level: "error", msg });
const warn = (msg) => ({ level: "warn", msg });

/** 文本 → { data, issues }；JSON 坏了不抛异常 */
export function parseResearchJson(text) {
  try {
    return { data: JSON.parse(text), issues: [] };
  } catch (err) {
    return { data: null, issues: [error(`research.json 不是合法 JSON：${err.message}`)] };
  }
}

function checkSource(id, s, i) {
  const at = `${id} 的第 ${i + 1} 个来源`;
  const out = [];
  if (!/^https?:\/\//.test(String(s?.url ?? ""))) out.push(error(`${at}：url 要以 http:// 或 https:// 开头`));
  if (!String(s?.quote ?? "").trim()) out.push(error(`${at}：quote 不能为空（摘录来源原文，不要转述）`));
  if (!DATE_RE.test(String(s?.accessed ?? ""))) out.push(error(`${at}：accessed 要写成 YYYY-MM-DD`));
  if (!SOURCE_TYPES.includes(s?.type)) out.push(error(`${at}：type 只能是 official、paper、media、other`));
  return out;
}

function checkClaim(c, seen) {
  const id = String(c?.id ?? "?");
  const out = [];
  if (!ID_RE.test(id)) out.push(error(`${id}：id 要写成 c 加数字（如 c01）`));
  else if (seen.has(id)) out.push(error(`${id}：id 重复`));
  seen.add(id);
  if (!KINDS.includes(c?.kind)) out.push(error(`${id}：kind 只能是 fact 或 number`));
  if (!CONFIDENCES.includes(c?.confidence)) out.push(error(`${id}：confidence 只能是 high、medium、low`));
  const sources = Array.isArray(c?.sources) ? c.sources : [];
  if (!sources.length) return [...out, error(`${id}：至少要有 1 个来源`)];
  sources.forEach((s, i) => out.push(...checkSource(id, s, i)));
  const hasOfficial = sources.some((s) => s?.type === "official");
  const strong = c?.kind === "number" || c?.confidence !== "high";
  if (strong && sources.length < STRONG_MIN_SOURCES && !hasOfficial) {
    out.push(error(`${id}：数字类或可信度不是 high，要 ${STRONG_MIN_SOURCES} 个来源或 1 个官方来源`));
  }
  if (sources.every((s) => s?.type === "media" || s?.type === "other")) {
    out.push(warn(`${id}：只有媒体或其他来源，最好补一个官方文档或论文`));
  }
  return out;
}

/** @returns {{ level: "error"|"warn", msg: string }[]} */
export function validateResearch(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [error("research.json 必须是一个对象")];
  if (!Array.isArray(data.claims)) return [error("research.json 的 claims 必须是数组")];
  const seen = new Set();
  return data.claims.flatMap((c) => checkClaim(c, seen));
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `cd skills/knowledge-video && node --test tests/research.test.mjs`
Expected: PASS（6/6）

- [ ] **Step 5: 提交**

```bash
git add skills/knowledge-video/scripts/lib/research.mjs skills/knowledge-video/tests/research.test.mjs
git commit -m "feat: knowledge-video 的 research.json 校验

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016dF9DwFyHb12AkmwqgPqvC"
```

---

### Task 2: 脚本依据解析与核对

**Files:**
- Create: `skills/knowledge-video/scripts/lib/script.mjs`
- Test: `skills/knowledge-video/tests/script.test.mjs`

**Interfaces:**
- Consumes: research.json 的 `claims[].id`（Task 1 的数据形状）
- Produces: `parseScriptBasis(md: string) → { frame: number, text: string, basis: string|null }[]`（`basis` 是 `**依据:**` 后的原文，没有这一行为 null）
- Produces: `basisOf(raw: string) → { kind: "claims"|"类比"|"观点"|"invalid", ids: string[] }`
- Produces: `checkBasis(lines, research, type = "concept") → Issue[]`（`research` 可为 null：此时只检查依据行存在和格式）

- [ ] **Step 1: 写失败的测试**

`skills/knowledge-video/tests/script.test.mjs`：

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { basisOf, checkBasis, parseScriptBasis } from "../scripts/lib/script.mjs";

const MD = [
  "# SCRIPT", "",
  "## Line 1 — 钩子 (Frame 1)", "", "**重点词:** 瞎编", "**依据:** 观点", "", "    同一个问题，问知识库答对了，问它却在瞎编。", "",
  "## Line 2 — 定义 (Frame 2)", "", "**依据：** c01、c02", "", "    它会先翻资料，", "    再回答。", "",
  "## Line 3 — 类比 (Frame 3)", "", "    就像开卷考试。", "",
].join("\n");

test("parseScriptBasis：读帧号、口播（多行拼接）、依据（中英文冒号都行）", () => {
  assert.deepEqual(parseScriptBasis(MD), [
    { frame: 1, text: "同一个问题，问知识库答对了，问它却在瞎编。", basis: "观点" },
    { frame: 2, text: "它会先翻资料，再回答。", basis: "c01、c02" },
    { frame: 3, text: "就像开卷考试。", basis: null },
  ]);
});

test("basisOf：claim 列表（逗号、顿号、空格）、类比、观点；混用无效", () => {
  assert.deepEqual(basisOf("c01, c03"), { kind: "claims", ids: ["c01", "c03"] });
  assert.deepEqual(basisOf("c01、c02 c04"), { kind: "claims", ids: ["c01", "c02", "c04"] });
  assert.deepEqual(basisOf("类比"), { kind: "类比", ids: [] });
  assert.deepEqual(basisOf(" 观点 "), { kind: "观点", ids: [] });
  assert.equal(basisOf("c01, 观点").kind, "invalid");
  assert.equal(basisOf("").kind, "invalid");
});

test("checkBasis：漏标、无效取值、引用不存在的 claim 报错；没被引用的 claim 警告", () => {
  const research = { claims: [{ id: "c01" }, { id: "c02" }, { id: "c09" }] };
  const lines = [
    { frame: 1, text: "a", basis: "观点" },
    { frame: 2, text: "b", basis: "c01, c05" },
    { frame: 3, text: "c", basis: null },
    { frame: 4, text: "d", basis: "c01 类比" },
  ];
  const issues = checkBasis(lines, research);
  const e = issues.filter((i) => i.level === "error").map((i) => i.msg);
  const w = issues.filter((i) => i.level === "warn").map((i) => i.msg);
  assert.ok(e.some((m) => /第 3 句：缺少「\*\*依据:\*\*」/.test(m)));
  assert.ok(e.some((m) => /第 2 句：引用的 c05 不在 research\.json 里/.test(m)));
  assert.ok(e.some((m) => /第 4 句：依据只能是 claim 编号、「类比」或「观点」/.test(m)));
  assert.deepEqual(w, ["c02、c09 没被脚本用到（研究多余，或脚本漏了重点）"]);
});

test("checkBasis：实用技巧类只要求依据行存在且非空；没有口播时报错", () => {
  assert.deepEqual(checkBasis([{ frame: 1, text: "a", basis: "R1" }], null, "practical"), []);
  assert.match(checkBasis([{ frame: 1, text: "a", basis: null }], null, "practical")[0].msg, /第 1 句：缺少/);
  assert.match(checkBasis([], null)[0].msg, /SCRIPT\.md 里没有读到口播/);
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `cd skills/knowledge-video && node --test tests/script.test.mjs`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `scripts/lib/script.mjs`**

```js
// SCRIPT.md（narrated-video 的 HyperFrames 格式）里每句口播的「依据」：引用哪几条 claim，或是类比、观点。
// 口播块：「## Line N — 标签 (Frame N)」，口播是缩进 4 格的行；依据写一行「**依据:** c01, c03」。
const HEADING_RE = /^#{2,3}\s+.*?\(frame\s+(\d+)\)/i;
const BASIS_RE = /^\s*\*\*依据[:：]\*\*\s*(.*)$/;
const SPLIT_RE = /[,，、\s]+/;
const CLAIM_RE = /^c\d+$/;
const LABELS = ["类比", "观点"];

/** @returns {{ frame: number, text: string, basis: string|null }[]} */
export function parseScriptBasis(md) {
  const out = [];
  let cur = null;
  const flush = () => {
    if (cur && cur.text) out.push(cur);
    cur = null;
  };
  for (const line of md.split(/\r?\n/)) {
    const h = line.match(HEADING_RE);
    if (h) {
      flush();
      cur = { frame: Number(h[1]), text: "", basis: null };
      continue;
    }
    if (!cur) continue;
    const b = line.match(BASIS_RE);
    if (b) cur.basis = b[1].trim();
    if (/^\s*\*\*/.test(line)) continue;
    const t = line.match(/^(?: {4,}|\t)(.+)$/);
    if (t) cur.text += t[1].trim();
  }
  flush();
  return out;
}

/** 依据原文 → { kind, ids } */
export function basisOf(raw) {
  const parts = String(raw ?? "").split(SPLIT_RE).filter(Boolean);
  if (parts.length === 1 && LABELS.includes(parts[0])) return { kind: parts[0], ids: [] };
  if (parts.length && parts.every((p) => CLAIM_RE.test(p))) return { kind: "claims", ids: parts };
  return { kind: "invalid", ids: [] };
}

const error = (msg) => ({ level: "error", msg });
const warn = (msg) => ({ level: "warn", msg });

/**
 * 核对每句依据。type = "practical"（实用技巧）时只要求依据行存在且非空（依据是实测轮次，如 R1）。
 * research 为 null 时不核对 claim 是否存在。
 */
export function checkBasis(lines, research, type = "concept") {
  if (!lines.length) return [error("SCRIPT.md 里没有读到口播（检查「## Line N … (Frame N)」标题和缩进 4 格的口播行）")];
  const issues = [];
  const known = new Set((research?.claims ?? []).map((c) => c?.id));
  const used = new Set();
  for (const l of lines) {
    if (!l.basis) {
      issues.push(error(`第 ${l.frame} 句：缺少「**依据:**」一行`));
      continue;
    }
    if (type === "practical") continue;
    const b = basisOf(l.basis);
    if (b.kind === "invalid") {
      issues.push(error(`第 ${l.frame} 句：依据只能是 claim 编号、「类比」或「观点」，不能混用（现在是「${l.basis}」）`));
      continue;
    }
    for (const id of b.ids) {
      used.add(id);
      if (research && !known.has(id)) issues.push(error(`第 ${l.frame} 句：引用的 ${id} 不在 research.json 里`));
    }
  }
  if (research && type !== "practical") {
    const unused = [...known].filter((id) => id && !used.has(id));
    if (unused.length) issues.push(warn(`${unused.join("、")} 没被脚本用到（研究多余，或脚本漏了重点）`));
  }
  return issues;
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `cd skills/knowledge-video && node --test tests/script.test.mjs`
Expected: PASS（4/4）

- [ ] **Step 5: 提交**

```bash
git add skills/knowledge-video/scripts/lib/script.mjs skills/knowledge-video/tests/script.test.mjs
git commit -m "feat: knowledge-video 解析和核对脚本依据

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016dF9DwFyHb12AkmwqgPqvC"
```

---

### Task 3: qa.json 校验

**Files:**
- Create: `skills/knowledge-video/scripts/lib/qa.mjs`
- Test: `skills/knowledge-video/tests/qa.test.mjs`

**Interfaces:**
- Produces: `validateQa(data: unknown) → Issue[]`、`QA_CHECKS: string[]`

- [ ] **Step 1: 写失败的测试**

`skills/knowledge-video/tests/qa.test.mjs`：

```js
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
```

- [ ] **Step 2: 运行，确认失败**

Run: `cd skills/knowledge-video && node --test tests/qa.test.mjs`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `scripts/lib/qa.mjs`**

```js
// qa.json 校验：Claude 逐帧看总览图和成片抽帧后写的视觉 QA。检查项说明见 references/qa.md。
export const QA_CHECKS = ["safe-area", "text-size", "density", "typo", "fact-on-screen", "rhythm"];
const SEVERITIES = ["high", "medium", "low"];
const error = (msg) => ({ level: "error", msg });

/** @returns {{ level: "error"|"warn", msg: string }[]} */
export function validateQa(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [error("qa.json 必须是一个对象")];
  const out = [];
  if (typeof data.passed !== "boolean") out.push(error("qa.json 的 passed 必须是 true 或 false"));
  const checked = Array.isArray(data.checked) ? data.checked : [];
  const missing = QA_CHECKS.filter((c) => !checked.includes(c));
  if (missing.length) out.push(error(`qa.json 的 checked 缺少：${missing.join("、")}`));
  if (!Array.isArray(data.issues)) return [...out, error("qa.json 的 issues 必须是数组")];
  data.issues.forEach((it, i) => {
    if (!SEVERITIES.includes(it?.severity)) out.push(error(`qa.json 第 ${i + 1} 个问题：severity 只能是 high、medium、low`));
  });
  if (data.passed === true && data.issues.some((it) => it?.severity === "high")) {
    out.push(error("qa.json：passed 为 true 时不能有 high 级问题（先修好再改 passed）"));
  }
  return out;
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `cd skills/knowledge-video && node --test tests/qa.test.mjs`
Expected: PASS（3/3）

- [ ] **Step 5: 提交**

```bash
git add skills/knowledge-video/scripts/lib/qa.mjs skills/knowledge-video/tests/qa.test.mjs
git commit -m "feat: knowledge-video 的 qa.json 校验

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016dF9DwFyHb12AkmwqgPqvC"
```

---

### Task 4: `kv check` 命令和配置

**Files:**
- Create: `skills/knowledge-video/scripts/lib/config.mjs`
- Create: `skills/knowledge-video/scripts/kv.mjs`
- Create: `skills/knowledge-video/bin/kv`
- Create: `skills/knowledge-video/package.json`
- Test: `skills/knowledge-video/tests/kv.test.mjs`

**Interfaces:**
- Consumes: `parseResearchJson`、`validateResearch`（Task 1）；`parseScriptBasis`、`checkBasis`（Task 2）；`validateQa`（Task 3）
- Produces: `loadConfig(start: string) → { series: string|null, audience: string|null, voiceGuide: string|null, experienceDir: string, root: string }`
- Produces: `readRun(dir) → object|null`（读 `run.json`，坏了抛中文错误）、`episodeType(run) → "concept"|"practical"`（无 run.json 时 `"concept"`）
- Produces: `runCheck(dir) → { issues: Issue[], notes: string[] }`（`notes` 是 ✓ 行）
- Produces: CLI `kv check <作品目录>`：打印 ✗/⚠/✓，有 ✗ 退出码 1

- [ ] **Step 1: 写失败的测试**

`skills/knowledge-video/tests/kv.test.mjs`：

```js
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
```

- [ ] **Step 2: 运行，确认失败**

Run: `cd skills/knowledge-video && node --test tests/kv.test.mjs`
Expected: FAIL（`kv.mjs` 不存在，spawn 退出码非 0、断言失败）

- [ ] **Step 3: 实现 `scripts/lib/config.mjs`**

```js
// 项目配置：从作品目录向上找 knowledge-video.config.json。找不到用默认值。
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const CONFIG_NAME = "knowledge-video.config.json";
const DEFAULTS = { series: null, audience: null, voiceGuide: null, experienceDir: "经验库" };

function findUp(start) {
  for (let dir = resolve(start); ; dir = dirname(dir)) {
    const p = join(dir, CONFIG_NAME);
    if (existsSync(p)) return p;
    if (dirname(dir) === dir) return null;
  }
}

export function loadConfig(start) {
  const path = findUp(start);
  if (!path) return { ...DEFAULTS, root: resolve(start) };
  try {
    return { ...DEFAULTS, ...JSON.parse(readFileSync(path, "utf8")), root: dirname(path) };
  } catch (err) {
    throw new Error(`${path} 不是合法 JSON：${err.message}`);
  }
}
```

- [ ] **Step 4: 实现 `scripts/kv.mjs`（本任务只有 check）**

```js
#!/usr/bin/env node
// 用法：kv check|brief|status <作品目录>
//   check   检查 research.json、SCRIPT.md 的依据、qa.json（存在时）。有 ✗ 退出码 1
//   brief   research.json → 研究简报.md（给人在确认节点 ① 看）
//   status  当前阶段、下一步、还没通过的确认节点
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { validateQa } from "./lib/qa.mjs";
import { parseResearchJson, validateResearch } from "./lib/research.mjs";
import { checkBasis, parseScriptBasis } from "./lib/script.mjs";

export const FILES = { brief: "brief.md", research: "research.json", script: "抖音/SCRIPT.md", qa: "qa.json", run: "run.json" };
const USAGE = "用法：kv check|brief|status <作品目录>";

/** run.json → 对象；没有时 null；坏了报中文错误 */
export function readRun(dir) {
  const p = join(dir, FILES.run);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch (err) {
    throw new Error(`run.json 不是合法 JSON：${err.message}`);
  }
}

export const episodeType = (run) => (run?.type === "practical" ? "practical" : "concept");

function readJson(dir, name, validate) {
  const p = join(dir, name);
  if (!existsSync(p)) return { data: null, issues: [], missing: true };
  const parsed = name === FILES.research ? parseResearchJson(readFileSync(p, "utf8")) : (() => {
    try {
      return { data: JSON.parse(readFileSync(p, "utf8")), issues: [] };
    } catch (err) {
      return { data: null, issues: [{ level: "error", msg: `${name} 不是合法 JSON：${err.message}` }] };
    }
  })();
  // 解析失败用解析错误；解析成功（哪怕内容是 null）一律交给校验函数，不能悄悄放过
  return { ...parsed, issues: parsed.issues.length ? parsed.issues : validate(parsed.data), missing: false };
}

/** @returns {{ issues: {level: string, msg: string}[], notes: string[] }} */
export function runCheck(dir) {
  const type = episodeType(readRun(dir));
  const issues = [];
  const notes = [];
  let research = null;
  if (type === "concept") {
    const r = readJson(dir, FILES.research, validateResearch);
    if (r.missing) notes.push("· 还没有 research.json（求真阶段的产物）");
    else if (!r.issues.some((i) => i.level === "error")) notes.push(`✓ research.json：${r.data.claims.length} 条事实都有来源`);
    issues.push(...r.issues);
    research = r.data;
  }
  const scriptPath = join(dir, FILES.script);
  if (!existsSync(scriptPath)) notes.push(`· 还没有 ${FILES.script}`);
  else {
    const lines = parseScriptBasis(readFileSync(scriptPath, "utf8"));
    const si = checkBasis(lines, research, type);
    if (!si.some((i) => i.level === "error")) notes.push(`✓ ${FILES.script}：${lines.length} 句口播都标了依据`);
    issues.push(...si);
  }
  const q = readJson(dir, FILES.qa, validateQa);
  if (!q.missing) {
    if (!q.issues.length) notes.push(`✓ qa.json：${q.data.passed ? "通过" : "未通过"}，${q.data.issues.length} 个问题`);
    issues.push(...q.issues);
  }
  return { issues, notes };
}

function printCheck(dir) {
  const { issues, notes } = runCheck(dir);
  for (const n of notes) console.log(n);
  for (const i of issues) console.log(`${i.level === "error" ? "✗" : "⚠"} ${i.msg}`);
  return issues.some((i) => i.level === "error") ? 1 : 0;
}

function main(argv) {
  const [cmd, target] = argv;
  if (!target || !["check", "brief", "status"].includes(cmd)) {
    console.error(USAGE);
    return 1;
  }
  const dir = resolve(target);
  if (!existsSync(dir)) {
    console.error(`找不到作品目录：${dir}`);
    return 1;
  }
  if (cmd === "check") return printCheck(dir);
  console.error(`kv ${cmd} 还没有实现`);
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    console.error(`✗ ${err.message}`);
    process.exitCode = 1;
  }
}
```

- [ ] **Step 5: 入口和 package.json**

`skills/knowledge-video/bin/kv`：

```bash
#!/usr/bin/env bash
# knowledge-video 入口：kv check|brief|status <作品目录>
set -euo pipefail
SKILL_DIR="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"
exec node "$SKILL_DIR/scripts/kv.mjs" "$@"
```

```bash
chmod +x skills/knowledge-video/bin/kv
```

`skills/knowledge-video/package.json`：

```json
{
  "name": "knowledge-video",
  "private": true,
  "type": "module",
  "description": "AI 知识短视频生产流程：类型档案、研究来源检查、脚本依据核对、阶段进度",
  "bin": { "kv": "bin/kv" },
  "scripts": { "test": "node --test tests/*.test.mjs" }
}
```

- [ ] **Step 6: 运行，确认通过**

Run: `cd skills/knowledge-video && npm test`
Expected: PASS（Task 1–4 全部）

- [ ] **Step 7: 提交**

```bash
git add skills/knowledge-video/scripts/lib/config.mjs skills/knowledge-video/scripts/kv.mjs skills/knowledge-video/bin/kv skills/knowledge-video/package.json skills/knowledge-video/tests/kv.test.mjs
git commit -m "feat: kv check 检查研究来源、脚本依据和 QA

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016dF9DwFyHb12AkmwqgPqvC"
```

---

### Task 5: `kv brief` 研究简报

**Files:**
- Create: `skills/knowledge-video/scripts/lib/brief.mjs`
- Modify: `skills/knowledge-video/scripts/kv.mjs`（`main` 里加 brief 分支）
- Test: `skills/knowledge-video/tests/brief.test.mjs`、`skills/knowledge-video/tests/kv.test.mjs`

**Interfaces:**
- Consumes: research.json 数据形状（Task 1）；`parseScriptBasis`、`basisOf`（Task 2）；`FILES`、`readJson` 思路（Task 4）
- Produces: `renderBrief(research: object, lines: {frame,text,basis}[]) → string`（Markdown）
- Produces: CLI `kv brief <作品目录>` → 写 `研究简报.md`，打印路径；research.json 有 ✗ 时拒绝生成、退出码 1

- [ ] **Step 1: 写失败的测试**

`skills/knowledge-video/tests/brief.test.mjs`：

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderBrief } from "../scripts/lib/brief.mjs";

const s = { title: "论文", url: "https://arxiv.org/abs/2005.11401", type: "paper", quote: "原文一句", accessed: "2026-10-07" };
const research = {
  topic: "RAG 是什么", question: "为什么知识库答得准？",
  claims: [
    { id: "c01", text: "先检索再生成", kind: "fact", confidence: "high", sources: [s] },
    { id: "c02", text: "没被用到的事实", kind: "fact", confidence: "medium", sources: [s, s] },
  ],
  open_questions: ["准确率提升多少？"],
};
const lines = [
  { frame: 1, text: "问它却在瞎编。", basis: "观点" },
  { frame: 2, text: "它先翻资料，", basis: "c01" },
  { frame: 3, text: "再回答。", basis: "c01" },
  { frame: 4, text: "就像开卷考试。", basis: "类比" },
];

test("renderBrief：被用到的事实在前，列出处、摘录、引用它的全部口播", () => {
  const md = renderBrief(research, lines);
  assert.match(md, /^# 研究简报：RAG 是什么/);
  assert.match(md, /> 这期要回答：为什么知识库答得准？/);
  assert.match(md, /## 脚本用到的事实（1 条）[\s\S]*### c01 · 可信度 高[\s\S]*先检索再生成/);
  assert.match(md, /- \[论文\]\(https:\/\/arxiv\.org\/abs\/2005\.11401\)（论文 · 查阅 2026-10-07）\n  > 原文一句/);
  assert.match(md, /- 口播：第 2 句「它先翻资料，」；第 3 句「再回答。」/);
  assert.equal(md.match(/### c01/g).length, 1, "同一个 claim 只列一次");
  assert.ok(md.indexOf("## 没被脚本用到的事实") > md.indexOf("### c01"));
  assert.match(md, /## 没被脚本用到的事实（1 条）[\s\S]*### c02 · 可信度 中/);
  assert.match(md, /## 没查到可靠来源的问题\n\n- 准确率提升多少？/);
  assert.match(md, /## 类比和观点句（不需要来源）\n\n- 第 1 句（观点）「问它却在瞎编。」\n- 第 4 句（类比）「就像开卷考试。」/);
});

test("renderBrief：没有 open_questions 时不出这一节", () => {
  assert.doesNotMatch(renderBrief({ ...research, open_questions: [] }, lines), /没查到可靠来源/);
});
```

`tests/kv.test.mjs` 末尾追加（复用文件里的 `episode`、`kv`、`claim`、`SCRIPT`）：

```js
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
```

- [ ] **Step 2: 运行，确认失败**

Run: `cd skills/knowledge-video && npm test`
Expected: brief.test.mjs FAIL（模块不存在）；kv brief 测试 FAIL（「kv brief 还没有实现」）

- [ ] **Step 3: 实现 `scripts/lib/brief.mjs`**

```js
// research.json + 脚本依据 → 研究简报（Markdown），给人在确认节点 ① 对照：每条事实旁边列出引用它的口播原句。
import { basisOf } from "./script.mjs";

const CONF = { high: "高", medium: "中", low: "低" };
const TYPE = { official: "官方", paper: "论文", media: "媒体", other: "其他" };

function claimBlock(c, refs) {
  const out = [`### ${c.id} · 可信度 ${CONF[c.confidence] ?? c.confidence}${c.kind === "number" ? " · 数字" : ""}`, "", c.text, ""];
  for (const s of c.sources ?? []) {
    out.push(`- [${s.title}](${s.url})（${TYPE[s.type] ?? s.type} · 查阅 ${s.accessed}）`, `  > ${s.quote}`);
  }
  if (refs.length) out.push(`- 口播：${refs.map((l) => `第 ${l.frame} 句「${l.text}」`).join("；")}`);
  out.push("");
  return out;
}

/** @returns {string} */
export function renderBrief(research, lines) {
  const refs = new Map(); // claim id → 引用它的口播（按句序）
  const labeled = [];
  for (const l of lines) {
    const b = basisOf(l.basis);
    if (b.kind === "claims") b.ids.forEach((id) => refs.set(id, [...(refs.get(id) ?? []), l]));
    else if (b.kind === "类比" || b.kind === "观点") labeled.push({ ...l, kind: b.kind });
  }
  const claims = research.claims ?? [];
  const used = claims.filter((c) => refs.has(c.id));
  const unused = claims.filter((c) => !refs.has(c.id));
  const out = [`# 研究简报：${research.topic ?? ""}`, ""];
  if (research.question) out.push(`> 这期要回答：${research.question}`, "");
  out.push(`## 脚本用到的事实（${used.length} 条）`, "");
  used.forEach((c) => out.push(...claimBlock(c, refs.get(c.id))));
  if (unused.length) {
    out.push(`## 没被脚本用到的事实（${unused.length} 条）`, "");
    unused.forEach((c) => out.push(...claimBlock(c, [])));
  }
  if (research.open_questions?.length) {
    out.push("## 没查到可靠来源的问题", "", ...research.open_questions.map((q) => `- ${q}`), "");
  }
  if (labeled.length) {
    out.push("## 类比和观点句（不需要来源）", "", ...labeled.map((l) => `- 第 ${l.frame} 句（${l.kind}）「${l.text}」`), "");
  }
  return out.join("\n");
}
```

- [ ] **Step 4: `kv.mjs` 加 brief 分支**

在 import 区加：

```js
import { writeFileSync } from "node:fs";
import { renderBrief } from "./lib/brief.mjs";
```

（`writeFileSync` 合并进已有的 `node:fs` import 行。）在 `printCheck` 后面加：

```js
const BRIEF_OUT = "研究简报.md";

function writeBrief(dir) {
  const r = readJson(dir, FILES.research, validateResearch);
  if (r.missing) {
    console.log("✗ 还没有 research.json");
    return 1;
  }
  if (r.issues.some((i) => i.level === "error")) {
    console.log("✗ research.json 有错误，先修好（kv check）");
    return 1;
  }
  const scriptPath = join(dir, FILES.script);
  const lines = existsSync(scriptPath) ? parseScriptBasis(readFileSync(scriptPath, "utf8")) : [];
  writeFileSync(join(dir, BRIEF_OUT), renderBrief(r.data, lines));
  console.log(`✓ ${BRIEF_OUT}（${r.data.claims.length} 条事实，${lines.length} 句口播）`);
  return 0;
}
```

`main` 里 `if (cmd === "check") …` 下一行加：

```js
  if (cmd === "brief") return writeBrief(dir);
```

- [ ] **Step 5: 运行，确认通过**

Run: `cd skills/knowledge-video && npm test`
Expected: PASS（全部）

- [ ] **Step 6: 提交**

```bash
git add skills/knowledge-video/scripts/lib/brief.mjs skills/knowledge-video/scripts/kv.mjs skills/knowledge-video/tests/brief.test.mjs skills/knowledge-video/tests/kv.test.mjs
git commit -m "feat: kv brief 生成研究简报，事实旁列出引用它的口播

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016dF9DwFyHb12AkmwqgPqvC"
```

---

### Task 6: `kv status` 阶段判断

**Files:**
- Create: `skills/knowledge-video/scripts/lib/status.mjs`
- Modify: `skills/knowledge-video/scripts/kv.mjs`（收集文件事实、加 status 分支）
- Test: `skills/knowledge-video/tests/status.test.mjs`、`skills/knowledge-video/tests/kv.test.mjs`

**Interfaces:**
- Consumes: `readRun`、`episodeType`、`runCheck`、`FILES`（Task 4）；`loadConfig`（Task 4）
- Produces: `detectStatus(f) → { stage: string, next: string, waitingFor: "script"|"storyboard"|"final"|null }`，其中
  `f = { type, hasBrief, hasEvidence, hasScript, checkOk, hasStoryboard, hasSheet, hasRender, qa: null|{passed:boolean}, gates: { script, storyboard, final }（布尔） }`
- Produces: CLI `kv status <作品目录>`：打印类型、阶段、下一步、确认节点状态、经验库路径（done 时）

- [ ] **Step 1: 写失败的测试**

`skills/knowledge-video/tests/status.test.mjs`：

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { detectStatus } from "../scripts/lib/status.mjs";

const base = { type: "concept", hasBrief: true, hasEvidence: true, hasScript: true, checkOk: true, hasStoryboard: true, hasSheet: true, hasRender: true, qa: { passed: true }, gates: { script: true, storyboard: true, final: true } };
const at = (o) => detectStatus({ ...base, ...o, gates: { ...base.gates, ...(o.gates ?? {}) } });

test("按顺序找到第一个没完成的阶段", () => {
  assert.equal(at({ hasBrief: false }).stage, "brief");
  assert.equal(at({ hasEvidence: false }).stage, "research");
  assert.match(at({ hasEvidence: false }).next, /research\.json/);
  assert.match(at({ type: "practical", hasEvidence: false }).next, /实测记录\.md/);
  assert.equal(at({ hasScript: false }).stage, "script");
});

test("脚本写好：kv check 不过先修；过了等确认节点 ①", () => {
  assert.match(at({ checkOk: false, gates: { script: false } }).next, /kv check/);
  assert.deepEqual(at({ gates: { script: false } }), { stage: "script", next: "kv brief 生成研究简报，请用户确认研究简报和脚本（确认节点 ①）", waitingFor: "script" });
});

test("分镜、渲染、QA、成片确认", () => {
  assert.equal(at({ hasStoryboard: false, hasSheet: false, gates: { storyboard: false } }).stage, "storyboard");
  assert.equal(at({ gates: { storyboard: false } }).waitingFor, "storyboard");
  assert.equal(at({ hasRender: false }).stage, "render");
  assert.equal(at({ qa: null }).stage, "review");
  assert.match(at({ qa: { passed: false } }).next, /qa\.json 有未修的问题/);
  assert.equal(at({ gates: { final: false } }).waitingFor, "final");
  assert.equal(at({}).stage, "done");
  assert.match(at({}).next, /经验库/);
});
```

`tests/kv.test.mjs` 末尾追加：

```js
test("kv status：没有 run.json 也能按文件判断；脚本写好后等确认 ①", () => {
  const fresh = kv("status", episode({ "brief.md": "x" }));
  assert.equal(fresh.status, 0, fresh.stderr);
  assert.match(fresh.stdout, /类型：概念科普/);
  assert.match(fresh.stdout, /阶段：research/);
  const waiting = kv("status", episode({ "brief.md": "x", "research.json": { claims: [claim("c01")] }, "抖音/SCRIPT.md": SCRIPT, "run.json": { type: "concept", gates: { script: { passed: false } } } }));
  assert.match(waiting.stdout, /阶段：script/);
  assert.match(waiting.stdout, /等用户确认：① 研究简报 \+ 脚本/);
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `cd skills/knowledge-video && npm test`
Expected: status.test.mjs FAIL（模块不存在）；kv status 测试 FAIL

- [ ] **Step 3: 实现 `scripts/lib/status.mjs`**

```js
// 一期视频走到哪了：按「文件有没有 + 确认节点过没过」找第一个没完成的阶段。
// 阶段：brief → research → script → storyboard → render → review → done；确认节点：script ①、storyboard ②、final ③
const step = (stage, next, waitingFor = null) => ({ stage, next, waitingFor });

/** @returns {{ stage: string, next: string, waitingFor: "script"|"storyboard"|"final"|null }} */
export function detectStatus(f) {
  if (!f.hasBrief) return step("brief", "从 templates/brief.md 复制，写清这期一句话讲明白什么、跟观众有什么关系");
  if (!f.hasEvidence) {
    return f.type === "practical"
      ? step("research", "按 scenario-content 做实测，写 实测记录.md（同一提问跑两轮并录屏）")
      : step("research", "按 references/research.md 查资料，写 research.json（每条事实带来源和原文摘录）");
  }
  if (!f.hasScript) return step("script", "按类型档案的结构配方写 抖音/SCRIPT.md，每句标「**依据:**」");
  if (!f.gates.script) {
    return f.checkOk
      ? step("script", "kv brief 生成研究简报，请用户确认研究简报和脚本（确认节点 ①）", "script")
      : step("script", "先修好 kv check 报的 ✗");
  }
  if (!f.hasStoryboard || !f.hasSheet) return step("storyboard", "写 STORYBOARD 的 build 行 → nv hf-audio → nv hf-build --snap");
  if (!f.gates.storyboard) return step("storyboard", "请用户看 snapshots/sheet.jpg（确认节点 ②）", "storyboard");
  if (!f.hasRender) return step("render", "nv render 渲染成片（自带成片检查）");
  if (!f.qa) return step("review", "按 references/qa.md 逐帧看图，写 qa.json");
  if (!f.qa.passed) return step("review", "qa.json 有未修的问题：修好 high 级问题，重写 qa.json");
  if (!f.gates.final) return step("review", "请用户看成片（确认节点 ③）", "final");
  return step("done", "写经验库记录（三个节点的修改、QA 问题、缺的组件），读一遍规律.md 看要不要更新");
}
```

- [ ] **Step 4: `kv.mjs` 加 status**

import 区加：

```js
import { readdirSync } from "node:fs";
import { loadConfig } from "./lib/config.mjs";
import { detectStatus } from "./lib/status.mjs";
```

（`readdirSync` 合并进已有 `node:fs` import 行。）在 `writeBrief` 后面加：

```js
const GATE_LABEL = { script: "① 研究简报 + 脚本", storyboard: "② 分镜总览图", final: "③ 成片" };
const TYPE_LABEL = { concept: "概念科普", practical: "实用技巧" };

function hasFileIn(dir, sub, re) {
  const p = join(dir, sub);
  return existsSync(p) && readdirSync(p).some((f) => re.test(f));
}

/** 读作品目录里的文件和 run.json，交给 detectStatus */
export function collectFacts(dir) {
  const run = readRun(dir);
  const type = episodeType(run);
  const gate = (k) => run?.gates?.[k]?.passed === true;
  const qaPath = join(dir, FILES.qa);
  let qa = null;
  if (existsSync(qaPath)) {
    try {
      qa = { passed: JSON.parse(readFileSync(qaPath, "utf8")).passed === true };
    } catch {
      qa = { passed: false };
    }
  }
  return {
    type,
    hasBrief: existsSync(join(dir, FILES.brief)),
    hasEvidence: existsSync(join(dir, type === "practical" ? "实测记录.md" : FILES.research)),
    hasScript: existsSync(join(dir, FILES.script)),
    checkOk: !runCheck(dir).issues.some((i) => i.level === "error"),
    hasStoryboard: existsSync(join(dir, "抖音/STORYBOARD.md")),
    hasSheet: existsSync(join(dir, "抖音/snapshots/sheet.jpg")),
    hasRender: hasFileIn(dir, "抖音/renders", /\.mp4$/),
    qa,
    gates: { script: gate("script"), storyboard: gate("storyboard"), final: gate("final") },
  };
}

function printStatus(dir) {
  const f = collectFacts(dir);
  const s = detectStatus(f);
  console.log(`类型：${TYPE_LABEL[f.type]}`);
  console.log(`阶段：${s.stage}`);
  console.log(`下一步：${s.next}`);
  if (s.waitingFor) console.log(`等用户确认：${GATE_LABEL[s.waitingFor]}`);
  console.log(`确认节点：${Object.entries(f.gates).map(([k, v]) => `${GATE_LABEL[k]} ${v ? "✓" : "·"}`).join("  ")}`);
  if (s.stage === "done") {
    const cfg = loadConfig(dir);
    console.log(`经验库：${join(cfg.root, cfg.experienceDir)}`);
  }
  return 0;
}
```

`main` 里加：

```js
  if (cmd === "status") return printStatus(dir);
```

并删掉 `console.error(\`kv ${cmd} 还没有实现\`); return 1;` 两行（三个命令都实现了，走不到这里）。

- [ ] **Step 5: 运行，确认通过**

Run: `cd skills/knowledge-video && npm test`
Expected: PASS（全部）

- [ ] **Step 6: 提交**

```bash
git add skills/knowledge-video/scripts/lib/status.mjs skills/knowledge-video/scripts/kv.mjs skills/knowledge-video/tests/status.test.mjs skills/knowledge-video/tests/kv.test.mjs
git commit -m "feat: kv status 判断一期视频的阶段和待确认节点

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016dF9DwFyHb12AkmwqgPqvC"
```

---

### Task 7: 导演手册、类型档案、参考文档、模板

**Files:**
- Create: `skills/knowledge-video/SKILL.md`
- Create: `skills/knowledge-video/types/concept.md`、`types/practical.md`
- Create: `skills/knowledge-video/references/research.md`、`references/script.md`、`references/qa.md`
- Create: `skills/knowledge-video/templates/brief.md`、`templates/research.json`、`templates/run.json`
- Test: `skills/knowledge-video/tests/templates.test.mjs`

**Interfaces:**
- Consumes: 三个命令（Task 4–6）；`validateResearch`（Task 1，用来校验模板）；`QA_CHECKS`（Task 3）
- Produces: 模板文件，`kv check` 对 `templates/research.json` 0 错误

- [ ] **Step 1: 写失败的测试（模板必须能通过自己的检查）**

`skills/knowledge-video/tests/templates.test.mjs`：

```js
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { validateResearch } from "../scripts/lib/research.mjs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("templates/research.json 是合格的示例", () => {
  const issues = validateResearch(JSON.parse(read("templates/research.json")));
  assert.deepEqual(issues.filter((i) => i.level === "error"), []);
});

test("templates/run.json 的阶段和确认节点齐全", () => {
  const run = JSON.parse(read("templates/run.json"));
  assert.equal(run.stage, "brief");
  assert.deepEqual(Object.keys(run.gates), ["script", "storyboard", "final"]);
  for (const g of Object.values(run.gates)) assert.deepEqual(g, { passed: false, at: null, edits: [] });
});

test("SKILL.md 有 frontmatter；文档里提到的文件都存在", () => {
  const skill = read("SKILL.md");
  assert.match(skill, /^---\nname: knowledge-video\ndescription: /);
  for (const p of ["types/concept.md", "types/practical.md", "references/research.md", "references/script.md", "references/qa.md", "templates/brief.md"]) {
    assert.ok(existsSync(new URL(`../${p}`, import.meta.url)), `${p} 不存在`);
    assert.ok(skill.includes(p), `SKILL.md 没提到 ${p}`);
  }
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `cd skills/knowledge-video && node --test tests/templates.test.mjs`
Expected: FAIL（文件不存在）

- [ ] **Step 3: 写 `SKILL.md`**

```markdown
---
name: knowledge-video
description: >
  AI 知识短视频的生产流程（导演手册）：输入一个主题，按阶段完成 理解任务 → 求真（研究或实测）→ 脚本 → 分镜 → 配音 → 渲染 → 视觉 QA → 复盘，
  每个阶段有中间产物，三个节点停下来等人确认。内容类型做成可插拔的类型档案（概念科普、实用技巧…）。
  提供 kv 命令：kv check（研究来源和脚本依据）、kv brief（研究简报）、kv status（进度）。
  当用户说「做一期 XX」「做个讲 XX 的视频」、要做 AI 概念科普视频，或项目里有 knowledge-video.config.json 时使用。
  配音、分镜、渲染交给 narrated-video；实用技巧类的实测交给 scenario-content。
---

# knowledge-video：AI 知识短视频导演手册

**原则：每条事实都能追溯到来源；每个阶段都有产物；不一次做完，三个节点停下来等人确认。**

开始前：读项目配置 `knowledge-video.config.json`（系列、观众、语气指南、经验库目录），读经验库的 `规律.md`。

## 阶段

| 阶段 | 做什么 | 产物 | 停下来 |
|---|---|---|---|
| 0. 理解任务 | 判断内容类型（读 `types/`），复制 `templates/brief.md`、`templates/run.json` 到作品目录 | `brief.md`、`run.json` | — |
| 1. 求真 | 按类型档案：概念科普查资料（`references/research.md`），实用技巧做实测 | `research.json` 或 `实测记录.md` | — |
| 2. 脚本 | 按类型档案的结构配方写 `抖音/SCRIPT.md`（narrated-video 格式），每句标依据（`references/script.md`）；费曼检查写进 brief.md；`kv check` 无 ✗ | `抖音/SCRIPT.md` | **① `kv brief` 生成研究简报，请用户确认简报和脚本** |
| 3. 分镜 | 按 narrated-video 写 STORYBOARD 的 build 行 → `nv hf-audio` → `nv hf-build --snap` | `抖音/STORYBOARD.md`、`抖音/snapshots/sheet.jpg` | **② 请用户看总览图** |
| 4. 渲染和 QA | `nv render`；逐帧看总览图和成片抽帧，写 `qa.json`（`references/qa.md`）；有 high 级问题先修 | `抖音/renders/*.mp4`、`qa.json` | **③ 请用户看成片** |
| 5. 复盘 | 写经验库记录；同类修改出现 2 次以上，提议改哪个文件（先问用户） | 经验库 | — |

不确定做到哪了：`kv status <作品目录>`。

## 确认节点怎么记

用户确认通过：把 `run.json` 的 `gates.<节点>.passed` 改成 true，`at` 写日期，`stage` 改成下一阶段。用户提了修改意见：原话追加进 `gates.<节点>.edits`，改完再请用户确认。**没通过不往下走。**

## 硬规矩

- 不编事实：脚本里的事实只能来自 research.json；没查到可靠来源的写进 `open_questions`，不写进脚本
- 口播要忠于所引 claim：claim 说「通常」，口播不能说成「一定」
- 类比要在费曼检查里写明在哪里不成立
- 不在 ② 之前渲染；不在视觉 QA 之前说「做完了」
- 画面上的数字和说法要和 research.json 一致
- 缺的画面组件：那一帧手写，记进经验库；同一种画面两期都需要才做成组件

## 文件

- 类型档案：`types/concept.md`（概念科普）、`types/practical.md`（实用技巧）。新类型：先用最接近的档案做 1～2 期，问题记进经验库，再写正式档案
- 参考：`references/research.md`（怎么查、怎么摘录）、`references/script.md`（依据写法、类比检验）、`references/qa.md`（视觉 QA）
- 模板：`templates/brief.md`、`templates/research.json`、`templates/run.json`

## 经验库

位置：项目配置的 `experienceDir`。每期一条 `YYYY-MM-DD-简称.md`：类型；三个节点用户改了什么（原稿 → 改后，来自 run.json 的 edits）；QA 发现的问题；缺了哪些组件；渲染等环节的问题。`规律.md`：同一类修改出现 2 次及以上写进去，注明应改到哪个文件。
```

- [ ] **Step 4: 写类型档案**

`types/concept.md`：

```markdown
# 类型档案：概念科普

讲清一个 AI 概念（RAG、MCP、Agent…），落到「这跟观众有什么关系」。

## 真实性靠什么

查资料。产物 `research.json`，规则见 `../references/research.md`。脚本里每句事实都要引用 claim。

## 结构配方（约 1 分钟，9～13 句口播）

| 段落 | 句数 | 作用 |
|---|---|---|
| 钩子 | 1–2 | 观众遇到过的反常现象（「同一个问题，问知识库答对了，问它却在瞎编」） |
| 是什么 | 2 | 一句大白话定义 + 一个类比 |
| 为什么 | 2–3 | 原理讲到观众需要的程度，每句有依据 |
| 跟你有什么关系 | 2–3 | 落到能马上用的一个做法 |
| 误区 / 边界 | 1–2 | 它做不到什么 |
| 收尾 | 1 | 一句话记住 + 下一期预告 |

## 费曼检查（写进 brief.md）

- 零基础的人会追问的问题（≥3 个），脚本里都有大白话回答
- 类比：一句话说清它像什么，以及**在哪里不成立**
- 术语：每个要么换成大白话，要么配类比

## 常用画面

narrated-video 的 hf-kit：`chain` 因果链（为什么）、`steps` 步骤（怎么做）、`compare` 对比卡（以前 vs 现在、误区）、`marker` 荧光笔（一句话记住）。缺的画面记进经验库。

## 额外 QA

`fact-on-screen`：画面上的数字、说法和 research.json 一致。
```

`types/practical.md`：

```markdown
# 类型档案：实用技巧

教一个马上能用的 AI 用法。

## 真实性靠什么

实测：按 scenario-content 的流程写场景卡、在真实产品里实测，产物 `实测记录.md` + 录屏（`nv rec`）。

## 结构配方

沿用 narrated-video 的 `references/douyin-recipe.md`「1 分钟版」：能用 → 用好三招 → 避坑。

## 依据怎么标

SCRIPT.md 每句 `**依据:**` 写实测轮次（如 `R1`、`R2`），或 `类比`、`观点`。`kv check` 对实用技巧类只检查依据行存在且非空。

## 常用画面

`chat` 聊天（钩子场景）、`answer` 重建 AI 回答（实测原文）、`template` 模板卡（结尾）。
```

- [ ] **Step 5: 写参考文档**

`references/research.md`：

```markdown
# 研究：怎么查、怎么记

## 来源优先级

1. `official`：官方文档、官网、官方博客、产品说明
2. `paper`：论文（arXiv、会议论文）
3. `media`：媒体报道、技术博客
4. `other`：百科、论坛等

先找 1、2；只有 3、4 的事实 `kv check` 会警告。

## 一条 claim 怎么记

- `text`：一句话事实，用自己的话，但不能比来源说得更绝对
- `kind`：`fact`；涉及数字、日期、排名的用 `number`
- `confidence`：`high`（官方或论文明确写了）、`medium`（多个可靠来源一致，但没有一手来源）、`low`（只有间接说法）
- 每个来源：`title`、`url`、`type`、`quote`（**来源原文摘录**，复制原句，不要转述；英文就摘英文）、`accessed`（查阅日期）
- `number` 类或可信度不是 high：至少 2 个来源，或 1 个官方来源

## 查不到、打不开怎么办

- 国内打不开的来源：换官方中文文档或可访问的镜像
- 查了没有可靠来源：写进 `open_questions`，**不写进脚本**
- 来源之间说法冲突：都记下来，在 brief.md 写明你怎么取舍，在确认节点 ① 请用户判断

## 查到什么程度够

脚本每段要用的事实都有 claim 即可。查完先写脚本，脚本需要而研究里没有的，再回来补，不要一开始堆资料。
```

`references/script.md`：

````markdown
# 脚本：依据和类比

SCRIPT.md 用 narrated-video 的格式（`## Line N — 标签 (Frame N)`、`**重点词:**`、`**Emotion:**`、缩进 4 格的口播）。每个块再加一行依据：

```
## Line 3 — 定义 (Frame 3)

**重点词:** 先翻资料
**Emotion:** 平静
**依据:** c01, c03

    它不是凭记忆回答，而是先翻资料，再回答。
```

## 依据的三种写法

| 写法 | 什么时候用 |
|---|---|
| `c01, c03` | 这句里有事实，引用对应 claim（逗号、顿号、空格分隔都行） |
| `类比` | 「就像开卷考试」；不需要来源，但费曼检查要写明它在哪里不成立 |
| `观点` | 我们的判断和建议（「问公司的事，先把文件发给它」） |

三种不能混用：一句里既有事实又有观点，拆成两句。

## 写完自查

- 口播有没有比 claim 说得更绝对（「通常」→「一定」、「可以」→「总是」）
- 每个术语要么换掉，要么配类比
- `kv check` 无 ✗；有 claim 没被用到的警告，要么删掉这条研究，要么补进脚本
````

`references/qa.md`：

````markdown
# 视觉 QA

渲染后，逐帧看 `抖音/snapshots/sheet.jpg` 和成片抽帧（`ffmpeg -ss <秒> -i <成片> -frames:v 1 x.png`），写 `qa.json`。

## 检查项（checked 必须全部写上）

| 检查项 | 看什么 |
|---|---|
| `safe-area` | 内容在 x 60–1020、y 230–1150 内，不进字幕带（y 1180–1440）和右侧 150px |
| `text-size` | 手机上要读的字不小于 37px |
| `density` | 一屏只有一个主体；表格最多 2～3 行清晰可读 |
| `typo` | 错别字、标点、术语写法前后一致 |
| `fact-on-screen` | 画面上的数字、说法和 research.json 一致（实用技巧类：和实测记录一致） |
| `rhythm` | 画面跟着口播出现，没有长时间不动、也没有一闪而过 |

## 格式

```json
{
  "passed": false,
  "checked": ["safe-area", "text-size", "density", "typo", "fact-on-screen", "rhythm"],
  "issues": [{ "frame": 4, "severity": "high", "check": "density", "problem": "一屏 6 行表格，手机上看不清", "fix": "只留 2 行，其余虚化" }]
}
```

- `severity`：`high`（必须修，修好前不请用户看成片）、`medium`（建议修）、`low`（记下来）
- `passed: true` 时不能有 high 级问题
````

- [ ] **Step 6: 写模板**

`templates/brief.md`：

```markdown
# 任务说明：【主题】

- 类型：【concept / practical】
- 系列 / 期数：【】
- 这期一句话讲明白：【】
- 跟观众有什么关系：【观众在什么情况下会遇到它】
- 钩子候选：【观众遇到过的反常现象，1～2 个】

## 费曼检查

### 零基础的人会追问

| 追问 | 脚本里怎么回答（第几句） |
|---|---|
| 【】 | 【】 |

### 类比

- 像什么：【】
- 在哪里不成立：【】

### 术语

| 术语 | 换成 / 配的类比 |
|---|---|
| 【】 | 【】 |
```

`templates/research.json`：

```json
{
  "topic": "示例：RAG 是什么",
  "question": "示例：为什么问公司知识库时，AI 能答得比直接问它准？",
  "claims": [
    {
      "id": "c01",
      "text": "RAG 把检索到的外部资料和大模型结合起来生成回答",
      "kind": "fact",
      "confidence": "high",
      "sources": [
        {
          "title": "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks",
          "url": "https://arxiv.org/abs/2005.11401",
          "type": "paper",
          "quote": "示例：把这里换成来源原文里证明这条事实的句子",
          "accessed": "2026-10-07"
        }
      ]
    }
  ],
  "open_questions": []
}
```

`templates/run.json`：

```json
{
  "type": "concept",
  "stage": "brief",
  "gates": {
    "script": { "passed": false, "at": null, "edits": [] },
    "storyboard": { "passed": false, "at": null, "edits": [] },
    "final": { "passed": false, "at": null, "edits": [] }
  }
}
```

- [ ] **Step 7: 运行，确认通过**

Run: `cd skills/knowledge-video && npm test`
Expected: PASS（全部）

- [ ] **Step 8: 提交**

```bash
git add skills/knowledge-video/SKILL.md skills/knowledge-video/types skills/knowledge-video/references skills/knowledge-video/templates skills/knowledge-video/tests/templates.test.mjs
git commit -m "docs: knowledge-video 导演手册、类型档案、参考文档和模板

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016dF9DwFyHb12AkmwqgPqvC"
```

---

### Task 8: 接入项目（配置、系列、经验库、软链接）

**Files:**
- Create: `knowledge-video.config.json`（项目根目录）
- Modify: `00-规划/系列/系列.json`
- Create: `00-规划/系列/AI概念一分钟.md`
- Create: `00-规划/经验库/规律.md`
- Modify: `CLAUDE.md`（项目说明）
- 软链接：`~/.claude/skills/knowledge-video`

**Interfaces:**
- Consumes: `loadConfig` 读的字段 `series`、`audience`、`voiceGuide`、`experienceDir`（Task 4）；`kv status`（Task 6）

- [ ] **Step 1: 项目配置**

`knowledge-video.config.json`：

```json
{
  "series": "AI概念一分钟",
  "audience": "想用 AI 提升工作效率的上班族：不讲原理细节，多用类比，落到能马上用的做法",
  "voiceGuide": "00-规划/语气指南.md",
  "experienceDir": "00-规划/经验库"
}
```

- [ ] **Step 2: 登记系列**

`00-规划/系列/系列.json` 加一项（保持合法 JSON）：

```json
  "AI概念一分钟": { "label": "AI 概念一分钟", "unit": "期" }
```

`00-规划/系列/AI概念一分钟.md`：

```markdown
# 系列规划：AI 概念一分钟（v0 草案）

> 状态：**草案**（2026-10-07），名字可改。生产流程用 `skills/knowledge-video`（概念科普档案）。

| 项目 | 内容 |
|---|---|
| 一句话 | 一分钟讲清一个 AI 概念，以及它跟你的工作有什么关系 |
| 目标观众 | 想用 AI 提升工作效率的上班族（同主线） |
| 和主线的关系 | 主线教「怎么用」，这个系列讲「为什么这样用有效」；可以互相引用 |
| 真实性 | 每条事实带来源（research.json），见 knowledge-video 的研究规则 |
| 第一期 | RAG 是什么 |
```

- [ ] **Step 3: 经验库**

`00-规划/经验库/规律.md`：

```markdown
# 经验规律

> 同一类修改出现 2 次及以上，写进这里，并注明应该改到哪个文件。改规则前先问用户。每期开始前先读一遍。

| 规律 | 出现在哪几期 | 应改到 | 状态 |
|---|---|---|---|
```

- [ ] **Step 4: 软链接和 CLAUDE.md**

```bash
ln -s /home/power/self-media/skills/knowledge-video ~/.claude/skills/knowledge-video
ls -la ~/.claude/skills/knowledge-video
```

Expected: 显示指向 `/home/power/self-media/skills/knowledge-video` 的链接

`CLAUDE.md` 的「约定」里，「**内容生产流程**」那一条之前加一条：

```markdown
- **AI 知识短视频**（`skills/knowledge-video`，命令 `kv`）：用户说「做一期 XX」时按它的导演手册走：理解任务 → 求真（概念科普查资料写 research.json；实用技巧走下面的实测流程）→ 脚本（每句标依据）→ 分镜 → 渲染 → 视觉 QA → 复盘；三个节点停下来等用户确认，进度看 `kv status`。经验库在 `00-规划/经验库/`。
```

- [ ] **Step 5: 冒烟验证**（在临时目录里，不在作品目录留文件）

```bash
cd /home/power/self-media
node -e 'const s=JSON.parse(require("fs").readFileSync("00-规划/系列/系列.json","utf8")); if(!s["AI概念一分钟"]) process.exit(1); console.log("系列已登记")'
SMOKE=$(mktemp -d)
cp skills/knowledge-video/templates/brief.md skills/knowledge-video/templates/research.json skills/knowledge-video/templates/run.json "$SMOKE/"
~/.claude/skills/knowledge-video/bin/kv status "$SMOKE"
~/.claude/skills/knowledge-video/bin/kv check "$SMOKE"
```

Expected：打印「系列已登记」；`kv status` 输出「类型：概念科普」「阶段：script」「下一步：按类型档案的结构配方写 抖音/SCRIPT.md…」；`kv check` 输出「✓ research.json：1 条事实都有来源」「· 还没有 抖音/SCRIPT.md」，退出码 0。临时目录不用管（系统临时目录）。

- [ ] **Step 6: 提交**

```bash
git add knowledge-video.config.json 00-规划/系列/系列.json 00-规划/系列/AI概念一分钟.md 00-规划/经验库/规律.md CLAUDE.md
git commit -m "feat: 项目接入 knowledge-video，登记「AI 概念一分钟」系列和经验库

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016dF9DwFyHb12AkmwqgPqvC"
```

---

## 之后：第一期试跑（不属于本计划的实现任务）

计划完成后，按 SKILL.md 做「RAG 是什么」，三个确认节点由用户参与，按 spec 第 1 节验收，并写第一条经验记录。这是 Skill 的正常使用，不是代码任务。
