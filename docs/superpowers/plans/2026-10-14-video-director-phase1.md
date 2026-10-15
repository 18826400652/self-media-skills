# 视频导演（video-director）阶段 1 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做出 `video-director` 技能（`vd` 命令 + 导演规则 + 账号固定元素），并用它把 RAG 这期完整做成约 63 秒的成片。

**Architecture:** 导演脚本 `DIRECTOR.md` = 给人看的正文 + 一个 ```` ```json vd ```` 机器块（配色、分段、音效、配乐、结尾）。`vd build <工程>` 读机器块和 `nv hf-audio` 产出的 `audio_meta.json`，生成 `cues.js`（`@词` → 秒数）、音轨（配音拼接 + 音效）、`index.html` 里 `<!-- vd:* -->` 标记之间的宿主元素（各段子画面、三个账号固定元素、音频），有配乐时再做节拍对位和人声避让，最后跑 `hyperframes check`。各段画面（`compositions/frames/seg-*.html`）由 Claude 按导演脚本手写，只通过 `VD.at("词", "段id")` 取时间。

**Tech Stack:** Node 22 ESM（`.mjs`）、`node --test`、HyperFrames CLI 0.8.143（GSAP 时间轴）、ffmpeg、HeyGen CLI（OAuth）、`@hyperframes/core`（`carve.mjs` 依赖）。

**Spec:** `docs/superpowers/specs/2026-10-14-video-director-design.md`

## Global Constraints

- HyperFrames CLI 版本固定 `hyperframes@0.8.143`（工程 `package.json` 脚本里的锁定版本；`@hyperframes/core` 用同一版本）。
- Node 访问外网需要环境变量 `NODE_USE_ENV_PROXY=1`（代理 `127.0.0.1:10808`）；`vd` 调用子进程时自动带上。
- 画布 1080×1920；安全区：顶部 200、右侧 160、底部 480 像素内不放关键内容；字幕带 y 1180–1440。
- 账号强调色取 `narrated-video.config.json` 的 `hfKit.tokens.accent`（现为 `#FFD84D`），用途固定为「重点 / 找到的东西」。
- 字体只用打包的三套：`Noto Sans SC Variable`、`Noto Serif SC Variable`、`JetBrains Mono`（来源 `/home/power/hyperframes/assets/dykit/fonts`，整包复制进工程 `assets/fonts/`）。
- 渲染期间不得联网、不得用 `Date.now()` / `Math.random()`（HyperFrames 确定性规则）。
- 所有报错信息用中文，指出文件、位置和怎么改（沿用 kv / nv 的风格）。
- 口播原文和 `research.json` 里的事实一字不改；导演新加的屏幕文字必须列进 `DIRECTOR.md` 第 6 节。
- 配音来自 `nv hf-audio`（不改）；视频、配音、字体包不入库（`.gitignore`）。

## Review Focus

1. **`DIRECTOR.md` 里写了口播中没有的 `@词`（笔误）**：`vd build` 必须失败，并列出最接近的 3 个候选词——不能悄悄用 0 秒。→ Task 3 测试 `resolveCue 词不存在`。
2. **`@词` 跨越字幕切片或与口播写法不同（「RAG 说白了」vs「RAG说白了」、全角标点、`问A`+`I` 这种多字切片）**：应能匹配。→ Task 3 测试 `规范化匹配`、`跨 Line`。
3. **重新配音后时长变了**：重跑 `vd build` 后所有时间自动更新，`index.html` 里手写的部分不被覆盖。→ Task 5 测试 `replaceBlock 只替换标记之间`、`幂等`。
4. **配乐不可用（未登录 HeyGen / 搜不到 / 网络失败）**：成片照常生成，只少配乐，并打印警告。→ Task 6 测试 `resolveMusic 失败时返回 null`。
5. **配乐长度不够、找不到可对位的节拍**：不报错，退回从头播放并警告。→ Task 6 测试 `pickBeat 无候选返回 null`。

---

## 文件结构

```
skills/video-director/
  SKILL.md                      技能说明（何时用、流程、命令、关卡）
  package.json                  bin: vd；test: node --test tests/*.test.mjs
  bin/vd                        bash 入口
  scripts/vd.mjs                子命令分发：build | cues | check
  scripts/lib/config.mjs        读项目配置 video-director.config.json + 账号强调色
  scripts/lib/director.mjs      解析、校验 DIRECTOR.md（机器块、@词、必填章节）
  scripts/lib/cues.mjs          audio_meta → 字流 → @词 秒数；行、段时间
  scripts/lib/audio.mjs         配音拼接 + 音效混音的 ffmpeg 参数
  scripts/lib/music.mjs         配乐：取曲、挑节拍、写 media-start、调用 carve
  scripts/lib/assemble.mjs      index.html 标记块替换、宿主元素、cues.js
  scripts/lib/run.mjs           子进程封装（带代理环境变量）
  references/director-rules.md  导演规则（自检表每项怎么做、反例）
  templates/DIRECTOR.md         导演脚本模板
  templates/index.html          工程总装模板（含 vd 标记块）
  templates/segment.html        单段子画面模板
  tests/helpers.mjs, tests/fixtures/rag-audio_meta.json, tests/*.test.mjs
06-品牌资产/hyperframes/
  brand-kicker.html  brand-captions.html  brand-ending.html
video-director.config.json      项目配置（字体来源、品牌目录、音效目录、HF 版本）
04-作品/AI概念一分钟/01-RAG/抖音-director/   RAG 这期的新工程（旧 抖音/ 保留不动）
```

---

### Task 1: 技能骨架、配置、子进程封装

**Files:**
- Create: `skills/video-director/package.json`, `bin/vd`, `scripts/vd.mjs`, `scripts/lib/config.mjs`, `scripts/lib/run.mjs`, `tests/helpers.mjs`, `tests/config.test.mjs`
- Create: `video-director.config.json`（项目根）

**Interfaces:**
- Produces: `loadConfig(projectRoot) → { fontsDir, brandDir, sfxDir, hfVersion, accent }`；`findProjectRoot(startDir) → string`（向上找 `video-director.config.json`）；`run(cmd, args, { cwd }) → { status, stdout, stderr }`（自动加 `NODE_USE_ENV_PROXY=1`）；测试用 `project(files) → dir`。

- [ ] **Step 1: 写骨架文件**

`skills/video-director/package.json`：
```json
{
  "name": "video-director",
  "private": true,
  "type": "module",
  "description": "视频导演：口播稿 + 配音 → 导演脚本 → HyperFrames 视频工程",
  "bin": { "vd": "bin/vd" },
  "scripts": { "test": "node --test tests/*.test.mjs" }
}
```

`skills/video-director/bin/vd`：
```bash
#!/usr/bin/env bash
# video-director 入口：vd build|cues|check <视频工程目录>
set -euo pipefail
SKILL_DIR="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"
exec node "$SKILL_DIR/scripts/vd.mjs" "$@"
```

`video-director.config.json`（项目根）：
```json
{
  "fontsDir": "/home/power/hyperframes/assets/dykit/fonts",
  "brandDir": "06-品牌资产/hyperframes",
  "sfxDir": "/home/power/.claude/skills/media-use/audio/assets/sfx",
  "hfVersion": "0.8.143"
}
```

`tests/helpers.mjs`：
```js
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** 建一个临时目录：files = { 相对路径: 内容（对象自动转 JSON） } */
export function project(files) {
  const dir = mkdtempSync(join(tmpdir(), "vd-"));
  for (const [p, v] of Object.entries(files)) {
    mkdirSync(join(dir, p, ".."), { recursive: true });
    writeFileSync(join(dir, p), typeof v === "string" ? v : JSON.stringify(v));
  }
  return dir;
}
```

- [ ] **Step 2: 写失败的测试 `tests/config.test.mjs`**

```js
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { findProjectRoot, loadConfig } from "../scripts/lib/config.mjs";
import { project } from "./helpers.mjs";

const CFG = { fontsDir: "/f", brandDir: "06-品牌资产/hyperframes", sfxDir: "/s", hfVersion: "0.8.143" };

test("findProjectRoot：从作品子目录向上找到配置", () => {
  const dir = project({ "video-director.config.json": CFG, "04-作品/a/抖音-director/x.txt": "" });
  assert.equal(findProjectRoot(join(dir, "04-作品/a/抖音-director")), dir);
});

test("loadConfig：brandDir 转绝对路径，读 narrated-video 配置里的强调色", () => {
  const dir = project({ "video-director.config.json": CFG, "narrated-video.config.json": { hfKit: { tokens: { accent: "#FFD84D" } } } });
  const c = loadConfig(dir);
  assert.equal(c.brandDir, join(dir, "06-品牌资产/hyperframes"));
  assert.equal(c.accent, "#FFD84D");
  assert.equal(c.hfVersion, "0.8.143");
});

test("loadConfig：缺配置或缺字段给中文错误", () => {
  assert.throws(() => loadConfig(project({})), /找不到 video-director.config.json/);
  assert.throws(() => loadConfig(project({ "video-director.config.json": { fontsDir: "/f" } })), /缺少字段 brandDir/);
});

test("findProjectRoot：一路找不到时报错", () => {
  assert.throws(() => findProjectRoot(project({ "a/b.txt": "" })), /找不到 video-director.config.json/);
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `cd skills/video-director && node --test tests/config.test.mjs`
Expected: FAIL，`Cannot find module '../scripts/lib/config.mjs'`

- [ ] **Step 4: 实现 `scripts/lib/config.mjs` 和 `scripts/lib/run.mjs`**

```js
// scripts/lib/config.mjs
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

const FILE = "video-director.config.json";
const REQUIRED = ["fontsDir", "brandDir", "sfxDir", "hfVersion"];

/** 从 startDir 向上找项目根（含 video-director.config.json 的目录） */
export function findProjectRoot(startDir) {
  let dir = resolve(startDir);
  for (;;) {
    if (existsSync(join(dir, FILE))) return dir;
    const up = dirname(dir);
    if (up === dir) throw new Error(`找不到 ${FILE}：从 ${startDir} 向上都没有。请在项目根目录建这个文件（见 skills/video-director/SKILL.md）`);
    dir = up;
  }
}

export function loadConfig(root) {
  const p = join(root, FILE);
  if (!existsSync(p)) throw new Error(`找不到 video-director.config.json：${p}`);
  const c = JSON.parse(readFileSync(p, "utf8"));
  for (const k of REQUIRED) if (!c[k]) throw new Error(`${p} 缺少字段 ${k}`);
  const abs = (x) => (isAbsolute(x) ? x : join(root, x));
  const nvp = join(root, "narrated-video.config.json");
  const accent = existsSync(nvp) ? JSON.parse(readFileSync(nvp, "utf8"))?.hfKit?.tokens?.accent ?? null : null;
  return { fontsDir: abs(c.fontsDir), brandDir: abs(c.brandDir), sfxDir: abs(c.sfxDir), hfVersion: c.hfVersion, accent };
}
```

```js
// scripts/lib/run.mjs
import { spawnSync } from "node:child_process";

/** 跑子进程；自动带 NODE_USE_ENV_PROXY=1（本机走代理，Node 的 fetch 默认不读代理变量） */
export function run(cmd, args, { cwd } = {}) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 64 << 20, env: { ...process.env, NODE_USE_ENV_PROXY: "1" } });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? (r.error?.message || "") };
}
```

`scripts/vd.mjs`（先只放分发骨架，子命令在后面的任务里接上）：
```js
#!/usr/bin/env node
// 用法：vd build|cues|check <视频工程目录>
//   cues   DIRECTOR.md 的 @词 → cues.js（只算时间，不改别的文件）
//   build  cues → 音轨 → index.html 标记块 → 配乐对位与避让 → hyperframes check
//   check  校验 DIRECTOR.md + hyperframes check
import { resolve } from "node:path";

const USAGE = "用法：vd build|cues|check <视频工程目录>";
const COMMANDS = {};

export async function main(argv) {
  const [cmd, dir, ...rest] = argv;
  if (!COMMANDS[cmd] || !dir) { console.error(USAGE); return 2; }
  try { return (await COMMANDS[cmd](resolve(dir), rest)) ?? 0; }
  catch (err) { console.error(`✗ ${err.message}`); return 1; }
}

export { COMMANDS };
if (import.meta.url === `file://${process.argv[1]}`) process.exit(await main(process.argv.slice(2)));
```

- [ ] **Step 5: 跑测试确认通过**

Run: `cd skills/video-director && chmod +x bin/vd && node --test tests/config.test.mjs`
Expected: PASS（4 个测试）

- [ ] **Step 6: 软链接并提交**

```bash
ln -s "$PWD/skills/video-director" ~/.claude/skills/video-director
ln -s "$PWD/skills/video-director/bin/vd" ~/.local/bin/vd
vd foo; echo "exit $?"   # 期望打印用法，exit 2
git add skills/video-director video-director.config.json
git commit -m "工具: video-director 骨架、项目配置、子进程封装"
```

---

### Task 2: 解析和校验 `DIRECTOR.md`

**Files:**
- Create: `scripts/lib/director.mjs`, `tests/director.test.mjs`

**Interfaces:**
- Consumes: 无
- Produces: `parseDirector(md) → { vd, tokens, errors }`
  - `vd`：机器块对象（结构见下）
  - `tokens`：`[{ text: "编一套", nth: 1, raw: "@编一套" }]`，按出现顺序、去重（text+nth 相同只留一个）
  - `errors`：`string[]`（中文）
- `validateDirector(parsed, lineCount) → string[]`：在 `errors` 基础上加分段覆盖检查。

机器块结构（```` ```json vd ```` 围起来，全文只能有一个）：
```json
{
  "kicker": "AI 概念一分钟 · 第 1 期",
  "palette": { "bg": "#F1ECE2", "ink": "#1C1A17", "muted": "#6E675C", "accent": "#FFD84D", "alert": "#D2372A" },
  "segments": [{ "id": "seg-01-hook", "lines": [1, 2] }],
  "sfx": [{ "name": "pop", "at": "@编一套", "volume": 0.6 }],
  "music": { "intent": "light curious lo-fi explainer", "drop": "@六次里", "volume": 0.4 },
  "ending": { "next": "下一期：Agent 跟聊天机器人差在哪？", "question": "你问 AI 的时候，被它编过什么？", "cta": "评论区说说 ↓", "hold": 2.0 },
  "sample": { "segments": ["seg-01-hook", "seg-02-why", "seg-03-what"], "end": "@先去翻资料", "tail": 0.9 }
}
```
`music` 可以是 `null`（不要配乐）。

- [ ] **Step 1: 写失败的测试 `tests/director.test.mjs`**

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDirector, validateDirector } from "../scripts/lib/director.mjs";

const VD = {
  kicker: "AI 概念一分钟 · 第 1 期",
  palette: { bg: "#F1ECE2", ink: "#1C1A17", muted: "#6E675C", accent: "#FFD84D", alert: "#D2372A" },
  segments: [{ id: "seg-01-hook", lines: [1, 2] }, { id: "seg-02-why", lines: [3, 3] }],
  sfx: [{ name: "pop", at: "@编一套", volume: 0.6 }],
  music: null,
  ending: { next: "下一期", question: "你被编过什么？", cta: "评论区说说 ↓", hold: 2 },
  sample: { segments: ["seg-01-hook"], end: "@根本没这条", tail: 0.9 },
};
const SECTIONS = ["## 1. 视觉方案", "## 2. 分段", "## 3. 导演规则自检", "## 4. 音乐", "## 5. 账号固定元素", "## 6. 新增内容", "## 7. 样片范围"];
const doc = (vd = VD, extra = "说到 @编一套 时盖章；第二次说到 @资料#2，再到「@根本没这条」。") =>
  ["# 导演脚本", ...SECTIONS.flatMap((s) => [s, extra]), "```json vd", JSON.stringify(vd, null, 2), "```"].join("\n\n");

test("parseDirector：读机器块、@词（含 #序号、全角引号边界），按出现顺序去重", () => {
  const p = parseDirector(doc());
  assert.deepEqual(p.errors, []);
  assert.equal(p.vd.kicker, "AI 概念一分钟 · 第 1 期");
  assert.deepEqual(p.tokens.map((t) => [t.text, t.nth]), [["编一套", 1], ["资料", 2], ["根本没这条", 1]]);
});

test("parseDirector：没有机器块、多个机器块、JSON 坏了都报错", () => {
  assert.match(parseDirector("# x").errors.join(), /缺少 ```json vd 机器块/);
  assert.match(parseDirector(doc() + "\n```json vd\n{}\n```").errors.join(), /只能有一个/);
  assert.match(parseDirector("```json vd\n{bad\n```").errors.join(), /JSON 格式错误/);
});

test("parseDirector：缺章节、自检表留着（待填）都报错", () => {
  const md = doc().replace("## 4. 音乐", "## 4. 配乐");
  assert.match(parseDirector(md).errors.join(), /缺少章节「## 4. 音乐」/);
  assert.match(parseDirector(doc(VD, "（待填）")).errors.join(), /还有（待填）/);
});

test("parseDirector：配色不是 #RRGGBB、sfx 的 at 不是 @词 都报错", () => {
  const bad = { ...VD, palette: { ...VD.palette, ink: "black" }, sfx: [{ name: "pop", at: "2.8", volume: 1 }] };
  const e = parseDirector(doc(bad)).errors.join("\n");
  assert.match(e, /palette.ink 必须是 #RRGGBB/);
  assert.match(e, /sfx\[0\].at 必须写成 @词/);
});

test("validateDirector：分段必须从第 1 句连续覆盖到最后一句", () => {
  const p = parseDirector(doc());
  assert.deepEqual(validateDirector(p, 3), []);
  assert.match(validateDirector(p, 4).join(), /第 4 句没有分到任何段/);
  const gap = parseDirector(doc({ ...VD, segments: [{ id: "a", lines: [1, 1] }, { id: "b", lines: [3, 3] }] }));
  assert.match(validateDirector(gap, 3).join(), /第 2 句没有分到任何段/);
  const dup = parseDirector(doc({ ...VD, segments: [{ id: "a", lines: [1, 2] }, { id: "a", lines: [3, 3] }] }));
  assert.match(validateDirector(dup, 3).join(), /段 id 重复：a/);
});

test("validateDirector：sample.segments 必须是已有的段", () => {
  const p = parseDirector(doc({ ...VD, sample: { segments: ["seg-09"], end: "@编一套", tail: 1 } }));
  assert.match(validateDirector(p, 3).join(), /sample.segments 里的 seg-09 不是已定义的段/);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd skills/video-director && node --test tests/director.test.mjs`
Expected: FAIL，`Cannot find module '../scripts/lib/director.mjs'`

- [ ] **Step 3: 实现 `scripts/lib/director.mjs`**

```js
// 解析 DIRECTOR.md：给人看的正文 + 一个 ```json vd 机器块
export const SECTIONS = ["## 1. 视觉方案", "## 2. 分段", "## 3. 导演规则自检", "## 4. 音乐", "## 5. 账号固定元素", "## 6. 新增内容", "## 7. 样片范围"];
const BLOCK = /```json vd\s*\n([\s\S]*?)\n```/g;
// @词：遇到空白、@、#、中英文标点、引号、括号即结束；可带 #序号
const TOKEN = /@([^\s@#，。、：；！？,.;:!?"'`「」『』“”‘’（）()\[\]【】<>]+)(?:#(\d+))?/g;
const HEX = /^#[0-9A-Fa-f]{6}$/;

export function parseDirector(md) {
  const errors = [];
  const blocks = [...md.matchAll(BLOCK)];
  let vd = null;
  if (blocks.length === 0) errors.push("缺少 ```json vd 机器块（放在 DIRECTOR.md 末尾，结构见 templates/DIRECTOR.md）");
  else if (blocks.length > 1) errors.push(`\`\`\`json vd 机器块只能有一个，现在有 ${blocks.length} 个`);
  else {
    try { vd = JSON.parse(blocks[0][1]); } catch (err) { errors.push(`机器块 JSON 格式错误：${err.message}`); }
  }
  for (const s of SECTIONS) if (!md.includes(s)) errors.push(`缺少章节「${s}」`);
  if (md.includes("（待填）")) errors.push("还有（待填）没写完");
  if (vd) errors.push(...checkVd(vd));

  const seen = new Set();
  const tokens = [];
  for (const m of md.matchAll(TOKEN)) {
    const t = { text: m[1], nth: m[2] ? Number(m[2]) : 1, raw: m[0] };
    const key = `${t.text}#${t.nth}`;
    if (!seen.has(key)) { seen.add(key); tokens.push(t); }
  }
  return { vd, tokens, errors };
}

function checkVd(vd) {
  const e = [];
  for (const k of ["bg", "ink", "muted", "accent", "alert"]) if (!HEX.test(vd.palette?.[k] ?? "")) e.push(`palette.${k} 必须是 #RRGGBB`);
  if (!vd.kicker) e.push("缺少 kicker（栏目标签文字）");
  if (!Array.isArray(vd.segments) || !vd.segments.length) e.push("segments 不能为空");
  (vd.sfx ?? []).forEach((s, i) => { if (!/^@\S/.test(s.at ?? "")) e.push(`sfx[${i}].at 必须写成 @词`); });
  if (vd.music && !/^@\S/.test(vd.music.drop ?? "")) e.push("music.drop 必须写成 @词（或把 music 写成 null）");
  for (const k of ["next", "question", "cta"]) if (!vd.ending?.[k]) e.push(`ending.${k} 不能为空`);
  if (!(vd.ending?.hold >= 0)) e.push("ending.hold 必须是不小于 0 的秒数");
  if (!/^@\S/.test(vd.sample?.end ?? "")) e.push("sample.end 必须写成 @词");
  return e;
}

/** 在解析结果上再查：分段从第 1 句连续覆盖到第 lineCount 句；sample 引用的段存在 */
export function validateDirector({ vd, errors }, lineCount) {
  const e = [...errors];
  if (!vd?.segments) return e;
  const ids = new Set();
  const covered = new Map();
  for (const s of vd.segments) {
    if (ids.has(s.id)) e.push(`段 id 重复：${s.id}`);
    ids.add(s.id);
    const [a, b] = s.lines ?? [];
    for (let n = a; n <= b; n++) covered.set(n, (covered.get(n) ?? 0) + 1);
  }
  for (let n = 1; n <= lineCount; n++) {
    if (!covered.has(n)) e.push(`第 ${n} 句没有分到任何段`);
    else if (covered.get(n) > 1) e.push(`第 ${n} 句同时分到了多个段`);
  }
  for (const id of vd.sample?.segments ?? []) if (!ids.has(id)) e.push(`sample.segments 里的 ${id} 不是已定义的段`);
  return e;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd skills/video-director && node --test tests/director.test.mjs`
Expected: PASS（6 个测试）

- [ ] **Step 5: 提交**

```bash
git add skills/video-director/scripts/lib/director.mjs skills/video-director/tests/director.test.mjs
git commit -m "工具: vd 解析校验 DIRECTOR.md（机器块、@词、章节、分段覆盖）"
```

---

### Task 3: `@词` → 秒数（cues）

**Files:**
- Create: `scripts/lib/cues.mjs`, `tests/cues.test.mjs`, `tests/fixtures/rag-audio_meta.json`

**Interfaces:**
- Consumes: Task 2 的 `tokens`、`vd.segments`
- Produces:
  - `charStream(audioMeta) → [{ ch, start, end, line }]`：只含字母和数字（规范化后），全片绝对时间
  - `lineTimes(audioMeta) → [{ line, start, end }]`
  - `resolveCue(stream, text, nth = 1) → { start, end }`，找不到抛 `Error`（消息含「最接近的：」+ 3 个候选）
  - `segmentTimes(segments, lines) → [{ id, start, duration }]`
  - `buildCues(parsed, audioMeta) → { cues: { "编一套": 2.82, "资料#2": 31.1 }, segments, lines, total }`（`total` = 最后一句结束时间，不含结尾留白）

`audio_meta.json` 结构（`nv hf-audio` 产出）：`voices: [{ frame, duration_s, words: [{text,start,end}], chars: [{text,start,end}] }]`，时间相对本句开头；句与句首尾相接（第 n 句开头 = 前面各句 `duration_s` 之和）。`chars` 里一项可能有多个字（如 `"问A"`），也可能是标点。没有 `chars` 时退回用 `words`。

- [ ] **Step 1: 准备测试数据**

```bash
cp "04-作品/AI概念一分钟/01-RAG/抖音/audio_meta.json" skills/video-director/tests/fixtures/rag-audio_meta.json
```

- [ ] **Step 2: 写失败的测试 `tests/cues.test.mjs`**

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildCues, charStream, lineTimes, resolveCue, segmentTimes } from "../scripts/lib/cues.mjs";

const META = JSON.parse(readFileSync(new URL("./fixtures/rag-audio_meta.json", import.meta.url)));
const near = (a, b, eps = 0.05) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

test("lineTimes：句与句首尾相接，总长 61.6 秒", () => {
  const L = lineTimes(META);
  assert.equal(L.length, 17);
  near(L[1].start, 3.32);
  near(L[3].start, 11.18);
  near(L[16].end, 61.61);
});

test("resolveCue：真实配音里的关键词时间（RAG 第 1–4 句）", () => {
  const s = charStream(META);
  near(resolveCue(s, "编一套").start, 2.82);
  near(resolveCue(s, "根本没这条").start, 6.07);
  near(resolveCue(s, "不在里面").start, 10.44);
  near(resolveCue(s, "先去翻资料").start, 13.55);
});

test("规范化匹配：空格、标点、大小写、多字切片（问A + I）都不影响", () => {
  const s = charStream(META);
  near(resolveCue(s, "RAG 说白了").start, 11.22);
  near(resolveCue(s, "rag说白了").start, 11.22);
  near(resolveCue(s, "问AI").start, 0.04);
});

test("#序号：同一个词第 2 次出现", () => {
  const s = charStream(META);
  const first = resolveCue(s, "资料", 1).start;
  const second = resolveCue(s, "资料", 2).start;
  assert.ok(second > first);
});

test("跨 Line：词的前半在上一句末尾、后半在下一句开头也能找到", () => {
  const s = charStream(META);
  near(resolveCue(s, "编一套听着").start, 2.82);
});

test("resolveCue 词不存在：报错并给出最接近的 3 个候选", () => {
  const s = charStream(META);
  assert.throws(() => resolveCue(s, "编一条"), (err) => /口播里找不到「编一条」/.test(err.message) && /最接近的：.*编一套/.test(err.message));
  assert.throws(() => resolveCue(s, "资料", 99), /「资料」只出现了 \d+ 次，没有第 99 次/);
});

test("segmentTimes + buildCues：段时间来自句时间；cues 键名带序号", () => {
  const segs = segmentTimes([{ id: "a", lines: [1, 2] }, { id: "b", lines: [3, 17] }], lineTimes(META));
  near(segs[0].duration, 7.13);
  near(segs[1].start, 7.13);
  const parsed = { vd: { segments: [{ id: "a", lines: [1, 17] }] }, tokens: [{ text: "编一套", nth: 1 }, { text: "资料", nth: 2 }] };
  const b = buildCues(parsed, META);
  near(b.cues["编一套"], 2.82);
  assert.ok(b.cues["资料#2"] > 0);
  near(b.total, 61.61);
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `cd skills/video-director && node --test tests/cues.test.mjs`
Expected: FAIL，`Cannot find module '../scripts/lib/cues.mjs'`

- [ ] **Step 4: 实现 `scripts/lib/cues.mjs`**

```js
// audio_meta.json（nv hf-audio）→ 全片字流 → @词 的秒数
const KEEP = /[\p{L}\p{N}]/u;
const norm = (s) => Array.from(String(s).toLowerCase()).filter((c) => KEEP.test(c)).join("");
const round = (x) => Math.round(x * 1000) / 1000;

export function lineTimes(meta) {
  let t = 0;
  return [...meta.voices].sort((a, b) => a.frame - b.frame).map((v) => {
    const r = { line: v.frame, start: round(t), end: round(t + v.duration_s) };
    t += v.duration_s;
    return r;
  });
}

/** 每个字一项，时间在所在切片内平均分配；只保留字母和数字 */
export function charStream(meta) {
  const out = [];
  let off = 0;
  for (const v of [...meta.voices].sort((a, b) => a.frame - b.frame)) {
    for (const piece of v.chars?.length ? v.chars : v.words) {
      const chars = Array.from(norm(piece.text));
      const step = (piece.end - piece.start) / Math.max(chars.length, 1);
      chars.forEach((ch, i) => out.push({ ch, start: round(off + piece.start + i * step), end: round(off + piece.start + (i + 1) * step), line: v.frame }));
    }
    off += v.duration_s;
  }
  return out;
}

export function resolveCue(stream, text, nth = 1) {
  const needle = norm(text);
  if (!needle) throw new Error(`@词「${text}」去掉标点后是空的`);
  const hay = stream.map((c) => c.ch).join("");
  const hits = [];
  for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + 1)) hits.push(i);
  if (!hits.length) throw new Error(`口播里找不到「${text}」。最接近的：${closest(hay, needle).join("、")}`);
  if (nth > hits.length) throw new Error(`「${text}」只出现了 ${hits.length} 次，没有第 ${nth} 次`);
  const i = hits[nth - 1];
  return { start: stream[i].start, end: stream[i + needle.length - 1].end };
}

/** 同长度子串里，和目标逐字相同最多的 3 个（去重） */
function closest(hay, needle) {
  const n = needle.length;
  const scored = [];
  for (let i = 0; i + n <= hay.length; i++) {
    const sub = hay.slice(i, i + n);
    let same = 0;
    for (let k = 0; k < n; k++) if (sub[k] === needle[k]) same++;
    scored.push([same, sub]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  return [...new Set(scored.map((s) => s[1]))].slice(0, 3);
}

export function segmentTimes(segments, lines) {
  const byLine = new Map(lines.map((l) => [l.line, l]));
  return segments.map((s) => {
    const a = byLine.get(s.lines[0]), b = byLine.get(s.lines[1]);
    if (!a || !b) throw new Error(`段 ${s.id} 的句号 ${s.lines.join("–")} 超出配音范围（共 ${lines.length} 句）`);
    return { id: s.id, start: a.start, duration: round(b.end - a.start) };
  });
}

export function buildCues({ vd, tokens }, meta) {
  const stream = charStream(meta);
  const lines = lineTimes(meta);
  const cues = {};
  for (const t of tokens) cues[t.nth > 1 ? `${t.text}#${t.nth}` : t.text] = resolveCue(stream, t.text, t.nth).start;
  return { cues, segments: segmentTimes(vd.segments, lines), lines, total: lines.at(-1).end };
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `cd skills/video-director && node --test tests/cues.test.mjs`
Expected: PASS（7 个测试）。若「跨 Line」失败，检查 `charStream` 是否把相邻两句连在同一个字流里（不能按句分开查找）。

- [ ] **Step 6: 提交**

```bash
git add skills/video-director/scripts/lib/cues.mjs skills/video-director/tests/cues.test.mjs skills/video-director/tests/fixtures
git commit -m "工具: vd 把 @词 换算成配音里的秒数（规范化、#序号、跨句、候选提示）"
```

---

### Task 4: 音轨（配音拼接 + 音效）

**Files:**
- Create: `scripts/lib/audio.mjs`, `tests/audio.test.mjs`

**Interfaces:**
- Consumes: Task 3 的 `cues`；`config.sfxDir`
- Produces:
  - `voiceListFile(voicePaths) → string`（ffmpeg concat 列表内容）
  - `mixArgs({ voice, sfx: [{ file, at, volume }], duration, out }) → string[]`（ffmpeg 参数）
  - `buildAudio(dir, { vd, cues, total }, config) → { out: "assets/audio/vo.wav", duration }`：配音按句号顺序取 `assets/voice/NN.wav`，拼接后混入音效，总长 = `total + vd.ending.hold`

- [ ] **Step 1: 写失败的测试 `tests/audio.test.mjs`**

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { mixArgs, resolveSfx, voiceListFile } from "../scripts/lib/audio.mjs";

test("voiceListFile：每行一个 file，单引号转义", () => {
  assert.equal(voiceListFile(["/a/01.wav", "/a/it's.wav"]), "file '/a/01.wav'\nfile '/a/it'\\''s.wav'\n");
});

test("mixArgs：每个音效延迟到对应秒数、音量正确，amix 输入数 = 音效 + 1，截到总长", () => {
  const args = mixArgs({ voice: "v.wav", sfx: [{ file: "/s/pop.mp3", at: 2.82, volume: 0.6 }, { file: "/s/a.mp3", at: 13.55, volume: 0.35 }], duration: 63.6, out: "o.wav" });
  const fc = args[args.indexOf("-filter_complex") + 1];
  assert.match(fc, /\[1:a\][^;]*volume=0\.6,adelay=2820\|2820\[s1\]/);
  assert.match(fc, /adelay=13550\|13550\[s2\]/);
  assert.match(fc, /amix=inputs=3:normalize=0,atrim=0:63\.6/);
  assert.equal(args.at(-1), "o.wav");
});

test("mixArgs：没有音效时只截长度", () => {
  const fc = mixArgs({ voice: "v.wav", sfx: [], duration: 10, out: "o.wav" });
  assert.match(fc[fc.indexOf("-filter_complex") + 1], /amix=inputs=1/);
});

test("resolveSfx：@词换成秒数；音效文件不存在、@词没算出来都报错", () => {
  const sfxDir = new URL("./fixtures/", import.meta.url).pathname;
  const exists = (p) => p.endsWith("pop.mp3");
  const r = resolveSfx([{ name: "pop", at: "@编一套", volume: 0.6 }], { "编一套": 2.82 }, sfxDir, exists);
  assert.equal(r[0].at, 2.82);
  assert.match(r[0].file, /pop\.mp3$/);
  assert.throws(() => resolveSfx([{ name: "nope", at: "@编一套", volume: 1 }], { "编一套": 1 }, sfxDir, exists), /音效 nope 不存在/);
  assert.throws(() => resolveSfx([{ name: "pop", at: "@别的", volume: 1 }], {}, sfxDir, exists), /sfx 的 @别的 没有算出时间/);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd skills/video-director && node --test tests/audio.test.mjs`
Expected: FAIL，`Cannot find module '../scripts/lib/audio.mjs'`

- [ ] **Step 3: 实现 `scripts/lib/audio.mjs`**

```js
// 配音（nv hf-audio 的每句 wav）首尾拼接 + 音效 → assets/audio/vo.wav
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "./run.mjs";

export const voiceListFile = (paths) => paths.map((p) => `file '${p.replaceAll("'", "'\\''")}'\n`).join("");

const cueKey = (at) => at.replace(/^@/, "");

export function resolveSfx(list, cues, sfxDir, exists = existsSync) {
  return list.map((s) => {
    const file = join(sfxDir, `${s.name}.mp3`);
    if (!exists(file)) throw new Error(`音效 ${s.name} 不存在：${file}（可用的见 ${sfxDir}）`);
    const at = cues[cueKey(s.at)];
    if (at === undefined) throw new Error(`sfx 的 ${s.at} 没有算出时间（先确认这个词在口播里）`);
    return { file, at, volume: s.volume ?? 1 };
  });
}

export function mixArgs({ voice, sfx, duration, out }) {
  const inputs = ["-i", voice, ...sfx.flatMap((s) => ["-i", s.file])];
  let chains = "", labels = "[0:a]";
  sfx.forEach((s, i) => {
    const n = i + 1, ms = Math.round(s.at * 1000);
    chains += `[${n}:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=${s.volume},adelay=${ms}|${ms}[s${n}];`;
    labels += `[s${n}]`;
  });
  const fc = `${chains}${labels}amix=inputs=${sfx.length + 1}:normalize=0,atrim=0:${duration},apad=whole_dur=${duration},alimiter=limit=0.95[out]`;
  return ["-v", "error", "-y", ...inputs, "-filter_complex", fc, "-map", "[out]", "-ar", "44100", out];
}

export function buildAudio(dir, { vd, cues, lines, total }, config) {
  const voices = lines.map((l) => join(dir, "assets/voice", `${String(l.line).padStart(2, "0")}.wav`));
  const missing = voices.filter((p) => !existsSync(p));
  if (missing.length) throw new Error(`缺少配音文件：${missing.join("、")}（先跑 nv hf-audio）`);
  const tmp = mkdtempSync(join(tmpdir(), "vd-audio-"));
  try {
    writeFileSync(join(tmp, "list.txt"), voiceListFile(voices));
    const cat = run("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", join(tmp, "list.txt"), "-ar", "44100", "-ac", "2", join(tmp, "vo.wav")]);
    if (cat.status !== 0) throw new Error(`拼接配音失败：${cat.stderr}`);
    mkdirSync(join(dir, "assets/audio"), { recursive: true });
    const duration = Math.round((total + vd.ending.hold) * 1000) / 1000;
    const sfx = resolveSfx(vd.sfx ?? [], cues, config.sfxDir);
    const mix = run("ffmpeg", mixArgs({ voice: join(tmp, "vo.wav"), sfx, duration, out: join(dir, "assets/audio/vo.wav") }));
    if (mix.status !== 0) throw new Error(`混音失败：${mix.stderr}`);
    return { out: "assets/audio/vo.wav", duration };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd skills/video-director && node --test tests/audio.test.mjs`
Expected: PASS（4 个测试）

- [ ] **Step 5: 提交**

```bash
git add skills/video-director/scripts/lib/audio.mjs skills/video-director/tests/audio.test.mjs
git commit -m "工具: vd 配音拼接 + 按 @词 混音效"
```

---

### Task 5: 总装（index.html 标记块、cues.js、三个账号固定元素）

**Files:**
- Create: `scripts/lib/assemble.mjs`, `tests/assemble.test.mjs`
- Create: `templates/index.html`, `templates/segment.html`
- Create: `06-品牌资产/hyperframes/brand-kicker.html`, `brand-captions.html`, `brand-ending.html`

**Interfaces:**
- Consumes: Task 3 的 `{ cues, segments, total }`；Task 2 的 `vd`；`caption_groups.json`（`nv` 产出：`groups: [{ start, end, text }]`，`text` 里 `*词` 是重点词）
- Produces:
  - `replaceBlock(html, name, content) → string`：替换 `<!-- vd:name -->` 与 `<!-- /vd:name -->` 之间；缺标记抛错
  - `setRootDuration(html, seconds) → string`
  - `cuesJs({ cues, segments }) → string`：定义 `window.VD = { cues, seg, at(name, segId) }`，`at` 返回相对段开头的秒数，名字不存在时抛错
  - `segmentHosts(segments, only?) → string`、`brandHosts({ vd, groups, total, lines, duration }) → string`、`audioHosts({ duration, music }) → string`
  - `assemble(dir, built, config, { only, duration, music }) → void`：写 `cues.js`、复制品牌子画面到 `compositions/frames/`、复制字体包到 `assets/fonts/`、替换 `index.html` 的四个标记块并更新根时长
- 各段子画面里取时间统一写 `VD.at("编一套", "seg-01-hook")`。

- [ ] **Step 1: 写失败的测试 `tests/assemble.test.mjs`**

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import { audioHosts, brandHosts, cuesJs, replaceBlock, segmentHosts, setRootDuration } from "../scripts/lib/assemble.mjs";

const HTML = `<div id="root" data-composition-id="main" data-start="0" data-duration="10">
<!-- vd:segments -->old<!-- /vd:segments -->
<div id="手写">贯穿元素</div>
</div>`;

test("replaceBlock 只替换标记之间，手写部分保留；重复执行结果相同（幂等）", () => {
  const a = replaceBlock(HTML, "segments", "\nNEW\n");
  assert.match(a, /<!-- vd:segments -->\nNEW\n<!-- \/vd:segments -->/);
  assert.match(a, /贯穿元素/);
  assert.equal(replaceBlock(a, "segments", "\nNEW\n"), a);
  assert.throws(() => replaceBlock(HTML, "brand", "x"), /index.html 缺少标记 <!-- vd:brand -->/);
});

test("setRootDuration：只改 main 根元素的 data-duration", () => {
  assert.match(setRootDuration(HTML, 63.6), /data-composition-id="main" data-start="0" data-duration="63.6"/);
});

test("cuesJs：VD.at 返回相对段开头的秒数；名字或段不存在时抛错", () => {
  const ctx = { window: {} };
  vm.runInNewContext(cuesJs({ cues: { "编一套": 2.82, "不在里面": 10.44 }, segments: [{ id: "a", start: 0, duration: 7.13 }, { id: "b", start: 7.13, duration: 4.05 }] }), ctx);
  assert.equal(ctx.window.VD.at("编一套", "a"), 2.82);
  assert.equal(Math.round(ctx.window.VD.at("不在里面", "b") * 100) / 100, 3.31);
  assert.throws(() => ctx.window.VD.at("没有", "a"), /cues 里没有「没有」/);
  assert.throws(() => ctx.window.VD.at("编一套", "z"), /没有段 z/);
});

test("segmentHosts：每段一个宿主，时间来自配音；only 只放样片的段", () => {
  const segs = [{ id: "seg-01-hook", start: 0, duration: 7.13 }, { id: "seg-02-why", start: 7.13, duration: 4.05 }];
  const h = segmentHosts(segs);
  assert.match(h, /data-composition-id="seg-01-hook" data-composition-src="compositions\/frames\/seg-01-hook.html" data-start="0" data-duration="7.13"/);
  assert.match(h, /class="clip"/);
  assert.doesNotMatch(segmentHosts(segs, ["seg-01-hook"]), /seg-02-why/);
});

test("brandHosts：字幕带重点词、栏目标签贯穿全片、结尾从最后一句开始；变量里的引号和 & 被转义", () => {
  const vd = { kicker: "AI 概念 · 第 1 期", palette: { bg: "#F1ECE2", ink: "#1C1A17", muted: "#6E675C", accent: "#FFD84D", alert: "#D2372A" }, ending: { next: "下一期 & 预告", question: "你被'编'过吗？", cta: "评论区", hold: 2 } };
  const h = brandHosts({ vd, groups: [{ start: 0.04, end: 2.1, text: "它敢给你 *编一套." }], lines: [{ line: 1, start: 0, end: 3.32 }, { line: 2, start: 3.32, end: 7.13 }], duration: 9.13 });
  assert.match(h, /data-composition-id="brand-kicker"[^>]*data-start="0" data-duration="9.13"/);
  assert.match(h, /data-composition-id="brand-ending"[^>]*data-start="3.32" data-duration="5.81"/);
  assert.match(h, /&amp;/);
  assert.match(h, /&#39;/);
  assert.doesNotMatch(h, /data-variable-values='[^']*'[^>]*'/);
});

test("audioHosts：配音一条；有配乐时第二条带 media-start 和音量", () => {
  assert.doesNotMatch(audioHosts({ duration: 10, music: null }), /id="music"/);
  const a = audioHosts({ duration: 10, music: { src: "assets/audio/bgm.wav", mediaStart: 3.046, volume: 0.4 } });
  assert.match(a, /<audio id="vo" src="assets\/audio\/vo.wav" data-start="0" data-duration="10"/);
  assert.match(a, /<audio id="music" src="assets\/audio\/bgm.wav" data-start="0" data-duration="10" data-media-start="3.046" data-volume="0.4"/);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd skills/video-director && node --test tests/assemble.test.mjs`
Expected: FAIL，`Cannot find module '../scripts/lib/assemble.mjs'`

- [ ] **Step 3: 实现 `scripts/lib/assemble.mjs`**

```js
// 写 cues.js、复制品牌子画面和字体、替换 index.html 的 vd 标记块
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const esc = (s) => String(s).replaceAll("&", "&amp;").replaceAll("'", "&#39;").replaceAll("<", "&lt;");
const vars = (o) => `data-variable-values='${esc(JSON.stringify(o))}'`;
const r3 = (x) => Math.round(x * 1000) / 1000;

export function replaceBlock(html, name, content) {
  const open = `<!-- vd:${name} -->`, close = `<!-- /vd:${name} -->`;
  const a = html.indexOf(open), b = html.indexOf(close);
  if (a < 0 || b < a) throw new Error(`index.html 缺少标记 ${open} … ${close}（从 templates/index.html 复制）`);
  return html.slice(0, a + open.length) + content + html.slice(b);
}

export function setRootDuration(html, seconds) {
  return html.replace(/(data-composition-id="main"[^>]*?data-duration=")[^"]*(")/, `$1${seconds}$2`);
}

export function cuesJs({ cues, segments }) {
  const seg = Object.fromEntries(segments.map((s) => [s.id, { start: s.start, duration: s.duration }]));
  return `// vd build 生成，不要手改。各段用 VD.at("词", "段id") 取相对段开头的秒数
window.VD = {
  cues: ${JSON.stringify(cues)},
  seg: ${JSON.stringify(seg)},
  at(name, segId) {
    if (!(name in this.cues)) throw new Error("cues 里没有「" + name + "」：先在 DIRECTOR.md 里写 @" + name + "，再跑 vd build");
    if (!(segId in this.seg)) throw new Error("没有段 " + segId);
    return Math.round((this.cues[name] - this.seg[segId].start) * 1000) / 1000;
  },
};
`;
}

const host = (id, src, start, duration, track, extra = "") =>
  `    <div id="host-${id}" class="clip" data-composition-id="${id}" data-composition-src="${src}" data-start="${start}" data-duration="${duration}" data-track-index="${track}" data-width="1080" data-height="1920" ${extra}style="position:absolute;inset:0"></div>\n`;

export function segmentHosts(segments, only = null) {
  return "\n" + segments.filter((s) => !only || only.includes(s.id)).map((s, i) => host(s.id, `compositions/frames/${s.id}.html`, s.start, s.duration, 2 + i)).join("");
}

export function brandHosts({ vd, groups, lines, duration }) {
  const pal = vd.palette;
  const last = lines.at(-1);
  const caps = groups.map((g) => ({ start: r3(g.start), end: r3(g.end), text: g.text }));
  return "\n" +
    host("brand-kicker", "compositions/frames/brand-kicker.html", 0, duration, 40, vars({ text: vd.kicker, ...pal }) + " ") +
    host("brand-captions", "compositions/frames/brand-captions.html", 0, duration, 41, vars({ groups: JSON.stringify(caps), ...pal }) + " ") +
    host("brand-ending", "compositions/frames/brand-ending.html", last.start, r3(duration - last.start), 42,
      vars({ next: vd.ending.next, question: vd.ending.question, cta: vd.ending.cta, holdAt: r3(last.end - last.start), ...pal }) + " ");
}

export function audioHosts({ duration, music }) {
  let a = `\n    <audio id="vo" src="assets/audio/vo.wav" data-start="0" data-duration="${duration}" data-track-index="90"></audio>\n`;
  if (music) a += `    <audio id="music" src="${music.src}" data-start="0" data-duration="${duration}" data-media-start="${music.mediaStart}" data-volume="${music.volume}" data-track-index="91"></audio>\n`;
  return a + "    ";
}

export function assemble(dir, built, config, { only = null, duration, music = null }) {
  const idx = join(dir, "index.html");
  if (!existsSync(idx)) throw new Error(`没有 ${idx}：先从 skills/video-director/templates/index.html 复制`);
  writeFileSync(join(dir, "cues.js"), cuesJs(built));
  for (const f of ["brand-kicker", "brand-captions", "brand-ending"]) cpSync(join(config.brandDir, `${f}.html`), join(dir, "compositions/frames", `${f}.html`));
  if (!existsSync(join(dir, "assets/fonts/fonts.css"))) cpSync(config.fontsDir, join(dir, "assets/fonts"), { recursive: true });
  const groups = JSON.parse(readFileSync(join(dir, "caption_groups.json"), "utf8")).groups.filter((g) => g.start < duration);
  let html = readFileSync(idx, "utf8");
  html = replaceBlock(html, "audio", audioHosts({ duration, music }));
  html = replaceBlock(html, "segments", segmentHosts(built.segments, only) + "    ");
  html = replaceBlock(html, "brand", brandHosts({ vd: built.vd, groups, lines: built.lines, duration }) + "    ");
  writeFileSync(idx, setRootDuration(html, duration));
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd skills/video-director && node --test tests/assemble.test.mjs`
Expected: PASS（6 个测试）

- [ ] **Step 5: 写总装模板 `templates/index.html`**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <link rel="stylesheet" href="assets/fonts/fonts.css" />
    <script src="assets/gsap.min.js"></script>
    <script src="cues.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 1080px; height: 1920px; overflow: hidden; }
      #root { position: relative; width: 100%; height: 100%; overflow: hidden; }
      /* 手写：全片背景、贯穿元素的样式 */
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="10" data-width="1080" data-height="1920">
      <!-- vd:audio --><!-- /vd:audio -->
      <!-- 手写：全片背景层（放在各段下面） -->
      <!-- vd:segments --><!-- /vd:segments -->
      <!-- 手写：贯穿元素（跨段移动，用总时间轴控制） -->
      <!-- vd:brand --><!-- /vd:brand -->
    </div>
    <script>
      const tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out", immediateRender: false } });
      // 手写：背景和贯穿元素的动画，时间用 VD.cues["词"]（全片秒数）
      window.__timelines["main"] = tl;
      tl.seek(0);
    </script>
  </body>
</html>
```

- [ ] **Step 6: 写单段模板 `templates/segment.html`**

```html
<!doctype html>
<html lang="zh-CN">
  <head><meta charset="UTF-8" /></head>
  <body>
    <template>
      <style>
        /* id 一律加段前缀（如 #s01-stamp），避免和别的段冲突 */
        #SEG_ID { position: absolute; inset: 0; }
      </style>
      <div id="SEG_ID" data-composition-id="SEG_ID" data-width="1080" data-height="1920">
        <!-- 画面元素 -->
      </div>
      <script>
        (() => {
          const SEG = "SEG_ID";
          const at = (w) => VD.at(w, SEG);   // 相对本段开头的秒数
          const tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out", immediateRender: false } });
          // 入场前状态用 gsap.set 给出；每个动作锚定到 @词：tl.fromTo(el, {...}, {...}, at("编一套"))
          window.__timelines[SEG] = tl;
        })();
      </script>
    </template>
  </body>
</html>
```

- [ ] **Step 7: 写三个账号固定元素**

`06-品牌资产/hyperframes/brand-kicker.html`：
```html
<!doctype html>
<html lang="zh-CN" data-composition-variables='[
  {"id":"text","type":"string","label":"栏目标签","default":"AI 概念一分钟 · 第 1 期"},
  {"id":"ink","type":"string","label":"墨色","default":"#1C1A17"},
  {"id":"muted","type":"string","label":"次要文字","default":"#6E675C"}
]'>
  <head><meta charset="UTF-8" /></head>
  <body>
    <template>
      <style>
        #brand-kicker { position: absolute; inset: 0; pointer-events: none; }
        #bk-label { position: absolute; left: 64px; top: 228px; display: flex; align-items: center; gap: 14px; font-family: "JetBrains Mono", monospace; font-size: 26px; letter-spacing: 0.08em; }
        #bk-rule { display: block; width: 36px; height: 3px; }
      </style>
      <div id="brand-kicker" data-composition-id="brand-kicker" data-width="1080" data-height="1920">
        <div id="bk-label"><i id="bk-rule"></i><span id="bk-text"></span></div>
      </div>
      <script>
        (() => {
          const v = Object.assign({ text: "", ink: "#1C1A17", muted: "#6E675C" }, window.__hyperframes.getVariables());
          document.getElementById("bk-text").textContent = v.text;
          document.getElementById("bk-label").style.color = v.muted;
          document.getElementById("bk-rule").style.background = v.ink;
          const tl = gsap.timeline({ paused: true });
          tl.fromTo("#bk-label", { opacity: 0 }, { opacity: 1, duration: 0.3, immediateRender: false }, 0);
          window.__timelines["brand-kicker"] = tl;
        })();
      </script>
    </template>
  </body>
</html>
```

`06-品牌资产/hyperframes/brand-captions.html`：
```html
<!doctype html>
<html lang="zh-CN" data-composition-variables='[
  {"id":"groups","type":"string","label":"字幕分组 JSON（vd build 写入）","default":"[]"},
  {"id":"ink","type":"string","label":"字色","default":"#1C1A17"},
  {"id":"bg","type":"string","label":"底色","default":"#F1ECE2"},
  {"id":"accent","type":"string","label":"重点词底色","default":"#FFD84D"}
]'>
  <head><meta charset="UTF-8" /></head>
  <body>
    <template>
      <style>
        #brand-captions { position: absolute; inset: 0; pointer-events: none; }
        #bc-band { position: absolute; left: 60px; top: 1220px; width: 960px; height: 170px; }
        .bc-cap { position: absolute; left: 0; right: 0; top: 50%; text-align: center; font-family: "Noto Sans SC Variable", sans-serif; font-size: 58px; font-weight: 800; line-height: 1.3; opacity: 0; }
        .bc-cap span { padding: 4px 18px; border-radius: 12px; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
        .bc-cap mark { padding: 0 6px; border-radius: 6px; }
      </style>
      <div id="brand-captions" data-composition-id="brand-captions" data-width="1080" data-height="1920">
        <div id="bc-band" data-layout-allow-caption-zone></div>
      </div>
      <script>
        (() => {
          const v = Object.assign({ groups: "[]", ink: "#1C1A17", bg: "#F1ECE2", accent: "#FFD84D" }, window.__hyperframes.getVariables());
          const groups = JSON.parse(v.groups);
          const band = document.getElementById("bc-band");
          const hexA = (hex, a) => hex + Math.round(a * 255).toString(16).padStart(2, "0");
          const tl = gsap.timeline({ paused: true });
          groups.forEach((g, i) => {
            const d = document.createElement("div");
            d.className = "bc-cap"; d.id = "bc-" + i;
            const span = document.createElement("span");
            span.style.background = hexA(v.bg, 0.92); span.style.color = v.ink;
            // 「*词」是重点词：去掉末尾标点后高亮
            for (const part of g.text.replace(/[,.，。]$/, "").split(" ")) {
              if (part.startsWith("*")) { const m = document.createElement("mark"); m.textContent = part.slice(1).replace(/[,.，。]$/, ""); m.style.background = v.accent; m.style.color = v.ink; span.append(m); }
              else span.append(part);
            }
            d.append(span); band.append(d);
            const end = i < groups.length - 1 ? groups[i + 1].start : g.end + 0.3;
            tl.fromTo(d, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.14, immediateRender: false }, g.start);
            tl.set(d, { opacity: 0 }, end);
          });
          window.__timelines["brand-captions"] = tl;
        })();
      </script>
    </template>
  </body>
</html>
```

`06-品牌资产/hyperframes/brand-ending.html`：
```html
<!doctype html>
<html lang="zh-CN" data-composition-variables='[
  {"id":"next","type":"string","label":"下一期预告","default":"下一期：……"},
  {"id":"question","type":"string","label":"结尾问题","default":"你怎么看？"},
  {"id":"cta","type":"string","label":"评论引导","default":"评论区说说 ↓"},
  {"id":"holdAt","type":"number","label":"问题出现时间（相对本段，秒）","default":4},
  {"id":"bg","type":"string","label":"底色","default":"#F1ECE2"},
  {"id":"ink","type":"string","label":"墨色","default":"#1C1A17"},
  {"id":"muted","type":"string","label":"次要文字","default":"#6E675C"},
  {"id":"accent","type":"string","label":"强调色","default":"#FFD84D"}
]'>
  <head><meta charset="UTF-8" /></head>
  <body>
    <template>
      <style>
        #brand-ending { position: absolute; inset: 0; }
        #be-next { position: absolute; left: 64px; top: 330px; width: 856px; padding: 28px 36px; border-radius: 20px; font-family: "Noto Sans SC Variable", sans-serif; font-size: 48px; font-weight: 800; line-height: 1.35; }
        #be-next small { display: block; font-family: "JetBrains Mono", monospace; font-size: 24px; font-weight: 700; letter-spacing: 0.12em; margin-bottom: 10px; }
        #be-q { position: absolute; left: 64px; top: 640px; width: 856px; font-family: "Noto Serif SC Variable", serif; font-size: 96px; font-weight: 900; line-height: 1.2; }
        #be-cta { position: absolute; left: 64px; top: 1000px; font-family: "Noto Sans SC Variable", sans-serif; font-size: 44px; font-weight: 700; }
      </style>
      <div id="brand-ending" data-composition-id="brand-ending" data-width="1080" data-height="1920">
        <div id="be-next"><small>NEXT · 下一期</small><span id="be-next-t"></span></div>
        <div id="be-q"></div>
        <div id="be-cta"></div>
      </div>
      <script>
        (() => {
          const v = Object.assign({ next: "", question: "", cta: "", holdAt: 4, bg: "#F1ECE2", ink: "#1C1A17", muted: "#6E675C", accent: "#FFD84D" }, window.__hyperframes.getVariables());
          const $ = (id) => document.getElementById(id);
          $("be-next-t").textContent = v.next; $("be-q").textContent = v.question; $("be-cta").textContent = v.cta;
          $("be-next").style.background = v.accent; $("be-next").style.color = v.ink;
          $("be-q").style.color = v.ink; $("be-cta").style.color = v.muted;
          const t = Number(v.holdAt);
          gsap.set(["#be-next", "#be-q", "#be-cta"], { opacity: 0 });
          const tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out", immediateRender: false } });
          tl.fromTo("#be-next", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.4 }, 0.2);
          tl.to("#be-next", { opacity: 0, y: -30, duration: 0.3, ease: "power2.in" }, t - 0.3);
          tl.fromTo("#be-q", { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 0.45 }, t);
          tl.fromTo("#be-cta", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.4 }, t + 0.5);
          window.__timelines["brand-ending"] = tl;
        })();
      </script>
    </template>
  </body>
</html>
```

- [ ] **Step 8: 提交**

```bash
git add skills/video-director/scripts/lib/assemble.mjs skills/video-director/tests/assemble.test.mjs skills/video-director/templates 06-品牌资产/hyperframes/brand-*.html
git commit -m "工具: vd 总装（标记块、cues.js）+ 账号固定元素（栏目标签、字幕、结尾）"
```

---

### Task 6: 配乐（取曲、节拍对位、人声避让）

**Files:**
- Create: `scripts/lib/music.mjs`, `tests/music.test.mjs`

**Interfaces:**
- Consumes: `run`（Task 1）、`vd.music`、`cues`、`config.hfVersion`
- Produces:
  - `pickBeat(beats, drop, renderLen, trackLen) → { mediaStart, beat } | null`
  - `parseResolved(stdout) → string | null`（从 `resolved bgm_001 → .media/audio/bgm/bgm_001.wav (bgm, 30s)` 取路径）
  - `resolveMusic(dir, intent, hfVersion, runFn = run) → string | null`：已有 `assets/audio/bgm.*` 直接用；否则调 HeyGen 曲库并复制成 `assets/audio/bgm.wav`；失败返回 `null` 并打印警告
  - `alignMusic(dir, { src, drop, duration }, hfVersion, runFn = run) → number`：跑 `hyperframes beats`，返回 `mediaStart`（无候选时 0 并警告）
  - `carve(dir, hfVersion, runFn = run) → void`：确保装了 `@hyperframes/core@<hfVersion>`，跑 `carve.mjs --comp index.html --bed music --voice vo`

- [ ] **Step 1: 写失败的测试 `tests/music.test.mjs`**

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseResolved, pickBeat, resolveMusic } from "../scripts/lib/music.mjs";
import { project } from "./helpers.mjs";

const BEATS = [{ time: 0.007, strength: 1 }, { time: 14.0, strength: 0.6 }, { time: 16.596, strength: 0.857 }, { time: 17.0, strength: 0.857 }, { time: 29.5, strength: 1 }];

test("pickBeat：落在可用范围里最强的节拍，同强度取最早；mediaStart = 节拍 - 重拍时间", () => {
  const r = pickBeat(BEATS, 13.55, 14.5, 30);
  assert.equal(r.beat.time, 16.596);
  assert.equal(r.mediaStart, 3.046);
});

test("pickBeat 无候选返回 null（配乐太短或重拍太靠后）", () => {
  assert.equal(pickBeat(BEATS, 13.55, 63.6, 30), null);
  assert.equal(pickBeat([], 1, 5, 30), null);
});

test("parseResolved：从 media-use 输出取路径；没有就是 null", () => {
  assert.equal(parseResolved("resolved bgm_001 → .media/audio/bgm/bgm_001.wav (bgm, 30s)\n"), ".media/audio/bgm/bgm_001.wav");
  assert.equal(parseResolved("error: bgm needs the heygen CLI"), null);
});

test("resolveMusic 失败时返回 null（未登录、搜不到、网络失败都不阻塞出片）", () => {
  const dir = project({ "index.html": "" });
  const fail = () => ({ status: 1, stdout: "", stderr: "error: bgm needs the heygen CLI" });
  assert.equal(resolveMusic(dir, "lo-fi", "0.8.143", fail), null);
});

test("resolveMusic：已有 assets/audio/bgm.* 时不再调用曲库", () => {
  const dir = project({ "assets/audio/bgm.mp3": "x" });
  const never = () => { throw new Error("不应调用"); };
  assert.equal(resolveMusic(dir, "lo-fi", "0.8.143", never), "assets/audio/bgm.mp3");
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd skills/video-director && node --test tests/music.test.mjs`
Expected: FAIL，`Cannot find module '../scripts/lib/music.mjs'`

- [ ] **Step 3: 实现 `scripts/lib/music.mjs`**

```js
// 配乐：HeyGen 曲库取曲 → 节拍对位（重拍落在指定的词上）→ 人声避让
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { run } from "./run.mjs";

const CARVE = join(homedir(), ".claude/skills/hyperframes-audio/scripts/carve.mjs");

export function pickBeat(beats, drop, renderLen, trackLen) {
  const cand = beats.filter((b) => b.time >= drop && b.time - drop + renderLen <= trackLen);
  if (!cand.length) return null;
  const best = cand.reduce((a, b) => (b.strength > a.strength ? b : a));
  return { beat: best, mediaStart: Math.round((best.time - drop) * 1000) / 1000 };
}

export function parseResolved(stdout) {
  return stdout.match(/→\s*(\S+)/)?.[1] ?? null;
}

export function resolveMusic(dir, intent, hfVersion, runFn = run) {
  const audioDir = join(dir, "assets/audio");
  const own = existsSync(audioDir) ? readdirSync(audioDir).find((f) => /^bgm\.(wav|mp3|m4a)$/.test(f)) : null;
  if (own) return `assets/audio/${own}`;
  const r = runFn("npx", ["--yes", `hyperframes@${hfVersion}`, "media-use", "resolve", "--type", "bgm", "--intent", intent, "--project", "."], { cwd: dir });
  const got = r.status === 0 ? parseResolved(r.stdout) : null;
  if (!got) {
    console.warn(`⚠ 没有取到配乐，本次不加配乐：${(r.stderr || r.stdout).trim().split("\n").at(-1)}`);
    console.warn("  （HeyGen 需要：heygen CLI + `HEYGEN_NO_BROWSER=1 heygen auth login --oauth`；也可以自己放 assets/audio/bgm.mp3）");
    return null;
  }
  mkdirSync(audioDir, { recursive: true });
  copyFileSync(join(dir, got), join(audioDir, "bgm.wav"));
  return "assets/audio/bgm.wav";
}

export function alignMusic(dir, { src, drop, duration }, hfVersion, runFn = run) {
  const r = runFn("npx", ["--yes", `hyperframes@${hfVersion}`, "beats", ".", "--json"], { cwd: dir });
  if (r.status !== 0) { console.warn(`⚠ 节拍分析失败，配乐从头播放：${r.stderr.trim()}`); return 0; }
  const beats = JSON.parse(readFileSync(join(dir, "beats", `${src}.json`), "utf8")).beats;
  const trackLen = Number(runFn("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", join(dir, src)]).stdout);
  const pick = pickBeat(beats, drop, duration, trackLen);
  if (!pick) { console.warn(`⚠ 配乐 ${trackLen.toFixed(1)} 秒，找不到能让重拍落在 ${drop} 秒的节拍，配乐从头播放`); return 0; }
  console.log(`✓ 配乐重拍：节拍 ${pick.beat.time}s（强度 ${pick.beat.strength}）→ 全片 ${drop}s，data-media-start=${pick.mediaStart}`);
  return pick.mediaStart;
}

export function carve(dir, hfVersion, runFn = run) {
  if (!existsSync(join(dir, "node_modules/@hyperframes/core"))) {
    const i = runFn("npm", ["i", "-D", "--no-audit", "--no-fund", `@hyperframes/core@${hfVersion}`], { cwd: dir });
    if (i.status !== 0) throw new Error(`安装 @hyperframes/core 失败（人声避让需要）：${i.stderr}`);
  }
  const c = runFn("node", [CARVE, "--comp", "index.html", "--bed", "music", "--voice", "vo"], { cwd: dir });
  if (c.status !== 0) throw new Error(`人声避让失败：${c.stderr || c.stdout}`);
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd skills/video-director && node --test tests/music.test.mjs`
Expected: PASS（5 个测试）

- [ ] **Step 5: 提交**

```bash
git add skills/video-director/scripts/lib/music.mjs skills/video-director/tests/music.test.mjs
git commit -m "工具: vd 配乐（HeyGen 取曲、重拍对位、人声避让，失败不阻塞出片）"
```

---

### Task 7: 接上命令 `vd cues | build | check`

**Files:**
- Modify: `scripts/vd.mjs`
- Create: `tests/vd.test.mjs`

**Interfaces:**
- Consumes: Task 1–6 全部
- Produces: `COMMANDS.cues(dir)`、`COMMANDS.build(dir, rest)`（`rest` 可含 `--sample`、`--no-music`）、`COMMANDS.check(dir)`

`vd build` 的顺序（每步失败即停，报中文错误）：
1. 读 `DIRECTOR.md` → `parseDirector` → `validateDirector(…, audio_meta 的句数)`，有错全部列出并退出 1
2. `buildCues` → 写 `cues.js`
3. 时长：整片 = `total + ending.hold`；`--sample` = `cues[sample.end] + sample.tail`，只装 `sample.segments`
4. `buildAudio`（整片）；样片时 `assemble` 用同一条音轨，靠根 `data-duration` 截短
5. `assemble`（`music` 先为 `null`）
6. 有 `vd.music` 且没给 `--no-music`：`resolveMusic` → 写入 music（`mediaStart: 0`）再 `assemble` → `alignMusic` → 用算出的 `mediaStart` 再 `assemble` → `carve`
7. 复制 GSAP：工程没有 `assets/gsap.min.js` 时，从 `/home/power/hyperframes/assets/gsap.min.js` 复制
8. `npx hyperframes@<hfVersion> check .`，打印结果；失败退出 1

- [ ] **Step 1: 写失败的测试 `tests/vd.test.mjs`**（只测不依赖外部工具的部分：校验失败时的输出）

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { main } from "../scripts/vd.mjs";
import { project } from "./helpers.mjs";

test("vd cues：DIRECTOR.md 有错时全部列出并返回 1，不写 cues.js", async () => {
  const dir = project({
    "video-director.config.json": { fontsDir: "/f", brandDir: "b", sfxDir: "/s", hfVersion: "0.8.143" },
    "ep/DIRECTOR.md": "# 导演脚本\n没有机器块",
    "ep/audio_meta.json": { voices: [{ frame: 1, duration_s: 1, words: [{ text: "你好", start: 0, end: 1 }] }] },
  });
  const errs = [];
  const orig = console.error;
  console.error = (m) => errs.push(m);
  try { assert.equal(await main(["cues", `${dir}/ep`]), 1); } finally { console.error = orig; }
  assert.match(errs.join("\n"), /缺少 ```json vd 机器块/);
  assert.match(errs.join("\n"), /缺少章节「## 1. 视觉方案」/);
});

test("vd：未知子命令打印用法并返回 2", async () => {
  assert.equal(await main(["nope", "x"]), 2);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd skills/video-director && node --test tests/vd.test.mjs`
Expected: 第一个测试 FAIL（`cues` 子命令还不存在，返回 2）

- [ ] **Step 3: 实现子命令（替换 `scripts/vd.mjs` 中 `const COMMANDS = {};` 一行）**

```js
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assemble, cuesJs } from "./lib/assemble.mjs";
import { buildAudio } from "./lib/audio.mjs";
import { findProjectRoot, loadConfig } from "./lib/config.mjs";
import { buildCues } from "./lib/cues.mjs";
import { parseDirector, validateDirector } from "./lib/director.mjs";
import { alignMusic, carve, resolveMusic } from "./lib/music.mjs";
import { run } from "./lib/run.mjs";

const GSAP = "/home/power/hyperframes/assets/gsap.min.js";

function load(dir) {
  for (const f of ["DIRECTOR.md", "audio_meta.json"]) if (!existsSync(join(dir, f))) throw new Error(`${dir} 里没有 ${f}`);
  const meta = JSON.parse(readFileSync(join(dir, "audio_meta.json"), "utf8"));
  const parsed = parseDirector(readFileSync(join(dir, "DIRECTOR.md"), "utf8"));
  const errors = validateDirector(parsed, meta.voices.length);
  if (errors.length) throw new Error(`DIRECTOR.md 有 ${errors.length} 处问题：\n  - ${errors.join("\n  - ")}`);
  return { meta, parsed, built: { ...buildCues(parsed, meta), vd: parsed.vd } };
}

const COMMANDS = {
  cues(dir) {
    const { built } = load(dir);
    writeFileSync(join(dir, "cues.js"), cuesJs(built));
    for (const [k, v] of Object.entries(built.cues)) console.log(`  @${k} → ${v}s`);
    console.log(`✓ cues.js（${Object.keys(built.cues).length} 个词，${built.segments.length} 段，口播 ${built.total}s）`);
  },
  build(dir, rest = []) {
    const config = loadConfig(findProjectRoot(dir));
    const { built } = load(dir);
    const vd = built.vd;
    const sample = rest.includes("--sample");
    const full = Math.round((built.total + vd.ending.hold) * 1000) / 1000;
    const duration = sample ? Math.round((built.cues[vd.sample.end.slice(1)] + vd.sample.tail) * 1000) / 1000 : full;
    const only = sample ? vd.sample.segments : null;
    buildAudio(dir, built, config);
    if (!existsSync(join(dir, "assets/gsap.min.js"))) cpSync(GSAP, join(dir, "assets/gsap.min.js"));
    assemble(dir, built, config, { only, duration, music: null });
    if (vd.music && !rest.includes("--no-music")) {
      const src = resolveMusic(dir, vd.music.intent, config.hfVersion);
      if (src) {
        const music = { src, mediaStart: 0, volume: vd.music.volume ?? 0.4 };
        assemble(dir, built, config, { only, duration, music });
        music.mediaStart = alignMusic(dir, { src, drop: built.cues[vd.music.drop.slice(1)], duration }, config.hfVersion);
        assemble(dir, built, config, { only, duration, music });
        carve(dir, config.hfVersion);
      }
    }
    console.log(`✓ 总装完成：${sample ? `样片 ${only.join("、")}` : "整片"}，${duration}s`);
    return COMMANDS.check(dir, [], config);
  },
  check(dir, _rest, config = loadConfig(findProjectRoot(dir))) {
    load(dir);
    const r = run("npx", ["--yes", `hyperframes@${config.hfVersion}`, "check", "."], { cwd: dir });
    process.stdout.write(r.stdout);
    if (r.status !== 0) { console.error(r.stderr); return 1; }
    return 0;
  },
};
```

把文件顶部原来的 `import { resolve } from "node:path";` 合并进上面的 `node:path` 导入（`import { join, resolve } from "node:path";`），并删除原来的 `const COMMANDS = {};`。

- [ ] **Step 4: 跑全部测试确认通过**

Run: `cd skills/video-director && npm test`
Expected: PASS（全部测试）

- [ ] **Step 5: 提交**

```bash
git add skills/video-director/scripts/vd.mjs skills/video-director/tests/vd.test.mjs
git commit -m "工具: vd cues / build（--sample、--no-music）/ check"
```

---

### Task 8: 技能文档、导演规则、导演脚本模板

**Files:**
- Create: `skills/video-director/SKILL.md`, `references/director-rules.md`, `templates/DIRECTOR.md`
- Modify: `.gitignore`（忽略 `04-作品/**/抖音-director/assets/fonts/`、`**/node_modules/`、`**/beats/`、`**/.media/`）

**Interfaces:**
- Consumes: Task 2 的章节名和机器块结构（必须与 `SECTIONS` 完全一致）

- [ ] **Step 1: 写 `templates/DIRECTOR.md`**

内容：七个章节标题（与 `director.mjs` 的 `SECTIONS` 逐字一致），每节下写填写说明并用「（待填）」占位；末尾是 Task 2 中列出的完整机器块示例（`music` 写成示例对象，注释说明可改成 `null`）。第 3 节自检表固定 6 行：

```markdown
## 3. 导演规则自检

| 规则 | 本片怎么做（写具体画面和 @词） |
|---|---|
| 第一秒的视觉落点 | （待填） |
| 第一句跟观众有关 | （待填） |
| 重拍（几个、落在哪些词） | （待填） |
| 话说一半 | （待填） |
| 硬切（有没有、理由） | （待填） |
| 结尾问题 | （待填） |
```

- [ ] **Step 2: 写 `references/director-rules.md`**

逐条写清规则、为什么、怎么做、反例，来源是规格「导演脚本」一节和实验总结：
- 视觉方案从内容里长出来（RAG = 先翻资料 → 文件桌）；颜色只承担含义；强调色固定用途
- 第一秒必须有落点（饱和色的单个物体）；第一句说到观众身上
- 话说一半：画面上的字比口播晚半拍，关键词等 `@词` 才出现
- 重拍：音效 + 画面（盖章、荧光笔、翻牌）同一帧；有配乐时 `music.drop` 指向全片最重要的那一下
- 转场：不硬切；写明由哪个元素连起来；贯穿元素放总装层
- 画面演意思，不重复字幕：同一句话不能在画面大字和字幕里各写一遍（反例：旧 RAG 成品第 1 帧）
- 版面：内容区 y 230–1150、x 60–1020；字幕带 y 1180–1440；底部 480 留空是平台界面
- HyperFrames 坑（实验踩过的）：`fromTo` 必须 `immediateRender: false` + 入场前 `gsap.set` 隐藏；`allow-overlap` 标在具体文字上；`allow-occlusion` 标在被遮挡的文字上；负 `z-index` 的父元素加 `isolation: isolate`；元素缩放后算清楚是否出画面
- 每段画面完成后在 `@词` 时间点截图看一遍

- [ ] **Step 3: 写 `SKILL.md`**

frontmatter：
```markdown
---
name: video-director
description: >
  视频导演：已写好的口播稿 + nv hf-audio 的配音 → 导演脚本 DIRECTOR.md → 按内容设计风格的 HyperFrames 视频工程（每段一个子画面，
  账号固定元素：栏目标签、字幕、结尾），带配乐重拍对位和人声避让。提供 vd 命令：vd cues、vd build [--sample] [--no-music]、vd check。
  当用户要「按导演脚本做视频」、brief.md 里 video: director，或作品目录里有 DIRECTOR.md 时使用。配音用 narrated-video，渲染用 nv render。
---
```
正文：安装（软链接、`NODE_USE_ENV_PROXY=1`、heygen OAuth、工程里 `@hyperframes/core` 由 `vd build` 自动装）；流程表（新建工程 → 写 DIRECTOR.md → ③a 用户确认 → 写样片段落 → `vd build --sample` → 截图 → ③b 用户确认 → 写其余段 → `vd build` → 截图逐个 `@词` 检查 → `nv render`）；新建工程的命令：

```bash
mkdir -p 04-作品/<系列>/<期>/抖音-director/{compositions/frames,assets}
cd 04-作品/<系列>/<期>
cp 抖音/{SCRIPT.md,audio_meta.json,caption_groups.json,package.json,hyperframes.json,meta.json} 抖音-director/
cp -r 抖音/assets/voice 抖音-director/assets/
cp ~/.claude/skills/video-director/templates/{index.html,DIRECTOR.md} 抖音-director/
```
并说明 `package.json` 里的锁定版本要改成 `video-director.config.json` 的 `hfVersion`。

- [ ] **Step 4: 改 `.gitignore` 并提交**

```bash
cat >> .gitignore <<'EOF'
# video-director 工程：字体包、依赖、节拍和素材缓存不入库
04-作品/**/抖音-director/assets/fonts/
04-作品/**/抖音-director/node_modules/
04-作品/**/抖音-director/beats/
04-作品/**/抖音-director/.media/
EOF
git add skills/video-director/SKILL.md skills/video-director/references skills/video-director/templates/DIRECTOR.md .gitignore
git commit -m "工具: video-director 技能说明、导演规则、DIRECTOR.md 模板"
```

注意：`.gitignore` 工作区里已有用户未提交的改动，只追加上面几行，`git add .gitignore` 前先 `git diff .gitignore` 确认没有混入用户的改动；有的话用 `git add -p .gitignore` 只选这几行。

---

### Task 9: 用新流程做出 RAG 这期（样片 → ③b）

**Files:**
- Create: `04-作品/AI概念一分钟/01-RAG/抖音-director/`（按 SKILL.md 的新建命令）
- Create: `抖音-director/DIRECTOR.md`、`compositions/frames/seg-01-hook.html`、`seg-02-why.html`、`seg-03-what.html`
- Modify: `抖音-director/index.html`（手写区：纸面背景、贯穿元素「公司差旅报销制度.pdf」）

**参考实现**：`/home/power/hyperframes/experiments/rag-director/`（`DIRECTOR.md` 是已确认的内容；`sample/index.html` 是第 1–4 句已确认的画面，把它拆成三段子画面 + 总装层的贯穿元素）。

- [ ] **Step 1: 新建工程，写 `DIRECTOR.md`**：内容来自实验的 `DIRECTOR.md`（用户在 ③a 已确认），按新模板的七个章节重排，补第 3 节自检表、第 4 节音乐（`intent: "light curious lo-fi explainer, playful, clear steady beat"`，`drop: "@六次里"`）、末尾机器块。8 段：`seg-01-hook`(1–2) `seg-02-why`(3) `seg-03-what`(4–6) `seg-04-source`(7–8) `seg-05-tips`(9–12) `seg-06-myth`(13–15) `seg-07-close`(16) `seg-08-next`(17)。音效沿用 `sample/scripts/make-audio.sh` 的列表，改成 `@词`。`sample`：`{"segments":["seg-01-hook","seg-02-why","seg-03-what"],"end":"@先去翻资料","tail":0.9}`。

- [ ] **Step 2: 跑 `vd cues`**

Run: `vd cues 04-作品/AI概念一分钟/01-RAG/抖音-director`
Expected: 打印每个 `@词` 的秒数，其中 `@编一套 → 2.82s`、`@根本没这条 → 6.07s`、`@不在里面 → 10.44s`、`@先去翻资料 → 13.55s`（与实验一致，±0.05）。有词找不到时按提示改 `DIRECTOR.md`。

- [ ] **Step 3: 写 seg-01..03 三段子画面**：从 `sample/index.html` 拆分，所有写死的秒数换成 `at("词")`；元素 id 加段前缀；真文件（贯穿元素）移到 `index.html` 手写区，用 `VD.cues[...]` 控制它在段间的移动；栏目标签、字幕从实验代码中删除（由 brand 子画面提供）。

- [ ] **Step 4: 跑 `vd build --sample`**

Run: `vd build 04-作品/AI概念一分钟/01-RAG/抖音-director --sample`
Expected: `✓ 配乐重拍…`、`✓ 总装完成：样片 seg-01-hook、seg-02-why、seg-03-what，14.45s`、`Check passed`。

- [ ] **Step 5: 截图对照实验样片**

Run: `cd 04-作品/AI概念一分钟/01-RAG/抖音-director && npx hyperframes@0.8.143 snapshot . --at 0.4,2.95,6.5,8.4,10.42,14.3`
Expected: 每张与 `experiments/rag-director/sample/snapshots` 同时间点画面一致（布局、出现的元素）；栏目标签、字幕由 brand 子画面绘制且位置相同。不一致就修到一致。

- [ ] **Step 6: 渲染样片，请用户确认（关卡 ③b）**

Run: `npx hyperframes@0.8.143 render . -q high -o ./renders/sample.mp4`
把 Windows 路径给用户，**等用户明确说通过**再进入 Task 10。

- [ ] **Step 7: 提交（源码，不含视频）**

```bash
git add "04-作品/AI概念一分钟/01-RAG/抖音-director"
git commit -m "内容: RAG 导演版 DIRECTOR.md 与样片三段"
```

---

### Task 10: RAG 整片 → 渲染 → ④

**Files:**
- Create: `抖音-director/compositions/frames/seg-04-source.html` … `seg-08-next.html`
- Modify: `抖音-director/index.html`（贯穿元素在第 4、7 段的出现；第 6 段灯光压暗用总装层的全屏遮罩）

- [ ] **Step 1: 逐段写 seg-04 … seg-08**：严格按 `DIRECTOR.md` 第 2 节，每个动作 `at("词")`。`seg-08-next` 只放画面陪衬（结尾文字由 `brand-ending` 提供，不重复）。每写完一段跑一次：

Run: `vd build <工程> --no-music && npx hyperframes@0.8.143 snapshot . --at <该段每个 @词 的秒数，见 vd cues 输出>`
Expected: `Check passed`；截图逐张对照 `DIRECTOR.md` 该段描述，按 `references/director-rules.md` 的版面和 HyperFrames 坑逐条检查。

- [ ] **Step 2: 整片总装（带配乐）**

Run: `vd build 04-作品/AI概念一分钟/01-RAG/抖音-director`
Expected: 配乐重拍落在 `@六次里`（约 46s）；`✓ 总装完成：整片，63.61s`；`Check passed`。若打印「配乐 … 秒，找不到能让重拍落在 … 的节拍」，在 `DIRECTOR.md` 里把 `music.intent` 改成需要更长曲目的描述（如加 `long, 90 seconds`），删除 `assets/audio/bgm.wav` 后重跑。

- [ ] **Step 3: 全片截图总览**

Run: `npx hyperframes@0.8.143 snapshot . --at <全部 @词 秒数，逗号分隔>`
Expected: 逐张检查：贯穿元素连续、重拍画面有冲击力、无出画面、栏目标签未被挡、字幕带只有字幕。问题写进 `../qa.json`（kv 现有格式），修完重跑本步。

- [ ] **Step 4: 渲染并做成片检查**

Run: `nv render 04-作品/AI概念一分钟/01-RAG/抖音-director`
Expected: 生成 `renders/*.mp4`，`nv verify` 通过（帧数、时长约 63.6s、有声音、1080×1920、无黑屏）。

- [ ] **Step 5: 与旧成品做对比视频，请用户确认（关卡 ④）**

```bash
cd "04-作品/AI概念一分钟/01-RAG"
FONT=$(fc-match -f '%{file}' 'Noto Sans Mono CJK SC')
ffmpeg -v error -y -i 抖音/renders/01-RAG.mp4 -i 抖音-director/renders/*.mp4 -filter_complex \
 "[0:v]scale=540:960,setsar=1,tpad=stop_mode=clone:stop_duration=2[a];[1:v]scale=540:960,setsar=1[b];[a][b]hstack=inputs=2,drawtext=fontfile=$FONT:text='旧':x=20:y=20:fontsize=32:fontcolor=white,drawtext=fontfile=$FONT:text='导演版':x=560:y=20:fontsize=32:fontcolor=white[v]" \
 -map "[v]" -map 1:a -c:v libx264 -crf 20 -c:a aac 抖音-director/renders/compare.mp4
```
把成片和对比视频的 Windows 路径给用户，**等用户明确说通过**。

- [ ] **Step 6: 提交**

```bash
git add "04-作品/AI概念一分钟/01-RAG/抖音-director" "04-作品/AI概念一分钟/01-RAG/qa.json"
git commit -m "内容: RAG 导演版整片（8 段、配乐对位）"
```
