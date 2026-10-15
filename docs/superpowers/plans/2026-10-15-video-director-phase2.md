# video-director 第 2 阶段（接入 kv + 抖音专用检查）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `kv status` 按作品的视频做法（director / template）给出正确的步骤和确认节点（③a 导演脚本、③b 风格样片），并新增 `vd qa`：在 headless Chrome 里按 @词 时间点检查抖音安全区、栏目标签遮挡、@词元素可见、2 秒内有变化，输出截图总览。

**Architecture:** 两部分。Part 1 在 video-director 里加 `vd qa`：纯函数检查（`douyin-qa.mjs`）+ 浏览器取数（`inspect-page.mjs`，用工程自己的 `@hyperframes/core` 打包，puppeteer-core 跳时间读元素位置）+ 命令编排，结果写 `qa-douyin.json`。Part 2 在 knowledge-video 里加视频做法：`run.json` 的 `video` 字段决定步骤表，director 做法把「配音 + 分镜」换成「配音 + 导演脚本 ③a」「风格样片 ③b」，成片和指纹改看 `抖音-director/`，渲染步骤要求 `qa-douyin.json` 通过。

**Tech Stack:** Node 22（ESM、`node:test`），puppeteer-core 25.12.0，HyperFrames 0.8.143（`@hyperframes/core/dist/compiler/index.js` 的 `bundleToSingleHtml`、页面里的 `window.__player.renderSeek/getDuration`），ffmpeg（拼总览图）。

**Spec:** `docs/superpowers/specs/2026-10-14-video-director-design.md`（「kv 的改动」「质量检查」「分阶段交付」第 2 行）

## Global Constraints

- 竖屏 1080×1920。安全区：顶部 200、右侧 160、底部 480 像素内无关键内容；字幕带 y 1180–1440 只放字幕（`references/director-rules.md` 第 11 条）
- 确认节点：② 脚本 → ③a 审导演脚本 → ③b 看约 15 秒风格样片 → ④ 成片；改了 `DIRECTOR.md` 或样片后，对应节点自动失效（沿用指纹机制）
- 旧流程保留：template 做法（`nv hf-build`）的 14 步、测试、输出一字不变
- 所有报错、提示用中文；不能静默吞错
- 只在分支 `feat/vd-kv-integration` 上提交，不推送（self-media 只放本地）；提交信息 `feat:` / `fix:` / `docs:` + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- 不提交 `.gitignore` 的未提交改动、作品目录里的视频/配音
- 测试命令：`npm test --prefix skills/video-director`、`npm test --prefix skills/knowledge-video`

## 跟设计文档不同的地方（请审）

1. **`video` 字段放在 `run.json`，不放 `brief.md`**：实用类作品没有 `brief.md`（只有场景卡），`run.json` 两类都有。没有这个字段时按 `template` 处理（老作品不受影响）；新建概念科普的模板写 `"video": "director"`（设计文档：概念科普默认 director），实用类模板写 `"template"`，要用 director 时 `kv init --video director` 或手改。
2. **关键元素在 HTML 里标，不在 DIRECTOR.md 里标**：DIRECTOR.md 不知道元素 id。规则：可见的**文字**默认都是关键内容；非文字的图形要查就加 `data-vd-key`；故意出界/进安全区的加 `data-vd-allow-safe`（在 DIRECTOR.md 写理由）；@词 要出现的元素加 `data-vd-cue="词"`（重复词写 `词#2`）。账号固定元素（`host-brand-*` 里面）不查。
3. **导演工程目录是 `抖音-director/`**（第 1 阶段实际做法），不是设计文档写的 `抖音/`。
4. **出界、安全区只在「落定时刻」查**（每个 @词 后 0.8 秒、每段结尾前 0.3 秒），不在每 0.5 秒查：入场动画从画外滑进来是正常的。
5. **2 秒无变化是 ⚠ 不是 ✗**（和 `nv hf-build --motion` 的静止检查一致），只查口播时段（不含结尾停留）。

## Review Focus

- 老的 `run.json`（没有 `video` 字段、`gates` 里没有 director/sample）：template 做法输出不变；改成 director 后 `kv gate <作品> director "…"` 能记（缺的节点按空节点处理，不报「没有这个确认节点」）
- 还没建 `抖音-director/`、没有 `DIRECTOR.md`、`vd` 命令不存在时：`kv status` 不崩，说清下一步
- `renders/` 里的 `sample.mp4`、`compare.mp4`、`预览-*.mp4` 不算正式成片（④ 指纹、第 10 步都不看它们）
- `vd qa` 时工程里没装 `@hyperframes/core` → 自动装；找不到 Chrome → 中文错误、退出码 1
- `data-vd-cue` 写了 DIRECTOR.md 里没有的词 → ✗ 并列出；样片模式下超出样片时长的 @词 跳过，不误报

---

## Part 1：`vd qa`（video-director）

### Task 1：纯函数检查 `douyin-qa.mjs`

**Files:**
- Create: `skills/video-director/scripts/lib/douyin-qa.mjs`
- Test: `skills/video-director/tests/douyin-qa.test.mjs`

**Interfaces:**
- Consumes: `built`（`buildCues` 的结果）：`built.cues: {[name]: 秒}`（重复词 key 是 `词#2`）、`built.segments: [{id, start, duration}]`、`built.total`（口播结束秒数）
- Produces:
  - `qaTimes(built, duration) → { inspect: [{t, label, cue?}], grid: number[] }`
  - `checkFrame({t, label, data}) → Issue[]`
  - `checkCues(frames, cues) → Issue[]`
  - `stillWindows(grid: [{t, sig}]) → [{from, to}]`
  - `summarize(issues) → Issue[]`（同类同元素合并）
  - `Issue = { level: "error"|"warn", kind: string, sel: string, t: number, msg: string }`
  - 页面数据 `data`（Task 2 产出）：`{ elements: [{sel, text, key, allowSafe, box:[x1,y1,x2,y2], opacity}], cueMarks: [{cue, sel, visible}], kicker: {visible, occludedBy}, sig: string }`

- [ ] **Step 1：写失败测试**

```js
// skills/video-director/tests/douyin-qa.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkCues, checkFrame, qaTimes, stillWindows, summarize } from "../scripts/lib/douyin-qa.mjs";

const built = {
  cues: { 钩子: 1, 小票: 5.5, "小票#2": 9 },
  segments: [{ id: "s1", start: 0, duration: 5 }, { id: "s2", start: 5, duration: 5 }],
  total: 10,
};
const el = (o) => ({ sel: "#a", text: true, key: false, allowSafe: false, box: [100, 400, 500, 500], opacity: 1, ...o });
const frame = (data, t = 1.8, label = "@钩子") => ({ t, label, data: { elements: [], cueMarks: [], kicker: { visible: true, occludedBy: null }, sig: "", ...data } });

test("qaTimes：@词 后 0.8 秒（不超过本段结尾前 0.05 秒）+ 每段结尾前 0.3 秒，按时间排序", () => {
  const { inspect } = qaTimes(built, 12);
  assert.deepEqual(inspect.map((x) => [x.t, x.label]), [
    [1.8, "@钩子"], [4.7, "s1 结尾"], [6.3, "@小票"], [9.7, "s2 结尾"], [9.8, "@小票#2"],
  ].sort((a, b) => a[0] - b[0]));
  assert.equal(inspect.find((x) => x.label === "@小票#2").cue, "小票#2");
});

test("qaTimes：@词 在本段最后 0.8 秒内时，截在段结尾前 0.05 秒", () => {
  const { inspect } = qaTimes({ ...built, cues: { 末尾: 4.6 } }, 12);
  assert.equal(inspect.find((x) => x.cue === "末尾").t, 4.95);
});

test("qaTimes：样片时长之外的 @词 和段不查；grid 每 0.5 秒，只到口播结束", () => {
  const r = qaTimes(built, 6);
  assert.deepEqual(r.inspect.map((x) => x.label), ["@钩子", "s1 结尾"]);
  assert.deepEqual(r.grid, [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5]);
  assert.equal(qaTimes(built, 30).grid.at(-1), 9.5);
});

test("checkFrame：出画面、进顶部 / 右侧 / 底部安全区、压字幕带 → ✗", () => {
  const kinds = (e) => checkFrame(frame({ elements: [el(e)] })).map((i) => i.kind);
  assert.deepEqual(kinds({ box: [-40, 400, 300, 500] }), ["out"]);
  assert.deepEqual(kinds({ box: [100, 150, 500, 260] }), ["top"]);
  assert.deepEqual(kinds({ box: [600, 400, 950, 500] }), ["right"]);
  assert.deepEqual(kinds({ box: [100, 1500, 500, 1560] }), ["bottom"]);
  assert.deepEqual(kinds({ box: [100, 1150, 500, 1200] }), ["caption"]);
  assert.deepEqual(kinds({}), []);
  assert.deepEqual(kinds({ box: [-1, 400, 900, 500] }), [], "2 像素以内的误差不算");
  const msg = checkFrame(frame({ elements: [el({ box: [100, 150, 500, 260] })] }))[0].msg;
  assert.match(msg, /t=1\.8s（@钩子）#a 进了顶部 200 像素/);
});

test("checkFrame：不是文字也没标 data-vd-key 的不查；data-vd-allow-safe 豁免", () => {
  assert.deepEqual(checkFrame(frame({ elements: [el({ text: false, box: [-40, 0, 300, 100] })] })), []);
  assert.equal(checkFrame(frame({ elements: [el({ text: false, key: true, box: [-40, 0, 300, 100] })] })).length, 1);
  assert.deepEqual(checkFrame(frame({ elements: [el({ allowSafe: true, box: [-40, 0, 300, 100] })] })), []);
});

test("checkFrame：栏目标签被挡 → ✗；看不见时不查", () => {
  const i = checkFrame(frame({ kicker: { visible: true, occludedBy: "#s01-card" } }));
  assert.equal(i[0].kind, "kicker");
  assert.match(i[0].msg, /栏目标签被 #s01-card 挡住/);
  assert.deepEqual(checkFrame(frame({ kicker: { visible: false, occludedBy: "#x" } })), []);
});

test("checkCues：@词 时元素看不见 → ✗；写了不存在的词 → ✗；超出时长的跳过", () => {
  const marks = [{ cue: "钩子", sel: "#a", visible: false }, { cue: "没这个", sel: "#b", visible: true }, { cue: "小票#2", sel: "#c", visible: false }];
  const frames = [frame({ cueMarks: marks }, 1.8, "@钩子")];
  frames[0].cue = "钩子";
  const issues = checkCues(frames, built.cues);
  assert.deepEqual(issues.map((i) => [i.kind, i.sel]), [["cue-hidden", "#a"], ["cue-unknown", "#b"]]);
  assert.match(issues[0].msg, /@钩子（t=1\.8s）时 #a 看不见/);
  assert.match(issues[1].msg, /data-vd-cue="没这个" 不是 DIRECTOR\.md 里的 @词/);
});

test("stillWindows：连续 2 秒签名不变 → 一个窗口；不到 2 秒不算", () => {
  const g = (sigs) => sigs.map((sig, i) => ({ t: i * 0.5, sig }));
  assert.deepEqual(stillWindows(g(["a", "b", "b", "b", "b", "b", "c"])), [{ from: 0.5, to: 2.5 }]);
  assert.deepEqual(stillWindows(g(["a", "b", "b", "b", "b", "c"])), []);
});

test("summarize：同一元素同类问题合并成一条，写次数和第一次的时间", () => {
  const issues = [1, 2, 3].map((t) => ({ level: "error", kind: "top", sel: "#a", t, msg: `t=${t}s #a 进了顶部` }));
  const s = summarize(issues);
  assert.equal(s.length, 1);
  assert.match(s[0].msg, /t=1s #a 进了顶部（共 3 处）/);
});
```

- [ ] **Step 2：跑测试确认失败**

Run: `npm test --prefix skills/video-director 2>&1 | grep -E "douyin-qa|Cannot find"`
Expected: FAIL，`Cannot find module '.../douyin-qa.mjs'`

- [ ] **Step 3：实现**

```js
// skills/video-director/scripts/lib/douyin-qa.mjs
// 抖音专用检查（纯函数）：按 @词 落定时刻查出画面、安全区、字幕带、栏目标签遮挡、@词 元素可见；每 0.5 秒比画面签名查 2 秒不动
const W = 1080, H = 1920, TOL = 2;
const SAFE = { top: 200, right: 160, bottom: 480 }; // 平台界面占的边（director-rules 第 11 条）
const CAPTION = { top: 1180, bottom: 1440 }; // 字幕带只放字幕
const SETTLE = 0.8; // @词 后多久算落定
const SEG_TAIL = 0.3; // 每段结尾前多久截一张
const GRID = 0.5;
const STILL = 2;
const r2 = (x) => Math.round(x * 100) / 100;

export function qaTimes(built, duration) {
  const segs = built.segments.map((s) => ({ id: s.id, start: s.start, end: r2(s.start + s.duration) }));
  const inspect = [];
  for (const [cue, at] of Object.entries(built.cues)) {
    const seg = segs.find((s) => at >= s.start && at < s.end);
    const t = r2(Math.min(at + SETTLE, (seg?.end ?? Infinity) - 0.05));
    if (t < duration) inspect.push({ t, label: `@${cue}`, cue });
  }
  for (const s of segs) if (s.end <= duration) inspect.push({ t: r2(s.end - SEG_TAIL), label: `${s.id} 结尾` });
  inspect.sort((a, b) => a.t - b.t);
  const end = Math.min(duration, built.total);
  const grid = [];
  for (let t = 0; t < end; t = r2(t + GRID)) grid.push(t);
  return { inspect, grid };
}

const at = (f) => `t=${f.t}s（${f.label}）`;

export function checkFrame(f) {
  const out = [];
  const add = (kind, sel, what) => out.push({ level: "error", kind, sel, t: f.t, msg: `${at(f)}${sel} ${what}` });
  for (const e of f.data.elements) {
    if (!(e.text || e.key) || e.allowSafe) continue;
    const [x1, y1, x2, y2] = e.box;
    if (x1 < -TOL || y1 < -TOL || x2 > W + TOL || y2 > H + TOL) { add("out", e.sel, "出了画面"); continue; }
    if (y1 < SAFE.top - TOL) add("top", e.sel, `进了顶部 ${SAFE.top} 像素（平台界面）`);
    if (x2 > W - SAFE.right + TOL) add("right", e.sel, `进了右侧 ${SAFE.right} 像素（点赞、评论按钮）`);
    if (y2 > H - SAFE.bottom + TOL) add("bottom", e.sel, `进了底部 ${SAFE.bottom} 像素（标题、文案）`);
    else if (y2 > CAPTION.top + TOL && y1 < CAPTION.bottom - TOL) add("caption", e.sel, `压到字幕带 y ${CAPTION.top}–${CAPTION.bottom}`);
  }
  const k = f.data.kicker;
  if (k.visible && k.occludedBy) out.push({ level: "error", kind: "kicker", sel: k.occludedBy, t: f.t, msg: `${at(f)}栏目标签被 ${k.occludedBy} 挡住` });
  return out;
}

export function checkCues(frames, cues) {
  const out = [];
  const seen = new Set();
  for (const m of frames.flatMap((f) => f.data.cueMarks)) {
    const key = `${m.sel}|${m.cue}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!(m.cue in cues)) {
      out.push({ level: "error", kind: "cue-unknown", sel: m.sel, t: 0, msg: `${m.sel} 的 data-vd-cue="${m.cue}" 不是 DIRECTOR.md 里的 @词` });
      continue;
    }
    const f = frames.find((x) => x.cue === m.cue);
    if (!f) continue; // 超出这次构建的时长（样片）
    const mine = f.data.cueMarks.find((x) => x.sel === m.sel && x.cue === m.cue);
    if (mine && !mine.visible) out.push({ level: "error", kind: "cue-hidden", sel: m.sel, t: f.t, msg: `@${m.cue}（t=${f.t}s）时 ${m.sel} 看不见` });
  }
  return out;
}

export function stillWindows(grid) {
  const out = [];
  let i = 0;
  while (i < grid.length) {
    let j = i;
    while (j + 1 < grid.length && grid[j + 1].sig === grid[i].sig) j++;
    if (grid[j].t - grid[i].t >= STILL) out.push({ from: grid[i].t, to: grid[j].t });
    i = j + 1;
  }
  return out;
}

export function summarize(issues) {
  const groups = new Map();
  for (const i of issues) {
    const key = `${i.kind}|${i.sel}`;
    groups.set(key, [...(groups.get(key) ?? []), i]);
  }
  return [...groups.values()].map((g) => (g.length === 1 ? g[0] : { ...g[0], msg: `${g[0].msg}（共 ${g.length} 处）` }));
}
```

- [ ] **Step 4：跑测试确认通过**

Run: `npm test --prefix skills/video-director 2>&1 | tail -5`
Expected: 全部 pass（含新的 9 个）

- [ ] **Step 5：提交**

```bash
cd /home/power/self-media
git add skills/video-director/scripts/lib/douyin-qa.mjs skills/video-director/tests/douyin-qa.test.mjs
git commit -m "feat: vd 抖音专用检查的判定规则（安全区、字幕带、栏目标签、@词可见、2 秒不动）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2：浏览器取数 `inspect-page.mjs`

**Files:**
- Create: `skills/video-director/scripts/lib/chrome.mjs`（从 `skills/narrated-video/scripts/lib/chrome.mjs` 原样复制，头注释加「与 narrated-video、image-cards 的同名文件保持一致」）
- Create: `skills/video-director/scripts/lib/inspect-page.mjs`
- Modify: `skills/video-director/package.json`（加 `"dependencies": { "puppeteer-core": "25.12.0" }`）
- Test: `skills/video-director/tests/inspect-page.test.mjs`

**Interfaces:**
- Consumes: 无
- Produces:
  - `openPage({ html, root }) → Promise<{ duration: number, frame(t) → Promise<data>, shot(path) → Promise<void>, close() → Promise<void> }>`；`data` 结构见 Task 1
  - 页面要求：`window.__player.getDuration()`、`window.__player.renderSeek(t)`（HyperFrames 运行时提供；测试里用假的）

- [ ] **Step 1：装依赖**

```bash
cd /home/power/self-media/skills/video-director
npm pkg set dependencies.puppeteer-core=25.12.0 && npm i --no-audit --no-fund
cp ../narrated-video/scripts/lib/chrome.mjs scripts/lib/chrome.mjs
```

把 `scripts/lib/chrome.mjs` 第一行注释末尾「与 image-cards 的同名文件保持一致」改成「与 narrated-video、image-cards 的同名文件保持一致」。

- [ ] **Step 2：写失败测试**

```js
// skills/video-director/tests/inspect-page.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { findChrome } from "../scripts/lib/chrome.mjs";
import { openPage } from "../scripts/lib/inspect-page.mjs";
import { project } from "./helpers.mjs";

let chrome = null;
try { chrome = findChrome(); } catch { chrome = null; }

// 假的 HyperFrames 页面：renderSeek(t) 按时间改样式
const HTML = `<!doctype html><html><body style="margin:0;width:1080px;height:1920px;position:relative;background:#111">
<div id="host-brand-kicker" style="position:absolute;inset:0"><div id="bk-label" style="position:absolute;left:64px;top:228px;width:400px;height:40px;color:#fff">栏目</div></div>
<div id="wrap" style="position:absolute;inset:0;pointer-events:none">
  <div id="a" data-vd-cue="钩子" style="position:absolute;left:100px;top:400px;width:300px;height:60px;opacity:0">钩子</div>
  <div id="b" style="position:absolute;left:100px;top:600px;width:300px;height:60px">文字</div>
  <div id="shape" data-vd-key style="position:absolute;left:600px;top:800px;width:100px;height:100px;background:#f00"></div>
  <div id="cover" style="position:absolute;left:0;top:200px;width:1080px;height:100px;background:#00f;display:none"></div>
</div>
<div id="host-brand-captions" style="position:absolute;inset:0"><div id="cap" style="position:absolute;left:60px;top:1250px">字幕</div></div>
<script>
window.__player = { getDuration: () => 4, renderSeek: async (t) => {
  document.getElementById("a").style.opacity = t >= 1 ? "1" : "0";
  document.getElementById("b").style.top = (t >= 2 ? 1500 : 600) + "px";
  document.getElementById("cover").style.display = t >= 3 ? "block" : "none";
} };
</script></body></html>`;

test("openPage：读时长；按时间读元素框、@词 可见、栏目标签遮挡；字幕不算", { skip: !chrome && "没有 Chrome" }, async () => {
  const page = await openPage({ html: HTML, root: project({}) });
  try {
    assert.equal(page.duration, 4);
    const f0 = await page.frame(0.5);
    assert.deepEqual(f0.cueMarks, [{ cue: "钩子", sel: "#a", visible: false }]);
    assert.ok(!f0.elements.some((e) => e.sel === "#a"), "透明元素不算可见");
    assert.ok(!f0.elements.some((e) => e.sel === "#cap"), "字幕在 host-brand-* 里，不查");
    assert.deepEqual(f0.elements.find((e) => e.sel === "#shape"), { sel: "#shape", text: false, key: true, allowSafe: false, box: [600, 800, 700, 900], opacity: 1 });
    assert.deepEqual(f0.kicker, { visible: true, occludedBy: null });
    const f1 = await page.frame(1.5);
    assert.equal(f1.cueMarks[0].visible, true);
    assert.notEqual(f1.sig, f0.sig, "元素变了签名就变");
    assert.deepEqual((await page.frame(2.5)).elements.find((e) => e.sel === "#b").box, [100, 1500, 400, 1560]);
    assert.deepEqual((await page.frame(3.5)).kicker, { visible: true, occludedBy: "#cover" });
  } finally {
    await page.close();
  }
});
```

- [ ] **Step 3：跑测试确认失败**

Run: `npm test --prefix skills/video-director 2>&1 | grep -E "inspect-page|Cannot find"`
Expected: FAIL，`Cannot find module '.../inspect-page.mjs'`

- [ ] **Step 4：实现**

```js
// skills/video-director/scripts/lib/inspect-page.mjs
// 在 headless Chrome 里打开打包好的工程，跳到任意时间读元素位置（给 vd qa 用）
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import puppeteer from "puppeteer-core";
import { findChrome } from "./chrome.mjs";

const MIME = { ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".woff": "font/woff", ".otf": "font/otf", ".ttf": "font/ttf", ".wav": "audio/wav", ".mp3": "audio/mpeg", ".mp4": "video/mp4" };

function serve(html, root) {
  const base = resolve(root);
  const server = createServer((req, res) => {
    const p = decodeURIComponent((req.url ?? "/").split("?")[0]);
    if (p === "/" || p === "/index.html") { res.setHeader("content-type", "text/html; charset=utf-8"); return res.end(html); }
    const f = resolve(base, "." + p);
    if (!f.startsWith(base + sep) || !existsSync(f)) { res.statusCode = 404; return res.end(); }
    res.setHeader("content-type", MIME[extname(f).toLowerCase()] ?? "application/octet-stream");
    res.end(readFileSync(f));
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

/* 在页面里执行：收集可见元素、@词 标记、栏目标签遮挡、画面签名。必须自包含（会被序列化进页面） */
function collect() {
  const inBrand = (e) => !!e.closest('[id^="host-brand-"]');
  const opacityOf = (e) => {
    let o = 1;
    for (let x = e; x && x.nodeType === 1; x = x.parentElement) {
      const cs = getComputedStyle(x);
      if (cs.display === "none" || cs.visibility === "hidden") return 0;
      o *= Number(cs.opacity);
    }
    return o;
  };
  const boxOf = (e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; };
  const area = (b) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
  const onScreen = (b) => b[2] > 0 && b[3] > 0 && b[0] < innerWidth && b[1] < innerHeight;
  const ownText = (e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  const selOf = (e) => {
    if (e.id) return `#${e.id}`;
    const host = e.parentElement?.closest("[id]");
    return `${host ? `#${host.id} ` : ""}${e.tagName.toLowerCase()}`;
  };
  const all = [...document.body.querySelectorAll("*")].filter((e) => !["SCRIPT", "STYLE", "LINK", "META"].includes(e.tagName));
  const elements = [];
  const sig = [];
  for (const e of all) {
    if (inBrand(e)) continue;
    const box = boxOf(e);
    const op = opacityOf(e);
    if (op <= 0.05 || !area(box) || !onScreen(box)) continue;
    const text = ownText(e);
    sig.push(`${selOf(e)}:${box.map((v) => Math.round(v / 2)).join(",")}:${Math.round(op * 20)}${text ? `:${e.textContent.trim()}` : ""}`);
    if (text || e.hasAttribute("data-vd-key")) elements.push({ sel: selOf(e), text, key: e.hasAttribute("data-vd-key"), allowSafe: !!e.closest("[data-vd-allow-safe]"), box, opacity: Math.round(op * 100) / 100 });
  }
  const cueMarks = [...document.querySelectorAll("[data-vd-cue]")].map((e) => {
    const box = boxOf(e);
    return { cue: e.getAttribute("data-vd-cue"), sel: selOf(e), visible: opacityOf(e) >= 0.5 && area(box) > 0 && onScreen(box) };
  });
  const kick = document.getElementById("bk-label");
  let kicker = { visible: false, occludedBy: null };
  if (kick && opacityOf(kick) > 0.05 && area(boxOf(kick))) {
    const paints = (e) => {
      if (e instanceof SVGElement) return true;
      if (["IMG", "CANVAS", "VIDEO"].includes(e.tagName) || ownText(e)) return true;
      const cs = getComputedStyle(e);
      const bg = cs.backgroundColor;
      return (bg !== "transparent" && !/rgba\(.*,\s*0\)$/.test(bg)) || cs.backgroundImage !== "none" || parseFloat(cs.borderTopWidth) > 0;
    };
    const r = kick.getBoundingClientRect();
    const pts = [[r.left + 4, r.top + 4], [r.right - 4, r.top + 4], [r.left + 4, r.bottom - 4], [r.right - 4, r.bottom - 4], [(r.left + r.right) / 2, (r.top + r.bottom) / 2]];
    let by = null;
    for (const [x, y] of pts) {
      const top = document.elementsFromPoint(x, y).find((e) => kick.contains(e) || (paints(e) && opacityOf(e) > 0.05));
      if (top && !kick.contains(top)) { by = selOf(top); break; }
    }
    kicker = { visible: true, occludedBy: by };
  }
  return { elements, cueMarks, kicker, sig: sig.join("|") };
}

export async function openPage({ html, root }) {
  const server = await serve(html, root);
  const browser = await puppeteer.launch({ executablePath: findChrome(), args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] });
  const close = async () => { await browser.close(); server.close(); };
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920 });
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`, { waitUntil: "load" });
    // elementsFromPoint 会跳过 pointer-events:none 的元素，查遮挡前全部打开
    await page.addStyleTag({ content: "*{pointer-events:auto !important}" });
    await page.waitForFunction(() => window.__player && typeof window.__player.renderSeek === "function" && window.__player.getDuration() > 0, { timeout: 30000 })
      .catch(() => { throw new Error("页面 30 秒内没准备好（没有 window.__player）：先 vd build，确认 npx hyperframes check 通过"); });
    const duration = await page.evaluate(() => window.__player.getDuration());
    const seek = (t) => page.evaluate(async (t) => {
      await window.__player.renderSeek(t);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }, t);
    return {
      duration,
      frame: async (t) => { await seek(t); return page.evaluate(collect); },
      shot: (path) => page.screenshot({ path, type: "png" }),
      close,
    };
  } catch (err) {
    await close();
    throw err;
  }
}
```

- [ ] **Step 5：跑测试确认通过**

Run: `npm test --prefix skills/video-director 2>&1 | tail -5`
Expected: 全部 pass；`openPage` 那条不是 skip（本机有 Chrome）

- [ ] **Step 6：提交**

```bash
cd /home/power/self-media
git add skills/video-director/package.json skills/video-director/package-lock.json skills/video-director/scripts/lib/chrome.mjs skills/video-director/scripts/lib/inspect-page.mjs skills/video-director/tests/inspect-page.test.mjs
git commit -m "feat: vd 用 headless Chrome 按时间读画面元素（给抖音专用检查用）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3：`vd qa` 命令、`vd cues --check`、文档

**Files:**
- Modify: `skills/video-director/scripts/lib/music.mjs`（把装 `@hyperframes/core` 抽成 `ensureCore`）
- Create: `skills/video-director/scripts/lib/qa-run.mjs`
- Modify: `skills/video-director/scripts/vd.mjs`（`qa` 子命令；`cues --check` 不写文件）
- Modify: `skills/video-director/SKILL.md`、`skills/video-director/references/director-rules.md`（第 11 条后加标注说明）、`skills/video-director/templates/segment.html`（注释里写三个属性）
- Test: `skills/video-director/tests/qa-run.test.mjs`、`skills/video-director/tests/vd.test.mjs`

**Interfaces:**
- Consumes: Task 1 全部导出；Task 2 `openPage`
- Produces:
  - `ensureCore(dir, hfVersion, runFn = run)`（music.mjs 导出；`carve` 改为调用它）
  - `douyinQa(built, page) → Promise<{ passed: boolean, issues: Issue[], shots: [{t, label, file}] }>`；`page` 接口同 Task 2，另需 `shotDir`（截图目录，绝对路径）参数：`douyinQa(built, page, shotDir)`
  - `qa-douyin.json`（工程根目录）：`{ "passed": bool, "issues": [{ "level": "error"|"warn", "msg": string }], "shots": [{ "t": number, "label": string, "file": "snapshots/cues/NN.png" }] }`——kv（Task 4）读 `passed` 和文件修改时间
  - `vd cues <工程> --check`：只校验，不写 `cues.js`，有错退出码 1（kv 用）

- [ ] **Step 1：写失败测试**

```js
// skills/video-director/tests/qa-run.test.mjs
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { douyinQa } from "../scripts/lib/qa-run.mjs";
import { project } from "./helpers.mjs";

const built = { cues: { 钩子: 1 }, segments: [{ id: "s1", start: 0, duration: 4 }], total: 4 };
const blank = { elements: [], cueMarks: [], kicker: { visible: true, occludedBy: null } };

function fakePage(dataAt) {
  const seen = [];
  return {
    seen,
    duration: 5,
    frame: async (t) => { seen.push(t); return dataAt(t); },
    shot: async (path) => { (await import("node:fs")).writeFileSync(path, "png"); },
  };
}

test("douyinQa：每个落定时刻截一张图；画面一直在变 → 通过", async () => {
  const dir = project({});
  const page = fakePage((t) => ({ ...blank, sig: String(t) }));
  const r = await douyinQa(built, page, join(dir, "snapshots/cues"));
  assert.equal(r.passed, true);
  assert.deepEqual(r.shots.map((s) => [s.t, s.label, s.file]), [[1.8, "@钩子", "snapshots/cues/01.png"], [3.7, "s1 结尾", "snapshots/cues/02.png"]]);
  assert.ok(existsSync(join(dir, "snapshots/cues/01.png")));
  assert.ok(page.seen.includes(0) && page.seen.includes(3.5), "grid 也取了");
});

test("douyinQa：有 ✗ 不通过；2 秒不动只给 ⚠，不影响通过", async () => {
  const dir = project({});
  const bad = await douyinQa(built, fakePage(() => ({ ...blank, sig: "x", elements: [{ sel: "#t", text: true, key: false, allowSafe: false, box: [100, 100, 300, 160], opacity: 1 }] })), join(dir, "a"));
  assert.equal(bad.passed, false);
  assert.ok(bad.issues.some((i) => i.level === "error" && /#t 进了顶部 200 像素.*（共 2 处）/.test(i.msg)));
  assert.ok(bad.issues.some((i) => i.level === "warn" && /0–3\.5 秒画面没有变化/.test(i.msg)));
  const still = await douyinQa(built, fakePage(() => ({ ...blank, sig: "x" })), join(dir, "b"));
  assert.equal(still.passed, true);
});
```

在 `skills/video-director/tests/vd.test.mjs` 末尾加：

```js
test("vd cues --check：DIRECTOR.md 有错返回 1，且不写 cues.js", async () => {
  const { existsSync } = await import("node:fs");
  const dir = project({
    "video-director.config.json": { fontsDir: "/f", gsap: "/g.js", brandDir: "b", sfxDir: "/s", hfVersion: "0.8.143" },
    "ep/DIRECTOR.md": "# 导演脚本\n没有机器块",
    "ep/audio_meta.json": { voices: [{ frame: 1, duration_s: 1, words: [{ text: "你好", start: 0, end: 1 }] }] },
  });
  const orig = console.error;
  console.error = () => {};
  try { assert.equal(await main(["cues", `${dir}/ep`, "--check"]), 1); } finally { console.error = orig; }
  assert.equal(existsSync(`${dir}/ep/cues.js`), false);
});
```

- [ ] **Step 2：跑测试确认失败**

Run: `npm test --prefix skills/video-director 2>&1 | grep -E "^not ok|Cannot find" | head`
Expected: `qa-run.mjs` 找不到模块（`vd cues --check` 那条此时可能已经过——现有 cues 遇错也不写文件；它是回归保护）

- [ ] **Step 3：实现 `qa-run.mjs`**

```js
// skills/video-director/scripts/lib/qa-run.mjs
// vd qa 的编排：按落定时刻取数 + 截图，按 0.5 秒网格取签名，交给 douyin-qa 判定
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { checkCues, checkFrame, qaTimes, stillWindows, summarize } from "./douyin-qa.mjs";

export async function douyinQa(built, page, shotDir) {
  const { inspect, grid } = qaTimes(built, page.duration);
  rmSync(shotDir, { recursive: true, force: true });
  mkdirSync(shotDir, { recursive: true });
  const frames = [];
  const shots = [];
  for (const [i, x] of inspect.entries()) {
    const data = await page.frame(x.t);
    const name = `${String(i + 1).padStart(2, "0")}.png`;
    await page.shot(join(shotDir, name));
    frames.push({ ...x, data });
    shots.push({ t: x.t, label: x.label, file: `snapshots/cues/${name}` });
  }
  const sigs = [];
  for (const t of grid) sigs.push({ t, sig: (await page.frame(t)).sig });
  const errors = summarize([...frames.flatMap(checkFrame), ...checkCues(frames, built.cues)]);
  const warns = stillWindows(sigs).map((w) => ({ level: "warn", kind: "still", sel: "", t: w.from, msg: `${w.from}–${w.to} 秒画面没有变化（任意 2 秒内要有东西在动）` }));
  return { passed: errors.length === 0, issues: [...errors, ...warns], shots };
}
```

- [ ] **Step 4：`music.mjs` 抽出 `ensureCore`**

把 `carve` 开头的安装代码换成：

```js
/** 工程里没有 @hyperframes/core 就装上（人声避让、vd qa 打包都要用） */
export function ensureCore(dir, hfVersion, runFn = run) {
  if (existsSync(join(dir, "node_modules/@hyperframes/core"))) return;
  const i = runFn("npm", ["i", "-D", "--no-audit", "--no-fund", `@hyperframes/core@${hfVersion}`], { cwd: dir });
  if (i.status !== 0) throw new Error(`安装 @hyperframes/core 失败：${i.stderr}`);
}

export function carve(dir, hfVersion, runFn = run) {
  ensureCore(dir, hfVersion, runFn);
  const c = runFn("node", [CARVE, "--comp", "index.html", "--bed", "music", "--voice", "vo"], { cwd: dir });
  if (c.status !== 0) throw new Error(`人声避让失败：${c.stderr || c.stdout}`);
}
```

（`music.test.mjs` 里若有断言「人声避让需要」的原文，改成「安装 @hyperframes/core 失败」。）

- [ ] **Step 5：`vd.mjs` 加 `qa`、`cues --check`**

文件头注释加两行：

```js
//   cues   … [--check] 只校验不写文件
//   qa     抖音专用检查：@词 落定时刻查安全区、字幕带、栏目标签、@词元素可见，2 秒不动；写 qa-douyin.json 和 snapshots/cues-sheet.jpg
```

`USAGE` 改为 `"用法：vd build|cues|check|qa <视频工程目录> [--sample] [--no-music] [--update-components] [--check]"`。import 增加：

```js
import { mkdirSync } from "node:fs";
import { ensureCore } from "./lib/music.mjs";
import { douyinQa } from "./lib/qa-run.mjs";
```

（`addMusic, alignMusic, carve, resolveMusic` 那行合并 `ensureCore`；`node:fs` 那行合并 `mkdirSync`。）

`COMMANDS.cues` 改为：

```js
  cues(dir, rest = []) {
    const { built } = load(dir);
    if (rest.includes("--check")) {
      console.log(`✓ DIRECTOR.md 通过（${Object.keys(built.cues).length} 个词，${built.segments.length} 段）`);
      return 0;
    }
    writeFileSync(join(dir, "cues.js"), cuesJs(built));
    for (const [k, v] of Object.entries(built.cues)) console.log(`  @${k} → ${v}s`);
    console.log(`✓ cues.js（${Object.keys(built.cues).length} 个词，${built.segments.length} 段，口播 ${built.total}s）`);
  },
```

`COMMANDS` 里加：

```js
  async qa(dir) {
    const config = loadConfig(findProjectRoot(dir));
    const { built } = load(dir);
    ensureCore(dir, config.hfVersion);
    const { bundleToSingleHtml } = await import(pathToFileURL(join(dir, "node_modules/@hyperframes/core/dist/compiler/index.js")).href);
    const { openPage } = await import("./lib/inspect-page.mjs");
    const page = await openPage({ html: await bundleToSingleHtml(dir), root: dir });
    let r;
    try { r = await douyinQa(built, page, join(dir, "snapshots/cues")); } finally { await page.close(); }
    writeFileSync(join(dir, "qa-douyin.json"), JSON.stringify({ passed: r.passed, issues: r.issues.map(({ level, msg }) => ({ level, msg })), shots: r.shots }, null, 2) + "\n");
    const sheet = run("ffmpeg", ["-v", "error", "-y", "-pattern_type", "glob", "-i", "snapshots/cues/*.png", "-vf", `scale=270:-1,tile=6x${Math.ceil(r.shots.length / 6)}:padding=6:color=0x444444`, "-frames:v", "1", "snapshots/cues-sheet.jpg"], { cwd: dir });
    if (sheet.status !== 0) console.warn(`⚠ 总览图没拼成：${sheet.stderr.trim()}`);
    for (const i of r.issues) console.log(`${i.level === "error" ? "✗" : "⚠"} ${i.msg}`);
    console.log(`${r.passed ? "✓" : "✗"} 抖音专用检查：${r.shots.length} 个时间点，${r.issues.filter((i) => i.level === "error").length} 个 ✗（截图总览 snapshots/cues-sheet.jpg，按 DIRECTOR.md 逐条看）`);
    return r.passed ? 0 : 1;
  },
```

（`inspect-page.mjs` 用动态 import：没装 puppeteer-core 时其他子命令照常能用；`openPage` 失败时它自己的错误信息是中文。没装依赖时 import 报 `Cannot find package 'puppeteer-core'`——在 `qa` 里包一层：

```js
    const { openPage } = await import("./lib/inspect-page.mjs").catch((err) => {
      throw new Error(`vd qa 需要 puppeteer-core：在 video-director 技能目录跑 npm i（${err.message}）`);
    });
```

用这段替换上面那行 `const { openPage } = await import(...)`。）

- [ ] **Step 6：跑测试确认通过**

Run: `npm test --prefix skills/video-director 2>&1 | tail -5`
Expected: 全部 pass

- [ ] **Step 7：在真实工程上跑一次**

Run: `cd /home/power/self-media/04-作品/普通人的AI课/01-同事半小时/抖音-director && node /home/power/self-media/skills/video-director/scripts/vd.mjs qa .; echo exit=$?`
Expected: 打印若干 ✗/⚠ 或全部通过，最后一行 `抖音专用检查：N 个时间点`；生成 `qa-douyin.json`、`snapshots/cues-sheet.jpg`。读总览图确认截图是对的时间点。报出的 ✗ 逐条判断是真问题还是规则误报：误报就回 Task 1 改规则（先加复现测试），真问题记进本期 `qa.json` 不在本计划里修（该工程不入库）。

- [ ] **Step 8：文档**

`skills/video-director/references/director-rules.md` 第 11 条后加一段：

```markdown
**11a. 给检查标记元素。** `vd qa` 默认把可见的文字都当关键内容查安全区；非文字但重要的图形加 `data-vd-key`；故意出界、进安全区的加 `data-vd-allow-safe`，并在 DIRECTOR.md 写理由；每个 @词 要出现的那个元素加 `data-vd-cue="词"`（重复词写 `词#2`），`vd qa` 会查它在 @词 后 0.8 秒时看得见。
```

`templates/segment.html` 的说明注释里加一行：`检查标记：data-vd-cue="词"（@词 时要出现的元素）、data-vd-key（非文字的关键图形）、data-vd-allow-safe（故意出界，DIRECTOR.md 写理由）`。

`SKILL.md`：
- 安装一节加 `cd <skill 目录> && npm i   # vd qa 要用 puppeteer-core`
- 流程表第 2 步改为：「写样片的几段……`vd build . --sample`；`vd qa .` 无 ✗（看 `snapshots/cues-sheet.jpg`）；`npx hyperframes render -o renders/sample.mp4` 出样片」
- 第 4 步改为：「全片 `vd qa .` 无 ✗，按总览图逐条看 DIRECTOR.md，问题记进 `qa.json`；`nv render <工程>`；和旧版做对比视频（`renders/compare.mp4`）；`vd check` 列出组件候选」
- 命令表加一行：`| vd qa <工程> | 抖音专用检查：在每个 @词 落定时刻（@词 后 0.8 秒）和每段结尾截图，查出画面、安全区（顶 200 / 右 160 / 底 480）、字幕带 y 1180–1440、栏目标签被挡、data-vd-cue 元素看不见（✗）；每 0.5 秒比一次，2 秒不动（⚠）。结果 qa-douyin.json，总览 snapshots/cues-sheet.jpg |`
- `vd cues` 那行补 `--check 只校验不写文件`

- [ ] **Step 9：跑全部测试并提交**

```bash
cd /home/power/self-media
npm test --prefix skills/video-director 2>&1 | tail -3
git add skills/video-director
git status --short   # 确认只有 skills/video-director 下的文件（不含 node_modules）
git commit -m "feat: vd qa 抖音专用检查（@词时间点截图总览 + qa-douyin.json）；vd cues --check

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: 测试全过；提交里没有 node_modules。

---

## Part 2：kv 接入（knowledge-video）

### Task 4：实用类 director 做法（步骤、事实、指纹、kv gate、kv init --video）

**Files:**
- Create: `skills/knowledge-video/scripts/lib/video.mjs`
- Modify: `skills/knowledge-video/scripts/lib/practical.mjs`
- Modify: `skills/knowledge-video/scripts/lib/practical-facts.mjs`
- Modify: `skills/knowledge-video/scripts/kv.mjs`（`recordGate`、`initRun`、`printPracticalStatus`、`practicalFacts`、USAGE）
- Modify: `skills/knowledge-video/templates/run-practical.json`
- Test: `skills/knowledge-video/tests/practical.test.mjs`、`tests/practical-facts.test.mjs`、`tests/kv-practical.test.mjs`

**Interfaces:**
- Consumes: Task 3 的 `qa-douyin.json`（`passed`、文件修改时间）、`vd cues <工程> --check`（退出码）
- Produces:
  - `video.mjs`：`DIRECTOR_DIR = "抖音-director"`；`videoMode(run) → "director"|"template"`；`FINAL_RE`（正式成片：不以 `预览`、`sample`、`compare` 开头的 mp4）
  - `practical.mjs`：`stepsFor(video) → Step[]`（template 时等于原 `STEPS`）；`gatesFor(video) → string[]`；`GATE_LABEL` 增加 `director: "③a 导演脚本"`、`sample: "③b 风格样片"`；`practicalStatus(facts)`、`gateBlocker(facts, gate)`、`doneBlocker(facts, key)` 读 `facts.video`（缺省 template）
  - `practical-facts.mjs`：`collectPracticalFacts(dir, run, { runSc, runVoiceCheck, runVdCues, experienceDir })` 返回值多 `video`；`fingerprint(dir, gate, video = "template")`；`defaultRunners()` 多 `runVdCues(directorDir) → {ok, msg}`（命令名环境变量 `KV_VD_CMD`，默认 `vd`）

- [ ] **Step 1：写失败测试（practical.mjs）**

在 `tests/practical.test.mjs` 末尾加：

```js
import { gatesFor, stepsFor } from "../scripts/lib/practical.mjs";

const dirFacts = (o = {}) => {
  const steps = Object.fromEntries(stepsFor("director").map((s) => [s.key, { ok: true, why: "" }]));
  const gates = Object.fromEntries(gatesFor("director").map((g) => [g, { passed: true, at: "2026-10-15", quote: "通过", stale: false }]));
  return { video: "director", steps: { ...steps, ...(o.steps ?? {}) }, gates: { ...gates, ...(o.gates ?? {}) } };
};

test("director 做法：15 步，配音 + 分镜换成 导演脚本 ③a、风格样片 ③b", () => {
  const s = stepsFor("director");
  assert.equal(s.length, 15);
  assert.deepEqual(s.filter((x) => x.gate).map((x) => [x.n, x.gate]), [[2, "topic"], [7, "script"], [8, "director"], [9, "sample"], [10, "final"]]);
  assert.deepEqual(stepsFor("template").map((x) => x.key), STEPS.map((x) => x.key));
  assert.deepEqual(gatesFor("director"), ["topic", "script", "director", "sample", "final"]);
  assert.deepEqual(gatesFor("template"), ["topic", "script", "storyboard", "final"]);
});

test("director 做法：等 ③a、样片过期、按 director 做法拦 kv gate", () => {
  const unp = { passed: false, at: null, quote: null, stale: false };
  const w = practicalStatus(dirFacts({ gates: { director: unp, sample: unp, final: unp } }));
  assert.equal(w.waitingFor, "director");
  assert.match(w.next, /③a 导演脚本.*kv gate <作品> director/);
  const s = practicalStatus(dirFacts({ gates: { sample: { ...unp, passed: true, stale: true } } }));
  assert.equal(s.waitingFor, "sample");
  assert.match(s.next, /确认后改过/);
  assert.match(gateBlocker(dirFacts({ gates: { director: unp, sample: unp } }), "sample"), /③a 导演脚本 还没确认/);
  assert.match(gateBlocker(dirFacts(), "storyboard"), /没有这个确认节点：storyboard（可选：topic、script、director、sample、final）/);
  assert.match(doneBlocker(dirFacts({ gates: { final: unp }, steps: { wechat: { ok: false, why: "还没存草稿" } } }), "wechat"), /④ 成片/);
});

test("没有 video 字段的 facts 按 template 处理（老作品不变）", () => {
  assert.equal(practicalStatus(facts()).rows.length, 14);
});
```

- [ ] **Step 2：跑测试确认失败**

Run: `npm test --prefix skills/knowledge-video 2>&1 | grep -E "^not ok|SyntaxError|does not provide" | head`
Expected: FAIL，`does not provide an export named 'gatesFor'`

- [ ] **Step 3：实现 `video.mjs` 和 `practical.mjs`**

```js
// skills/knowledge-video/scripts/lib/video.mjs
// 抖音视频的两种做法：template（nv hf-build 分镜）和 director（video-director 导演工程）
export const DIRECTOR_DIR = "抖音-director";
export const videoMode = (run) => (run?.video === "director" ? "director" : "template");
// 正式成片：不算压缩预览、风格样片、新旧对比
export const FINAL_RE = /^(?!预览|sample|compare).*\.mp4$/;
```

`practical.mjs`：保留 `STEPS`（template 的 14 步，原样），在它后面加：

```js
const DIRECTOR_VIDEO = [
  { key: "director", label: "配音 + 导演脚本", gate: "director" },
  { key: "sample", label: "风格样片", gate: "sample" },
];

/** 这种做法的步骤：director 把第 8 步「配音 + 分镜」换成导演脚本、风格样片两步，后面顺延编号 */
export function stepsFor(video = "template") {
  if (video !== "director") return STEPS;
  const at = STEPS.findIndex((s) => s.key === "storyboard");
  return [...STEPS.slice(0, at), ...DIRECTOR_VIDEO, ...STEPS.slice(at + 1)].map((s, i) => ({ ...s, n: i + 1 }));
}

export const gatesFor = (video = "template") => stepsFor(video).filter((s) => s.gate).map((s) => s.gate);
```

`GATES` 常量删掉（改用 `gatesFor`），`GATE_LABEL` 改为：

```js
export const GATE_LABEL = { topic: "① 选题关", script: "② 脚本 + 配音稿", storyboard: "③ 分镜总览图", director: "③a 导演脚本", sample: "③b 风格样片", final: "④ 成片" };
```

`HOW` 加三项（`render` 在 director 做法下换说法）：

```js
  director: "nv hf-audio 抖音 配音 → 按 video-director 新建 抖音-director/，写 DIRECTOR.md，vd cues 抖音-director --check 通过",
  sample: "按 video-director 写样片的几段 → vd build 抖音-director --sample → vd qa 无 ✗ → npx hyperframes render -o renders/sample.mp4",
  renderDirector: "写其余各段 → vd build 抖音-director → vd qa 无 ✗ → nv render 抖音-director，按 knowledge-video references/qa.md 写 qa.json；vd check 列出组件候选，交成片时一起给用户",
```

`practicalStatus`、`blockerThrough`、`gateBlocker`、`doneBlocker` 里所有 `STEPS` 换成 `stepsFor(facts.video)`；`practicalStatus` 里取说明改为：

```js
const how = (key, video) => (key === "render" && video === "director" ? HOW.renderDirector : HOW[key]);
```

并把 `HOW[s.key]` 换成 `how(s.key, facts.video)`。`gateBlocker` 改为：

```js
export function gateBlocker(facts, gate) {
  const step = stepsFor(facts.video).find((s) => s.gate === gate);
  if (!step) return `没有这个确认节点：${gate}（可选：${gatesFor(facts.video).join("、")}）`;
  return blockerThrough(facts, step.n);
}
```

`doneBlocker` 里 `const step = STEPS.find(...)` 改成 `stepsFor(facts.video).find(...)`。

- [ ] **Step 4：跑测试确认通过**

Run: `npm test --prefix skills/knowledge-video 2>&1 | tail -5`
Expected: 全部 pass（老测试不改也过）

- [ ] **Step 5：写失败测试（practical-facts.mjs）**

在 `tests/practical-facts.test.mjs` 末尾加：

```js
const vdOk = () => ({ ok: true, msg: "" });
const D = "抖音-director";
const dRun = (o = {}) => run({ video: "director", ...o });
const dCollect = (dir, r = dRun(), o = {}) => collect(dir, r, { runVdCues: vdOk, ...o });

test("director：第 8 步要配音、DIRECTOR.md、vd cues 通过；导演工程里的配音旧了不算", () => {
  let f = dCollect(episode({}));
  assert.equal(f.video, "director");
  assert.match(f.steps.director.why, /还没配音/);
  f = dCollect(episode({ "抖音/audio_meta.json": "{}" }));
  assert.match(f.steps.director.why, /还没有 抖音-director\/DIRECTOR\.md/);
  const dir = episode({ "抖音/audio_meta.json": "{}", [`${D}/DIRECTOR.md`]: "x", [`${D}/audio_meta.json`]: "{}" });
  assert.match(dCollect(dir, dRun(), { runVdCues: () => ({ ok: false, msg: "第 3 句没有分到任何段" }) }).steps.director.why, /第 3 句/);
  assert.equal(dCollect(dir).steps.director.ok, true);
  touch(dir, `${D}/audio_meta.json`, 1000);
  touch(dir, "抖音/audio_meta.json", 2000);
  assert.match(dCollect(dir).steps.director.why, /重新配过音/);
});

test("director：样片要比 DIRECTOR.md 新", () => {
  const dir = episode({ [`${D}/DIRECTOR.md`]: "x" });
  assert.match(dCollect(dir).steps.sample.why, /renders\/sample\.mp4/);
  mkdirSync(join(dir, D, "renders"), { recursive: true });
  writeFileSync(join(dir, D, "renders/sample.mp4"), "v");
  touch(dir, `${D}/DIRECTOR.md`, 2000);
  touch(dir, `${D}/renders/sample.mp4`, 1000);
  assert.match(dCollect(dir).steps.sample.why, /DIRECTOR\.md 改过/);
  touch(dir, `${D}/renders/sample.mp4`, 3000);
  assert.equal(dCollect(dir).steps.sample.ok, true);
});

test("director：渲染步骤看正式成片（不算 sample / compare / 预览）、vd qa、qa.json", () => {
  const files = { [`${D}/DIRECTOR.md`]: "x", [`${D}/index.html`]: "<html>", [`${D}/renders/sample.mp4`]: "v", [`${D}/renders/compare.mp4`]: "v", [`${D}/renders/预览-1.mp4`]: "v" };
  let dir = episode(files);
  assert.match(dCollect(dir).steps.render.why, /还没渲染/);
  dir = episode({ ...files, [`${D}/renders/01.mp4`]: "v" });
  for (const [f, s] of [[`${D}/DIRECTOR.md`, 1000], [`${D}/index.html`, 1000], [`${D}/renders/01.mp4`, 3000]]) touch(dir, f, s);
  assert.match(dCollect(dir).steps.render.why, /还没跑 vd qa/);
  writeFileSync(join(dir, D, "qa-douyin.json"), JSON.stringify({ passed: false }));
  touch(dir, `${D}/qa-douyin.json`, 2000);
  assert.match(dCollect(dir).steps.render.why, /vd qa 还有 ✗/);
  writeFileSync(join(dir, D, "qa-douyin.json"), JSON.stringify({ passed: true }));
  touch(dir, `${D}/qa-douyin.json`, 2000);
  touch(dir, `${D}/index.html`, 2500);
  assert.match(dCollect(dir).steps.render.why, /画面改过，要重跑 vd qa/);
  touch(dir, `${D}/index.html`, 1500);
  assert.match(dCollect(dir).steps.render.why, /还没写 qa\.json/);
  writeFileSync(join(dir, "qa.json"), JSON.stringify({ passed: true }));
  touch(dir, "qa.json", 4000);
  assert.equal(dCollect(dir).steps.render.ok, true);
});

test("director 指纹：③a 看 DIRECTOR.md 和配音，③b 看样片，④ 看正式成片", () => {
  const dir = episode({ "抖音/audio_meta.json": "{}", [`${D}/DIRECTOR.md`]: "x", [`${D}/renders/sample.mp4`]: "s", [`${D}/renders/01.mp4`]: "f" });
  const before = ["director", "sample", "final"].map((g) => fingerprint(dir, g, "director"));
  writeFileSync(join(dir, D, "DIRECTOR.md"), "y");
  writeFileSync(join(dir, D, "renders/sample.mp4"), "s2");
  writeFileSync(join(dir, D, "renders/compare.mp4"), "c");
  const after = ["director", "sample", "final"].map((g) => fingerprint(dir, g, "director"));
  assert.notEqual(after[0], before[0]);
  assert.notEqual(after[1], before[1]);
  assert.equal(after[2], before[2], "compare.mp4 不影响 ④");
  const f = dCollect(dir, dRun({ gates: { director: { passed: true, fingerprint: before[0] } } }));
  assert.deepEqual(Object.keys(f.gates), ["topic", "script", "director", "sample", "final"]);
  assert.equal(f.gates.director.stale, true);
});
```

在 `tests/kv-practical.test.mjs` 末尾加（`fake` 已有）：

```js
const VD_OK = fake("vd-ok", "exit 0");

test("kv init --video director：写进 run.json；参数打错报错", () => {
  const dir = practical();
  assert.equal(kv({}, "init", dir, "--video", "director").status, 0);
  assert.equal(readRun(dir).video, "director");
  const bad = kv({}, "init", practical(), "--video", "fancy");
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /--video 只能是 director 或 template/);
});

test("老 run.json 改成 director：status 显示 15 步；kv gate director 前面没做完时拒绝，不报没有这个节点", () => {
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
```

- [ ] **Step 6：跑测试确认失败**

Run: `npm test --prefix skills/knowledge-video 2>&1 | grep -E "^not ok" | head`
Expected: 新加的 6 条 FAIL（`f.video` undefined、`steps.director` undefined、init 不认 `--video` 等）

- [ ] **Step 7：实现 `practical-facts.mjs`**

import 增加 `import { DIRECTOR_DIR, FINAL_RE, videoMode } from "./video.mjs";`，删掉本文件的 `RENDER_RE`（template 成片仍用「不以 预览 开头」：把 `RENDER_RE` 的两处使用换成 `FINAL_RE`——template 工程里本来就没有 sample/compare，行为不变）。

`GATE_FILES` 换成按做法取：

```js
const finalMp4 = (dir, sub) => {
  const mp4 = latest(dir, sub, FINAL_RE);
  return mp4 ? [mp4.slice(dir.length + 1)] : [];
};

const GATE_FILES = {
  template: {
    topic: () => ["选题关.md"],
    script: () => ["抖音/SCRIPT.md", "抖音/VOICE.md"],
    storyboard: () => ["抖音/STORYBOARD.md", "抖音/audio_meta.json"],
    final: (dir) => finalMp4(dir, "抖音/renders"),
  },
  director: {
    topic: () => ["选题关.md"],
    script: () => ["抖音/SCRIPT.md", "抖音/VOICE.md"],
    director: () => [`${DIRECTOR_DIR}/DIRECTOR.md`, "抖音/audio_meta.json"],
    sample: () => [`${DIRECTOR_DIR}/renders/sample.mp4`],
    final: (dir) => finalMp4(dir, `${DIRECTOR_DIR}/renders`),
  },
};

export function fingerprint(dir, gate, video = "template") {
  const h = createHash("sha256");
  for (const rel of GATE_FILES[video][gate](dir)) {
    const p = join(dir, rel);
    if (existsSync(p)) h.update(rel).update(readFileSync(p));
  }
  return h.digest("hex");
}
```

（原来的 `export const GATE_FILES` 若有别处引用：`grep -rn GATE_FILES skills/knowledge-video` 确认只有本文件。）

加 director 的事实：

```js
/** 工程里最新的 HTML（index.html + compositions/ 下所有 .html）的修改时间 */
function newestHtml(root) {
  let t = mtime(join(root, "index.html"));
  const walk = (d) => {
    if (!existsSync(d)) return;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(d, e.name));
      else if (e.name.endsWith(".html")) t = Math.max(t, mtime(join(d, e.name)));
    }
  };
  walk(join(root, "compositions"));
  return t;
}

function readQa(p) {
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; }
}

function directorSteps(dir, runVdCues) {
  const root = join(dir, DIRECTOR_DIR);
  const md = join(root, "DIRECTOR.md");
  const voice = join(dir, "抖音/audio_meta.json");
  let director = !existsSync(voice) ? no("还没配音（nv hf-audio 抖音）")
    : !existsSync(md) ? no(`还没有 ${DIRECTOR_DIR}/DIRECTOR.md`)
    : mtime(join(root, "audio_meta.json")) < mtime(voice) ? no(`抖音/ 重新配过音，把 audio_meta.json、caption_groups.json、assets/voice/ 复制到 ${DIRECTOR_DIR}/`)
    : ok();
  if (director.ok) {
    const v = runVdCues(root);
    if (!v.ok) director = no(v.msg);
  }
  const sampleMp4 = join(root, "renders/sample.mp4");
  const sample = !existsSync(sampleMp4) ? no(`还没有 ${DIRECTOR_DIR}/renders/sample.mp4`)
    : mtime(sampleMp4) < mtime(md) ? no("DIRECTOR.md 改过，要重新出样片") : ok();
  const mp4 = latest(dir, `${DIRECTOR_DIR}/renders`, FINAL_RE);
  const vdQaPath = join(root, "qa-douyin.json");
  const vdQa = readQa(vdQaPath);
  const qaPath = join(dir, "qa.json");
  const qa = readQa(qaPath);
  const render = !mp4 ? no("还没渲染（nv render 抖音-director）")
    : mtime(mp4) < mtime(md) ? no("DIRECTOR.md 改过，要重新渲染")
    : !vdQa ? no("还没跑 vd qa")
    : vdQa.passed !== true ? no("vd qa 还有 ✗")
    : mtime(vdQaPath) < newestHtml(root) ? no("画面改过，要重跑 vd qa")
    : !qa ? no("还没写 qa.json") : mtime(qaPath) < mtime(mp4) ? no("渲染后还没重新 QA（重写 qa.json）")
      : qa.passed !== true ? no("qa.json 有没修的问题") : ok();
  return { director, sample, render };
}
```

`videoSteps` 改名不动，`collectPracticalFacts` 改为：

```js
export function collectPracticalFacts(dir, run, { runSc, runVoiceCheck, runVdCues, experienceDir }) {
  const video = videoMode(run);
  const v = videoSteps(dir, run, runVoiceCheck);
  const vid = video === "director" ? { script: v.script, ...directorSteps(dir, runVdCues) } : v;
  return {
    video,
    steps: {
      ...scSteps(dir, runSc),
      ...vid,
      ...draftSteps(dir, run),
      record: recordStep(dir),
      retro: retroStep(dir, experienceDir),
    },
    gates: gateFacts(dir, run, video),
  };
}
```

`gateFacts` 改为：

```js
function gateFacts(dir, run, video) {
  return Object.fromEntries(Object.keys(GATE_FILES[video]).map((g) => {
    const r = run.gates?.[g] ?? {};
    const passed = r.passed === true;
    return [g, { passed, at: r.at ?? null, quote: r.quote ?? null, stale: passed && r.fingerprint !== fingerprint(dir, g, video) }];
  }));
}
```

`defaultRunners` 里加：

```js
  const vd = process.env.KV_VD_CMD || "vd";
  …
    runVdCues: (directorDir) => {
      const r = runCmd(vd, ["cues", directorDir, "--check"]);
      if (r.error) return { ok: false, msg: r.error };
      return r.status === 0 ? { ok: true, msg: "" } : { ok: false, msg: (r.err || r.out).trim().slice(-300) };
    },
```

- [ ] **Step 8：改 `kv.mjs`**

import 增加 `import { videoMode } from "./lib/video.mjs";`，`practical.mjs` 的 import 加 `gatesFor, stepsFor`。

`USAGE` 的 init 行改为 `kv init <作品目录> [--fresh] [--video director|template]`；文件头注释 init 行同步。

`initRun`：

```js
function initRun(dir, args) {
  if (readRun(dir)) throw new Error("已经有 run.json 了");
  const vi = args.indexOf("--video");
  const video = vi >= 0 ? args[vi + 1] : null;
  if (vi >= 0 && !["director", "template"].includes(video)) throw new Error(`--video 只能是 director 或 template：${video ?? "（空）"}`);
  const practical = looksPractical(dir);
  const run = JSON.parse(readFileSync(join(TEMPLATES_DIR, practical ? "run-practical.json" : "run.json"), "utf8"));
  if (video) run.video = video;
  if (practical && args.includes("--fresh")) run.templates = templateHashes(dir, TEMPLATE_FILES);
  writeRun(dir, run);
  console.log(`✓ run.json（${TYPE_LABEL[episodeType(run)]}，视频做法 ${videoMode(run)}）`);
  return 0;
}
```

`recordGate`：把

```js
  const g = run.gates?.[gate];
  if (!g) throw new Error(`没有这个确认节点：${gate ?? "（空）"}（可选：${Object.keys(P_GATE_LABEL).join("、")}）`);
```

换成

```js
  const allowed = gatesFor(videoMode(run));
  if (!allowed.includes(gate)) throw new Error(`没有这个确认节点：${gate ?? "（空）"}（可选：${allowed.join("、")}）`);
  const g = run.gates?.[gate] ?? { passed: false, at: null, quote: null, fingerprint: null, edits: [] }; // 老 run.json 没有 director、sample
```

并把写指纹的一行改成 `fingerprint: fingerprint(dir, gate, videoMode(run))`；`run.gates[gate] = …` 前加 `run.gates = run.gates ?? {};`（两处：`--edit` 分支和通过分支）。

`printPracticalStatus` 第一行改成 `console.log(\`类型：实用技巧（视频做法 ${videoMode(run)}）\`);`。

`practicalFacts` 不用改（`defaultRunners()` 已带 `runVdCues`）。

- [ ] **Step 9：模板**

`templates/run-practical.json` 加 `"video": "template",`（放在 `"type"` 后），`gates` 里在 `storyboard` 后加：

```json
    "director": { "passed": false, "at": null, "quote": null, "fingerprint": null, "edits": [] },
    "sample": { "passed": false, "at": null, "quote": null, "fingerprint": null, "edits": [] },
```

- [ ] **Step 10：跑测试确认通过**

Run: `npm test --prefix skills/knowledge-video 2>&1 | tail -5`
Expected: 全部 pass。若 `templates.test.mjs` 断言了 run-practical.json 的键，按新模板更新那条断言（那是模板本身改了，不是行为退化）。

- [ ] **Step 11：提交**

```bash
cd /home/power/self-media
git add skills/knowledge-video
git commit -m "feat: kv 实用类支持 director 做法（③a 导演脚本、③b 风格样片，成片看 抖音-director、要 vd qa 通过）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5：概念科普 director 做法（detectStatus、collectFacts、模板）

**Files:**
- Modify: `skills/knowledge-video/scripts/lib/status.mjs`
- Modify: `skills/knowledge-video/scripts/kv.mjs`（`collectFacts`、`GATE_LABEL`、`printStatus`）
- Modify: `skills/knowledge-video/templates/run.json`
- Test: `skills/knowledge-video/tests/status.test.mjs`、`tests/kv.test.mjs`

**Interfaces:**
- Consumes: Task 4 的 `video.mjs`（`DIRECTOR_DIR`、`FINAL_RE`、`videoMode`）
- Produces: `detectStatus(f)`：`f.video === "director"` 时读 `f.hasDirector`、`f.hasSample`、`f.vdQa`（`null | {passed}`）、`f.gates.director`、`f.gates.sample`；`waitingFor` 可能是 `"director" | "sample"`

- [ ] **Step 1：写失败测试**

`tests/status.test.mjs` 末尾加：

```js
test("director 做法：脚本确认后 → 导演脚本 → 等 ②a → 样片 → 等 ②b → 渲染 → vd qa → qa → ③", () => {
  const d = (o) => at({ video: "director", hasDirector: true, hasSample: true, vdQa: { passed: true }, ...o, gates: { director: true, sample: true, ...(o.gates ?? {}) } });
  assert.equal(d({ hasDirector: false }).stage, "director");
  assert.match(d({ hasDirector: false }).next, /DIRECTOR\.md/);
  assert.equal(d({ gates: { director: false } }).waitingFor, "director");
  assert.equal(d({ hasSample: false }).stage, "sample");
  assert.match(d({ hasSample: false }).next, /vd build .*--sample/);
  assert.equal(d({ gates: { sample: false } }).waitingFor, "sample");
  assert.equal(d({ hasRender: false }).stage, "render");
  assert.match(d({ vdQa: null }).next, /vd qa/);
  assert.match(d({ vdQa: { passed: false } }).next, /vd qa/);
  assert.equal(d({}).stage, "done");
  assert.equal(at({ hasStoryboard: false, hasSheet: false, gates: { storyboard: false } }).stage, "storyboard", "没有 video 字段照旧");
});
```

`tests/kv.test.mjs` 末尾加：

```js
test("kv status 概念科普 director：没有 DIRECTOR.md 时下一步写导演脚本，确认节点列 ②a ②b", () => {
  const r = kv("status", episode({ "brief.md": "x", "research.json": { claims: [claim("c01")] }, "抖音/SCRIPT.md": SCRIPT, "run.json": { type: "concept", video: "director", gates: { script: { passed: true } } } }));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /阶段：director/);
  assert.match(r.stdout, /②a 导演脚本 ·/);
  assert.match(r.stdout, /②b 风格样片 ·/);
  assert.doesNotMatch(r.stdout, /分镜总览图/);
});
```

- [ ] **Step 2：跑测试确认失败**

Run: `npm test --prefix skills/knowledge-video 2>&1 | grep -E "^not ok" | head`
Expected: 新的两条 FAIL

- [ ] **Step 3：实现 `status.mjs`**

文件头第二行注释改为：`// 阶段：brief → research → script → storyboard（director 做法：director → sample）→ render → review → done`。把 `detectStatus` 里从 `if (!f.hasStoryboard || !f.hasSheet)` 到 `if (!f.qa) …` 前的部分换成：

```js
  if (f.video === "director") {
    if (!f.hasDirector) return step("director", "nv hf-audio 配音 → 按 video-director 新建 抖音-director/，写 DIRECTOR.md（vd cues 抖音-director --check 通过）");
    if (!f.gates.director) return step("director", "请用户审 抖音-director/DIRECTOR.md（确认节点 ②a）", "director");
    if (!f.hasSample) return step("sample", "写样片的几段 → vd build 抖音-director --sample → vd qa → npx hyperframes render -o renders/sample.mp4");
    if (!f.gates.sample) return step("sample", "请用户看 抖音-director/renders/sample.mp4（确认节点 ②b）", "sample");
    if (!f.hasRender) return step("render", "写其余各段 → vd build 抖音-director → vd qa → nv render 抖音-director");
    if (!f.vdQa?.passed) return step("render", "vd qa 抖音-director 要无 ✗（看 snapshots/cues-sheet.jpg）");
  } else {
    if (!f.hasStoryboard || !f.hasSheet) return step("storyboard", "写 STORYBOARD 的 build 行 → nv hf-audio → nv hf-build --snap");
    if (!f.gates.storyboard) return step("storyboard", "请用户看 snapshots/sheet.jpg（确认节点 ②）", "storyboard");
    if (!f.hasRender) return step("render", "nv render 渲染成片（自带成片检查）");
  }
```

JSDoc 的 `waitingFor` 类型补上 `"director"|"sample"`。

- [ ] **Step 4：实现 `kv.mjs`**

```js
const GATE_LABEL = { script: "① 研究简报 + 脚本", storyboard: "② 分镜总览图", director: "②a 导演脚本", sample: "②b 风格样片", final: "③ 成片" };
const CONCEPT_GATES = { template: ["script", "storyboard", "final"], director: ["script", "director", "sample", "final"] };
```

`collectFacts` 返回值改为（`video` 在函数开头 `const video = videoMode(run);`；import `DIRECTOR_DIR, FINAL_RE`）：

```js
  const vdQaPath = join(dir, DIRECTOR_DIR, "qa-douyin.json");
  let vdQa = null;
  if (existsSync(vdQaPath)) {
    try { vdQa = { passed: JSON.parse(readFileSync(vdQaPath, "utf8")).passed === true }; } catch { vdQa = { passed: false }; }
  }
  return {
    type,
    video,
    hasBrief: …（不变）,
    hasEvidence: …（不变）,
    hasScript: …（不变）,
    checkOk: …（不变）,
    hasStoryboard: existsSync(join(dir, "抖音/STORYBOARD.md")),
    hasSheet: existsSync(join(dir, "抖音/snapshots/sheet.jpg")),
    hasDirector: existsSync(join(dir, DIRECTOR_DIR, "DIRECTOR.md")),
    hasSample: existsSync(join(dir, DIRECTOR_DIR, "renders/sample.mp4")),
    hasRender: video === "director" ? hasFileIn(dir, `${DIRECTOR_DIR}/renders`, FINAL_RE) : hasFileIn(dir, "抖音/renders", /\.mp4$/),
    vdQa,
    qa,
    gates: Object.fromEntries(CONCEPT_GATES[video].map((k) => [k, gate(k)])),
  };
```

`printStatus` 第一行改为 `console.log(\`类型：${TYPE_LABEL[f.type]}（视频做法 ${f.video}）\`);`（其余不变：`确认节点` 那行遍历 `f.gates`，自然按做法列出）。

先确认 `kv.test.mjs` 里现有断言没有 `^类型：概念科普$` 这种整行匹配（现有是 `/类型：概念科普/`，加后缀仍匹配）。

- [ ] **Step 5：模板**

`templates/run.json` 改为：

```json
{
  "type": "concept",
  "video": "director",
  "stage": "brief",
  "gates": {
    "script": { "passed": false, "at": null, "edits": [] },
    "storyboard": { "passed": false, "at": null, "edits": [] },
    "director": { "passed": false, "at": null, "edits": [] },
    "sample": { "passed": false, "at": null, "edits": [] },
    "final": { "passed": false, "at": null, "edits": [] }
  }
}
```

- [ ] **Step 6：跑测试确认通过**

Run: `npm test --prefix skills/knowledge-video 2>&1 | tail -5`
Expected: 全部 pass（`templates.test.mjs` 若断言 run.json 的键，同 Task 4 Step 10 处理）

- [ ] **Step 7：提交**

```bash
cd /home/power/self-media
git add skills/knowledge-video
git commit -m "feat: kv 概念科普支持 director 做法（新作品默认 director）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6：文档 + 用第 1 课实跑 kv status

**Files:**
- Modify: `skills/knowledge-video/SKILL.md`
- Modify: `skills/video-director/SKILL.md`（流程表上方加「在 kv 里」一段）

- [ ] **Step 1：`knowledge-video/SKILL.md`**

- description 末尾「配音、分镜、渲染交给 narrated-video」改为「配音、分镜、渲染交给 narrated-video；`run.json` 的 `video: director` 时抖音视频交给 video-director」。
- 「实用类」一节命令表 `kv gate` 行节点列表改为 `<topic|script|storyboard|director|sample|final>`；`kv init` 行改为 `kv init <作品> [--video director|template]`：老作品补 run.json；新作品要用导演流程时加 `--video director`。
- 14 步那段后加：

```markdown
**视频做法**（`run.json` 的 `video`，没写按 `template`）：
- `template`：上面 14 步，第 8 步 `nv hf-build` 分镜 ③
- `director`：第 8 步换成两步，共 15 步——8 配音 + 导演脚本（`抖音-director/DIRECTOR.md`，`vd cues --check` 通过）**③a**；9 风格样片（`抖音-director/renders/sample.mp4`）**③b**；10 渲染 + QA 要 `vd qa` 无 ✗、`qa.json` 通过 **④**。改了 DIRECTOR.md 或配音 ③a 失效，换了样片 ③b 失效。`kv status` 调用 `vd cues --check`，命令名可用 `KV_VD_CMD` 换掉
- 中途换做法：手改 `run.json` 的 `video`；已通过的节点按新做法重新算
```

- 「阶段」表第 3 行「分镜」后补一句：「`video: director` 时换成 ②a 导演脚本（DIRECTOR.md）→ ②b 风格样片，见 video-director」。概念科普新作品的 `templates/run.json` 默认 `video: director`。

- [ ] **Step 2：`video-director/SKILL.md`**

流程表前加：

```markdown
**在 kv 里**：作品 `run.json` 写 `"video": "director"` 后，`kv status` 按下面的步骤指引（实用类的 ③a / ③b / ④，概念科普的 ②a / ②b / ③），用户确认后 `kv gate <作品> director|sample|final "原话"`。样片固定输出到 `renders/sample.mp4`，对比视频 `renders/compare.mp4`——这两个名字 kv 不当正式成片。
```

- [ ] **Step 3：用第 1 课实跑**

```bash
cd /home/power/self-media
cp 04-作品/普通人的AI课/01-同事半小时/run.json "$SCRATCH/run.json.bak" 2>/dev/null || true   # $SCRATCH = 本会话 scratchpad
node skills/knowledge-video/scripts/kv.mjs status 04-作品/普通人的AI课/01-同事半小时
```

Expected: 按 template 显示（14 步，和改动前一样）。然后在 scratchpad 里复制一份作品目录（不改原作品），把副本的 `run.json` 加 `"video": "director"`，再 `kv status <副本>`：
- 第 8 步：`抖音-director/` 里有 DIRECTOR.md、配音 → 看 `vd cues --check` 的结果
- 第 9 步：副本 `抖音-director/renders/` 里没有 `sample.mp4`（原工程的样片叫 `sample.mp4` 的话会显示 ✓）
- 读输出，确认每一步的「下一步」说法对得上 video-director SKILL.md

（作品目录是 git 忽略的，这一步不提交；副本用完删掉。）

- [ ] **Step 4：两边全量测试并提交**

```bash
cd /home/power/self-media
npm test --prefix skills/knowledge-video 2>&1 | tail -3
npm test --prefix skills/video-director 2>&1 | tail -3
git add skills/knowledge-video/SKILL.md skills/video-director/SKILL.md
git commit -m "docs: kv 和 video-director 的接入说明（video 字段、③a/③b、vd qa）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: 两边测试全过。

---

## 验收（设计文档第 2 阶段）

本计划完成后，验收要「用新流程从头做一期新主题，全程 kv status 指引正确」——那是真实做一期内容，要你选题、确认各个节点，不在本计划里自动完成。计划做完时交付：代码 + 测试 + 第 1 课副本的 kv status 实跑输出 + `vd qa` 在第 1 课导演工程上的结果和总览图。
