---
name: video-director
description: >
  视频导演：已写好的口播稿 + vo 的配音 → 导演脚本 DIRECTOR.md → 按内容设计风格的 HyperFrames 视频工程（每段一个子画面，
  账号固定元素：栏目标签、字幕、结尾），带配乐重拍对位和人声避让。提供 vd 命令：vd init、vd cues、vd build [--sample] [--no-music]、vd qa（抖音专用检查）、vd render、vd verify、vd check、vd components（列组件）；不认识的子命令透传给 hyperframes。
  当用户要「按导演脚本做视频」「做抖音视频」「渲染」「验片」，或作品目录里有 DIRECTOR.md 时使用。配音用 voiceover（vo）。
---

# video-director：先写导演脚本，再做视频

**原则：风格从内容里长出来；每个动作锚定到口播里的词；账号只固定栏目标签、字幕、结尾三处。**

设计文档：`docs/superpowers/specs/2026-10-14-video-director-design.md`。导演规则：`references/director-rules.md`（叙事、节奏、版面、HyperFrames 的坑）。视觉工艺：`references/visual-craft.md`（构图、材质、色彩、字阶、动效、声音的数值规则和自检表）。

## 安装（第一次用）

```bash
ln -s <skill 目录> ~/.claude/skills/video-director
ln -s <skill 目录>/bin/vd ~/.local/bin/vd
cd <skill 目录> && npm ci                            # hyperframes、字体、GSAP、puppeteer-core 都装在 vd 自己的 node_modules（st install --deps 会装）
echo 'export NODE_USE_ENV_PROXY=1' >> ~/.bashrc       # 走代理时 Node 才能联网
curl -fsSL https://static.heygen.ai/cli/install.sh | bash   # 配乐用的 heygen CLI（先看一遍脚本）
HEYGEN_NO_BROWSER=1 heygen auth login --oauth         # 浏览器授权，走免费额度（API Key 会扣钱包）
```

项目根目录要有 `video-director.config.json`：`brandDir`（账号固定元素）、`sfxDir`（音效库）；`hfVersion` 不用写（hyperframes 装在 vd 自己的 `node_modules`，写了且不一致会报错）；选填 `fontsDir`、`gsap`（要换字体包或 GSAP 时才写，默认用 vd 自带的：`npm ci` 装的 fontsource 字体 Noto Sans SC、Noto Serif SC、JetBrains Mono 和 GSAP，`vd build` 生成进工程的 `assets/fonts/`）；选填 `craft`（视觉工艺阈值：typeFloor / typeRatio / hookFont / hookCluster / subjectMin / gapMax / variety / materialMin / scaleCv，不写就用 `references/visual-craft.md` 的默认值）。工程里的 `@hyperframes/core` 由 `vd build` 自动装。

## 流程（一期的抖音部分）

**在 kv 里**：`kv status` 按下面的步骤指引（实用类的 ③a / ③b / ④，概念科普的 ②a / ②b / ③），用户确认后：实用类 `kv gate <作品> director|sample|final "原话"`；概念科普按 knowledge-video 的「确认节点怎么记」手改 `run.json` 的 `gates.director` / `gates.sample` / `gates.final`。样片固定输出到 `renders/sample.mp4`，对比视频 `renders/compare.mp4`——这两个名字 kv 不当正式成片。

| 步骤 | 做什么 | 停下来 |
|---|---|---|
| 0 | 口播稿、配音稿确认后，`vo 抖音` 生成配音和逐字时间轴，直接写在工程里 | — |
| 1 | 工程已建好（`st new` 调 `vd init 抖音`），按 `抖音/DIRECTOR.md` 里的模板写导演脚本；`vd cues 抖音` 确认每个 @词都找得到 | **③a 请用户审 DIRECTOR.md** |
| 2 | 写样片的几段（`templates/segment.html`），贯穿元素写进 `index.html` 手写区；`vd build 抖音 --sample`；`vd qa 抖音` 无 ✗（看 `snapshots/cues-sheet.jpg`）；`vd render 抖音 --sample` 出样片（`renders/sample.mp4`） | **③b 请用户看样片** |
| 3 | 写其余各段，每写一段 `vd build 抖音 --no-music` + 截图；全部写完 `vd build 抖音` | — |
| 4 | 全片 `vd qa 抖音` 无 ✗，按总览图逐条对照 DIRECTOR.md，问题记进 `qa.json`；`vd render 抖音`；和旧版做对比视频（`renders/compare.mp4`）；`vd check` 列出组件候选 | **④ 请用户看成片 + 组件候选** |

用户没明确说通过，不往下走。

## 新建导演工程

`st new` 会跑 `vd init 抖音`，一般不用手动建。单独建（目录必须不存在或是空的，不为空时报错、不覆盖）：

```bash
vd init 抖音
```

它用 vd 自己的 hyperframes 建空工程（`init --example=blank`），放进 `index.html` 和 `DIRECTOR.md` 模板，建好 `compositions/frames/`、`assets/`。`SCRIPT.md`、`VOICE.md`、配音和 `caption_groups.json` 由 `vo 抖音` 写进同一个目录，不用复制。

## 命令

| 命令 | 作用 |
|---|---|
| `vd init <目录>` | 建空的导演工程；目录不为空时报错 |
| `vd cues <工程> [--check]` | 校验 DIRECTOR.md，把所有 @词 换算成秒数写进 `cues.js`，并打印出来；`--check` 只校验不写文件。正文里 `@词` 加不加反引号都算锚点（只有写法说明里的 `` `@词` `` 不算）；屏幕文字里的普通 @ 写成 `\@`；段 HTML（`compositions/frames/*.html`、`index.html`）里 `at("词")` 用到 DIRECTOR.md 没写的词直接报错 |
| `vd qa <工程>` | 抖音专用检查：在每个 @词 落定时刻（@词 后 0.8 秒）和每段结尾截图，查出画面、安全区（顶 200 / 右 160（y 760 往下）/ 底 480）、字幕带 y 1180–1440、栏目标签被挡、`data-vd-cue` 元素看不见（✗）；每 0.5 秒比一次，连续 2 秒只有背景、没有文字或 `data-vd-key` 元素（✗，纯图形的关键画面要加 `data-vd-key`），2 秒不动（⚠），一段里所有截图的内容都在 y 770 以上（⚠ 画面挤在上方，段尾收起来的转场不算）。被 overflow 裁掉的部分不算。视觉工艺 ⚠：主体簇、首帧字号、字阶层级、内容区空白带、材质件数、构图变化（只报 ⚠，不改 `passed`），终端打印一行"视觉工艺：…"，详细指标写进 `qa-douyin.json` 的 `craft`。结果 `qa-douyin.json`（样片构建时写 `qa-douyin-sample.json`，只查装了的段），总览 `snapshots/cues-sheet.jpg`。DIRECTOR.md 改了 @词或分段还没 `vd build` 时直接报错 |
| `vd build <工程> [--sample] [--no-music] [--update-components]` | 拼配音 + 混音效 → 安装用到的 dykit 组件 → 写 `index.html` 的 `vd:head` / `vd:audio` / `vd:segments` / `vd:brand` 四块 → 配乐取曲（说法里自动带上视频时长；vd 以前取的 `bgm.wav` 比视频短会重新取，还是短就循环补齐；自己放的 `bgm.mp3` 不替换、太短时循环成 `bgm-loop.wav`）、重拍对位、人声避让 → `hyperframes check`。`--sample` 只装样片的段，到 `sample.end` 为止 |
| `vd render <工程> [--sample]` | 渲染到 `<工程>/renders/`（`--sample` 出 `sample.mp4`），完成后自动 `vd verify` |
| `vd verify <成片.mp4> [--project <工程>]` | 成片自检：帧数、时长、声音、尺寸、黑屏 |
| `vd check <工程>` | 校验 DIRECTOR.md + 列出组件候选 + `hyperframes check` |
| `vd components <工程> [关键词]` | 列出 dykit 组件（用途、适合、时长、节拍、变量和默认值），关键词按名字、用途、适合场景筛 |
| `vd <其他子命令> …` | 不认识的子命令透传给 hyperframes：`vd lint`、`vd preview`、`vd snapshot`、`vd doctor` 等 |

`index.html` 里标记块之外的内容（背景、贯穿元素）是手写的，`vd build` 不会动。

**重新配音**：跑 `vo 抖音`（直接写进工程），再 `vd build 抖音`，所有时间自动更新。重配会让 kv 的 ③a 失效，要请用户重新确认。工程里缺 `audio_meta.json` 或 `caption_groups.json` 时 `vd` 报错，提示先跑 `vo`。

## 每段画面怎么写

- 从 `templates/segment.html` 复制到 `compositions/frames/<段id>.html`，把 `SEG_ID` 换成段 id。
- 时间只用 `at("词")`（相对本段开头的秒数），不写死数字；词必须在 DIRECTOR.md 里以 `@词` 出现过。
- 元素 id 加段前缀；栏目标签和字幕不要自己画（账号固定元素会画）。
- 写完在这段每个 @词 的时间点截图看一遍（`references/director-rules.md` 第 11–17 条）。
- 按 `references/visual-craft.md` 的 6 层定数值：首帧字号 ≥96px、主体簇 ≥35%、段内 max/主体 ≥1.6、内容区最大空白带 ≤250px、材质 ≥2 件；写完对照第 7 节自检表。

## 用 dykit 组件

dykit 组件库在 GitHub 的 `18826400652/hyperframes`（公开仓库，单独维护）。分段里写 `"component": "dy-…"` 和 `"vars": {…}` 就直接用组件，配色自动套用这条视频的 `palette`（dykit 的 custom 主题）。挑组件用 `vd components <工程> [关键词]`：列出每个组件的用途、适合的口播、最短时长、节拍和变量（含默认值），按工程锁定的版本读，不用去缓存里翻 `catalog/catalog.json`。

- **组件不压字幕**：组件段的宿主带 `--hf-safe-bottom:1150px`，dykit 组件（hyperframes 1bf47fc 之后）内容底边停在字幕带上方；旧工程锁着更早的组件版本，`vd build --update-components` 升级
- **组件跟着口播走**：组件按段长排时间（`HF.duration`），演完停在最后的样子，到段尾才退场。catalog 里写了 `beats` 的组件有可选变量 `cues`：用 `|` 隔开几个 @词，按顺序对应它的几拍（如清单 `"cues": "@条数|@数字|@补的话"` 是三项各自出现的时间），`vd build` 换算成段内秒数交给组件；不写 `cues` 就按默认节奏铺满整段。每个 @词 要落在这一段里，不然报错。`dy-rec-phone` 的 `cues` 是它自己的 JSON 列表（每项带 `t`），不按这个规则
- **录屏比段短**：`dy-rec-phone` 的录屏放完停在最后一帧（通常就是 AI 的完整回答）；`vd build` 发现录屏比段短 0.5 秒以上会打 ⚠，说清停住几秒。要画面一直在动，就换长一点的录屏或把这段拆短
- **不要用 `dy-ai-badge`**：它模仿抖音自带的 AI 标识，固定在左上角，正好压住栏目标签（栏目标签全片都在，关不掉），`vd build` 的检查会报文字重叠
- **旧版组件**：`components.lock.json` 锁的还是 2026-10 之前的组件库时，组件时间是写死的；放进比 `minDuration + 2` 秒还长的段，`vd build` 直接报错——`vd build . --update-components` 换成新版
- 第一次 `vd build` 把最新提交号写进 `components.lock.json`，之后一直用这个版本，重新渲染不会变样；要用新版组件：`vd build . --update-components`
- 下载的仓库缓存在 `~/.cache/video-director/hyperframes/<提交号>/`，断网时已缓存的版本照常能用
- 配色怎么套：`palette.accent` 是荧光笔底色；组件里当文字、描边用的强调色取 `accent`、`alert`、`ink` 里第一个在底色上看得清的（对比度 ≥ 3:1）。纸面 + 荧光黄的配色下，组件强调色会是 `alert` 红——如果本片红色代表「错的」，用组件前想清楚会不会混淆
- 字体：机器块可写 `"fonts": { "title": "serif" | "sans", "body": "serif" | "sans" }`，默认标题宋体、正文黑体
- 旧工程的 `index.html` 要用组件时，在 `<script src="cues.js"></script>` 下一行加 `<!-- vd:head --><!-- /vd:head -->`

## 组件候选（让组件库越用越全）

`DIRECTOR.md` 第 8 节记录「换文字就能复用」的画面。每做完一段回来填；`vd check` 会列出来；**关卡 ④ 交成片时把候选一起交给用户**，用户决定哪些提交到 hyperframes（按 hyperframes 仓库 `dykit-storyboard` 技能的新组件流程：测试 + 5 主题对比图 + 用户确认）。
