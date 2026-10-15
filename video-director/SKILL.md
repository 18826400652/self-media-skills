---
name: video-director
description: >
  视频导演：已写好的口播稿 + nv hf-audio 的配音 → 导演脚本 DIRECTOR.md → 按内容设计风格的 HyperFrames 视频工程（每段一个子画面，
  账号固定元素：栏目标签、字幕、结尾），带配乐重拍对位和人声避让。提供 vd 命令：vd cues、vd build [--sample] [--no-music]、vd qa（抖音专用检查）、vd check。
  当用户要「按导演脚本做视频」、brief.md 里 video: director，或作品目录里有 DIRECTOR.md 时使用。配音用 narrated-video，渲染用 nv render。
---

# video-director：先写导演脚本，再做视频

**原则：风格从内容里长出来；每个动作锚定到口播里的词；账号只固定栏目标签、字幕、结尾三处。**

设计文档：`docs/superpowers/specs/2026-10-14-video-director-design.md`。导演规则：`references/director-rules.md`（写脚本、做画面时逐条对照）。

## 安装（第一次用）

```bash
ln -s <skill 目录> ~/.claude/skills/video-director
ln -s <skill 目录>/bin/vd ~/.local/bin/vd
cd <skill 目录> && npm i                             # vd qa 要用 puppeteer-core
echo 'export NODE_USE_ENV_PROXY=1' >> ~/.bashrc       # 走代理时 Node 才能联网
curl -fsSL https://static.heygen.ai/cli/install.sh | bash   # 配乐用的 heygen CLI（先看一遍脚本）
HEYGEN_NO_BROWSER=1 heygen auth login --oauth         # 浏览器授权，走免费额度（API Key 会扣钱包）
```

项目根目录要有 `video-director.config.json`：`brandDir`（账号固定元素）、`sfxDir`（音效库）、`hfVersion`（HyperFrames 版本）；选填 `fontsDir`、`gsap`（要换字体包或 GSAP 时才写，默认用 vd 自带的：`npm ci` 装的 fontsource 字体 Noto Sans SC、Noto Serif SC、JetBrains Mono 和 GSAP，`vd build` 生成进工程的 `assets/fonts/`）。工程里的 `@hyperframes/core` 由 `vd build` 自动装。

## 流程（一期的抖音部分）

**在 kv 里**：作品 `run.json` 写 `"video": "director"` 后，`kv status` 按下面的步骤指引（实用类的 ③a / ③b / ④，概念科普的 ②a / ②b / ③），用户确认后：实用类 `kv gate <作品> director|sample|final "原话"`；概念科普按 knowledge-video 的「确认节点怎么记」手改 `run.json` 的 `gates.director` / `gates.sample` / `gates.final`。样片固定输出到 `renders/sample.mp4`，对比视频 `renders/compare.mp4`——这两个名字 kv 不当正式成片。

| 步骤 | 做什么 | 停下来 |
|---|---|---|
| 0 | 口播稿、配音稿确认后，`nv hf-audio <抖音工程>` 生成配音和逐字时间轴 | — |
| 1 | 新建导演工程（下面的命令），按 `templates/DIRECTOR.md` 写导演脚本；`vd cues .` 确认每个 @词都找得到 | **③a 请用户审 DIRECTOR.md** |
| 2 | 写样片的几段（`templates/segment.html`），贯穿元素写进 `index.html` 手写区；`vd build . --sample`；`vd qa .` 无 ✗（看 `snapshots/cues-sheet.jpg`）；`npx hyperframes render -o renders/sample.mp4` 出样片 | **③b 请用户看样片** |
| 3 | 写其余各段，每写一段 `vd build . --no-music` + 截图；全部写完 `vd build .` | — |
| 4 | 全片 `vd qa .` 无 ✗，按总览图逐条对照 DIRECTOR.md，问题记进 `qa.json`；`nv render <工程>`；和旧版做对比视频（`renders/compare.mp4`）；`vd check` 列出组件候选 | **④ 请用户看成片 + 组件候选** |

用户没明确说通过，不往下走。

## 新建导演工程

```bash
cd <作品目录>
mkdir -p 抖音-director/{compositions/frames,assets}
cp 抖音/{SCRIPT.md,audio_meta.json,caption_groups.json,package.json,hyperframes.json,meta.json} 抖音-director/
cp -r 抖音/assets/voice 抖音-director/assets/
cp ~/.claude/skills/video-director/templates/{index.html,DIRECTOR.md} 抖音-director/
```

`package.json` 里的 `hyperframes@X.Y.Z` 改成 `video-director.config.json` 的 `hfVersion`。

`caption_groups.json` 由 `nv hf-audio` 配音时生成（同时把每帧时长写回 `抖音/STORYBOARD.md`），不用先跑 `nv hf-build`。

## 命令

| 命令 | 作用 |
|---|---|
| `vd cues <工程> [--check]` | 校验 DIRECTOR.md，把所有 @词 换算成秒数写进 `cues.js`，并打印出来；`--check` 只校验不写文件 |
| `vd qa <工程>` | 抖音专用检查：在每个 @词 落定时刻（@词 后 0.8 秒）和每段结尾截图，查出画面、安全区（顶 200 / 右 160（y 760 往下）/ 底 480）、字幕带 y 1180–1440、栏目标签被挡、`data-vd-cue` 元素看不见（✗）；每 0.5 秒比一次，2 秒不动（⚠）。被 overflow 裁掉的部分不算。结果 `qa-douyin.json`（样片构建时写 `qa-douyin-sample.json`，只查装了的段），总览 `snapshots/cues-sheet.jpg`。DIRECTOR.md 改了 @词或分段还没 `vd build` 时直接报错 |
| `vd build <工程> [--sample] [--no-music] [--update-components]` | 拼配音 + 混音效 → 安装用到的 dykit 组件 → 写 `index.html` 的 `vd:head` / `vd:audio` / `vd:segments` / `vd:brand` 四块 → 配乐取曲、重拍对位、人声避让 → `hyperframes check`。`--sample` 只装样片的段，到 `sample.end` 为止 |
| `vd check <工程>` | 校验 DIRECTOR.md + 列出组件候选 + `hyperframes check` |

`index.html` 里标记块之外的内容（背景、贯穿元素）是手写的，`vd build` 不会动。

**重新配音**：在 `抖音/` 里跑 `nv hf-audio`，然后把 `audio_meta.json`、`caption_groups.json`、`assets/voice/` 重新复制到 `抖音-director/`，再 `vd build`，所有时间自动更新。忘了复制时 `vd` 会警告「这里的 … 还是旧的」。

## 每段画面怎么写

- 从 `templates/segment.html` 复制到 `compositions/frames/<段id>.html`，把 `SEG_ID` 换成段 id。
- 时间只用 `at("词")`（相对本段开头的秒数），不写死数字；词必须在 DIRECTOR.md 里以 `@词` 出现过。
- 元素 id 加段前缀；栏目标签和字幕不要自己画（账号固定元素会画）。
- 写完在这段每个 @词 的时间点截图看一遍（`references/director-rules.md` 第 11–17 条）。

## 用 dykit 组件

dykit 组件库在 GitHub 的 `18826400652/hyperframes`（公开仓库，单独维护）。分段里写 `"component": "dy-…"` 和 `"vars": {…}` 就直接用组件，配色自动套用这条视频的 `palette`（dykit 的 custom 主题）。可用组件和变量见仓库的 `catalog/catalog.json`。

- 第一次 `vd build` 把最新提交号写进 `components.lock.json`，之后一直用这个版本，重新渲染不会变样；要用新版组件：`vd build . --update-components`
- 下载的仓库缓存在 `~/.cache/video-director/hyperframes/<提交号>/`，断网时已缓存的版本照常能用
- 配色怎么套：`palette.accent` 是荧光笔底色；组件里当文字、描边用的强调色取 `accent`、`alert`、`ink` 里第一个在底色上看得清的（对比度 ≥ 3:1）。纸面 + 荧光黄的配色下，组件强调色会是 `alert` 红——如果本片红色代表「错的」，用组件前想清楚会不会混淆
- 字体：机器块可写 `"fonts": { "title": "serif" | "sans", "body": "serif" | "sans" }`，默认标题宋体、正文黑体
- 旧工程的 `index.html` 要用组件时，在 `<script src="cues.js"></script>` 下一行加 `<!-- vd:head --><!-- /vd:head -->`

## 组件候选（让组件库越用越全）

`DIRECTOR.md` 第 8 节记录「换文字就能复用」的画面。每做完一段回来填；`vd check` 会列出来；**关卡 ④ 交成片时把候选一起交给用户**，用户决定哪些提交到 hyperframes（按 hyperframes 仓库 `dykit-storyboard` 技能的新组件流程：测试 + 5 主题对比图 + 用户确认）。
