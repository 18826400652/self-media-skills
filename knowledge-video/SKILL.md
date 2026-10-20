---
name: knowledge-video
description: >
  AI 知识短视频的生产流程（导演手册）：输入一个主题，按阶段完成 理解任务 → 求真（研究或实测）→ 脚本 → 配音 + 导演脚本 → 样片 → 渲染 → 视觉 QA → 复盘，
  每个阶段有中间产物，几个节点停下来等人确认（实用类 5 个）。内容类型做成可插拔的类型档案（概念科普、实用技巧…）。
  提供 kv 命令：kv status（进度；实用类管完整的一期）、kv gate（记用户确认）、kv done（记草稿）、kv check（研究来源和脚本依据）、kv brief（研究简报）。
  当用户说「做一期 XX」「做个讲 XX 的视频」、要做 AI 概念科普视频，或项目里有 knowledge-video.config.json 时使用。
  配音交给 voiceover（vo），导演脚本、组装、渲染交给 video-director（vd），存草稿交给 video-draft（vdraft）；实用技巧类的实测交给 scenario-content。
---

# knowledge-video：AI 知识短视频导演手册

**原则：每条事实都能追溯到来源；每个阶段都有产物；不一次做完，几个节点停下来等人确认。**

## 安装（第一次用）

```bash
ln -s <skill 目录> ~/.claude/skills/knowledge-video   # 让 Claude 能加载这个 skill
ln -s <skill 目录>/bin/kv ~/.local/bin/kv             # 命令行能直接用 kv
```

没有第三方依赖，不用 npm install。下游要先装好 voiceover（`vo`）、video-director（`vd`）、video-draft（`vdraft`）。

开始前：读项目配置 `knowledge-video.config.json`（系列、观众、语气指南、经验库目录），读经验库的 `规律.md`。

## 实用类（type: practical）：kv 管完整的一期

新建作品时 `st new`（studio skill）已跑过 `kv init --fresh`，并用 `vd init 抖音` 建好 `抖音/` 导演工程。之后每一步开始前 `kv status <作品目录>`，只做它说的那一步：

| 命令 | 什么时候用 |
|---|---|
| `kv status <作品>` | 每一步开始前；列出 16 步 ✓/·、确认节点、下一步 |
| `kv gate <作品> <topic\|script\|director\|sample\|final> "用户原话"` | 用户明确说通过之后。前面没做完会被拒绝 |
| `kv gate <作品> <节点> --edit "用户原话"` | 用户提了修改意见（不算通过） |
| `kv done <作品> <wechat\|xiaohongshu\|douyin>` | `wa draft` / `vdraft --to xiaohongshu` / `vdraft` 成功之后；用户自己存草稿的，用户说存好了再记。④ 通过后第 11–16 步各算各的，内容写好没存的显示「待存草稿」；三个平台互不依赖，哪个先存都能记 |
| `kv init <作品> [--fresh]` | 老作品补 run.json；`--fresh` 记下刚生成的模板，用来判断「还没写」 |

16 步、5 个确认节点：

| # | 步骤 | 确认 |
|---|---|---|
| 1–6 | 场景卡、选题关、实测、母稿、费曼检查、自检（`sc check`） | ① 选题（第 2 步） |
| 7 | 抖音脚本 + 配音稿（`vo 抖音 --check` 通过） | ② 脚本 |
| 8 | 配音 + 导演脚本（`vo 抖音`；`抖音/DIRECTOR.md`，`vd cues 抖音 --check` 通过） | ③a 导演脚本 |
| 9 | 风格样片（`抖音/renders/sample.mp4`，`qa-douyin-sample.json` 无 ✗；⚠ 视觉工艺也要看） | ③b 样片 |
| 10 | 渲染 + QA（`vd render 抖音`，`qa-douyin.json`、`qa.json` 通过；⚠ 视觉工艺也要看） | ④ 成片 |
| 11–13 | 公众号、小红书、抖音草稿（不做的平台在 `knowledge-video.config.json` 的 `skipPlatforms` 里关掉，显示 `–`） | |
| 14 | 更新选题清单（`topicList` 指的文件「已做」一节里出现这期简称） | |
| 15–16 | 发布记录、复盘 | |

确认之后又改了相关文件，这个节点自动失效，要重新请用户确认：② 改了 `SCRIPT.md` / `VOICE.md`；③a 改了 `DIRECTOR.md`（只补第 8 节组件候选不算）或 `audio_meta.json`（重新配音）；③b 换了样片；④ 换了成片。工程里的 HTML 比成片新要重新渲染。`kv status` 调用 `sc check --json`、`vo --check`、`vd cues --check`，命令名可用环境变量 `KV_SC_CMD`、`KV_VO_CMD`、`KV_VD_CMD` 换掉。视频只有导演做法一套，工程就是 `抖音/`，配音直接写在里面，没有复制步骤。

下面「阶段」表是概念科普的流程。

## 阶段

| 阶段 | 做什么 | 产物 | 停下来 |
|---|---|---|---|
| 0. 理解任务 | 按项目约定创建作品目录（项目说明里写的新建作品方式），判断内容类型（读 `types/`），复制 `templates/brief.md`、`templates/run.json` 到作品目录。新建时预放的空模板（未填的实测记录、占位口播的 SCRIPT）`kv status` 不算完成 | `brief.md`、`run.json` | — |
| 1. 求真 | 按类型档案：概念科普查资料（`references/research.md`），实用技巧做实测 | `research.json` 或 `实测记录.md` | — |
| 2. 脚本 | 先读系列说明（`00-规划/系列/<系列>.md`）第三节「每期结构」：写了具体结构的，段落、句数、时长按它来；还是模板占位才用类型档案的结构配方（系列说明管这个系列每期长什么样，类型档案只是默认；`kv check` 不检查结构和句数）。新建时预放的 SCRIPT 段落只是占位，结构不同就整段重写。按此写 `抖音/SCRIPT.md`（格式见 voiceover），每句标依据（`references/script.md`）；费曼检查写进 brief.md；`kv check` 无 ✗。配音服务商支持导演稿时，再按 voiceover 的 `references/voice-direction.md` 写 `抖音/VOICE.md`，`vo 抖音 --check` 通过 | `抖音/SCRIPT.md`、`抖音/VOICE.md` | **① `kv brief` 生成研究简报，请用户确认简报、脚本和配音导演稿** |
| 3. 导演脚本和样片 | `vo 抖音` 配音 → 按 video-director 写 `抖音/DIRECTOR.md`（`vd cues 抖音 --check`）→ 风格样片（`vd build 抖音 --sample`、`vd render 抖音 --sample`） | `抖音/DIRECTOR.md`、`抖音/renders/sample.mp4` | **②a 请用户审导演脚本 → ②b 请用户看风格样片** |
| 4. 渲染和 QA | `vd qa 抖音` 无 ✗ → `vd render 抖音`；看 `snapshots/cues-sheet.jpg` 和成片抽帧，写 `qa.json`（`references/qa.md`）；有 high 级问题先修 | `抖音/renders/*.mp4`、`qa.json` | **③ 请用户看成片** |
| 5. 复盘 | 写经验库记录；同类修改出现 2 次以上，提议改哪个文件（先问用户） | 经验库 | — |

不确定做到哪了：`kv status <作品目录>`。

## 确认节点怎么记

用户确认通过：把 `run.json` 的 `gates.<节点>.passed` 改成 true，`at` 写日期，`stage` 改成下一阶段。用户提了修改意见：原话追加进 `gates.<节点>.edits`，改完再请用户确认。**没通过不往下走。**

## 硬规矩

- 不编事实：脚本里的事实只能来自 research.json；没查到可靠来源的写进 `open_questions`，不写进脚本
- 口播要忠于所引 claim：claim 说「通常」，口播不能说成「一定」
- 类比要在费曼检查里写明在哪里不成立
- 不在 ② 之前渲染；不在视觉 QA 之前说「做完了」
- 画面上的数字和说法要和 research.json 一致
- 缺的画面组件：那一帧手写，记进经验库；同一种画面两期都需要才做成组件

## 文件

- 类型档案：`types/concept.md`（概念科普）、`types/practical.md`（实用技巧）。新类型：先用最接近的档案做 1～2 期，问题记进经验库，再写正式档案
- 参考：`references/research.md`（怎么查、怎么摘录）、`references/script.md`（依据写法、类比检验）、`references/qa.md`（视觉 QA）
- 模板：`templates/brief.md`、`templates/research.json`、`templates/run.json`

## 经验库

位置：项目配置的 `experienceDir`。每期一条 `YYYY-MM-DD-简称.md`：类型；三个节点用户改了什么（原稿 → 改后，来自 run.json 的 edits）；QA 发现的问题；缺了哪些组件；渲染等环节的问题。`规律.md`：同一类修改出现 2 次及以上写进去，注明应改到哪个文件。
