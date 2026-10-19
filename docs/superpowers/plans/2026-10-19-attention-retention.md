# 注意力与完播率改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「时长预算、首帧证据、内容区运动、响度、钩子一致」做成可测的 warn 级检查，并用样本证明「删掉没信息的帧」有效。

**Architecture:** 先做纯函数与 CLI（measure / loudness / loudnorm），再做画面模板和 QA 标记（proof / beat / 0.0s），最后把预算表和钩子一致接进 `sc check` 与 `st review`。所有新检查只报 warn，不改 `passed`、不卡 kv。

**Tech Stack:** Node.js 22+（ESM、`node:test`）、ffmpeg / ffprobe、puppeteer-core、HyperFrames；不新增依赖。

**Spec:** `docs/superpowers/specs/2026-10-19-attention-retention-design.md`

## 与 spec 的差异（实现决定）

| # | spec 写法 | 本计划 | 原因 |
|---|---|---|---|
| 1 | 像素 motion 进 `vd qa`（P1-3） | 落在成片：`vd measure` + `vd render` 自动跑 | qa 在开发页上按 0.8s 抽帧，1fps 截 117 张太慢；成片才包含视频、转场和最终编码，是最终事实 |
| 2 | 收尾占比 ≤12% 自动检查 | 留在 `qa.json` 人工勾选 | 自动判定需要给「收尾帧」打标记，先不加约定 |
| 3 | beat 检查「box 或 opacity 有变化」 | 只在有 `data-vd-beat` 时跑；每个 beat 多 2 个采样（一段通常 2–4 个 beat） | 没写的段不增加 qa 时间 |
| 4 | 预算表与 audio_meta 偏差 ≤20% | 偏差 >20% 报 warn，不阻断 | 调试期先看数据 |

## Global Constraints

- 不新增运行时依赖；只用 Node 内置模块、ffmpeg/ffprobe、puppeteer-core。
- **所有新检查都是 warn**；`passed` 仍只由 error 决定（`video-director/scripts/lib/qa-run.mjs` 第 85 行）。不新增任何阻断。
- 旧工程没有 `data-vd-proof` / `data-vd-beat` / 预算表时，只给提示，不崩、不影响 `passed`。
- 工具包不写死账号：示例用中性路径，阈值走默认值或项目配置。
- 不碰用户原工程：内容实验只在 `.dsh/attn-p0/抖音` 副本里做。
- 中文注释和提示；每个 Task 一个 commit，提交信息用中文。
- 测试命令：`cd video-director && node --test tests/*.test.mjs`；全部完成后跑 `st test`。
- 本机 Node 24、CI Node 22 都要能跑；不用 Node 24 才有的 API。

## Review Focus

1. **ffmpeg / ffprobe 缺失或文件坏**：`vd measure` 和 `vd render` 要打印中文提示并继续（render 不能因为响度标准化失败就丢掉已经渲染好的成片）。
2. **旧工程兼容**：没有新标记、没有预算表、没有 beats 的工程，只提示，不改变 `passed`、不抛错。
3. **静音 / 0 帧 / 很短的片子**：`analyzeFrames` 和响度解析不能除零、不能返回 NaN。
4. **camera 缩放**：段内容放大后不能让 `vd qa` 报出假的安全区 ✗；只缩段内容，不缩品牌层（字幕、栏目标签）。
5. **预算表解析**：只认同时有「预算秒」和「新信息」表头的表格，不能把 DIRECTOR 里的自检表或其他表格当预算表。

---

## 文件结构

**新建**
- `video-director/scripts/lib/measure.mjs`：内容区采样与窗口计算（纯函数）
- `video-director/scripts/lib/loudness.mjs`：ebur128 解析（纯函数）
- `video-director/scripts/measure.mjs`：`vd measure` 的 CLI
- `video-director/scripts/lib/actions.mjs`：`ACTIONS_JS`（注入到 `vd:head` 的动作库）
- `video-director/tests/measure.test.mjs`、`tests/loudness.test.mjs`、`tests/actions.test.mjs`
- `docs/superpowers/reports/2026-10-19-attention-p0.md`：P0 对比报告

**修改**
- `video-director/scripts/vd.mjs`：新增 `measure` 子命令
- `video-director/scripts/render.mjs`：渲染后 loudnorm + measure
- `video-director/scripts/verify.mjs`：响度检查
- `video-director/scripts/lib/craft.mjs`：导出 `frameCraft`
- `video-director/scripts/lib/inspect-page.mjs`：收集 `proof` / `beat` 标记
- `video-director/scripts/lib/douyin-qa.mjs`：`checkFirstFrame`、`checkBeats`、`qaTimes` 加开场与 beat 采样
- `video-director/scripts/lib/qa-run.mjs`：接入两个新检查
- `video-director/scripts/lib/director.mjs`：校验 `segments[].beats`
- `video-director/scripts/lib/assemble.mjs`：`applyHead` 注入动作库
- `video-director/templates/segment-hero.html`：首帧就有主体和证据
- `video-director/templates/segment.html`：camera 包裹层
- `video-director/templates/DIRECTOR.md`：第 2 节 shot list + beats
- `scenario-content/scripts/sc.mjs`：预算表检查、封面-首帧一致
- `studio/scripts/lib/review.mjs`：`st review` 的注意力指标
- 对应测试文件：`vd.test.mjs`、`render.test.mjs`、`verify.test.mjs`、`craft.test.mjs`、`douyin-qa.test.mjs`、`director.test.mjs`、`assemble.test.mjs`、`templates.test.mjs`、`sc.test.mjs`、`monitor.test.mjs`

---

## Task 1: 时长预算表（内容任务，不写代码）

**Files:**
- Create: `.dsh/attn-p0/抖音/`（整个样本副本）
- Create: `docs/superpowers/reports/2026-10-19-attention-p0.md`

**Interfaces:**
- Consumes: 现有样本 `.dsh/qa-sample/抖音`
- Produces: 一张预算表 + 删帧清单 + 估算时长，给 Task 11 复测

- [ ] **Step 1: 复制样本，不动原工程**

```bash
mkdir -p .dsh/attn-p0
cp -r .dsh/qa-sample/抖音 .dsh/attn-p0/抖音
```

- [ ] **Step 2: 在 SCRIPT.md 第一个 `## … (Frame N)` 之前写预算表**

表头必须同时有「预算秒」和「新信息」（Task 8 只认这种表）：

```markdown
| 帧 | 内容 | 字数 | 口播秒 | 画面最短秒 | 预算秒 | 新信息 |
|---|---|---|---|---|---|---|
| 1 | 结果 + 代价 | 20 | 4.5 | 6.0 | 6.2 | 成品、十秒、代价 |
| 2 | 收尾：领模板 | 20 | 4.5 | 4.0 | 4.7 | 模板在哪领 |
```

- [ ] **Step 3: 按表删帧**

规则：每一帧写不出「新信息」就删或并进相邻帧；「收尾」开头的帧才算收尾。样本的起点是 500 字 / 117.1 秒，按 spec 第 6.2 节的删法（删第 2、3、12 帧，压第 13 帧，钩子 35→20 字，第 5、7、10 帧各删 10–15 字）落到约 344 字。

- [ ] **Step 4: 用命令核对表**

```bash
cd .dsh/attn-p0/抖音
grep -c '^| [0-9]' SCRIPT.md
node -e "const fs=require('fs');const t=fs.readFileSync('SCRIPT.md','utf8');const rows=t.split('\n').filter(l=>/^\|\s*\d+\s*\|/.test(l));const sec=rows.reduce((s,l)=>s+Number(l.split('|')[6]),0);console.log('帧',rows.length,'预算合计',sec.toFixed(1)+'s')"
```

Expected: 帧数与 `parseScript` 的帧数一致；预算合计约 75–85 秒（不是硬指标，是这次内容的自然长度）。

- [ ] **Step 5: 写报告**

`docs/superpowers/reports/2026-10-19-attention-p0.md` 写清：删了哪些帧、每帧的新信息、估算时长、和 117.1 秒的差在哪里。**不要**在这一步重配音、重渲染。

- [ ] **Step 6: 提交**

```bash
git add docs/superpowers/reports/2026-10-19-attention-p0.md
git commit -m "docs: 周报样本的时长预算表与删帧清单"
```

---

## Task 2: measure 核心（内容区采样与窗口计算）

**Files:**
- Create: `video-director/scripts/lib/measure.mjs`
- Test: `video-director/tests/measure.test.mjs`

**Interfaces:**
- Produces:
  - `SAMPLE = { fps: 1, width: 48, height: 46, crop: "960:920:60:230", window: 2, threshold: 0.01 }`
  - `ffmpegFramesArgs(file, sample = SAMPLE) -> string[]`
  - `analyzeFrames(buf, opts = {}) -> { frames, windows, changedWindows, staticRatio, changeEvents, changeRate, longestStill, duration }`

- [ ] **Step 1: 写失败测试**

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeFrames, ffmpegFramesArgs, SAMPLE } from "../scripts/lib/measure.mjs";

const W = 4, H = 2, N = W * H;
const f = (v) => Buffer.alloc(N, v);
// 8 帧：0-3 静止，4-5 变化，6-7 又静止
const buf = Buffer.concat([f(0), f(0), f(0), f(0), f(255), f(255), f(0), f(0)]);

test("analyzeFrames：相邻 1 秒差 + 2 秒窗口，算静态率 / 变化事件 / 最长静止", () => {
  const r = analyzeFrames(buf, { ...SAMPLE, width: W, height: H, fps: 1, window: 2, threshold: 0.01 });
  assert.equal(r.frames, 8);
  assert.equal(r.windows, 6);
  assert.equal(r.changedWindows, 4);
  assert.equal(r.staticRatio, 2 / 6);
  assert.equal(r.changeEvents, 2);
  assert.equal(r.longestStill, 2);
  assert.equal(Math.round(r.changeRate), 15);
});

test("analyzeFrames：帧数不够、全静止时不出 NaN", () => {
  const r = analyzeFrames(Buffer.alloc(N * 2), { ...SAMPLE, width: W, height: H, fps: 1, window: 2 });
  assert.deepEqual([r.windows, r.changedWindows, r.staticRatio], [0, 0, 1]);
  assert.equal(r.changeRate, 0);
  assert.equal(r.longestStill, 0);
});

test("ffmpegFramesArgs：只取内容区，字幕带和栏目标签不参与", () => {
  assert.deepEqual(ffmpegFramesArgs("/x.mp4"), [
    "-v", "error", "-i", "/x.mp4",
    "-vf", "fps=1,crop=960:920:60:230,scale=48:46,format=gray",
    "-f", "rawvideo", "-",
  ]);
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd video-director && node --test tests/measure.test.mjs
```

Expected: FAIL，`Cannot find module '../scripts/lib/measure.mjs'`。

- [ ] **Step 3: 实现**

要点：
- 相邻帧差 = 逐像素绝对差之和 / 像素数 / 255；`>= threshold` 记为变化。
- 窗口 `t` 有变化 = `changed[t .. t+window-1]` 里任意一个为 true。
- `changeEvents`：把连续 `changed` 合并成一个事件（中间隔 1 帧静止算同一事件）。
- `longestStill` 保守取「连续无变化窗口数 / fps」，不要四舍五入到小数。
- 帧数 `< window + 2` 时返回 `windows: 0, staticRatio: 1, changeRate: 0, longestStill: 0`。

- [ ] **Step 4: 跑测试确认通过**

```bash
cd video-director && node --test tests/measure.test.mjs
```

Expected: PASS（3 个用例）。

- [ ] **Step 5: 提交**

```bash
git add video-director/scripts/lib/measure.mjs video-director/tests/measure.test.mjs
git commit -m "feat(video-director): measure 的内容区静态率与变化率"
```

---

## Task 3: `vd measure` CLI + 响度解析

**Files:**
- Create: `video-director/scripts/lib/loudness.mjs`
- Create: `video-director/scripts/measure.mjs`
- Modify: `video-director/scripts/vd.mjs`（USAGE、COMMANDS.measure）
- Test: `video-director/tests/loudness.test.mjs`、`video-director/tests/measure.test.mjs`、`video-director/tests/vd.test.mjs`

**Interfaces:**
- `parseEbur128(log) -> { integrated, truePeak } | null`
- `ffmpegLoudnessArgs(file) -> string[]`
- `probeLoudness(file, run = spawnSync) -> { integrated, truePeak } | null`
- `measure(file, { run = spawnSync } = {}) -> { at, file, duration, video, loudness }`
- `format(result) -> string`
- `vd measure <mp4> [--json] [--out <json>]`

- [ ] **Step 1: 写失败测试**

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseEbur128 } from "../scripts/lib/loudness.mjs";

const LOG = [
  "  Integrated loudness:",
  "    I:         -14.2 LUFS",
  "    Threshold: -24.7 LUFS",
  "",
  "  Loudness range:",
  "    LRA:         5.9 LU",
  "",
  "  True peak:",
  "    Peak:       -1.3 dBFS",
].join("\n");

test("parseEbur128：读整合响度和真峰值；没有数字时返回 null", () => {
  assert.deepEqual(parseEbur128(LOG), { integrated: -14.2, truePeak: -1.3 });
  assert.equal(parseEbur128("nope"), null);
});
```

```js
// 追加到 tests/measure.test.mjs
import { format } from "../scripts/measure.mjs";

test("format：打印五项指标，缺响度时写 —", () => {
  const text = format({
    duration: 75.4,
    video: { staticRatio: 0.42, changeRate: 14.3, longestStill: 2, changeEvents: 18 },
    loudness: { integrated: -14.1, truePeak: -1.4 },
  });
  assert.match(text, /时长 75\.4s/);
  assert.match(text, /静态率 42%/);
  assert.match(text, /变化 14\.3 次\/分/);
  assert.match(text, /最长静止 2s/);
  assert.match(text, /响度 -14\.1 LUFS/);
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd video-director && node --test tests/loudness.test.mjs tests/measure.test.mjs
```

Expected: FAIL，`loudness.mjs` 不存在。

- [ ] **Step 3: 实现**

- `loudness.mjs`：`parseEbur128` 用 `/I:\s*(-?[\d.]+) LUFS/` 和 `/Peak:\s*(-?[\d.]+) dBFS/`；任一没有就返回 `null`。
- `measure.mjs`：
  - `duration` 用 `ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 <file>`。
  - `decode` 用 `spawnSync("ffmpeg", ffmpegFramesArgs(file), { maxBuffer: 64 * 1024 * 1024 })`，拿 `stdout`。
  - 组合 `measure`，失败时抛中文错误：`ffmpeg 不可用：…` / `读不到画面帧：…`。
  - CLI 参数：位置参数是文件；`--json` 打 JSON；`--out` 写文件。
- `vd.mjs`：USAGE 加 `measure`；`COMMANDS.measure(file, rest = [], { run = spawnSync } = {})` 调 `scripts/measure.mjs`，透传参数；返回子进程状态码。测试 `typeof COMMANDS.measure === "function"`，并用假 `run` 断言返回 0。

- [ ] **Step 4: 跑测试确认通过**

```bash
cd video-director && node --test tests/loudness.test.mjs tests/measure.test.mjs tests/vd.test.mjs
```

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add video-director/scripts/lib/loudness.mjs video-director/scripts/measure.mjs video-director/scripts/vd.mjs video-director/tests/loudness.test.mjs video-director/tests/measure.test.mjs video-director/tests/vd.test.mjs
git commit -m "feat(video-director): vd measure 输出静态率、变化率和响度"
```

---

## Task 4: 渲染后响度标准化 + 成片响度检查

**Files:**
- Modify: `video-director/scripts/render.mjs`
- Modify: `video-director/scripts/verify.mjs`
- Test: `video-director/tests/render.test.mjs`、`video-director/tests/verify.test.mjs`

**Interfaces:**
- `parseLoudnorm(stderr) -> { input_i, input_tp, input_lra, input_thresh, target_offset } | null`
- `loudnormFilter(m) -> string`
- `applyArgs(file, filter, out) -> string[]`
- `normalizeAudio(file, { run = spawnSync } = {}) -> boolean`
- `verify.evaluate({ ..., loudness })` 多一个可选参数

- [ ] **Step 1: 写失败测试**

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { applyArgs, loudnormFilter, parseLoudnorm } from "../scripts/render.mjs";

const LOG = '{\n  "input_i" : "-21.80",\n  "input_tp" : "-3.40",\n  "input_lra" : "6.20",\n  "input_thresh" : "-32.90",\n  "target_offset" : "0.10"\n}';

test("parseLoudnorm：从 ffmpeg 的 JSON 日志读测量值", () => {
  assert.deepEqual(parseLoudnorm(LOG), { input_i: -21.8, input_tp: -3.4, input_lra: 6.2, input_thresh: -32.9, target_offset: 0.1 });
  assert.equal(parseLoudnorm("nope"), null);
});

test("loudnormFilter / applyArgs：两遍 linear，视频流直接复制", () => {
  const m = parseLoudnorm(LOG);
  assert.match(loudnormFilter(m), /measured_I=-21\.8:measured_TP=-3\.4:measured_LRA=6\.2:measured_thresh=-32\.9:offset=0\.1:linear=true/);
  const args = applyArgs("/x.mp4", "F", "/x.norm.mp4");
  assert.ok(args.includes("-c:v"));
  assert.ok(args.includes("copy"));
  assert.ok(args.includes("-af"));
  assert.equal(args.at(-1), "/x.norm.mp4");
});
```

```js
// 追加到 tests/verify.test.mjs
test("verify.evaluate：响度离 -14 太远或真峰值过高 → ⚠", async () => {
  const { evaluate } = await import("../scripts/verify.mjs");
  const streams = [{ codec_type: "video", codec_name: "h264", width: 1080, height: 1920, avg_frame_rate: "30/1" }, { codec_type: "audio", duration: "10" }];
  const items = evaluate({ streams, packets: 300, duration: 10, volume: { mean: -20, max: -3 }, expected: {}, blackSpans: [], loudness: { integrated: -21.8, truePeak: -3.4 } });
  assert.match(items.map((i) => i.level + i.msg).join("\n"), /⚠响度 -21\.8 LUFS/);
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd video-director && node --test tests/render.test.mjs tests/verify.test.mjs
```

Expected: FAIL，`parseLoudnorm is not a function`。

- [ ] **Step 3: 实现**

- `render.mjs`：
  - 第一遍：`ffmpeg -i file -af loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json -f null -`，从 stderr 尾部找 JSON。
  - 第二遍：`-c:v copy -af <loudnormFilter> -ar 48000 -c:a aac -b:a 192k -movflags +faststart <tmp>`，成功后 `renameSync` 覆盖原文件。
  - 失败只打 `⚠ 响度标准化失败（原片保留）：…`，返回 false；`main` 继续 verify。
  - `main(argv, { requireBin, run = spawnSync })`；测试用假 `run`。
  - 渲染成功 → `normalizeAudio` → `verify` → `measure`（写 `<dir>/measure.json`，stdout 打印 `format`）。
- `verify.mjs`：`evaluate` 接受 `loudness`；`integrated` 不在 -15 ~ -13 或 `truePeak > -1` 时加一条 `⚠`。`probeLoudness` 用 Task 3 的函数。

- [ ] **Step 4: 跑测试确认通过**

```bash
cd video-director && node --test tests/render.test.mjs tests/verify.test.mjs
```

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add video-director/scripts/render.mjs video-director/scripts/verify.mjs video-director/tests/render.test.mjs video-director/tests/verify.test.mjs
git commit -m "feat(video-director): 渲染后响度标准化，成片检查响度"
```

---

## Task 5: 首帧 0.0s 有主体和证据

**Files:**
- Modify: `video-director/templates/segment-hero.html`
- Modify: `video-director/scripts/lib/craft.mjs`（导出 `frameCraft`）
- Modify: `video-director/scripts/lib/inspect-page.mjs`（收集 `proof`）
- Modify: `video-director/scripts/lib/douyin-qa.mjs`（`checkFirstFrame`、`qaTimes` 加 0.05s）
- Modify: `video-director/scripts/lib/qa-run.mjs`（接入）
- Test: `video-director/tests/craft.test.mjs`、`tests/douyin-qa.test.mjs`、`tests/templates.test.mjs`

**Interfaces:**
- `frameCraft(f) -> { maxFont, cluster }`
- `checkFirstFrame(frames) -> issue[]`（全部 warn）
- `qaTimes` 新增 `{ t: 0.05, label: "开场", seg }`

- [ ] **Step 1: 写失败测试**

```js
// 追加到 craft.test.mjs
test("frameCraft：返回这一帧的最大字号和主体簇占比", async () => {
  const { frameCraft } = await import("../scripts/lib/craft.mjs");
  const f = { data: { texts: [{ box: [80, 300, 900, 460], fontSize: 104, opacity: 1 }], blocks: [{ box: [100, 280, 980, 1180], opacity: 1 }] } };
  const r = frameCraft(f);
  assert.equal(r.maxFont, 104);
  assert.ok(r.cluster > 30 && r.cluster < 60);
});
```

```js
// 追加到 douyin-qa.test.mjs
test("checkFirstFrame：0.0s 缺大字 / 缺证据 / 主体太小 → warn，不报 error", async () => {
  const { checkFirstFrame } = await import("../scripts/lib/douyin-qa.mjs");
  const f = { label: "开场", data: { texts: [{ box: [80, 300, 900, 460], fontSize: 46, opacity: 1 }], blocks: [{ box: [100, 280, 400, 500], opacity: 1 }], elements: [] } };
  const items = checkFirstFrame([f]);
  assert.ok(items.length >= 2);
  assert.ok(items.every((i) => i.level === "warn"));
  assert.match(items.map((i) => i.msg).join("\n"), /首帧最大字号 46px/);
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd video-director && node --test tests/craft.test.mjs tests/douyin-qa.test.mjs tests/templates.test.mjs
```

Expected: FAIL，`frameCraft is not a function` / `checkFirstFrame is not a function`。

- [ ] **Step 3: 实现**

- `craft.mjs`：`export function frameCraft(f) { const c = maxCluster(f); return { maxFont: frameMax(f), cluster: c ? c.ratio : 0 }; }`
- `inspect-page.mjs`：elements 里加 `proof: e.hasAttribute("data-vd-proof")`。
- `douyin-qa.mjs`：`checkFirstFrame` 找 `label === "开场"` 的帧；字号 <96、簇 <30、没有可见 `proof` 各一条 warn。
- `qaTimes`：加 `{ t: 0.05, label: "开场", seg }`（第一段从 0 开始时）；和已有时间点去重。
- `douyin-qa.test.mjs` 里 qaTimes 的期望数组要同步加上 `[0.05, "开场"]`，否则旧断言会挂。
- `qa-run.mjs`：warns 里加 `...checkFirstFrame(frames)`。
- `templates/segment-hero.html`：主卡片加 `data-vd-proof`；大标题和卡片默认可见（不要 `gsap.set` 成 `opacity: 0`），只把次要元素锚到第一个 `@词`。

- [ ] **Step 4: 跑测试确认通过**

```bash
cd video-director && node --test tests/craft.test.mjs tests/douyin-qa.test.mjs tests/templates.test.mjs
```

Expected: PASS。注意：Task 5 只影响 warn，不改 `passed`。

- [ ] **Step 5: 提交**

```bash
git add video-director/templates/segment-hero.html video-director/scripts/lib/craft.mjs video-director/scripts/lib/inspect-page.mjs video-director/scripts/lib/douyin-qa.mjs video-director/scripts/lib/qa-run.mjs video-director/tests/craft.test.mjs video-director/tests/douyin-qa.test.mjs video-director/tests/templates.test.mjs
git commit -m "feat(video-director): 首帧 0.0s 的字号、主体簇和证据检查"
```

---

## Task 6: camera 包裹层 + 动作库

**Files:**
- Modify: `video-director/templates/segment.html`
- Create: `video-director/scripts/lib/actions.mjs`
- Modify: `video-director/scripts/lib/assemble.mjs`
- Test: `video-director/tests/actions.test.mjs`、`video-director/tests/assemble.test.mjs`、`video-director/tests/templates.test.mjs`

**Interfaces:**
- `ACTIONS_JS`：字符串常量，定义 `window.VDACT = { pushIn, popIn, stamp, highlight, maskReveal }`
- `actionsBlock() -> string`：`<script>` + `ACTIONS_JS` + `</script>`
- `applyHead`：有 `vd:head` 标记时，把 `actionsBlock()` 和 dykit 的 `headBlock()` 一起写进去

- [ ] **Step 1: 写失败测试**

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { actionsBlock, applyHead } from "../scripts/lib/assemble.mjs";

test("actionsBlock：注入动作库，段里能调 VDACT", () => {
  const js = actionsBlock();
  assert.match(js, /window\.VDACT/);
  for (const n of ["pushIn", "popIn", "stamp", "highlight", "maskReveal"]) assert.ok(js.includes(n), n);
});

test("applyHead：有 vd:head 标记时注入动作库；旧工程原样返回", () => {
  assert.match(applyHead("<!-- vd:head --><!-- /vd:head -->", false), /VDACT/);
  assert.equal(applyHead("<div></div>", false), "<div></div>");
});
```

```js
// 追加到 templates.test.mjs
test("templates/segment.html：有 camera 包裹层和 push-in 示例", () => {
  const html = read("segment.html");
  assert.match(html, /data-vd-camera="push-in"/);
  assert.match(html, /VDACT\.pushIn/);
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd video-director && node --test tests/actions.test.mjs tests/assemble.test.mjs tests/templates.test.mjs
```

Expected: FAIL，`actionsBlock is not a function`。

- [ ] **Step 3: 实现**

- `actions.mjs` 导出 `ACTIONS_JS`（普通字符串，不要用模板字符串嵌套）：
  - `pushIn(tl, sel, dur, opts)`：`gsap.set(sel, { scale: opts.from ?? 1, transformOrigin: "50% 45%" })`，再 `tl.to(sel, { scale: opts.to ?? 1.05, duration: dur, ease: "none" }, 0)`。
  - `popIn(tl, sel, at, opts)`、`stamp(tl, sel, at)`、`highlight(tl, sel, at)`、`maskReveal(tl, sel, at)`：一律先 `gsap.set` 初态，再 `tl.to`；不用 `fromTo`（避免 HyperFrames 的 immediateRender 坑）。
- `assemble.mjs`：`export function actionsBlock() { return "\n    <script>" + ACTIONS_JS + "</script>\n    "; }`；`applyHead(html, hasComponents)` 在 `replaceBlock` 时拼上 `headBlock(hasComponents) + actionsBlock()`；没有 `vd:head` 标记且没用组件时，仍原样返回。
- `templates/segment.html`：把内容包进 `<div class="cam" data-vd-camera="push-in">`，CSS 加 `#SEG_ID .cam { position: absolute; inset: 0; transform-origin: 50% 45%; }`，JS 里加 `VDACT.pushIn(tl, ".cam", VD.seg[SEG].duration)`；注释写明「内容内缩 4%（x 100–980、y 270–1110），放大后不压安全区」。

- [ ] **Step 4: 跑测试确认通过**

```bash
cd video-director && node --test tests/actions.test.mjs tests/assemble.test.mjs tests/templates.test.mjs
```

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add video-director/templates/segment.html video-director/scripts/lib/actions.mjs video-director/scripts/lib/assemble.mjs video-director/tests/actions.test.mjs video-director/tests/assemble.test.mjs video-director/tests/templates.test.mjs
git commit -m "feat(video-director): 段模板加 camera 层和动作库"
```

---

## Task 7: DIRECTOR 的 beats + QA 覆盖检查

**Files:**
- Modify: `video-director/scripts/lib/director.mjs`
- Modify: `video-director/templates/DIRECTOR.md`
- Modify: `video-director/scripts/lib/inspect-page.mjs`（收集 `beat`）
- Modify: `video-director/scripts/lib/douyin-qa.mjs`（`checkBeats`、`qaTimes` 采样）
- Modify: `video-director/scripts/lib/qa-run.mjs`（接入）
- Test: `video-director/tests/director.test.mjs`、`tests/douyin-qa.test.mjs`、`tests/templates.test.mjs`

**Interfaces:**
- 机器块：`segments[].beats` 可选，元素是 `{ at: "@词", action: "enter|move|stamp|highlight|mask|count|zoom|exit", el: "选择器" }`
- HTML：`data-vd-beat="<action>:@<词>"` 标在对应元素上
- `checkBeats(frames, segments) -> issue[]`（全部 warn）
- `qaTimes` 给每个 beat 加 `beat-before:<action>:@<词>`（@词-0.2s）和 `beat-after:…`（@词+0.3s）

- [ ] **Step 1: 写失败测试**

```js
// 追加到 director.test.mjs
test("beats：at 必须是 @词，action 在枚举里，el 不能为空", () => {
  const ok = { ...VD, segments: [{ id: "seg-01-hook", lines: [1, 2], beats: [{ at: "@编一套", action: "stamp", el: "#s1-stamp" }] }] };
  assert.deepEqual(parseDirector(doc(ok)).errors, []);
  const bad = { ...VD, segments: [{ id: "seg-01-hook", lines: [1, 2], beats: [{ at: "2.8", action: "闪", el: "" }] }] };
  const e = parseDirector(doc(bad)).errors.join("\n");
  assert.match(e, /beats\[0\]\.at 必须写成 @词/);
  assert.match(e, /beats\[0\]\.action 只能是/);
  assert.match(e, /beats\[0\]\.el 不能为空/);
});
```

```js
// 追加到 douyin-qa.test.mjs
test("checkBeats：没标记 / 看不见 / 没变化 → warn；正常 → 空", async () => {
  const { checkBeats } = await import("../scripts/lib/douyin-qa.mjs");
  const segs = [{ id: "s1", beats: [{ at: "@写错了", action: "stamp", el: "#stamp" }] }];
  const frame = (label, elements) => ({ t: 1, label, seg: "s1", beat: { cue: "写错了", action: "stamp" }, data: { elements } });
  const before = frame("beat-before:stamp:@写错了", [{ sel: "#stamp", beat: "stamp:@写错了", box: [0, 0, 10, 10], opacity: 0 }]);
  const after = frame("beat-after:stamp:@写错了", [{ sel: "#stamp", beat: "stamp:@写错了", box: [0, 0, 200, 200], opacity: 1 }]);
  assert.deepEqual(checkBeats([before, after], segs), []);
  assert.match(checkBeats([], segs)[0].msg, /没有 data-vd-beat/);
  const still = frame("beat-after:stamp:@写错了", [{ sel: "#stamp", beat: "stamp:@写错了", box: [0, 0, 10, 10], opacity: 0 }]);
  assert.match(checkBeats([before, still], segs).map((i) => i.msg).join("\n"), /没有动/);
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd video-director && node --test tests/director.test.mjs tests/douyin-qa.test.mjs
```

Expected: FAIL，`checkBeats is not a function`。

- [ ] **Step 3: 实现**

- `director.mjs`：`checkVd` 里校验 `beats`（可选；有就必须是数组，每项 `at` 以 `@` 开头、`action` 在枚举里、`el` 非空）。错误信息用 `beats[0].at 必须写成 @词` 这种格式。
- `inspect-page.mjs`：elements 里加 `beat: e.getAttribute("data-vd-beat")`。
- `douyin-qa.mjs`：`checkBeats` 按 `action:@词` 找 `beat-after` 帧里的元素；没找到 → warn「段里没有 data-vd-beat」；`opacity <= 0.05` → warn「落定时看不见」；和 `beat-before` 比 `box` 和 `opacity` 都没变 → warn「没有动」。beat 在段首 0.2 秒内、没有 `beat-before` 时只查可见，不查变化。
- `qaTimes`：`built.vd.segments` 里的 beats，逐个算出 `t = cues[词]`，加两条（clamp 到本段 0 ~ duration-0.05）；和已有时间点去重。`douyin-qa.test.mjs` 补一条断言：有 beats 时 inspect 里出现 `beat-before:` / `beat-after:` 两个标签。
- `qa-run.mjs`：warns 里加 `...checkBeats(frames, built.vd.segments)`。
- `templates/DIRECTOR.md`：第 2 节每段加一节示例：

```markdown
- 镜头：特写（手机屏幕）
- beats：
  | @词 | 动作 | 元素 |
  |---|---|---|
  | @写错了 | stamp | #s06-stamp |
```

  机器块对应 `"beats": [{ "at": "@写错了", "action": "stamp", "el": "#s06-stamp" }]`。

- [ ] **Step 4: 跑测试确认通过**

```bash
cd video-director && node --test tests/director.test.mjs tests/douyin-qa.test.mjs tests/templates.test.mjs
```

Expected: PASS。旧 DIRECTOR 没有 `beats` → `checkBeats` 返回空。

- [ ] **Step 5: 提交**

```bash
git add video-director/scripts/lib/director.mjs video-director/templates/DIRECTOR.md video-director/scripts/lib/inspect-page.mjs video-director/scripts/lib/douyin-qa.mjs video-director/scripts/lib/qa-run.mjs video-director/tests/director.test.mjs video-director/tests/douyin-qa.test.mjs video-director/tests/templates.test.mjs
git commit -m "feat(video-director): DIRECTOR 的 beats 与画面覆盖检查"
```

---

## Task 8: `sc check` 的时长预算表检查

**Files:**
- Modify: `scenario-content/scripts/sc.mjs`
- Test: `scenario-content/tests/sc.test.mjs`

**Interfaces:**
- `parseBudget(md) -> { found: boolean, rows: [{ frame, content, chars, speech, visual, budget, info }] }`
- `checkPlatforms` 里新增预算检查（全部 warn）

- [ ] **Step 1: 写失败测试**

```js
test("parseBudget：只认同时有「预算秒」「新信息」的表", async () => {
  const { parseBudget } = await import("../scripts/sc.mjs");
  const md = [
    "| 帧 | 内容 | 字数 | 口播秒 | 画面最短秒 | 预算秒 | 新信息 |",
    "|---|---|---|---|---|---|---|",
    "| 1 | 结果 + 代价 | 35 | 7.8 | 6.5 | 8.0 | 成品、十秒 |",
    "",
    "## 钩子 (Frame 1)",
  ].join("\n");
  const b = parseBudget(md);
  assert.equal(b.found, true);
  assert.deepEqual(b.rows[0], { frame: 1, content: "结果 + 代价", chars: 35, speech: 7.8, visual: 6.5, budget: 8, info: "成品、十秒" });
  assert.equal(parseBudget("| 画面 | 建议组件名 | 变量 |").found, false);
});

test("runChecks：没有预算表、某帧没写新信息、预算和配音差太多 → warn", async () => {
  const { runChecks, loadConfig } = await import("../scripts/sc.mjs");
  const script = (table) => ["## 钩子 (Frame 1)", "", "    说个偷懒的事。", ""].join("\n") + table;
  const noTable = ep({ "抖音/SCRIPT.md": script("") });
  assert.match(runChecks(noTable, loadConfig(noTable)).map((i) => i.msg).join("\n"), /没有时长预算表/);

  const emptyInfo = ep({
    "抖音/SCRIPT.md": script(["| 帧 | 内容 | 字数 | 口播秒 | 画面最短秒 | 预算秒 | 新信息 |", "|---|---|---|---|---|---|---|", "| 1 | 结果 | 10 | 2.2 | 2 | 2.4 | |"].join("\n")),
  });
  assert.match(runChecks(emptyInfo, loadConfig(emptyInfo)).map((i) => i.msg).join("\n"), /第 1 帧没有写新信息/);

  const mismatch = ep({
    "抖音/SCRIPT.md": script(["| 帧 | 内容 | 字数 | 口播秒 | 画面最短秒 | 预算秒 | 新信息 |", "|---|---|---|---|---|---|---|", "| 1 | 结果 | 10 | 2.2 | 2 | 40 | 成品 |"].join("\n")),
    "抖音/audio_meta.json": JSON.stringify({ voices: [{ frame: 1, duration_s: 5 }] }),
  });
  assert.match(runChecks(mismatch, loadConfig(mismatch)).map((i) => i.msg).join("\n"), /预算 40s 和配音 5s 差/);
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd scenario-content && node --test tests/sc.test.mjs
```

Expected: FAIL，`parseBudget is not a function`。

- [ ] **Step 3: 实现**

- `parseBudget`：从第一行同时含「预算秒」「新信息」的 `|` 表开始读，读到不是 `|` 的行；跳过表头分隔行；帧号不是数字的行忽略。
- `checkPlatforms` 的 SCRIPT 分支里：
  - `parseBudget(douyin)` 没找到表 → `⚠ 抖音 SCRIPT.md 没有时长预算表（每帧要写预算秒和新信息）`。
  - 表里的帧号和 `parseScript` 的帧号对不上 → 各自一条 ⚠。
  - `info` 为空 → `⚠ 抖音第 N 帧没有写新信息`。
  - `budget` 不是数字或 ≤0 → ⚠。
  - 读 `抖音/audio_meta.json`（存在才读），配音总时长 = `voices.reduce((s,v) => s + v.duration_s, 0)`；和预算合计偏差 >20% → `⚠ 预算 40s 和配音 5s 差 700%`。
- 不要求表在文件开头；但**只认表头**，避免误读其他表。

- [ ] **Step 4: 跑测试确认通过**

```bash
cd scenario-content && node --test tests/sc.test.mjs
```

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add scenario-content/scripts/sc.mjs scenario-content/tests/sc.test.mjs
git commit -m "feat(scenario-content): 检查 SCRIPT 的时长预算表"
```

---

## Task 9: 封面大字与第一句一致

**Files:**
- Modify: `scenario-content/scripts/sc.mjs`
- Test: `scenario-content/tests/sc.test.mjs`

**Interfaces:**
- `claimOverlap(a, b) -> number`：两段中文的公共双字词数量（忽略标点、空白、`<br>`）
- `coverClaim(md) -> string`：`抖音/封面.md` 第一个 `# ` 标题

- [ ] **Step 1: 写失败测试**

```js
test("claimOverlap：封面大字和第一句的共同双字词", async () => {
  const { claimOverlap } = await import("../scripts/sc.mjs");
  assert.ok(claimOverlap("周报不用憋了", "这份周报我一个字没写") >= 1);
  assert.equal(claimOverlap("周报不用憋了", "今天教你做视频"), 0);
});

test("runChecks：封面和第一句没有共同关键词 → warn", async () => {
  const { runChecks, loadConfig } = await import("../scripts/sc.mjs");
  const dir = ep({
    "抖音/封面.md": "# 周报不用憋了<br>十秒出稿\n",
    "抖音/SCRIPT.md": ["## 钩子 (Frame 1)", "", "**重点词:** 视频", "", "    今天教你做视频。", ""].join("\n"),
  });
  assert.match(runChecks(dir, loadConfig(dir)).map((i) => i.msg).join("\n"), /封面大字和第一句没有共同关键词/);
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd scenario-content && node --test tests/sc.test.mjs
```

Expected: FAIL，`claimOverlap is not a function`。

- [ ] **Step 3: 实现**

- `coverClaim`：读 `抖音/封面.md`，匹配第一行 `/^#\s+(.+)$/m`，去掉 `<br>` 和标点。
- `claimOverlap`：只保留汉字，取 2 字滑窗集合，返回交集大小。
- `checkPlatforms`：封面和 SCRIPT 第一帧都存在时，比较 `coverClaim` + 第一帧 `重点词` + 第一句；交集 0 → `⚠ 封面大字和第一句没有共同关键词（点进来会货不对板）`。文件缺失就跳过。

- [ ] **Step 4: 跑测试确认通过**

```bash
cd scenario-content && node --test tests/sc.test.mjs
```

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add scenario-content/scripts/sc.mjs scenario-content/tests/sc.test.mjs
git commit -m "feat(scenario-content): 封面大字与第一句的一致性检查"
```

---

## Task 10: `st review` 汇总注意力指标

**Files:**
- Modify: `studio/scripts/lib/review.mjs`
- Test: `studio/tests/monitor.test.mjs`

**Interfaces:**
- `attentionSection(root, sinceMs, sinceDays) -> string[]`：读各期 `抖音/measure.json`
- `review()` 输出里加一节 `## 注意力指标（最近 N 天）`

- [ ] **Step 1: 写失败测试**

```js
test("review：列出各期的注意力指标（时长 / 静态率 / 变化率 / 响度）", () => {
  const root = project();
  const ep = join(root, "04-作品/AI办公/01-群聊");
  writeFileSync(join(ep, "run.json"), "{}");
  writeFileSync(join(ep, "抖音/measure.json"), JSON.stringify({
    at: new Date().toISOString(),
    duration: 75.4,
    video: { staticRatio: 0.42, changeRate: 14.3, longestStill: 2 },
    loudness: { integrated: -14.1 },
  }));
  const text = review(root, { sinceDays: 7, home: mkdtempSync(join(tmpdir(), "st-home-")) });
  assert.match(text, /## 注意力指标/);
  assert.match(text, /75\.4s/);
  assert.match(text, /42%/);
  assert.match(text, /-14\.1 LUFS/);
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd studio && node --test tests/monitor.test.mjs
```

Expected: FAIL，输出里没有「注意力指标」。

- [ ] **Step 3: 实现**

- `attentionSection` 照 `craftSection` 的写法：遍历 `runFiles(join(root, worksDir(root)))`，读同目录下 `抖音/measure.json`；`mtime < sinceMs` 跳过；JSON 坏了跳过。
- 表格列：期 / 时长 / 静态率 / 变化 / 最长静止 / 响度。空值写 `—`。
- 没有数据时输出 `没有 measure.json（先 vd render 或 vd measure）。`
- 在 `review()` 的返回数组里，紧跟在 craft 之后插入。

- [ ] **Step 4: 跑测试确认通过**

```bash
cd studio && node --test tests/monitor.test.mjs
```

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add studio/scripts/lib/review.mjs studio/tests/monitor.test.mjs
git commit -m "feat(studio): st review 汇总各期注意力指标"
```

---

## Task 11: P0 对比报告 + 3 人测试

**Files:**
- Modify: `docs/superpowers/reports/2026-10-19-attention-p0.md`（Task 1 已建）

**Interfaces:**
- Consumes: `vd measure`、`vd render`、Task 1 的预算表
- Produces: 一张前后对比表 + 3 人测试记录

- [ ] **Step 1: 先量「改前」**

```bash
cd video-director
node scripts/measure.mjs "../.dsh/qa-sample/抖音/renders/01-AI写周报.mp4" --json
node scripts/measure.mjs "../.dsh/qa-sample/抖音/renders/sample.mp4" --json
```

把数字记进报告：时长、静态率、变化率、最长静止、响度。

- [ ] **Step 2: 问用户要不要重配音**

删帧后口播变了，必须重跑 `vo`，会产生 TTS 费用。用户同意后再做：

```bash
cd .dsh/attn-p0/抖音
vo . --pause 0.3
vd cues .
vd build .
vd render .
```

- [ ] **Step 3: 量「改后」**

```bash
cd video-director
node scripts/measure.mjs "../.dsh/attn-p0/抖音/renders/<成片>.mp4" --json
```

Expected: 时长按预算表；最长静止 ≤ 3s；变化率 ≥ 12/min；响度 -14 ±1。静态率只记录，不设通过线。

- [ ] **Step 4: 3 人测试**

找 3 个目标观众（不是同行）：

1. 只看前 3 秒，问「这个视频要给你什么」；
2. 看完问「三步是什么」「哪一步最容易错」；
3. 问「会不会收藏 / 转给同事」。

把原话记进报告，不做美化。

- [ ] **Step 5: 写对比表并提交**

报告里放：

| 指标 | 改前（117s） | 改后（预算版） |
|---|---|---|
| 时长 | 待填 | 待填 |
| 静态率（只记录） | 待填 | 待填 |
| 变化率 | 待填 | 待填 |
| 最长静止 | 待填 | 待填 |
| 响度 | 待填 | 待填 |
| 首帧 | 待填 | 待填 |

```bash
git add docs/superpowers/reports/2026-10-19-attention-p0.md
git commit -m "docs: 注意力改造的 P0 前后对比与 3 人测试"
```

---

## 验收标准

1. `cd video-director && node --test tests/*.test.mjs` 全绿；`cd scenario-content && node --test tests/*.test.mjs` 全绿；`cd studio && node --test tests/*.test.mjs` 全绿；最后跑 `st test` 全绿。
2. `vd measure` 对 117s 正片和 13.4s 样片都能打出五项指标；坏文件给中文错误，不抛栈。
3. `vd render` 在副本上跑完：成片 -14 ±1 LUFS，`measure.json` 写在工程根。
4. 更新后的 `segment-hero.html` 在 0.0s 有 ≥96px 字、≥30% 主体簇、可见的 `data-vd-proof`；`vd qa` 不再报首帧 warn。
5. DIRECTOR 写了 `beats` 的段，`vd qa` 能查出「没实现 / 看不见 / 没动」；没写 beats 的旧工程不受影响。
6. `sc check` 对 117s 样本报出「没有时长预算表」；对预算版报出「预算和配音差多少」。
7. `st review` 出现「注意力指标」一节。
8. 没有任何新依赖；只有 warn 的工程仍然 `passed: true`。

## 不在本次范围

- 硬门槛（把 attention 改成 error）、A/B、反转 / 清单结构、抓创作者中心。
- 视觉世界模板、拉片工具（P2）。
- 自动判断「收尾占比 ≤12%」——留在 `qa.json` 人工勾选。
- 重做 dykit 组件库。



