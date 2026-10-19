# 镜头库 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 vd 能用 `dy-shot-*` 镜头（含叠加、平移转场、镜头自带音效拍点、缺镜头台账），并按独立评审磨出 4 个核心镜头，用它们重做第 1 期验证方向。

**Architecture:** 镜头是 dykit 组件库（`~/hyperframes`，GitHub `18826400652/hyperframes`）里 `kind: "shot"` 的 `dy-shot-*` 组件，沿用现有 registry / catalog / `vd build` 安装和换色流程。vd 侧新增：DIRECTOR 机器块的 `shot` / `overlays` / `transition` / `custom`，相邻段重叠 0.6 秒的平移转场，镜头 sfx 拍点并入顶层混音，读本地组件库的开关，候选台账。评审是一份改编自 mg-styles-15 `rubric.md` 的提示词 + 一个出评审素材包的命令，由独立 subagent 执行。

**Tech Stack:** Node.js 22 ESM（`node:test`）、HyperFrames 0.8.x + GSAP、ffmpeg、puppeteer-core（vd 已有）。

**Spec:** `docs/superpowers/specs/2026-10-19-shot-library-design.md`

**范围：** spec 第 8 节的第 0、1、2 阶段。第 2 阶段是检查点（spec 6.4 的门槛），过了才另写第 3、4 阶段（其余 8 个镜头、第 2 期）的计划。

## Global Constraints

- 镜头 id：`dy-shot-<名字>`，catalog `kind: "shot"`；第 1 阶段只做 `dy-shot-transform`、`dy-shot-proof`、`dy-shot-rec`、`dy-shot-stamp`，平移转场由 `enter` / `exit` 变量 + vd 的段重叠实现，不做成单独组件。
- 版面：内容区 x 60–1020、y 230–1150；字幕带 y 1180–1440；顶部 200、右侧 160（y 760 往下）、底部 480 是平台界面；栏目标签全片在左上，不能压。
- 字体只用 Noto Sans SC / Noto Serif SC / JetBrains Mono；大字用 Noto Sans SC 900。字阶：首帧 ≥96px、正文 ≥40px、大数字 ≥200px、最大/主体 ≥1.6；推近后要读的字 ≥37px。
- 颜色只来自 `palette`（bg / ink / muted / accent / alert）；荧光黄（accent）= 重点，红（alert）= 错的。镜头里不写死色值。
- 每一帧是时间的纯函数；单条暂停 GSAP 时间线；`immediateRender: false`；初态用 `gsap.set`。
- 动效：入场 `power3.out` 0.45–0.6s，退场比入场快；重拍 `back.out(1.4)`；镜头移动 `power2.inOut` 0.8–1.2s。
- 转场重叠默认 0.6 秒（相邻两段各延长 0.3 秒）；口播、字幕时间不变。
- 一期 `custom` 段 ≤1；`dy-shot-punch` 全片 >3 报 ⚠（第 1 阶段还没有这个镜头，计数逻辑照写）。
- 评审过线：9 个维度每项 ≥7.5、平均 ≥8，三组内容取最低；每个镜头最多 3 轮。整片：8 维 + 节奏，评 2 次取平均，比对照高 ≥0.8 且没有维度变低。
- 借用 mg-styles-15（MIT）的文件开头注明出处：`改编自 https://github.com/Vincentwei1021/mg-styles-15 rubric.md（MIT）`。
- 改 `shared/` 里的东西只改正本再 `st sync-shared`（本计划预计不碰 shared/）。
- 全量验证：self-media-skills 跑 `st test`；hyperframes 跑 `npm test`。

## Review Focus

1. **真实中文内容比 fixture 长**（如 40 字的回答行）→ 期望：镜头按变量声明的 `maxChars` 截断前先报 ⚠ 告诉导演删字，不是悄悄缩成 20px 小字。测试加在 Task 2（`vd build` 的 maxChars 检查）和每个镜头 Task 的 `long` 变体。
2. **很短的段（<1.2 秒）夹在两段之间** → 期望：这条交界不做重叠转场（硬切），不出现一段只剩 0.6 秒的画面被两边吃掉。测试在 Task 3。
3. **overlay 的 `@词` 落在段外** → 期望：`vd cues --check` 直接报错并指出段的时间范围。测试在 Task 2。
4. **本地组件库开关指向的目录不对**（没有 `registry/registry.json`）→ 期望：报错说清路径，不回退到 GitHub 下载、不改锁文件。测试在 Task 1。
5. **台账文件被手改坏（不是合法 JSON）** → 期望：`vd check` 报错说清文件路径，不覆盖原文件。测试在 Task 6。

---

## 第 0 阶段：管线

### Task 1: vd build 读本地组件库

**Files:**
- Modify: `video-director/scripts/lib/components.mjs`、`video-director/scripts/vd.mjs:36-60`（`installAll`）、`video-director/scripts/lib/config.mjs`
- Test: `video-director/tests/components.test.mjs`、`video-director/tests/vd.test.mjs`

**Interfaces:**
- Produces: `localArchive(dir: string): string`（校验并返回本地组件库根目录）；环境变量 `VD_DYKIT_DIR` 优先于配置 `video-director.config.json` 的 `dykitDir`。设置后 `installAll` 不调 `ensureLock` / `fetchArchive`、不写 `components.lock.json`，打印 `◇ 组件来自本地 <路径>（不锁版本，只用于磨组件）`。

- [ ] **Step 1: 写失败测试** `localArchive returns dir with registry`、`localArchive throws when registry missing`（断言错误信息包含路径和 `registry/registry.json`）、`installAll with VD_DYKIT_DIR skips lock and fetch`（注入的 `ensureLock`、`fetchArchive`、`writeLock` 都没被调用）。
- [ ] **Step 2:** `cd video-director && node --test tests/components.test.mjs tests/vd.test.mjs`，确认新用例 FAIL。
- [ ] **Step 3:** 实现 `localArchive`；`installAll` 开头判断开关；`config.mjs` 认 `dykitDir`（相对项目根解析）。
- [ ] **Step 4:** 重跑，PASS。
- [ ] **Step 5:** `video-director/SKILL.md` 命令表 `vd build` 一行补"`VD_DYKIT_DIR=<本地 hyperframes>` 时用本地组件库、不锁版本"。
- [ ] **Step 6: Commit** `feat(video-director): vd build 可读本地组件库（VD_DYKIT_DIR）`

### Task 2: DIRECTOR 机器块认 shot / overlays / custom

**Files:**
- Modify: `video-director/scripts/lib/director.mjs`（`checkVd`、`validateDirector`）、`video-director/scripts/lib/cues.mjs`（`segmentTimes`、`withVarCues`）、`video-director/scripts/vd.mjs`（`installAll` 收集要装的组件）、`video-director/scripts/lib/components.mjs`（maxChars 检查）、`video-director/templates/DIRECTOR.md`
- Test: `video-director/tests/director.test.mjs`、`video-director/tests/cues.test.mjs`、`video-director/tests/vd.test.mjs`

**Interfaces:**
- 机器块段字段（spec 5.1、5.3、5.3a）：
  - `"shot": "dy-shot-…"` + `"vars": {…}`；或 `"shot": "custom"` + `"reason"`（必填）+ `"need"`（必填，一句话）+ `"candidate"`（必填，建议的 `dy-shot-` 名或台账里已有的名）；旧的 `"component"` 照常认；`shot` 和 `component` 不能同时写。
  - `"overlays": [{ "shot": "dy-shot-…", "at": "@词", "vars": {…} }]`
  - `"transition": "auto" | "none" | "pan-left" | "pan-right" | "pan-up" | "pan-down"`，缺省 `"auto"`。
- Produces（`buildCues` 返回的 `segments[]`）：`{ id, start, duration, component?: string, vars?, custom?: { reason, need, candidate }, overlays: [{ component, start, duration, vars }], transition }`。`shot: "dy-shot-x"` 归一成 `component: "dy-shot-x"`；overlay 的 `start` 是全片秒数，`duration` = 段尾 − start。
- Produces: `textProblems({ segId, vars, catalogEntry }): string[]`：变量值去掉 HTML 后的字数超过 catalog 变量的 `maxChars`，返回 `"<段> 的 <变量> 有 N 字，这个镜头最多 M 字：删字或拆段"`。
- Produces: `customCount(segments): number`。

- [ ] **Step 1: 写失败测试**
  - director：`custom without reason/need/candidate is an error`；`shot and component together is an error`；`overlay at must be @词`；`transition must be one of …`。
  - cues：`shot normalizes to component`；`overlay start resolves from @词`；`overlay @词 outside segment throws`（断言错误里有段的起止秒数）；`custom keeps reason/need/candidate`。
  - vd：`installAll installs overlay components too`；`textProblems warns when over maxChars`、`textProblems ignores vars without maxChars`。
- [ ] **Step 2:** 跑 `node --test tests/director.test.mjs tests/cues.test.mjs tests/vd.test.mjs`，FAIL。
- [ ] **Step 3:** 实现。overlay 的 `vars.cues`（`|` 隔开的 @词）按 overlay 自己的 start 换算，复用 `withVarCues` 的逻辑。`vd build` 对每个用到的镜头跑 `textProblems`，打 ⚠ 不中断。
- [ ] **Step 4:** PASS。
- [ ] **Step 5:** `templates/DIRECTOR.md` 机器块示例改成 `shot` 写法，加一个 overlay 和一个 custom 的注释示例；第 8 节标题改为「镜头候选」（`parseCandidates` 同时认旧标题「组件候选」）。改了模板跑 `node --test tests/templates.test.mjs`。
- [ ] **Step 6: Commit** `feat(video-director): DIRECTOR 支持 shot、overlays、custom 和 transition`

### Task 3: 相邻段重叠的平移转场

**Files:**
- Create: `video-director/scripts/lib/transitions.mjs`
- Modify: `video-director/scripts/lib/assemble.mjs`（`segmentHosts` 用 `transitionPlan` 的结果；overlay 宿主）、`video-director/scripts/lib/douyin-qa.mjs`（重叠区间内两段互不算遮挡）
- Test: `video-director/tests/transitions.test.mjs`、`video-director/tests/assemble.test.mjs`、`video-director/tests/douyin-qa.test.mjs`

**Interfaces:**
- Produces: `transitionPlan(segments, { overlap = 0.6, minSeg = 1.2 } = {}): Array<{ id, start, duration, enter: string|null, exit: string|null }>`
  - 相邻两段都 ≥ `minSeg` 且前段 `transition` 不是 `"none"` 时：前段 `duration += overlap/2`、`exit` = 方向；后段 `start -= overlap/2`、`duration += overlap/2`、`enter` = 同一方向。
  - `"auto"` 方向按交界序号轮换：`pan-left, pan-up, pan-right, pan-down`。
  - 第一段 `enter: null`、最后一段 `exit: null`；全片第一段不前移（start 不小于 0）。
  - `enter`/`exit` 写进组件宿主的 `vars`（`"enter": "pan-left:0.3"`）；custom 段把同样的值写在宿主属性 `data-vd-enter` / `data-vd-exit`，段模板的脚本读它（Task 7 的 hf-kit 提供 `HF.panInOut`，custom 段手写时调用）。
- overlay 宿主的 track index 用 `30 + i`：在段（2 起）之上、栏目标签（40）和字幕（41）之下。
- douyin-qa：截图时刻落在某个交界的重叠区间里时，跳过这两段之间的遮挡判断。

- [ ] **Step 1: 写失败测试**（transitions.test）：`overlaps adjacent segments by 0.6`（两段 0–5、5–9 → 0–5.3 exit pan-left / 4.7–9 enter pan-left）；`auto directions rotate`；`none keeps hard cut`；`segment shorter than 1.2s gets no overlap on either side`；`first enter and last exit are null`。assemble.test：`segmentHosts writes enter/exit into vars`；`overlay hosts use track 30+`。douyin-qa.test：`no occlusion error inside overlap window`。
- [ ] **Step 2:** FAIL。
- [ ] **Step 3:** 实现。
- [ ] **Step 4:** PASS；`node --test tests/*.test.mjs` 全过（老工程没有 transition 字段，缺省 auto——**例外**：段里没有一个 `shot` 的老 DIRECTOR，`transitionPlan` 不做重叠，保持旧行为；为此加测试 `legacy director without shots keeps hard cuts`）。
- [ ] **Step 5: Commit** `feat(video-director): 相邻段重叠 0.6 秒的平移转场`

### Task 4: 镜头声明的音效拍点并入混音

**Files:**
- Modify: `video-director/scripts/lib/audio.mjs`（`buildAudio` 前合并 sfx 列表）、`video-director/scripts/vd.mjs`（build 时把 catalog 传给音频这一步）
- Test: `video-director/tests/audio.test.mjs`

**Interfaces:**
- catalog 条目新增可选字段（Task 6 在组件库里加）：`"sfx": [{ "beat": 1, "name": "stamp", "volume": 0.6 }]`，`beat` 是 `cues` 的第几拍（从 1 起）；没有 `cues` 变量的镜头用 `"at": 0.4`（相对段首秒数）。
- Produces: `shotSfx(segments, catalog): Array<{ name, t, volume }>`（`t` 是全片秒数；段和 overlay 都算）。
- Produces: `mergeSfx(directorSfx: Array<{name,t,volume}>, shot: Array<…>, window = 0.15)`：同名且时间差 ≤0.15 秒的，保留导演的那条。
- `resolveSfx` 目前吃 `@词`；合并发生在 `@词` 解析成秒之后。

- [ ] **Step 1: 写失败测试** `shotSfx maps beat to absolute time`（段 start 10，cues "1.2|3.4"，beat 2 → 13.4）；`shotSfx uses at when no cues`；`mergeSfx prefers director entry within 0.15s`；`mergeSfx keeps both when names differ`。
- [ ] **Step 2:** FAIL。 **Step 3:** 实现。 **Step 4:** PASS。
- [ ] **Step 5: Commit** `feat(video-director): 镜头的音效拍点并入顶层混音`

### Task 5: vd qa 的镜头检查和推近点检查

**Files:**
- Modify: `video-director/scripts/lib/douyin-qa.mjs`、`video-director/scripts/lib/qa-run.mjs`、`video-director/scripts/lib/inspect-page.mjs`
- Test: `video-director/tests/douyin-qa.test.mjs`、`video-director/tests/qa-run.test.mjs`

**Interfaces:**
- 镜头里推近后要读的元素标 `data-vd-zoom="@词"`（Task 9 的镜头会写）。`vd qa` 在该 @词 + 0.8 秒截图，检查元素包围盒在内容区内、实际渲染字号（computed font-size × 累计 scale）≥37px；不满足报 ✗ `zoom-target`。
- 新 ⚠：`custom-count`（custom 段 >1）、`punch-count`（`dy-shot-punch` 段 + overlay 合计 >3）。
- Consumes: Task 2 的 `segments[].custom`、`overlays`。

- [ ] **Step 1: 写失败测试** `zoom target below 37px is an error`、`zoom target outside content area is an error`、`two custom segments warn`、`four punch overlays warn`。用 tests/fixtures 里现有的假页面写法。
- [ ] **Step 2:** FAIL。 **Step 3:** 实现。 **Step 4:** PASS。
- [ ] **Step 5: Commit** `feat(video-director): vd qa 查推近点字号、custom 和花字数量`

### Task 6: 缺镜头台账

**Files:**
- Create: `video-director/scripts/lib/ledger.mjs`
- Modify: `video-director/scripts/vd.mjs`（`check` 子命令）、`video-director/scripts/lib/config.mjs`、`knowledge-video/scripts/lib/practical-facts.mjs`（`retroStep`）、`knowledge-video/scripts/lib/practical.mjs`（复盘一步的提示文字）
- Test: `video-director/tests/ledger.test.mjs`、`knowledge-video/tests/practical*.test.mjs`（找现有的那个文件加用例）

**Interfaces:**
- 台账路径：项目根 + `video-director.config.json` 的 `shotLedger`，缺省 `00-规划/镜头候选.json`。格式 `{ "version": 1, "items": [{ "name", "need", "status": "once"|"queued"|"done"|"dropped", "episodes": [{ "work": "<作品目录相对项目根>", "segment": "<段 id>" }], "shot"?: "<入库后的镜头 id>" }] }`。
- Produces: `readLedger(path): Ledger`（文件不存在返回空台账；不是合法 JSON 抛错，信息含路径）。
- Produces: `recordCustom(ledger, { work, segment, need, candidate }): Ledger`（不改入参，返回新对象）：
  - `candidate` 在台账里、状态 `once`，且 `episodes` 里还没有这个 work → 加一条 episode，状态改 `queued`；
  - 已有同 work + segment → 不变（重复跑 `vd check` 幂等）；
  - 状态 `done` → 不变，返回值附 `hint: "<name> 已入库为 <shot>，这段可以直接用"`；`dropped` → 不变；
  - 不在台账 → 新增，状态 `once`。
- `vd check` 对每个 custom 段调 `recordCustom` 后写回，并打印每条变化。
- kv：`retroStep` 之外新增事实 `shotQueue: string[]`（台账里 `queued` 且 episodes 含本作品的条目名）；`kv status` 走到复盘这一步时多打一行 `镜头候选该磨了：<名字>（第 2 次出现）。和用户确认后按 video-director 磨镜头流程做；不做就把 status 改成 dropped`。台账不存在时不打。

- [ ] **Step 1: 写失败测试**（ledger.test）：`new candidate becomes once`；`second work with same candidate becomes queued`；`same work+segment twice is idempotent`；`done item returns hint and stays done`；`dropped stays dropped`；`invalid json throws with path and file untouched`（断言文件内容没变）；`recordCustom does not mutate input`。kv：`retro shows queued shots for this work`、`no ledger no line`。
- [ ] **Step 2:** FAIL。 **Step 3:** 实现。 **Step 4:** PASS。
- [ ] **Step 5:** `video-director/SKILL.md` 加一节「缺镜头时」（照 spec 5.3a 六条的要点，三五行）；`director-rules.md` 第 18 条改成"每段必须先选镜头，没有合适的才 custom，并写 reason / need / candidate；写之前先读台账，同一类需求用台账里已有的 name 作 candidate"，第 19 条改成"镜头候选走台账"。
- [ ] **Step 6:** `st test`，全部套件过。
- [ ] **Step 7: Commit** `feat: 缺镜头台账，第二次出现排进磨镜头并在复盘时提醒`

### Task 7: 组件库认 shot（hyperframes 仓库）

**Files（都在 `~/hyperframes`，新开分支 `feat/shot-kind`）:**
- Modify: `scripts/build-catalog.mjs`（`KINDS` 加 `"shot"`；notes 认 `sfx`、`maxChars` 由变量声明带出）、`assets/dykit/hf-kit.js`
- Create: `docs/shots/STYLE.md`
- Test: `tests/catalog.test.mjs`、`tests/hf-kit.test.mjs`

**Interfaces:**
- 变量声明（`data-composition-variables`）每项可带 `maxChars: number`，`readVariables` 原样带进 catalog。
- notes 可写 `sfx`（格式见 Task 4），`build-catalog` 校验：`beat` 是 1..beats.length 的整数，或有 `at` 数字；`name` 非空。
- hf-kit 新增（全部 seek 安全，只往传入的 timeline 上加 tween）：
  - `HF.panInOut(tl, root, { enter, exit, duration })`：解析 `"pan-left:0.3"`，段首从对应方向平移 1080/1920 像素进来、段尾平移出去，带 `filter: blur()` 模拟运动模糊（峰值 12px）。
  - `HF.camera(tl, stage, keys)`：`keys = [{ t, x, y, scale }]`，按 `power2.inOut` 在画布层上推拉平移；`t` 是段内秒。
  - `HF.sticker(el)`：加贴纸样式（白描边 10px + 三层投影，用 CSS 变量，不写死色值）。
  - `HF.leader(svg, from, to, t, tl)`：引线从圆点画到标签。
- `docs/shots/STYLE.md`：spec 4.2 的语法，加上述 helper 的用法各一个例子。

- [ ] **Step 1: 写失败测试**：catalog `shot kind accepted`、`sfx beat out of range is an error`、`maxChars carried into catalog`；hf-kit `panInOut parses direction and duration`、`camera interpolates keys at given t`（用 hf-kit.test 现有的假 gsap 写法）。
- [ ] **Step 2:** `npm test` FAIL。 **Step 3:** 实现。 **Step 4:** PASS。
- [ ] **Step 5: Commit**（hyperframes 仓库）`feat: 新增 shot 类组件，hf-kit 加镜头、贴纸、引线、平移进出`

### Task 8: 评审提示词和评审素材包（先校准）

按公共仓库 `standards/prompt-engineering.md` 第 4 节：先写用例，再写提示词，逐条对照。

**Files:**
- Create: `video-director/references/shot-review.md`（单镜头评审 + 修改两段提示词，改编自 rubric.md，9 维，spec 6.1–6.2）、`video-director/references/film-review.md`（整片评审，spec 6.4）、`video-director/evals/shot-review-cases.md`（校准用例）、`video-director/scripts/lib/review-pack.mjs`
- Modify: `video-director/scripts/vd.mjs`（新子命令 `review-pack`）
- Test: `video-director/tests/review-pack.test.mjs`

**Interfaces:**
- `vd review-pack <成片.mp4> [--every 0.5] [--at 1.2,3.4] [--out <目录>]`：输出 `<目录>/contact.jpg`（按 `--every` 抽帧拼图）、`<目录>/full/<秒>.png`（`--at` 每个时刻原尺寸）、`<目录>/strip-<秒>.jpg`（每个 `--at` 前后 ±0.3 秒、每 0.1 秒一帧的连拍条）、`<目录>/spec.json`（时长、尺寸、fps、响度、真峰值）。缺省 `--out` = 视频旁边的 `review/<视频名>/`。
- Produces: `packPlan({ duration, every, at }): { contactTimes: number[], strips: Array<{ at, times: number[] }> }`（纯函数，测试它；ffmpeg 调用不测）。
- 评审员调用方式：主会话用 Agent 工具开一个 general-purpose subagent，prompt = `shot-review.md` 第一段 + 说明卡 `SHOT.md` 全文 + 三个素材包目录路径；subagent 不给制作过程。

- [ ] **Step 1: 写校准用例** `evals/shot-review-cases.md`，四条（spec 6.3 表格）：输入 = 哪支视频哪一段，期望特征 = 分数区间 + 必须点名的问题（故意做坏的那条要点名"字溢出""压字幕带""首帧空"）。故意做坏的样本：复制 `.dsh/attn-p0/抖音` 到 scratchpad，改 seg-01 让文字溢出、卡片压进 y 1200、首 0.5 秒空，渲染出 `bad.mp4`。
- [ ] **Step 2: 写失败测试** `packPlan every 0.5 over 3s gives 7 times`、`strip covers at±0.3 every 0.1`、`at beyond duration is dropped`。FAIL → 实现 `review-pack.mjs` → PASS。
- [ ] **Step 3:** 写 `shot-review.md`、`film-review.md`。
- [ ] **Step 4: 校准**：对四条用例各开一个独立 subagent 评审（整片用例用 film-review，单段用例先用 `ffmpeg -ss … -t …` 切出那一段）。把分数和点名的问题记进 `evals/shot-review-cases.md` 的「结果」列。
- [ ] **Step 5:** 有不在预期区间的就改提示词，重跑那条；四条全在区间内才算完成。三轮都调不进区间就停下来告诉用户。
- [ ] **Step 6: Commit** `feat(video-director): 镜头评审提示词、vd review-pack 和评审校准`

---

## 第 1 阶段：四个核心镜头

每个镜头一个 Task，都在 hyperframes 的 `feat/shot-kind` 分支上做，按 spec 第 7 节的循环。以下是四个 Task 共用的步骤，各 Task 只写不同的部分。

**共用步骤：**

- [ ] **S1 说明卡**：`docs/shots/<id>/SHOT.md`，照 mg-styles-15 `template.md` 四段：用途、节拍（按 cues 拍写 hook → 主体 → 落点）、标志特征和关键技法（可检验的数值）、变量表（每个文本变量有 `maxChars`；`enter`、`exit`、`cues` 必有）。
- [ ] **S2 三组内容**：`tests/cases/<id>.json` 的 `variants` 写 `short`、`typical`、`long`（`long` 每个文本变量填到 `maxChars`，段时长 15 秒）；素材放 `tests/media/shots/`，取自 `~/self-media/04-作品/AI替我干活/01-AI写周报` 和 `02-AI写会议纪要` 的 `实测/`（截图、录屏、回答原文），只用假数据那部分。
- [ ] **S3 关键帧**：写 `compositions/<id>.html` 的静态版，在 3–4 个关键时刻 `npx hyperframes snapshot` 截图，看图改到每张都能当海报。
- [ ] **S4 动效**：补时间线（用 Task 7 的 `HF.camera` / `HF.sticker` / `HF.leader` / `HF.panInOut`；推近要读的元素标 `data-vd-zoom`）；`catalog/notes.json` 写 kind `shot`、purpose、suitableFor、minDuration、beats、sfx；`npm run build:catalog && npm run build:registry`。
- [ ] **S5 自动检查**：`node tests/run.mjs <id>` 五主题全过；在 `.dsh/attn-p0` 的副本里用这个镜头换掉对应段，`VD_DYKIT_DIR=~/hyperframes vd build . && vd qa .` 0 个 ✗。
- [ ] **S6 渲染三组**：每组渲染一支 mp4，`vd review-pack` 出素材包（`--at` 填各拍时刻）。
- [ ] **S7 独立评审**：按 Task 8 的方式开 subagent，用 `shot-review.md`；结果存 `docs/shots/<id>/review/round-N.md`。
- [ ] **S8 修改**：修全部 critical 和高影响项，至少一条提升惊艳感；改前把上一版 HTML 存 `docs/shots/<id>/review/round-N.html`。回到 S5。过线（三组取最低，9 维每项 ≥7.5、平均 ≥8）或满 3 轮就停。
- [ ] **S9 交给用户**：三组样片路径 + 每轮分数表。满 3 轮未过线的，写明差在哪，由用户决定接受、改设计还是放弃。用户确认后才算完成。
- [ ] **S10 Commit**（hyperframes）`feat: <id> 镜头（评审 <平均分>）`

### Task 9: dy-shot-proof（证据贴纸）

先做它：贴纸、引线、镜头推近这三样 helper 在它身上最先验证，后面三个镜头复用。

- 用途：展示一张真实截图或回答，引线标注 2–4 处，镜头依次推到每处。
- 变量：`src`（图片路径）、`notes`（`标签::x,y,w,h` 用 `|` 隔开，坐标是图片百分比，最多 4 条，每条标签 `maxChars` 10）、`title`（可选，`maxChars` 14）、`cues`（每条标注一拍）、`enter`、`exit`。
- sfx：每拍 `tick`（音量 0.4）。
- 典型内容：第 1 期第 3 轮实测的回答截图，标"本周重点""四块""1800 元"。

### Task 10: dy-shot-rec（录屏推近）

- 用途：录屏铺满内容区（不套手机框），跟着 @词 推近、框选、点击、荧光笔。
- 变量：`src`（录屏）、`cues`（JSON 列表，沿用 `dy-rec-phone` 的 `[{t,dur,type:tap|box|zoom|mark,x,y,w,h,label}]`，`t` 由导演填 `@词` 换算后的段内秒数——vd 已原样透传 JSON 格式的 cues）、`title`（可选）、`enter`、`exit`。
- 录屏比段短时停在最后一帧，并缓慢推近，不留静止（沿用 `recordingProblem` 的提醒）。
- 典型内容：`01-AI写周报/抖音/assets/rec-step2.mp4`。

### Task 11: dy-shot-stamp（AI 答错盖章）

- 用途：AI 回答贴纸，错的那行变红 → 盖章 → 改成"待确认"。
- 变量：`title`（如"DeepSeek · 第 2 遍"）、`lines`（`|` 隔开，最多 5 行，每行 `maxChars` 20）、`wrong`（出错行号，1 起）、`stamp`（`maxChars` 4，缺省"编的"）、`fixed`（改正后的标签，`maxChars` 6）、`cues`（三拍：变红 | 盖章 | 改正）、`enter`、`exit`。
- sfx：第 2 拍 `error`（0.6），第 3 拍 `chime`（0.5）。
- 典型内容：第 1 期 seg-06 的"另两篇数据一般（60 赞）"。
- 这个镜头同时要能当 overlay 用（只盖章那一拍）：变量 `mode: "full" | "stamp-only"`。

### Task 12: dy-shot-transform（原料 → 成品）

最后做：它是钩子，最依赖前三个打磨出来的手感。

- 用途：几张原料贴纸飞进工具，成品贴纸弹出，镜头推到成品的重点行。首帧（t=0）就要有主体和 ≥96px 的大字，不能等 @词 才入场（spec 首帧规则）。
- 变量：`inputs`（原料标签，`|` 隔开，3–6 个，每个 `maxChars` 6）、`tool`（工具名，`maxChars` 10）、`output`（成品图片路径或文字）、`headline`（首帧大字，`maxChars` 10）、`focus`（成品里要推近的那一行，`x,y,w,h`）、`cues`（三拍：飞入 | 成品出现 | 推近）、`exit`（没有 `enter`，它总是第一镜）。
- sfx：第 1 拍 `whoosh-short`（0.5），第 2 拍 `pop`（0.7）。
- 典型内容：五天日报 → DeepSeek → 周报，大字"10 秒出周报"。

### Task 13: 合并组件库，vd 锁到新版本

- [ ] **Step 1:** 四个镜头都经用户确认后，hyperframes `npm test` 全过，提 PR 到 `18826400652/hyperframes` main（PR 描述列四个镜头的评审分）。
- [ ] **Step 2:** 用户合并后，在 vd 侧不设 `VD_DYKIT_DIR`，对一个测试工程 `vd build . --update-components`，确认从 GitHub 装上了 `dy-shot-*`、`components.lock.json` 指向新提交。
- [ ] **Step 3:** `vd components` 输出里镜头排在旧组件前面（`catalogText` 按 kind 排序，`shot` 第一；加测试 `catalogText lists shots first`）。
- [ ] **Step 4: Commit**（self-media-skills）`feat(video-director): vd components 镜头优先`

---

## 第 2 阶段：用核心镜头重做第 1 期（检查点）

### Task 14: 重做第 1 期并整片对比

**Files:**
- Create: `.dsh/shots-ep1/`（从 `.dsh/attn-p0/抖音` 复制，不动原目录）、`docs/superpowers/reports/2026-10-xx-shot-library-checkpoint.md`

- [ ] **Step 1:** 复制工程；配音、SCRIPT、VOICE 不变。DIRECTOR 机器块逐段改成 `shot`：钩子 → `dy-shot-transform`，证据 → `dy-shot-proof`，第二步操作 → `dy-shot-rec`，坑 → `dy-shot-stamp`；没有对应镜头的段用旧 dykit 组件，实在不行一段 custom（≤1）。
- [ ] **Step 2:** `vd cues . --check && vd build . && vd qa .`，0 个 ✗；`vd render .`；`vd measure`：最长静止 ≤4 秒、变化率 ≥12 次/分。
- [ ] **Step 3:** 对新片和 P0 版（`.dsh/attn-p0/抖音/renders/抖音.mp4`）各跑 `vd review-pack`（`--every 1`，`--at` = 每个重拍 @词时刻 + 每段首尾），各开 2 个独立 subagent 用 `film-review.md` 评，共 4 份。
- [ ] **Step 4:** 写报告：两片各维度的平均分、差值、`vd measure` 前后数字、首帧和三个重拍的截图对比；结论按门槛（平均高 ≥0.8 且没有维度变低）写"过"或"不过"。
- [ ] **Step 5:** 把报告和新片交给用户。**过**：问用户是否开始写第 3、4 阶段的计划。**不过**：停下来，和用户一起看报告重新定方向。
- [ ] **Step 6: Commit** `docs: 镜头库检查点报告`
