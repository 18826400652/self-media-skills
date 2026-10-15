# video-director 接入 dykit 组件 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 video-director 做视频时能直接用 GitHub 上 hyperframes 仓库的 dykit 组件（按锁定的提交号获取、套用每条视频自己的配色），并在制作中提示哪些画面值得固化成新组件。

**Architecture:** 分两部分。A（hyperframes 仓库）：公开前安全扫描，用户确认后设为公开；dykit 新增 `custom` 主题，颜色和字体从外层的 `--hf-custom-*` 变量读取。B（self-media 的 video-director）：`DIRECTOR.md` 的分段可以写 `component` + `vars`；`vd build` 按 `components.lock.json` 里的提交号从 `codeload.github.com` 下载仓库压缩包（缓存在 `~/.cache/video-director/`），按 `registry/` 清单把组件和 `dykit` 资源包复制进工程，宿主元素带 `data-theme="custom"` 和这条视频的配色；`DIRECTOR.md` 新增「## 8. 组件候选」，`vd check` 列出来，关卡 ④ 交给用户。

**Tech Stack:** Node 22 ESM、`node --test`、curl + tar（下载解包，curl 自带代理支持）、HyperFrames CLI 0.8.143、dykit（`theme.css` CSS 变量主题）。

**Spec:** 本计划依据 2026-10-14 对话中用户确认的方案（下方「已确认的决定」），以及 `docs/superpowers/specs/2026-10-14-video-director-design.md`（video-director 本体）。

## 已确认的决定（用户 2026-10-14）

| 问题 | 决定 |
|---|---|
| dykit 放哪 | 留在 hyperframes 仓库，单独维护；self-media 不复制组件 |
| 怎么取组件 | 从 GitHub 取，不依赖本机 `/home/power/hyperframes` 目录 |
| 仓库可见性 | 设为公开（A）；公开前先做安全扫描，用户看过结果再执行 |
| 配色 | dykit 新增 `custom` 自定义配色主题（同意） |
| 版本 | 新工程第一次构建时取最新提交号并锁定；`--update-components` 升级 |
| 组件候选 | 制作中提示可固化的画面，用户决定是否提交到 hyperframes |
| `e960db7`（字体、GSAP 放进 self-media） | 保留（基础运行环境，与组件无关） |

## Global Constraints

- GitHub 仓库：`18826400652/hyperframes`，分支 `main`。
- 下载地址：最新提交号 `https://api.github.com/repos/18826400652/hyperframes/commits/main`（取 `.sha`）；压缩包 `https://codeload.github.com/18826400652/hyperframes/tar.gz/<sha>`。一律用 `curl`（走系统代理），不用 Node 的 `fetch`。
- 缓存目录：`~/.cache/video-director/hyperframes/<sha>/`（解包后的仓库根目录）。
- 锁文件：视频工程根目录的 `components.lock.json`，内容 `{ "repo": "18826400652/hyperframes", "sha": "<40 位>" }`。
- dykit 组件 id 格式：`/^dy-[a-z0-9-]+$/`；资源包 block 名 `dykit`。
- `custom` 主题变量：`--hf-custom-bg`、`--hf-custom-text`、`--hf-custom-muted`、`--hf-custom-accent`、`--hf-custom-alert`、`--hf-custom-font-title`、`--hf-custom-font-body`。
- 现有 4 套主题（minimal / neon / editorial / bento）的视觉不得改变。
- HyperFrames CLI 固定 `hyperframes@0.8.143`；所有报错中文。
- hyperframes 仓库在用户确认安全扫描结果之前**不得**改为公开。

## Review Focus

1. **断网或 GitHub 访问失败**：已缓存的提交号照常构建；没缓存时报中文错误（说明是网络问题、给出要下载的地址），不能留下半截的缓存目录。→ Task B1 测试 `fetchArchive 下载失败不留半截缓存`。
2. **`DIRECTOR.md` 写了仓库里不存在的组件名**：报错并列出相近的组件名，不能装一个空文件。→ Task B1 测试 `installComponent 组件不存在`。
3. **同一个组件在两段里都用**：两个宿主各自的变量互不影响，宿主 id 不重复。→ Task B3 测试 `同一组件用两次`。
4. **配色里有深色背景**（不都是浅色纸面）：`custom` 主题下文字对比度仍要通过 `hyperframes check` 的 WCAG 检查。→ Task A2 用深色配色跑一遍对比度检查。
5. **重复 `vd build`**：不重复下载、不改锁文件；`--update-components` 才会换提交号。→ Task B4 测试 `ensureLock 已有锁文件不变`。

---

## 部分 A：hyperframes 仓库

工作目录：`/home/power/hyperframes`，分支 `feat/custom-theme`（从 `main` 切出）。

### Task A1: 公开前安全扫描（只读，结果给用户确认）

**Files:**
- Create: `/home/power/self-media/.superpowers/sdd/2026-10-14-video-director-components/security-scan.md`（扫描报告，不入库）

**Interfaces:**
- Produces: 一份报告，用户确认后才执行 Task A3。

- [ ] **Step 1: 扫描所有提交历史里的敏感字符串**

```bash
cd /home/power/hyperframes
git log -p --all | grep -nIE '(api[_-]?key|secret|token|passw(or)?d|authorization|bearer|BEGIN [A-Z ]*PRIVATE KEY|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})' | grep -vE 'design-tokens|tokens\.json|--hf-|token:' | head -50
```
Expected: 输出逐条人工判断（变量名、文档说明不算泄露；真实密钥值才算）。

- [ ] **Step 2: 列出所有提交过的文件，找不该公开的**

```bash
git log --all --name-only --pretty=format: | sort -u | grep -vE '^$' > /tmp/hf-files.txt
grep -nE '\.env|credential|\.pem|\.key$|id_rsa|\.heygen|cookies|\.sqlite|\.db$' /tmp/hf-files.txt
wc -l /tmp/hf-files.txt
```
Expected: 列出可疑文件名（无则为空）。

- [ ] **Step 3: 检查个人信息和图片素材**

```bash
git log --all -p | grep -noE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}' | sort -u -t: -k3 | head
git log --all --name-only --pretty=format: | grep -iE '\.(png|jpe?g|mp4|wav|mp3)$' | sort -u
```
Expected: 邮箱只应出现在提交作者信息里；逐个打开图片、视频素材（`tests/media/*` 等）确认没有个人截图、聊天记录、账号信息。

- [ ] **Step 4: 写报告并停下来等用户确认**

报告包含：三步各自的发现（无发现也写「无」）、需要处理的项和建议（如从历史中删除某文件需要 `git filter-repo`，属于破坏性操作，单独征求同意）、结论「可以公开 / 需要先处理」。**把报告给用户看，用户明确说可以公开后才做 Task A3。**

---

### Task A2: dykit 新增 `custom` 自定义配色主题

**Files:**
- Modify: `assets/dykit/theme.css`（末尾追加 `[data-theme="custom"]` 块）
- Modify: `tests/lib.mjs:8`（`THEMES` 加 `"custom"`）、`tests/lib.mjs:44-56`（`custom` 时根元素写入测试配色）
- Modify: `README.md`（主题一节加 custom 的用法）、`.claude/skills/dykit-storyboard/SKILL.md`、`component-guide.md`（4 主题 → 5 主题）

**Interfaces:**
- Produces: 宿主元素写 `data-theme="custom"` 和 `--hf-custom-*`（见 Global Constraints）后，组件按这些颜色和字体绘制；没写的变量用默认值（浅色纸面）。B3 依赖这组变量名。

- [ ] **Step 1: 测试先行：`THEMES` 加 `custom`，夹具写入测试配色**

`tests/lib.mjs` 第 8 行改为：
```js
export const THEMES = ["minimal", "neon", "editorial", "bento", "custom"];
// custom 主题的测试配色：一套浅色、一套深色（深色用来查对比度），按组件名交替使用
export const CUSTOM_PALETTES = [
  { bg: "#F1ECE2", text: "#1C1A17", muted: "#6E675C", accent: "#FFD84D", alert: "#D2372A", title: '"Noto Serif SC Variable", serif', body: '"Noto Sans SC Variable", sans-serif' },
  { bg: "#101114", text: "#F4F1EA", muted: "#8A8D96", accent: "#FFD84D", alert: "#FF5A5F", title: '"Noto Sans SC Variable", sans-serif', body: '"Noto Sans SC Variable", sans-serif' },
];
export const customStyle = (p) => `--hf-custom-bg:${p.bg};--hf-custom-text:${p.text};--hf-custom-muted:${p.muted};--hf-custom-accent:${p.accent};--hf-custom-alert:${p.alert};--hf-custom-font-title:${p.title};--hf-custom-font-body:${p.body}`;
```
`buildFixture` 里根元素那一行改为（`custom` 时写配色；按组件 id 的字符码之和选浅色或深色）：
```js
  const pal = CUSTOM_PALETTES[[...c.component].reduce((s, ch) => s + ch.charCodeAt(0), 0) % CUSTOM_PALETTES.length];
  const rootStyle = theme === "custom" ? ` style="${customStyle(pal).replaceAll('"', "&quot;")}"` : "";
```
并把模板中的 `<div id="root" data-composition-id="main" data-theme="${theme}"` 改为 `<div id="root" data-composition-id="main" data-theme="${theme}"${rootStyle}`。

- [ ] **Step 2: 跑一个组件的 custom 主题，确认失败**

Run: `cd /home/power/hyperframes && node tests/run.mjs dy-scene-title`
Expected: minimal/neon/editorial/bento 通过，`custom` 失败（`theme.css` 里没有 custom，背景和文字颜色回落到 `:root` 的 minimal，对比度或视觉检查与预期不符；若意外通过，打开 `tests/.out/dy-scene-title-custom` 的截图确认确实是 minimal 的黑底蓝字——那也算失败，继续下一步）。

- [ ] **Step 3: 在 `assets/dykit/theme.css` 末尾追加 custom 主题**

```css
/* custom:颜色和字体由外层元素的 --hf-custom-* 变量提供(video-director 每条视频的配色)。
   没提供的用浅色纸面默认值。装饰层全部关闭,版面交给调用方。 */
[data-theme="custom"] {
  --hf-bg: var(--hf-custom-bg, #f1ece2); --hf-bg-2: color-mix(in srgb, var(--hf-bg) 92%, var(--hf-text)); --hf-bg-v2: var(--hf-bg-2);
  --hf-text: var(--hf-custom-text, #1c1a17); --hf-muted: var(--hf-custom-muted, #6e675c);
  --hf-surface: color-mix(in srgb, var(--hf-bg) 88%, var(--hf-text)); --hf-surface-border: color-mix(in srgb, var(--hf-text) 22%, var(--hf-bg)); --hf-surface-shadow: 0 24px 48px rgba(0, 0, 0, 0.14);
  --hf-accent: var(--hf-custom-accent, #ffd84d); --hf-accent-2: var(--hf-custom-alert, #d2372a);
  --hf-on-accent: var(--hf-text); --hf-on-accent-2: #ffffff;
  --hf-font-title: var(--hf-custom-font-title, "Noto Sans SC Variable", sans-serif);
  --hf-font-body: var(--hf-custom-font-body, "Noto Sans SC Variable", sans-serif);
  --hf-font-mono: "JetBrains Mono", "Noto Sans SC Variable", monospace;
  --hf-title-weight: 900; --hf-radius: 14px;
  --hf-ease: power3.out; --hf-ease-out: power2.in; --hf-dur: 0.5; --hf-stagger: 0.15;
  --hf-title-shadow: none;
  --hf-em-bg: linear-gradient(transparent 52%, var(--hf-accent) 52%, var(--hf-accent) 92%, transparent 92%); --hf-em-clip: border-box; --hf-em-fill: currentColor; --hf-em-shadow: none; --hf-em-pad: 0 0.12em;
  --hf-kicker-font: var(--hf-font-mono); --hf-kicker-color: var(--hf-muted); --hf-kicker-bg: none; --hf-kicker-border: 0 solid transparent; --hf-kicker-rule: 0 solid transparent; --hf-kicker-pad: 0; --hf-kicker-radius: 0;
  --hf-card-bg: var(--hf-surface); --hf-card-bw: 2px; --hf-card-radius: var(--hf-radius); --hf-card-clip: none;
  --hf-panel: color-mix(in srgb, var(--hf-bg) 94%, transparent); --hf-panel-bw: 2px;
  --hf-bg-a-img: none; --hf-bg-a-size: auto; --hf-bg-a-repeat: no-repeat; --hf-bg-a-opacity: 0;
  --hf-bg-b-img: none; --hf-bg-b2-img: none; --hf-bg-b-size: 100% 100%; --hf-bg-b-pos: 0 0; --hf-bg-b-mask: none;
  --hf-bg-c-img: none; --hf-bg-c-size: auto; --hf-bg-c-mask: none;
}
```
注意：`theme.css` 中现有主题块里可能还有本计划未列出的变量（如 `--hf-bg-a-pos` 等）。实现时用 `grep -oE -- '--hf-[a-z0-9-]+:' assets/dykit/theme.css | sort -u` 列出 `editorial` 块定义的全部变量，`custom` 块必须逐个给出，一个都不能少（否则会从 `:root` 继承 minimal 的值）。

- [ ] **Step 4: 跑全部组件 × 5 主题**

Run: `cd /home/power/hyperframes && npm test > tests/.out/full.log 2>&1; tail -5 tests/.out/full.log; grep -c FAIL tests/.out/full.log`
Expected: `all passed`，FAIL 计数 0（`registry.test.mjs` 不受影响）。约 25 分钟，后台跑。有组件在 custom 下失败时，先看是 theme.css 漏了变量（修 theme.css）还是组件写死了颜色（记下来，修组件让它用主题变量）。

- [ ] **Step 5: 生成对比图人工看两张**

Run: `node tests/sheet.mjs dy-scene-title && node tests/sheet.mjs dy-rec-phone`
Expected: `tests/.out/*-themes.png` 第 5 列是 custom，浅色或深色配色正确、字体对、无溢出。

- [ ] **Step 6: README 加用法并提交**

`README.md` 主题一节追加：
```markdown
### custom（自定义配色）

给宿主元素写 `data-theme="custom"` 和这些 CSS 变量，组件就按你的颜色和字体画：
`--hf-custom-bg` `--hf-custom-text` `--hf-custom-muted` `--hf-custom-accent` `--hf-custom-alert` `--hf-custom-font-title` `--hf-custom-font-body`。
没写的用浅色纸面默认值。装饰背景层在 custom 下全部关闭。
```
`.claude/skills/dykit-storyboard/SKILL.md` 和 `component-guide.md` 里所有「4 主题」「4 个主题」改成「5 主题」，并在 component-guide 的主题要求里加一句：「组件只用 `--hf-*` 主题变量，不写死颜色和字体，custom 主题才能套用每条视频的配色」。
```bash
git checkout -b feat/custom-theme
git add assets/dykit/theme.css tests/lib.mjs README.md .claude/skills/dykit-storyboard
git commit -m "feat: dykit 新增 custom 自定义配色主题(颜色、字体来自 --hf-custom-* 变量)"
```

---

### Task A3: 合并、推送、设为公开（需要用户已确认 Task A1 报告）

- [ ] **Step 1: registry 一致性检查**

Run: `node scripts/build-registry.mjs --check`
Expected: `registry/ is up to date`（主题文件通过 url 引用，不复制进 registry）。

- [ ] **Step 2: 合并到 main 并推送**

```bash
git checkout main && git merge --ff-only feat/custom-theme && git branch -d feat/custom-theme
NODE_USE_ENV_PROXY=1 git push origin main
```

- [ ] **Step 3: 设为公开（用户确认后）**

```bash
gh repo edit 18826400652/hyperframes --visibility public --accept-visibility-change-consequences
curl -sS -o /dev/null -w "%{http_code}\n" https://raw.githubusercontent.com/18826400652/hyperframes/main/registry/registry.json
curl -sS https://api.github.com/repos/18826400652/hyperframes/commits/main | grep -m1 '"sha"'
```
Expected: `200`；打印出最新提交号。

---

## 部分 B：self-media 的 video-director

工作目录：`/home/power/self-media`，分支 `feat/vd-components`（从 `main` 切出）。所有测试：`npm test --prefix skills/video-director`。

### Task B1: 组件获取（锁定版本、下载缓存、安装）

**Files:**
- Create: `skills/video-director/scripts/lib/components.mjs`
- Create: `skills/video-director/tests/components.test.mjs`

**Interfaces:**
- Consumes: `run(cmd, args, { cwd })`（`scripts/lib/run.mjs`）
- Produces:
  - `REPO = "18826400652/hyperframes"`
  - `latestSha(runFn = run) → string`（40 位；失败抛中文错误）
  - `readLock(dir) → { repo, sha } | null`、`writeLock(dir, sha) → void`
  - `ensureLock(dir, { update = false } = {}, runFn = run) → string`（返回要用的 sha）
  - `fetchArchive(sha, cacheRoot, runFn = run) → string`（返回解包后的仓库根目录；已存在直接返回）
  - `installComponent(archiveDir, name, projectDir) → string[]`（返回写入的相对路径，含依赖 `dykit` 的文件；组件不存在抛错并给相近名字）

- [ ] **Step 1: 写失败的测试**

```js
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { REPO, ensureLock, fetchArchive, installComponent, latestSha, readLock } from "../scripts/lib/components.mjs";
import { project } from "./helpers.mjs";

const SHA = "a".repeat(40), SHA2 = "b".repeat(40);

/** 假仓库：registry 清单 + 组件源 + dykit 资源包 */
function fakeRepo() {
  return project({
    "registry/registry.json": { items: [{ name: "dykit" }, { name: "dy-scene-title" }, { name: "dy-scene-steps" }] },
    "registry/blocks/dykit/registry-item.json": { name: "dykit", files: [
      { path: "assets/dykit/dykit.css", url: "https://x/main/assets/dykit/dykit.css", target: "assets/dykit/dykit.css" },
      { path: "assets/dykit/theme.css", url: "https://x/main/assets/dykit/theme.css", target: "assets/dykit/theme.css" } ] },
    "registry/blocks/dy-scene-title/registry-item.json": { name: "dy-scene-title", registryDependencies: ["dykit"], files: [{ path: "dy-scene-title.html", target: "compositions/dy-scene-title.html" }] },
    "registry/blocks/dy-scene-title/dy-scene-title.html": "<html>title</html>",
    "assets/dykit/dykit.css": "/* css */", "assets/dykit/theme.css": "/* theme */",
  });
}

test("latestSha：解析 GitHub API 的 sha；失败给中文错误", () => {
  assert.equal(latestSha(() => ({ status: 0, stdout: JSON.stringify({ sha: SHA }) })), SHA);
  assert.throws(() => latestSha(() => ({ status: 6, stdout: "", stderr: "Could not resolve host" })), /取不到 18826400652\/hyperframes 的最新提交号.*网络/);
});

test("ensureLock：没有锁文件时取最新并写入；已有锁文件不变（不联网）；--update 换成最新", () => {
  const dir = project({});
  assert.equal(ensureLock(dir, {}, () => ({ status: 0, stdout: JSON.stringify({ sha: SHA }) })), SHA);
  assert.deepEqual(readLock(dir), { repo: REPO, sha: SHA });
  assert.equal(ensureLock(dir, {}, () => { throw new Error("不应联网"); }), SHA);
  assert.equal(ensureLock(dir, { update: true }, () => ({ status: 0, stdout: JSON.stringify({ sha: SHA2 }) })), SHA2);
  assert.equal(readLock(dir).sha, SHA2);
});

test("fetchArchive：已缓存直接返回，不下载", () => {
  const cache = project({ [`${SHA}/registry/registry.json`]: "{}" });
  assert.equal(fetchArchive(SHA, cache, () => { throw new Error("不应下载"); }), join(cache, SHA));
});

test("fetchArchive 下载失败不留半截缓存，报中文错误并给出地址", () => {
  const cache = project({});
  assert.throws(() => fetchArchive(SHA, cache, () => ({ status: 22, stdout: "", stderr: "404" })), /下载组件库失败.*codeload\.github\.com\/18826400652\/hyperframes\/tar\.gz\/a{40}/);
  assert.equal(existsSync(join(cache, SHA)), false);
});

test("installComponent：复制组件和 dykit 资源包（资源从仓库路径取，不看 url）", () => {
  const repo = fakeRepo(), proj = project({});
  const files = installComponent(repo, "dy-scene-title", proj);
  assert.deepEqual(files.sort(), ["assets/dykit/dykit.css", "assets/dykit/theme.css", "compositions/dy-scene-title.html"]);
  assert.equal(readFileSync(join(proj, "compositions/dy-scene-title.html"), "utf8"), "<html>title</html>");
});

test("installComponent 组件不存在：报错并列出相近的组件名", () => {
  assert.throws(() => installComponent(fakeRepo(), "dy-scene-titel", project({})), /组件库里没有 dy-scene-titel.*dy-scene-title/);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test skills/video-director/tests/components.test.mjs`
Expected: FAIL，`Cannot find module '../scripts/lib/components.mjs'`

- [ ] **Step 3: 实现 `scripts/lib/components.mjs`**

```js
// dykit 组件：按锁定的提交号从 GitHub 下载 hyperframes 仓库，按 registry 清单把组件装进工程
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { run } from "./run.mjs";

export const REPO = "18826400652/hyperframes";
const LOCK = "components.lock.json";
const SHA_RE = /^[0-9a-f]{40}$/;

export function latestSha(runFn = run) {
  const url = `https://api.github.com/repos/${REPO}/commits/main`;
  const r = runFn("curl", ["-fsSL", "--max-time", "30", url]);
  const sha = r.status === 0 ? (() => { try { return JSON.parse(r.stdout).sha; } catch { return null; } })() : null;
  if (!SHA_RE.test(sha ?? "")) throw new Error(`取不到 ${REPO} 的最新提交号（${url}）：检查网络和代理。${(r.stderr || "").trim()}`);
  return sha;
}

export function readLock(dir) {
  const p = join(dir, LOCK);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
}

export function writeLock(dir, sha) {
  writeFileSync(join(dir, LOCK), JSON.stringify({ repo: REPO, sha }, null, 2) + "\n");
}

export function ensureLock(dir, { update = false } = {}, runFn = run) {
  const lock = readLock(dir);
  if (lock && !update) return lock.sha;
  const sha = latestSha(runFn);
  writeLock(dir, sha);
  console.log(`✓ 组件库锁定到 ${REPO}@${sha.slice(0, 7)}`);
  return sha;
}

/** 下载并解包到 cacheRoot/<sha>；先解到临时目录，成功后再改名，失败不留半截 */
export function fetchArchive(sha, cacheRoot, runFn = run) {
  const dest = join(cacheRoot, sha);
  if (existsSync(join(dest, "registry/registry.json"))) return dest;
  mkdirSync(cacheRoot, { recursive: true });
  const tmp = mkdtempSync(join(cacheRoot, ".tmp-"));
  const url = `https://codeload.github.com/${REPO}/tar.gz/${sha}`;
  try {
    const dl = runFn("curl", ["-fsSL", "--max-time", "300", "-o", join(tmp, "repo.tgz"), url]);
    if (dl.status !== 0) throw new Error(`下载组件库失败（${url}）：${(dl.stderr || "").trim()}`);
    mkdirSync(join(tmp, "repo"));
    const x = runFn("tar", ["-xzf", join(tmp, "repo.tgz"), "-C", join(tmp, "repo"), "--strip-components=1"]);
    if (x.status !== 0) throw new Error(`解包组件库失败：${x.stderr}`);
    renameSync(join(tmp, "repo"), dest);
    return dest;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function item(archiveDir, name) {
  const p = join(archiveDir, "registry/blocks", name, "registry-item.json");
  if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8"));
  const all = JSON.parse(readFileSync(join(archiveDir, "registry/registry.json"), "utf8")).items.map((i) => i.name);
  const near = all.map((n) => [[...n].filter((c, k) => c === name[k]).length, n]).sort((a, b) => b[0] - a[0]).slice(0, 3).map((x) => x[1]);
  throw new Error(`组件库里没有 ${name}。相近的：${near.join("、")}`);
}

export function installComponent(archiveDir, name, projectDir, seen = new Set()) {
  if (seen.has(name)) return [];
  seen.add(name);
  const it = item(archiveDir, name);
  const out = [];
  for (const dep of it.registryDependencies ?? []) out.push(...installComponent(archiveDir, dep, projectDir, seen));
  for (const f of it.files) {
    // 有 url 的是仓库路径（dykit 资源包），没有的在 registry/blocks/<name>/ 下
    const src = f.url ? join(archiveDir, f.path) : join(archiveDir, "registry/blocks", name, f.path);
    const dst = join(projectDir, f.target);
    mkdirSync(dirname(dst), { recursive: true });
    cpSync(src, dst);
    out.push(f.target);
  }
  return out;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test skills/video-director/tests/components.test.mjs`
Expected: PASS（6 个测试）

- [ ] **Step 5: 提交**

```bash
git checkout -b feat/vd-components
git add skills/video-director/scripts/lib/components.mjs skills/video-director/tests/components.test.mjs
git commit -m "工具: vd 按锁定提交号从 GitHub 获取 dykit 组件（缓存、失败不留半截、组件名纠错）"
```

---

### Task B2: `DIRECTOR.md` 支持组件段落和「组件候选」

**Files:**
- Modify: `skills/video-director/scripts/lib/director.mjs`
- Modify: `skills/video-director/tests/director.test.mjs`、`tests/templates.test.mjs`
- Modify: `skills/video-director/templates/DIRECTOR.md`

**Interfaces:**
- Produces:
  - `SECTIONS` 末尾增加 `"## 8. 组件候选"`
  - 分段对象可选 `component`（必须匹配 `/^dy-[a-z0-9-]+$/`）和 `vars`（对象）
  - `parseDirector(md).candidates → [{ scene, name, vars, from }]`：从第 8 节的表格读（表头 `| 画面 | 建议组件名 | 变量 | 来源段 |`，跳过表头和分隔行，「无」行忽略）

- [ ] **Step 1: 写失败的测试（追加到 `tests/director.test.mjs`；同时把测试里的 `SECTIONS` 常量加上 `"## 8. 组件候选"`）**

```js
test("分段可以直接用 dykit 组件：component 名必须是 dy-…，vars 必须是对象", () => {
  const ok = parseDirector(doc({ ...VD, segments: [{ id: "seg-01-hook", lines: [1, 2], component: "dy-scene-title", vars: { title: "x" } }, { id: "seg-02-why", lines: [3, 3] }] }));
  assert.deepEqual(ok.errors, []);
  const bad = parseDirector(doc({ ...VD, segments: [{ id: "a", lines: [1, 3], component: "scene-title", vars: "x" }] }));
  assert.match(bad.errors.join("\n"), /segments\[0\]\.component 必须是 dykit 组件名（dy-开头）/);
  assert.match(bad.errors.join("\n"), /segments\[0\]\.vars 必须是对象/);
});

test("组件候选：读第 8 节的表格，跳过表头、分隔行和「无」", () => {
  const table = ["| 画面 | 建议组件名 | 变量 | 来源段 |", "|---|---|---|---|", "| 文件被盖红章 | dy-stamp | text, color | seg-01-hook |", "| 无 | | | |"].join("\n");
  const md = doc().replace("## 8. 组件候选\n\n", `## 8. 组件候选\n\n${table}\n\n`);
  assert.deepEqual(parseDirector(md).candidates, [{ scene: "文件被盖红章", name: "dy-stamp", vars: "text, color", from: "seg-01-hook" }]);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test skills/video-director/tests/director.test.mjs`
Expected: 新增 2 个测试 FAIL

- [ ] **Step 3: 实现**

`director.mjs`：`SECTIONS` 末尾加 `"## 8. 组件候选"`；`checkVd` 里加：
```js
  (vd.segments ?? []).forEach((s, i) => {
    if (s.component !== undefined && !/^dy-[a-z0-9-]+$/.test(s.component)) e.push(`segments[${i}].component 必须是 dykit 组件名（dy-开头）`);
    if (s.vars !== undefined && (typeof s.vars !== "object" || Array.isArray(s.vars) || s.vars === null)) e.push(`segments[${i}].vars 必须是对象`);
  });
```
`parseDirector` 返回值加 `candidates: parseCandidates(md)`：
```js
function parseCandidates(md) {
  const at = md.indexOf("## 8. 组件候选");
  if (at < 0) return [];
  const body = md.slice(at).split("\n").slice(1);
  const out = [];
  for (const line of body) {
    if (line.startsWith("## ") || line.startsWith("```")) break;
    if (!line.trim().startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells[0] === "画面" || /^-+$/.test(cells[0].replaceAll(":", "")) || cells[0] === "无" || !cells[0]) continue;
    out.push({ scene: cells[0], name: cells[1] ?? "", vars: cells[2] ?? "", from: cells[3] ?? "" });
  }
  return out;
}
```

`templates/DIRECTOR.md` 在 `## 7. 样片范围` 一节之后、机器块之前插入：
```markdown
## 8. 组件候选

做完每一段都回来填：这段里有没有「换文字就能复用」的画面？有就写一行，交成片时一起给用户决定要不要提交到 hyperframes（dykit）。没有写「无」。

| 画面 | 建议组件名 | 变量 | 来源段 |
|---|---|---|---|
| 无 | | | |
```
机器块示例的第一个分段旁加一个组件分段示例：`{ "id": "seg-02-steps", "lines": [3, 3], "component": "dy-scene-steps", "vars": { "title": "……", "steps": "第一步::说明|第二步::说明" } }`，并把 `sample.segments` 保持为已有段。

- [ ] **Step 4: 跑全部测试**

Run: `npm test --prefix skills/video-director`
Expected: 全部通过（`templates.test.mjs` 仍要求模板唯一的问题是「（待填）」——第 8 节的「无」不是「（待填）」，不应报错）

- [ ] **Step 5: 提交**

```bash
git add skills/video-director/scripts/lib/director.mjs skills/video-director/tests/director.test.mjs skills/video-director/tests/templates.test.mjs skills/video-director/templates/DIRECTOR.md
git commit -m "工具: DIRECTOR.md 分段可直接用 dykit 组件；新增第 8 节组件候选"
```

---

### Task B3: 总装组件段落（custom 配色、dykit 资源）

**Files:**
- Modify: `skills/video-director/scripts/lib/assemble.mjs`
- Modify: `skills/video-director/tests/assemble.test.mjs`
- Modify: `skills/video-director/templates/index.html`（`<head>` 里加 `<!-- vd:head --><!-- /vd:head -->`）

**Interfaces:**
- Consumes: Task B2 的 `segment.component` / `segment.vars`；`vd.palette`；`vd.fonts`（可选：`{ "title": "serif" | "sans", "body": "serif" | "sans" }`，默认 title=serif、body=sans）
- Produces:
  - `customVars(palette, fonts) → string`（宿主 `style` 里的 `--hf-custom-*`）
  - `segmentHosts(segments, only, palette, fonts)`：有 `component` 的段 → `data-composition-src="compositions/<component>.html"`、`data-composition-id="<component>"`、`data-theme="custom"`、`style` 带 `--hf-custom-*`、`data-variable-values` 为 `vars`；宿主 id 仍是 `host-<段id>`
  - `headBlock(hasComponents) → string`：有组件时引入 `assets/dykit/dykit.css` 和 `assets/dykit/hf-kit.js`，没有时为空
  - `assemble(...)` 增加替换 `vd:head`；工程的 `index.html` 缺这个标记时报错（提示从模板复制这一行）

- [ ] **Step 1: 写失败的测试（追加到 `tests/assemble.test.mjs`）**

```js
const PAL = { bg: "#F1ECE2", ink: "#1C1A17", muted: "#6E675C", accent: "#FFD84D", alert: "#D2372A" };

test("customVars：配色和字体变成 --hf-custom-* 变量", () => {
  const v = customVars(PAL, { title: "serif", body: "sans" });
  assert.match(v, /--hf-custom-bg:#F1ECE2;--hf-custom-text:#1C1A17;--hf-custom-muted:#6E675C;--hf-custom-accent:#FFD84D;--hf-custom-alert:#D2372A/);
  assert.match(v, /--hf-custom-font-title:var\(--vd-serif\);--hf-custom-font-body:var\(--vd-sans\)/);
});

test("segmentHosts：组件段落用组件源文件、custom 主题、变量", () => {
  const segs = [{ id: "seg-02", start: 3, duration: 4, component: "dy-scene-steps", vars: { title: "三步" } }];
  const h = segmentHosts(segs, null, PAL, {});
  assert.match(h, /id="host-seg-02"[^>]*data-composition-id="dy-scene-steps" data-composition-src="compositions\/dy-scene-steps.html"/);
  assert.match(h, /data-theme="custom"/);
  assert.match(h, /--hf-custom-bg:#F1ECE2/);
  assert.match(h, /data-variable-values='\{"title":"三步"\}'/);
});

test("同一组件用两次：宿主 id 不重复，变量各自独立", () => {
  const segs = [{ id: "a", start: 0, duration: 2, component: "dy-scene-steps", vars: { title: "一" } }, { id: "b", start: 2, duration: 2, component: "dy-scene-steps", vars: { title: "二" } }];
  const h = segmentHosts(segs, null, PAL, {});
  assert.match(h, /id="host-a"[^>]*"title":"一"/);
  assert.match(h, /id="host-b"[^>]*"title":"二"/);
});

test("headBlock：有组件才引入 dykit 样式和脚本", () => {
  assert.equal(headBlock(false), "");
  assert.match(headBlock(true), /<link rel="stylesheet" href="assets\/dykit\/dykit.css" \/>[\s\S]*<script src="assets\/dykit\/hf-kit.js"><\/script>/);
});
```
并把文件顶部的 import 改成同时导入 `customVars`、`headBlock`。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test skills/video-director/tests/assemble.test.mjs`
Expected: FAIL（`customVars` 等未导出）

- [ ] **Step 3: 实现**

`assemble.mjs` 增加：
```js
const FONT_VAR = { serif: "var(--vd-serif)", sans: "var(--vd-sans)" };

export function customVars(p, fonts = {}) {
  return `--hf-custom-bg:${p.bg};--hf-custom-text:${p.ink};--hf-custom-muted:${p.muted};--hf-custom-accent:${p.accent};--hf-custom-alert:${p.alert};` +
    `--hf-custom-font-title:${FONT_VAR[fonts.title ?? "serif"]};--hf-custom-font-body:${FONT_VAR[fonts.body ?? "sans"]}`;
}

export function headBlock(hasComponents) {
  return hasComponents ? `\n    <link rel="stylesheet" href="assets/dykit/dykit.css" />\n    <script src="assets/dykit/hf-kit.js"></script>\n    ` : "";
}
```
`host()` 增加参数 `hostId`（默认等于 id）和 `extra`，宿主写 `id="host-${hostId}"`；`segmentHosts(segments, only = null, palette = null, fonts = {})`：
```js
export function segmentHosts(segments, only = null, palette = null, fonts = {}) {
  return "\n" + segments.filter((s) => !only || only.includes(s.id)).map((s, i) => s.component
    ? host(s.component, `compositions/${s.component}.html`, s.start, s.duration, 2 + i,
        `data-theme="custom" ${vars(s.vars ?? {})} `, s.id, customVars(palette, fonts))
    : host(s.id, `compositions/frames/${s.id}.html`, s.start, s.duration, 2 + i)).join("");
}
```
`host` 改为：
```js
const host = (id, src, start, duration, track, extra = "", hostId = id, style = "") =>
  `    <div id="host-${hostId}" class="clip" data-composition-id="${id}" data-composition-src="${src}" data-start="${start}" data-duration="${duration}" data-track-index="${track}" data-width="1080" data-height="1920" ${extra}style="position:absolute;inset:0${style ? ";" + style : ""}"></div>\n`;
```
`segmentTimes`（`cues.mjs`）返回的段对象要带上 `component` 和 `vars`：在 `segmentTimes` 的 `return` 里加 `component: s.component, vars: s.vars`。
`assemble()` 里：`replaceBlock(html, "head", headBlock(built.segments.some((s) => s.component)))`，并把 `segmentHosts(built.segments, only)` 改为 `segmentHosts(built.segments, only, built.vd.palette, built.vd.fonts)`。
`templates/index.html` 的 `<script src="cues.js"></script>` 下一行加 `    <!-- vd:head --><!-- /vd:head -->`；`templates.test.mjs` 的标记检查加 `"head"`。

- [ ] **Step 4: 跑全部测试**

Run: `npm test --prefix skills/video-director`
Expected: 全部通过

- [ ] **Step 5: 提交**

```bash
git add skills/video-director
git commit -m "工具: vd 总装组件段落（custom 配色、dykit 样式和脚本）"
```

---

### Task B4: 接上 `vd build --update-components` 和 `vd check` 列候选

**Files:**
- Modify: `skills/video-director/scripts/vd.mjs`
- Modify: `skills/video-director/tests/vd.test.mjs`

**Interfaces:**
- Consumes: B1 `ensureLock / fetchArchive / installComponent`，B2 `candidates`，B3 `assemble`
- Produces:
  - `installAll(dir, built, { update }, deps) → string[]`（导出，便于测试；deps 默认用 B1 的真实函数，缓存根 `join(homedir(), ".cache/video-director/hyperframes")`）：没有组件段时什么都不做、不联网、不建锁文件
  - `vd build` 在 `buildAudio` 之后、第一次 `assemble` 之前调用 `installAll`
  - `vd check` 在 `hyperframes check` 之前打印组件候选：`◇ 组件候选 N 个：` + 每行 `  - <建议组件名>：<画面>（来自 <来源段>）`；0 个时打印 `◇ 组件候选：无`

- [ ] **Step 1: 写失败的测试（追加到 `tests/vd.test.mjs`）**

```js
import { installAll } from "../scripts/vd.mjs";

test("installAll：没有组件段时不联网、不建锁文件", () => {
  const dir = project({});
  const never = () => { throw new Error("不应调用"); };
  assert.deepEqual(installAll(dir, { segments: [{ id: "a" }] }, {}, { ensureLock: never, fetchArchive: never, installComponent: never }), []);
});

test("installAll：每个组件只装一次，用锁定的提交号", () => {
  const calls = [];
  const deps = {
    ensureLock: (_d, opts) => { calls.push(["lock", opts.update]); return "c".repeat(40); },
    fetchArchive: (sha) => { calls.push(["fetch", sha]); return "/repo"; },
    installComponent: (_r, name) => { calls.push(["install", name]); return [`compositions/${name}.html`]; },
  };
  const segs = [{ id: "a", component: "dy-scene-steps" }, { id: "b" }, { id: "c", component: "dy-scene-steps" }];
  const files = installAll(project({}), { segments: segs }, { update: true }, deps);
  assert.deepEqual(files, ["compositions/dy-scene-steps.html"]);
  assert.deepEqual(calls, [["lock", true], ["fetch", "c".repeat(40)], ["install", "dy-scene-steps"]]);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test skills/video-director/tests/vd.test.mjs`
Expected: FAIL（`installAll` 未导出）

- [ ] **Step 3: 实现**

`vd.mjs` 增加导入和函数：
```js
import { homedir } from "node:os";
import { ensureLock, fetchArchive, installComponent } from "./lib/components.mjs";

const CACHE = join(homedir(), ".cache/video-director/hyperframes");

export function installAll(dir, built, { update = false } = {}, deps = { ensureLock, fetchArchive, installComponent }) {
  const names = [...new Set(built.segments.filter((s) => s.component).map((s) => s.component))];
  if (!names.length) return [];
  const sha = deps.ensureLock(dir, { update });
  const repo = deps.fetchArchive(sha, CACHE);
  const files = [...new Set(names.flatMap((n) => deps.installComponent(repo, n, dir)))];
  console.log(`✓ 组件 ${names.join("、")}（${sha.slice(0, 7)}，${files.length} 个文件）`);
  return files;
}
```
`build` 里 `buildAudio(dir, built, config);` 之后加 `installAll(dir, built, { update: rest.includes("--update-components") });`。
`check` 里 `load(dir)` 改为取返回值并打印候选：
```js
    const { parsed } = load(dir);
    const c = parsed.candidates;
    console.log(c.length ? `◇ 组件候选 ${c.length} 个：\n${c.map((x) => `  - ${x.name}：${x.scene}（来自 ${x.from}）`).join("\n")}` : "◇ 组件候选：无");
```
`USAGE` 和文件头注释加上 `--update-components`。

- [ ] **Step 4: 跑全部测试**

Run: `npm test --prefix skills/video-director`
Expected: 全部通过

- [ ] **Step 5: 提交**

```bash
git add skills/video-director/scripts/vd.mjs skills/video-director/tests/vd.test.mjs
git commit -m "工具: vd build 安装 dykit 组件（--update-components 升级）；vd check 列出组件候选"
```

---

### Task B5: 文档和导演规则

**Files:**
- Modify: `skills/video-director/SKILL.md`、`skills/video-director/references/director-rules.md`

- [ ] **Step 1: `SKILL.md`**

在「命令」表 `vd build` 一行补充 `--update-components`；新增一节：
```markdown
## 用 dykit 组件

dykit 组件库在 GitHub 的 `18826400652/hyperframes`（公开仓库，单独维护）。分段里写 `"component": "dy-…"` 和 `"vars": {…}` 就直接用组件，配色自动套用这条视频的 `palette`（dykit 的 custom 主题）。可用组件和变量见仓库的 `catalog/catalog.json`。

- 第一次 `vd build` 把最新提交号写进 `components.lock.json`，之后一直用这个版本，重新渲染不会变样；要用新版组件：`vd build . --update-components`
- 下载的仓库缓存在 `~/.cache/video-director/hyperframes/<提交号>/`，断网时已缓存的版本照常能用

## 组件候选（让组件库越用越全）

`DIRECTOR.md` 第 8 节记录「换文字就能复用」的画面。每做完一段回来填；`vd check` 会列出来；**关卡 ④ 交成片时把候选一起交给用户**，用户决定哪些提交到 hyperframes（按 hyperframes 仓库 `dykit-storyboard` 技能的新组件流程：测试 + 5 主题对比图 + 用户确认）。
```
流程表第 4 步「停下来」一栏改为「**④ 请用户看成片 + 组件候选**」。

- [ ] **Step 2: `director-rules.md` 末尾追加**

```markdown
## 组件

**18. 先找现成组件，再自己画。** 写分段前看一遍 dykit 的 `catalog/catalog.json`：功能性的画面（手机录屏框、步骤列表、对比卡、数字、结尾卡）有现成组件就直接用，配色会自动跟本片一致；隐喻性的、只属于这条内容的画面才自己画。

**19. 做完一段就判断能不能固化。** 标准：去掉这期的文字和配色，换一期内容还能原样用（例：「文件被盖红章」「搜索框打字 → 0 处匹配」）。能就写进第 8 节：画面、建议组件名（dy-开头）、需要哪些变量、来自哪一段。只属于这期隐喻的不写。
```

- [ ] **Step 3: 提交**

```bash
git add skills/video-director/SKILL.md skills/video-director/references/director-rules.md
git commit -m "文档: video-director 使用 dykit 组件、组件候选流程"
```

---

### Task B6: 端到端验证（真实 GitHub、真实组件）

前提：Task A3 已完成（仓库公开、custom 主题已推送）。

**Files:**
- Create: 临时工程 `/tmp/vd-e2e/抖音-director/`（不入库）

- [ ] **Step 1: 从 RAG 导演工程复制一份做测试工程**

```bash
rm -rf /tmp/vd-e2e && mkdir -p /tmp/vd-e2e
cp -r "04-作品/AI概念一分钟/01-RAG/抖音-director" /tmp/vd-e2e/
cp video-director.config.json /tmp/vd-e2e/
cd /tmp/vd-e2e/抖音-director && rm -rf compositions/dy-* assets/dykit components.lock.json
```
把 `DIRECTOR.md` 机器块里的 `seg-04-source` 改成组件段：`{ "id": "seg-04-source", "lines": [7, 8], "component": "dy-scene-steps", "vars": { "title": "资料从哪来", "steps": "放进资料库::公司文档、产品手册|不用重新训练::它就能用上|答错变少::有了资料撑腰" } }`；在第 2 节 seg-04 描述里写「用 dykit 组件 dy-scene-steps」；第 8 节填一行候选「文件被盖红章 | dy-stamp | text | seg-01-hook」；在 `index.html` 的 `<script src="cues.js"></script>` 后加 `<!-- vd:head --><!-- /vd:head -->`。`video-director.config.json` 里的相对路径改成绝对路径 `/home/power/self-media/06-品牌资产/hyperframes/...`。

- [ ] **Step 2: 构建（会联网下载）**

Run: `vd build /tmp/vd-e2e/抖音-director --no-music`
Expected: `✓ 组件库锁定到 18826400652/hyperframes@<7 位>`、`✓ 组件 dy-scene-steps（…）`、`Check passed`；`components.lock.json` 存在。

- [ ] **Step 3: 再构建一次（不应联网）**

Run: `vd build /tmp/vd-e2e/抖音-director --no-music 2>&1 | grep -E '锁定|组件'`
Expected: 不再出现「锁定到」（用已有锁文件和缓存）；出现「✓ 组件 dy-scene-steps」。

- [ ] **Step 4: 截图确认组件套用了本片配色**

Run: `cd /tmp/vd-e2e/抖音-director && npx hyperframes@0.8.143 snapshot . --at 23,27`
Expected: 第 4 段画面是 dy-scene-steps 的步骤列表，背景是纸面色 `#F1ECE2`、文字墨色、强调荧光黄，标题是宋体。

- [ ] **Step 5: `vd check` 列出候选**

Run: `vd check /tmp/vd-e2e/抖音-director | head -3`
Expected: `◇ 组件候选 1 个：` / `  - dy-stamp：文件被盖红章（来自 seg-01-hook）`

- [ ] **Step 6: 合并**

```bash
cd /home/power/self-media && git checkout main && git merge --ff-only feat/vd-components && git branch -d feat/vd-components
```
