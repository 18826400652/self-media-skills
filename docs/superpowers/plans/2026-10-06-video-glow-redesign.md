# 抖音视频视觉重设计（glow 质感层 + 聊天 / AI 回答组件）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 narrated-video 加一套可开关的「glow」视觉（光晕颗粒背景、HUD、玻璃卡片、荧光笔笔触）和两个新画面组件 `Kit.chat`、`Kit.answer`，并用第 4 课验证。

**Architecture:** 质感和皮肤全部放在新文件 `hf-kit/kit-glow.js`（只有 glow 模式的帧才引用，CSS 只读 `--kit-*` 变量）；新组件放在 `hf-kit/kit-scenes.js`，通过 `Kit._u` 复用 kit.js 的内部工具。`frame-build.mjs` 按项目配置 `hfKit.look` 决定是否插入底色层、HUD 和 `kit-glow.js`；flat 模式输出与改动前逐字一致。

**Tech Stack:** Node ESM 脚本、`node --test`、GSAP 3.14.2（浏览器端）、puppeteer-core + HyperFrames 自带的 chrome-headless-shell（浏览器测试）。

**Spec:** `docs/superpowers/specs/2026-10-06-video-glow-redesign-design.md`

## Global Constraints

- 安全区：内容 x 60–1020、y 230–1150；字幕带 y 1180–1440；右侧 150px、底部 480px 不放内容
- `hfKit.look` 只能是 `"glow"` 或 `"flat"`；不填 = `"flat"`，flat 的帧输出与改动前逐字相同
- 现有组件的参数、默认值、尺寸一个都不改，只改外观；现有测试全部通过
- 组件动画只用 `tl.fromTo` / `tl.set`，不用 `tl.to`、`Math.random()`、`Date.now()`（渲染必须可复现）
- 颜色只读 `--kit-*` 变量 / `tok(host)`，不在组件里写死品牌色；新增 token `danger`，默认 `#FF5A5F`
- 光晕透明度 ≤ 13%；荧光黄只用来点（重点词、关键数字、一条描边）
- 玻璃卡片不用 `backdrop-filter`
- `Kit.chat` 默认显示「情景演绎」，`staged: false` 才隐藏；`Kit.answer` 的 `source` 必填，缺了报错
- 字体里没有的符号会变方块：只用 `×` `✓`
- 每个 skill 的依赖装在自己的目录（`skills/narrated-video/node_modules`）；文档用中文
- 不提交视频、配音、录屏
- 提交信息格式 `<type>: <描述>`，结尾带：
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_016dF9DwFyHb12AkmwqgPqvC
  ```

## Review Focus

- `Kit.chat` 消息多到超出面板高度：应整体上推，最新一条始终可见，不出面板（Task 4 测试）
- `Kit.chat` 消息里有 `<`、`&` 这类字符：原样显示，不被当成 HTML（Task 4 测试）
- `Kit.answer` 的 `focus.row` 超出表格行数，或给了 `focus` 却没有表格：报出带行数的中文错误，而不是悄悄不放大（Task 5 测试）
- `ground: "accent"`（整屏黄底）+ glow：不加光晕、只压暗，文字仍是深色可读（Task 2 测试）
- 帧数多于 8 时进度条：段数封顶 8，最后一帧全亮、第一帧至少亮一段（Task 2 测试）

## 文件结构

| 文件 | 职责 |
|---|---|
| `skills/narrated-video/scripts/lib/config.mjs` | 新增 `resolveLook(config)` |
| `skills/narrated-video/scripts/hf-kit.mjs` | token 加 `danger`；复制 `KIT_FILES`（kit-glow.js、kit-scenes.js） |
| `skills/narrated-video/scripts/hf-frames.mjs` | 给 `buildFrame` 传 `total`、`look` |
| `skills/narrated-video/scripts/lib/frame-build.mjs` | glow：底色层、HUD、进度条、脚本引用、样式钩子类名 |
| `skills/narrated-video/scripts/lib/chrome.mjs`（新） | 找 chrome-headless-shell（从 image-cards 复制，skill 之间不互相依赖） |
| `skills/narrated-video/hf-kit/kit.js` | `danger` 默认值、`Kit.look`、`Kit._u`、marker 的 glow 笔触 |
| `skills/narrated-video/hf-kit/kit-glow.js`（新） | 质感层 + HUD + 玻璃皮肤 CSS |
| `skills/narrated-video/hf-kit/kit-scenes.js`（新） | `Kit.chat`、`Kit.answer` |
| `skills/narrated-video/tests/helpers/kit-page.mjs`（新） | 浏览器测试：开无头页、装 GSAP 和 kit |
| `skills/narrated-video/tests/kit-browser.test.mjs`（新） | 浏览器组件测试 |
| `skills/narrated-video/tests/fixtures/frame-flat.html`（新） | flat 输出快照 |
| `06-品牌资产/hyperframes/caption-skin.html` | 新字幕样式 |
| 文档：`references/hf-kit.md`、`references/douyin-recipe.md`、`06-品牌资产/视觉规范.md`、`06-品牌资产/hyperframes/frame.md`、`05-模板/抖音/STORYBOARD模板.md`、spec | 选用表、参数、风格说明 |

> 与 spec 的两处差异（已在 Task 7 回写 spec）：① 质感和皮肤 CSS 放 `kit-glow.js` 而不是 `kit.js` 的 `injectStyle()`（kit.js 已 700 行，且这样 flat 帧完全不受影响）；② `compare` 的「坏」卡不划线、不变红——第 4 课第 1 帧的「坏」卡是「会上原话」，并不是错的内容。

---

### Task 1: `danger` token 和 `hfKit.look` 配置

**Files:**
- Modify: `skills/narrated-video/scripts/lib/config.mjs`（文件末尾加函数）
- Modify: `skills/narrated-video/scripts/hf-kit.mjs:15`（`TOKEN_KEYS`）
- Modify: `skills/narrated-video/hf-kit/kit.js:24`（`TOKENS` 默认值）
- Test: `skills/narrated-video/tests/hf.test.mjs`

**Interfaces:**
- Produces: `resolveLook(config) → "glow" | "flat"`（`config` 是 `loadConfig()` 的返回值；非法值抛 `Error('hfKit.look 只能是 "glow" 或 "flat"，收到 …')`）
- Produces: token 键 `danger`（`mergeTokens` 接受；kit.js 默认 `#FF5A5F`；CSS 变量 `--kit-danger`）

- [ ] **Step 1: 写失败的测试**

在 `tests/hf.test.mjs` 末尾追加：

```js
test("resolveLook：不填是 flat，只接受 glow / flat", async () => {
  const { resolveLook } = await import("../scripts/lib/config.mjs");
  assert.equal(resolveLook({}), "flat");
  assert.equal(resolveLook({ hfKit: {} }), "flat");
  assert.equal(resolveLook({ hfKit: { look: "glow" } }), "glow");
  assert.throws(() => resolveLook({ hfKit: { look: "neon" } }), /hfKit\.look 只能是 "glow" 或 "flat"，收到 "neon"/);
});

test("mergeTokens 认识 danger，kit.js 默认值是 #FF5A5F", () => {
  assert.equal(mergeTokens(KIT_SRC, {}).danger, "#FF5A5F");
  assert.equal(mergeTokens(KIT_SRC, { danger: "#E00" }).danger, "#E00");
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `cd skills/narrated-video && node --test tests/hf.test.mjs`
Expected: 两个新测试 FAIL（`resolveLook is not a function`；`danger` 是 `undefined`）

- [ ] **Step 3: 实现**

`scripts/lib/config.mjs` 末尾追加：

```js
const LOOKS = ["glow", "flat"];

/** 帧的视觉风格：hfKit.look，不填是 flat（纯色底，旧样式） */
export function resolveLook(config) {
  const look = config.hfKit?.look ?? "flat";
  if (!LOOKS.includes(look)) throw new Error(`hfKit.look 只能是 "glow" 或 "flat"，收到 ${JSON.stringify(look)}`);
  return look;
}
```

`scripts/hf-kit.mjs` 第 15 行改成：

```js
const TOKEN_KEYS = ["accent", "ink", "muted", "bg", "surface", "line", "danger", "font", "mono"];
```

`hf-kit/kit.js` 第 24 行 `TOKENS` 里在 `line` 后面加 `danger`：

```js
  var TOKENS = /*KIT_TOKENS*/ { accent: "#5B8CFF", ink: "#F5F5F5", muted: "#8A8A8A", bg: "#111111", surface: "#1C1C1C", line: "#2E2E2E", danger: "#FF5A5F", font: '"Noto Sans SC", sans-serif', mono: '"JetBrains Mono", "Noto Sans SC", monospace' } /*END_KIT_TOKENS*/;
```

- [ ] **Step 4: 运行，确认通过**

Run: `cd skills/narrated-video && npm test`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add skills/narrated-video/scripts/lib/config.mjs skills/narrated-video/scripts/hf-kit.mjs skills/narrated-video/hf-kit/kit.js skills/narrated-video/tests/hf.test.mjs
git commit -m "feat: hf-kit 加 danger 色和 hfKit.look 配置

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016dF9DwFyHb12AkmwqgPqvC"
```

---

### Task 2: 帧模板生成 glow 底色层、HUD、进度条

**Files:**
- Create: `skills/narrated-video/tests/fixtures/frame-flat.html`
- Modify: `skills/narrated-video/scripts/lib/frame-build.mjs`
- Modify: `skills/narrated-video/scripts/hf-frames.mjs`
- Test: `skills/narrated-video/tests/hf.test.mjs`

**Interfaces:**
- Consumes: `resolveLook(config)`（Task 1）
- Produces: `buildFrame(f)` 新增可选字段 `f.look: "glow"|"flat"`（默认 `"flat"`）、`f.total: number`（总帧数，glow 必填）
- Produces: `progressSegments(n, total, max = 8) → { count, lit }`（导出）
- Produces（给 Task 3 的 CSS 用的类名约定）：底色层 `kit-atmo`（accent 底再加 `is-accent`）；HUD `kit-hud` 内含 `<i class="c tl|tr|bl|br">` 和 `<div class="kit-progress">` 里的 `<i>`/`<i class="on">`；角标加 `kit-kicker`；录屏标签加 `kit-chip`；计时面板加 `kit-glass-panel`；标题标签加 `kit-label`；glow 帧引用 `compositions/kit/kit-glow.js`

- [ ] **Step 1: 先用当前代码生成 flat 快照**

```bash
cd skills/narrated-video && mkdir -p tests/fixtures && node -e '
import("./scripts/lib/frame-build.mjs").then(({ buildFrame }) => {
  const tokens = { accent: "#FFD84D", ink: "#F4F1EA", muted: "#888", bg: "#101114", surface: "#1B1D22", line: "#2C2F36", font: "sans-serif" };
  const build = { camera: "push", rec: { mediaStart: 1, chip: "录屏" }, timer: { value: 2, note: "原速" }, lead: { text: "**x**" }, kit: { name: "compare", opts: { at: [0, 1] } }, title: { label: "L", lines: ["a"] } };
  const html = buildFrame({ n: 2, id: "02-x", duration: 3, kicker: "K", tokens, build })
    + buildFrame({ n: 3, id: "03-y", duration: 2, kicker: "K", tokens, build: { ground: "accent", title: { lines: ["b"] } } });
  require("fs").writeFileSync("tests/fixtures/frame-flat.html", html);
});'
```

Expected: 生成 `tests/fixtures/frame-flat.html`（两帧拼在一起）

- [ ] **Step 2: 写失败的测试**

在 `tests/hf.test.mjs` 末尾追加：

```js
const FLAT_TOKENS = { accent: "#FFD84D", ink: "#F4F1EA", muted: "#888", bg: "#101114", surface: "#1B1D22", line: "#2C2F36", font: "sans-serif" };
const FLAT_BUILD = { camera: "push", rec: { mediaStart: 1, chip: "录屏" }, timer: { value: 2, note: "原速" }, lead: { text: "**x**" }, kit: { name: "compare", opts: { at: [0, 1] } }, title: { label: "L", lines: ["a"] } };

test("帧模板 flat：输出和改动前逐字一致", async () => {
  const { buildFrame } = await import("../scripts/lib/frame-build.mjs");
  const html = buildFrame({ n: 2, id: "02-x", duration: 3, kicker: "K", tokens: FLAT_TOKENS, build: FLAT_BUILD, look: "flat", total: 5 })
    + buildFrame({ n: 3, id: "03-y", duration: 2, kicker: "K", tokens: FLAT_TOKENS, build: { ground: "accent", title: { lines: ["b"] } }, total: 5 });
  assert.equal(html, readFileSync(new URL("./fixtures/frame-flat.html", import.meta.url), "utf8"));
});

test("progressSegments：封顶 8 段，第一帧至少一段，最后一帧全亮", async () => {
  const { progressSegments } = await import("../scripts/lib/frame-build.mjs");
  assert.deepEqual(progressSegments(1, 5), { count: 5, lit: 1 });
  assert.deepEqual(progressSegments(3, 5), { count: 5, lit: 3 });
  assert.deepEqual(progressSegments(1, 19), { count: 8, lit: 1 });
  assert.deepEqual(progressSegments(10, 19), { count: 8, lit: 4 });
  assert.deepEqual(progressSegments(19, 19), { count: 8, lit: 8 });
});

test("帧模板 glow：底色层、HUD、进度条、kit-glow.js、样式钩子", async () => {
  const { buildFrame } = await import("../scripts/lib/frame-build.mjs");
  const f = { n: 2, id: "02-x", duration: 3, kicker: "K", tokens: FLAT_TOKENS, look: "glow", total: 4 };
  const html = buildFrame({ ...f, build: FLAT_BUILD });
  assert.match(html, /class="p02-ground kit-atmo clip"/);
  assert.match(html, /\.p02-ground \{ position: absolute; inset: 0; background-color: var\(--kit-bg\); \}/);
  assert.match(html, /<div class="kit-hud"><i class="c tl"><\/i><i class="c tr"><\/i><i class="c bl"><\/i><i class="c br"><\/i><div class="kit-progress"><i class="on"><\/i><i class="on"><\/i><i><\/i><i><\/i><\/div><\/div>/);
  assert.match(html, /class="p02-kicker kit-kicker">K/);
  assert.match(html, /class="p02-chip kit-chip"/);
  assert.match(html, /class="p02-panel kit-glass-panel"/);
  assert.match(html, /class="p02-label kit-label"/);
  assert.match(html, /<script src="compositions\/kit\/kit\.js"><\/script>\s*<script src="compositions\/kit\/kit-glow\.js"><\/script>/);
  assert.ok(html.indexOf('class="kit-hud"') < html.indexOf('id="p02-cam"'), "HUD 在推镜层外面，不跟着推");
});

test("帧模板 glow：accent 底不加光晕；kicker false 只去掉角标；glow 必须给 total", async () => {
  const { buildFrame } = await import("../scripts/lib/frame-build.mjs");
  const f = { n: 1, id: "01-h", duration: 2, kicker: "K", tokens: FLAT_TOKENS, look: "glow", total: 3 };
  const accent = buildFrame({ ...f, build: { ground: "accent", title: { lines: ["b"] } } });
  assert.match(accent, /class="p01-ground kit-atmo is-accent clip"/);
  assert.match(accent, /background-color: #FFD84D;/);
  assert.match(accent, /--kit-ink: #101114;/);
  const noKicker = buildFrame({ ...f, build: { kicker: false } });
  assert.doesNotMatch(noKicker, /p01-kicker/);
  assert.match(noKicker, /class="kit-hud"><i class="c tl">/);
  assert.throws(() => buildFrame({ ...f, total: undefined, build: {} }), /glow 需要 total/);
});
```

- [ ] **Step 3: 运行，确认失败**

Run: `cd skills/narrated-video && node --test tests/hf.test.mjs`
Expected: flat 快照测试 PASS（只是传了没用的字段），`progressSegments` 和两个 glow 测试 FAIL

- [ ] **Step 4: 实现 `frame-build.mjs`**

4a. 文件头注释的 build 参数说明后面加一段：

```js
// 视觉风格 f.look（项目配置 hfKit.look）："flat" 纯色底（默认）；"glow" 光晕颗粒底色 + HUD 四角和进度条 + 玻璃卡片（样式在 hf-kit/kit-glow.js）。
```

4b. 在 `const at = …` 那行后面加：

```js
const MAX_SEGMENTS = 8; // 进度条最多几段：帧多时一段代表几帧

/** 第 n 帧（共 total 帧）的进度条：几段、亮几段（第一帧至少亮一段，最后一帧全亮） */
export function progressSegments(n, total, max = MAX_SEGMENTS) {
  const count = Math.min(total, max);
  return { count, lit: Math.max(1, Math.round((n / total) * count)) };
}

function hudPart(n, total) {
  const { count, lit } = progressSegments(n, total);
  const bars = Array.from({ length: count }, (_, i) => (i < lit ? '<i class="on"></i>' : "<i></i>")).join("");
  return `<div class="kit-hud"><i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i><div class="kit-progress">${bars}</div></div>`;
}
```

4c. `recPart(b, dur)` 改成接收钩子函数 `hook`（第三个参数），chip 那行改为：

```js
function recPart(b, dur, hook) {
  // …video 和 dim 两行不变…
  if (r.chip) parts.push(`<div class="P-chip${hook("kit-chip")}">${esc(r.chip)}</div>`);
  return parts;
}
```

4d. `buildFrame` 开头（`const accent = …` 之后）加：

```js
  const glow = (f.look ?? "flat") === "glow";
  if (glow && !(f.total > 0)) throw new Error(`第 ${f.n} 帧：glow 需要 total（总帧数）`);
  const hook = (cls) => (glow ? ` ${cls}` : ""); // glow 时给元素加 kit-glow.js 认的类名；flat 输出保持原样
```

把 `body.push(...recPart(b, f.duration));` 改成 `body.push(...recPart(b, f.duration, hook));`；
timer 那行的 `<div class="P-panel">` 改成 `<div class="P-panel${hook("kit-glass-panel")}">`；
title 的 label 那行 `<div class="P-label${t.center ? " P-center" : ""}"` 改成 `<div class="P-label${hook("kit-label")}${t.center ? " P-center" : ""}"`。

4e. 返回模板里改四处：

```js
      .${p}-ground { position: absolute; inset: 0; ${glow ? "background-color" : "background"}: ${ground}; }
```

```js
    <div id="${p}-ground" class="${p}-ground${glow ? ` kit-atmo${accent ? " is-accent" : ""}` : ""} clip" data-start="0" data-duration="${f.duration}" data-track-index="0"></div>
${glow ? `    ${hudPart(f.n, f.total)}\n` : ""}${b.kicker === false ? "" : `    <div class="${p}-kicker${hook("kit-kicker")}">${esc(f.kicker)}</div>\n`}${b.camera ? …（原样）
```

```js
    <script src="compositions/kit/kit.js"></script>
${glow ? '    <script src="compositions/kit/kit-glow.js"></script>\n' : ""}    <script>
```

（注意：`kit.js` 那行原本后面直接换行接 `<script>`；flat 时插入空串，输出不变。）

- [ ] **Step 5: `hf-frames.mjs` 传 `look` 和 `total`**

```js
import { SKILL_DIR, loadConfig, resolveLook } from "./lib/config.mjs";
```

`main()` 里：

```js
  const config = loadConfig(dir);
  const tokens = mergeTokens(readFileSync(join(SKILL_DIR, "hf-kit", "kit.js"), "utf8"), config.hfKit?.tokens ?? {});
  const look = resolveLook(config);
```

（删掉原来那行 `const tokens = mergeTokens(... loadConfig(dir) ...)`）写文件那行改成：

```js
    writeFileSync(join(dir, f.src), buildFrame({ ...f, kicker, tokens, look, total: frames.length }));
```

完成提示里加上风格：`console.log(\`✓ 按 build 生成 ${built} 帧（${look}）${…}\`)`。

- [ ] **Step 6: 运行，确认通过**

Run: `cd skills/narrated-video && npm test`
Expected: 全部 PASS（包括 flat 快照逐字一致）

- [ ] **Step 7: 提交**

```bash
git add skills/narrated-video/scripts/lib/frame-build.mjs skills/narrated-video/scripts/hf-frames.mjs skills/narrated-video/tests/hf.test.mjs skills/narrated-video/tests/fixtures/frame-flat.html
git commit -m "feat: 帧模板支持 glow 风格（底色层、HUD、进度条）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016dF9DwFyHb12AkmwqgPqvC"
```

---

### Task 3: `kit-glow.js` 质感层和玻璃皮肤 + 浏览器测试环境

**Files:**
- Create: `skills/narrated-video/scripts/lib/chrome.mjs`
- Create: `skills/narrated-video/hf-kit/kit-glow.js`
- Create: `skills/narrated-video/tests/helpers/kit-page.mjs`
- Create: `skills/narrated-video/tests/kit-browser.test.mjs`
- Modify: `skills/narrated-video/package.json`（devDependency `gsap`）
- Modify: `skills/narrated-video/hf-kit/kit.js`（`Kit.look`、marker glow 笔触）
- Modify: `skills/narrated-video/scripts/hf-kit.mjs`（复制附加文件）

**Interfaces:**
- Consumes: Task 2 的类名约定（`kit-atmo`、`is-accent`、`kit-hud`、`.c.tl/.tr/.bl/.br`、`kit-progress`、`kit-kicker`、`kit-chip`、`kit-glass-panel`、`kit-label`）
- Produces: `window.Kit.look`（kit.js 默认 `"flat"`，加载 kit-glow.js 后为 `"glow"`）
- Produces: `findChrome() → string`（`scripts/lib/chrome.mjs`，找不到抛错）
- Produces: `openKitPage({ files }) → Promise<{ page, close } | null>`（`files` 是 `hf-kit/` 下要依次加载的文件名，如 `["kit.js", "kit-glow.js"]`；找不到 Chrome 返回 `null`）、`CHROME_SKIP`（找不到 Chrome 时是跳过原因字符串，否则 `false`）
- Produces: `KIT_FILES`（`hf-kit.mjs` 导出，附加文件名列表；本任务是 `["kit-glow.js"]`，Task 4 加 `"kit-scenes.js"`）

- [ ] **Step 1: 装 GSAP（测试用），复制找 Chrome 的函数**

```bash
cd skills/narrated-video && npm install -D gsap@3.14.2
cp ../image-cards/scripts/lib/chrome.mjs scripts/lib/chrome.mjs
```

然后把 `scripts/lib/chrome.mjs` 第 1 行注释改成：

```js
// 查找可用的 Chrome（浏览器测试用）：优先 CHROME_PATH，其次复用 HyperFrames / Puppeteer 已下载的 headless shell，最后找系统 Chrome。与 image-cards 的同名文件保持一致。
```

- [ ] **Step 2: 写测试辅助 `tests/helpers/kit-page.mjs`**

```js
// 浏览器测试：开一个无头页面，装上 GSAP 和 hf-kit 的文件，宿主元素 #host（宽 960，放在内容区）。
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { findChrome } from "../../scripts/lib/chrome.mjs";

const SKILL = fileURLToPath(new URL("../../", import.meta.url));
const GSAP = join(SKILL, "node_modules", "gsap", "dist", "gsap.min.js");
const CHROME_DEPS = join(homedir(), ".local", "lib", "chrome-deps"); // 无 sudo 时手动解压的 Chrome 运行库（同 bin/nv）

let chrome = null;
try {
  chrome = findChrome();
} catch {
  chrome = null;
}
export const CHROME_SKIP = chrome ? false : "找不到 Chrome，跳过浏览器测试（设置 CHROME_PATH 或安装 chrome-headless-shell）";

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;width:1080px;height:1920px;background:#101114}</style></head>
<body><div id="host" style="position:absolute;left:60px;top:300px;width:960px"></div></body></html>`;

/** @param {{ files: string[] }} o hf-kit/ 下的文件名，按顺序加载 */
export async function openKitPage({ files }) {
  if (!chrome) return null;
  const env = { ...process.env };
  if (existsSync(CHROME_DEPS)) env.LD_LIBRARY_PATH = CHROME_DEPS + (env.LD_LIBRARY_PATH ? `:${env.LD_LIBRARY_PATH}` : "");
  const browser = await puppeteer.launch({ executablePath: chrome, args: ["--no-sandbox"], env });
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1920 });
  await page.setContent(PAGE);
  await page.addScriptTag({ path: GSAP });
  for (const f of files) await page.addScriptTag({ path: join(SKILL, "hf-kit", f) });
  return { page, close: () => browser.close() };
}
```

- [ ] **Step 3: 写失败的测试 `tests/kit-browser.test.mjs`**

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { CHROME_SKIP, openKitPage } from "./helpers/kit-page.mjs";

const opt = { skip: CHROME_SKIP, timeout: 30000 };

test("kit-glow：Kit.look 变成 glow，玻璃卡片和质感层样式生效", opt, async () => {
  const k = await openKitPage({ files: ["kit.js", "kit-glow.js"] });
  try {
    const r = await k.page.evaluate(() => {
      const tl = gsap.timeline({ paused: true });
      Kit.compare(tl, "#host", { bad: { tag: "a", text: "x" }, good: { tag: "b", text: "y" }, at: [0, 0] });
      tl.seek(2);
      const atmo = document.createElement("div");
      atmo.className = "kit-atmo";
      document.body.appendChild(atmo);
      const card = getComputedStyle(document.querySelector(".kit-card.good"));
      const bad = getComputedStyle(document.querySelector(".kit-card.bad"));
      return {
        look: Kit.look,
        radius: card.borderTopLeftRadius,
        glow: card.boxShadow !== bad.boxShadow && card.boxShadow.split("px").length > bad.boxShadow.split("px").length, // 好卡多一层外发光
        atmoBefore: getComputedStyle(atmo, "::before").backgroundImage.startsWith("radial-gradient"),
        atmoAfter: getComputedStyle(atmo, "::after").backgroundImage.includes("data:image/svg+xml"),
      };
    });
    assert.deepEqual(r, { look: "glow", radius: "32px", glow: true, atmoBefore: true, atmoAfter: true });
  } finally {
    await k.close();
  }
});

test("kit-glow：没加载时 Kit.look 是 flat，卡片不变", opt, async () => {
  const k = await openKitPage({ files: ["kit.js"] });
  try {
    const r = await k.page.evaluate(() => {
      const tl = gsap.timeline({ paused: true });
      Kit.compare(tl, "#host", { bad: { tag: "a", text: "x" }, good: { tag: "b", text: "y" }, at: [0, 0] });
      return { look: Kit.look, radius: getComputedStyle(document.querySelector(".kit-card")).borderTopLeftRadius };
    });
    assert.deepEqual(r, { look: "flat", radius: "0px" });
  } finally {
    await k.close();
  }
});

test("marker：glow 下是不透明笔触，涂完关键词变深色字", opt, async () => {
  const k = await openKitPage({ files: ["kit.js", "kit-glow.js"] });
  try {
    const r = await k.page.evaluate(() => {
      const tl = gsap.timeline({ paused: true });
      Kit.marker(tl, "#host", { text: "写未明确", key: "未明确", at: 0.2 });
      tl.seek(3);
      const key = document.querySelector(".kit-key");
      return { opacity: getComputedStyle(key.querySelector("path")).opacity, color: getComputedStyle(key).color };
    });
    assert.equal(r.opacity, "0.92");
    assert.equal(r.color, "rgb(17, 17, 17)"); // 默认 token bg #111111
  } finally {
    await k.close();
  }
});
```

- [ ] **Step 4: 运行，确认失败**

Run: `cd skills/narrated-video && node --test tests/kit-browser.test.mjs`
Expected: 第 1、3 个 FAIL（`kit-glow.js` 不存在 / opacity 是 `0.32`），第 2 个 FAIL（`Kit.look` 是 `undefined`）。如果三个都显示 skipped，说明找不到 Chrome：先运行 `ls ~/.cache/hyperframes/chrome/chrome-headless-shell/*/*/chrome-headless-shell` 确认，再继续。

- [ ] **Step 5: `kit.js` 加 `Kit.look` 和 marker 的 glow 笔触**

5a. 在 `window.Kit = Kit;` 前一行加：

```js
  Kit.look = "flat"; // 加载 kit-glow.js 后变成 "glow"，组件按它切换笔触
```

5b. `Kit.marker` 里，从 `var under = o.style === "underline";` 到函数结尾替换为：

```js
    var under = o.style === "underline";
    var glow = Kit.look === "glow" && !under; // glow：不透明荧光笔笔触，涂完后关键词变深色字
    var svg = svgEl("svg", { viewBox: "0 0 100 40", preserveAspectRatio: "none" }, key);
    svg.style.cssText = under
      ? "left:-2%;width:104%;top:88%;height:18%"
      : glow
        ? "left:-6%;width:112%;top:8%;height:96%;transform:rotate(-1.2deg)"
        : "left:-4%;width:108%;top:50%;height:45%";
    var path = svgEl("path", {
      d: under ? "M 2 20 C 24 14, 52 26, 98 16" : glow ? "M 3 21 C 30 17, 62 24, 97 18" : "M 2 22 C 26 17, 58 26, 98 19",
      fill: "none",
      stroke: T.accent,
      "stroke-width": under ? 9 : glow ? 32 : 36,
      "stroke-linecap": "round",
    }, svg);
    path.style.opacity = 0;
    if (glow) {
      path.style.filter = "drop-shadow(0 0 14px " + T.accent + ")";
      key.style.textShadow = "none";
    }
    drawOn(tl, path, at, 0.5, under ? 1 : glow ? 0.92 : 0.32);
    if (glow) tl.fromTo(key, { color: T.accent }, { color: T.bg, duration: 0.2, ease: "none" }, at + 0.15);
```

- [ ] **Step 6: 写 `hf-kit/kit-glow.js`**

```js
/*
 * hf-kit「glow」质感层：光晕 + 点阵颗粒底色、HUD 四角和进度条、玻璃卡片皮肤。
 * 在 kit.js 之后引用（帧模板在 hfKit.look 为 "glow" 时自动引用）。只读 --kit-* 变量，不写死品牌色。
 * 类名约定见 scripts/lib/frame-build.mjs：kit-atmo（is-accent）、kit-hud、kit-progress、kit-kicker、kit-chip、kit-glass-panel、kit-label。
 * 帧模板里的同名元素也有自己的类样式，所以这些钩子用双类名（.kit-chip.kit-chip）提高优先级。
 */
(function () {
  "use strict";
  if (!window.Kit) throw new Error("kit-glow.js 要在 kit.js 之后引用");
  if (window.Kit.look === "glow") return;
  window.Kit.look = "glow";

  var A = function (pct) { return "color-mix(in srgb,var(--kit-accent) " + pct + "%,transparent)"; };
  var WARM = "color-mix(in srgb,color-mix(in srgb,var(--kit-accent) 60%,#ff7a1a) 8%,transparent)";
  var VIGNETTE = "radial-gradient(1300px 1700px at 50% 42%,transparent 55%,rgb(0 0 0/.65))";
  var GRAIN = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";
  var GLASS = "background:linear-gradient(180deg,rgb(255 255 255/.07),rgb(255 255 255/.025));border:1.5px solid rgb(255 255 255/.09);border-radius:32px;box-shadow:inset 0 1px 0 rgb(255 255 255/.10),0 40px 100px rgb(0 0 0/.55)";
  var GLOW_EDGE = "border-color:" + A(50) + ";box-shadow:inset 0 1px 0 rgb(255 255 255/.10),0 0 60px " + A(14) + ",0 40px 100px rgb(0 0 0/.55)";

  var css = [
    /* 底色层：光晕在 ::before（压暗叠在最上面），点阵和颗粒在 ::after */
    ".kit-atmo{overflow:hidden}",
    ".kit-atmo::before,.kit-atmo::after{content:'';position:absolute;inset:0;pointer-events:none}",
    ".kit-atmo::before{background:" + VIGNETTE + ",radial-gradient(900px 700px at 88% 8%," + A(13) + ",transparent 60%),radial-gradient(800px 900px at 0% 78%," + WARM + ",transparent 60%),radial-gradient(1200px 800px at 50% 115%," + A(6) + ",transparent 60%)}",
    ".kit-atmo.is-accent::before{background:radial-gradient(1300px 1700px at 50% 42%,transparent 60%,rgb(0 0 0/.28))}",
    ".kit-atmo::after{background-image:radial-gradient(color-mix(in srgb,var(--kit-ink) 7%,transparent) 1.6px,transparent 1.8px)," + GRAIN + ";background-size:48px 48px,300px 300px;opacity:.55;mix-blend-mode:soft-light}",
    ".kit-atmo.is-accent::after{background-image:" + GRAIN + ";background-size:300px 300px;opacity:.35}",
    /* HUD：四角框住内容区（y 200–1160），进度条在角标那一行右边 */
    ".kit-hud{position:absolute;inset:0;pointer-events:none;z-index:4}",
    ".kit-hud .c{position:absolute;width:56px;height:56px;border:0 solid " + A(55) + "}",
    ".kit-hud .tl{left:40px;top:200px;border-width:3px 0 0 3px}",
    ".kit-hud .tr{right:40px;top:200px;border-width:3px 3px 0 0}",
    ".kit-hud .bl{left:40px;top:1104px;border-width:0 0 3px 3px;opacity:.5}",
    ".kit-hud .br{right:40px;top:1104px;border-width:0 3px 3px 0;opacity:.5}",
    ".kit-progress{position:absolute;right:60px;top:264px;display:flex;gap:10px}",
    ".kit-progress i{width:34px;height:6px;border-radius:3px;background:color-mix(in srgb,var(--kit-ink) 16%,transparent)}",
    ".kit-progress i.on{background:var(--kit-accent);box-shadow:0 0 12px " + A(70) + "}",
    ".kit-kicker.kit-kicker{display:flex;align-items:center;gap:14px}",
    ".kit-kicker.kit-kicker::before{content:'';width:36px;height:4px;border-radius:2px;background:currentColor;box-shadow:0 0 10px currentColor}",
    /* 帧模板的标签、录屏标签、计时面板 */
    ".kit-chip.kit-chip{border-radius:99px;padding:8px 22px;box-shadow:0 0 30px " + A(45) + "}",
    ".kit-label.kit-label{border-radius:14px;box-shadow:0 0 30px " + A(40) + "}",
    ".kit-glass-panel.kit-glass-panel{" + GLASS + ";border-left:1.5px solid " + A(55) + "}",
    /* 组件玻璃皮肤 */
    ".kit-card,.kit-prompt,.kit-tpl,.kit-panel,.kit-chain .cd{" + GLASS + "}",
    ".kit-stream{" + GLASS + ";padding:36px 40px}",
    ".kit-tpl,.kit-panel{border-top:1.5px solid " + A(55) + "}",
    ".kit-card.good,.kit-chain .cd:last-child{" + GLOW_EDGE + "}",
    ".kit-shot-win{border-radius:28px;border:1.5px solid rgb(255 255 255/.12);box-shadow:0 40px 100px rgb(0 0 0/.55)}",
    ".kit-prompt .c{box-shadow:0 0 12px var(--kit-accent)}",
    ".kit-steps .ix{border-radius:28px;box-shadow:0 0 30px " + A(45) + "}",
    ".kit-steps .rail i,.kit-chain .ar{box-shadow:0 0 12px " + A(60) + "}",
    ".kit-chk .bx i{box-shadow:0 0 14px " + A(60) + "}",
    ".kit-num,.kit-acc{text-shadow:0 0 40px " + A(35) + "}",
  ].join("\n");

  var style = document.createElement("style");
  style.setAttribute("data-kit-glow", "");
  style.textContent = css;
  document.head.appendChild(style);
})();
```

- [ ] **Step 7: `hf-kit.mjs` 复制附加文件**

在 `const SRC = …` 下面加：

```js
/** 和 kit.js 一起装进工程的文件（不需要写入 token） */
export const KIT_FILES = ["kit-glow.js"];
```

`main()` 里 `writeFileSync(out, …)` 之后加：

```js
  for (const f of KIT_FILES) copyFileSync(join(SKILL_DIR, "hf-kit", f), join(outDir, f));
```

并在 import 里加 `copyFileSync`。完成提示改成 `✓ compositions/kit/kit.js + ${KIT_FILES.join("、")}（品牌色：…）`。

- [ ] **Step 8: 运行，确认通过**

Run: `cd skills/narrated-video && npm test`
Expected: 全部 PASS（浏览器测试 3 个通过，不是 skipped）

- [ ] **Step 9: 提交**

```bash
git add skills/narrated-video/package.json skills/narrated-video/package-lock.json skills/narrated-video/scripts/lib/chrome.mjs skills/narrated-video/hf-kit/kit-glow.js skills/narrated-video/hf-kit/kit.js skills/narrated-video/scripts/hf-kit.mjs skills/narrated-video/tests/helpers/kit-page.mjs skills/narrated-video/tests/kit-browser.test.mjs
git commit -m "feat: hf-kit glow 质感层和玻璃皮肤，荧光笔笔触

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016dF9DwFyHb12AkmwqgPqvC"
```

---

### Task 4: `Kit.chat` 聊天界面

**Files:**
- Create: `skills/narrated-video/hf-kit/kit-scenes.js`
- Modify: `skills/narrated-video/hf-kit/kit.js`（导出 `Kit._u`）
- Modify: `skills/narrated-video/scripts/hf-kit.mjs`（`KIT_FILES` 加 `kit-scenes.js`）
- Modify: `skills/narrated-video/scripts/lib/frame-build.mjs`（每帧引用 `kit-scenes.js`）
- Test: `skills/narrated-video/tests/kit-browser.test.mjs`、`skills/narrated-video/tests/hf.test.mjs`、`tests/fixtures/frame-flat.html`

**Interfaces:**
- Consumes: `openKitPage`、`CHROME_SKIP`（Task 3）
- Produces: `Kit._u = { EASE, el, svgEl, tok, hostOf, num, inFrom, drawOn, boil, wobblyEllipse, hashText, itemsWithTimes }`（kit.js 内部函数原样暴露）
- Produces: `Kit.chat(tl, sel, o)`，`o = { title, count?, staged = true, at = 0, stagger = 0.5, height = 760, size = 34, messages: [{ from, text?, me?, tone?: "bad", doc?: { title, tag?, head?: string[], rows: string[][], mark?: { row, col, at } }, at? }] }`
- Produces（给 Task 5）：kit-scenes.js 内部函数 `ringAround(tl, cell, color, at, seed)`

- [ ] **Step 1: 写失败的测试**

`tests/kit-browser.test.mjs` 末尾追加：

```js
const CHAT = {
  title: "双十一筹备群", count: 5, at: 0, stagger: 0.5,
  messages: [
    { from: "刘总", text: "@你 十分钟后把会议纪要发群里" },
    { from: "我", me: true, doc: { title: "双十一筹备会纪要", tag: "AI 整理", head: ["事项", "负责人", "截止"], rows: [["活动页上线", "小林", "周五"], ["提货点海报重做", "阿杰", "未明确"]], mark: { row: 1, col: 1, at: 1.6 } } },
    { from: "阿杰", text: "？？<b>海报</b> & 我啥时候认领的", tone: "bad" },
  ],
};

test("Kit.chat：消息依次出现，@人高亮，文档卡画红圈，默认标「情景演绎」", opt, async () => {
  const k = await openKitPage({ files: ["kit.js", "kit-scenes.js"] });
  try {
    const r = await k.page.evaluate((o) => {
      const tl = gsap.timeline({ paused: true });
      Kit.chat(tl, "#host", o);
      const vis = () => [...document.querySelectorAll(".kit-chat .msg")].map((m) => Number(getComputedStyle(m).opacity) > 0.5);
      tl.seek(0.3);
      const early = vis();
      tl.seek(4);
      return {
        early, late: vis(),
        staged: document.querySelector(".kit-chat-staged")?.textContent,
        mention: document.querySelector(".kit-chat .bub .kit-acc")?.textContent,
        ring: Number(getComputedStyle(document.querySelector(".kit-chat .doc td .kit-ring path")).opacity),
        bad: document.querySelector(".kit-chat .msg.bad .bub").textContent,
        badHtml: document.querySelector(".kit-chat .msg.bad .bub b") === null,
      };
    }, CHAT);
    assert.deepEqual(r.early, [true, false, false]);
    assert.deepEqual(r.late, [true, true, true]);
    assert.equal(r.staged, "情景演绎");
    assert.equal(r.mention, "@你");
    assert.equal(r.ring, 1);
    assert.equal(r.bad, "？？<b>海报</b> & 我啥时候认领的");
    assert.equal(r.badHtml, true, "消息文字不当成 HTML");
  } finally {
    await k.close();
  }
});

test("Kit.chat：staged false 不显示标签；消息超出高度时整体上推，最后一条在面板里", opt, async () => {
  const k = await openKitPage({ files: ["kit.js", "kit-scenes.js"] });
  try {
    const r = await k.page.evaluate(() => {
      const tl = gsap.timeline({ paused: true });
      const messages = Array.from({ length: 12 }, (_, i) => ({ from: i % 2 ? "小林" : "刘总", text: "第 " + (i + 1) + " 条消息，内容稍微长一点占两行也没关系" }));
      Kit.chat(tl, "#host", { title: "群", staged: false, height: 600, stagger: 0.4, messages });
      tl.seek(10);
      const view = document.querySelector(".kit-chat .view").getBoundingClientRect();
      const last = [...document.querySelectorAll(".kit-chat .msg")].pop().getBoundingClientRect();
      return { staged: !!document.querySelector(".kit-chat-staged"), inside: last.bottom <= view.bottom + 1 && last.top >= view.top };
    });
    assert.deepEqual(r, { staged: false, inside: true });
  } finally {
    await k.close();
  }
});
```

`tests/hf.test.mjs` 末尾追加：

```js
test("帧模板：每帧都引用 kit-scenes.js（在 kit.js 之后）", async () => {
  const { buildFrame } = await import("../scripts/lib/frame-build.mjs");
  const html = buildFrame({ n: 1, id: "01-h", duration: 2, kicker: "K", tokens: FLAT_TOKENS, build: {} });
  assert.match(html, /<script src="compositions\/kit\/kit\.js"><\/script>\s*<script src="compositions\/kit\/kit-scenes\.js"><\/script>/);
  const glow = buildFrame({ n: 1, id: "01-h", duration: 2, kicker: "K", tokens: FLAT_TOKENS, build: {}, look: "glow", total: 2 });
  assert.match(glow, /kit\.js"><\/script>\s*<script src="compositions\/kit\/kit-glow\.js"><\/script>\s*<script src="compositions\/kit\/kit-scenes\.js"><\/script>/);
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `cd skills/narrated-video && npm test`
Expected: 两个 chat 测试 FAIL（`kit-scenes.js` 不存在），`kit-scenes.js` 引用测试 FAIL

- [ ] **Step 3: `kit.js` 暴露内部工具**

在 `Kit.look = "flat";` 下一行加：

```js
  // 给 kit-scenes.js 等扩展文件复用的内部工具（不是对外接口，帧里不要直接用）
  Kit._u = { EASE: EASE, el: el, svgEl: svgEl, tok: tok, hostOf: hostOf, num: num, inFrom: inFrom, drawOn: drawOn, boil: boil, wobblyEllipse: wobblyEllipse, hashText: hashText, itemsWithTimes: itemsWithTimes };
```

- [ ] **Step 4: 写 `hf-kit/kit-scenes.js`（本任务只含 chat）**

```js
/*
 * hf-kit 场景组件：还原上班族熟悉的界面。在 kit.js 之后引用（帧模板自动引用）。
 *   Kit.chat    聊天界面（群聊、@人、文档卡、红圈）——演示场景用，默认标「情景演绎」
 * 只用 fromTo / set，颜色读 --kit-*，渲染可复现。用法和参数见 references/hf-kit.md。
 */
(function () {
  "use strict";
  if (!window.Kit || !window.Kit._u) throw new Error("kit-scenes.js 要在 kit.js 之后引用");
  var Kit = window.Kit;
  var U = Kit._u;
  var el = U.el, num = U.num;
  var AVATAR_COLORS = ["#8FB8FF", "#F4F1EA", "#9BE3B4", "#FFB38A", "#C9A7FF", "#7FDBDA"]; // 头像底色，按人名固定分配
  var MENTION_RE = /@[^\s，。、！？,.!?]+/g;

  injectStyle();

  function injectStyle() {
    var css = [
      ".kit-chat{position:relative;font-family:var(--kit-font);color:var(--kit-ink);background:var(--kit-surface);border:1px solid var(--kit-line);border-radius:36px;overflow:hidden}",
      ".kit-chat .top{height:96px;display:flex;align-items:center;justify-content:center;gap:12px;font-size:32px;font-weight:700;border-bottom:1px solid var(--kit-line)}",
      ".kit-chat .top small{font-weight:500;color:var(--kit-muted)}",
      ".kit-chat-staged{position:absolute;right:24px;top:28px;font-size:22px;font-weight:700;letter-spacing:.08em;color:var(--kit-muted);border:1.5px solid var(--kit-line);border-radius:99px;padding:4px 14px}",
      ".kit-chat .view{position:relative;overflow:hidden}",
      ".kit-chat .list{padding:34px 34px 40px;display:flex;flex-direction:column;gap:32px}",
      ".kit-chat .msg{display:flex;gap:18px;align-items:flex-start}",
      ".kit-chat .msg.me{flex-direction:row-reverse}",
      ".kit-chat .av{flex:none;width:76px;height:76px;border-radius:20px;display:grid;place-items:center;font-size:34px;font-weight:900;color:#101114}",
      ".kit-chat .who{font-size:24px;color:var(--kit-muted);margin-bottom:8px}",
      ".kit-chat .msg.me .who{text-align:right}",
      ".kit-chat .bub{line-height:1.45;padding:18px 26px;border-radius:8px 28px 28px 28px;background:color-mix(in srgb,var(--kit-ink) 9%,transparent);border:1.5px solid color-mix(in srgb,var(--kit-ink) 8%,transparent);max-width:600px;white-space:pre-line}",
      ".kit-chat .msg.me .bub{border-radius:28px 8px 28px 28px}",
      ".kit-chat .msg.bad .bub{background:color-mix(in srgb,var(--kit-danger) 12%,transparent);border-color:color-mix(in srgb,var(--kit-danger) 50%,transparent)}",
      ".kit-chat .doc{width:640px;border-radius:28px 8px 28px 28px;background:color-mix(in srgb,var(--kit-accent) 9%,transparent);border:1.5px solid color-mix(in srgb,var(--kit-accent) 35%,transparent);padding:22px 26px}",
      ".kit-chat .doc .dh{display:flex;align-items:center;gap:12px;font-size:30px;font-weight:900}",
      ".kit-chat .doc .dh small{margin-left:auto;font-size:22px;font-weight:700;color:var(--kit-accent);border:1.5px solid color-mix(in srgb,var(--kit-accent) 50%,transparent);padding:2px 12px;border-radius:99px}",
      ".kit-chat .doc table{width:100%;margin-top:16px;border-collapse:collapse;font-size:31px}",
      ".kit-chat .doc th{text-align:left;font-size:25px;font-weight:500;color:var(--kit-muted);padding:0 6px 8px}",
      ".kit-chat .doc td{position:relative;padding:11px 6px;border-top:1px solid color-mix(in srgb,var(--kit-ink) 10%,transparent)}",
      ".kit-ring{position:absolute;left:-14%;top:-22%;width:128%;height:144%;overflow:visible;pointer-events:none}",
    ].join("\n");
    var style = document.createElement("style");
    style.setAttribute("data-kit-scenes", "");
    style.textContent = css;
    document.head.appendChild(style);
  }

  /** 在一个元素外面画手绘圈（cell 要是定位元素） */
  function ringAround(tl, cell, color, at, seed) {
    var svg = U.svgEl("svg", { class: "kit-ring", viewBox: "0 0 100 100", preserveAspectRatio: "none" }, cell);
    var variants = [0, 1, 2].map(function (k) { return U.wobblyEllipse(50, 50, 47, 44, seed + k * 7); });
    var ring = U.svgEl("path", { d: variants[0], fill: "none", stroke: color, "stroke-width": 4, "stroke-linecap": "round", "vector-effect": "non-scaling-stroke" }, svg);
    ring.style.opacity = 0;
    ring.style.filter = "drop-shadow(0 0 8px " + color + ")";
    var end = U.drawOn(tl, ring, at, 0.5);
    U.boil(tl, ring, variants, end, at + 6);
  }

  /** 文字里的 @某人 用强调色（用文本节点拼，不解析 HTML） */
  function textWithMentions(parent, text) {
    var last = 0, m;
    MENTION_RE.lastIndex = 0;
    while ((m = MENTION_RE.exec(text))) {
      parent.appendChild(document.createTextNode(text.slice(last, m.index)));
      el("span", "kit-acc", parent, m[0]);
      last = m.index + m[0].length;
    }
    parent.appendChild(document.createTextNode(text.slice(last)));
  }

  function avatar(parent, msg, T) {
    var av = el("div", "av", parent, Array.from(msg.from)[0]);
    av.style.background = msg.me
      ? "linear-gradient(135deg," + T.accent + ",color-mix(in srgb," + T.accent + " 70%,#e08a00))"
      : AVATAR_COLORS[U.hashText(msg.from) % AVATAR_COLORS.length];
  }

  function docCard(tl, parent, d, T) {
    var card = el("div", "doc", parent);
    var dh = el("div", "dh", card, d.title);
    if (d.tag) el("small", "", dh, d.tag);
    var table = el("table", "", card);
    if (d.head) {
      var hr = el("tr", "", table);
      d.head.forEach(function (h) { el("th", "", hr, h); });
    }
    var cells = d.rows.map(function (row) {
      var tr = el("tr", "", table);
      return row.map(function (c) { return el("td", "", tr, c); });
    });
    if (d.mark) {
      var cell = cells[d.mark.row] && cells[d.mark.row][d.mark.col];
      if (!cell) throw new Error("Kit.chat: doc.mark 指向不存在的单元格（第 " + d.mark.row + " 行第 " + d.mark.col + " 列，从 0 数）");
      cell.style.fontWeight = "700";
      tl.fromTo(cell, { color: T.ink }, { color: T.danger, duration: 0.2, ease: "none" }, num(d.mark.at, 1));
      ringAround(tl, cell, T.danger, num(d.mark.at, 1), U.hashText(cell.textContent));
    }
  }

  /**
   * 聊天界面：消息按口播一条条弹出，超出高度时整体上推。
   * { title, count, staged=true, at=0, stagger=0.5, height=760, size=34,
   *   messages:[{ from, text, me, tone:"bad", doc:{ title, tag, head, rows, mark:{row,col,at} }, at }] }
   * 这是演示场景，默认在角上标「情景演绎」；AI 的回答不要用它伪造，用 Kit.answer 放实测原文。
   */
  Kit.chat = function (tl, sel, o) {
    var host = U.hostOf(sel);
    var T = U.tok(host);
    var size = num(o.size, 34);
    var box = el("div", "kit kit-chat", host);
    var top = el("div", "top", box, o.title || "");
    if (o.count) el("small", "", top, "(" + o.count + ")");
    if (o.staged !== false) el("div", "kit-chat-staged", box, "情景演绎");
    var view = el("div", "view", box);
    view.style.height = num(o.height, 760) - 96 + "px";
    var list = el("div", "list", view);
    U.inFrom(tl, box, Math.max(0, num(o.at, 0) - 0.3), 30);

    var items = U.itemsWithTimes(o.messages, num(o.at, 0), num(o.stagger, 0.5));
    var nodes = items.map(function (x) {
      var m = x.o;
      var row = el("div", "msg" + (m.me ? " me" : "") + (m.tone === "bad" ? " bad" : ""), list);
      avatar(row, m, T);
      var col = el("div", "", row);
      el("div", "who", col, m.from);
      if (m.doc) docCard(tl, col, m.doc, T);
      if (m.text != null) {
        var bub = el("div", "bub", col);
        bub.style.fontSize = size + "px";
        textWithMentions(bub, m.text);
      }
      return row;
    });

    // 布局定了再量：每条消息出现时，如果底部超出可视区就把列表往上推
    var viewH = view.clientHeight, pad = 40, shift = 0;
    nodes.forEach(function (row, i) {
      var at = items[i].at;
      tl.fromTo(row, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.35, ease: U.EASE }, at);
      var need = Math.max(0, row.offsetTop + row.offsetHeight + pad - viewH);
      if (need > shift) {
        tl.fromTo(list, { y: -shift }, { y: -need, duration: 0.35, ease: U.EASE }, at);
        shift = need;
      }
    });
  };

  Kit._scenes = { ringAround: ringAround };
})();
```

- [ ] **Step 5: 装进工程、帧模板引用**

`scripts/hf-kit.mjs`：

```js
export const KIT_FILES = ["kit-glow.js", "kit-scenes.js"];
```

`scripts/lib/frame-build.mjs` 返回模板里，在 glow 那行条件插入**之后**加一行（这样 Task 2 的「kit.js 后面紧跟 kit-glow.js」测试仍然成立）：

```js
    <script src="compositions/kit/kit.js"></script>
${glow ? '    <script src="compositions/kit/kit-glow.js"></script>\n' : ""}    <script src="compositions/kit/kit-scenes.js"></script>
    <script>
```

- [ ] **Step 6: 重新生成 flat 快照**

flat 的输出多了一行 `kit-scenes.js` 引用，这是预期的改动。重跑 Task 2 Step 1 的命令覆盖 `tests/fixtures/frame-flat.html`，然后运行：

Run: `git diff --stat skills/narrated-video/tests/fixtures/frame-flat.html && git diff skills/narrated-video/tests/fixtures/frame-flat.html | grep '^[+-] ' `
Expected: 只有两行新增 `+    <script src="compositions/kit/kit-scenes.js"></script>`，没有其他差异

- [ ] **Step 7: 运行，确认通过**

Run: `cd skills/narrated-video && npm test`
Expected: 全部 PASS

- [ ] **Step 8: 提交**

```bash
git add skills/narrated-video/hf-kit/kit-scenes.js skills/narrated-video/hf-kit/kit.js skills/narrated-video/scripts/hf-kit.mjs skills/narrated-video/scripts/lib/frame-build.mjs skills/narrated-video/tests
git commit -m "feat: hf-kit 新增 Kit.chat 聊天界面组件

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016dF9DwFyHb12AkmwqgPqvC"
```

---

### Task 5: `Kit.answer` 重建 AI 回答

**Files:**
- Modify: `skills/narrated-video/hf-kit/kit-scenes.js`
- Test: `skills/narrated-video/tests/kit-browser.test.mjs`

**Interfaces:**
- Consumes: `Kit._u`（Task 4）、kit-scenes.js 内的 `ringAround`、`injectStyle`（Task 4）
- Produces: `Kit.answer(tl, sel, o)`，`o = { app = "DeepSeek", source（必填）, blocks: [{ h } | { p } | { table: { head?, rows } }], at = 0, size = 27, focus?: { row, col?, at, note?, noteAt? } }`；`focus.row` 从 0 数，指第一个表格的数据行

- [ ] **Step 1: 写失败的测试**

`tests/kit-browser.test.mjs` 末尾追加：

```js
const ANSWER = {
  source: "DeepSeek 原话 · 实测第 1 轮",
  blocks: [
    { h: "二、待办事项" },
    { table: { head: ["事项", "负责人", "截止时间"], rows: [["活动页出图", "阿杰", "周四下午（最晚）"], ["活动页上线", "小林", "周五"], ["向供应商确认猪肉能否保证量", "王杰", "尽快（未明确具体时间）"]] } },
  ],
  at: 0,
  focus: { row: 2, col: 1, at: 1, note: "其实是「王姐」" },
};

test("Kit.answer：focus 之后面板虚化、那一行放大浮出、圈出单元格、贴便签", opt, async () => {
  const k = await openKitPage({ files: ["kit.js", "kit-scenes.js"] });
  try {
    const r = await k.page.evaluate((o) => {
      const tl = gsap.timeline({ paused: true });
      Kit.answer(tl, "#host", o);
      const lensOp = () => Number(getComputedStyle(document.querySelector(".kit-ans-lens")).opacity);
      tl.seek(0.6);
      const before = { lens: lensOp(), filter: getComputedStyle(document.querySelector(".kit-ans")).filter };
      tl.seek(4);
      return {
        before,
        lens: lensOp(),
        filter: getComputedStyle(document.querySelector(".kit-ans")).filter,
        lensText: document.querySelector(".kit-ans-lens .line").textContent,
        source: document.querySelector(".kit-ans-lens .src").textContent,
        ring: Number(getComputedStyle(document.querySelector(".kit-ans-lens .kit-ring path")).opacity),
        note: document.querySelector(".kit-ans-note").textContent,
        rows: document.querySelectorAll(".kit-ans tbody tr, .kit-ans table tr").length,
      };
    }, ANSWER);
    assert.equal(r.before.lens, 0);
    assert.doesNotMatch(r.before.filter, /blur\(1\.6px\)/); // fromTo 会先把 filter 设成起点值 blur(0px)
    assert.equal(r.lens, 1);
    assert.match(r.filter, /blur\(1\.6px\)/);
    assert.equal(r.lensText, "向供应商确认猪肉能否保证量王杰尽快（未明确具体时间）");
    assert.match(r.source, /DeepSeek 原话 · 实测第 1 轮/);
    assert.equal(r.ring, 1);
    assert.equal(r.note, "其实是「王姐」");
  } finally {
    await k.close();
  }
});

test("Kit.answer：缺 source、focus 行超出、focus 但没有表格，都报中文错误", opt, async () => {
  const k = await openKitPage({ files: ["kit.js", "kit-scenes.js"] });
  try {
    const errs = await k.page.evaluate((o) => {
      const run = (opts) => { try { Kit.answer(gsap.timeline({ paused: true }), "#host", opts); return "ok"; } catch (e) { return e.message; } };
      return [
        run({ ...o, source: undefined }),
        run({ ...o, focus: { row: 3, at: 1 } }),
        run({ source: "x", blocks: [{ p: "一段话" }], focus: { row: 0, at: 1 } }),
        run({ source: "x", blocks: [{ p: "没有 focus 也可以" }] }),
      ];
    }, ANSWER);
    assert.match(errs[0], /缺少 source/);
    assert.match(errs[1], /focus\.row 超出表格行数（共 3 行，从 0 数）/);
    assert.match(errs[2], /focus 需要 blocks 里有表格/);
    assert.equal(errs[3], "ok");
  } finally {
    await k.close();
  }
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `cd skills/narrated-video && node --test tests/kit-browser.test.mjs`
Expected: 两个 answer 测试 FAIL（`Kit.answer is not a function`）

- [ ] **Step 3: 实现**

3a. `kit-scenes.js` 文件头注释的组件列表加一行：

```js
 *   Kit.answer  重建 AI 回答（实测原文，可推近到表格某一行）
```

3b. `injectStyle()` 的 `css` 数组末尾追加：

```js
      ".kit-ans-stage{position:relative;perspective:2200px}",
      ".kit-ans{position:relative;font-family:var(--kit-font);color:var(--kit-ink);background:var(--kit-surface);border:1px solid var(--kit-line);border-radius:32px;overflow:hidden;transform:rotateX(6deg) rotateY(-8deg) scale(.96);transform-origin:50% 0}",
      ".kit-ans .bar{height:84px;display:flex;align-items:center;gap:14px;padding:0 30px;border-bottom:1px solid var(--kit-line);font-weight:700}",
      ".kit-ans .logo,.kit-ans-lens .logo{flex:none;width:40px;height:40px;border-radius:50%}",
      ".kit-ans .body{padding:26px 34px 30px;line-height:1.6}",
      ".kit-ans h4{margin:6px 0 12px;font-size:1.2em}",
      ".kit-ans p{margin:0 0 12px;white-space:pre-line}",
      ".kit-ans table{width:100%;border-collapse:collapse}",
      ".kit-ans td,.kit-ans th{text-align:left;padding:12px 8px;border-bottom:1px solid color-mix(in srgb,var(--kit-ink) 10%,transparent)}",
      ".kit-ans th{color:var(--kit-muted);font-weight:500}",
      ".kit-ans-lens{position:absolute;left:20px;right:0;padding:28px 34px 34px;border-radius:32px;background:var(--kit-surface);border:2px solid color-mix(in srgb,var(--kit-accent) 55%,transparent);box-shadow:0 0 0 10px color-mix(in srgb,var(--kit-accent) 6%,transparent),0 0 80px color-mix(in srgb,var(--kit-accent) 18%,transparent),0 50px 120px rgb(0 0 0/.7)}",
      ".kit-ans-lens .src{display:flex;align-items:center;gap:12px;font-size:27px;color:var(--kit-muted);letter-spacing:.06em}",
      ".kit-ans-lens .line{display:grid;gap:20px;align-items:center;margin-top:18px;font-size:44px;font-weight:700;line-height:1.35}",
      ".kit-ans-lens .line>span{position:relative}",
      ".kit-ans-note{position:absolute;right:-6px;top:-74px;transform:rotate(4deg);background:var(--kit-danger);color:#fff;font-size:30px;font-weight:900;padding:10px 22px;border-radius:14px;white-space:nowrap}",
```

3c. 在 `Kit._scenes = …` 之前加：

```js
  var APPS = { DeepSeek: "#4D6BFE" }; // 头部 logo 色；新增应用在这里加

  function answerBlocks(body, blocks) {
    var table = null;
    blocks.forEach(function (b) {
      if (b.h != null) el("h4", "", body, b.h);
      else if (b.p != null) el("p", "", body, b.p);
      else if (b.table) {
        var t = el("table", "", body);
        if (b.table.head) {
          var hr = el("tr", "", t);
          b.table.head.forEach(function (h) { el("th", "", hr, h); });
        }
        var rows = b.table.rows.map(function (r) {
          var tr = el("tr", "", t);
          r.forEach(function (c) { el("td", "", tr, c); });
          return tr;
        });
        if (!table) table = { el: t, rows: rows, data: b.table.rows };
      }
    });
    return table;
  }

  /**
   * 重建 AI 回答：用实测记录里的原文排成清楚的回答界面；focus 时面板虚化，那一行放大浮出并圈出单元格。
   * { app="DeepSeek", source（必填）, blocks:[{h}|{p}|{table:{head,rows}}], at=0, size=27,
   *   focus:{ row（从 0 数）, col, at, note, noteAt } }
   * 文字必须是实测原文，source 写清出处（如「DeepSeek 原话 · 实测第 1 轮」）。
   */
  Kit.answer = function (tl, sel, o) {
    if (!o.source) throw new Error("Kit.answer: 缺少 source（写明出处，如「DeepSeek 原话 · 实测第 1 轮」）");
    var host = U.hostOf(sel);
    var T = U.tok(host);
    var app = o.app || "DeepSeek";
    var logoColor = APPS[app] || T.accent;
    var at = num(o.at, 0);
    var stage = el("div", "kit kit-ans-stage", host);
    var panel = el("div", "kit-ans", stage);
    panel.style.fontSize = num(o.size, 27) + "px";
    var bar = el("div", "bar", panel);
    el("i", "logo", bar).style.background = logoColor;
    el("span", "", bar, app);
    var table = answerBlocks(el("div", "body", panel), o.blocks || []);
    U.inFrom(tl, panel, at, 40);
    if (!o.focus) return;

    var f = o.focus;
    if (!table) throw new Error("Kit.answer: focus 需要 blocks 里有表格");
    var data = table.data[f.row];
    if (!data) throw new Error("Kit.answer: focus.row 超出表格行数（共 " + table.data.length + " 行，从 0 数）");
    var fAt = num(f.at, at + 1);
    tl.fromTo(panel, { filter: "blur(0px) brightness(1)" }, { filter: "blur(1.6px) brightness(0.62)", duration: 0.4, ease: "none" }, fAt);

    var lens = el("div", "kit-ans-lens", stage);
    var rowEl = table.rows[f.row];
    lens.style.top = Math.max(0, table.el.offsetTop + rowEl.offsetTop - 60) + "px"; // table 相对面板（已含头部高度），tr 相对 table；浮在原来那一行附近
    var src = el("div", "src", lens);
    el("i", "logo", src).style.background = logoColor;
    el("span", "", src, o.source);
    var line = el("div", "line", lens);
    line.style.gridTemplateColumns = "1fr" + " auto".repeat(data.length - 1);
    var cells = data.map(function (c) { return el("span", "", line, c); });
    tl.fromTo(lens, { opacity: 0, scale: 0.92, y: 20 }, { opacity: 1, scale: 1, y: 0, duration: 0.45, ease: U.EASE }, fAt + 0.1);
    if (f.col != null) {
      var cell = cells[f.col];
      if (!cell) throw new Error("Kit.answer: focus.col 超出列数（共 " + data.length + " 列，从 0 数）");
      cell.style.color = T.danger;
      ringAround(tl, cell, T.danger, fAt + 0.5, U.hashText(cell.textContent));
    }
    if (f.note) {
      var note = el("div", "kit-ans-note", lens, f.note);
      tl.fromTo(note, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.3, ease: U.EASE }, num(f.noteAt, fAt + 0.7));
    }
  };
```

- [ ] **Step 4: 运行，确认通过**

Run: `cd skills/narrated-video && npm test`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add skills/narrated-video/hf-kit/kit-scenes.js skills/narrated-video/tests/kit-browser.test.mjs
git commit -m "feat: hf-kit 新增 Kit.answer 重建 AI 回答组件

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016dF9DwFyHb12AkmwqgPqvC"
```

---

### Task 6: 字幕样式

**Files:**
- Modify: `06-品牌资产/hyperframes/caption-skin.html`（`.caption-pill` 到 `.caption-word.is-spoken` 这一段，约第 75–125 行）

**Interfaces:**
- Consumes: 无（字幕引擎读这个文件，类名 `.caption-pill`、`.caption-word`、`.is-active`、`.is-spoken`、`.cap-key` 不能改）
- Produces: 新外观；字幕带位置 `--cap-douyin-top: 1180px`、`--cap-douyin-height: 260px` 不变

- [ ] **Step 1: 改样式**

把 `.caption-pill { … }` 整块替换为：

```css
  /* 「边学边用 AI」glow 版：不要底板，粗白字 + 深色阴影，在任何画面上都清楚 */
  .caption-pill {
    max-width: 80%;
    padding: 0 20px;
    background: none;
    border: 0;
  }
```

`.caption-line` 里把 `font-size: clamp(38px, 4.2vw, 56px);` 改为 `font-size: 60px;`，`line-height: 1.02;` 改为 `line-height: 1.3;`，并在块末尾加：

```css
    text-shadow: 0 4px 18px rgb(0 0 0 / 0.9), 0 0 2px rgb(0 0 0 / 0.8);
```

把 `.caption-word` 的 `color: color-mix(...42%...)` 改为：

```css
    color: color-mix(in srgb, var(--cap-canvas, #f0ece5) 45%, transparent);
```

把重点词两块替换为：

```css
  /* 重点词（字幕「词」以 * 开头）：说到时变荧光黄并发光，说完保持荧光黄 */
  .caption-word.cap-key.is-active,
  .caption-word.cap-key.is-spoken {
    color: var(--cap-accent, #e85d26);
    background: none;
    box-shadow: none;
    text-shadow: 0 4px 18px rgb(0 0 0 / 0.9), 0 0 28px color-mix(in srgb, var(--cap-accent, #e85d26) 55%, transparent);
  }
```

`.caption-word.is-spoken` 块保持不变（纸白、无底色）。文件头注释里描述「ink-black plate」的那几行改成一句：`Visual（边学边用 AI · glow）：无底板，900 粗白字带深色阴影；还没说到的词半透明，重点词说到时变荧光黄并发光。`

- [ ] **Step 2: 检查**

Run: `grep -n "cap-douyin-top\|cap-douyin-height\|caption-pill\|cap-key" 06-品牌资产/hyperframes/caption-skin.html`
Expected: 字幕带两个变量值仍是 `1180px` / `260px`；`.caption-pill` 只有一处定义；`cap-key` 只剩合并后的一块。画面效果在 Task 8 用第 4 课验证。

- [ ] **Step 3: 提交**

```bash
git add 06-品牌资产/hyperframes/caption-skin.html
git commit -m "feat: 字幕去掉底板，改粗白字加阴影，重点词荧光黄发光

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016dF9DwFyHb12AkmwqgPqvC"
```

---

### Task 7: 文档和模板

**Files:**
- Modify: `skills/narrated-video/references/hf-kit.md`
- Modify: `skills/narrated-video/references/douyin-recipe.md`（「帧模板」一节，约第 107–137 行）
- Modify: `06-品牌资产/视觉规范.md`
- Modify: `06-品牌资产/hyperframes/frame.md`（「账号适配」一节）
- Modify: `05-模板/抖音/STORYBOARD模板.md`（`negative list` 那一行）
- Modify: `docs/superpowers/specs/2026-10-06-video-glow-redesign-design.md`（3.1、3.2 节）

**Interfaces:**
- Consumes: Task 1–6 的名字：`hfKit.look`、`kit-glow.js`、`kit-scenes.js`、`Kit.chat` / `Kit.answer` 参数（按 Task 4、5 的 Interfaces 原样写）

- [ ] **Step 1: `references/hf-kit.md`**

1a. 开头「组件源码」那行改为：

```markdown
- 组件源码：`hf-kit/kit.js`（14 个基础组件）、`hf-kit/kit-scenes.js`（场景组件 `chat`、`answer`）、`hf-kit/kit-glow.js`（glow 质感层和玻璃皮肤）
- 视觉风格：项目配置 `hfKit.look`：`"flat"`（默认，纯色底）或 `"glow"`（光晕颗粒底色、HUD 四角和进度条、玻璃卡片、荧光笔笔触）。帧模板会按配置自动引用 `kit-glow.js`；**手写的帧要自己加** `<script src="compositions/kit/kit-glow.js"></script>`（放在 kit.js 之后），并给底色元素加 `class="kit-atmo"`
```

1b. 选用表在「真实截图里的证据」那行前面加两行：

```markdown
| 开头的工作场景（领导 @你、同事回消息） | `Kit.chat` 聊天界面 | 群里刘总 @你要纪要 → 你发出 AI 写的纪要 → 阿杰「？？」（默认标「情景演绎」） |
| AI 的回答（尤其是表格），要指出其中某一行 | `Kit.answer` 重建 AI 回答 | DeepSeek 待办表，推近到「王杰」那一行，圈出并贴「其实是王姐」 |
```

1c. 使用规则第 5 条后面加：

```markdown
5a. `Kit.chat` 是**演示场景**，默认显示「情景演绎」；只有对话全部来自真实记录时才写 `staged: false`。**不要用 chat 伪造 AI 的回答**，AI 的回答用 `Kit.answer` 放实测原文，`source` 写清是第几轮实测。
```

1d. 参数表末尾加两行：

```markdown
| `Kit.chat` | `title` 群名、`count` 人数、`staged`=true、`at`=0、`stagger`=0.5、`height`=760（面板总高，消息超出时自动上推）、`size`=34、`messages`=[{`from`,`text`,`me`,`tone`:`"bad"`,`doc`:{`title`,`tag`,`head`,`rows`,`mark`:{`row`,`col`,`at`}},`at`}]。`text` 里的 `@某人` 自动高亮；`mark` 的行列从 0 数 |
| `Kit.answer` | `source`（必填，出处）、`app`=`"DeepSeek"`、`blocks`=[{`h`}\|{`p`}\|{`table`:{`head`,`rows`}}]、`at`=0、`size`=27、`focus`={`row`（第一个表格的数据行，从 0 数）,`col`,`at`,`note`,`noteAt`}。`focus` 时面板虚化、那一行放大浮出 |
```

- [ ] **Step 2: `references/douyin-recipe.md`**

「帧模板」一节的 build 示例列表末尾加：

```markdown
- build: {"kicker":false,"kit":{"name":"chat","top":300,"opts":{"title":"双十一筹备群","count":5,"height":820,"messages":[{"from":"刘总","text":"@你 十分钟后把会议纪要发群里","at":0.1},{"from":"我","me":true,"doc":{"title":"双十一筹备会纪要","tag":"AI 整理","head":["事项","负责人","截止"],"rows":[["提货点海报重做","阿杰","未明确"]],"mark":{"row":0,"col":1,"at":"@派给了"}},"at":"@AI"},{"from":"阿杰","text":"？？海报我啥时候认领的","tone":"bad","at":"@同事"}]}}}
- build: {"lead":{"text":"它踩了 **3 个坑**","top":300},"kit":{"name":"answer","top":400,"opts":{"source":"DeepSeek 原话 · 实测第 1 轮","blocks":[{"h":"二、待办事项"},{"table":{"head":["事项","负责人","截止时间"],"rows":[["……实测原文……"]]}}],"focus":{"row":2,"col":1,"at":"@抄错","note":"其实是「王姐」"}}}}
```

并在示例前加一段说明：

```markdown
**钩子帧优先用 `chat`**：把痛点演成上班族熟悉的聊天（默认标「情景演绎」）。**实测结果优先用 `answer`**（实测原文重建，字清楚、能推近到一行），只有要证明「真的跑过」时才放录屏或截图。项目配置 `hfKit.look: "glow"` 时所有帧自动带光晕底色、HUD 和玻璃卡片。
```

- [ ] **Step 3: `06-品牌资产/视觉规范.md`**

在「字号」一节后面加：

```markdown
## 视频质感层（glow，`narrated-video.config.json` 的 `hfKit.look: "glow"`）

来源：`skills/narrated-video/hf-kit/kit-glow.js`，样稿见 `docs/superpowers/specs/2026-10-06-video-glow-redesign/`。

- 底色：墨黑 + 三处荧光黄 / 暖橙光晕（透明度 ≤ 13%）+ 点阵和细颗粒 + 四周压暗
- HUD：四角括号框住内容区，角标行右边是进度条（当前帧亮）
- 卡片：玻璃质感（半透明渐变、细描边、圆角 32px、投影），重点卡片荧光黄描边并外发光
- 荧光笔：重点词被不透明的荧光黄笔触划过，字变墨黑
- 出错：用 `--danger` `#FF5A5F` 红圈、红便签
- 字幕：无底板，60px 粗白字带深色阴影；重点词荧光黄并发光
- 荧光黄只用来点：重点词、关键数字、一条描边，不大面积铺
```

配色表加一行：`| 警示红 \`--danger\` | \`#FF5A5F\` | 出错、翻车、红圈 |`

- [ ] **Step 4: `06-品牌资产/hyperframes/frame.md` 和 STORYBOARD 模板**

frame.md 的「『边学边用 AI』账号适配」一节末尾加一条：

```markdown
- **视觉风格已改为 glow（2026-10-06 起）。** 原预设「flat plane、无阴影、直角」的说法不再适用：底色有光晕和颗粒，卡片是玻璃质感（圆角、投影、细描边），重点处可以外发光。用帧模板（`- build:`）和 hf-kit 组件即可自动得到这些效果；手写帧见 `skills/narrated-video/references/hf-kit.md` 开头。
```

`05-模板/抖音/STORYBOARD模板.md` 里 `negative list` 那一行改为：

```markdown
- **negative list** — 不要紫蓝「AI 感」配色、回弹缓动、大面积荧光黄（只用来点重点）；不要缩小的录屏或截图当主画面（用 `Kit.answer` 重建，或推近到一行）。
```

- [ ] **Step 5: 回写 spec 的两处差异**

spec 3.1 节「样式放在 `kit.js` 的 `injectStyle()` 里…」那段改为：

```markdown
**样式放在 `hf-kit/kit-glow.js`**（类名 `.kit-atmo`、`.kit-hud` 等），glow 帧自动引用，手写帧加一行 `<script>` 即可；flat 帧完全不加载它。`frame-build` 只负责插入对应元素和类名。
```

spec 3.2 节表格 `compare` 那行改为：

```markdown
| `compare` | 两张卡改玻璃；「好」的那张用 accent 描边发光（「坏」卡不划线不变红：它常放「会上原话」，不一定是错的） |
```

- [ ] **Step 6: 检查**

Run: `grep -n "kit-glow\|Kit.chat\|Kit.answer\|hfKit.look" skills/narrated-video/references/hf-kit.md skills/narrated-video/references/douyin-recipe.md 06-品牌资产/视觉规范.md | wc -l`
Expected: 至少 8 行

Run: `cd skills/narrated-video && npm test`
Expected: 全部 PASS（文档改动不影响测试，确认没误改代码）

- [ ] **Step 7: 提交**

```bash
git add skills/narrated-video/references 06-品牌资产/视觉规范.md 06-品牌资产/hyperframes/frame.md 05-模板/抖音/STORYBOARD模板.md docs/superpowers/specs/2026-10-06-video-glow-redesign-design.md
git commit -m "docs: glow 视觉、Kit.chat、Kit.answer 的用法和品牌规范

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016dF9DwFyHb12AkmwqgPqvC"
```

---

### Task 8: 用第 4 课验证

**Files:**
- Modify: `narrated-video.config.json`（`hfKit.look`、`tokens.danger`）
- Create（复制）: `04-作品/普通人的AI课/04-会议纪要/抖音-glow/`（不提交大文件，`.gitignore` 已排除视频和配音）
- Modify: `04-作品/普通人的AI课/04-会议纪要/抖音-glow/STORYBOARD.md`（第 1、4 帧的 build，Video direction 的 negative list）

**Interfaces:**
- Consumes: 全部前序任务；`nv hf-build <dir> --snap`、`nv render <dir>`、`nv verify <mp4>`

- [ ] **Step 1: 打开 glow 配置**

`narrated-video.config.json` 的 `hfKit` 改为：

```json
  "hfKit": {
    "look": "glow",
    "tokens": {
      "accent": "#FFD84D",
      "ink": "#F4F1EA",
      "muted": "#8A8D96",
      "bg": "#101114",
      "surface": "#1B1D22",
      "line": "#2C2F36",
      "danger": "#FF5A5F"
    }
  },
```

- [ ] **Step 2: 复制第 4 课工程，换新字幕**

```bash
cd "04-作品/普通人的AI课/04-会议纪要"
cp -r 抖音 抖音-glow
rm -rf 抖音-glow/renders 抖音-glow/snapshots 抖音-glow/out
cp ../../../06-品牌资产/hyperframes/caption-skin.html 抖音-glow/.hyperframes/caption-skin.html
```

- [ ] **Step 3: 改第 1、4 帧的 build 和风格说明**

`抖音-glow/STORYBOARD.md`：

第 1 帧 `- build:` 整行替换为（口播：「会上没人认领的活，AI写纪要时，直接派给了同事。」；纪要表格两行来自实测第 1 轮待办表原文）：

```markdown
- build: {"kicker": false, "kit": {"name": "chat", "top": 300, "opts": {"title": "双十一筹备群", "count": 5, "height": 820, "messages": [{"from": "刘总", "text": "@你 十分钟后把会议纪要发群里", "at": 0.1}, {"from": "我", "me": true, "doc": {"title": "双十一筹备会纪要", "tag": "AI 整理", "head": ["事项", "负责人", "截止"], "rows": [["活动页上线", "小林", "周五"], ["提货点海报重新制作", "阿杰", "未明确"]], "mark": {"row": 1, "col": 1, "at": "@派给了"}}, "at": "@AI"}, {"from": "阿杰", "text": "？？海报我啥时候认领的", "tone": "bad", "at": "@同事"}]}}}
```

第 4 帧 `- build:` 整行替换为（口播：「可四个坑它踩了三个：抄错人名，替人派活，没定写成定了。」；表格是实测第 1 轮原始回答的待办表，逐字照抄 `../实测记录.md`）：

```markdown
- build: {"lead": {"text": "4 个坑，它踩了 **3 个**", "top": 300}, "kit": {"name": "answer", "top": 400, "opts": {"source": "DeepSeek 原话 · 实测第 1 轮", "blocks": [{"h": "二、待办事项"}, {"table": {"head": ["事项", "负责人", "截止时间"], "rows": [["活动页出图", "阿杰", "周四下午（最晚）"], ["活动页上线", "小林", "周五"], ["向供应商确认猪肉能否保证量，并在群里同步", "王杰", "尽快（未明确具体时间）"], ["与人事沟通双十一客服加2人事宜", "刘总", "未明确"], ["提货点海报重新制作（与活动页同风格）", "阿杰", "未明确（建议与活动页同步）"], ["预算按3000元执行，根据第一天数据决定是否追加1000元", "刘总", "双十一第一天后"]]}}], "focus": {"row": 2, "col": 1, "at": "@抄错", "note": "其实是「王姐」"}}}}
```

Video direction 里 `negative list` 那一行改成 Task 7 Step 4 给 STORYBOARD 模板的同一句。

- [ ] **Step 4: 生成并检查**

Run: `cd "04-作品/普通人的AI课/04-会议纪要/抖音-glow" && nv hf-build . --snap`
Expected: 最后 `check` 0 错误；输出里「按 build 生成 N 帧（glow）」；铺开度警告数 ≤ 旧版（旧版跑 `grep -c "铺开" ` 不方便的话，直接对比两个 `snapshots/sheet.jpg` 里空的帧数）

用 Read 工具查看 `snapshots/sheet.jpg`，逐帧检查：
- 每帧有光晕底色、四角、进度条（第 1 帧没有角标文字）
- 第 1 帧：聊天三条消息、「阿杰」被红圈、右上「情景演绎」；第 4 帧：表格虚化、「王杰」那一行放大、红圈和「其实是『王姐』」便签
- 没有元素进入字幕带（y 1180 以下）或右侧 150px
- 字幕无底板、可读

有问题就回到对应任务修（参数问题改 STORYBOARD；组件问题改 kit 并补测试），重跑本步。

- [ ] **Step 5: 渲染、成片检查、看颗粒**

```bash
cd "04-作品/普通人的AI课/04-会议纪要/抖音-glow"
time nv render .
ls renders/
```

Expected: 渲染成功，`nv render` 结尾的成片检查全是 ✓（帧数、时长、声音、尺寸、无黑屏）。记录 `time` 的 real 时间。

```bash
f=$(ls -t renders/*.mp4 | head -1); ffmpeg -v error -y -ss 2 -i "$f" -frames:v 1 /tmp/claude-1000/glow-frame.png
```

用 Read 查看这张原尺寸帧：颗粒不应压成明显色块、光晕过渡平滑。若有色块，把 `kit-glow.js` 里 `.kit-atmo::after` 的 `opacity:.55` 降到 `.35` 并重新渲染。

- [ ] **Step 6: 新旧对比发给用户**

```bash
cd "04-作品/普通人的AI课/04-会议纪要"
ffmpeg -v error -y -i 抖音/snapshots/sheet.jpg -i 抖音-glow/snapshots/sheet.jpg -filter_complex "[0]scale=1600:-1[a];[1]scale=1600:-1[b];[a][b]vstack" /tmp/claude-1000/glow-compare.jpg
```

用 SendUserFile 发送 `/tmp/claude-1000/glow-compare.jpg`（上旧下新）和渲染出的 mp4，说明渲染耗时和旧版对比（旧版耗时问用户或标「无记录」）。

- [ ] **Step 7: 提交**

只提交配置和 STORYBOARD（视频、配音、渲染结果由 `.gitignore` 排除；先 `git status` 确认没有大文件进入暂存区）：

```bash
git add narrated-video.config.json "04-作品/普通人的AI课/04-会议纪要/抖音-glow/STORYBOARD.md"
git status --short | head -20
git commit -m "feat: 项目切换到 glow 视觉，第 4 课 glow 版验证工程

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016dF9DwFyHb12AkmwqgPqvC"
```
