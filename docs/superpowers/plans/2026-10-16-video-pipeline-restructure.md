# 视频流水线重组 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删掉 template 做法和 narrated-video，把剩下的功能拆进 voiceover（`vo`）、video-director（`vd`）、video-draft（`vdraft`）、scenario-content（`sc rec`），一期作品只有一个 `抖音/` 导演工程，kv 只有一套步骤。

**Architecture:** 先删 nv 里只有 template 用的代码，再把 nv 剩下的四块（录屏、存草稿、渲染验片、配音）逐块 `git mv` 到新家，每搬一块就让那一块的测试在新家通过；nv 搬空后整个删掉。然后改 kv（一套步骤）、studio（`st new` 用 `vd init`、install/doctor/init 换命令和配置），最后改文档、迁移两个作品项目的配置、在 flow-check 端到端验收。skill 之间只通过命令行和文件约定连接。

**Tech Stack:** Node.js 22+（ESM `.mjs`、`node:test`），bash 入口（`readlink -f`），HyperFrames 0.8.143（只装在 video-director），Python（voiceover 的 cosyvoice 用 `.venv`），FFmpeg。

**Spec:** `docs/superpowers/specs/2026-10-16-video-pipeline-restructure-design.md`

## Global Constraints

- 只保留 director 做法；`narrated-video/` 目录、`nv` 命令、`抖音-director` 目录名、`STORYBOARD.md`、faceless-explainer 依赖全部去掉（`docs/` 下历史文档除外）。
- 旧作品不迁移、不专门兼容（用户选 C）；但读到旧 `run.json` 里的 `video` 字段要直接忽略，不能崩。
- skill 之间只通过命令行（PATH 上的命令）或文件约定连接，不 import 对方代码，不用相对路径找对方目录。
- hyperframes 只装在 `video-director/node_modules`，版本 `0.8.143`。
- vo → vd 的文件接口：`assets/voice/NN.wav`、`audio_meta.json`（帧内时间）、`caption_groups.json`（全片时间），格式见 spec 2.1。
- 字幕分组规则移植自 hyperframes faceless-explainer `scripts/captions.mjs`（Apache-2.0），文件头写出处和许可证；参数：静音 0.18 秒、尾巴 0.12 秒、句末 `/[.?!,;:—]$/`、密度窗口 1 秒、字数上限 >3.5→2、>2.5→3、否则 4；宽高 1080×1920。
- 配音缓存目录仍是 `<项目根>/.media/voice-cache`，项目根改由 `voiceover.config.json` 定位。
- 配置拆分：`tts` → `voiceover.config.json`；`rec` → `scenario-content.config.json` 的 `rec`；`narrated-video.config.json` 删除。
- 命令名：`vo`（voiceover）、`vdraft`（video-draft）、`vd init|render|verify`，`sc rec|rec-flow`；vd 不认识的子命令透传给 hyperframes。
- 实测绝不编造；只存草稿不点发布；登录、扫码、验证由用户做（studio/SKILL.md 铁律）。
- 每个新 skill 目录：`SKILL.md` + `bin/<命令>` + `scripts/` + `tests/` + `README.md`；`bin/` 用 `readlink -f` 定位 skill 目录。
- 不留注释掉的代码、未使用的导入、调试输出（CLAUDE.md 第 5 节）。
- 提交信息：`<type>: <描述>`，结尾加 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。

## 计划阶段发现的与 spec 的出入（已在对应任务里处理）

1. **vd 配置的 `accent` 没人用**：`video-director/scripts/lib/config.mjs` 读出来的 `accent` 没有任何代码使用（品牌组件用 DIRECTOR.md 的 palette）。spec 5.1 说搬到 `video-director.config.json`，计划改为**直接删掉**，不搬。
2. **TTS 服务商 kokoro、edge 删掉**：两者都不导出 `wordTimestamps`，`nv hf-audio` 遇到没有逐字时间会直接报错（`hf-audio.mjs`「没有逐字时间戳…字幕无法对齐」），所以在现在的流程里根本用不了；kokoro 还要借 hyperframes 的 `tts` 子命令。voiceover 只保留 cosyvoice、qwenaudio、seedaudio、volcengine，默认服务商从 kokoro 改成 qwenaudio。Python 依赖只剩 cosyvoice 用的 `dashscope`。
3. **不再写 `audio_engine_meta.json`**：那是给 faceless 的 `fetch-sfx` 用的（template 才用），vd 只读 `audio_meta.json`。
4. **kv 判断「导演脚本写了没有」用 `vd cues --check`**：`vd init` 放进去的模板 DIRECTOR.md 跑 `vd cues --check` 必然失败（已实测：13 处问题），所以不用给 DIRECTOR.md 记模板哈希；概念科普也用同一个判断。

这几条在完成报告里要再跟用户说一遍。

## Review Focus

1. **重新配音后音效不丢**：作品已经 `vd build` 过、`audio_meta.json` 里有 `sfx`，再跑 `vo 抖音` → 新的 `audio_meta.json` 保留原来的 `sfx`。（Task 5 加测试）
2. **段间停顿（`--pause`）下的字幕时间**：前一帧 `duration_s` 含停顿时，下一帧的字幕全片时间要从含停顿的位置算起，不能和配音错位。（Task 5 加测试）
3. **旧 run.json 不崩**：`run.json` 里有 `video: "template"`、`gates.storyboard` 的老作品跑 `kv status` 照常出 15 步结果，不抛异常。（Task 7 加测试）
4. **`vd init` 不覆盖已有工程**：目标目录已存在且非空（比如已经做了一半的 `抖音/`）→ 报错退出，一个文件都不动。（Task 4 加测试）
5. **中文和空格路径**：`vo`、`vdraft`、`sc rec` 的入口放在带中文和空格的路径下也能运行（作品目录都是中文）。（Task 2、3、5 加测试）

---

## 文件结构

**新建**

| 文件 | 职责 |
|---|---|
| `voiceover/SKILL.md`、`README.md`、`package.json`、`bin/vo` | 配音 skill；README 写文件接口 |
| `voiceover/scripts/vo.mjs` | 原 `hf-audio.mjs`：读 SCRIPT/VOICE → 配音 → 写 `audio_meta.json`、`caption_groups.json` |
| `voiceover/scripts/lib/caption-groups.mjs` | `buildCaptionGroups(meta)`：字幕分组（移植） |
| `voiceover/scripts/lib/{config,speech,align,pronounce,voice-cache,voice-direction,is-main}.mjs`、`voiceover/tts/` | 从 nv 搬来 |
| `voiceover/references/{voice-direction,setup}.md` | 配音导演稿写法；参考音色、密钥、cosyvoice 的 venv |
| `voiceover/tests/fixtures/director-02/{audio_meta,caption_groups}.json` | flow-check 02 的真实数据 |
| `video-draft/SKILL.md`、`README.md`、`package.json`、`bin/vdraft`、`scripts/vdraft.mjs`、`scripts/{draft,phone}_{douyin,xiaohongshu}.py` | 存视频草稿 |
| `video-director/scripts/lib/init.mjs` | `initProject(dir, { runHf })` |
| `video-director/scripts/{render,verify}.mjs`、`scripts/lib/is-main.mjs` | 从 nv 搬来 |
| `scenario-content/scripts/{rec,rec-flow}.mjs`、`scripts/rec/`、`scripts/lib/{rec-common,rec-config}.mjs` | 实测录屏 |
| `studio/tests/no-legacy.test.mjs` | 守护用例 |
| `studio/skeleton/voiceover.config.json` | 配音配置骨架 |

**修改**：`video-director/{bin/vd,scripts/vd.mjs,scripts/lib/{config,hyperframes}.mjs,package.json}`、`scenario-content/bin/sc`、`knowledge-video/scripts/{kv.mjs,lib/{practical,practical-facts,status,video}.mjs}`、`studio/scripts/lib/{new,install,doctor,init,project}.mjs`、`studio/skeleton/*`、`studio/templates/抖音/*`、各 SKILL.md、`studio/references/workflow.md`、`CLAUDE.md`、`content-repurpose/references/douyin.md`、`knowledge-video/references/qa.md`。

**删除**：`narrated-video/`（整个）、`video-director/scripts/lib/stale.mjs` 及测试、`studio/templates/抖音/{BRIEF模板,STORYBOARD模板,STORYBOARD模板-翻车,SCRIPT模板-翻车}.md`、`studio/skeleton/{narrated-video.config.json,06-品牌资产/hyperframes/frame.md,06-品牌资产/hyperframes/caption-skin.html}`。

---

### Task 0: 开分支和 worktree

**Files:** 无代码改动

- [ ] **Step 1: 用 superpowers:using-git-worktrees 建 worktree**

从当前 HEAD（`fix/workflow-check`，含 spec 提交 `4c44198`）开新分支 `refactor/video-pipeline`，worktree 放在 `../self-media-skills-video`。

- [ ] **Step 2: 装依赖、确认基线**

```bash
cd ../self-media-skills-video
for s in narrated-video video-director knowledge-video studio scenario-content; do (cd $s && npm ci --no-audit --no-fund >/dev/null 2>&1; echo "== $s"; node --test tests/*.test.mjs 2>&1 | grep -E "^# (pass|fail)"); done
```

Expected: 每个 skill 都是 `# fail 0`。把各自的 pass 数记进本次的完成报告（「修前基线」）。

- [ ] **Step 3: 让命令走 worktree 里的代码**

本计划里所有手动运行命令的步骤都在这个 shell 里做：

```bash
export WT=$(pwd)
export PATH="$WT/voiceover/bin:$WT/video-director/bin:$WT/video-draft/bin:$WT/scenario-content/bin:$WT/knowledge-video/bin:$WT/studio/bin:$PATH"
```

（`voiceover/bin`、`video-draft/bin` 现在还不存在，建好后自动生效。）

---

### Task 1: 删掉 narrated-video 里只有 template 用的代码

**Files:**
- Delete: `narrated-video/scripts/{hf-build,hf-frames,hf-kit,hf-sfx,hf-fonts,sync,voice,new}.mjs`、`narrated-video/scripts/{bounds,occupancy,stillness,font_subset}.py`、`narrated-video/scripts/lib/{frame-build,localize,sfx,script-md,chrome}.mjs`、`narrated-video/{hf-kit,templates,presets,examples}/`、`narrated-video/references/{douyin-recipe,hf-kit}.md`、`narrated-video/tests/{bounds,kit-browser}.test.mjs`、`narrated-video/tests/helpers/`、`narrated-video/tests/fixtures/frame-flat.html`
- Modify: `narrated-video/bin/nv`、`narrated-video/tests/hf.test.mjs`、`narrated-video/tests/bin.test.mjs`
- Create: `content-repurpose/references/douyin.md`（追加「成品教程」帧结构）

**Interfaces:**
- Consumes: 无
- Produces: nv 只剩 `hf-audio`、`render`、`verify`、`rec`、`rec-flow`、`draft` 和透传；后面的任务逐块把它们搬走

- [ ] **Step 1: 把「成品教程」帧结构搬进 content-repurpose**

打开 `narrated-video/references/douyin-recipe.md`，找到「成品教程」那一节（14 帧的表：钩子：成品亮相 / 你能拿到什么 / 准备 / 三步 / 一个坑 / 怎么避开 / 回到成品 / 领模板 / 下一期，以及 SCRIPT.md 的格式要求：`## 段名 (Frame N)`、`**重点词:**`、`**Emotion:**`、每句 ≤ 28 字、数字写汉字）。把这一节原文追加到 `content-repurpose/references/douyin.md` 末尾，标题改成 `## 抖音 SCRIPT.md：成品教程结构（第 7 步）`；里面提到 `nv hf-audio --check` 的地方改成 `vo 抖音 --check`，提到 STORYBOARD、`build:`、帧模板的句子删掉。

- [ ] **Step 2: 确认要删的文件没有被留下的代码引用**

```bash
cd narrated-video
grep -nE "hf-build|hf-frames|hf-kit|hf-sfx|hf-fonts|sync\.mjs|voice\.mjs|new\.mjs|frame-build|localize|lib/sfx|script-md|lib/chrome|presets|loadPreset|resolveLook" \
  scripts/hf-audio.mjs scripts/render.mjs scripts/verify.mjs scripts/rec.mjs scripts/rec-flow.mjs scripts/draft.mjs \
  scripts/lib/{captions-step,config,cues,is-main,speech,align,pronounce,voice-cache,voice-direction,rec-common}.mjs tts/*.mjs
```

Expected: 只有 `scripts/lib/config.mjs` 里 `loadPreset`、`resolveLook`、`LOOKS` 的定义（Task 5 删），没有别的命中。若有其他命中，停下来报告。

- [ ] **Step 3: 删除**

```bash
cd narrated-video
git rm -q scripts/{hf-build,hf-frames,hf-kit,hf-sfx,hf-fonts,sync,voice,new}.mjs scripts/{bounds,occupancy,stillness,font_subset}.py \
  scripts/lib/{frame-build,localize,sfx,script-md,chrome}.mjs references/{douyin-recipe,hf-kit}.md \
  tests/{bounds,kit-browser}.test.mjs tests/fixtures/frame-flat.html
git rm -rq hf-kit templates presets examples tests/helpers
```

- [ ] **Step 4: 精简 `tests/hf.test.mjs`**

只保留这 5 个测试，其余删掉（它们测的代码已删）：`parseHfScript 读出帧号、口播、情感和重点词`、`toCaptionWords 按分句切开…`、`restoreCase 把 TTS 小写…`、`toCaptionWords：TTS 把标点和后面的字并成一个时间戳…`、`verify.evaluate：帧数、时长、声音、尺寸逐项判断`。文件头的 import 改成：

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseHfScript, restoreCase, toCaptionWords } from "../scripts/hf-audio.mjs";

const chars = (s, t0 = 0, step = 0.1) => [...s].map((ch, i) => ({ text: ch, start: t0 + i * step, end: t0 + (i + 1) * step }));
```

- [ ] **Step 5: 改 `bin/nv` 的命令表和帮助**

文件头注释只留这几行（其余删）：

```bash
#!/usr/bin/env bash
# narrated-video 统一入口（正在拆分，见 docs/superpowers/specs/2026-10-16-video-pipeline-restructure-design.md）。
#   nv hf-audio <HyperFrames 工程> [--check] [--pause 秒]   配音 + 逐字时间 + 字幕分组
#   nv rec <输出.mp4> --prompt <文件> --app deepseek|doubao   录 AI 对话实测（手机 App；--url 走浏览器）
#   nv rec-flow <输出.mp4> --steps <步骤.py>  按步骤操作网页并录屏
#   nv render <视频目录> [--sample] [参数]  渲染到 <视频目录>/renders/，完成后自动做成片检查
#   nv verify <成片.mp4>                成片检查
#   nv draft <成片.mp4> --copy <发布文案.md> [--cover 图] [--to douyin|xiaohongshu] [--via browser|phone]  存草稿
#   nv <其他>                           透传给 hyperframes（check/snapshot/preview/doctor/lint…）
```

`case` 那一行改成：

```bash
  rec | rec-flow | verify | draft | hf-audio)
```

- [ ] **Step 6: 改 `tests/bin.test.mjs`**

```js
test("nv help 显示文件头的命令列表（含 nv draft 和透传说明），不带后面的脚本，不再列 template 命令", () => {
  const out = execFileSync(NV, ["help"], { encoding: "utf8" });
  assert.match(out, /nv draft/);
  assert.match(out, /透传给 hyperframes/);
  assert.doesNotMatch(out, /hf-build|hf-kit|nv voice|nv new/);
  assert.doesNotMatch(out, /set -euo|^#/m);
});
```

（同文件里其他测试如果引用了已删命令，一并删掉。）

- [ ] **Step 7: 跑 nv 测试**

Run: `cd narrated-video && node --test tests/*.test.mjs 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# fail 0`

- [ ] **Step 8: Commit**

```bash
git add -A narrated-video content-repurpose/references/douyin.md
git commit -m "refactor: 删掉 narrated-video 里只有 template 做法用的代码

成品教程的帧结构搬到 content-repurpose/references/douyin.md（第 7 步写 SCRIPT 要用）。

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 实测录屏搬进 scenario-content（`sc rec`、`sc rec-flow`）

**Files:**
- Move: `narrated-video/scripts/{rec,rec-flow}.mjs` → `scenario-content/scripts/`；`narrated-video/scripts/rec/` → `scenario-content/scripts/rec/`；`narrated-video/scripts/lib/rec-common.mjs` → `scenario-content/scripts/lib/rec-common.mjs`；`narrated-video/tests/rec-via.test.mjs` → `scenario-content/tests/rec-via.test.mjs`
- Create: `scenario-content/scripts/lib/rec-config.mjs`、`scenario-content/tests/rec-config.test.mjs`
- Modify: `scenario-content/bin/sc`、`narrated-video/bin/nv`（去掉 rec、rec-flow）

**Interfaces:**
- Consumes: 无
- Produces: `loadRecConfig(startDir) → { root: string, configPath: string|null, rec: object }`；`fromRoot(config, p) → string|null`；命令 `sc rec`、`sc rec-flow`（参数和原 `nv rec`、`nv rec-flow` 完全一样）

- [ ] **Step 1: 写 rec-config 的失败测试**

`scenario-content/tests/rec-config.test.mjs`：

```js
// sc rec / rec-flow 的配置：scenario-content.config.json 的 rec 字段
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fromRoot, loadRecConfig } from "../scripts/lib/rec-config.mjs";

test("loadRecConfig：从作品子目录往上找 scenario-content.config.json，取 rec 字段", () => {
  const root = mkdtempSync(join(tmpdir(), "sc-rec-"));
  writeFileSync(join(root, "scenario-content.config.json"), JSON.stringify({ voiceGuide: "x", rec: { cdpPort: 9333, theme: "dark" } }));
  mkdirSync(join(root, "04-作品/a/实测"), { recursive: true });
  const c = loadRecConfig(join(root, "04-作品/a/实测"));
  assert.equal(c.root, root);
  assert.deepEqual(c.rec, { cdpPort: 9333, theme: "dark" });
  assert.equal(fromRoot(c, "x/y.txt"), join(root, "x/y.txt"));
  assert.equal(fromRoot(c, undefined), null);
});

test("loadRecConfig：找不到配置 → rec 是空对象，root 是起始目录", () => {
  const dir = mkdtempSync(join(tmpdir(), "sc-rec-"));
  const c = loadRecConfig(dir);
  assert.deepEqual(c.rec, {});
  assert.equal(c.root, dir);
  assert.equal(c.configPath, null);
});

test("loadRecConfig：配置不是合法 JSON → 报中文错误", () => {
  const root = mkdtempSync(join(tmpdir(), "sc-rec-"));
  writeFileSync(join(root, "scenario-content.config.json"), "{");
  assert.throws(() => loadRecConfig(root), /scenario-content\.config\.json 不是合法的 JSON/);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd scenario-content && node --test tests/rec-config.test.mjs`
Expected: FAIL，`Cannot find module '.../scripts/lib/rec-config.mjs'`

- [ ] **Step 3: 写 `scenario-content/scripts/lib/rec-config.mjs`**

```js
// sc rec / sc rec-flow 的配置：从给定目录往上找 scenario-content.config.json，取其中的 rec 字段。
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CONFIG_NAME = "scenario-content.config.json";

function findUp(startDir) {
  for (let dir = resolve(startDir); ; dir = dirname(dir)) {
    if (existsSync(join(dir, CONFIG_NAME))) return join(dir, CONFIG_NAME);
    if (dirname(dir) === dir) return null;
  }
}

/** @returns {{ root: string, configPath: string | null, rec: object }} */
export function loadRecConfig(startDir = process.cwd()) {
  const configPath = findUp(startDir);
  if (!configPath) return { root: resolve(startDir), configPath: null, rec: {} };
  let cfg;
  try {
    cfg = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (err) {
    throw new Error(`${configPath} 不是合法的 JSON：${err.message}`);
  }
  return { root: dirname(configPath), configPath, rec: cfg.rec ?? {} };
}

/** 项目内相对路径 → 绝对路径 */
export const fromRoot = (config, p) => (p ? resolve(config.root, p) : null);
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd scenario-content && node --test tests/rec-config.test.mjs`
Expected: PASS（3 个）

- [ ] **Step 5: 搬录屏代码**

```bash
mkdir -p scenario-content/scripts/lib
git mv narrated-video/scripts/rec.mjs scenario-content/scripts/rec.mjs
git mv narrated-video/scripts/rec-flow.mjs scenario-content/scripts/rec-flow.mjs
git mv narrated-video/scripts/rec scenario-content/scripts/rec
git mv narrated-video/scripts/lib/rec-common.mjs scenario-content/scripts/lib/rec-common.mjs
git mv narrated-video/tests/rec-via.test.mjs scenario-content/tests/rec-via.test.mjs
```

然后改引用（逐处用 Edit）：

- `scenario-content/scripts/lib/rec-common.mjs`：`import { fromRoot } from "./config.mjs";` → `import { fromRoot } from "./rec-config.mjs";`；文件头 `// nv rec / nv rec-flow 共用` → `// sc rec / sc rec-flow 共用`
- `scenario-content/scripts/rec.mjs`：`import { SKILL_DIR, loadConfig } from "./lib/config.mjs";` → `import { SKILL_DIR, loadRecConfig } from "./lib/rec-config.mjs";`；`const config = loadConfig(dirname(o.out));` → `const config = loadRecConfig(dirname(o.out));`；所有用法文字里的 `nv rec` → `sc rec`；`mkdtempSync(join(tmpdir(), "nv-rec-"))` → `"sc-rec-"`
- `scenario-content/scripts/rec-flow.mjs`：同上换 import 和 `loadRecConfig`；`nv rec-flow` → `sc rec-flow`；`BU_NAME: process.env.BU_NAME || "nv-rec-flow"` → `"sc-rec-flow"`
- `scenario-content/tests/rec-via.test.mjs`：`SCRIPT` 仍是 `join(SKILL, "scripts", "rec.mjs")`（SKILL 指向 scenario-content，不用改）；测试名、断言里的 `nv rec` → `sc rec`

`rec.mjs`、`rec-flow.mjs` 里 `config.rec?.xxx` 的写法不用改（`loadRecConfig` 返回的对象同样有 `rec` 字段）。

- [ ] **Step 6: 给 `rec-via.test.mjs` 加中文路径用例（Review Focus 5）**

```js
test("rec.mjs 放在带中文和空格的路径下也能运行（作品目录都是中文）", () => {
  const { dir, env } = setup();
  const copy = join(mkdtempSync(join(tmpdir(), "sc-")), "工具 copy");
  cpSync(join(SKILL, "scripts"), join(copy, "scripts"), { recursive: true });
  const r = spawnSync("node", [join(copy, "scripts/rec.mjs"), join(dir, "录屏 1.mp4"), "--prompt", join(dir, "提问.txt"), "--app", "deepseek"], { env, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(calls(dir), /^pd rec deepseek .*提问\.txt .*录屏 1\.mp4/);
});
```

（`cpSync` 加进文件头的 `node:fs` import。）

- [ ] **Step 7: 改 `scenario-content/bin/sc`**

```bash
#!/usr/bin/env bash
# scenario-content 入口：
#   sc check <作品目录> [--json]
#   sc bench <关键词…> [--platform 抖音|小红书|all] [--out 文件.json] [--top 10]
#   sc rec <输出.mp4> --prompt <提问.txt> --app deepseek|doubao [--think] [--search] [--timeout 秒]   （--url <网址> 走浏览器）
#   sc rec-flow <输出.mp4> --steps <步骤.py> --url <网址>
set -euo pipefail
SKILL_DIR="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"
case "${1:-}" in
  rec | rec-flow) cmd="$1"; shift; exec node "$SKILL_DIR/scripts/$cmd.mjs" "$@" ;;
  *) exec node "$SKILL_DIR/scripts/sc.mjs" "$@" ;;
esac
```

- [ ] **Step 8: nv 去掉 rec、rec-flow**

`narrated-video/bin/nv`：删掉文件头 `nv rec`、`nv rec-flow` 两行；`case` 改成 `verify | draft | hf-audio)`。

- [ ] **Step 9: 跑两边测试**

```bash
(cd scenario-content && node --test tests/*.test.mjs 2>&1 | grep -E "^# (pass|fail)")
(cd narrated-video && node --test tests/*.test.mjs 2>&1 | grep -E "^# (pass|fail)")
sc rec 2>&1 | head -2
```

Expected: 两边 `# fail 0`；`sc rec` 打出 `✗ 用法：sc rec <输出.mp4> --prompt …`

- [ ] **Step 10: Commit**

```bash
git add -A scenario-content narrated-video
git commit -m "refactor: 实测录屏从 nv 搬进 scenario-content（sc rec、sc rec-flow），配置读 scenario-content.config.json 的 rec

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 新建 video-draft（`vdraft`）

**Files:**
- Move: `narrated-video/scripts/draft.mjs` → `video-draft/scripts/vdraft.mjs`；`narrated-video/scripts/{draft_douyin,draft_xiaohongshu,phone_douyin,phone_xiaohongshu}.py` → `video-draft/scripts/`；`narrated-video/tests/draft-via.test.mjs` → `video-draft/tests/draft-via.test.mjs`
- Create: `video-draft/bin/vdraft`、`video-draft/package.json`、`video-draft/tests/entry.test.mjs`
- Modify: `narrated-video/bin/nv`（去掉 draft）

**Interfaces:**
- Consumes: PATH 上的 `bd`、`pd`
- Produces: 命令 `vdraft <成片.mp4> --copy <文案.md> [--cover <图>] [--to douyin|xiaohongshu] [--via browser|phone]`，行为和原 `nv draft` 一样；SKILL.md、README 在 Task 10 写

- [ ] **Step 1: 搬文件**

```bash
mkdir -p video-draft/{bin,scripts,tests}
git mv narrated-video/scripts/draft.mjs video-draft/scripts/vdraft.mjs
for f in draft_douyin draft_xiaohongshu phone_douyin phone_xiaohongshu; do git mv narrated-video/scripts/$f.py video-draft/scripts/$f.py; done
git mv narrated-video/tests/draft-via.test.mjs video-draft/tests/draft-via.test.mjs
```

- [ ] **Step 2: 改测试指向新脚本，先跑一次确认失败**

`video-draft/tests/draft-via.test.mjs`：`const SCRIPT = join(SKILL, "scripts", "draft.mjs");` → `join(SKILL, "scripts", "vdraft.mjs")`；断言 `/^bd run .*narrated-video\/scripts\/draft_xiaohongshu\.py /` → `/^bd run .*video-draft\/scripts\/draft_xiaohongshu\.py /`。

加一个用法文字的断言（新行为，会失败）：

```js
test("缺参数：用法写 vdraft", () => {
  const { env } = setup();
  const r = run([], env);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /用法：vdraft <成片\.mp4> --copy/);
});
```

Run: `cd video-draft && node --test tests/draft-via.test.mjs`
Expected: 新加的用例 FAIL（用法里还是 `nv draft`），其余 PASS

- [ ] **Step 3: 改 `vdraft.mjs`**

- 文件头 `// nv draft <成片.mp4> …` → `// vdraft <成片.mp4> …`
- `const USAGE = "用法：nv draft …"` → `"用法：vdraft <成片.mp4> --copy <发布文案.md> [--cover <封面图>] [--to douyin|xiaohongshu] [--via browser|phone]"`
- `mkdtempSync(join(tmpdir(), "nv-draft-"))` → `"vdraft-"`

`SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..")` 不用改，它现在指向 `video-draft/`，`join(SKILL_DIR, "scripts", STEPS[to][via])` 正好找到搬过来的 `.py`。

- [ ] **Step 4: 写 `bin/vdraft`、`package.json`**

`video-draft/bin/vdraft`（`chmod +x`）：

```bash
#!/usr/bin/env bash
# video-draft 入口：vdraft <成片.mp4> --copy <发布文案.md> [--cover <封面图>] [--to douyin|xiaohongshu] [--via browser|phone]
# 把成片 + 文案（+ 封面）存进抖音或小红书的草稿箱，不发布。默认浏览器（browser-draft 的 bd），--via phone 用手机（phone-draft 的 pd）。
set -euo pipefail
SKILL_DIR="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"
exec node "$SKILL_DIR/scripts/vdraft.mjs" "$@"
```

`video-draft/package.json`：

```json
{
  "name": "video-draft",
  "private": true,
  "type": "module",
  "description": "把成片存进抖音、小红书草稿箱（不发布）",
  "bin": { "vdraft": "bin/vdraft" },
  "scripts": { "test": "node --test tests/*.test.mjs" }
}
```

- [ ] **Step 5: 入口测试（含中文路径，Review Focus 5）**

`video-draft/tests/entry.test.mjs`：

```js
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const SKILL = new URL("..", import.meta.url).pathname;

test("bin/vdraft 经软链接调用、放在中文和空格路径下也能找到脚本", () => {
  const dir = join(mkdtempSync(join(tmpdir(), "vdraft-")), "工具 copy");
  cpSync(SKILL, dir, { recursive: true });
  const r = spawnSync(join(dir, "bin/vdraft"), [], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /用法：vdraft/);
});
```

- [ ] **Step 6: nv 去掉 draft**

`narrated-video/bin/nv`：删掉文件头 `nv draft` 一行；`case` 改成 `verify | hf-audio)`。

- [ ] **Step 7: 跑测试**

```bash
chmod +x video-draft/bin/vdraft
(cd video-draft && node --test tests/*.test.mjs 2>&1 | grep -E "^# (pass|fail)")
(cd narrated-video && node --test tests/*.test.mjs 2>&1 | grep -E "^# (pass|fail)")
```

Expected: 两边 `# fail 0`

- [ ] **Step 8: Commit**

```bash
git add -A video-draft narrated-video
git commit -m "feat: 新建 video-draft（vdraft），抖音、小红书存草稿从 nv 搬过来

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: video-director 接手 hyperframes、渲染验片；新增 `vd init` 和透传

**Files:**
- Move: `narrated-video/scripts/{render,verify}.mjs` → `video-director/scripts/`；`narrated-video/tests/render.test.mjs` → `video-director/tests/render.test.mjs`
- Create: `video-director/scripts/lib/is-main.mjs`（复制 nv 的，Task 5 原文件会搬去 voiceover）、`video-director/scripts/lib/init.mjs`、`video-director/tests/init.test.mjs`、`video-director/tests/verify.test.mjs`
- Modify: `video-director/scripts/lib/{hyperframes,config}.mjs`、`video-director/scripts/vd.mjs`、`video-director/bin/vd`、`video-director/package.json`、`video-director/tests/{config,entry,vd}.test.mjs`、`narrated-video/bin/nv`、`narrated-video/tests/hf.test.mjs`
- Delete: `video-director/scripts/lib/stale.mjs`、`video-director/tests/stale.test.mjs`

**Interfaces:**
- Consumes: 无（不再引用 narrated-video）
- Produces:
  - `hfBin() → string`（`video-director/node_modules/.bin/hyperframes`）、`hfVersion() → string`
  - `loadConfig(root, { hfVersion }) → { fontsDir, gsap, brandDir, sfxDir, hfVersion }`（不再有 `accent`）
  - `initProject(dir: string, { runHf: (args: string[]) => { status: number, stdout?: string, stderr?: string } }) → void`
  - `main(argv, { passthrough? }) → Promise<number>`；子命令 `init|cues|build|check|qa|render|verify`，其余透传

- [ ] **Step 1: 改 config、hyperframes 的测试（先失败）**

`video-director/tests/config.test.mjs`：

- 删掉「loadConfig：brandDir 转绝对路径，读 narrated-video 配置里的强调色」，换成：

```js
test("loadConfig：brandDir 转绝对路径；不读别的 skill 的配置，没有 accent", () => {
  const dir = project({ "video-director.config.json": CFG, "narrated-video.config.json": { hfKit: { tokens: { accent: "#FFD84D" } } } });
  const c = loadConfig(dir, { hfVersion: "0.8.143" });
  assert.equal(c.brandDir, join(dir, "06-品牌资产/hyperframes"));
  assert.equal("accent" in c, false);
  assert.equal(c.hfVersion, "0.8.143");
});
```

- 「没写 hfVersion 就用 narrated-video 装的…」改名「没写 hfVersion 就用 vd 自己装的 hyperframes 版本」，调用改成 `loadConfig(project(...), { hfVersion: "0.8.143" })`
- 「hfVersion 和 narrated-video 装的不一致」改名「hfVersion 和 vd 装的不一致 → 报错」，调用 `loadConfig(dir, { hfVersion: "0.8.143" })`，断言 `/0\.8\.119.*0\.8\.143/`
- 其余调用 `loadConfig(dir)` 的测试都补上第二个参数 `{ hfVersion: "0.8.143" }`（单元测试不依赖 node_modules）
- 最后一个测试换成：

```js
test("hfBin：指向 video-director 自己装的 hyperframes", async () => {
  const { hfBin } = await import("../scripts/lib/hyperframes.mjs");
  assert.match(hfBin(), /video-director\/node_modules\/\.bin\/hyperframes$/);
});
```

Run: `cd video-director && node --test tests/config.test.mjs`
Expected: FAIL（`accent` 还在、hfBin 指向 narrated-video、参数名不对）

- [ ] **Step 2: 加 hyperframes 依赖、改 `hyperframes.mjs`、`config.mjs`**

```bash
cd video-director && npm install --save-exact hyperframes@0.8.143 --no-audit --no-fund
```

`video-director/scripts/lib/hyperframes.mjs` 全文：

```js
// hyperframes 只用一份：video-director 自己装的（版本钉在 package.json）。vd build 的检查和配乐、渲染、透传都走它。
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_DIR = join(dirname(fileURLToPath(import.meta.url)), "../..");

export const hfBin = () => join(SKILL_DIR, "node_modules/.bin/hyperframes");

/** 装的 hyperframes 版本；没装时报错说怎么装 */
export function hfVersion() {
  const p = join(SKILL_DIR, "node_modules/hyperframes/package.json");
  if (!existsSync(p)) throw new Error(`video-director 还没装 hyperframes：cd ${SKILL_DIR} && npm ci`);
  return JSON.parse(readFileSync(p, "utf8")).version;
}
```

`video-director/scripts/lib/config.mjs`：

- 文件头第一行 → `// 项目配置 video-director.config.json。`
- `import { nvHfVersion } from "./hyperframes.mjs";` → `import { hfVersion as installedHfVersion } from "./hyperframes.mjs";`
- `loadConfig` 换成：

```js
/** hfVersion 选填：默认就是 vd 装的版本；写了且不一样就报错（统一只用一份 hyperframes） */
export function loadConfig(root, { hfVersion = installedHfVersion() } = {}) {
  const p = join(root, FILE);
  if (!existsSync(p)) throw new Error(`找不到 video-director.config.json：${p}`);
  const c = JSON.parse(readFileSync(p, "utf8"));
  for (const k of REQUIRED) if (!c[k]) throw new Error(`${p} 缺少字段 ${k}`);
  if (c.hfVersion && c.hfVersion !== hfVersion) throw new Error(`${p} 的 hfVersion ${c.hfVersion} 和 video-director 装的 hyperframes ${hfVersion} 不一致：删掉 hfVersion 这个字段`);
  const abs = (x) => (isAbsolute(x) ? x : join(root, x));
  return { fontsDir: c.fontsDir ? abs(c.fontsDir) : null, gsap: c.gsap ? abs(c.gsap) : GSAP_FILE, brandDir: abs(c.brandDir), sfxDir: abs(c.sfxDir), hfVersion };
}
```

Run: `cd video-director && node --test tests/config.test.mjs`
Expected: PASS

- [ ] **Step 3: 删 stale**

```bash
git rm -q video-director/scripts/lib/stale.mjs video-director/tests/stale.test.mjs
```

`vd.mjs`：删 `import { staleCopies } from "./lib/stale.mjs";` 和 `load()` 里那两行 `const stale = staleCopies(dir); if (stale.length) …`。

- [ ] **Step 4: 写 `vd build` 缺字幕分组的失败测试**

先看 `video-director/tests/vd.test.mjs` 里已有的 build 测试怎么建工程（用 `tests/helpers.mjs` 的 `project`），照同样写法在 `vd.test.mjs` 加：

```js
test("vd build：工程里没有 caption_groups.json → 报错，提示先跑 vo", async () => {
  const dir = project({ "video-director.config.json": { brandDir: "b", sfxDir: "s" }, "抖音/DIRECTOR.md": "x", "抖音/audio_meta.json": { voices: [] } });
  const err = [];
  const orig = console.error;
  console.error = (m) => err.push(m);
  try {
    assert.equal(await main(["build", join(dir, "抖音")]), 1);
  } finally {
    console.error = orig;
  }
  assert.match(err.join("\n"), /没有 caption_groups\.json.*先跑 vo/);
});
```

（`main` 从 `../scripts/vd.mjs` import；若文件头已 import 则复用。）

Run: `cd video-director && node --test --test-name-pattern "caption_groups" tests/vd.test.mjs`
Expected: FAIL（现在先报 DIRECTOR.md 解析错误）

- [ ] **Step 5: `COMMANDS.build` 开头加检查**

```js
  build(dir, rest = []) {
    if (!existsSync(join(dir, "caption_groups.json"))) throw new Error(`${dir} 里没有 caption_groups.json：先跑 vo ${dir}（配音时一起生成）`);
    const config = loadConfig(findProjectRoot(dir));
```

`load()` 里缺 `audio_meta.json` 的报错也改成提示 vo：

```js
  for (const f of ["DIRECTOR.md", "audio_meta.json"]) if (!existsSync(join(dir, f))) throw new Error(`${dir} 里没有 ${f}${f === "audio_meta.json" ? "：先跑 vo " + dir : ""}`);
```

Run: `cd video-director && node --test tests/vd.test.mjs`
Expected: PASS

- [ ] **Step 6: 写 `vd init` 的失败测试（含 Review Focus 4）**

`video-director/tests/init.test.mjs`：

```js
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { initProject } from "../scripts/lib/init.mjs";
import { hfBin } from "../scripts/lib/hyperframes.mjs";

const TEMPLATES = new URL("../templates/", import.meta.url).pathname;
/** 假 hyperframes init：建目录，放一个 blank 示例的 index.html */
const fakeHf = (calls) => (args) => {
  calls.push(args);
  mkdirSync(args[1], { recursive: true });
  writeFileSync(join(args[1], "index.html"), "<blank/>");
  writeFileSync(join(args[1], "hyperframes.json"), "{}");
  return { status: 0 };
};

test("initProject：跑 hyperframes init blank（不带 faceless），放 vd 的 index.html、DIRECTOR.md，建 compositions/frames、assets", () => {
  const dir = join(mkdtempSync(join(tmpdir(), "vd-init-")), "抖音");
  const calls = [];
  initProject(dir, { runHf: fakeHf(calls) });
  assert.deepEqual(calls, [["init", dir, "--non-interactive", "--example=blank"]]);
  assert.equal(readFileSync(join(dir, "index.html"), "utf8"), readFileSync(join(TEMPLATES, "index.html"), "utf8"));
  assert.equal(readFileSync(join(dir, "DIRECTOR.md"), "utf8"), readFileSync(join(TEMPLATES, "DIRECTOR.md"), "utf8"));
  assert.ok(existsSync(join(dir, "compositions/frames")));
  assert.ok(existsSync(join(dir, "assets")));
});

test("initProject：目录已存在且不为空 → 报错，不调 hyperframes，原有文件不动", () => {
  const dir = mkdtempSync(join(tmpdir(), "vd-init-"));
  writeFileSync(join(dir, "SCRIPT.md"), "旧的");
  const calls = [];
  assert.throws(() => initProject(dir, { runHf: fakeHf(calls) }), /已存在且不是空目录/);
  assert.equal(calls.length, 0);
  assert.deepEqual(readdirSync(dir), ["SCRIPT.md"]);
  assert.equal(readFileSync(join(dir, "SCRIPT.md"), "utf8"), "旧的");
});

test("initProject：目录存在但是空的 → 照常建", () => {
  const dir = mkdtempSync(join(tmpdir(), "vd-init-"));
  initProject(dir, { runHf: fakeHf([]) });
  assert.ok(existsSync(join(dir, "DIRECTOR.md")));
});

test("initProject：hyperframes init 失败 → 报错带输出", () => {
  const dir = join(mkdtempSync(join(tmpdir(), "vd-init-")), "抖音");
  assert.throws(() => initProject(dir, { runHf: () => ({ status: 1, stderr: "boom" }) }), /hyperframes init 失败：boom/);
});

test("真跑 hyperframes init：建出来的工程能过 hyperframes check", { skip: !existsSync(hfBin()) && "没装 hyperframes" }, async () => {
  const { spawnSync } = await import("node:child_process");
  const dir = join(mkdtempSync(join(tmpdir(), "vd-init-")), "抖音");
  initProject(dir, { runHf: (args) => spawnSync(hfBin(), args, { encoding: "utf8", env: { ...process.env, HYPERFRAMES_SKIP_SKILLS: "1" } }) });
  const r = spawnSync(hfBin(), ["check", "."], { cwd: dir, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
```

Run: `cd video-director && node --test tests/init.test.mjs`
Expected: FAIL，`Cannot find module '.../scripts/lib/init.mjs'`

- [ ] **Step 7: 写 `video-director/scripts/lib/init.mjs`**

```js
// vd init <目录>：建一个空的导演工程 = hyperframes 的 blank 工程 + vd 的 index.html、DIRECTOR.md 模板。
// 目录已存在且不为空时拒绝，不覆盖做了一半的工程。
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TEMPLATES = join(dirname(fileURLToPath(import.meta.url)), "../../templates");

export function initProject(dir, { runHf }) {
  if (existsSync(dir) && readdirSync(dir).length) throw new Error(`${dir} 已存在且不是空目录，不覆盖（要重建就先改名备份）`);
  const r = runHf(["init", dir, "--non-interactive", "--example=blank"]);
  if (r.status !== 0) throw new Error(`hyperframes init 失败：${`${r.stderr ?? ""}${r.stdout ?? ""}`.trim().slice(-300)}`);
  for (const f of ["index.html", "DIRECTOR.md"]) cpSync(join(TEMPLATES, f), join(dir, f));
  for (const d of ["compositions/frames", "assets"]) mkdirSync(join(dir, d), { recursive: true });
}
```

Run: `cd video-director && node --test tests/init.test.mjs`
Expected: PASS（5 个；最后一个若 hyperframes 已装会真跑。若真跑的 `hyperframes check` 失败，看输出：是模板 index.html 本身的问题就停下报告，不要改测试）

- [ ] **Step 8: 搬 render、verify，加 is-main**

```bash
cp narrated-video/scripts/lib/is-main.mjs video-director/scripts/lib/is-main.mjs
git mv narrated-video/scripts/render.mjs video-director/scripts/render.mjs
git mv narrated-video/scripts/verify.mjs video-director/scripts/verify.mjs
git mv narrated-video/tests/render.test.mjs video-director/tests/render.test.mjs
```

- `video-director/scripts/render.mjs`：文件头 `// nv render …` → `// vd render …`；删 `const HF = join(SKILL_DIR, "node_modules/.bin/hyperframes");`，加 `import { hfBin } from "./lib/hyperframes.mjs";`，`spawnSync(HF, …)` → `spawnSync(hfBin(), …)`；用法文字 `nv render` → `vd render`
- `video-director/scripts/verify.mjs`：`nv verify` → `vd verify`，`nv render 渲染完会自动运行` → `vd render 渲染完会自动运行`
- 把 `narrated-video/tests/hf.test.mjs` 里的 `verify.evaluate：帧数、时长、声音、尺寸逐项判断` 测试剪切到新文件 `video-director/tests/verify.test.mjs`（文件头 `import assert from "node:assert/strict"; import { test } from "node:test";`，`import("../scripts/verify.mjs")` 路径不变）

- [ ] **Step 9: 写透传和新子命令的失败测试**

`video-director/tests/entry.test.mjs` 现有用例跑的是 `vd.mjs nope` 期望退出码 2——透传以后 `nope` 会交给 hyperframes，改成不带参数：

```js
test("vd.mjs：放在带中文和空格的路径下也能运行（不能静默退出 0）", () => {
  const dir = join(mkdtempSync(join(tmpdir(), "vd-")), "工具 copy");
  cpSync(new URL("../scripts", import.meta.url), join(dir, "scripts"), { recursive: true });
  const r = spawnSync("node", [join(dir, "scripts/vd.mjs")], { encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /用法：vd init\|cues\|build\|check\|qa\|render\|verify/);
});
```

`video-director/tests/vd.test.mjs` 加：

```js
test("main：不认识的子命令原样透传给 hyperframes，返回它的退出码", async () => {
  const seen = [];
  const code = await main(["lint", "抖音", "--json"], { passthrough: (args) => (seen.push(args), 7) });
  assert.equal(code, 7);
  assert.deepEqual(seen, [["lint", "抖音", "--json"]]);
});

test("main：init 建工程；目录不空时退出码 1", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vd-main-"));
  writeFileSync(join(dir, "x"), "");
  assert.equal(await main(["init", dir]), 1);
});
```

（补 `mkdtempSync`、`writeFileSync`、`tmpdir` 的 import。）

Run: `cd video-director && node --test tests/entry.test.mjs tests/vd.test.mjs`
Expected: FAIL（用法文字不对、没有 passthrough、没有 init）

- [ ] **Step 10: 改 `vd.mjs`**

- 文件头注释第一行 → `// 用法：vd init|cues|build|check|qa|render|verify <视频工程目录>；其他子命令透传给 hyperframes`，并加三行：

```js
//   init   建空的导演工程（hyperframes blank + vd 模板）；目录不为空时拒绝
//   render 渲染到 <工程>/renders/（--sample 出 sample.mp4），完成后自动 verify
//   verify <成片.mp4> [--project <工程>]：帧数、时长、声音、尺寸、黑屏
```

- `USAGE` → `"用法：vd init|cues|build|check|qa|render|verify <视频工程目录> [--sample] [--no-music] [--update-components] [--check]；其他子命令透传给 hyperframes"`
- import 加 `import { spawnSync } from "node:child_process";`、`import { initProject } from "./lib/init.mjs";`、`import { fileURLToPath } from "node:url";`（已有 `pathToFileURL` 的那行合并）
- 在 `COMMANDS` 里加：

```js
  init(dir) {
    initProject(dir, { runHf: (args) => spawnSync(hfBin(), args, { stdio: ["ignore", "inherit", "pipe"], encoding: "utf8", env: { ...process.env, HYPERFRAMES_SKIP_SKILLS: "1" } }) });
    console.log(`✓ 导演工程：${dir}（写 SCRIPT.md、VOICE.md → vo 配音 → 写 DIRECTOR.md）`);
  },
  render(dir, rest = []) {
    return spawnSync(process.execPath, [join(SCRIPTS, "render.mjs"), dir, ...rest], { stdio: "inherit" }).status ?? 1;
  },
  verify(file, rest = []) {
    return spawnSync(process.execPath, [join(SCRIPTS, "verify.mjs"), file, ...rest], { stdio: "inherit" }).status ?? 1;
  },
```

并在文件上方定义 `const SCRIPTS = fileURLToPath(new URL(".", import.meta.url));`

- `main` 换成：

```js
const runHyperframes = (args) => spawnSync(hfBin(), args, { stdio: "inherit" }).status ?? 1;

export async function main(argv, { passthrough = runHyperframes } = {}) {
  const [cmd, dir, ...rest] = argv;
  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") { console.error(USAGE); return 2; }
  if (!COMMANDS[cmd]) return passthrough(argv);
  if (!dir) { console.error(USAGE); return 2; }
  try { return (await COMMANDS[cmd](resolve(dir), rest)) ?? 0; }
  catch (err) { console.error(`✗ ${err.message}`); return 1; }
}
```

- `video-director/bin/vd` 注释改成 `# video-director 入口：vd init|cues|build|check|qa|render|verify <视频工程目录>；其他子命令透传给 hyperframes`

Run: `cd video-director && node --test tests/*.test.mjs 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# fail 0`

- [ ] **Step 11: nv 去掉 render、verify；确认 vd 不再引用 narrated-video**

`narrated-video/bin/nv`：删 `nv render`、`nv verify` 两行和 `render)` 分支；`case` 改成 `hf-audio)`。

```bash
grep -rn "narrated-video\|\bnv \|nvHfVersion" video-director/scripts video-director/tests video-director/bin
(cd narrated-video && node --test tests/*.test.mjs 2>&1 | grep -E "^# (pass|fail)")
```

Expected: grep 只剩 `video-director/scripts/lib/chrome.mjs` 第 1 行注释（子项目 2 处理，这里把那句「与 narrated-video、image-cards 的同名文件保持一致」改成「与 image-cards 的同名文件保持一致」）；nv `# fail 0`

- [ ] **Step 12: Commit**

```bash
git add -A video-director narrated-video
git commit -m "feat: video-director 自带 hyperframes，接手 render、verify，新增 vd init 和透传

不再读 narrated-video 的配置（accent 没人用，删掉）；删掉配音副本过期检查（以后不复制配音）。

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 新建 voiceover（`vo`），自己生成字幕分组

**Files:**
- Move: `narrated-video/scripts/hf-audio.mjs` → `voiceover/scripts/vo.mjs`；`narrated-video/scripts/lib/{config,speech,align,pronounce,voice-cache,voice-direction,is-main}.mjs` → `voiceover/scripts/lib/`；`narrated-video/tts/` → `voiceover/tts/`；`narrated-video/references/voice-direction.md` → `voiceover/references/`；`narrated-video/tests/{align,pronounce,voice-cache,voice-direction,qwenaudio,seedaudio,volcengine,speech-cache-key}.test.mjs` → `voiceover/tests/`；`narrated-video/tests/hf.test.mjs` → `voiceover/tests/vo.test.mjs`；`narrated-video/.venv` → `voiceover/.venv`（不入库，直接 `mv`）
- Create: `voiceover/scripts/lib/caption-groups.mjs`、`voiceover/tests/caption-groups.test.mjs`、`voiceover/tests/fixtures/director-02/{audio_meta,caption_groups}.json`、`voiceover/bin/vo`、`voiceover/package.json`、`voiceover/tests/entry.test.mjs`、`voiceover/references/setup.md`
- Delete: `voiceover/tts/{kokoro,edge}.mjs`、`narrated-video/scripts/lib/{captions-step,cues}.mjs`、`narrated-video/tests/captions-step.test.mjs`

**Interfaces:**
- Consumes: 无
- Produces:
  - `buildCaptionGroups(meta: { voices: { frame, duration_s, words: { text, start, end }[] }[] }) → { total_duration_s, width: 1080, height: 1920, groups: { id, frame, start, end, text, words: { id, text, start, end }[] }[] }`
  - `loadConfig(startDir) → { tts, root, configPath }`（配置文件 `voiceover.config.json`）
  - 命令 `vo <工程> [--check] [--pause 秒] [--voice x] [--speed x] [--provider x] [--model x]`，写 `assets/voice/NN.wav`、`audio_meta.json`、`caption_groups.json`

- [ ] **Step 1: 放夹具**

```bash
mkdir -p voiceover/tests/fixtures/director-02
cp /home/power/flow-check/04-作品/流程测试/02-导演做法/抖音-director/audio_meta.json voiceover/tests/fixtures/director-02/
cp /home/power/flow-check/04-作品/流程测试/02-导演做法/抖音-director/caption_groups.json voiceover/tests/fixtures/director-02/
```

（`caption_groups.json` 是现在 faceless 生成的，63 个词 → 49 组，总时长 89.24 秒。）

- [ ] **Step 2: 写字幕分组的失败测试（含 Review Focus 2）**

`voiceover/tests/caption-groups.test.mjs`：

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildCaptionGroups } from "../scripts/lib/caption-groups.mjs";

const fixture = (f) => JSON.parse(readFileSync(new URL(`./fixtures/director-02/${f}`, import.meta.url), "utf8"));
const near = (a, b) => Math.abs(a - b) <= 0.0015;
const w = (text, start, end) => ({ text, start, end });
const voice = (frame, duration_s, words) => ({ frame, duration_s, words });

test("和 faceless captions.mjs 生成的那份逐组一致（flow-check 02：63 个词 → 49 组）", () => {
  const want = fixture("caption_groups.json");
  const got = buildCaptionGroups(fixture("audio_meta.json"));
  assert.equal(got.groups.length, want.groups.length);
  assert.ok(near(got.total_duration_s, want.total_duration_s));
  assert.deepEqual([got.width, got.height], [1080, 1920]);
  got.groups.forEach((g, i) => {
    const e = want.groups[i];
    assert.equal(g.id, e.id);
    assert.equal(g.frame, e.frame, `第 ${i} 组 frame`);
    assert.equal(g.text, e.text, `第 ${i} 组 text`);
    assert.ok(near(g.start, e.start) && near(g.end, e.end), `第 ${i} 组时间 ${g.start}-${g.end} ≠ ${e.start}-${e.end}`);
    assert.equal(g.words.length, e.words.length);
    g.words.forEach((x, j) => assert.ok(x.text === e.words[j].text && near(x.start, e.words[j].start) && near(x.end, e.words[j].end)));
  });
});

test("全片时间 = 帧内时间 + 前面各帧 duration_s 之和（duration_s 含段间停顿时也对得上）", () => {
  const meta = { voices: [voice(1, 2.5, [w("第一句.", 0.1, 1.0)]), voice(2, 1.5, [w("第二句.", 0.2, 1.1)])] }; // 第 1 帧说完 1.0 秒，含停顿共 2.5 秒
  const g = buildCaptionGroups(meta).groups;
  assert.deepEqual(g.map((x) => [x.frame, x.start]), [[1, 0.1], [2, 2.7]]);
  assert.equal(buildCaptionGroups(meta).total_duration_s, 4);
});

test("voices 顺序乱了也按帧号算开始时间", () => {
  const meta = { voices: [voice(2, 1, [w("二.", 0, 0.5)]), voice(1, 3, [w("一.", 0, 0.5)])] };
  assert.deepEqual(buildCaptionGroups(meta).groups.map((x) => [x.frame, x.start]), [[1, 0], [2, 3]]);
});

test("换帧一定开新组；句末标点收组", () => {
  const meta = { voices: [voice(1, 1, [w("甲", 0, 0.2), w("乙.", 0.2, 0.4), w("丙", 0.4, 0.6)]), voice(2, 1, [w("丁", 0, 0.2)])] };
  assert.deepEqual(buildCaptionGroups(meta).groups.map((x) => x.text), ["甲 乙.", "丙", "丁"]);
});

test("和上一个词之间静音超过 0.18 秒开新组", () => {
  const meta = { voices: [voice(1, 2, [w("甲", 0, 0.2), w("乙", 0.39, 0.5), w("丙", 0.5, 0.6)])] };
  assert.deepEqual(buildCaptionGroups(meta).groups.map((x) => x.text), ["甲", "乙 丙"]);
});

test("字数上限按往后 1 秒的词数：> 3.5 个/秒最多 2 个词", () => {
  const fast = [0, 0.1, 0.2, 0.3, 0.4].map((t, i) => w(`词${i}`, t, t + 0.1));
  assert.deepEqual(buildCaptionGroups({ voices: [voice(1, 1, fast)] }).groups.map((x) => x.words.length), [2, 2, 1]);
});

test("结束时间 = 最后一个词 + 0.12 秒，但不超过下一组开始", () => {
  const meta = { voices: [voice(1, 3, [w("甲.", 0, 0.5), w("乙.", 0.55, 1.0), w("丙.", 2.0, 2.5)])] };
  assert.deepEqual(buildCaptionGroups(meta).groups.map((x) => x.end), [0.55, 1.12, 2.62]);
});

test("去掉空词和只有标点的词；重点词的 * 保留在 text 里", () => {
  const meta = { voices: [voice(1, 2, [w(" ", 0, 0.1), w(",", 0.1, 0.2), w("*十秒", 0.2, 0.6), w("改完.", 0.6, 1.0)])] };
  assert.deepEqual(buildCaptionGroups(meta).groups.map((x) => x.text), ["*十秒 改完."]);
});
```

Run: `mkdir -p voiceover/scripts/lib && cd voiceover && node --test tests/caption-groups.test.mjs`
Expected: FAIL，`Cannot find module '.../scripts/lib/caption-groups.mjs'`

- [ ] **Step 3: 写 `voiceover/scripts/lib/caption-groups.mjs`**

```js
// 字幕分组：audio_meta.json（每帧的词，帧内时间）→ caption_groups.json（全片时间），vd 的字幕组件读它。
//
// 分组规则移植自 HyperFrames（https://github.com/heygen-com/hyperframes）faceless-explainer skill 的
// scripts/captions.mjs（hyperframes 0.8.143），许可证 Apache-2.0，版权归原作者。
// 改动：帧的开始时间改用 audio_meta 各帧 duration_s 累加（原来从 STORYBOARD.md 读）；只算分组，不生成字幕 HTML。
const SILENCE_GAP = 0.18; // 和上一个词之间静音超过这么多秒 → 开新组
const TAIL_PAD = 0.12; // 一组在最后一个词说完后多停留的秒数
const SENT_END = /[.?!,;:—]$/;
const BARE_PUNCT = /^[.?!,;:—–-]+$/;
const DENSITY_WINDOW = 1.0; // 秒：算语速用的窗口
const WIDTH = 1080;
const HEIGHT = 1920;

const r3 = (x) => Number(x.toFixed(3));
const wordCap = (density) => (density > 3.5 ? 2 : density > 2.5 ? 3 : 4);

/** 各帧的词 → 全片时间的词流（按开始时间排好） */
function absoluteWords(voices) {
  const words = [];
  let base = 0;
  for (const v of [...voices].sort((a, b) => a.frame - b.frame)) {
    for (const w of v.words ?? []) {
      const text = String(w.text ?? "").trim();
      if (!text || BARE_PUNCT.test(text) || !Number.isFinite(w.start) || !Number.isFinite(w.end)) continue;
      words.push({ text, start: r3(base + w.start), end: r3(base + w.end), frame: v.frame });
    }
    base += v.duration_s;
  }
  return words.sort((a, b) => a.start - b.start);
}

/** 换帧、静音、字数满了开新组；句末标点收组 */
function group(words) {
  const densityAt = (i) => {
    const t0 = words[i].start;
    let n = 0;
    for (let j = i; j < words.length && words[j].start < t0 + DENSITY_WINDOW; j++) n++;
    return n / DENSITY_WINDOW;
  };
  const groups = [];
  let cur = null;
  words.forEach((w, i) => {
    const prev = cur?.words.at(-1);
    if (!cur || w.frame !== cur.frame || (prev && w.start - prev.end > SILENCE_GAP) || cur.words.length >= cur.cap) {
      if (cur) groups.push(cur);
      cur = { frame: w.frame, cap: wordCap(densityAt(i)), words: [] };
    }
    cur.words.push(w);
    if (SENT_END.test(w.text)) {
      groups.push(cur);
      cur = null;
    }
  });
  if (cur) groups.push(cur);
  return groups;
}

export function buildCaptionGroups(meta) {
  const voices = meta.voices ?? [];
  const groups = group(absoluteWords(voices));
  return {
    total_duration_s: r3(voices.reduce((a, v) => a + v.duration_s, 0)),
    width: WIDTH,
    height: HEIGHT,
    groups: groups.map((g, gi) => {
      const next = groups[gi + 1];
      let end = r3(g.words.at(-1).end + TAIL_PAD);
      if (next && next.words[0].start < end) end = r3(next.words[0].start);
      return {
        id: `caption-group-${gi}`,
        frame: g.frame,
        start: r3(g.words[0].start),
        end,
        text: g.words.map((w) => w.text).join(" "),
        words: g.words.map((w, wi) => ({ id: `caption-word-${gi}-${wi}`, text: w.text, start: w.start, end: w.end })),
      };
    }),
  };
}
```

Run: `cd voiceover && node --test tests/caption-groups.test.mjs`
Expected: PASS（8 个）。若第一个用例在某一组上差 0.001 以上，停下报告是哪一组、差多少，不要放宽容差。

- [ ] **Step 4: 搬配音代码**

```bash
git mv narrated-video/scripts/hf-audio.mjs voiceover/scripts/vo.mjs
for f in config speech align pronounce voice-cache voice-direction is-main; do git mv narrated-video/scripts/lib/$f.mjs voiceover/scripts/lib/$f.mjs; done
git mv narrated-video/tts voiceover/tts
mkdir -p voiceover/references && git mv narrated-video/references/voice-direction.md voiceover/references/voice-direction.md
for t in align pronounce voice-cache voice-direction qwenaudio seedaudio volcengine speech-cache-key; do git mv narrated-video/tests/$t.test.mjs voiceover/tests/$t.test.mjs; done
git mv narrated-video/tests/hf.test.mjs voiceover/tests/vo.test.mjs
git rm -q voiceover/tts/kokoro.mjs voiceover/tts/edge.mjs narrated-video/scripts/lib/captions-step.mjs narrated-video/scripts/lib/cues.mjs narrated-video/tests/captions-step.test.mjs
[ -d narrated-video/.venv ] && mv narrated-video/.venv voiceover/.venv
ls narrated-video/tests/fixtures 2>/dev/null
```

如果 `narrated-video/tests/fixtures` 里还有被搬走的测试用到的文件（`grep -l fixtures voiceover/tests/*.mjs` 看），一并 `git mv` 到 `voiceover/tests/fixtures/`。

- [ ] **Step 5: 改搬过来的代码**

- `voiceover/tests/vo.test.mjs`：`import … from "../scripts/hf-audio.mjs"` → `"../scripts/vo.mjs"`
- `voiceover/tts/index.mjs`：删 `import * as edge`、`import * as kokoro` 两行；`PROVIDERS` → `{ cosyvoice, qwenaudio, seedaudio, volcengine }`
- `voiceover/tts/volcengine.mjs`：`user: { uid: "narrated-video" }` → `{ uid: "voiceover" }`
- `voiceover/scripts/lib/speech.mjs`：报错里 `narrated-video.config.json 的 tts.reference` → `voiceover.config.json 的 tts.reference`
- `voiceover/scripts/lib/voice-cache.mjs`：注释 `找到了 narrated-video.config.json` → `找到了 voiceover.config.json`；`voiceover/tests/voice-cache.test.mjs` 里的 `narrated-video.config.json` 全部换成 `voiceover.config.json`，`"nv-cache-"` → `"vo-cache-"`
- `voiceover/scripts/lib/config.mjs` 全文换成：

```js
// 项目配置：从给定目录向上查找 voiceover.config.json（只有 tts 字段）。找不到时用默认值。
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const CONFIG_NAME = "voiceover.config.json";

const DEFAULT_TTS = { provider: "qwenaudio", speed: 1.0 };

function findUp(startDir) {
  for (let dir = resolve(startDir); ; dir = dirname(dir)) {
    if (existsSync(join(dir, CONFIG_NAME))) return join(dir, CONFIG_NAME);
    if (dirname(dir) === dir) return null;
  }
}

/** @returns {{ tts: object, root: string, configPath: string | null }} */
export function loadConfig(startDir = process.cwd()) {
  const configPath = findUp(startDir);
  if (!configPath) return { tts: { ...DEFAULT_TTS }, root: resolve(startDir), configPath: null };
  let user;
  try {
    user = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (err) {
    throw new Error(`${configPath} 不是合法的 JSON：${err.message}`);
  }
  return {
    tts: {
      ...DEFAULT_TTS,
      ...user.tts,
      // 参考音频（seedaudio、qwenaudio）按项目根目录解析，在哪个目录跑命令都一样
      ...(user.tts?.reference ? { reference: resolve(dirname(configPath), user.tts.reference) } : {}),
    },
    root: dirname(configPath),
    configPath,
  };
}
```

搬过来的测试里如果有直接测 `loadConfig` 默认服务商是 kokoro、或调用 `loadPreset`/`resolveLook` 的，删掉那几条；跑 `grep -n "kokoro\|edge\|loadPreset\|resolveLook\|narrated" voiceover -r --include=*.mjs | grep -v node_modules` 确认清零。

- [ ] **Step 6: 写 vo 输出文件的失败测试（含 Review Focus 1）**

`vo.mjs` 现在的 `main()` 一口气做完合成和写文件，要先把「写结果」拆成可测的函数。在 `voiceover/tests/vo.test.mjs` 末尾加：

```js
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeOutputs } from "../scripts/vo.mjs";

const v = (frame, duration_s) => ({ frame, path: `assets/voice/0${frame}.wav`, duration_s, words: [{ id: "w0", text: `第${frame}句.`, start: 0, end: 0.5 }], chars: [] });

test("writeOutputs：写 audio_meta.json 和 caption_groups.json，不再写 audio_engine_meta.json、cues.js、STORYBOARD", () => {
  const dir = mkdtempSync(join(tmpdir(), "vo-"));
  writeOutputs(dir, [v(1, 1.2), v(2, 0.8)]);
  const meta = JSON.parse(readFileSync(join(dir, "audio_meta.json"), "utf8"));
  assert.deepEqual(Object.keys(meta), ["bgm", "bgm_pending", "voices", "sfx"]);
  assert.deepEqual(meta.sfx, []);
  const caps = JSON.parse(readFileSync(join(dir, "caption_groups.json"), "utf8"));
  assert.deepEqual(caps.groups.map((g) => [g.frame, g.start]), [[1, 0], [2, 1.2]]);
  for (const f of ["audio_engine_meta.json", "compositions/kit/cues.js", "STORYBOARD.md"]) assert.equal(existsSync(join(dir, f)), false, f);
});

test("writeOutputs：重新配音时保留 audio_meta.json 里原有的 sfx（vd build 放的音效不丢）", () => {
  const dir = mkdtempSync(join(tmpdir(), "vo-"));
  const sfx = [{ id: "s1", path: "assets/sfx/ping.wav", start: 1.2 }];
  writeFileSync(join(dir, "audio_meta.json"), JSON.stringify({ bgm: null, bgm_pending: false, voices: [], sfx }));
  writeOutputs(dir, [v(1, 1)]);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, "audio_meta.json"), "utf8")).sfx, sfx);
});
```

（若文件头已有同名 import，合并，不要重复。）

Run: `cd voiceover && node --test tests/vo.test.mjs`
Expected: FAIL，`writeOutputs` 不存在

- [ ] **Step 7: 改 `vo.mjs`**

- 文件头注释换成：

```js
#!/usr/bin/env node
// 用法：vo <工程目录> [--voice <音色>] [--speed <倍速>] [--provider <服务商>] [--model <模型>] [--pause <秒>] [--check]
//
// 按工程里的 SCRIPT.md（+ 可选的配音导演稿 VOICE.md）配音，写出（格式见 README「文件接口」）：
//   assets/voice/NN.wav    每帧一段配音（首尾静音已切）
//   audio_meta.json        每帧的词和字时间（帧内秒数），重点词以 * 开头；原有的 sfx 保留
//   caption_groups.json    字幕分组（全片秒数），vd 的字幕组件读它
// SCRIPT.md：`## … (Frame N)` 开一句，缩进块是口播原文；可选 `**Emotion:** 惊讶`、`**重点词:** 八秒钟、一下午`。
// VOICE.md 存在且服务商支持（seedaudio、qwenaudio）时，按段整段生成再切回每帧；--pause 只加在段与段之间。
// --check：只检查 VOICE.md 和 SCRIPT.md 对不对得上，不生成、不花钱。
```

- import：删 `import { buildCaptions } from "./lib/captions-step.mjs";`、`import { writeCues } from "./lib/cues.mjs";`；加 `import { buildCaptionGroups } from "./lib/caption-groups.mjs";`
- `parseArgs` 里的用法文字 `nv hf-audio <HyperFrames 工程目录>` → `vo <工程目录>`
- 把 `main()` 末尾从 `const previous = …` 到 `if (buildCaptions(…))…` 整段换成调用 `writeOutputs(dir, voices)` + 一行日志，并新增导出函数：

```js
const writeJson = (dir, file, data) => writeFileSync(join(dir, file), `${JSON.stringify(data, null, 2)}\n`);

/** 写 audio_meta.json（保留原有 sfx）和 caption_groups.json */
export function writeOutputs(dir, voices) {
  const file = join(dir, "audio_meta.json");
  const sfx = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")).sfx ?? [] : [];
  const meta = { bgm: null, bgm_pending: false, voices, sfx };
  writeJson(dir, "audio_meta.json", meta);
  const captions = buildCaptionGroups(meta);
  writeJson(dir, "caption_groups.json", captions);
  return { total: captions.total_duration_s, groups: captions.groups.length };
}
```

`main()` 里 `voices.push({...})` 那段去掉 `id` 字段（`audio_meta.json` 原来也是去掉 id 再写的），注释 `// 逐字时间（nv hf-sfx 按关键词放音效时用）` → `// 逐字时间（vd 按 @词 算时间时用）`。结尾：

```js
  const { total, groups } = writeOutputs(dir, voices);
  console.log(`✓ 配音完成：${voices.length} 帧，共 ${total} 秒 → audio_meta.json、caption_groups.json（${groups} 组字幕）`);
```

Run: `cd voiceover && node --test tests/*.test.mjs 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# fail 0`

- [ ] **Step 8: 入口、package.json、setup 文档**

`voiceover/bin/vo`（`chmod +x`）：

```bash
#!/usr/bin/env bash
# voiceover 入口：vo <工程目录> [--check] [--pause 秒] [--voice x] [--speed x] [--provider x] [--model x]
# 按 SCRIPT.md + VOICE.md 配音，写 assets/voice/、audio_meta.json、caption_groups.json。
set -euo pipefail
SKILL_DIR="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"
export PATH="$SKILL_DIR/.venv/bin:$PATH"   # cosyvoice 用的 Python 环境
exec node "$SKILL_DIR/scripts/vo.mjs" "$@"
```

`voiceover/package.json`：

```json
{
  "name": "voiceover",
  "private": true,
  "type": "module",
  "description": "口播稿配音：SCRIPT.md + VOICE.md → 每帧配音、逐字时间、字幕分组",
  "bin": { "vo": "bin/vo" },
  "scripts": { "test": "node --test tests/*.test.mjs" }
}
```

先确认搬过来的代码没用到 npm 包：`grep -rhn "^import .* from \"[^.n]" voiceover/scripts voiceover/tts | grep -v '"node:'`，Expected: 无输出。有输出就把那个包按 nv `package.json` 里的版本加进 `dependencies` 并 `npm install`。

`voiceover/references/setup.md`：从 `narrated-video/references/setup.md` 剪出「参考音色」整节和 `DASHSCOPE_API_KEY`（`.env`）说明，再加一节：

```markdown
## cosyvoice（可选）

只有 `tts.provider` 是 `cosyvoice` 时才要：

    cd <工具包>/voiceover && uv venv .venv && uv pip install --python .venv/bin/python dashscope

`st install --deps` 会自动装。qwenaudio、seedaudio、volcengine 不需要 Python。
```

`voiceover/tests/entry.test.mjs`（Review Focus 5）：

```js
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const SKILL = new URL("..", import.meta.url).pathname;
const SCRIPT_MD = "## 一 (Frame 1)\n\n    第一句。\n";

test("bin/vo 放在中文和空格路径下也能跑，--check 不花钱", () => {
  const tool = join(mkdtempSync(join(tmpdir(), "vo-")), "工具 copy");
  cpSync(SKILL, tool, { recursive: true, filter: (p) => !p.includes(".venv") });
  const work = join(mkdtempSync(join(tmpdir(), "vo-")), "04-作品 a", "抖音");
  mkdirSync(work, { recursive: true });
  writeFileSync(join(work, "SCRIPT.md"), SCRIPT_MD);
  const r = spawnSync(join(tool, "bin/vo"), [work, "--check"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /没有可用的 VOICE\.md，会逐帧配音/);
});

test("缺参数：用法写 vo", () => {
  const r = spawnSync(join(SKILL, "bin/vo"), [], { encoding: "utf8" });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /用法：vo <工程目录>/);
});
```

Run:

```bash
chmod +x voiceover/bin/vo
(cd voiceover && node --test tests/*.test.mjs 2>&1 | grep -E "^# (pass|fail)")
```

Expected: `# fail 0`

- [ ] **Step 9: Commit**

```bash
git add -A voiceover narrated-video
git commit -m "feat: 新建 voiceover（vo），配音从 nv 搬过来，自己生成字幕分组

字幕分组规则移植自 hyperframes faceless-explainer 的 captions.mjs（Apache-2.0，保留出处），
不再依赖 STORYBOARD.md 和 faceless-explainer；flow-check 02 的 49 组逐组一致。
删掉用不了的 kokoro、edge（不给逐字时间）；配置改读 voiceover.config.json。

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 删掉 narrated-video

**Files:**
- Delete: `narrated-video/`（剩下的 `SKILL.md`、`bin/nv`、`package.json`、`package-lock.json`、`references/setup.md`、`tests/bin.test.mjs`、`node_modules/` 等）

**Interfaces:**
- Consumes: Task 1–5 已把要留的代码全部搬走
- Produces: 仓库里没有 `narrated-video/` 目录

- [ ] **Step 1: 确认剩下的都是该删的**

```bash
git ls-files narrated-video
```

Expected: 只剩 `SKILL.md`、`bin/nv`、`package.json`、`package-lock.json`、`references/setup.md`、`tests/bin.test.mjs`（可能还有 `tests/fixtures/` 里没人用的文件）。若出现 `.mjs`/`.py` 源码，停下报告。

- [ ] **Step 2: 删除**

```bash
git rm -rq narrated-video
rm -rf narrated-video
```

- [ ] **Step 3: Commit**

```bash
git commit -m "refactor: 删掉 narrated-video（功能已拆进 voiceover、video-director、video-draft、scenario-content）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: kv 只有一套步骤

**Files:**
- Modify: `knowledge-video/scripts/lib/{video,practical,practical-facts,status}.mjs`、`knowledge-video/scripts/kv.mjs`、`knowledge-video/references/qa.md`、`knowledge-video/types/concept.md`
- Test: `knowledge-video/tests/{practical,practical-facts,status,kv,kv-practical}.test.mjs`

**Interfaces:**
- Consumes: 命令 `vo <dir> --check`、`vd cues <dir> --check`（环境变量 `KV_VO_CMD`、`KV_VD_CMD` 可换）
- Produces:
  - `practical.mjs`：`STEPS`（15 步）、`GATES = ["topic","script","director","sample","final"]`、`GATE_LABEL`、`practicalStatus(facts)`、`gateBlocker(facts, gate)`、`doneBlocker(facts, key)`；`facts` 不再有 `video`
  - `practical-facts.mjs`：`fingerprint(dir, gate)`、`collectPracticalFacts(dir, run, { runSc, runVoiceCheck, runVdCues, experienceDir }) → { steps, gates }`、`defaultRunners()`、`newestHtml(root)`、`qaProblem`、`QA_CHECKS`、`platformStep`、`templateHashes`
  - `video.mjs`：只剩 `FINAL_RE`

- [ ] **Step 1: 改 `practical.test.mjs`（先失败）**

- 「14 步，四个确认节点挂在 2、7、8、9」换成：

```js
test("15 步，五个确认节点挂在 2、7、8、9、10", () => {
  assert.equal(STEPS.length, 15);
  assert.deepEqual(STEPS.filter((s) => s.gate).map((s) => [s.n, s.gate]), [[2, "topic"], [7, "script"], [8, "director"], [9, "sample"], [10, "final"]]);
  assert.deepEqual(GATES, ["topic", "script", "director", "sample", "final"]);
  assert.deepEqual(STEPS.map((s) => s.key), ["scenario", "topic", "test", "draft", "feynman", "selfcheck", "script", "director", "sample", "render", "wechat", "xiaohongshu", "douyin", "record", "retro"]);
});
```

- 删「director 做法：15 步…」「没有 video 字段的 facts 按 template 处理」两个测试；「director 做法：等 ③a、样片过期…」保留，把 `dirFacts` 里的 `stepsFor("director")` → `STEPS`、`gatesFor("director")` → `GATES`，去掉 `video: "director"`；最后一个断言改成 `/没有这个确认节点：storyboard（可选：topic、script、director、sample、final）/`
- 文件里其他构造 facts 的辅助函数同样去掉 `video` 字段、用 `STEPS`/`GATES`
- 加一条：

```js
test("下一步提示用新命令：第 8 步 vo + vd cues，第 10 步 vd render，不再提 nv", () => {
  const facts = allDone({ steps: { director: { ok: false, why: "还没配音（vo 抖音）" } } });
  const s = practicalStatus(facts);
  assert.match(s.next, /^8 配音 \+ 导演脚本：vo 抖音.*vd cues 抖音 --check/);
  assert.doesNotMatch(JSON.stringify(s), /nv |抖音-director|STORYBOARD/);
});
```

（`allDone` 是文件里已有的「全部做完」辅助函数；名字不同就用文件里实际的那个，接受 `{ steps, gates }` 覆盖。）

import 改成 `import { GATES, STEPS, doneBlocker, gateBlocker, practicalStatus } from "../scripts/lib/practical.mjs";`

Run: `cd knowledge-video && node --test tests/practical.test.mjs`
Expected: FAIL（`GATES` 未导出、步骤数不对）

- [ ] **Step 2: 改 `practical.mjs`**

- 文件头：`// 实用类一期的 15 步和 5 个确认节点（纯函数）。…`
- `GATE_LABEL` 删 `storyboard`
- `STEPS` 换成：

```js
export const STEPS = [
  { n: 1, key: "scenario", label: "场景卡" },
  { n: 2, key: "topic", label: "选题关", gate: "topic" },
  { n: 3, key: "test", label: "实测" },
  { n: 4, key: "draft", label: "母稿" },
  { n: 5, key: "feynman", label: "费曼检查" },
  { n: 6, key: "selfcheck", label: "自检" },
  { n: 7, key: "script", label: "抖音脚本 + 配音稿", gate: "script" },
  { n: 8, key: "director", label: "配音 + 导演脚本", gate: "director" },
  { n: 9, key: "sample", label: "风格样片", gate: "sample" },
  { n: 10, key: "render", label: "渲染 + QA", gate: "final" },
  { n: 11, key: "wechat", label: "公众号" },
  { n: 12, key: "xiaohongshu", label: "小红书" },
  { n: 13, key: "douyin", label: "抖音草稿" },
  { n: 14, key: "record", label: "发布记录" },
  { n: 15, key: "retro", label: "复盘" },
];

export const GATES = STEPS.filter((s) => s.gate).map((s) => s.gate);
```

- 删 `DIRECTOR_VIDEO`、`stepsFor`、`gatesFor`、`how()`；`HOW` 里删 `storyboard`、`renderDirector`，改这几条：

```js
  test: "按 scenario-content 第 3 步实测（sc rec --app 手机录屏，同一提问跑两轮），写 实测记录.md",
  script: "按 content-repurpose 写 抖音/SCRIPT.md 和 抖音/VOICE.md（vo 抖音 --check 要通过）",
  director: "vo 抖音 配音 → 按 video-director 写 抖音/DIRECTOR.md，vd cues 抖音 --check 通过",
  sample: "按 video-director 写样片的几段 → vd build 抖音 --sample → vd qa 抖音 无 ✗ → vd render 抖音 --sample",
  render: "写其余各段 → vd build 抖音 → vd qa 抖音 无 ✗ → vd render 抖音，按 knowledge-video references/qa.md 写 qa.json；vd check 抖音 列出组件候选，交成片时一起给用户",
  xiaohongshu: "写 小红书/文案.md（标题 ≤ 20 字），vdraft <成片.mp4> --copy 小红书/文案.md --cover 抖音/out/01.png --to xiaohongshu 存草稿成功后 kv done <作品> xiaohongshu",
  douyin: "写 抖音/发布文案.md（标题 ≤ 30 字），ic render 抖音/封面.md 出封面，vdraft <成片.mp4> --copy 抖音/发布文案.md --cover 抖音/out/01.png 存草稿成功后 kv done <作品> douyin",
```

- `practicalStatus`、`blockerThrough`、`gateBlocker`、`doneBlocker` 里的 `stepsFor(facts.video)` 全部换成 `STEPS`，`how(s.key, facts.video)` → `HOW[s.key]`，`gatesFor(facts.video)` → `GATES`

Run: `cd knowledge-video && node --test tests/practical.test.mjs`
Expected: PASS

- [ ] **Step 3: 改 `practical-facts.test.mjs`（先失败）**

- 删 template 专用的三个测试：「newer：sheet 比 STORYBOARD 旧…」「重新配音（audio_meta 比 sheet 新）…」「预览-压缩.mp4 不算成片：第 9 步和 ④ 指纹只看正式渲染」（最后这个的意思由下面 director 的渲染测试覆盖）
- `const D = "抖音-director";` → `const D = "抖音";`；删 `dRun`，`dCollect` 改成 `const dCollect = (dir, r = run(), o = {}) => collect(dir, r, { runVdCues: vdOk, ...o });`；`collect` 默认也传 `runVdCues: vdOk`
- 删「director：…导演工程里的配音旧了不算」「director：DIRECTOR.md 写了但配音还没复制进导演工程…」两个测试（复制没了）
- 「director：导演工程里缺 caption_groups.json 或 assets/voice/ 的配音文件…」保留，改期望文字：缺 `caption_groups.json` → `/没有 caption_groups\.json.*vo 抖音/`；缺配音文件 → `/缺配音文件：assets\/voice\/02\.wav.*vo 抖音/`
- 「确认节点：指纹一致 passed，不一致 stale」「director 指纹」里的 `fingerprint(dir, g, "director")`/`fingerprint(dir, g)` 统一成 `fingerprint(dir, g)`，③a 文件用 `抖音/DIRECTOR.md`
- 「草稿步骤」「渲染后还没重新 QA」「第 9 步用 qaProblem 判定」里如果建的是 `抖音/STORYBOARD.md`、`snapshots/sheet.jpg`，改成 director 工程的文件（`抖音/index.html`、`抖音/qa-douyin.json`）；步骤号文字「第 9 步」→「第 10 步」
- 「实测要有录屏」里期望的 `nv rec` → `sc rec`
- 加两个新测试：

```js
test("第 8 步：配音、字幕分组、DIRECTOR.md 齐了才跑 vd cues；vd cues 不过（如还是模板）→ 不通过，原因来自 vd", () => {
  const dir = episode({ "抖音/SCRIPT.md": "x", "抖音/DIRECTOR.md": "模板", "抖音/audio_meta.json": { voices: [] }, "抖音/caption_groups.json": { groups: [] } });
  const bad = dCollect(dir, run(), { runVdCues: () => ({ ok: false, msg: "DIRECTOR.md 有 13 处问题" }) });
  assert.equal(bad.steps.director.ok, false);
  assert.match(bad.steps.director.why, /13 处问题/);
  assert.equal(dCollect(dir).steps.director.ok, true);
  assert.equal("video" in dCollect(dir), false);
});

test("旧 run.json（video: template、有 storyboard 节点）照常判断，不崩（Review Focus 3）", () => {
  const dir = episode({ "抖音/SCRIPT.md": "x" });
  const f = dCollect(dir, run({ video: "template", gates: { storyboard: { passed: true, fingerprint: "x" } } }));
  assert.deepEqual(Object.keys(f.gates).sort(), ["director", "final", "sample", "script", "topic"]);
  assert.equal(f.steps.director.ok, false);
});
```

（`episode` 是文件里已有的建临时作品目录的辅助函数；名字不同就用实际的。）

Run: `cd knowledge-video && node --test tests/practical-facts.test.mjs`
Expected: FAIL

- [ ] **Step 4: 改 `practical-facts.mjs`、`video.mjs`**

`video.mjs` 全文：

```js
// 正式成片：不算压缩预览、风格样片、新旧对比
export const FINAL_RE = /^(?!预览|sample|compare).*\.mp4$/;
```

`practical-facts.mjs`：

- 文件头 → `// 从作品目录读出实用类 15 步的事实，交给 practical.mjs 判断。`
- `import { DIRECTOR_DIR, FINAL_RE, videoMode } from "./video.mjs";` → `import { FINAL_RE } from "./video.mjs";`；加 `const DY = "抖音";`
- `GATE_FILES` 换成：

```js
const GATE_FILES = {
  topic: () => ["选题关.md"],
  script: () => [`${DY}/SCRIPT.md`, `${DY}/VOICE.md`],
  director: () => [`${DY}/DIRECTOR.md`, `${DY}/audio_meta.json`],
  sample: () => [`${DY}/renders/sample.mp4`],
  final: (dir) => finalMp4(dir, `${DY}/renders`),
};
```

- `fingerprint(dir, gate)`：去掉 `video` 参数，`GATE_FILES[video][gate]` → `GATE_FILES[gate]`
- `scSteps` 里 `"实测/ 里没有录屏 mp4（nv rec）"` → `"实测/ 里没有录屏 mp4（sc rec）"`
- 删 `videoSteps`，换成只算第 7 步的：

```js
function scriptStep(dir, run, runVoiceCheck) {
  const script = join(dir, `${DY}/SCRIPT.md`);
  if (!written(dir, `${DY}/SCRIPT.md`, run.templates) || !isScriptFilled(readFileSync(script, "utf8"))) return no(`${DY}/SCRIPT.md 还是空模板`);
  const v = runVoiceCheck(join(dir, DY));
  return v.ok ? ok() : no(v.msg);
}
```

- `missingVoiceFiles(root)` 改提示：

```js
function missingVoiceFiles(root) {
  if (!existsSync(join(root, "caption_groups.json"))) return no(`${DY}/ 里没有 caption_groups.json（vo ${DY} 会一起生成）`);
  const voices = readJsonOrNull(join(root, "audio_meta.json"))?.voices ?? [];
  const missing = voices.map((v) => v.path).filter((p) => p && !existsSync(join(root, p)));
  return missing.length ? no(`${DY}/ 里缺配音文件：${missing.join("、")}（重跑 vo ${DY}）`) : ok();
}
```

- `directorSteps(dir, runVdCues)`：`const root = join(dir, DY);`，`director` 的判断换成：

```js
  let director = !existsSync(join(root, "audio_meta.json")) ? no(`还没配音（vo ${DY}）`)
    : !existsSync(md) ? no(`还没有 ${DY}/DIRECTOR.md（vd init 会放模板）`)
    : missingVoiceFiles(root);
```

其余（样片、渲染）里所有 `DIRECTOR_DIR` → `DY`，`还没渲染（nv render ${DIRECTOR_DIR}）` → `还没渲染（vd render ${DY}）`

- `gateFacts(dir, run)`：`Object.keys(GATE_FILES)`，`fingerprint(dir, g)`
- `collectPracticalFacts`：

```js
export function collectPracticalFacts(dir, run, { runSc, runVoiceCheck, runVdCues, experienceDir }) {
  const { platform, ...sc } = scSteps(dir, runSc);
  const steps = {
    ...sc,
    script: scriptStep(dir, run, runVoiceCheck),
    ...directorSteps(dir, runVdCues),
    ...draftSteps(dir, run),
    record: recordStep(dir),
    retro: retroStep(dir, experienceDir),
  };
  for (const [k, msgs] of Object.entries(platform ?? {})) {
    if (steps[k]?.ok || steps[k]?.content === true) steps[k] = no(`sc check：${msgs.join("；")}`, k === "script" ? {} : { content: false });
  }
  return { steps, gates: gateFacts(dir, run) };
}
```

- `defaultRunners()`：`const nv = process.env.KV_NV_CMD || "nv";` → `const vo = process.env.KV_VO_CMD || "vo";`；`runVoiceCheck` 里 `runCmd(nv, ["hf-audio", douyinDir, "--check"])` → `runCmd(vo, [douyinDir, "--check"])`；`runVdCues` 参数名 `directorDir` → `douyinDir`

Run: `cd knowledge-video && node --test tests/practical-facts.test.mjs`
Expected: PASS

- [ ] **Step 5: 改概念科普（`status.mjs`、`kv.mjs` 的 `collectFacts`）和测试**

`status.test.mjs`：删「分镜、渲染、QA、成片确认」里 template 的部分和「没有 video 字段照旧」那一行；「director 做法：…」测试名改成「脚本确认后 → 导演脚本 → 等 ②a → 样片 → 等 ②b → 渲染 → vd qa → qa → ③」，`at({ video: "director", … })` 去掉 `video`；期望的提示文字里 `抖音-director` → `抖音`，`nv render` → `vd render`，`nv hf-audio` → `vo`。

`kv.test.mjs`：
- 「kv status 概念科普 director：没有 DIRECTOR.md…」：`run.json` 去掉 `video: "director"`；期望不变
- 「…qa-douyin.json 比工程里的 HTML 旧…」「…样片要有 vd qa 结果…」：`const D = "抖音-director";` → `"抖音"`，`run.json` 去掉 `video`
- 删「kv status 概念科普 template：抖音/renders 里只有预览…」
- 加：

```js
test("kv status 概念科普：DIRECTOR.md 还是模板（vd cues 不过）→ 阶段还是 director", () => {
  const dir = episode({ "brief.md": "x", "research.json": { claims: [claim("c01")] }, "抖音/SCRIPT.md": SCRIPT, "抖音/DIRECTOR.md": "模板", "抖音/audio_meta.json": { voices: [] }, "run.json": { type: "concept", gates: { script: { passed: true } } } });
  const r = kv("status", dir, { KV_VD_CMD: "false" });
  assert.match(r.stdout, /阶段：director/);
});
```

（`kv(…)` 辅助函数若不支持传环境变量，给它加第三个参数 `env`，合并进 `spawnSync` 的 `env`。`false` 命令退出码 1，模拟 `vd cues --check` 不过。）

`status.mjs`：
- 文件头阶段说明 → `// 阶段：brief → research → script → director → sample → render → review → done；确认节点：script ①、director ②a、sample ②b、final ③`
- `detectStatus` 里去掉 `if (f.video === "director") { … } else { … }`，只留 director 分支内容（去掉外层 if），提示文字：

```js
  if (!f.hasDirector) return step("director", "vo 抖音 配音 → 写 抖音/DIRECTOR.md（vd cues 抖音 --check 通过）");
  if (!f.gates.director) return step("director", "请用户审 抖音/DIRECTOR.md（确认节点 ②a）", "director");
  if (!f.hasSample) return step("sample", "写样片的几段 → vd build 抖音 --sample → vd qa 抖音 → vd render 抖音 --sample");
  if (!f.sampleQa?.passed) return step("sample", "样片 vd qa 要无 ✗（vd build 抖音 --sample 之后 vd qa 抖音，结果 qa-douyin-sample.json）");
  if (!f.gates.sample) return step("sample", "请用户看 抖音/renders/sample.mp4（确认节点 ②b）", "sample");
  if (!f.hasRender) return step("render", "写其余各段 → vd build 抖音 → vd qa 抖音 → vd render 抖音");
  if (!f.vdQa?.passed) return step("render", "vd qa 抖音 要无 ✗（看 snapshots/cues-sheet.jpg）");
```

- JSDoc 的 `waitingFor` 类型去掉 `"storyboard"`

`kv.mjs`：
- 文件头第 6、7 行：`init [--fresh]   新建 run.json（有 场景卡.md 为实用类）；--fresh 记下刚生成的模板，用来判断「还没写」`；`gate <节点> [--edit] "用户原话"   记录用户确认。实用类：topic script director sample final；概念科普：script director sample final`
- import：`gatesFor` → `GATES`；`import { DIRECTOR_DIR, FINAL_RE, videoMode } from "./lib/video.mjs";` → `import { FINAL_RE } from "./lib/video.mjs";`；从 `practical-facts.mjs` 多 import `defaultRunners`（已有）
- `USAGE` 去掉 `[--video director|template]`
- `GATE_LABEL` 删 `storyboard`；`CONCEPT_GATES` → `const CONCEPT_GATES = ["script", "director", "sample", "final"];`
- `collectFacts`：删 `const video = videoMode(run);`；`DIRECTOR_DIR` → `"抖音"`（3 处路径）；返回对象删 `video`、`hasStoryboard`、`hasSheet`；改：

```js
    hasDirector: existsSync(join(dir, "抖音/DIRECTOR.md")) && existsSync(join(dir, "抖音/audio_meta.json")) && defaultRunners().runVdCues(join(dir, "抖音")).ok,
    hasSample: existsSync(join(dir, "抖音/renders/sample.mp4")),
    hasRender: hasFileIn(dir, "抖音/renders", FINAL_RE),
    …
    gates: Object.fromEntries(CONCEPT_GATES.map((k) => [k, gate(k)])),
```

- `TEMPLATE_FILES` 删 `"抖音/STORYBOARD.md"`
- `initRun`：删 `--video` 的四行（`vi`、`video`、校验、`run.video = video`）；结尾日志 → ``console.log(`✓ run.json（${TYPE_LABEL[episodeType(run)]}）`);``
- `recordGate`：`const allowed = gatesFor(videoMode(run));` → `const allowed = GATES;`；`fingerprint(dir, gate, videoMode(run))` → `fingerprint(dir, gate)`
- `printPracticalStatus`：`类型：实用技巧（视频做法 ${videoMode(run)}）` → `类型：实用技巧`；`printStatus`：`类型：${TYPE_LABEL[f.type]}（视频做法 ${f.video}）` → `类型：${TYPE_LABEL[f.type]}`

`kv-practical.test.mjs` 里如果有断言 `视频做法` 或 `--video` 的，按新输出改。

- [ ] **Step 6: 跑 kv 全部测试**

Run: `cd knowledge-video && node --test tests/*.test.mjs 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# fail 0`

```bash
grep -rn "videoMode\|DIRECTOR_DIR\|抖音-director\|storyboard\|STORYBOARD\|KV_NV\|\bnv \|stepsFor\|gatesFor" knowledge-video/scripts knowledge-video/tests
```

Expected: 无输出

- [ ] **Step 7: 改 `references/qa.md`、`types/concept.md`**

- `knowledge-video/references/qa.md`：`motion` 那一项里「`nv hf-build --motion`」相关的说明换成「以 `vd qa` 的「2 秒不动」检查为准（⚠ 逐条看，确实是有意的静止写进 qa.json 的 issues，severity low）」；其他提到 `nv`、`抖音-director` 的地方换成 `vd`、`抖音`
- `knowledge-video/types/concept.md`：分镜一步只留导演做法（②a 导演脚本 → ②b 风格样片），删「老做法 nv hf-build 总览图」；`nv hf-audio` → `vo`

- [ ] **Step 8: Commit**

```bash
git add -A knowledge-video
git commit -m "refactor: kv 只剩导演做法一套步骤（15 步、5 个确认节点），工程在 抖音/

删掉 run.json 的 video 字段和 kv init --video；KV_NV_CMD 改名 KV_VO_CMD；
导演脚本写没写由 vd cues --check 判断（模板原样过不了）。

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: studio：`st new` 用 `vd init`，install / doctor / init 换命令和配置

**Files:**
- Modify: `studio/scripts/lib/{new,install,doctor,init,project}.mjs`、`studio/tests/{new,install,doctor,project,templates}.test.mjs`、`studio/skeleton/{scenario-content.config.json,06-品牌资产/视觉规范.md,CLAUDE.md,README.md}`
- Create: `studio/skeleton/voiceover.config.json`
- Delete: `studio/skeleton/narrated-video.config.json`、`studio/skeleton/06-品牌资产/hyperframes/{frame.md,caption-skin.html}`、`studio/templates/抖音/{BRIEF模板,STORYBOARD模板,STORYBOARD模板-翻车,SCRIPT模板-翻车}.md`

**Interfaces:**
- Consumes: 命令 `vd init <目录>`、`kv init <作品> --fresh`
- Produces: `st new` 建出第 3 节（spec）那样的 `抖音/`；`COMMANDS` 含 `vo`、`vdraft`，不含 `nv`；`VO_PY = ["dashscope"]`；`install()` 清掉失效的旧软链接

- [ ] **Step 1: 改 `new.test.mjs`（先失败）**

- 文件头注释 `nv、kv 用假命令代替` → `vd、kv 用假命令代替`
- 假命令：

```js
  // 假 vd：init 建目录并放 DIRECTOR.md（真的 vd init 会放模板）；假 kv：记下参数
  writeFileSync(join(bin, "vd"), '#!/usr/bin/env bash\nif [[ "$1" == init ]]; then mkdir -p "$2" && echo 模板 > "$2/DIRECTOR.md"; fi\necho "$@" >> "$(dirname "$0")/../vd.log"\nexit 0\n');
  writeFileSync(join(bin, "kv"), `#!/usr/bin/env bash\necho "$@" >> "${join(root, "kv.log")}"\n`);
  for (const f of ["vd", "kv"]) chmodSync(join(bin, f), 0o755);
```

（`vd.log` 路径要落在 `root` 下：`bin` 在 `root/bin` 时 `$(dirname "$0")/..` 就是 root；若不是，改成和 kv 一样直接写死 `${join(root, "vd.log")}`。）

- 第 60、63 行附近对 `抖音/STORYBOARD.md` 的断言删掉；`for (const f of [...])` 列表里去掉 `"抖音/STORYBOARD.md"`
- 加断言（放进实用类新建的那个测试）：

```js
  assert.equal(readFileSync(join(sb.root, "vd.log"), "utf8").trim(), `init ${join(ep, "抖音")}`);
  for (const f of ["抖音/SCRIPT.md", "抖音/封面.md", "抖音/发布文案.md", "抖音/DIRECTOR.md"]) assert.ok(existsSync(join(ep, f)), f);
  for (const f of ["抖音/STORYBOARD.md", "抖音/BRIEF.md", "抖音/frame.md", "抖音/.hyperframes/caption-skin.html"]) assert.equal(existsSync(join(ep, f)), false, f);
```

- 「编号自动递增；--video director 传给 kv init」改成：

```js
test("编号自动递增；kv init 只带 --fresh", () => {
  const sb = sandbox();
  run(sb, "普通人的AI课", "旧的");
  const r = run(sb, "普通人的AI课", "新的");
  assert.equal(r.status, 0, r.stderr);
  const ep = join(sb.root, "04-作品/普通人的AI课/02-新的");
  assert.ok(existsSync(ep));
  assert.equal(readFileSync(join(sb.root, "kv.log"), "utf8").trim().split("\n").pop(), `init ${ep} --fresh`);
});
```

（`sandbox` 是文件里建临时项目的函数，按实际名字。）

- 「…--video 写错，都报错」：去掉 `--video` 那条断言，改成 `assert.match(run(sb, "普通人的AI课", "X", "--video", "director").stderr, /未知参数：--video/);`

Run: `cd studio && node --test tests/new.test.mjs`
Expected: FAIL（还在调 nv、还有 STORYBOARD）

- [ ] **Step 2: 改 `new.mjs`**

- 文件头用法：`st new <系列> <简称> [--编号 N]`（删 `[--video director|template]`）
- 参数解析：删 `--video` 分支和它的校验；未知的 `--xxx` 参数报 `未知参数：--xxx`（若原来已有这条规则就不用加）
- `createEpisode`：`if (!has("nv")) throw new Error("找不到 nv 命令：先在工具包里跑 st install");` → `has("vd")`、`找不到 vd 命令`
- 抖音那段换成：

```js
  // 抖音：导演工程（vd init：hyperframes blank + DIRECTOR.md 模板），再放口播稿、封面、发布文案的模板
  const dy = join(ep, "抖音");
  run("vd", ["init", dy]);
  const concept = type === "concept";
  fill(concept ? "抖音/SCRIPT模板-概念.md" : "抖音/SCRIPT模板.md", "抖音/SCRIPT.md");
  fill("抖音/封面模板.md", "抖音/封面.md");
  fill("抖音/发布文案模板.md", "抖音/发布文案.md");
  if (!opts.douyinOnly && type === "practical") {
    if (!has("kv")) throw new Error("找不到 kv 命令：先在工具包里跑 st install");
    run("kv", ["init", ep, "--fresh"]); // 记下空模板，kv status 才分得清「还没写」
  }
```

删掉 `mkdirSync(.hyperframes …)`、`copyFileSync(frame.md)`、`copyFileSync(caption-skin)`、`fill(BRIEF)`、`fill(STORYBOARD…)`、`run("nv", ["hf-kit", dy])`；不再用到的 import（`copyFileSync` 等）删掉。

- 删模板文件：

```bash
git rm -q studio/templates/抖音/{BRIEF模板,STORYBOARD模板,STORYBOARD模板-翻车,SCRIPT模板-翻车}.md
```

- `studio/tests/templates.test.mjs`：删测 STORYBOARD、BRIEF、翻车模板的用例，以及第 12 行引用 `narrated-video/scripts/hf-build.mjs CAPTION_BAND` 的注释和它所在的用例（那是 template 帧的版面检查）

Run: `cd studio && node --test tests/new.test.mjs tests/templates.test.mjs`
Expected: PASS

- [ ] **Step 3: install、doctor、project 的测试（先失败）**

`studio/tests/project.test.mjs` 第 150–160 行附近那个用例（`symlinkSync("/nowhere", …narrated-video)` 期望被改回指向工具包）改成：

```js
test("install：清掉指向本工具包、已经失效的旧软链接（skill 和命令）；别处的链接不动", () => {
  const home = mkdtempSync(join(tmpdir(), "st-home-"));
  mkdirSync(join(home, ".claude/skills"), { recursive: true });
  mkdirSync(join(home, ".local/bin"), { recursive: true });
  symlinkSync(join(TOOLKIT_DIR, "narrated-video"), join(home, ".claude/skills/narrated-video"));
  symlinkSync(join(TOOLKIT_DIR, "narrated-video/bin/nv"), join(home, ".local/bin/nv"));
  symlinkSync("/nowhere", join(home, ".local/bin/other"));
  install({ home, log: () => {} });
  assert.equal(existsSync(join(home, ".claude/skills/narrated-video")) || isLink(join(home, ".claude/skills/narrated-video")), false);
  assert.equal(isLink(join(home, ".local/bin/nv")), false);
  assert.equal(readlinkSync(join(home, ".local/bin/other")), "/nowhere");
  assert.equal(readlinkSync(join(home, ".local/bin/vo")), join(TOOLKIT_DIR, "voiceover/bin/vo"));
  assert.equal(readlinkSync(join(home, ".local/bin/vdraft")), join(TOOLKIT_DIR, "video-draft/bin/vdraft"));
});
```

（`isLink = (p) => { try { return lstatSync(p).isSymbolicLink(); } catch { return false; } };` 放文件顶部；补 import。如果这个用例原来在 `install.test.mjs`，就改那里。）

`studio/tests/doctor.test.mjs`：
- 第 67、75、124 行附近：`narrated-video.config.json` → `voiceover.config.json`；第 124 行期望的提示 `references\/setup\.md「参考音色」` 改成 `voiceover\/references\/setup\.md「参考音色」`
- 若有断言 `COMMANDS` 含 `nv`、或 `faceless-explainer` 外部 skill 的，改成 `vo`/`vdraft`，删 faceless

Run: `cd studio && node --test tests/*.test.mjs`
Expected: FAIL

- [ ] **Step 4: 改 project、install、doctor、init 和骨架**

`project.mjs`：

```js
/** voiceover 的 Python 依赖（只有 tts.provider 用 cosyvoice 时要，见 voiceover/references/setup.md） */
export const VO_PY = ["dashscope"];
```

（删 `NV_PY`。）

`install.mjs`：
- `import { NV_PY, TOOLKIT_DIR } from "./project.mjs";` → `import { TOOLKIT_DIR, VO_PY } from "./project.mjs";`；`if (skill === "narrated-video") steps.push(pip(NV_PY));` → `if (skill === "voiceover") steps.push(pip(VO_PY));`
- 新增清理函数，在 `install()` 建完链接后调用 `pruneStale(skillsDir, toolkit, log); pruneStale(binDir, toolkit, log);`：

```js
/** 指向本工具包、但目标已经不存在的软链接（比如删掉的 narrated-video、nv）删掉；指向别处的不动 */
function pruneStale(dir, toolkit, log) {
  for (const name of readdirSync(dir)) {
    const at = join(dir, name);
    let target;
    try { if (!lstatSync(at).isSymbolicLink()) continue; target = readlinkSync(at); } catch { continue; }
    if (!target.startsWith(`${toolkit}/`) || existsSync(at)) continue;
    unlinkSync(at);
    log(`  − ${at}（指向已删除的 ${target}）`);
  }
}
```

`doctor.mjs`：
- `CONFIG_PATHS`：删 `"narrated-video.config.json": [...]`，加 `"voiceover.config.json": ["tts.reference"]`
- `COMMANDS`：删 `nv: "narrated-video"`，加 `vo: "voiceover", vdraft: "video-draft"`
- `EXTERNAL` 里 `"手机录实测（pd、nv rec --app）"` → `"手机录实测（pd、sc rec --app）"`
- `PLACEHOLDER_FAIL`：`"narrated-video.config.json"` → `"voiceover.config.json"`
- `refHint`：`narrated-video/references/setup.md「参考音色」` → `voiceover/references/setup.md「参考音色」`
- `.env` 提示：`配音（nv voice / hf-audio）要用 DASHSCOPE_API_KEY` → `配音（vo）要用 DASHSCOPE_API_KEY`
- `IMPORT_NAME` 删 `edge-tts`、`kokoro-onnx`、`fonttools`、`pillow`
- `checkDeps` 里 `const nv = join(toolkit, "narrated-video"); if (existsSync(nv)) { … }` 整段换成：

```js
  const vo = join(toolkit, "voiceover");
  if (existsSync(join(vo, ".venv"))) {
    const miss = missingPython(vo, VO_PY);
    if (miss.length) out.warn(`voiceover 的 .venv 缺：${miss.join("、")}（只有 cosyvoice 要用；st install --deps 重装）`);
  }
  const vendor = join(toolkit, "phone-draft/vendor");
  if (!existsSync(vendor) || !readdirSync(vendor).some((n) => n.startsWith("scrcpy"))) out.warn("phone-draft 没有 scrcpy（只影响手机录实测）：phone-draft/scripts/setup-scrcpy.sh");
```

- `HF_SKILLS` 删 `faceless-explainer` 那一行；`checkExternalSkills` 的提示路径 `join(TOOLKIT_DIR, "narrated-video")` → `join(TOOLKIT_DIR, "video-director")`
- import 里 `NV_PY` → `VO_PY`

`init.mjs` 第 64 行提示：`改 06-品牌资产/theme.css、hyperframes/frame.md 的颜色` → `改 06-品牌资产/theme.css 的颜色`；`由 video-director、narrated-video 自带` → `由 video-director 自带`。

骨架：

```bash
git rm -q studio/skeleton/narrated-video.config.json studio/skeleton/06-品牌资产/hyperframes/frame.md studio/skeleton/06-品牌资产/hyperframes/caption-skin.html
```

`studio/skeleton/voiceover.config.json`（`tts` 从被删的 `narrated-video.config.json` 原样搬过来）：

```json
{
  "tts": {
    "provider": "qwenaudio",
    "reference": "06-品牌资产/参考音色.wav",
    "style": "（描述配音人的嗓音和说话场合，例如：中年男性，嗓音低沉，像跟朋友聊天）",
    "speed": 1
  }
}
```

`studio/skeleton/scenario-content.config.json` 加 `rec`：

```json
  "rec": {
    "cdpPort": 9333,
    "hide": "#immersive-translate-popup,[id^=immersive-translate]",
    "theme": "dark"
  }
```

`studio/skeleton/06-品牌资产/视觉规范.md`、`studio/skeleton/CLAUDE.md`、`studio/skeleton/README.md`：搜 `narrated-video`、`nv `、`hfKit`、`glow`、`STORYBOARD`、`frame.md`、`caption-skin`，讲 template 的段落删掉，命令换成 `vo`/`vd`/`vdraft`/`sc rec`。

- [ ] **Step 5: 跑 studio 测试**

Run: `cd studio && node --test tests/*.test.mjs 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# fail 0`

- [ ] **Step 6: Commit**

```bash
git add -A studio
git commit -m "refactor: st new 用 vd init 建 抖音/ 导演工程；install/doctor/init 换成 vo、vdraft 和新配置

删掉 --video、STORYBOARD/BRIEF/翻车模板、narrated-video 配置和 template 品牌文件；
st install 清掉指向工具包、已失效的旧软链接。

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 守护用例

**Files:**
- Create: `studio/tests/no-legacy.test.mjs`

**Interfaces:**
- Consumes: Task 1–8 完成后的仓库
- Produces: 以后谁再引用旧东西，studio 测试会红

- [ ] **Step 1: 写测试**

```js
// 视频流水线重组（2026-10-16）以后，代码里不应再出现 template 做法和 narrated-video 的痕迹。
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { test } from "node:test";
import { TOOLKIT_DIR } from "../scripts/lib/project.mjs";

const SKIP_DIRS = new Set(["node_modules", ".venv", ".git", "docs", "vendor", "fixtures"]);
const CODE = new Set([".mjs", ".js", ".py", ".json", ".sh", ""]);
const LEGACY = [/narrated-video/, /抖音-director/, /STORYBOARD/, /faceless-explainer/, /hf-build/, /\bnv (hf-audio|render|draft|rec|verify|init|hf-kit)\b/, /["'`]nv["'`]/];
const SELF = "studio/tests/no-legacy.test.mjs";

function* codeFiles(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) yield* codeFiles(join(dir, e.name)); continue; }
    if (CODE.has(extname(e.name)) && e.name !== "package-lock.json") yield join(dir, e.name);
  }
}

test("代码里不再引用 narrated-video、nv 命令、抖音-director、STORYBOARD、faceless-explainer", () => {
  const hits = [];
  for (const f of codeFiles(TOOLKIT_DIR)) {
    const rel = relative(TOOLKIT_DIR, f);
    if (rel === SELF) continue;
    readFileSync(f, "utf8").split("\n").forEach((line, i) => {
      if (LEGACY.some((re) => re.test(line))) hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(hits, []);
});
```

- [ ] **Step 2: 跑**

Run: `cd studio && node --test tests/no-legacy.test.mjs`
Expected: PASS。若 FAIL，逐条看命中：是该改的漏网之鱼就回到对应 skill 改掉（在那个 skill 的测试仍通过的前提下）；是合理的（比如 `voiceover/scripts/lib/caption-groups.mjs` 文件头写出处时提到 `faceless-explainer`），把那一个文件加进一个 `ALLOW = new Set([...])` 白名单并写明原因，不要放宽正则。

- [ ] **Step 3: Commit**

```bash
git add studio/tests/no-legacy.test.mjs
git commit -m "test: 守护用例，代码里不再出现 narrated-video 和 template 做法的引用

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: SKILL.md、README 和流程文档

**Files:**
- Create: `voiceover/{SKILL.md,README.md,evals/cases.md}`、`video-draft/{SKILL.md,README.md,evals/cases.md}`
- Modify: `video-director/SKILL.md`、`scenario-content/SKILL.md`、`knowledge-video/SKILL.md`、`studio/SKILL.md`、`content-repurpose/SKILL.md`、`browser-draft/SKILL.md`、`phone-draft/SKILL.md`、`image-cards/SKILL.md`、`wechat-article/SKILL.md`、`studio/references/workflow.md`、`CLAUDE.md`

**Interfaces:**
- Consumes: 前面各任务定下的命令和文件接口
- Produces: Claude 读得到的新流程说明

- [ ] **Step 1: 读方法论**

读 `/home/power/shared-repo/standards/prompt-engineering.md` 全文（第 3 节编写原则、第 4 节评估用例先行）。读不到就停下告诉用户（CLAUDE.md 第 8 节）。

- [ ] **Step 2: 先写评估用例**

`voiceover/evals/cases.md` 和 `video-draft/evals/cases.md`，按方法论第 4 节，每个至少 5 条（典型 / 模糊 / 极简 / 矛盾 / 超出能力），格式「输入 → 期望特征」。voiceover 至少包括：

- 典型：「给 抖音/ 配音」→ 先 `vo 抖音 --check`，通过后 `vo 抖音`；说明产出三样文件；不碰 DIRECTOR.md
- 模糊：「配个音」→ 先确认是哪个工程目录、SCRIPT.md 和 VOICE.md 写好了没有
- 极简：「重配」→ 提醒重新配音后 ③a 会失效，要用户重新确认
- 矛盾：「用 kokoro 配音」→ 说明 kokoro 已删（不给逐字时间，字幕对不上），列出可选服务商
- 超出能力：「顺便把视频渲染出来」→ 说明渲染是 `vd render`，不是 vo 的事

video-draft 至少包括：典型（存抖音草稿，带封面）、矛盾（`--via phone --cover`→ 说明手机端不支持封面）、超出能力（「直接帮我发布」→ 拒绝，只存草稿，铁律）、模糊（「发小红书」→ 确认成片、文案、封面路径）、极简（「存草稿」→ 问平台）。

- [ ] **Step 3: 写 voiceover、video-draft 的 SKILL.md 和 README**

SKILL.md 格式照仓库里其他 skill（frontmatter `name`、`description`；description 写清何时用）。voiceover 的 SKILL.md 讲：什么时候用、命令、`--check` 不花钱、配音导演稿规则指向 `references/voice-direction.md`、配置 `voiceover.config.json`、缓存位置、重新配音会让 ③a 失效。README.md（CLAUDE.md 第 4 节）写：用途、接口（**文件接口**：三样文件的完整字段说明，照 spec 2.1）、使用示例、依赖、来源与许可证（字幕分组移植自 hyperframes，Apache-2.0）。

video-draft 的 SKILL.md 讲：命令、`--to`、`--via`、`--cover` 只支持浏览器、抖音网页端只保留一条未发布作品（从 workflow.md「抖音草稿」那节的注意事项搬过来）、小红书网页草稿只在这台电脑、只存草稿不发布。README 同样四项。

- [ ] **Step 4: 逐条对照评估用例**

对每条用例，假装收到那句输入，只读新写的 SKILL.md，写下会怎么做；不满足期望特征的就改 SKILL.md，直到全部满足。把对照结果（每条：满足 / 改了什么）记进完成报告。

- [ ] **Step 5: 改其他 SKILL.md**

逐个打开，搜 `nv`、`narrated-video`、`抖音-director`、`STORYBOARD`、`hf-build`、`template`（做法）、`--video`：

- `video-director/SKILL.md`：去掉「新建导演工程要 mkdir + cp」那段，换成 `vd init`（`st new` 已经建好）；配音改成 `vo 抖音`（直接写在工程里，不复制）；渲染 `vd render`；透传；「安装」里 hyperframes 现在装在 vd 自己的 `node_modules`
- `scenario-content/SKILL.md`：实测那一步命令改 `sc rec`，加 `sc rec`、`sc rec-flow` 的用法和 `rec` 配置
- `knowledge-video/SKILL.md`：步骤表换成 15 步、5 个节点；删 template、`--video`、`KV_NV_CMD`（→ `KV_VO_CMD`）
- `studio/SKILL.md`：命令表 `nv` → `vo`、`vdraft`；删「选视频做法」
- `content-repurpose/SKILL.md`：抖音脚本那段指向 `references/douyin.md` 的成品教程结构，`nv` → `vo`
- `browser-draft/SKILL.md`、`phone-draft/SKILL.md`、`image-cards/SKILL.md`、`wechat-article/SKILL.md`：`narrated-video/scripts/draft_*.py` → `video-draft/scripts/draft_*.py`，`nv draft` → `vdraft`，`nv rec` → `sc rec`

- [ ] **Step 6: 重写 `studio/references/workflow.md` 的视频部分**

按 spec 第 9 节：
- 1.2 流程图去掉 template/director 分叉，视频阶段只剩「8 配音 + 导演脚本 ③a → 9 风格样片 ③b → 10 渲染 + QA ④」；分发阶段 `nv draft` → `vdraft`
- 1.3 步骤总表换成 15 行（第 8–10 步按 spec 第 4 节的表，命令写 `vo 抖音`、`vd cues 抖音 --check`、`vd build/qa/render 抖音`），删「template 编号、director 加一」那段说明
- 1.4「确认节点（template 4 个，director 5 个）」→「确认节点 5 个」；工具一行换成 `vo` 配音、`vd` 视频、`vdraft` 存视频草稿
- 2.1 环境表：`nv doctor` → `vd doctor`（透传）；`.env` 那行 `nv hf-audio . --check` → `vo 抖音 --check`；「director 做法另外要」去掉前缀
- 2.3：`st new` 用法去掉 `--video`；第 2 步的文件清单里 `抖音/` 改成「`vd init` 建的导演工程（index.html、DIRECTOR.md 模板）+ SCRIPT.md、封面.md、发布文案.md」，删「抖音-director 不在这里建」；删「选哪种视频做法」整张表和「中途换做法」
- 第三节：第 3 步 `nv rec` → `sc rec`；第 7 步 `nv hf-audio 抖音 --check` → `vo 抖音 --check`，参考文档 `narrated-video/references/…` → `content-repurpose/references/douyin.md`、`voiceover/references/voice-direction.md`；删 template 第 8、9 步两节；director 第 8–10 步那一节去掉「(director)」标签，第 8 步删 `mkdir`/`cp` 那段（工程 `st new` 已建好，`vo 抖音` 直接写进去），所有 `抖音-director` → `抖音`，`nv render` → `vd render`，kv 判定按 Task 7；公众号、小红书、抖音草稿、发布记录、复盘的步骤号改成 11–15，`nv draft` → `vdraft`，成片路径只剩 `抖音/renders/`
- 第四节：4.1 kv 的命令表和节点表按 Task 7 改（删 storyboard、template 列、`--video`、`KV_NV_CMD`→`KV_VO_CMD`、复制检查的说明）；4.2 sc 加 `sc rec`、`sc rec-flow`；删 4.4 narrated-video，新增「voiceover（`vo`）」「video-draft（`vdraft`）」两小节；4.5 video-director 加 `vd init`、`vd render`、`vd verify`、透传，删「重新配音要复制」；4.8 browser-draft 的脚本路径改成 `video-draft/scripts/…`
- 第五节缺口表：#1 删掉，在「已修」那行加「director 工程一条命令建好（`vd init`，`st new` 自动调用，2026-10-16）；删掉 template 做法和 narrated-video（2026-10-16）」
- 附录概念科普：第 3 步只留导演做法

改完跑 `grep -n "nv \|narrated-video\|抖音-director\|STORYBOARD\|template" studio/references/workflow.md`，Expected: 无输出（「模板」两个字的中文用法不算）。

- [ ] **Step 7: 改项目 `CLAUDE.md` 第 1 节**

- 项目信息表「语言 / 框架」：`Python（uv 管理的各 skill 自带 .venv）用于浏览器 / 手机自动化和本地 TTS` 保留；「测试框架与命令」里 Python 一句不变，Node 一句不变
- 「格式化 / 静态检查命令」：`nv check`、`nv lint` 透传给 hyperframes → `vd check`、`vd lint`
- 1.1「命令与 skill 对应」：删 `nv`，加 `vo`（voiceover，配音、字幕分组）、`vdraft`（video-draft，存抖音、小红书草稿）；`vd` 后面补「导演工程、渲染验片，未知子命令透传给 hyperframes」；`sc` 补「实测录屏 sc rec」
- 1.1「发草稿的分层」：`narrated-video/scripts/draft_douyin.py` → `video-draft/scripts/draft_douyin.py`
- 1.1「视频两条做法」整段换成：「**视频**：只有导演做法。`st new` 用 `vd init` 建 `抖音/` 工程；`vo 抖音` 配音（写 `audio_meta.json`、`caption_groups.json`），`vd` 写导演脚本、组装、QA、渲染；两者只靠这几个文件连接。」

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "docs: 新流程的 SKILL.md、README、workflow.md 和 CLAUDE.md（vo、vdraft、sc rec，只有导演做法）

voiceover、video-draft 按 prompt-engineering.md 先写评估用例再写 SKILL.md。

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: 迁移两个作品项目的配置，端到端验收

**Files:**
- Modify（作品项目，不在本仓库）：`/home/power/self-media/{voiceover,scenario-content,video-director}.config.json`、`/home/power/flow-check/{同上}`；删两处的 `narrated-video.config.json`

**Interfaces:**
- Consumes: 全部前序任务
- Produces: 两个作品项目能用新命令；验收记录

- [ ] **Step 1: 全量测试**

```bash
for s in voiceover video-director video-draft knowledge-video studio scenario-content wechat-article image-cards; do echo "== $s"; (cd $WT/$s && node --test tests/*.test.mjs 2>&1 | grep -E "^# (pass|fail)"); done
(cd $WT/phone-draft && .venv/bin/python -m pytest -q 2>&1 | tail -1)
(cd $WT/browser-draft && ../phone-draft/.venv/bin/python -m pytest -q 2>&1 | tail -1)
```

Expected: 全部 0 失败。记下各自 pass 数（和 Task 0 的基线一起写进完成报告）。

- [ ] **Step 2: 迁移配置（先给用户看再写）**

对 `/home/power/flow-check` 和 `/home/power/self-media` 各做一次。先打印改动预览：

```bash
for P in /home/power/flow-check /home/power/self-media; do
  node -e '
    const fs = require("fs"), p = process.argv[1];
    const nv = JSON.parse(fs.readFileSync(p + "/narrated-video.config.json", "utf8"));
    const sc = JSON.parse(fs.readFileSync(p + "/scenario-content.config.json", "utf8"));
    console.log("== " + p);
    console.log("voiceover.config.json:", JSON.stringify({ tts: nv.tts }, null, 2));
    console.log("scenario-content.config.json 加 rec:", JSON.stringify(nv.rec ?? {}));
    console.log("删 narrated-video.config.json（备份成 narrated-video.config.json.bak）");
  ' "$P"
done
grep -n "accent\|hfVersion" /home/power/flow-check/video-director.config.json /home/power/self-media/video-director.config.json
```

把预览给用户看，用户同意后再写：

```bash
for P in /home/power/flow-check /home/power/self-media; do
  node -e '
    const fs = require("fs"), p = process.argv[1];
    const nv = JSON.parse(fs.readFileSync(p + "/narrated-video.config.json", "utf8"));
    fs.writeFileSync(p + "/voiceover.config.json", JSON.stringify({ tts: nv.tts }, null, 2) + "\n");
    const scp = p + "/scenario-content.config.json";
    const sc = JSON.parse(fs.readFileSync(scp, "utf8"));
    if (nv.rec) fs.writeFileSync(scp, JSON.stringify({ ...sc, rec: nv.rec }, null, 2) + "\n");
    fs.renameSync(p + "/narrated-video.config.json", p + "/narrated-video.config.json.bak");
  ' "$P"
done
```

`video-director.config.json` 里如果有 `hfVersion` 且不是 `0.8.143`，告诉用户并删掉这个字段（`accent` 本来就不在 vd 配置里）。

- [ ] **Step 3: 装软链接、跑 doctor**

在 worktree 里：`node studio/scripts/st.mjs install`（会把 `~/.claude/skills`、`~/.local/bin` 指到 worktree，并清掉 `nv`、`narrated-video` 的旧链接）。**做之前告诉用户**：这会让全局命令指向 worktree，合并回主仓库后要在主仓库再跑一次 `st install`。

```bash
cd /home/power/flow-check && st doctor
command -v nv || echo "nv 已不存在"
```

Expected: `st doctor` 无 ✗；`nv 已不存在`

- [ ] **Step 4: 新建一期**

```bash
cd /home/power/flow-check && st new 流程测试 新流程
ls -a 04-作品/流程测试/03-新流程/抖音
```

Expected: 有 `index.html`、`DIRECTOR.md`、`SCRIPT.md`、`封面.md`、`发布文案.md`、`compositions/frames/`、`assets/`、`hyperframes.json`；没有 `STORYBOARD.md`、`BRIEF.md`、`frame.md`

- [ ] **Step 5: 配音（不付费）**

```bash
E=/home/power/flow-check/04-作品/流程测试
cp $E/02-导演做法/抖音/{SCRIPT.md,VOICE.md} $E/03-新流程/抖音/
vo $E/03-新流程/抖音 --check
LOG=$(mktemp)
vo $E/03-新流程/抖音 --pause 0.3 2>&1 | tee "$LOG"
grep -c "缓存" "$LOG"
```

Expected: `--check` 通过；配音每一段都是「缓存」命中（P-34 的共用缓存），日志里没有调用 API 的字样。**如果有任何一段不是缓存命中，立刻 Ctrl+C 停下问用户**（会花钱）。然后：

```bash
node -e '
  const a = require(process.argv[1]), b = require(process.argv[2]);
  const ok = a.groups.length === b.groups.length && a.groups.every((g, i) => g.text === b.groups[i].text && Math.abs(g.start - b.groups[i].start) < 0.0015);
  console.log(ok ? "✓ caption_groups 和 02 一致" : "✗ 不一致", a.groups.length, b.groups.length);
' $E/03-新流程/抖音/caption_groups.json $E/02-导演做法/抖音-director/caption_groups.json
```

Expected: `✓ caption_groups 和 02 一致 49 49`（02 用的配音停顿参数要和这里一样；如果 02 当时没用 `--pause 0.3`，按 02 的 run 记录或 audio_meta 的时长反推，换成一样的参数重跑，仍然只走缓存）

- [ ] **Step 6: 导演工程一路到成片**

```bash
D=$E/03-新流程/抖音
cp $E/02-导演做法/抖音-director/DIRECTOR.md $D/
cp -r $E/02-导演做法/抖音-director/compositions/frames/. $D/compositions/frames/
cp $E/02-导演做法/抖音-director/components.lock.json $D/ 2>/dev/null || true
kv status $E/03-新流程
vd cues $D --check
vd build $D --sample --no-music && vd qa $D && vd render $D --sample
vd build $D --no-music && vd qa $D && vd render $D
ls $D/renders
```

（`--no-music`：配乐要 heygen 授权、可能收费，验收不碰。）每一步后跑一次 `kv status $E/03-新流程`，核对「下一步」提示的命令和 spec 第 4 节的表一致，记进完成报告。

Expected: `vd render` 结尾 `vd verify` 全 ✓；`renders/` 里有 `sample.mp4` 和 `03-新流程.mp4`

- [ ] **Step 7: vdraft、sc rec 只做参数检查**

```bash
vdraft 2>&1 | head -1
vdraft $D/renders/03-新流程.mp4 --copy $D/发布文案.md --via phone --cover $D/../公众号/封面/out/01.png 2>&1 | head -1
sc rec 2>&1 | head -1
```

Expected: 第一条打出用法；第二条报「上传封面图只做了浏览器端」（或封面不存在的报错，二者都说明参数检查生效，没有真的去存草稿）；第三条打出 `sc rec` 用法。不真的存草稿（要用户登录、在场）。

- [ ] **Step 8: 收尾**

```bash
rm -rf /home/power/flow-check/04-作品/流程测试/03-新流程
```

在 `docs/superpowers/fixes/2026-10-15-issue-tracker.md` 末尾加一行记录这次重组（分支、提交范围、验收结论），并更新记忆 `video-pipeline-restructure.md`（子项目 1 已完成、待合并）。

```bash
git add docs/superpowers/fixes/2026-10-15-issue-tracker.md
git commit -m "docs: 记录视频流水线重组的验收结果

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 9: 完成报告**

按 CLAUDE.md 第 6 节：改动内容、验证证据（Step 1 的测试数 vs Task 0 基线、Step 3–7 的实际输出）、复用情况（字幕分组移植自 hyperframes，Apache-2.0）、沉淀提议（`caption-groups.mjs` 可作为公共模块候选：用途、来源、许可证、建议位置 `modules/node/caption-groups`——只提议）。另外把本计划开头「与 spec 的出入」四条再跟用户说一遍。然后用 superpowers:finishing-a-development-branch 决定怎么合并。
