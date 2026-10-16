# 公共零件收拢 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SCRIPT.md 解析、存草稿调用、找 Chrome、发布文案解析这四个零件各只留一份正本（仓库根 `shared/`），各 skill 存逐字相同的拷贝，由 `st sync-shared` 同步、测试和 `st doctor` 把关。

**Architecture:** 先做同步工具（studio，manifest 驱动，拷贝 = 一行说明 + 正本全文），再逐个把零件搬进 `shared/`、改使用方 import 自己目录里的拷贝。skill 之间仍不互相引用；`shared/` 只是正本仓库，不是运行时依赖。

**Tech Stack:** Node.js 22+（ESM、`node:test`），Python（pytest、phone-draft 的 `.venv`），bash 入口。

**Spec:** `docs/superpowers/specs/2026-10-16-shared-parts-design.md`

## Global Constraints

- 每个 skill 保持单独拷走就能用：不 import 兄弟目录、不在 PYTHONPATH 里加 `../<别的 skill>`。
- 正本只在 `shared/` 改；拷贝第一行是固定说明：`.mjs` 为 `// 由 shared/<正本路径> 同步而来，不要在这里改：改正本后跑 st sync-shared`，`.py` 同一句前缀换成 `#`；第二行起与正本逐字一致。
- manifest 路径：`shared/manifest.json`，键是相对 `shared/` 的正本路径，值是相对仓库根的拷贝路径数组（spec 第 2 节给出完整内容）。
- `parseScript(md)` 输出 `{ frame, text, sentences, emotion, keywords, basis }`，规则见 spec 3.1（以 vo 现在的读法为准）。
- `draft-run` 报错文字（逐字）：`--via 只能是 browser 或 phone，收到：<值>`；`这个平台没有 --via <via> 的步骤（可用：<有的方式>）`；`需要 bd 命令（skills/browser-draft，软链接到 PATH）` / `需要 pd 命令（skills/phone-draft，软链接到 PATH）`；`手机不可用（见上面的提示）；去掉 --via phone 改用浏览器`；`发草稿失败，看上面的输出`。
- 中文注释和提示；不留注释掉的代码、未使用的导入、调试输出。
- 提交信息 `<type>: <描述>`，结尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。

## Review Focus

1. **拷贝被手改**：有人直接改了 `scenario-content/scripts/lib/shared/script-md.mjs` 而没改正本 → studio 的一致性测试和 `st doctor` 都要指出是哪个文件、怎么办。（Task 1 加测试）
2. **sync 半途失败**：manifest 里某个正本不存在时，`st sync-shared` 一个文件都不写（不能先写一半）。（Task 1 加测试）
3. **配音口播不能变**：换成 `parseScript` 后，vo 对真实 SCRIPT.md 读出的 frame / text / emotion / keywords 必须和原来一模一样（缓存键里有 text，变了就要重新付费配音）。（Task 4 加测试）
4. **phone-draft 单独可用**：`bin/pd` 去掉 `../browser-draft/lib` 后，`pd run` 的步骤脚本里 `read_copy` 仍能用（来自自己 lib 里的 copy_format）。（Task 3 加测试）
5. **CRLF 的 SCRIPT.md**：Windows 编辑器存的 `\r\n` 文件三家都能读。（Task 4 加测试）

---

## 文件结构

**新建**：`shared/{README.md,manifest.json}`、`shared/node/{script-md,draft-run,chrome}.mjs`、`shared/python/copy_format.py`、`shared/tests/{script-md,draft-run}.test.mjs`、`shared/tests/fixtures/flow-check-02-SCRIPT.md`、`studio/scripts/lib/shared-sync.mjs`、`studio/tests/shared-sync.test.mjs`、各 skill 的拷贝（manifest 列出的位置）、`phone-draft/tests/test_copy_format_local.py`

**修改**：`studio/scripts/st.mjs`、`studio/scripts/lib/doctor.mjs`、`studio/tests/doctor.test.mjs`、`image-cards/scripts/ic.mjs`、`video-director/scripts/lib/inspect-page.mjs`、`video-director/tests/inspect-page.test.mjs`、`phone-draft/bin/pd`、`phone-draft/tests/conftest.py`、`voiceover/scripts/vo.mjs`、`voiceover/scripts/lib/voice-direction.mjs`（注释）、`voiceover/tests/vo.test.mjs`、`knowledge-video/scripts/{kv.mjs,lib/script.mjs,lib/status.mjs}`、`knowledge-video/tests/script.test.mjs`、`scenario-content/scripts/sc.mjs`、`scenario-content/tests/sc.test.mjs`、`wechat-article/scripts/wa.mjs`、`image-cards/scripts/draft.mjs`、`video-draft/scripts/vdraft.mjs`、各自 `tests/draft-via.test.mjs`、`CLAUDE.md`

**删除**：`image-cards/scripts/lib/chrome.mjs`、`video-director/scripts/lib/chrome.mjs`

---

### Task 0: 分支和 worktree

- [ ] **Step 1:** 用 superpowers:using-git-worktrees（harness 的 EnterWorktree 只能在 `.claude/worktrees/` 下）：在主仓库 `git worktree add .claude/worktrees/shared-parts -b refactor/shared-parts HEAD`，再 `EnterWorktree` 进去。
- [ ] **Step 2:** 各 skill `npm ci`，跑基线：

```bash
for s in voiceover video-director video-draft knowledge-video studio scenario-content wechat-article image-cards; do echo "== $s $(cd $s && node --test tests/*.test.mjs 2>&1 | grep -E '^# (pass|fail)' | tr '\n' ' ')"; done
(cd phone-draft && /home/power/self-media-skills/phone-draft/.venv/bin/python -m pytest -q | tail -1)
(cd browser-draft && /home/power/self-media-skills/phone-draft/.venv/bin/python -m pytest -q | tail -1)
```

Expected: 全部 0 失败（合并后的 main 是 vo 66、vd 145、vdraft 13、kv 83、studio 39、sc 25、wa 5、ic 4、pd 126、bd 8）。worktree 里没有 `.venv`，Python 用主仓库 phone-draft 的。

---

### Task 1: `st sync-shared` 和一致性检查

**Files:**
- Create: `studio/scripts/lib/shared-sync.mjs`、`studio/tests/shared-sync.test.mjs`、`shared/manifest.json`（内容 `{}`）、`shared/README.md`
- Modify: `studio/scripts/st.mjs`、`studio/scripts/lib/doctor.mjs`、`studio/tests/doctor.test.mjs`

**Interfaces:**
- Produces: `syncShared({ toolkit, check = false, log = () => {} }) → { changed: string[], problems: string[] }`；`copyHeader(src) → string`（说明行，带换行）；`checkShared(out, toolkit)`（doctor 用）；命令 `st sync-shared [--check]`

- [ ] **Step 1: 写失败测试** `studio/tests/shared-sync.test.mjs`：

```js
// st sync-shared：shared/ 正本 → 各 skill 的拷贝（一行说明 + 正本全文）
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { copyHeader, syncShared } from "../scripts/lib/shared-sync.mjs";
import { TOOLKIT_DIR } from "../scripts/lib/project.mjs";

/** 临时工具包：shared/ 正本 + manifest + 两个 skill 目录 */
function toolkit(manifest, files = {}) {
  const tk = mkdtempSync(join(tmpdir(), "st-shared-"));
  for (const d of ["shared/node", "shared/python", "a/scripts/lib", "b/lib"]) mkdirSync(join(tk, d), { recursive: true });
  writeFileSync(join(tk, "shared/manifest.json"), JSON.stringify(manifest));
  for (const [p, body] of Object.entries(files)) writeFileSync(join(tk, p), body);
  return tk;
}

test("copyHeader：.mjs 用 //，.py 用 #，写明正本位置和怎么改", () => {
  assert.equal(copyHeader("node/x.mjs"), "// 由 shared/node/x.mjs 同步而来，不要在这里改：改正本后跑 st sync-shared\n");
  assert.equal(copyHeader("python/y.py"), "# 由 shared/python/y.py 同步而来，不要在这里改：改正本后跑 st sync-shared\n");
});

test("syncShared：按 manifest 写拷贝（自动建目录），拷贝 = 说明行 + 正本全文", () => {
  const tk = toolkit({ "node/x.mjs": ["a/scripts/lib/shared/x.mjs"], "python/y.py": ["b/lib/y.py"] },
    { "shared/node/x.mjs": "export const x = 1;\n", "shared/python/y.py": "Y = 1\n" });
  const r = syncShared({ toolkit: tk });
  assert.deepEqual(r.changed.sort(), ["a/scripts/lib/shared/x.mjs", "b/lib/y.py"]);
  assert.deepEqual(r.problems, []);
  assert.equal(readFileSync(join(tk, "a/scripts/lib/shared/x.mjs"), "utf8"), copyHeader("node/x.mjs") + "export const x = 1;\n");
  assert.equal(readFileSync(join(tk, "b/lib/y.py"), "utf8"), copyHeader("python/y.py") + "Y = 1\n");
});

test("syncShared：内容已经一致就不重写（不动修改时间）", () => {
  const tk = toolkit({ "node/x.mjs": ["a/scripts/lib/shared/x.mjs"] }, { "shared/node/x.mjs": "export const x = 1;\n" });
  syncShared({ toolkit: tk });
  const p = join(tk, "a/scripts/lib/shared/x.mjs");
  utimesSync(p, 1000, 1000);
  assert.deepEqual(syncShared({ toolkit: tk }).changed, []);
  assert.equal(statSync(p).mtimeMs, 1000 * 1000);
});

test("syncShared --check：拷贝被手改、缺拷贝都列出来，不写文件", () => {
  const tk = toolkit({ "node/x.mjs": ["a/scripts/lib/shared/x.mjs", "b/lib/x.mjs"] }, { "shared/node/x.mjs": "export const x = 1;\n" });
  syncShared({ toolkit: tk });
  writeFileSync(join(tk, "a/scripts/lib/shared/x.mjs"), "被手改了\n");
  writeFileSync(join(tk, "shared/manifest.json"), JSON.stringify({ "node/x.mjs": ["a/scripts/lib/shared/x.mjs", "b/lib/x.mjs", "b/lib/missing.mjs"] }));
  const r = syncShared({ toolkit: tk, check: true });
  assert.deepEqual(r.changed, []);
  assert.equal(r.problems.length, 2);
  assert.match(r.problems.join("\n"), /a\/scripts\/lib\/shared\/x\.mjs 和正本 shared\/node\/x\.mjs 不一致/);
  assert.match(r.problems.join("\n"), /b\/lib\/missing\.mjs 不存在/);
  assert.equal(readFileSync(join(tk, "a/scripts/lib/shared/x.mjs"), "utf8"), "被手改了\n");
  assert.equal(existsSync(join(tk, "b/lib/missing.mjs")), false);
});

test("syncShared：manifest 里有正本不存在 → 报错，一个文件都不写（Review Focus 2）", () => {
  const tk = toolkit({ "node/x.mjs": ["a/scripts/lib/shared/x.mjs"], "node/gone.mjs": ["b/lib/gone.mjs"] }, { "shared/node/x.mjs": "export const x = 1;\n" });
  assert.throws(() => syncShared({ toolkit: tk }), /正本不存在：shared\/node\/gone\.mjs/);
  assert.equal(existsSync(join(tk, "a/scripts/lib/shared/x.mjs")), false);
});

test("syncShared：拷贝所在的 skill 目录不存在 → 报错，不凭空建 skill", () => {
  const tk = toolkit({ "node/x.mjs": ["nope/scripts/x.mjs"] }, { "shared/node/x.mjs": "export const x = 1;\n" });
  assert.throws(() => syncShared({ toolkit: tk }), /skill 目录不存在：nope/);
  assert.equal(existsSync(join(tk, "nope")), false);
});

test("仓库里所有拷贝都和 shared/ 正本一致（改了拷贝没改正本会在这里失败）", () => {
  const { problems } = syncShared({ toolkit: TOOLKIT_DIR, check: true });
  assert.deepEqual(problems, [], "改 shared/ 里的正本，再跑 st sync-shared");
});
```

`studio/tests/doctor.test.mjs` 加（并在 import 里加 `checkShared`）：

```js
test("checkShared：拷贝和正本不一致 → ✗，提示改正本后跑 st sync-shared；一致 → ✓", () => {
  const tk = mkdtempSync(join(tmpdir(), "st-doc-shared-"));
  mkdirSync(join(tk, "shared/node"), { recursive: true });
  mkdirSync(join(tk, "a/lib"), { recursive: true });
  writeFileSync(join(tk, "shared/manifest.json"), JSON.stringify({ "node/x.mjs": ["a/lib/x.mjs"] }));
  writeFileSync(join(tk, "shared/node/x.mjs"), "export const x = 1;\n");
  writeFileSync(join(tk, "a/lib/x.mjs"), "被手改了\n");
  const lines = [];
  const out = { ok: (m) => lines.push(`✓ ${m}`), warn: (m) => lines.push(`⚠ ${m}`), fail: (m) => lines.push(`✗ ${m}`) };
  checkShared(out, tk);
  assert.match(lines.join("\n"), /✗ .*a\/lib\/x\.mjs.*改正本后跑 st sync-shared/);
});
```

- [ ] **Step 2: 跑测试确认失败** — `cd studio && node --test tests/shared-sync.test.mjs tests/doctor.test.mjs`，Expected：`Cannot find module …shared-sync.mjs` / `checkShared` 未导出。

- [ ] **Step 3: 实现** `studio/scripts/lib/shared-sync.mjs`：

```js
// st sync-shared：shared/ 里的正本 → 各 skill 目录里的拷贝（manifest 列出位置）。
// 拷贝 = 一行说明 + 正本全文。skill 之间不互相引用，每个 skill 单独拷走就能用；正本只在 shared/ 改。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";

const NOTE = (src) => `由 shared/${src} 同步而来，不要在这里改：改正本后跑 st sync-shared`;

export function copyHeader(src) {
  return `${extname(src) === ".py" ? "#" : "//"} ${NOTE(src)}\n`;
}

/** 读 manifest，先把所有正本读进来、检查 skill 目录都在：有问题直接抛错，一个文件都不写 */
function plan(toolkit) {
  const manifest = JSON.parse(readFileSync(join(toolkit, "shared/manifest.json"), "utf8"));
  const items = [];
  for (const [src, copies] of Object.entries(manifest)) {
    const srcPath = join(toolkit, "shared", src);
    if (!existsSync(srcPath)) throw new Error(`正本不存在：shared/${src}（manifest 里写了它）`);
    const body = copyHeader(src) + readFileSync(srcPath, "utf8");
    for (const copy of copies) {
      const skill = copy.split("/")[0];
      if (!existsSync(join(toolkit, skill))) throw new Error(`skill 目录不存在：${skill}（manifest 里 ${copy}）`);
      items.push({ src, copy, body });
    }
  }
  return items;
}

export function syncShared({ toolkit, check = false, log = () => {} }) {
  const changed = [];
  const problems = [];
  for (const { src, copy, body } of plan(toolkit)) {
    const path = join(toolkit, copy);
    const current = existsSync(path) ? readFileSync(path, "utf8") : null;
    if (current === body) continue;
    if (check) {
      problems.push(current === null ? `${copy} 不存在（正本 shared/${src}）` : `${copy} 和正本 shared/${src} 不一致`);
      continue;
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, body);
    changed.push(copy);
    log(`  ✓ ${copy} ← shared/${src}`);
  }
  return { changed, problems };
}
```

`st.mjs`：文件头加一行 `//   st sync-shared [--check]       把 shared/ 里的正本同步到各 skill（--check 只检查）`；`HELP` 里加 `| st sync-shared [--check]`；import `syncShared`、`TOOLKIT_DIR`；`switch` 加：

```js
    case "sync-shared": {
      const check = args.includes("--check");
      const { changed, problems } = syncShared({ toolkit: TOOLKIT_DIR, check, log: console.log });
      if (check) {
        problems.forEach((p) => console.log(`  ✗ ${p}`));
        console.log(problems.length ? "✗ 有拷贝和正本不一致：改 shared/ 里的正本，再跑 st sync-shared" : "✓ 各 skill 里的共用代码和 shared/ 正本一致");
        return problems.length ? 1 : 0;
      }
      console.log(changed.length ? `✓ 更新了 ${changed.length} 个拷贝` : "✓ 都是最新的，没有要更新的");
      return 0;
    }
```

`doctor.mjs`：import `syncShared`；新增并导出

```js
export function checkShared(out, toolkit = TOOLKIT_DIR) {
  let problems;
  try { ({ problems } = syncShared({ toolkit, check: true })); } catch (e) { return out.fail(`共用代码：${e.message}`); }
  if (!problems.length) return out.ok("共用代码和 shared/ 正本一致");
  for (const p of problems) out.fail(`共用代码 ${p}：改 shared/ 里的正本后跑 st sync-shared`);
}
```

`doctor()` 的「工具包」那一节改成 `section("工具包", () => { checkToolkit(out, home); checkShared(out); checkExternalSkills(out, home); });`

`shared/manifest.json`：`{}`。`shared/README.md`：

```markdown
# shared：工具包内部的共用代码（正本）

这里的文件是正本，各 skill 目录里存的是逐字相同的拷贝（第一行多一句「由 shared/… 同步而来」）。
skill 之间不互相引用，每个 skill 单独拷走就能用。

- 改共用代码：只改这里的正本，然后在工具包根目录跑 `node studio/scripts/st.mjs sync-shared`（装好后 `st sync-shared`）。
- 检查：`st sync-shared --check`；`st doctor` 和 studio 的测试也会检查，拷贝被手改会报出来。
- 拷贝放在哪：`manifest.json`（键：相对本目录的正本路径；值：相对仓库根的拷贝路径）。
- 测试：`node --test shared/tests/*.test.mjs`

## 模块

（每加一个模块，在这里写一节：用途、接口、谁在用、来源。）
```

- [ ] **Step 4: 跑测试通过** — `cd studio && node --test tests/*.test.mjs`，Expected `# fail 0`（manifest 为空，一致性测试自然通过）。`node studio/scripts/st.mjs sync-shared --check` 输出 ✓、退出码 0。

- [ ] **Step 5: Commit** — `feat: st sync-shared，把 shared/ 正本同步到各 skill，doctor 和测试检查一致`

---

### Task 2: `chrome.mjs` 收进 shared

**Files:** Create `shared/node/chrome.mjs`；Modify `shared/manifest.json`、`shared/README.md`、`image-cards/scripts/ic.mjs`、`video-director/scripts/lib/inspect-page.mjs`、`video-director/tests/inspect-page.test.mjs`；Delete `image-cards/scripts/lib/chrome.mjs`、`video-director/scripts/lib/chrome.mjs`

**Interfaces:** Consumes `st sync-shared`（Task 1）。Produces 拷贝 `image-cards/scripts/lib/shared/chrome.mjs`、`video-director/scripts/lib/shared/chrome.mjs`，导出不变（`findChrome` 等，以现有文件为准）。

- [ ] **Step 1:** `git mv image-cards/scripts/lib/chrome.mjs shared/node/chrome.mjs`；第一行注释改成 `// 查找可用的 Chrome：优先 CHROME_PATH，其次复用 HyperFrames / Puppeteer 已下载的 headless shell，最后找系统 Chrome。`；`git rm video-director/scripts/lib/chrome.mjs`（先 `diff` 确认除第一行外和正本一致，不一致就停下报告）。
- [ ] **Step 2:** manifest 加 `"node/chrome.mjs": ["image-cards/scripts/lib/shared/chrome.mjs", "video-director/scripts/lib/shared/chrome.mjs"]`；跑 `node studio/scripts/st.mjs sync-shared`。
- [ ] **Step 3:** 改 import：`image-cards/scripts/ic.mjs` `./lib/chrome.mjs` → `./lib/shared/chrome.mjs`；`video-director/scripts/lib/inspect-page.mjs` `./chrome.mjs` → `./shared/chrome.mjs`；`video-director/tests/inspect-page.test.mjs` `../scripts/lib/chrome.mjs` → `../scripts/lib/shared/chrome.mjs`。
- [ ] **Step 4:** `shared/README.md` 加一节 `### node/chrome.mjs` — 用途：找可用的 Chrome；接口：现有导出；谁在用：image-cards（ic render）、video-director（vd qa）；来源：原 image-cards/video-director 各一份。
- [ ] **Step 5:** 跑 `image-cards`、`video-director`、`studio` 测试，`st sync-shared --check`。Expected 全部 0 失败、退出码 0。
- [ ] **Step 6: Commit** — `refactor: chrome.mjs 收进 shared/，image-cards、video-director 用同步来的拷贝`

---

### Task 3: `copy_format.py` 收进 shared，phone-draft 不再借 browser-draft

**Files:** Create `shared/python/copy_format.py`（从 browser-draft 搬）、`phone-draft/tests/test_copy_format_local.py`；Modify `shared/manifest.json`、`shared/README.md`、`phone-draft/bin/pd`、`phone-draft/tests/conftest.py`；拷贝 `browser-draft/lib/copy_format.py`、`phone-draft/lib/copy_format.py`

**Interfaces:** Produces `copy_format.parse_copy(path)`、`CopyFormatError`（不变）；`bd run` 仍读 `browser-draft/lib/copy_format.py`。

- [ ] **Step 1: 写失败测试** `phone-draft/tests/test_copy_format_local.py`（Review Focus 4）：

```python
# phone-draft 自带 copy_format（由 shared/ 同步），不借 browser-draft 的：单独拷走也能用
import subprocess
import sys
from pathlib import Path

SKILL = Path(__file__).resolve().parents[1]


def test_lib_has_own_copy_format():
    assert (SKILL / "lib" / "copy_format.py").exists()


def test_import_without_browser_draft_on_path(tmp_path):
    copy = tmp_path / "文案.md"
    copy.write_text("## 标题\n测试\n## 正文\n第一行\n## 话题\n#AI #效率\n", encoding="utf-8")
    code = f"import copy_format; print(copy_format.parse_copy({str(copy)!r})['topics'])"
    r = subprocess.run([sys.executable, "-c", code], env={"PYTHONPATH": str(SKILL / "lib")}, capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    assert "['AI', '效率']" in r.stdout


def test_pd_entry_does_not_reference_browser_draft():
    assert "browser-draft" not in (SKILL / "bin" / "pd").read_text(encoding="utf-8")
```

`conftest.py` 删掉 `sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "browser-draft" / "lib"))` 这一行。

Run: `cd phone-draft && /home/power/self-media-skills/phone-draft/.venv/bin/python -m pytest -q tests/test_copy_format_local.py` → FAIL（没有 lib/copy_format.py、pd 里有 browser-draft）

- [ ] **Step 2: 实现**
  - `git mv browser-draft/lib/copy_format.py shared/python/copy_format.py`；第一行注释 `# 发布文案（Markdown）解析：browser-draft 和 phone-draft 共用。` 保留
  - manifest 加 `"python/copy_format.py": ["browser-draft/lib/copy_format.py", "phone-draft/lib/copy_format.py"]`，跑 `node studio/scripts/st.mjs sync-shared`
  - `phone-draft/bin/pd`：`export PYTHONPATH="$SKILL_DIR/lib:$SKILL_DIR/../browser-draft/lib${PYTHONPATH:+:$PYTHONPATH}"` → `export PYTHONPATH="$SKILL_DIR/lib${PYTHONPATH:+:$PYTHONPATH}"`
  - 找 phone-draft 里 `from copy_format import` / `import copy_format` 的地方（`phone_draft/core.py` 等），确认它们靠 `lib/` 在 PYTHONPATH 上就能导入；不需要改就不改
  - `shared/README.md` 加一节 `### python/copy_format.py`（用途、`parse_copy`、谁在用：browser-draft 的 `bd run`、phone-draft 的 `pd run`；来源：原 browser-draft）
- [ ] **Step 3: 跑测试** — phone-draft、browser-draft 的 pytest 全量；studio 测试；`st sync-shared --check`。Expected 全部通过。另跑 `./phone-draft/bin/pd devices`：没连手机时应是 pd 自己的「没有设备」类提示，不是 `ModuleNotFoundError`；`./browser-draft/bin/bd tabs`：连不上浏览器也只是正常的连接错误。
- [ ] **Step 4: Commit** — `refactor: copy_format.py 收进 shared/，phone-draft 用自己的拷贝，不再借 browser-draft/lib`

---

### Task 4: `script-md.mjs`：sc、kv、vo 用同一套 SCRIPT.md 规则

**Files:** Create `shared/node/script-md.mjs`、`shared/tests/script-md.test.mjs`、`shared/tests/fixtures/flow-check-02-SCRIPT.md`；Modify `shared/manifest.json`、`shared/README.md`、`voiceover/scripts/vo.mjs`、`voiceover/scripts/lib/voice-direction.mjs`、`voiceover/tests/vo.test.mjs`、`knowledge-video/scripts/lib/{script,status}.mjs`、`knowledge-video/scripts/kv.mjs`、`knowledge-video/tests/script.test.mjs`、`scenario-content/scripts/sc.mjs`、`scenario-content/tests/sc.test.mjs`；拷贝三份

**Interfaces:** Produces `parseScript(md) → [{ frame: number, text: string, sentences: string[], emotion: string, keywords: string[], basis: string|null }]`。拷贝位置 `scenario-content/scripts/lib/shared/script-md.mjs`、`knowledge-video/scripts/lib/shared/script-md.mjs`、`voiceover/scripts/lib/shared/script-md.mjs`。

- [ ] **Step 1: 放夹具** — `cp "/home/power/flow-check/04-作品/流程测试/02-导演做法/抖音/SCRIPT.md" shared/tests/fixtures/flow-check-02-SCRIPT.md`；同时记下当前 vo 的读法作为期望值（Review Focus 3）：

```bash
node -e 'import("./voiceover/scripts/vo.mjs").then(({ parseHfScript }) => { const fs = require("fs"); const md = fs.readFileSync("shared/tests/fixtures/flow-check-02-SCRIPT.md", "utf8"); fs.writeFileSync("shared/tests/fixtures/flow-check-02-vo-expected.json", JSON.stringify(parseHfScript(md), null, 2) + "\n"); })'
```

- [ ] **Step 2: 写失败测试** `shared/tests/script-md.test.mjs`：

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseScript } from "../node/script-md.mjs";

const fixture = (f) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");

test("读帧号、口播、情感、重点词、依据", () => {
  const md = "# SCRIPT\n\n## Line 1 — 钩子 (Frame 1)\n\n**重点词:** 八秒钟、一下午\n**Emotion:** 惊讶\n**依据:** c01, c02\n\n    AI八秒钟，干完了我一下午的活。\n\n## Line 2 (Frame 2)\n\n    第二句。\n";
  assert.deepEqual(parseScript(md), [
    { frame: 1, text: "AI八秒钟，干完了我一下午的活。", sentences: ["AI八秒钟，干完了我一下午的活。"], emotion: "惊讶", keywords: ["八秒钟", "一下午"], basis: "c01, c02" },
    { frame: 2, text: "第二句。", sentences: ["第二句。"], emotion: "", keywords: [], basis: null },
  ]);
});

test("标题：## 或 ###，(frame N) 大小写不限", () => {
  const md = "### a (frame 3)\n\n    三。\n\n## b (FRAME 4)\n\n    四。\n";
  assert.deepEqual(parseScript(md).map((l) => [l.frame, l.text]), [[3, "三。"], [4, "四。"]]);
});

test("口播行：4 个以上空格或 Tab；少于 4 个空格不算", () => {
  const md = "## a (Frame 1)\n\n    四空格。\n      六空格。\n\tTab。\n  两空格不算。\n";
  assert.deepEqual(parseScript(md)[0].sentences, ["四空格。", "六空格。", "Tab。"]);
  assert.equal(parseScript(md)[0].text, "四空格。六空格。Tab。");
});

test("元数据中英文冒号都行；Highlight、情感 是别名", () => {
  const md = "## a (Frame 1)\n**情感：** 开心\n**Highlight:** 甲,乙 丙\n**依据：** 类比\n\n    一句。\n";
  const [l] = parseScript(md);
  assert.deepEqual([l.emotion, l.keywords, l.basis], ["开心", ["甲", "乙", "丙"], "类比"]);
});

test("第一个标题之前的内容忽略；没有口播的帧不输出", () => {
  const md = "    标题前的缩进行。\n\n## a (Frame 1)\n**Emotion:** 平静\n\n## b (Frame 2)\n\n    有口播。\n";
  assert.deepEqual(parseScript(md).map((l) => l.frame), [2]);
});

test("CRLF 换行也能读（Review Focus 5）", () => {
  const md = "## a (Frame 1)\r\n**Emotion:** 惊讶\r\n\r\n    一句。\r\n";
  assert.deepEqual(parseScript(md), [{ frame: 1, text: "一句。", sentences: ["一句。"], emotion: "惊讶", keywords: [], basis: null }]);
});

test("flow-check 02 的真实 SCRIPT.md：frame、text、emotion、keywords 和 vo 原来的读法逐帧一致（配音缓存键不变）", () => {
  const want = JSON.parse(fixture("flow-check-02-vo-expected.json"));
  const got = parseScript(fixture("flow-check-02-SCRIPT.md")).map(({ frame, text, emotion, keywords }) => ({ frame, text, emotion, keywords }));
  assert.deepEqual(got, want);
});
```

Run: `node --test shared/tests/script-md.test.mjs` → FAIL（模块不存在）

- [ ] **Step 3: 实现** `shared/node/script-md.mjs`：

```js
// 抖音 SCRIPT.md 解析：sc（口播检查）、kv（依据检查）、vo（配音）共用同一套规则。
// 标题行：## 或 ###，带 (Frame N)（大小写不限）开一帧；口播行：4 个以上空格或 Tab 开头，一行一句；
// 以 ** 开头的是元数据：Emotion/情感、重点词/Highlight、依据。没有口播的帧不输出。
const HEADING_RE = /^#{2,3}\s+.*?\(frame\s+(\d+)\)/i;
const SPOKEN_RE = /^(?: {4,}|\t)(.+)$/;
const EMOTION_RE = /^\s*\*\*(?:Emotion|情感)[:：]\*\*\s*(\S+)/i;
const KEYWORDS_RE = /^\s*\*\*(?:Highlight|重点词)[:：]\*\*\s*(.+)$/i;
const BASIS_RE = /^\s*\*\*依据[:：]\*\*\s*(.*)$/;
const KEYWORD_SPLIT = /[、,，\s]+/;

/** @returns {{ frame: number, text: string, sentences: string[], emotion: string, keywords: string[], basis: string|null }[]} */
export function parseScript(md) {
  const out = [];
  let cur = null;
  const flush = () => {
    if (cur?.sentences.length) out.push({ ...cur, text: cur.sentences.join("") });
    cur = null;
  };
  for (const line of md.split(/\r?\n/)) {
    const h = line.match(HEADING_RE);
    if (h) {
      flush();
      cur = { frame: Number(h[1]), text: "", sentences: [], emotion: "", keywords: [], basis: null };
      continue;
    }
    if (!cur) continue;
    const emotion = line.match(EMOTION_RE);
    if (emotion) cur.emotion = emotion[1];
    const keywords = line.match(KEYWORDS_RE);
    if (keywords) cur.keywords = keywords[1].split(KEYWORD_SPLIT).filter(Boolean);
    const basis = line.match(BASIS_RE);
    if (basis) cur.basis = basis[1].trim();
    if (/^\s*\*\*/.test(line)) continue;
    const spoken = line.match(SPOKEN_RE);
    if (spoken && spoken[1].trim()) cur.sentences.push(spoken[1].trim());
  }
  flush();
  return out;
}
```

（注意：`text` 用 `join("")`，和 vo 原来逐行 `+= trim()` 等价；夹具测试会把关。）

Run: `node --test shared/tests/script-md.test.mjs` → PASS（7 个）。若夹具用例不一致，停下报告差在哪一帧，不要改期望文件。

- [ ] **Step 4: 同步拷贝** — manifest 加 `"node/script-md.mjs": [三个位置]`，跑 `node studio/scripts/st.mjs sync-shared`。

- [ ] **Step 5: 改 vo**
  - `voiceover/scripts/vo.mjs`：删 `parseHfScript` 函数，import `{ parseScript } from "./lib/shared/script-md.mjs"`，`parseHfScript(readFileSync(scriptPath, "utf8"))` → `parseScript(...)`
  - `voiceover/scripts/lib/voice-direction.mjs:115` 注释 `parseHfScript 的结果` → `parseScript 的结果（shared/script-md）`
  - `voiceover/tests/vo.test.mjs`：import 去掉 `parseHfScript`，「parseHfScript 读出帧号…」测试改为调 `parseScript`（从 `../scripts/lib/shared/script-md.mjs` 导入），断言里的对象改成取 `frame/text/emotion/keywords` 比较
  - 跑 voiceover 测试 → 0 失败

- [ ] **Step 6: 改 kv**
  - `knowledge-video/scripts/lib/script.mjs`：删 `parseScriptBasis` 和 `HEADING_RE`、`BASIS_RE`（若别处不用）；文件头注释改成「SCRIPT.md 每句口播的「依据」检查；解析用 shared/script-md 的 parseScript（basis 字段）」
  - `kv.mjs`、`lib/status.mjs`：`parseScriptBasis` → `parseScript`（import 自 `./lib/shared/script-md.mjs` / `./shared/script-md.mjs`）
  - `knowledge-video/tests/script.test.mjs`：「parseScriptBasis：读帧号…」改为对 `parseScript` 取 `frame/text/basis` 比较
  - 跑 knowledge-video 测试 → 0 失败

- [ ] **Step 7: 改 sc**
  - `scenario-content/tests/sc.test.mjs`：删「douyinLines 读旧版分镜表」；另两个 douyinLines 测试改成测 sc 的检查结果（不再导出 douyinLines）：

```js
/** 只放一份抖音 SCRIPT.md 的作品，返回这份文件的检查结果 */
const scriptItems = async (md) => {
  const { runChecks, loadConfig } = await import("../scripts/sc.mjs");
  const dir = ep({ "抖音/SCRIPT.md": md });
  const config = { ...loadConfig(dir), platformFiles: { douyinScript: "抖音/SCRIPT.md" } };
  return runChecks(dir, config).filter((i) => i.file === "抖音/SCRIPT.md");
};

test("抖音口播检查：每句超长、情感无效、书面词按 (Frame N) 报出", async () => {
  const items = await scriptItems("## 钩子 (Frame 1)\n**Emotion:** 惊讶怪\n\n    这一句写得特别特别特别特别特别特别特别特别特别特别长了吧。\n    因此不行。\n");
  assert.ok(items.some((i) => i.level === "⚠" && /第 1 帧有一句/.test(i.msg)));
  assert.ok(items.some((i) => i.level === "✗" && /情感「惊讶怪」无效/.test(i.msg)));
  assert.ok(items.some((i) => i.level === "⚠" && /书面词「因此」/.test(i.msg)));
});

test("抖音口播检查：小写 frame、### 标题、Tab 缩进的口播也读得到（和 vo 同一套规则）", async () => {
  const items = await scriptItems("### 钩子 (frame 1)\n\tAI 写了 3 条。\n");
  assert.ok(items.some((i) => i.level === "⚠" && /第 1 句有阿拉伯数字/.test(i.msg)));
});
```

（`ep` 是 `sc.test.mjs` 里已有的建作品目录辅助函数。第一句要超过 28 个字。）

Run → 新测试 FAIL（Tab / 小写读不到）

  - `scenario-content/scripts/sc.mjs`：删 `douyinLines` 和它上面的注释块；import `{ parseScript } from "./lib/shared/script-md.mjs"`；检查循环改成：

```js
    const lines = parseScript(douyin);
    for (const { frame, text, emotion, sentences } of lines) {
      for (const s of sentences) {
        if (chars(s) > LIMITS.douyinLine) r.warn(`抖音第 ${frame} 帧有一句 ${chars(s)} 字，建议 ≤ ${LIMITS.douyinLine}：${s}`, f.douyinScript);
      }
      if (emotion && !EMOTIONS.includes(emotion)) r.fail(`抖音第 ${frame} 句情感「${emotion}」无效，可选：${EMOTIONS.slice(0, 7).join(" ")}`, f.douyinScript);
      const written = WRITTEN_WORDS.filter((w) => text.includes(w));
      if (written.length) r.warn(`抖音第 ${frame} 句有书面词「${written.join("、")}」，配音会像播报：${text}`, f.douyinScript);
      if (/\d/.test(text)) r.warn(`抖音第 ${frame} 句有阿拉伯数字，TTS 可能读错，建议写汉字：${text}`, f.douyinScript);
    }
```

  - 跑 scenario-content 测试 → 0 失败

- [ ] **Step 8:** `shared/README.md` 加 `### node/script-md.mjs`（用途、`parseScript` 字段、规则、谁在用、来源：原 vo/kv/sc 三份，规则以 vo 为准）。跑 studio 测试（含一致性、no-legacy）、`st sync-shared --check`。

- [ ] **Step 9: Commit** — `refactor: SCRIPT.md 解析收进 shared/，sc、kv、vo 用同一套规则（sc 去掉旧分镜表写法）`

---

### Task 5: `draft-run.mjs`：wa、ic、vdraft 共用存草稿调用

**Files:** Create `shared/node/draft-run.mjs`、`shared/tests/draft-run.test.mjs`；Modify `shared/manifest.json`、`shared/README.md`、`wechat-article/scripts/wa.mjs`、`image-cards/scripts/draft.mjs`、`video-draft/scripts/vdraft.mjs`、三个 `tests/draft-via.test.mjs`（如断言了旧报错文字）；拷贝三份

**Interfaces:** Produces `takeVia(argv) → [via, rest]`；`runDraft(via, steps, payload, { tmpPrefix = "draft-" } = {}) → void`（失败抛 Error，文字见 Global Constraints）。

- [ ] **Step 1: 写失败测试** `shared/tests/draft-run.test.mjs`：

```js
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runDraft, takeVia } from "../node/draft-run.mjs";

/** 假 bd / pd：把参数和载荷内容记进 calls.log，按 FAKE_EXIT 退出；PATH 只放它们 */
function fakeBins(exit = 0) {
  const dir = mkdtempSync(join(tmpdir(), "draft-run-"));
  mkdirSync(join(dir, "bin"));
  for (const name of ["bd", "pd"]) {
    const f = join(dir, "bin", name);
    writeFileSync(f, `#!/usr/bin/env bash\necho "${name} $1 $2" >> "${dir}/calls.log"\ncat "$3" >> "${dir}/calls.log"\nexit ${exit}\n`);
    chmodSync(f, 0o755);
  }
  return dir;
}
const withPath = (path, fn) => {
  const old = process.env.PATH;
  process.env.PATH = path;
  try { return fn(); } finally { process.env.PATH = old; }
};
const calls = (dir) => (existsSync(join(dir, "calls.log")) ? readFileSync(join(dir, "calls.log"), "utf8") : "");

test("takeVia：默认 browser；取出 --via 和它的值；值不对报错", () => {
  assert.deepEqual(takeVia(["a.md"]), ["browser", ["a.md"]]);
  assert.deepEqual(takeVia(["draft", "--via", "phone", "a.md"]), ["phone", ["draft", "a.md"]]);
  assert.throws(() => takeVia(["--via", "pc"]), /--via 只能是 browser 或 phone，收到：pc/);
});

test("runDraft：写载荷 JSON，调 bd run <步骤> <载荷>", () => {
  const dir = fakeBins();
  withPath(`${join(dir, "bin")}:/usr/bin:/bin`, () => runDraft("browser", { browser: "/s/draft_x.py" }, { copy: "文案.md" }, { tmpPrefix: "t-" }));
  assert.match(calls(dir), /^bd run \/s\/draft_x\.py\n\{"copy":"文案\.md"\}/);
});

test("runDraft：phone 调 pd；手机不可用（退出码 3）→ 提示去掉 --via phone", () => {
  const dir = fakeBins(3);
  assert.throws(() => withPath(`${join(dir, "bin")}:/usr/bin:/bin`, () => runDraft("phone", { phone: "/s/phone_x.py" }, {})), /手机不可用（见上面的提示）；去掉 --via phone 改用浏览器/);
  assert.match(calls(dir), /^pd run \/s\/phone_x\.py/);
});

test("runDraft：其他失败 → 发草稿失败，看上面的输出", () => {
  const dir = fakeBins(1);
  assert.throws(() => withPath(`${join(dir, "bin")}:/usr/bin:/bin`, () => runDraft("browser", { browser: "/s/x.py" }, {})), /发草稿失败，看上面的输出/);
});

test("runDraft：命令找不到 → 说要装哪个 skill", () => {
  assert.throws(() => withPath("/nowhere", () => runDraft("browser", { browser: "/s/x.py" }, {})), /需要 bd 命令（skills\/browser-draft，软链接到 PATH）/);
  assert.throws(() => withPath("/nowhere", () => runDraft("phone", { phone: "/s/x.py" }, {})), /需要 pd 命令（skills\/phone-draft，软链接到 PATH）/);
});

test("runDraft：这个平台没有该方式的步骤 → 报错，不调命令", () => {
  const dir = fakeBins();
  assert.throws(() => withPath(`${join(dir, "bin")}:/usr/bin:/bin`, () => runDraft("phone", { browser: "/s/x.py" }, {})), /这个平台没有 --via phone 的步骤（可用：browser）/);
  assert.equal(calls(dir), "");
});
```

Run → FAIL（模块不存在）

- [ ] **Step 2: 实现** `shared/node/draft-run.mjs`：

```js
// 存草稿的公共部分：--via 选浏览器（browser-draft 的 bd）还是手机（phone-draft 的 pd），
// 把载荷写成临时 JSON，调 `bd run <步骤.py> <载荷.json>` / `pd run …`。手机不可用时报错，不回落到浏览器。
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BIN = { browser: "bd", phone: "pd" };
const SKILL = { browser: "browser-draft", phone: "phone-draft" };
const EXIT_NO_DEVICE = 3;

/** 取出 --via browser|phone（默认 browser），返回 [via, 其余参数] */
export function takeVia(argv) {
  const i = argv.indexOf("--via");
  if (i < 0) return ["browser", argv];
  const via = argv[i + 1];
  if (!BIN[via]) throw new Error(`--via 只能是 browser 或 phone，收到：${via}`);
  return [via, [...argv.slice(0, i), ...argv.slice(i + 2)]];
}

/** steps：{ browser?: 步骤脚本, phone?: 步骤脚本 }；payload：交给步骤脚本的数据 */
export function runDraft(via, steps, payload, { tmpPrefix = "draft-" } = {}) {
  if (!steps[via]) throw new Error(`这个平台没有 --via ${via} 的步骤（可用：${Object.keys(steps).join("、")}）`);
  const payloadFile = join(mkdtempSync(join(tmpdir(), tmpPrefix)), "payload.json");
  writeFileSync(payloadFile, JSON.stringify(payload));
  const bin = BIN[via];
  try {
    execFileSync(bin, ["run", steps[via], payloadFile], { stdio: "inherit" });
  } catch (err) {
    if (err.code === "ENOENT") throw new Error(`需要 ${bin} 命令（skills/${SKILL[via]}，软链接到 PATH）`);
    if (via === "phone" && err.status === EXIT_NO_DEVICE) throw new Error("手机不可用（见上面的提示）；去掉 --via phone 改用浏览器");
    throw new Error("发草稿失败，看上面的输出");
  }
}
```

Run `node --test shared/tests/draft-run.test.mjs` → PASS（6 个）

- [ ] **Step 3:** manifest 加 `"node/draft-run.mjs": [三个位置]`，跑 `node studio/scripts/st.mjs sync-shared`。

- [ ] **Step 4: 改三个使用方**（每个：删本地 `VIA`、`VIA_SKILL`、`EXIT_NO_DEVICE`、`takeVia`、`runDraft`、写载荷文件的两行和因此不再用到的 import；加 `import { runDraft, takeVia } from "./lib/shared/draft-run.mjs";`）：
  - `wechat-article/scripts/wa.mjs` `draft()`：`runDraft(via, { phone: join(SKILL_DIR, "scripts", "phone_wechat.py"), browser: join(SKILL_DIR, "scripts", "draft_wechat.py") }, payload, { tmpPrefix: "wa-draft-" });`
  - `image-cards/scripts/draft.mjs` `main()`：保留开头的 `if (via === "phone") throw …vdraft…` 提示；末尾 `runDraft(via, { browser: join(SKILL_DIR, "scripts", "draft_xiaohongshu.py") }, { copy: opts.file, images }, { tmpPrefix: "ic-draft-" });`
  - `video-draft/scripts/vdraft.mjs` `main()`：`runDraft(via, { [via]: join(SKILL_DIR, "scripts", STEPS[to][via]) }, { video, copy, ...(cover ? { cover } : {}) }, { tmpPrefix: "vdraft-" });`
  - 三个 `tests/draft-via.test.mjs` 里若断言了旧文字（如「去掉 --via phone 就用浏览器」「只能是 phone 或 browser」），改成 Global Constraints 里的新文字

- [ ] **Step 5:** 跑 wechat-article、image-cards、video-draft、studio 测试和 `node --test shared/tests/*.test.mjs`；`st sync-shared --check`。Expected 全部 0 失败。`shared/README.md` 加 `### node/draft-run.mjs` 一节。

- [ ] **Step 6: Commit** — `refactor: 存草稿的 --via 调用收进 shared/，wa、ic、vdraft 共用，报错说法统一`

---

### Task 6: 文档和验收

**Files:** Modify `CLAUDE.md`、`shared/README.md`（核对完整）、`browser-draft/SKILL.md`、`phone-draft/SKILL.md`（提到 copy_format 共用方式的地方）

- [ ] **Step 1:** `CLAUDE.md` 第 1 节：
  - 「目录结构」一格末尾加：「仓库根 `shared/` 放工具包内部的共用代码正本（SCRIPT.md 解析、存草稿调用、找 Chrome、发布文案解析），各 skill 存同步来的拷贝；改共用代码只改 `shared/` 再跑 `st sync-shared`」
  - 「测试框架与命令」一格加：「共用代码：`node --test shared/tests/*.test.mjs`；拷贝一致性：`st sync-shared --check`」
  - 1.1「发草稿的分层」里 `phone-draft 的 Python 通过 PYTHONPATH 复用 browser-draft/lib` 改成「phone-draft 用自己 lib/ 里由 shared/ 同步来的 copy_format.py」
  - `st` 命令说明里加 `sync-shared`
- [ ] **Step 2:** `browser-draft/SKILL.md`、`phone-draft/SKILL.md`：搜 `copy_format`、`共用`、`../browser-draft`，改成「copy_format.py 正本在仓库 shared/，两边各一份拷贝」。`grep -rn "\.\./browser-draft" --include=*.md --include=*.mjs --include=*.py --include=pd . | grep -v -e node_modules -e "^./docs/"` → 无输出。
- [ ] **Step 3: 全量验收**

```bash
for s in voiceover video-director video-draft knowledge-video studio scenario-content wechat-article image-cards; do echo "== $s $(cd $s && node --test tests/*.test.mjs 2>&1 | grep -E '^# (pass|fail)' | tr '\n' ' ')"; done
node --test shared/tests/*.test.mjs 2>&1 | grep -E '^# (pass|fail)'
(cd phone-draft && /home/power/self-media-skills/phone-draft/.venv/bin/python -m pytest -q | tail -1)
(cd browser-draft && /home/power/self-media-skills/phone-draft/.venv/bin/python -m pytest -q | tail -1)
node studio/scripts/st.mjs sync-shared --check; echo "exit $?"
./voiceover/bin/vo "/home/power/flow-check/04-作品/流程测试/02-导演做法/抖音" --check
./scenario-content/bin/sc check "/home/power/flow-check/04-作品/流程测试/02-导演做法" 2>&1 | tail -5
./phone-draft/bin/pd devices 2>&1 | tail -2
```

Expected：全部 0 失败；`--check` 退出码 0；`vo --check` 通过；`sc check` 能跑完（结果和合并前 main 上跑的一致，或多出因规则放宽读到的口播行）；`pd devices` 不是 `ModuleNotFoundError`。

在 worktree 里跑命令要用 worktree 的 bin（上面都写的是 `./<skill>/bin/…`），不要用 PATH 上已安装的那份。

- [ ] **Step 4: Commit** — `docs: CLAUDE.md、browser-draft / phone-draft 说明 shared/ 正本和 st sync-shared`

- [ ] **Step 5: 完成报告**（CLAUDE.md 第 6 节）；沉淀提议：`shared/node/chrome.mjs` 可提议进公共仓库 `modules/node/find-chrome`（只提议）。然后 superpowers:finishing-a-development-branch。
