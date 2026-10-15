# 知识短视频生产 Skill（knowledge-video）设计

- 日期：2026-10-07
- 范围：新建通用 Skill `skills/knowledge-video`（软链接到 `~/.claude/skills/`）+ 项目配置 + 新系列登记；下游复用 `narrated-video`（nv）
- 第一期试跑：概念科普「RAG 是什么」

## 1. 背景和目标

用户想做一套 Claude 可调用的「AI 知识短视频生产 Skill」：输入一个 AI 主题，按阶段走完 理解任务 → 求真 → 脚本 → 分镜 → 配音 → 渲染 → QA → 成片，并在过程中**积累案例、发现 AI 不靠谱的地方**。等流程稳定（约 30 期以上），再把稳定部分产品化（数据格式统一成 JSON、做桌面应用等），那是第二、三阶段，不在本次范围。

**现状**：项目里 `scenario-content`（场景卡 → 实测 → 母稿 → 费曼检查）+ `narrated-video`（SCRIPT.md → 配音和逐字时间 → STORYBOARD 的 build JSON → hf-kit 组件 → HyperFrames → 成片检查）已覆盖大部分环节。**缺的是**：
1. 研究阶段：事实带来源，脚本只能从研究里取事实
2. 把各环节串起来、能中断续做的总调度
3. 经验库：记录 Claude 原稿和用户修改的差别，沉淀成规则
4. 结构化的视觉 QA 结果

**已确定的决定**：

| 问题 | 决定 |
|---|---|
| 做哪类内容 | 多种类型都要；**内容类型做成可插拔的「类型档案」**，新增类型只加档案，不改总流程 |
| 第一期试跑 | 概念科普（AI 概念，如 RAG、MCP、Agent） |
| 概念科普给谁看 | 上班族（同账号主线观众），落到「这跟你有什么关系」 |
| 人工确认节点 | 三个：① 研究简报 + 脚本 ② 分镜总览图 ③ 成片 |
| 架构 | **方案 1**：新建总调度 Skill，下游直接复用 nv；中间产物沿用 SCRIPT.md / STORYBOARD.md，新增 research.json、qa.json、run.json |

**成功标准（第一期验收）**：
- 「RAG 是什么」出一条通过 `nv verify` 和视觉 QA 的成片
- 研究简报里每条事实都能找到来源链接和摘录原文
- 经验库至少记下三个节点用户改了什么、缺了哪些组件

**不是验收标准**：成片好不好看、播放量。第一期的目的是暴露问题。

**第一版不做**：
- 自动联网搜索脚本：研究由 Claude 用自带的网页搜索和抓取工具完成；查法稳定后、或产品化时再写
- 背景音乐：与本次验证无关，另有版权和音量平衡问题
- 新画面组件：先用现有 hf-kit，缺的画面那一帧手写并记进经验库；同一种画面两期都需要才做成组件（沿用 hf-kit 规矩）

## 2. 流程和产物

一期放在 `04-作品/<系列>/NN-简称/`，用 `scripts/new-episode.sh` 创建。

| 阶段 | 做什么 | 产物 | 停下来 |
|---|---|---|---|
| 0. 理解任务 | 判断内容类型；写清这期一句话讲明白什么、跟上班族有什么关系 | `brief.md` | — |
| 1. 求真（按类型档案） | 概念科普：先查官方文档、论文、权威来源，再看媒体；每条事实记成 claim，附来源 | `research.json` | — |
| 2. 结构和脚本 | 按类型档案的结构配方写口播（nv 的 `抖音/SCRIPT.md`），每句标依据；`kv check` 通过；费曼检查写进 `brief.md` | `抖音/SCRIPT.md` | **① 用户确认**研究简报（`kv brief` 生成）+ 脚本 |
| 3. 分镜 | 写 STORYBOARD 的 build 行 → `nv hf-audio` → `nv hf-build --snap` | `抖音/STORYBOARD.md`、`snapshots/sheet.jpg` | **② 用户确认**总览图 |
| 4. 渲染和 QA | `nv render`（含成片检查）→ Claude 逐帧看总览图和成片抽帧，写视觉 QA；有 high 级问题先修 | `renders/*.mp4`、`qa.json` | **③ 用户确认**成片 |
| 5. 复盘 | 写经验记录，必要时更新规律 | `00-规划/经验库/…` | — |

**进度记录 `run.json`**（每期一个，放作品目录）：

```json
{
  "type": "concept",
  "stage": "script",
  "gates": {
    "script": { "passed": false, "at": null, "edits": [] },
    "storyboard": { "passed": false, "at": null, "edits": [] },
    "final": { "passed": false, "at": null, "edits": [] }
  }
}
```

`stage` 取值：`brief` → `research` → `script` → `storyboard` → `render` → `review` → `done`。`edits` 记录用户在该节点提的每条修改意见（原文）。确认节点通过、记录修改意见由 Claude 按 SKILL.md 规定写入，不单独做命令。对话中断后，`kv status` 告诉 Claude 从哪继续。

## 3. Skill 结构和命令

```
skills/knowledge-video/
├── SKILL.md                 导演手册：阶段、确认节点、停下来的时机、硬规矩
├── types/
│   ├── concept.md           概念科普档案
│   └── practical.md         实用技巧档案（求真阶段指向 scenario-content 的实测流程）
├── references/
│   ├── research.md          来源优先级、怎么摘录、怎么判断可信度、国内访问不了时怎么办
│   ├── script.md            依据标注写法、类比的检验方法
│   └── qa.md                视觉 QA 检查项和 qa.json 格式
├── templates/
│   ├── brief.md
│   ├── research.json        空模板（带一条示例 claim）
│   └── run.json
├── bin/kv                   命令入口
├── scripts/                 Node 脚本（ESM，同 nv）
└── tests/                   node --test
```

**类型档案**（`types/*.md`）每份写清：真实性靠什么（求真阶段做什么）、要交出的中间产物、内容结构配方、常用画面组件、额外的 QA 规则。总调度只做：认出类型 → 读档案 → 按档案走前半段；脚本之后各类型共用。**新增类型的规矩**：先用最接近的档案手工做 1～2 期，问题记进经验库，再整理成正式档案。

**命令**：

| 命令 | 作用 |
|---|---|
| `kv check <作品目录>` | research.json 格式和来源规则；SCRIPT.md 每句依据；qa.json 格式（存在时）。有 ✗ 退出码非 0 |
| `kv brief <作品目录>` | research.json → 研究简报 Markdown（输出到 `研究简报.md`）：被脚本用到的事实在前，每条列出处、可信度、**引用它的口播原句**；没被用到的放最后；`open_questions` 单列 |
| `kv status <作品目录>` | 读 run.json 和已有文件，输出当前阶段、下一步、未通过的确认节点 |

**项目配置** `knowledge-video.config.json`（项目根目录）：系列名、观众描述、语气指南路径、经验库目录。Skill 本身不含项目信息。

**新系列**：在 `00-规划/系列/系列.json` 登记概念科普系列（暂名「AI 概念一分钟」，用户可改），并写 `00-规划/系列/<系列>.md`。

## 4. 研究和依据规则

**research.json**：

```json
{
  "topic": "RAG 是什么",
  "question": "为什么问公司知识库时，AI 能答得比直接问 ChatGPT 准？",
  "claims": [
    {
      "id": "c01",
      "text": "RAG 是先从资料库里找出相关内容，再交给大模型生成回答的方法",
      "kind": "fact",
      "confidence": "high",
      "sources": [
        {
          "title": "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks",
          "url": "https://arxiv.org/abs/2005.11401",
          "type": "paper",
          "quote": "证明这条 claim 的原文摘录",
          "accessed": "2026-10-07"
        }
      ]
    }
  ],
  "open_questions": ["查了但没查到可靠来源的问题"]
}
```

**`kv check` 规则**：

| 规则 | 级别 |
|---|---|
| `id` 唯一，格式 `c` + 数字 | ✗ |
| `kind` 只能是 `fact`、`number`（数字、日期、排名） | ✗ |
| `confidence` 只能是 `high`、`medium`、`low` | ✗ |
| 每条 claim 至少 1 个来源 | ✗ |
| `number` 类、或 `confidence` 不是 `high` 的：至少 2 个来源，或至少 1 个 `official` 来源 | ✗ |
| 每个来源有 `url`（http/https）、`quote`（非空）、`accessed`（YYYY-MM-DD） | ✗ |
| 来源 `type` 只能是 `official`、`paper`、`media`、`other` | ✗ |
| claim 的来源只有 `media`/`other` | ⚠ |

`quote` 必须是来源原文摘录，不能是转述（这一条靠 Claude 遵守，`references/research.md` 写明）。

**脚本依据**：SCRIPT.md 每个 `## Line N` 块下加一行 `**依据:**`，取值：
- `c01, c03`：用到的 claim（逗号分隔）
- `类比`：不需要来源，但 brief.md 的费曼检查里要写明这个类比在哪里不成立
- `观点`：我们的判断和建议

| 规则 | 级别 |
|---|---|
| 每句口播都有 `**依据:**` | ✗ |
| 引用的 claim id 都在 research.json 里 | ✗ |
| 取值只能是 claim id 列表、`类比`、`观点` | ✗ |
| research.json 里有 claim 没被任何一句引用 | ⚠ |

**工具查不出来、靠人和 Claude 把关的**：口播是否忠于所引 claim（如 claim 说「通常」，口播说成「一定」）。Claude 写时自查；研究简报把 claim 和引用它的口播原句并排列出，供用户在 ① 节点对照。

## 5. 概念科普档案

**结构配方**（约 1 分钟，9～13 句口播）：

| 段落 | 句数 | 作用 |
|---|---|---|
| 钩子 | 1–2 | 上班族遇到过的反常现象 |
| 是什么 | 2 | 一句大白话定义 + 一个类比 |
| 为什么 | 2–3 | 原理讲到上班族需要的程度，每句有依据 |
| 跟你有什么关系 | 2–3 | 落到能马上用的一个做法 |
| 误区 / 边界 | 1–2 | 它做不到什么 |
| 收尾 | 1 | 一句话记住 + 下一期预告 |

- 费曼检查（零基础会追问什么、类比在哪不成立、术语换掉或配类比）写进 `brief.md`
- 常用画面：`chain` 因果链、`steps` 步骤、`compare` 对比卡、`marker` 荧光笔；缺的记进经验库
- 额外 QA：画面上出现的数字、说法与 research.json 一致

**实用技巧档案**（`types/practical.md`）：求真阶段 = scenario-content 的场景卡和实测（产物 `实测记录.md` + 录屏），结构配方沿用 `narrated-video/references/douyin-recipe.md` 的 1 分钟版；依据标注里 claim 换成实测轮次（如 `R1`），第一版只写档案，`kv check` 对实用技巧类只检查 SCRIPT 的依据行是否存在。

## 6. 视觉 QA

`qa.json`（作品目录）：

```json
{
  "passed": false,
  "checked": ["safe-area", "text-size", "density", "typo", "fact-on-screen", "rhythm"],
  "issues": [
    { "frame": 4, "severity": "high", "check": "density", "problem": "一屏 6 行表格，手机上看不清", "fix": "只留 2 行，其余虚化" }
  ]
}
```

- `checked` 必须包含全部 6 项；`severity` 只能是 `high`、`medium`、`low`
- `passed` 为 true 时不能有 `high` 级 issue（`kv check` 检查）
- 有 `high` 级问题不进 ③ 节点，先修再重写 qa.json

## 7. 经验库

位置：`00-规划/经验库/`（项目数据，不放进 Skill）。

- 每期一条 `YYYY-MM-DD-简称.md`：类型；三个节点用户改了什么（原稿与改后对照，来自 run.json 的 edits）；QA 发现的问题；缺了哪些组件；渲染等环节遇到的问题
- `规律.md`：同一类修改出现 **2 次及以上** 写进规律，注明应改到哪个文件（类型档案、语气指南、SKILL.md、组件）。**改规则前先问用户**
- 每期开始前，Claude 先读 `规律.md`

## 8. 测试和验证

**自动测试**（`node --test`）：
- `kv check`：构造的 research.json / SCRIPT.md / qa.json 分别命中第 4、6 节每条规则（缺来源、缺摘录或日期、number 类只有一个非官方来源、漏标依据、引用不存在的 claim、未被引用的 claim 只警告、qa.json passed 却有 high 级问题等）
- `kv brief`：每条被引用的事实旁列出引用它的口播原句；未被引用的在最后
- `kv status`：按 run.json 和已有文件判断阶段（如「有脚本、① 未通过 → 等用户确认」）

**第一期试跑**：「RAG 是什么」走完全流程，按第 1 节验收标准验收，写第一条经验记录。

## 9. 风险

| 风险 | 应对 |
|---|---|
| 国内访问不了部分来源 | 优先官方中文文档或可访问的镜像；打不开的记进 `open_questions`，不写进脚本 |
| 研究简报太长，用户没耐心看 | 被引用的事实在前、控制在一屏左右；未被引用的放最后 |
| 讲浅了不准、讲深了听不懂 | 费曼检查加「每个术语要么换掉、要么配类比」；① 节点重点看 |
| jsdelivr 慢导致截图、渲染超时 | 与本设计无关，沿用临时办法（见项目记忆）；是否换 CDN 由用户单独决定 |
