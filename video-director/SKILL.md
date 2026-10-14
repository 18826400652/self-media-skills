---
name: video-director
description: >
  视频导演：已写好的口播稿 + nv hf-audio 的配音 → 导演脚本 DIRECTOR.md → 按内容设计风格的 HyperFrames 视频工程（每段一个子画面，
  账号固定元素：栏目标签、字幕、结尾），带配乐重拍对位和人声避让。提供 vd 命令：vd cues、vd build [--sample] [--no-music]、vd check。
  当用户要「按导演脚本做视频」、brief.md 里 video: director，或作品目录里有 DIRECTOR.md 时使用。配音用 narrated-video，渲染用 nv render。
---

# video-director：先写导演脚本，再做视频

**原则：风格从内容里长出来；每个动作锚定到口播里的词；账号只固定栏目标签、字幕、结尾三处。**

设计文档：`docs/superpowers/specs/2026-10-14-video-director-design.md`。导演规则：`references/director-rules.md`（写脚本、做画面时逐条对照）。

## 安装（第一次用）

```bash
ln -s <skill 目录> ~/.claude/skills/video-director
ln -s <skill 目录>/bin/vd ~/.local/bin/vd
echo 'export NODE_USE_ENV_PROXY=1' >> ~/.bashrc       # 走代理时 Node 才能联网
curl -fsSL https://static.heygen.ai/cli/install.sh | bash   # 配乐用的 heygen CLI（先看一遍脚本）
HEYGEN_NO_BROWSER=1 heygen auth login --oauth         # 浏览器授权，走免费额度（API Key 会扣钱包）
```

项目根目录要有 `video-director.config.json`：`fontsDir`（字体包）、`brandDir`（账号固定元素）、`sfxDir`（音效库）、`hfVersion`（HyperFrames 版本）。工程里的 `@hyperframes/core` 由 `vd build` 自动装。

## 流程（一期的抖音部分）

| 步骤 | 做什么 | 停下来 |
|---|---|---|
| 0 | 口播稿、配音稿确认后，`nv hf-audio <抖音工程>` 生成配音和逐字时间轴 | — |
| 1 | 新建导演工程（下面的命令），按 `templates/DIRECTOR.md` 写导演脚本；`vd cues .` 确认每个 @词都找得到 | **③a 请用户审 DIRECTOR.md** |
| 2 | 写样片的几段（`templates/segment.html`），贯穿元素写进 `index.html` 手写区；`vd build . --sample`；在每个 @词 截图检查；`npx hyperframes render` 出样片 | **③b 请用户看样片** |
| 3 | 写其余各段，每写一段 `vd build . --no-music` + 截图；全部写完 `vd build .` | — |
| 4 | 全片在每个 @词 截图检查，问题记进 `qa.json`；`nv render <工程>`；和旧版做对比视频 | **④ 请用户看成片** |

用户没明确说通过，不往下走。

## 新建导演工程

```bash
cd 04-作品/<系列>/<期>
mkdir -p 抖音-director/{compositions/frames,assets}
cp 抖音/{SCRIPT.md,audio_meta.json,caption_groups.json,package.json,hyperframes.json,meta.json} 抖音-director/
cp -r 抖音/assets/voice 抖音-director/assets/
cp ~/.claude/skills/video-director/templates/{index.html,DIRECTOR.md} 抖音-director/
```

`package.json` 里的 `hyperframes@X.Y.Z` 改成 `video-director.config.json` 的 `hfVersion`。

## 命令

| 命令 | 作用 |
|---|---|
| `vd cues <工程>` | 校验 DIRECTOR.md，把所有 @词 换算成秒数写进 `cues.js`，并打印出来 |
| `vd build <工程> [--sample] [--no-music]` | 拼配音 + 混音效 → 写 `index.html` 的 `vd:audio` / `vd:segments` / `vd:brand` 三块 → 配乐取曲、重拍对位、人声避让 → `hyperframes check`。`--sample` 只装样片的段，到 `sample.end` 为止 |
| `vd check <工程>` | 校验 DIRECTOR.md + `hyperframes check` |

`index.html` 里标记块之外的内容（背景、贯穿元素）是手写的，`vd build` 不会动。

**重新配音**：在 `抖音/` 里跑 `nv hf-audio`，然后把 `audio_meta.json`、`caption_groups.json`、`assets/voice/` 重新复制到 `抖音-director/`，再 `vd build`，所有时间自动更新。忘了复制时 `vd` 会警告「这里的 … 还是旧的」。

## 每段画面怎么写

- 从 `templates/segment.html` 复制到 `compositions/frames/<段id>.html`，把 `SEG_ID` 换成段 id。
- 时间只用 `at("词")`（相对本段开头的秒数），不写死数字；词必须在 DIRECTOR.md 里以 `@词` 出现过。
- 元素 id 加段前缀；栏目标签和字幕不要自己画（账号固定元素会画）。
- 写完在这段每个 @词 的时间点截图看一遍（`references/director-rules.md` 第 11–17 条）。
