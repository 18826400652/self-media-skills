---
name: knowledge-video
description: >
  AI 知识短视频的生产流程（导演手册）：输入一个主题，按阶段完成 理解任务 → 求真（研究或实测）→ 脚本 → 分镜 → 配音 → 渲染 → 视觉 QA → 复盘，
  每个阶段有中间产物，三个节点停下来等人确认。内容类型做成可插拔的类型档案（概念科普、实用技巧…）。
  提供 kv 命令：kv check（研究来源和脚本依据）、kv brief（研究简报）、kv status（进度）。
  当用户说「做一期 XX」「做个讲 XX 的视频」、要做 AI 概念科普视频，或项目里有 knowledge-video.config.json 时使用。
  配音、分镜、渲染交给 narrated-video；实用技巧类的实测交给 scenario-content。
---

# knowledge-video：AI 知识短视频导演手册

**原则：每条事实都能追溯到来源；每个阶段都有产物；不一次做完，三个节点停下来等人确认。**

## 安装（第一次用）

```bash
ln -s <skill 目录> ~/.claude/skills/knowledge-video   # 让 Claude 能加载这个 skill
ln -s <skill 目录>/bin/kv ~/.local/bin/kv             # 命令行能直接用 kv
```

没有第三方依赖，不用 npm install。下游的配音、分镜、渲染要先装好 narrated-video（`nv`）。

开始前：读项目配置 `knowledge-video.config.json`（系列、观众、语气指南、经验库目录），读经验库的 `规律.md`。

## 阶段

| 阶段 | 做什么 | 产物 | 停下来 |
|---|---|---|---|
| 0. 理解任务 | 按项目约定创建作品目录（项目说明里写的新建作品方式），判断内容类型（读 `types/`），复制 `templates/brief.md`、`templates/run.json` 到作品目录。新建时预放的空模板（未填的实测记录、占位口播的 SCRIPT）`kv status` 不算完成 | `brief.md`、`run.json` | — |
| 1. 求真 | 按类型档案：概念科普查资料（`references/research.md`），实用技巧做实测 | `research.json` 或 `实测记录.md` | — |
| 2. 脚本 | 按类型档案的结构配方写 `抖音/SCRIPT.md`（narrated-video 格式），每句标依据（`references/script.md`）；费曼检查写进 brief.md；`kv check` 无 ✗ | `抖音/SCRIPT.md` | **① `kv brief` 生成研究简报，请用户确认简报和脚本** |
| 3. 分镜 | 按 narrated-video 写 STORYBOARD 的 build 行 → `nv hf-audio` → `nv hf-build --snap` | `抖音/STORYBOARD.md`、`抖音/snapshots/sheet.jpg` | **② 请用户看总览图** |
| 4. 渲染和 QA | `nv render`；逐帧看总览图和成片抽帧，写 `qa.json`（`references/qa.md`）；有 high 级问题先修 | `抖音/renders/*.mp4`、`qa.json` | **③ 请用户看成片** |
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
