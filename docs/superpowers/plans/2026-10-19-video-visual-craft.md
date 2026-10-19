# 视频视觉工艺层 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 在 video-director 补上"视觉工艺"层：把"好看"写成可执行的数值，把能机械判断的规则变成 vd qa 的 ⚠ 和指标，让"QA 全绿但成片像 PPT"在流程里被看见。

**Architecture:** 三层。① 文档层：references/visual-craft.md（通用规则 + 项目视觉规范覆盖）+ templates/DIRECTOR.md 的 6 行数字自检 + evals/cases.md。② 采集层：inspect-page.mjs 增 blocks / texts / materials / px，装饰层不再误报栏目标签遮挡。③ 判定层：douyin-qa.mjs 的 checkCraft(frames) 纯函数，全部输出 warn；qa-run.mjs 汇总 craft 指标，vd qa 打印一行"视觉工艺"。材质样式以 CSS 变量 / 工具类进 templates/index.html 的**手写区**（不是会被覆盖的 vd:brand 块）。

**Tech Stack:** Node.js 22+（ESM、node:test）、puppeteer-core（已有）、HyperFrames（已有）、浏览器 Canvas 像素采样（内置，不新增依赖）。

**Spec:** /home/power/test/视频质量审核与改造需求.md。本计划的「审查结论」和「设计决定」是对它的修订；两者冲突时以本计划为准。

---

## 审查结论

**结论：诊断方向对，方案不能照做。**

原文档说对了一半：现有 vd qa 只查"对不对"（安全区、字幕带、栏目标签、@词可见、2 秒不动），不查"好不好"；样片确实偏平、偏小、缺材质、字阶弱、构图雷同。这些判断我用实测复现了（用工程自己的 HyperFrames 打包 + Chrome，在 53 个 vd qa 时刻读 DOM 和截图像素）。

但原文档的**证据有错、规则自相矛盾、两个指标在原样片上永远不会触发、R4 改错了文件位置、R5 和账号的品牌策略相反**。按原文直接实现，会得到"新增 4 条检查、跑完只报 1–2 条、还会误报栏目标签"的结果。下面是逐条证据。

### 必须修正的点（按严重度）

| # | 原文档 | 实测 / 代码 | 为什么要改 |
|---|---|---|---|
| 1 | 字幕 44px，标题/字幕比 1.05 | 06-品牌资产/hyperframes/brand-captions.html 第 14 行是 **58px**；#s01-title 46px → 比值 **0.79** | 结论（标题太小）成立，但证据和阈值要按 58px 重算 |
| 2 | 主体 18.6%，aes-subject 阈值 < 0.18 → warn | 18.63% **不小于** 18%，不会报；C2 却要求它报。实测 9 段最大单块 7.2%–28.1% | 阈值和自己的验收标准直接矛盾 |
| 3 | 主体 = 单个元素 | 60px 内邻近块合并成"簇"后，seg-01 是 **34.6%**；参考 styleframe 的 #phone 单块 520×1024 = **25.7%**，也低于 R1 的 35% | "主体"必须定义成簇；按单块，参考实现自己都不合格 |
| 4 | aes-palette：色相 15° 分桶 > 5 → warn | 实测每帧最多 **3** 个桶 | 原样片上永远不会触发；C2 却指望它报"色相" |
| 5 | aes-density：并集 / 可用区 < 28% → warn | 实测 26.3%–66.8%，只有 1 个结尾镜头低于 28% | 密度高不等于好看，低也不等于 PPT；方向不对 |
| 6 | aes-hierarchy：段内取最大字号 < 56 | seg-06 一半帧是 76px、一半是 42–44px；段内最大 = 76，不报 | 必须按帧看，或用"最大 / 中位"比值 |
| 7 | R4：改 templates/index.html 的 vd:brand 块 | assemble.mjs 第 123 行会把 vd:brand 换成 config.brandDir 里的品牌子画面 | 写在 vd:brand 里的 CSS 会被 vd build 覆盖；变量要放标记外的 style |
| 8 | R4：加整屏纸纹 / 暗角 | inspect-page.mjs 第 86–87 行用 elementsFromPoint + paints 判遮挡，不跳过 data-layout-ignore | 装饰层盖在品牌层上会被报成"栏目标签被挡"✗ |
| 9 | R3.2：aes-hierarchy < 44 设为 error | vd.mjs 第 143 行用 errors.length === 0 写 passed；practical-facts.mjs 第 206 行、status.mjs 第 37/40 行只认 passed | 审美 error 会卡住 kv 第 9/10 步，和"不改 kv"的承诺冲突 |
| 10 | P1-7：dy-rec-phone "无边框、无投影" | dy-rec-phone.html 第 17 行有 border:3px solid、border-radius:56px、box-shadow: var(--hf-surface-shadow)（custom 主题是 0 24px 48px rgba(0,0,0,.14)） | 仍然可以批评它白底、无透视、色温不统一，但证据要改 |
| 11 | 行号：qa-run.mjs "L54 之后"、checkComposition "L63" | 汇总在 **L72–76**；checkComposition 是 **L52–63**；paints 在 **L75** 是 if (kick) 块里的局部函数 | 照着改会找不到位置；paints 要先提到外面才能复用 |
| 12 | 验收 1：st test 全绿（含新增 8 例） | 本机 Node 24 下 st test --strict：studio 1 失败，多个套件"0 通过"（test-all.mjs 只认 TAP 的 # pass，Node 24 输出 spec）；CI 用 Node 22 | 当前命令证明不了"8 例通过"；要先定证据方式 |

### 额外发现（原文档没覆盖）

- **参考实现与 R1 的 35% 冲突**：/home/power/test/styleframe/index.html 的 #phone 是 520×1024 = **25.68%**（单块）；把 phone + 3 张 notes 合成簇才约 **49%**。所以"主体"必须是簇，不能是单块。
- **"饱和锚点 ≥3%"与参考实现和品牌规范都冲突**：按色度（max(r,g,b) - min(r,g,b) > 0.35）测，参考实现只有 **0.26%** 的鲜艳像素；样片是 0%–6.6%。按 HSL 饱和度会把浅黄便利贴（#FBF3C9）误算成高饱和。视觉规范.md 第 20 行还写着"荧光黄只用来点，不大面积铺"。颜色不能做通过/失败项。
- **最有区分度的是字阶和材质，不是颜色**：参考 104px 标题 / 34px 副题 = **3.06**；样片 seg-01 是 46/40（前几帧）到 46/32（后几帧），中位 **1.44**。参考有 3–4 层投影 + 胶带 + 纸纹 + 暗角 + rotate(-4deg)；样片 9 段是 **1 层投影、只有便利贴/标签的 3–6° 小旋转、0 纹理 / 暗角**。
- **最刺眼的问题是空白，不是密度**：seg-06 在 y 735 有一条 **415px** 的竖向空白带；seg-09 290px、seg-03 250px。现有 checkComposition 只看"最低内容 < 770"，看不到中间的空洞。
- **构图雷同可量化**：按主体簇算，9 段里 **8 段**主体中心落在 x 446–554（±5% 宽）；只有 seg-09 偏到 690。这比"9 段雷同"的形容词可测。
- **材质可以确定化**：投影层数、data-vd-material 标记（grain / vignette / tape）、|rotate| 3–8° 都能从 DOM 读，不需要审美模型。
- **品牌规范是唯一数值来源**：06-品牌资产/视觉规范.md 第 36–41 行已写大标题 **110–140**、要点 **64–80**、字幕 **56**；原文档的 96–120 / 44–56 / 40–44 与之冲突三处。工具包只应给默认值。
- **R5（4–5 套主题）与品牌策略相反**：视觉规范.md 第 12 行写"视频、封面、图文卡片统一用纸面配色"，SKILL.md 也说账号只固定三处。应推迟，先做"一期一套、跨期一致"。
- **P1-6（117s、第二钩子在 66s）是叙事节奏问题**，不是画面工艺；应落在 SCRIPT / DIRECTOR 的节奏规则，不要塞进 visual-craft.md。
- **已有工程拿不到模板改动**：templates/index.html 只在 vd init 时复制；第 1 期工程不会自动获得新变量 / 工具类。验收 5 要用旧工程做样片，必须给迁移片段。

### 保留 / 修改 / 删除 / 推迟

| 原编号 | 处理 | 说明 |
|---|---|---|
| R1 | **改写** | 保留 6 层结构；数值改成"通用默认值 + 项目视觉规范覆盖"；删掉 3% 饱和色硬指标；补空白带 / 构图变化 / 材质标记；反例用文字和数值，不塞截图 |
| R2 | **保留并加严** | 自检从 4 行加到 6 行（主体 / 材质 / 字阶 / 空白带 / 色彩锚点 / 构图变化），每行要求写数字；§1 加"材质与光影""视觉规范" |
| R3 | **重做** | 采集 blocks / texts / materials / px；判定改为 7 个 craft check（字阶 / 层级 / 首帧 / 主体簇 / 空白带 / 材质 / 构图变化），全部 warn；色度只做信息 |
| R4 | **改位置** | 变量和工具类放 templates/index.html 的**手写 style**；材质层放 vd:segments 与 vd:brand 之间，带 data-layout-ignore 和 data-vd-material；补旧工程迁移片段 |
| R5 | **推迟** | 与"一套视觉"策略冲突；等 R1–R4 跑一期后再议，且只做账号主题，不做 4–5 套 |

---

## 设计决定

### 度量单位

- **主体簇**：blocks（可见、非文字、绘制块）里，两个框在 x / y 方向间隙都 ≤ **60px** 就连成一簇；取并集包围盒，除以 1080×1920。全屏块（面积 ≥ 90% 画面）不计。
- **字阶**：每个截图里所有可见文字（不含 host-brand-* 里的字幕 / 栏目标签）的 fontSize；max 是最大字号，median 是中位字号；ratio = max / median。
- **空白带**：内容区 x 60–1020、y 230–1150 内，把可见文字和绘制块的 y 区间在 5px 行上打标，找最长连续未覆盖的竖带。
- **材质**：4 个可确定判断的标记，各 1 分：① 主体上有多层投影（box-shadow 里 ≥2 个 rgb/rgba）；② 有 data-vd-material="grain"；③ 有 data-vd-material="vignette"；④ 有 |rotate| 3–8° 的元素或有 data-vd-material="tape"。
- **构图变化**：每段取主体簇中心 x 的中位数；若 ≥70% 的段落在中位数 ±5% 画面宽（54px）内 → 雷同。
- **首帧**：qaTimes 新增一个 t=0.8 的截图（标签"首帧"），用它的最大字号和主体簇判"第一秒有没有落点"。

### 检查项与阈值

| kind | 判定 | 阈值 | 级别 | 样片实测 | 参考 styleframe |
|---|---|---|---|---|---|
| craft-type | 段内每帧最大字号的中位数 | < 64 → warn | warn | 46 / 120 / 64 / 60 / 64 / 60 / 66 / 60 / 48，5 段触发 | 104 |
| craft-hierarchy | 段内每帧 max/median 的中位数 | < 1.6 → warn | warn | 1.29 / 2.40 / 1.45 / 1.30 / 1.68 / 1.52 / 1.22 / 1.43 / 1.0，7 段触发 | 3.06 |
| craft-hook | 首帧最大字号 < 96，或主体簇 < 35% | 任一 → warn | warn | 46px / 约 35%，由字号触发 | 104px / ~49% |
| craft-subject | 段内最大主体簇 | < 30% → warn | warn | 7.2–35.2，7 段触发 | ~49% |
| craft-gap | 内容区最大空白带 | > 250px → warn | warn | seg-06 415、seg-09 290（其余 0–90），2 段触发 | < 140（估） |
| craft-material | 全片材质分 | < 2/4 → warn | warn | 1/4（便利贴/标签有 3–6° 旋转；单层投影、无纹理 / 暗角） | 4/4 |
| craft-variety | 段中心 x 落在 ±5% 宽内的占比 | ≥70% → warn | warn | 8/9 = 89% | 单帧不适用 |

**校准备注（首帧时刻）：** 样片在 0.4 / 0.6 / 0.8 / 1.0 / 1.16 / 1.5 秒实测，最大字号都是 46px；主体簇分别是 35.46 / 34.97 / 35.21 / 34.43 / 34.51 / 34.80%。所以 craft-hook 在这个样片上由**字号**触发，簇正好在 34–35% 边缘。不要为了让 hook 报而把簇阈值调到 36；也不要只靠簇判断首帧。

**全部 warn，不设 error。** 原因见"与 kv 的关系"。craft-type / craft-hierarchy / craft-subject / craft-gap 的 sel 是段 id；craft-hook / craft-material / craft-variety 的 sel 是空串，汇总成一条。

### 颜色：只做信息，不做通过/失败

- 在 craft 指标里记录每帧的 vivid（色度 > 0.35 且 0.15 < L < 0.92）、dark（L < 0.25）、meanL、stdL。
- 不产生 warn。理由：参考实现 vivid = 0.26%，样片 0%–6.6%；用它做通过线会把参考判成不合格。品牌强调色怎么用，由项目视觉规范.md 决定（本项目：荧光黄只用来点）。

### 与品牌规范的关系

- 工具包只给**默认区间**，并明确写"项目根有 视觉规范.md 时以它为准"。
- 不在 visual-craft.md 里写死账号目录、品牌色值或"暖褐 #3A2A14"这类账号专属值；示例用中性描述 + 变量名。
- 本项目实际数值：大标题 110–140、要点 64–80、字幕 56、强调色 #FFD84D 只做小面积。visual-craft.md 的默认值取交集（首帧 ≥96、段内 ≥64、比值 ≥1.6），比品牌下限松一点，避免对其他项目误报。

### 与 kv 的关系

- 所有 craft 检查是 warn，qa-douyin.json 的 passed 语义不变；kv 第 9/10 步不会被卡。
- qa-douyin.json 增加一个顶层 craft 对象（指标 + 检查结果快照）。kv 只读 passed 和 mtime，加字段安全。
- 如果以后要让视觉工艺变成硬门槛，单独加 --craft=error 或项目配置，不在本计划里做。

### 与现有检查的关系

- 不动 checkFrame / checkCues / checkComposition / stillWindows / emptyWindows 的判定和阈值。
- checkComposition 继续管"最低内容 < 770"；craft-gap 管"中间有没有大洞"，两者互补。
- stillWindows 继续管"2 秒不动"；craft 不重复做动效检测。

---

## Global Constraints

- **不新增运行时依赖**：只用 puppeteer-core、HyperFrames、Node 内置模块和浏览器 Canvas。
- **不改 kv / vo / vd build 的时间轴与音频逻辑**；不改 components.lock.json 指向的 dykit 版本。
- **所有新检查都是 warn**；passed 仍只由 level === "error" 决定。
- **旧工程不崩**：没有 blocks / texts / materials / px 的 frames 返回空结果，不抛错。
- **工具包不写死账号**：visual-craft.md 里不出现作品目录名、账号名、品牌专属色值；默认值标注为"默认"。
- **不动用户的工程**：验收在工程副本上跑；不要覆盖 /home/power/self-media/.../qa-douyin.json。
- **中文注释和提示**；不留注释掉的代码、未使用的导入、调试输出。
- **提交信息** <type>: <描述>，中文；每个 Task 单独 commit。
- **测试证据**：本机 Node 24 下 st test 的通过数解析不可信（test-all.mjs 第 51 行只认 # pass）。本计划用 (cd video-director && node --test tests/*.test.mjs) 记录真实通过数；CI（Node 22）再跑 st test --strict。

## Review Focus

1. **旧工程 / 组件段没有新字段**：checkCraft 收到只有 elements 的 frame 时必须返回空数组，不能 map 到 undefined 崩掉。（Task 4 测试）
2. **装饰层误报栏目标签**：整屏 data-layout-ignore 的 grain / vignette 盖在 kicker 上时，kicker.occludedBy 必须仍是 null；不带标记的 #cover 仍然要报。（Task 3 测试）
3. **审美检查偷偷卡 kv**：所有 craft issue 的 level 必须是 warn，passed 必须保持 true。（Task 5 测试）
4. **阈值被测试"迁就"**：样片的实测值（46px、约 35%、415px、1/4、8/9）必须写进测试，不能为了让测试绿而改阈值。（Task 4 / 8 的验收表）
5. **账号数值泄漏进工具包**：visual-craft.md、SKILL.md 里不能出现 06-品牌资产、#F1ECE2、#3A2A14 这类作品专属值；默认值只能是区间。（Task 1 评审）
6. **首帧截图改变既有测试**：qaTimes 加 t=0.8 会改 3 个现有断言；这是行为变化，要同步改测试并在 commit 里说明。（Task 4）

---

## 文件结构

**新建**
- video-director/references/visual-craft.md：画面工艺的 6 层数值规则、自检表、反例库、旧工程迁移片段。
- video-director/evals/cases.md：6 条视觉工艺评估用例（典型 / 模糊 / 极简 / 矛盾 / 超出 / 缺视觉规范）。

**修改**
- video-director/templates/DIRECTOR.md：§1 加两行，§3 加 6 行数字自检。
- video-director/templates/index.html：手写 style 里加材质 / 字阶变量和 3 个工具类；vd:segments 后加材质层。
- video-director/templates/segment.html：注释补 data-vd-material / data-vd-aesthetic-ok。
- video-director/references/director-rules.md：第 3、11a、12 条指向 visual-craft.md；补装饰层标注。
- video-director/SKILL.md：设计文档一行、vd qa 命令行、"每段画面怎么写"。
- video-director/scripts/lib/inspect-page.mjs：blocks / texts / materials / px / shot64；paints 提出来；遮挡跳过 data-layout-ignore。
- video-director/scripts/lib/douyin-qa.mjs：analyzeCraft + checkCraft；qaTimes 加首帧。
- video-director/scripts/lib/qa-run.mjs：截图同时取 base64 / 像素；汇总 craft；返回 craft。
- video-director/scripts/vd.mjs：qa-douyin.json 写 craft；终端打印视觉工艺摘要。
- video-director/tests/douyin-qa.test.mjs、tests/inspect-page.test.mjs、tests/qa-run.test.mjs、tests/templates.test.mjs：新增用例 + 更新首帧断言。
- studio/references/workflow.md：vd qa 一行补视觉工艺。
- knowledge-video/SKILL.md：第 9/10 步加"⚠ 视觉工艺也要看"。

---

## 实施任务

### Task 0: 分支、基线与决策确认

**Files:** 无（只读）

**Interfaces:** 无

- [ ] **Step 1: 建分支**

~~~bash
git worktree add .worktrees/visual-craft -b feat/visual-craft HEAD
cd .worktrees/visual-craft
(cd video-director && npm ci)                      # worktree 里没有 node_modules
export PATH="$PWD/video-director/bin:$PATH"       # 让 vd 用 worktree 里的代码，不是已安装的软链
~~~

如果不用 worktree，至少新开分支：git switch -c feat/visual-craft。

- [ ] **Step 2: 记录基线**

~~~bash
for d in video-director studio; do (cd $d && node --test tests/*.test.mjs 2>&1 | grep -E '^ℹ (tests|pass|fail)'); done
~~~

Expected（本机 2026-10-19 实测）：
- video-director：tests 154 / pass 154 / fail 0
- studio：tests 91 / pass 90 / fail 1（test-all.test.mjs 的 TAP 解析，和本任务无关，记录不修）

- [ ] **Step 3: 和用户确认 3 个决定**（在动手前）

1. 视觉工艺**只 warn**，不改 passed、不卡 kv —— 默认；
2. 数值以作品项目的 06-品牌资产/视觉规范.md 为准，工具包只给默认区间；
3. R5 主题包推迟，本计划不做。

用户没确认就不进入 Task 1。

- [ ] **Step 4: 提交**

只提交分支本身（没有文件改动就不用 commit）。

---

### Task 1: references/visual-craft.md + 评估用例

**Files:**
- Create: video-director/references/visual-craft.md
- Create: video-director/evals/cases.md
- Modify: video-director/SKILL.md 第 13 行（设计文档一行）

**Interfaces:**
- Produces: 文档契约。visual-craft.md 必须包含这些二级标题，后续 Task 2、7 会引用：## 0. 怎么用、## 1. 构图、## 2. 材质、## 3. 色彩、## 4. 字阶、## 5. 动效、## 6. 声音、## 7. 自检表、## 8. 反例库、## 9. 已有工程迁移、## 10. 和导演规则的分工。

- [ ] **Step 1: 先写评估用例（提示词版 TDD）**

按 /home/power/shared-repo/standards/prompt-engineering.md 第 4 节，video-director/evals/cases.md 写 6 条，格式：情境 + 输入 → 期望特征（不比对原文）：

| # | 类型 | 输入 | 期望特征（摘要） |
|---|---|---|---|
| 1 | 典型 | 段 1 怎么排？ | 先报主体簇占比（首帧 ≥35%）、首帧最大字号（≥96）、段内 max/median（≥1.6）、材质几件、空白带目标；不给"居中卡片 + 底部字幕" |
| 2 | 模糊 | 这段好看点 | 先指出弱的层（构图/材质/字阶/空白/色彩/动效），给 2–3 个带数值的改法；不擅自新增品牌色 |
| 3 | 极简 | 首帧再大点 | 字号 ≥96px、簇 ≥35%；同时检查安全区和字幕带；不整体等比放大 |
| 4 | 矛盾 | 背景全铺荧光黄 | 指出与视觉规范"荧光黄只用来点"冲突；给"小面积高对比锚点"替代；用户坚持则先改视觉规范 |
| 5 | 超出 | 117s 压到 60s | 说明这是 SCRIPT / DIRECTOR 的节奏问题，不是 visual-craft 六层；指向导演规则，不擅自删段 |
| 6 | 缺规范 | 新项目还没有视觉规范 | 用默认区间并标注"默认值，待品牌确认"；提醒补视觉规范.md；默认下限仍要检查 |

文件末尾留"## 运行记录"（实施后填日期、方法、逐条结果；至少跑 1、3、4、6）。

- [ ] **Step 2: 写 references/visual-craft.md**

按"规则 → 为什么 → 怎么做（数值/CSS）→ 反例"写。必须遵守：

- 数值表给**默认区间**，并加一句"作品项目根有 视觉规范.md 时以它为准"。
- 不出现作品目录名、账号名、品牌专属色值。示例用 var(--vd-*) 和"品牌强调色"。
- 字体表与 director-rules.md 第 12 条不重复：第 12 条只留一句"数值见 visual-craft.md 第 4 节"。
- 颜色一节明确写"不做 3% 饱和色硬指标；强调色面积按品牌规范；暗部优先用品牌已有的深色（如 ink），不新增颜色"。
- 主体一节明确定义"簇"：60px 内邻近的绘制块合并；全屏背景不算。
- 材质一节给可复制的 CSS（三层投影、纸纹 data URI、暗角），并说明"没有 视觉规范.md 时可用默认值"。
- 空白带一节写清内容区 y 230–1150、最大空白带 ≤250px。
- 构图变化一节写"≥70% 的段主体中心在 ±5% 宽内 = 雷同"。
- 反例库用**文字 + 数值**，不引用 /home/power/test 的截图（截图不在仓库，也不属于工具包）。
- 第 9 节"已有工程迁移"给一段可直接粘的 HTML/CSS，和放置位置（vd:segments 与 vd:brand 之间）。

建议结构（按上面的约束补全，不要照抄占位符）：

~~~markdown
## 0. 怎么用
写 DIRECTOR.md 第 3 节前，按顺序定 6 个数：主体簇占画面多少、首帧最大字号、段内 max/median、内容区最大空白带、材质几件、各段中心怎么变。项目有 视觉规范.md 时，先读它；下面的数值只是默认下限。

## 1. 构图
| 规则 | 默认数值 | 为什么 |
|---|---|---|
| 主体按"簇"算 | 关键帧 ≥35%，全片平均 ≥30% | 单块会把手机和旁边的便利贴拆开算小 |
| 不要每段都居中 | ≥30% 的段主体中心偏离画面中心 ≥5%，或有 3–8° 旋转 | 观众 10 秒就知道后面长什么样 |
| 前后景 | 每段至少 2 层（前景压角 / 中景主体 / 后景光晕或纹理） | 没有层次就像贴纸 |
| 空白带 | 内容区（x 60–1020，y 230–1150）最大竖向空白带 ≤250px | 中间空一大块，画面断成两截 |

## 7. 自检表
| 项 | 写什么 |
|---|---|
| 主体 | 是什么、按 60px 邻近算占画面多少、偏离中心多少 |
| 材质 | 投影几层、纹理/暗角/胶带各在哪、至少几件 |
| 字阶 | 首帧最大字号 / 段内最大 / 中位 / 比值 |
| 空白带 | 内容区最大竖向空白带多少像素 |
| 色彩锚点 | 每段的小面积高对比锚点是什么（按视觉规范） |
| 构图变化 | 各段主体中心/大小怎么变 |

## 8. 反例库
- 46px 段标题 + 58px 字幕：max/median 1.44，画面没有落点。
- 单块 18.6%、簇 34.6%：按单块报会误判；按簇才看到真实占比。
- 内容区中间 415px 空白：不是"下方留白"，是画面断成两截。
- 9 段 7 段中心在 490–540：每段都像同一张卡。
- 全片单层投影、只有便利贴的小角度旋转、无纹理 / 暗角：Figma 线框感。
~~~

- [ ] **Step 3: 改 SKILL.md 第 13 行**

把"设计文档：docs/superpowers/specs/2026-10-14-video-director-design.md。导演规则：references/director-rules.md（写脚本、做画面时逐条对照）。"改成：

"设计文档：docs/superpowers/specs/2026-10-14-video-director-design.md。导演规则：references/director-rules.md（叙事、节奏、版面、HyperFrames 的坑）。视觉工艺：references/visual-craft.md（构图、材质、色彩、字阶、动效、声音的数值规则和自检表）。"

- [ ] **Step 4: 自查**

~~~bash
grep -nE '06-品牌资产|#F1ECE2|#3A2A14|AI 替我干活' video-director/references/visual-craft.md
~~~

Expected: 无输出（没有账号专属值）。evals/cases.md 可以用作品名做情境，但不能出现品牌色值 / 目录约定。

- [ ] **Step 5: 提交**

~~~bash
git add video-director/references/visual-craft.md video-director/evals/cases.md video-director/SKILL.md
git commit -m "docs(vd): 新增视觉工艺规则和评估用例；数值以项目视觉规范为准"
~~~

---

### Task 2: templates/DIRECTOR.md 的 6 行数字自检

**Files:**
- Modify: video-director/templates/DIRECTOR.md（§1、§3）
- Test: video-director/tests/templates.test.mjs

**Interfaces:**
- Consumes: Task 1 的 visual-craft.md 章节名。
- Produces: 模板里固定 6 行，行首分别是"视觉工艺 · 主体 / 材质 / 字阶 / 空白带 / 色彩锚点 / 构图变化"，后续 vd check / 人工复核可按行找。

- [ ] **Step 1: 写失败测试**

在 tests/templates.test.mjs 末尾加一个用例，断言：

- md 里包含 6 个行首："视觉工艺 · 主体"、"视觉工艺 · 材质"、"视觉工艺 · 字阶"、"视觉工艺 · 空白带"、"视觉工艺 · 色彩锚点"、"视觉工艺 · 构图变化"；
- 包含 "- **材质与光影**：" 和 "- **视觉规范**："；
- 去掉机器块和（待填）行后，parseDirector(prose).tokens 仍然是 []（说明文字没有混进 @词）。

- [ ] **Step 2: 跑测试确认失败**

~~~bash
cd video-director && node --test tests/templates.test.mjs
~~~

Expected: FAIL，"缺少 视觉工艺 · 主体"。

- [ ] **Step 3: 改模板**

§1 在"字体"后加两行：

~~~markdown
- **材质与光影**（投影几层、纹理 / 暗角 / 光晕 / 胶带分别在哪，至少 2 件）：（待填）
- **视觉规范**（作品项目根的 视觉规范.md 在哪、这期遵循哪几条；没有就写"默认值"）：（待填）
~~~

§3 在现有 6 行后加 6 行：

~~~markdown
| 视觉工艺 · 主体 | 主体是什么、按 60px 邻近算占画面多少（首帧 ≥35%，全片平均 ≥30%）、偏离中心多少 |
| 视觉工艺 · 材质 | 投影几层、纹理 / 暗角 / 胶带各在哪（≥2 件） |
| 视觉工艺 · 字阶 | 首帧最大 / 段内最大 / 中位 / 最大与中位的比值（≥1.6） |
| 视觉工艺 · 空白带 | 内容区（y 230–1150）最大竖向空白带多少像素（≤250） |
| 视觉工艺 · 色彩锚点 | 每段的小面积高对比锚点是什么（按视觉规范，不要求大面积铺色） |
| 视觉工艺 · 构图变化 | 各段主体中心 / 大小怎么变（≥30% 的段不要都居中同大） |
~~~

注意：不要在这些行里写 @词（会被 vd cues 当锚点）；需要举例时用反引号包起来。

- [ ] **Step 4: 跑测试确认通过**

~~~bash
cd video-director && node --test tests/templates.test.mjs
~~~

Expected: PASS（原有 6 个用例 + 新增 1 个）。

- [ ] **Step 5: 提交**

~~~bash
git add video-director/templates/DIRECTOR.md video-director/tests/templates.test.mjs
git commit -m "docs(vd): DIRECTOR.md 增加 6 行视觉工艺数字自检"
~~~

---

### Task 3: 采集层——绘制块、文字样式、材质标记、像素统计、遮挡修正

**Files:**
- Modify: video-director/scripts/lib/inspect-page.mjs
- Test: video-director/tests/inspect-page.test.mjs

**Interfaces:**
- collect() 返回新增字段：
  - blocks: { sel, box, opacity, shadow, rot, bg, bgImage, material }[]（可见、绘制、非 ownText 的元素；全屏块也返回，由判定层过滤）；
  - texts: { sel, box, opacity, fontSize, fontWeight, color, text }[]（可见、有直接文字的元素的字号 / 字重 / 颜色）；
  - materials: string[]（[data-vd-material] 的值，去品牌层）；
  - aestheticOk: string[]（带 data-vd-aesthetic-ok 的段 id：e.id 或最近的 [data-composition-id]）；
  - elements / cueMarks / kicker / sig 保持原样（旧的 checkFrame 不变）。
- openPage() 返回值新增：
  - shot64(): Promise<string>：截一张 PNG，返回 base64（不写文件；由 qa-run 写）；
  - pixels(b64): Promise<{ vivid, dark, meanL, stdL }>：1/4 缩放后统计。
- paints(e) 移到 collect() 顶部（不再是 if (kick) 里的局部函数）。

- [ ] **Step 1: 写失败测试**

在 tests/inspect-page.test.mjs 的假 HTML 里加一个绘制块（#subj 用空 div + background / box-shadow，不要放文字；有直接文字的会进 texts）、一个带 data-vd-material="grain" 的装饰层、一个带 data-vd-aesthetic-ok 的段根。加 3 个用例：

1. "openPage：blocks 带绘制信息；texts 带字号 / 字重 / 颜色；材质标记和段豁免可读"——断言 #subj 在 blocks 里、shadow 含 rgba/rgb、#b 的 text 在 texts 里且有 fontSize、materials 含 "grain"、aestheticOk 含 "seg-01"。
2. "openPage：整屏 data-layout-ignore 装饰不挡栏目标签；不带标记的遮挡照报"——在 brand 前插一层整屏 div[data-layout-ignore]，断言 frame(1.5).kicker.occludedBy === null；原来的 #cover（不带标记）仍然报 #cover。
3. "openPage：shot64 返回 base64，pixels 返回色度 / 暗部比例"——断言 b64.length > 100，px.vivid / dark / meanL 都在 0–100。

- [ ] **Step 2: 跑测试确认失败**

~~~bash
cd video-director && node --test tests/inspect-page.test.mjs
~~~

Expected: FAIL，f.blocks is undefined / page.shot64 is not a function。

- [ ] **Step 3: 实现**

inspect-page.mjs 的 collect()：

1. 把 paints 提到 collect 顶部（它只依赖元素和 getComputedStyle，不依赖 kicker）。
2. 循环里每个可见元素额外读一次 getComputedStyle(e)（已经在 opacityOf / boxOf 里多次调用，浏览器会缓存；实测整体 +0.3%）：
   - shadow: cs.boxShadow
   - rot: rotOf(cs.transform)（matrix(a,b,...) → atan2(b,a) 度）
   - bg: cs.backgroundColor
   - bgImage: cs.backgroundImage !== "none"
   - fontSize / fontWeight / color（只对 text 元素）
3. if (painted && !text) blocks.push(...)；if (text) texts.push(...)；elements 的原有 push 不变（文字不能重复进 blocks，否则会被算进主体）。
4. 循环后：

~~~js
const materials = [...document.querySelectorAll("[data-vd-material]")]
  .filter((e) => !inBrand(e))
  .map((e) => e.getAttribute("data-vd-material"));
const aestheticOk = [...document.querySelectorAll("[data-vd-aesthetic-ok]")]
  .map((e) => e.id || e.closest("[data-composition-id]")?.id)
  .filter(Boolean);
return { elements, blocks, texts, materials, aestheticOk, cueMarks, kicker, sig: sig.join("|") };
~~~

5. 栏目标签遮挡的 find 加装饰判断：

~~~js
const decorative = (e) => !!e.closest("[data-layout-ignore]");
const top = document.elementsFromPoint(x, y).find((e) => kick.contains(e) || (!decorative(e) && paints(e) && opacityOf(e) > 0.05));
~~~

6. openPage 返回值加：

~~~js
shot64: () => page.screenshot({ type: "png", encoding: "base64" }),
pixels: (b64) => page.evaluate(pixels, b64),
~~~

7. 在模块级加 pixels（1/4 缩放；vivid = 色度 > 0.35 的鲜艳像素；dark = 亮度 < 0.25；meanL / stdL 是亮度均值和标准差）：

~~~js
function pixels(b64) {
  return (async () => {
    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = 270; c.height = 480;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0, 270, 480);
    const d = ctx.getImageData(0, 0, 270, 480).data;
    let vivid = 0, dark = 0, n = 0, sum = 0, sum2 = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
      n++;
      if (mx - mn > 0.35 && l > 0.15 && l < 0.92) vivid++;
      if (l < 0.25) dark++;
      sum += l; sum2 += l * l;
    }
    const mean = sum / n;
    const pct = (x) => Math.round((x / n) * 10000) / 100;
    return { vivid: pct(vivid), dark: pct(dark), meanL: Math.round(mean * 10000) / 100, stdL: Math.round(Math.sqrt(sum2 / n - mean * mean) * 10000) / 100 };
  })();
}
~~~

- [ ] **Step 4: 跑测试确认通过**

~~~bash
cd video-director && node --test tests/inspect-page.test.mjs
~~~

Expected: PASS（原有 2 个 + 新增 3 个；没有 Chrome 时新增的 3 个 skip，整个文件不能是 fail）。

- [ ] **Step 5: 提交**

~~~bash
git add video-director/scripts/lib/inspect-page.mjs video-director/tests/inspect-page.test.mjs
git commit -m "feat(vd): vd qa 采集绘制块、文字样式、材质标记和画面色度；装饰层不再误报遮挡"
~~~

---

### Task 4: 判定层——analyzeCraft + checkCraft

**Files:**
- Modify: video-director/scripts/lib/douyin-qa.mjs
- Test: video-director/tests/douyin-qa.test.mjs

**Interfaces:**
- analyzeCraft(frames) → CraftMetrics：

~~~ts
type CraftMetrics = {
  first: { t: number; maxFont: number; cluster: number } | null;
  segments: { id: string; maxFont: number; ratio: number; cluster: number; gap: number; gapAt: number }[];
  material: { shadow: boolean; grain: boolean; vignette: boolean; rotation: boolean; score: number; missing: string[] };
  variety: { total: number; centered: number; centers: number[] };
  color: { t: number; vivid: number; dark: number; meanL: number; stdL: number }[];
};
~~~

- checkCraft(frames) → { level: "warn", kind, sel, t, msg }[]。全部 warn；sel 规则见"设计决定"。
- qaTimes 增加首帧：在 inspect 里插入 { t: 0.8, label: "首帧", seg }（0.8 < duration、落在已构建段、且没有同时刻的 cue 截图时）。

- [ ] **Step 1: 写失败测试**

沿用 el() / frame()，加两个 helper：

~~~js
const box = (o) => ({ sel: "#b", box: [100, 300, 500, 800], opacity: 1, shadow: "none", rot: 0, bg: "rgb(255,255,255)", bgImage: false, ...o });
const txt = (o) => ({ sel: "#t", box: [100, 1400, 900, 1460], opacity: 1, fontSize: 32, fontWeight: 400, color: "rgb(0,0,0)", text: "字", ...o });
const shot = (seg, t, data = {}) => ({ t, seg, label: "@x", data: { blocks: [], texts: [], materials: [], aestheticOk: [], px: null, ...data } });
~~~

新增用例（至少 13 个）：

| # | 用例名 | 断言 |
|---|---|---|
| 1 | checkCraft：首帧 46px / 簇约 34% → craft-hook | kinds 含 craft-hook；且不含 craft-subject（34.4% ≥ 30%） |
| 2 | checkCraft：首帧 104px / 簇 49% → 不报 craft-hook | kinds 不含 craft-hook |
| 3 | checkCraft：两个 60px 内的块合并成簇约 34%，不报 craft-subject；同一组块拉到 400px 外 → 单块约 16%，报 | 前半 kinds 不含 craft-subject；后半含 |
| 4 | checkCraft：全屏 1080×1920 背景块不计入主体 | 只剩背景时不报 craft-subject |
| 5 | checkCraft：段内最大字号 76 但中位 42 → craft-type；max/median 1.31 → craft-hierarchy | 两个 kind 都在（验证不按段内最大值放过） |
| 6 | checkCraft：首帧 104px、max/median 3.06 → 不报 craft-type / craft-hierarchy | 两个 kind 都不在 |
| 7 | checkCraft：内容区空白带 415px → craft-gap；240px 不报 | 415 含，240 不含 |
| 8 | checkCraft：9 段里 7 段中心在 ±5% 宽内 → craft-variety；只有 5 段不报 | 7/9 含，5/9 不含 |
| 9 | checkCraft：材质 0/4 → craft-material；只有 rotate(-4deg) → 1/4 仍报；多层投影 + grain + vignette + rotate(-4deg) → 4/4 不报 | score 和 missing 对得上 |
| 10 | checkCraft：旧工程 frames 只有 elements、没有 blocks/texts → 返回 []，不抛错 | deepEqual [] |
| 11 | checkCraft：data-vd-aesthetic-ok 的段全部豁免 | 该段没有 issue |
| 12 | checkCraft：所有 issue 的 level 都是 warn | every level === "warn" |
| 13 | qaTimes：首帧 0.8 秒排在最前；样片里 0.8 秒没有构建的段就不加 | inspect[0] 是首帧；另一组不含首帧 |

示例 3（簇的定义）：

~~~js
test("checkCraft：60px 内的块合并成簇；拉远后按单块算", () => {
  const near = shot("seg-01", 1.2, {
    blocks: [box({ box: [60, 300, 390, 1140] }), box({ box: [450, 300, 910, 1140] })],
    texts: [txt({ fontSize: 64 })],
  });
  assert.ok(!checkCraft([near]).some((i) => i.kind === "craft-subject"));

  const far = shot("seg-01", 1.2, {
    blocks: [box({ box: [60, 300, 390, 1140] }), box({ box: [900, 300, 1040, 1140] })],
    texts: [txt({ fontSize: 64 })],
  });
  assert.ok(checkCraft([far]).some((i) => i.kind === "craft-subject"));
});
~~~

- [ ] **Step 2: 跑测试确认失败**

~~~bash
cd video-director && node --test tests/douyin-qa.test.mjs
~~~

Expected: FAIL，checkCraft is not a function；qaTimes 的 3 个现有断言也会因为首帧而失败（这是预期的行为变化，Step 4 一起改）。

- [ ] **Step 3: 实现**

在 douyin-qa.mjs 里加常量（和现有 CAPTION 并列）：

~~~js
const CONTENT = { left: 60, right: 1020, top: 230, bottom: 1150 };
const CLUSTER_GAP = 60;
const TYPE_FLOOR = 64;
const TYPE_RATIO = 1.6;
const HOOK_FONT = 96;
const HOOK_CLUSTER = 35;
const SUBJECT_MIN = 30;
const GAP_MAX = 250;
const VARIETY = 70;
~~~

加纯函数：

~~~js
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const area = (b) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
const visible = (x) => (x.opacity ?? 1) > 0.05 && area(x.box) > 0;

function mergeClusters(boxes, gap = CLUSTER_GAP) {
  // union-find：两个框在 x / y 方向的间隙都 ≤ gap 就合并；返回并集包围盒数组
}

function maxCluster(f) {
  const blocks = (f.data.blocks ?? []).filter(visible).filter((b) => area(b.box) < 0.9 * W * H);
  const cs = mergeClusters(blocks).map((b) => ({ box: b, ratio: (area(b) / (W * H)) * 100 }));
  return cs.sort((a, b) => b.ratio - a.ratio)[0] ?? null;
}

function maxGap(f) {
  // 内容区 5px 行打标；返回 { gap, at }
}

export function analyzeCraft(frames) { /* 按设计决定算 CraftMetrics；frames 没有 blocks/texts 时返回空结构 */ }
export function checkCraft(frames) {
  const m = analyzeCraft(frames);
  const out = [];
  const add = (kind, sel, t, msg) => out.push({ level: "warn", kind, sel, t, msg });
  // 首帧 / 每段字阶 / 主体 / 空白带 / 材质 / 构图；消息里带实测数字
  return out;
}
~~~

实现要点：

- 每个段的 t 用该段第一张截图的 t。
- analyzeCraft 的 color 取 frames.map((f) => ({ t: f.t, ...(f.data.px ?? null) })).filter((x) => x.vivid !== undefined)；没有 px 就空数组。
- 材质：
  - shadow = 任意 blocks 的 shadow 里 rgb( / rgba( 出现 ≥2 次；
  - grain = 任意 frame 的 materials 含 "grain"；
  - vignette = 含 "vignette"；
  - rotation = 任意 blocks 的 |rot| 在 3–8，或 materials 含 "tape"；
  - score = 布尔求和；missing = 缺的项的中文名。
- 构图变化：每段取所有帧里最大簇中心 x 的中位数；centered = 落在全片中位 ±0.05W 内的段数；total = 段数。
- 段豁免：allow = new Set(frames.flatMap((f) => f.data.aestheticOk ?? []))；if (allow.has(id)) continue。
- 消息示例（必须带数字）：
  - "seg-06-pit 主体簇最大 12.4%（<30%）：画面没有视觉重心"
  - "seg-06-pit 内容区最大空白带 415px（y 735 起，>250）：中间空一大块"
  - "seg-01-hook 段内最大字号中位 46px（<64）：标题和正文一个量级"
  - "seg-07-recap 字号层级 1.22（最大/中位，<1.6）：画面没有落点"
  - "首帧最大字号 46px（<96）、主体簇 34.6%（<35%）：第一秒没有落点"
  - "全片材质 1/4（多层投影× 纹理× 暗角×）：像线框，不像实景"
  - "9 段里 7 段主体中心在 x 490–540（±5% 宽）：构图雷同"

- [ ] **Step 4: 更新 qaTimes 和现有断言**

qaTimes：在 for (const s of segs) 之后、inspect.sort 之前加：

~~~js
const first = segs.find((s) => s.start <= 0.8 && 0.8 < s.end);
if (first && 0.8 < duration && !inspect.some((x) => x.t === 0.8)) inspect.push({ t: 0.8, label: "首帧", seg: first.id });
~~~

更新 3 个现有断言（加 [0.5, "首帧"]）：

- "qaTimes：@词 后 0.8 秒…" 的 deepEqual 数组；
- "qaTimes：样片时长之外的 @词…" 的 labels；
- "qaTimes：样片段不相邻时…" 的 labels。

- [ ] **Step 5: 跑测试确认通过**

~~~bash
cd video-director && node --test tests/douyin-qa.test.mjs
~~~

Expected: PASS（原有 12 个 + 新增 ≥13 个）。

- [ ] **Step 6: 提交**

~~~bash
git add video-director/scripts/lib/douyin-qa.mjs video-director/tests/douyin-qa.test.mjs
git commit -m "feat(vd): vd qa 视觉工艺检查（字阶/首帧/主体簇/空白带/材质/构图变化）"
~~~

---

### Task 5: 编排层——qa-run 汇总、vd qa 输出

**Files:**
- Modify: video-director/scripts/lib/qa-run.mjs（douyinQa，第 53–78 行）
- Modify: video-director/scripts/vd.mjs（qa，第 125–149 行）
- Test: video-director/tests/qa-run.test.mjs、video-director/tests/vd.test.mjs

**Interfaces:**
- douyinQa(...) 返回新增 craft: CraftMetrics；issues 里追加 checkCraft(frames) 的 warn。
- qa-douyin.json 新增顶层 craft（对象），passed / issues / shots 不变。
- vd qa 终端在 issue 列表前打印一行：

~~~text
视觉工艺：首帧 46px / 簇约 35% · 段内字号 42–120px · 主体簇 7.2–34.6% · 空白带 415px · 材质 1/4 · 构图 7/9 段居中
~~~

- [ ] **Step 1: 写失败测试**

qa-run.test.mjs 的 fakePage 加 shot64 / pixels：

~~~js
shot64: async () => "png-base64",
pixels: async () => ({ vivid: 1.2, dark: 1.0, meanL: 88, stdL: 12 }),
~~~

blank 加 blocks / texts / materials。新增用例：

~~~js
test("douyinQa：视觉工艺只给 warn，不影响 passed；返回 craft 指标", async () => {
  const dir = project({});
  const page = fakePage(() => ({
    ...blank,
    sig: String(Math.random()),
    blocks: [{ sel: "#c", box: [100, 300, 500, 800], opacity: 1, shadow: "none", rot: 0, bgImage: false }],
    texts: [{ sel: "#t", box: [100, 900, 900, 960], opacity: 1, fontSize: 46, fontWeight: 900, color: "rgb(0,0,0)" }],
  }));
  const r = await douyinQa(built, page, join(dir, "snapshots/cues"));
  assert.equal(r.passed, true);
  assert.ok(r.issues.some((i) => i.kind === "craft-type" && i.level === "warn"));
  assert.equal(r.craft.first.maxFont, 46);
});
~~~

在 vd.test.mjs 里加一个 qa 用例（如果现有 fake 模块支持）：断言写出的 JSON 有 craft 字段、passed 不变。

- [ ] **Step 2: 跑测试确认失败**

~~~bash
cd video-director && node --test tests/qa-run.test.mjs tests/vd.test.mjs
~~~

Expected: FAIL，r.craft is undefined。

- [ ] **Step 3: 实现**

qa-run.mjs：

~~~js
import { analyzeCraft, checkCraft, checkComposition, checkCues, checkFrame, emptyWindows, qaTimes, stillWindows, summarize } from "./douyin-qa.mjs";

// 截图循环里：
const b64 = page.shot64 ? await page.shot64() : null;
if (b64) writeFileSync(join(shotDir, name), Buffer.from(b64, "base64"));
else await page.shot(join(shotDir, name));
const px = b64 && page.pixels ? await page.pixels(b64) : null;
frames.push({ ...x, data: { ...data, px } });

// 汇总：
const craft = analyzeCraft(frames);
const warns = [
  ...stillWindows(sigs).map(...),
  ...checkComposition(frames),
  ...checkCraft(frames),
];
return { passed: errors.length === 0, issues: [...errors, ...warns], shots, craft };
~~~

vd.mjs：

~~~js
writeFileSync(join(dir, out), JSON.stringify({ passed: r.passed, issues: r.issues.map(({ level, msg }) => ({ level, msg })), shots: r.shots, craft: r.craft }, null, 2) + "\n");
if (r.craft?.segments?.length) {
  // 用数组拼字符串，避免空数组 Math.min 得到 Infinity
  const s = r.craft.segments;
  const fonts = s.map((x) => x.maxFont).filter(Boolean);
  const clusters = s.map((x) => x.cluster).filter((x) => x !== null);
  if (fonts.length && clusters.length) {
    const f = r.craft.first;
    const head = f ? (f.maxFont + "px / 簇 " + f.cluster + "%") : "—";
    console.log("视觉工艺：首帧 " + head + " · 段内字号 " + Math.min(...fonts) + "–" + Math.max(...fonts) + "px · 主体簇 " + Math.min(...clusters) + "–" + Math.max(...clusters) + "% · 空白带 " + Math.max(...s.map((x) => x.gap)) + "px · 材质 " + r.craft.material.score + "/4 · 构图 " + r.craft.variety.centered + "/" + r.craft.variety.total + " 段居中");
  }
}
~~~

注意：旧工程没有 blocks 时 analyzeCraft 返回空 segments，摘要整段跳过。

- [ ] **Step 4: 跑测试确认通过**

~~~bash
cd video-director && node --test tests/qa-run.test.mjs tests/vd.test.mjs
~~~

Expected: PASS。

- [ ] **Step 5: 提交**

~~~bash
git add video-director/scripts/lib/qa-run.mjs video-director/scripts/vd.mjs video-director/tests/qa-run.test.mjs video-director/tests/vd.test.mjs
git commit -m "feat(vd): vd qa 汇总视觉工艺指标并打印摘要；warn 不影响 passed"
~~~

---

### Task 6: 品牌层——材质变量、工具类、装饰层、迁移

**Files:**
- Modify: video-director/templates/index.html
- Modify: video-director/templates/segment.html
- Test: video-director/tests/templates.test.mjs

**Interfaces:**
- templates/index.html 的手写 style 里新增：
  --vd-shadow-paper、--vd-grain、--vd-vignette、--vd-type-display、--vd-type-heading、--vd-type-body、--vd-type-caption、--vd-type-label；
  .vd-shadow、.vd-grain、.vd-vignette。
- vd:segments 之后、vd:brand 之前新增两个真实的 div（带 data-layout-ignore / data-vd-material）。
- 不改 vd:head / vd:audio / vd:segments / vd:brand 四个标记本身。

- [ ] **Step 1: 写失败测试**

在 tests/templates.test.mjs 加一个用例，断言：

- index.html 含 8 个变量名和 3 个工具类名；
- 四个 vd 标记仍在；
- 含 data-vd-material="grain" 和 data-vd-material="vignette"；
- 材质层在 /vd:segments 之后、vd:brand 之前（用 indexOf 比较）。

- [ ] **Step 2: 跑测试确认失败**

~~~bash
cd video-director && node --test tests/templates.test.mjs
~~~

Expected: FAIL，--vd-shadow-paper。

- [ ] **Step 3: 实现**

templates/index.html 的 :root 后面加：

~~~css
/* 视觉工艺：默认值；作品项目在 视觉规范.md 里覆盖。见 references/visual-craft.md */
:root {
  --vd-shadow-paper: 0 2px 0 rgba(255,255,255,.9) inset, 0 0 0 2px rgba(25,22,18,.9),
                     26px 44px 60px rgba(60,42,18,.22), 8px 14px 22px rgba(60,42,18,.16);
  --vd-grain: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3'/><feColorMatrix type='saturate' values='0'/></filter><rect width='160' height='160' filter='url(%23n)' opacity='0.16'/></svg>");
  --vd-vignette: radial-gradient(120% 90% at 50% 42%, rgba(0,0,0,0) 45%, rgba(58,42,20,.20) 100%);
  --vd-type-display: 104px;
  --vd-type-heading: 72px;
  --vd-type-body: 48px;
  --vd-type-caption: 58px;
  --vd-type-label: 24px;
}
.vd-shadow { box-shadow: var(--vd-shadow-paper); }
.vd-grain { position: absolute; inset: 0; pointer-events: none; opacity: .5; background-image: var(--vd-grain); }
.vd-vignette { position: absolute; inset: 0; pointer-events: none; background: var(--vd-vignette); }
~~~

在 /vd:segments 后、vd:brand 前加：

~~~html
      <!-- 手写：材质层（在各段上面、账号固定元素下面；data-layout-ignore 让 vd qa 不把它当遮挡） -->
      <div class="vd-grain" data-vd-material="grain" data-layout-ignore></div>
      <div class="vd-vignette" data-vd-material="vignette" data-layout-ignore></div>
~~~

templates/segment.html 的注释补一行：

~~~html
<!-- 材质：胶带 / 折角 / 手写线用 data-vd-material="tape" 标；整段豁免视觉工艺检查用 data-vd-aesthetic-ok（DIRECTOR.md 写理由） -->
~~~

不要用 #root::after 做纹理：伪元素不在 elementsFromPoint 里，会绕过遮挡判断，也测不到材质分；用真实的 div + 标记。

模板实际用一张 128×128 的预渲染 PNG data URI 代替 `feTurbulence`（每帧重算滤镜更慢）。实测全屏纸纹会让 `vd qa` 从约 30s 到约 48s（SVG 版约 52s），这是内容成本，不是 craft 检查的成本；不需要纸纹时删掉 grain 层，材质仍有 3/4。

- [ ] **Step 4: 跑测试和 hyperframes check**

~~~bash
cd video-director && node --test tests/templates.test.mjs
~~~

Expected: PASS。

可选：在临时目录用模板建空工程，跑 npx hyperframes check，确认没有新增布局错误（风格样例 /home/power/test/styleframe 实测 0 error / 1 warning）。

- [ ] **Step 5: 提交**

~~~bash
git add video-director/templates/index.html video-director/templates/segment.html video-director/tests/templates.test.mjs
git commit -m "feat(vd): 模板补材质/字阶变量和工具类；材质层带标记，不误报遮挡"
~~~

---

### Task 7: 交叉引用与迁移说明

**Files:**
- Modify: video-director/references/director-rules.md
- Modify: video-director/SKILL.md（vd qa 行、"每段画面怎么写"）
- Modify: studio/references/workflow.md（vd qa 一行）
- Modify: knowledge-video/SKILL.md（第 9/10 步）
- Modify: video-director/references/visual-craft.md（第 9 节，补迁移片段）

**Interfaces:**
- Consumes: Task 1 的文档、Task 2 的自检行、Task 4 的检查名、Task 6 的工具类。
- Produces: 文档里不再有两张互相冲突的字号表；旧工程迁移步骤可照做。

- [ ] **Step 1: 改 director-rules.md**

- 第 3 条（贯穿元素）后加一句："材质层（纸纹 / 暗角）放 index.html 手写区，不放进某一段；加 data-layout-ignore。"
- 第 11a 条补："整段豁免视觉工艺检查：段根加 data-vd-aesthetic-ok，理由写进 DIRECTOR.md；材质用 data-vd-material="grain|vignette|tape" 标出来。"
- 第 12 条改成："**字号按手机看。** 数值以 references/visual-craft.md 第 4 节为准（默认：首帧 ≥96px、段内最大 ≥64px、正文 ≥32px、标签 ≥22px；最大/中位 ≥1.6）。小于 24px 要有理由。"
- 文件头第 3 行加："画面工艺的数值规则见 visual-craft.md；本文件只管叙事、节奏和 HyperFrames 的坑。"

- [ ] **Step 2: 改 SKILL.md 的 vd qa 行**

在"抖音专用检查"那句后加：

"视觉工艺 ⚠（主体簇、首帧字号、字阶层级、内容区空白带、材质件数、构图变化；只报 ⚠ 不改 passed），终端打印一行'视觉工艺：…'，详细指标写进 qa-douyin.json 的 craft。"

"每段画面怎么写"末尾加：

"- 按 references/visual-craft.md 的 6 层定数值：首帧字号 ≥96px、主体簇 ≥35%、段内 max/中位 ≥1.6、内容区最大空白带 ≤250px、材质 ≥2 件；写完对照第 7 节自检表。"

- [ ] **Step 3: 改 studio/references/workflow.md 的 vd qa 行**

把"抖音专用检查（@词时刻截图 + 安全区 + 字幕带 + 栏目标签 + 2 秒不动）"改成：

"抖音专用检查（@词时刻截图 + 安全区 + 字幕带 + 栏目标签 + 2 秒不动 + 视觉工艺 ⚠）"

- [ ] **Step 4: 改 knowledge-video/SKILL.md 第 9/10 步**

第 9 步的"qa-douyin-sample.json 无 ✗"后加"（⚠ 视觉工艺也要看）"；第 10 步同理。不改 kv 的判定逻辑（代码里仍然只认 passed）。

- [ ] **Step 5: 补 visual-craft.md 第 9 节**

给旧工程的可粘贴片段：

~~~html
<!-- 加在 index.html 的 </style> 前 -->
<style>
  :root { --vd-shadow-paper: ...; --vd-grain: ...; --vd-vignette: ...; }
  .vd-shadow { box-shadow: var(--vd-shadow-paper); }
  .vd-grain { position:absolute; inset:0; pointer-events:none; opacity:.5; background-image:var(--vd-grain); }
  .vd-vignette { position:absolute; inset:0; pointer-events:none; background:var(--vd-vignette); }
</style>
<!-- 加在 vd:segments 和 vd:brand 之间 -->
<div class="vd-grain" data-vd-material="grain" data-layout-ignore></div>
<div class="vd-vignette" data-vd-material="vignette" data-layout-ignore></div>
~~~

并写清：旧工程的 index.html 手写区可能已经改了别的，**先备份再粘**；粘完 vd build + vd qa，确认栏目标签没有新 ✗。

- [ ] **Step 6: 自查**

~~~bash
grep -n '标题 76–128' video-director/references/director-rules.md video-director/references/visual-craft.md
~~~

Expected: 不再有两张互相冲突的字号表；director-rules 第 12 条只留一句指向 visual-craft。

- [ ] **Step 7: 提交**

~~~bash
git add video-director/references/director-rules.md video-director/SKILL.md video-director/references/visual-craft.md studio/references/workflow.md knowledge-video/SKILL.md
git commit -m "docs(vd): 视觉工艺接入导演规则、skill 说明和一期流程；补旧工程迁移"
~~~

---

### Task 8: 验收——样片副本、指标、样片改造

**Files:**
- Create: .dsh/qa-sample/（临时副本，不提交）
- Modify（只在副本里）：抖音/compositions/frames/seg-01-hook.html、抖音/index.html
- Create: docs/superpowers/reports/2026-10-19-visual-craft-check.md（验收记录）

**Interfaces:**
- Consumes: Task 1–7 全部。
- Produces: 真实工程的 craft 指标、改造前后对比图、验收报告。

- [ ] **Step 1: 复制第 1 期工程**

~~~bash
rm -rf .dsh/qa-sample && mkdir -p .dsh/qa-sample
cp -a '/home/power/self-media/04-作品/AI替我干活/01-AI写周报/抖音' .dsh/qa-sample/抖音
cp '/home/power/self-media/video-director.config.json' .dsh/qa-sample/
node -e 'const fs=require("fs");const p=".dsh/qa-sample/video-director.config.json";const c=JSON.parse(fs.readFileSync(p));c.brandDir="/home/power/self-media/06-品牌资产/hyperframes";fs.writeFileSync(p,JSON.stringify(c,null,2));'
~~~

不要动用户的原工程；下面的 vd qa 都跑在副本里。

- [ ] **Step 2: 跑改造前的 vd qa，记录指标**

先确认用的是 worktree 里的 vd（不是已安装的软链）：

~~~bash
export PATH="/home/power/self-media-skills/video-director/bin:$PATH"   # 在 worktree 里时换成 worktree 的绝对路径
cd .dsh/qa-sample/抖音 && time vd qa .
node -e 'const j=JSON.parse(require("fs").readFileSync("qa-douyin.json")); console.log(JSON.stringify(j.craft,null,2)); console.log(j.issues.filter(i=>/主体簇|空白带|字号|层级|材质|构图|首帧/.test(i.msg)).map(i=>i.msg).join("\n"));'
~~~

Expected（和实测对齐）：
- passed: true（全部新检查是 warn）；
- craft.first.maxFont = 46、cluster ≈ 35（0.8s；1.16s 的 @词 截图是 34.5，两者都在阈值边缘，hook 由字号触发）；
- craft.material.score = 1、missing 含"多层投影""纹理""暗角"（便利贴/标签的 3–6° 旋转算 1 件）；
- craft.variety.centered = 8、total = 9；
- seg-06-pit 的 gap = 415、cluster = 12.4；
- 至少 12 条 craft ⚠，至少覆盖 craft-type / craft-hierarchy / craft-hook / craft-subject / craft-gap / craft-material / craft-variety。

如果实测和这张表差太多（例如 cluster = 18.6），先查"簇合并"是不是没生效，不要改期望值。

- [ ] **Step 3: 记录性能**

~~~bash
cd .dsh/qa-sample/抖音
for i in 1 2 3; do /usr/bin/time -f '%e' vd qa . >/dev/null; done
~~~

Expected: 三次平均比改造前增加 ≤20%（实测 collect 只 +0.3%，像素统计每张截图 +1–3ms）。把三次数字写进报告。

- [ ] **Step 4: 改一段样片（验收 5）**

在副本里改 seg-01-hook.html：

- 手机 #s01-phone 从 460×840 放到 **520×1024**（单块 25.7%，簇约 45%）；
- **在手机外面加一个段级大标题**（104–140px，按视觉规范）。不要把手机里的 #s01-title 直接放大：它是录屏里的字，放大后会撑破卡片；手机里的标题保持 46–56px 即可。
- 加 box-shadow: var(--vd-shadow-paper)，加 rotate(-4deg)；
- 在 index.html 粘材质层（grain / vignette）；
- 便利贴加 data-vd-material="tape"（胶带用 ::before 画）。
- 注意：手机放大后底部的 #s01-only 会落到 y≈1294，进字幕带；把手机上移（top 230）或把按钮上移，验收以 vd qa 无新 ✗ 为准。

~~~bash
cd .dsh/qa-sample/抖音
vd build . --sample
vd qa .
~~~

Expected:
- craft.first.maxFont ≥ 96、cluster ≥ 35；
- craft.material.score ≥ 2；
- 没有新的 ✗（尤其没有栏目标签被挡）；
- vd render . --sample 出 10s 内的样片，抽首帧和 /home/power/test/sheet/f00.png 对比。

- [ ] **Step 5: 全量测试**

~~~bash
(cd video-director && node --test tests/*.test.mjs)
(cd studio && node --test tests/*.test.mjs)   # 记录：改造前就有 1 个 Node 24 相关失败
~~~

Expected: video-director 154 + 新增 ≥17，0 失败；studio 的 1 个失败和本任务无关（记录在报告里）。CI（Node 22）再跑 node studio/scripts/st.mjs test --strict。

- [ ] **Step 6: 写验收报告**

docs/superpowers/reports/2026-10-19-visual-craft-check.md 包含：

1. 改动文件清单；
2. node --test 的真实输出（通过数 / 失败数）；
3. 副本 vd qa 的 craft 指标和 warning 清单；
4. 性能三次计时；
5. 改造前 / 后首帧对比（路径 + 一句差异）；
6. 未验证项（例如 Node 22 的 st test、真实渲染的时长）；
7. 复用情况和沉淀提议。

- [ ] **Step 7: 提交**

~~~bash
git add docs/superpowers/reports/2026-10-19-visual-craft-check.md
git commit -m "docs(vd): 视觉工艺验收报告（指标、性能、样片对比）"
~~~

---

## 验收标准

1. **测试**：(cd video-director && node --test tests/*.test.mjs) 0 失败；新增 ≥17 个用例（douyin-qa ≥13、inspect-page 3、templates 1）。CI 的 st test --strict（Node 22）绿。
2. **副本 QA**：qa-douyin.json 的 passed 仍为 true；craft 指标和"设计决定"表一致；至少 12 条 craft ⚠，覆盖 7 个 kind。
3. **旧工程**：没有 blocks / texts / materials / px 的 frames 调 checkCraft 返回 []，vd qa 不崩。
4. **模板**：npx hyperframes check 0 error；四个 vd:* 标记还在；材质层在 vd:segments 和 vd:brand 之间。
5. **样片**：副本里 seg-01 的首帧 ≥96px、主体簇 ≥35%、材质 ≥2/4；没有新 ✗；有改造前后对比图。
6. **性能**：vd qa 的 **craft 检查**增幅 ≤20%（预期 <5%）；这个数字不含可选的整屏纸纹层（实测约 30s→48s，属于画面内容成本）。
7. **边界**：不改 kv / vo / vd build 的时间轴和音频；不改 components.lock.json；不新增依赖。
8. **文档**：evals/cases.md 至少跑 1、3、4、6 四条，结果写进验收报告。

## 不在本次范围

- **R5 风格包**：与"一套视觉形成辨识度"冲突，等这一期验证后再单独做。
- **P1-6 叙事节奏**（117s、第二钩子 66s）：改 SCRIPT / DIRECTOR 的节奏规则，不改画面工艺。
- **P2-8 字幕样式**：在 06-品牌资产/hyperframes/brand-captions.html，属于品牌资产改动，不是 vd 模板。
- **把视觉工艺变成硬门槛**：本计划所有 craft 都是 warn；要卡 kv 需要另外确认 --craft=error 或项目配置。
- **修 st test 的 Node 24 解析**：test-all.mjs 第 51 行只认 TAP；本机 Node 24 输出 spec，导致"0 通过"和 studio 的 1 个失败。和本任务无关，记录给后续任务。
- **真实渲染全片**：Task 8 只做 10s 内样片；全片渲染不在验收里。

## 复用情况

- **采集**：复用 inspect-page.mjs 的 boxOf / opacityOf / paints / openPage 骨架；只加字段，不重写。
- **判定**：复用 douyin-qa.mjs 的 W/H / CAPTION / summarize 和 issue 结构；checkCraft 是纯函数，沿用 el()/frame() 测试风格。
- **编排**：复用 qa-run.mjs 的截图循环和 vd.mjs 的 JSON 写出；只加 craft 字段。
- **样式**：复用 /home/power/test/styleframe/index.html 的三层投影 / 纸纹 / 暗角 / 旋转思路，改成 CSS 变量和工具类；不引入 CDN、不复制它的字体 local() 写法。
- **品牌数值**：复用 06-品牌资产/视觉规范.md 的字号和配色，不在工具包里另立一套。
- **无新增依赖**：puppeteer-core、HyperFrames、Canvas 都是已有能力。

## 沉淀提议

- 本计划的 pixels()（Canvas 色度 / 暗部统计）如果以后有第二个 skill 要用，可提到 shared/node/pixels.mjs；本期先留在 video-director，避免过早抽象。
- analyzeCraft / checkCraft 是 vd 专用（依赖 1080×1920 和品牌排除规则），不建议进 shared/。
