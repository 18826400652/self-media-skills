# 一期内容的固定流程（kv 管完整的一期）设计

日期：2026-10-12　状态：用户已同意方案，待审设计文档

## 背景和目标

一期实用类内容（主线「AI 做自媒体」）要经过 scenario-content → content-repurpose → narrated-video / wechat-article / image-cards → 存草稿。现在的问题：

1. 入口有两个（`kv` 和 `scenario-content`），第 1 期就跳过了 `kv`。
2. `kv status` 只管视频，选题关、母稿、费曼、配音稿、公众号、小红书、草稿、发布记录都不在里面，后半程靠 Claude 自己记。
3. 用户的确认分散在 `选题关.md` 和 `run.json`。
4. 流程只写在文档里，没有任何命令会因为「上一步没确认」而拒绝。

**目标**：做新一期时只有一个入口；任何时候 `kv status` 都能说出整期每一步的状态和下一步；需要用户确认的节点没确认就记不了下一个确认；确认之后又改了内容，要重新确认。

**不做**：概念科普（`type: concept`）流程不变；不加 Claude Code hook；不给 `nv render`、`wa draft` 等命令加拦截；公众号、小红书不设确认节点（用户在平台后台看草稿）；不加「学习方法」等新类型档案。

## 入口

- 用户说「做一期 XX」→ `scripts/new-episode.sh <系列> <简称>`。实用类作品同时生成 `run.json`（`type: practical`）。
- 之后每一步开始前先跑 `kv status <作品目录>`，只做它说的那一步。
- 旧作品（没有 `run.json`）用 `kv init <作品目录>` 补一份，类型按目录里有没有 `场景卡.md` 判断。
- `scenario-content` 的 SKILL.md 改成「内容这几步怎么做」的说明书，入口统一在 `kv`。

## 实用类的 14 步

| # | 键 | 步骤 | 做完的判断 | 确认节点 |
|---|---|---|---|---|
| 1 | scenario | 场景卡 | `sc check` 没有关于 `场景卡.md` 的 ✗ | |
| 2 | topic | 选题关 | `sc check` 没有关于 `选题关.md` 的 ✗（不算「用户没确认」那条） | ① topic |
| 3 | test | 实测 | 没有关于 `实测记录.md` 的 ✗；`实测/` 里有录屏 mp4 | |
| 4 | draft | 母稿 | 没有关于 `母稿.md` 的 ✗ | |
| 5 | feynman | 费曼检查 | 没有关于 `费曼检查.md` 的 ✗ | |
| 6 | selfcheck | 自检 | `sc check` 整体没有 ✗ | |
| 7 | script | 抖音脚本 + 配音稿 | `抖音/SCRIPT.md` 已写（不是模板占位）；`nv hf-audio 抖音 --check` 退出码 0 | ② script |
| 8 | storyboard | 配音 + 分镜 | 有 `抖音/audio_meta.json`、`抖音/STORYBOARD.md`；`抖音/snapshots/sheet.jpg` 比 STORYBOARD.md 新 | ③ storyboard |
| 9 | render | 渲染 + QA | `抖音/renders/*.mp4` 比 sheet.jpg 新；`qa.json` 的 `passed` 为 true | ④ final |
| 10 | wechat | 公众号 | `公众号/文章.md` 已写；`run.json` 记了 `done.wechat` | |
| 11 | xiaohongshu | 小红书 | `小红书/卡片.md`、`小红书/文案.md` 已写，卡片已出图；记了 `done.xiaohongshu` | |
| 12 | douyin | 抖音草稿 | `抖音/封面.md` 已出图；记了 `done.douyin` | |
| 13 | record | 发布记录 | `发布记录.md` 的置顶评论不是模板占位 | |
| 14 | retro | 复盘 | 经验库目录里有文件名含作品简称的记录 | |

- 第 1–6 步的判断来自 `sc check --json`（新加的输出格式：每条问题带 `file`、`level`、`msg`）。kv 按 `file` 把问题归到对应步骤，不自己重写检查。
- 「已写」= 文件存在且不是新建作品时放的空模板；判断方法和现有 `isScriptFilled` 一样（没有模板占位文字）。
- 步骤按顺序算：第一个没做完的步骤就是「下一步」。前面的步骤没做完，后面的不显示 ✓。

## 确认节点

| 节点 | 什么时候能记 | 确认时记下的内容指纹 |
|---|---|---|
| ① topic | 第 1–2 步做完 | `选题关.md` |
| ② script | 第 1–7 步做完，① 已通过 | `抖音/SCRIPT.md`、`抖音/VOICE.md`（有的话） |
| ③ storyboard | 第 8 步做完，② 已通过 | `抖音/STORYBOARD.md`、`sheet.jpg` |
| ④ final | 第 9 步做完，③ 已通过 | 最新的 `renders/*.mp4` |

- **记录**：`kv gate <作品目录> <节点> "用户原话"`，写进 `run.json` 的 `gates.<节点>`：`passed: true`、`at`（日期）、`quote`（原话）、`fingerprint`（上表文件内容的 sha256）。
- **提修改意见**：`kv gate <作品目录> <节点> --edit "用户原话"`，原话追加进 `gates.<节点>.edits`，`passed` 保持 false。
- **拒绝**：条件不满足时退出码 1，说明缺哪一步或哪个节点，什么都不写。
- **选题关同步**：① 通过时，同时把 `选题关.md` 的「用户确认」行写成「日期 通过（原话）」，因为 `sc check` 读的是这一行。
- **确认后又改了**：`kv status` 每次重算指纹，和记下的不一样时，这个节点视为没通过，显示「确认后改过，需要重新确认」，后面的步骤都不算 ✓。

## 存草稿记录

`kv done <作品目录> <wechat|xiaohongshu|douyin>`：只能记这三个键；对应的内容文件（第 10–12 步的前半）没写好时拒绝。写进 `run.json` 的 `done.<键>`（日期）。约定在 `wa draft`、`ic draft`、`nv draft` 成功后才记。

## `kv status` 的输出

```
类型：实用技巧
 ✓ 1 场景卡
 ✓ 2 选题关          ① ✓ 2026-10-08「按你的建议」
 ...
 · 9 渲染 + QA        ④ 等用户确认
 · 10 公众号
下一步：请用户看成片（确认节点 ④）
```

概念科普作品的输出保持现在的格式。

## run.json（实用类）

```json
{
  "type": "practical",
  "gates": {
    "topic":      { "passed": false, "at": null, "quote": null, "fingerprint": null, "edits": [] },
    "script":     { "passed": false, "at": null, "quote": null, "fingerprint": null, "edits": [] },
    "storyboard": { "passed": false, "at": null, "quote": null, "fingerprint": null, "edits": [] },
    "final":      { "passed": false, "at": null, "quote": null, "fingerprint": null, "edits": [] }
  },
  "done": {}
}
```

`stage` 字段不再写进实用类的 run.json（由 status 每次算出来，避免和文件对不上）。

## 改动的文件

- `skills/knowledge-video/`：`scripts/kv.mjs`（`init`、`gate`、`done` 命令；实用类 status）、新 `scripts/lib/practical.mjs`（14 步的判断和确认规则，纯函数）、`templates/run-practical.json`、`types/practical.md`、`SKILL.md`、测试。
- `skills/scenario-content/`：`sc check --json`；SKILL.md 说明入口在 kv。
- `scripts/new-episode.sh`：实用类生成 `run.json`。
- `CLAUDE.md`：「做一期」的约定改成先跑 `kv status`、只做它说的那一步、没有用户的「通过」不跑 `kv gate`。

## 测试

- 单元测试（纯函数）：每一步的判断；步骤顺序（前面没做完后面不显示 ✓）；四个节点的前置条件和拒绝；`--edit` 不通过；确认后改了文件 → 节点失效；`kv done` 只接受三个键且内容没写好时拒绝；`sc check --json` 的格式。
- 实测：给第 1 期「不想看」跑 `kv init`，再跑 `kv status`。按现在的进度应停在 ④ 成片等确认（①②③ 根据已有的确认补记）。
