---
name: voiceover
description: >
  口播稿配音：工程里的 SCRIPT.md（+ 配音导演稿 VOICE.md）→ 每帧一段配音 assets/voice/NN.wav、逐字时间 audio_meta.json、字幕分组 caption_groups.json。
  提供 vo 命令：vo <工程> [--check] [--pause 秒] [--voice x] [--speed x] [--provider x] [--model x]。
  当用户要「配音」「给口播稿配音」「重配」「换个音色 / 服务商」、写配音导演稿 VOICE.md，或项目里有 voiceover.config.json 时使用。
  只管配音，不管画面和渲染：写导演脚本、组装、渲染交给 video-director（vd）。
---

# voiceover：口播稿 → 配音 + 逐字时间

**原则：先配音，再做画面。画面的时间全部从配音的逐字时间里取，不手写秒数。**

## 什么时候用

- 一期作品第 7 步写完 `抖音/SCRIPT.md`、`抖音/VOICE.md`，用户确认 ② 之后，第 8 步配音
- 改了口播、换了音色或服务商，要重配
- 要写或改配音导演稿 `VOICE.md`

不管：画面、导演脚本、渲染（`vd`）；实测录屏（`sc rec`）；存草稿（`vdraft`）。

## 安装（第一次用）

```bash
ln -s <skill 目录> ~/.claude/skills/voiceover
ln -s <skill 目录>/bin/vo ~/.local/bin/vo
```

需要 Node.js 22+ 和 FFmpeg。密钥、参考音色、cosyvoice 的 Python 环境见 `references/setup.md`（`st install --deps` 会装 cosyvoice 用的环境）。

## 开跑前先确认

用户只说「配个音」「重配」时，不直接开跑，先问清三件事：

1. 哪个工程目录（一期作品里是 `抖音/`）
2. `SCRIPT.md` 写好没有；`VOICE.md` 有没有——没有也能配，但服务商支持导演稿时语气会平，问用户要不要先写
3. 是第一次配，还是重配（重配见下面「重新配音会让 ③a 失效」）

## 命令

```bash
vo 抖音 --check        # 只检查 VOICE.md 和 SCRIPT.md 对不对得上，不生成、不花钱
vo 抖音                # 配音
vo 抖音 --pause 0.4    # 段与段之间多停 0.4 秒（只在有 VOICE.md、按段整段生成时有用）
```

| 参数 | 作用 |
|---|---|
| `--check` | 只检查，不生成 |
| `--pause 秒` | 段与段之间的停顿 |
| `--voice` / `--speed` / `--provider` / `--model` | 临时覆盖 `voiceover.config.json` 的 `tts` 同名字段 |

**先 `--check`，再配音**：`--check` 不花钱；配音按次付费，对不上就开跑会白花钱。有 `VOICE.md` 时，配音导演稿给用户看过、确认后再配。

## 写出什么

都在工程目录里（`抖音/`），格式见 `README.md`「文件接口」：

- `assets/voice/NN.wav`：每帧一段配音
- `audio_meta.json`：每帧的词和字时间（帧内秒数），重点词以 `*` 开头
- `caption_groups.json`：字幕分组（全片秒数），vd 的字幕组件读它

vo 不碰 `DIRECTOR.md`、`index.html` 等 vd 的文件；配音直接写在工程里，不用复制到别处。

**配完之后**：下一步是 `vd` 的事——按 `audio_meta.json` 写导演脚本 `DIRECTOR.md`，`vd cues 抖音 --check` 通过后请用户确认 ③a。用户让 vo「顺便渲染」时说明：渲染是 `vd render 抖音`，要等导演脚本、样片都确认后。

## 输入怎么写

- `SCRIPT.md`：`## 段名 (Frame N)` 开一帧，缩进 4 格的是口播原文；可选 `**Emotion:** 惊讶`、`**重点词:** 八秒钟、一下午`。每句 ≤ 28 字、数字写汉字（口播稿怎么写见 content-repurpose 的 `references/douyin.md`）
- `VOICE.md`（可选）：配音导演稿。服务商支持（seedaudio、qwenaudio）时按段整段生成再切回每帧，语气更像真人；规则和格式见 `references/voice-direction.md`。没有 `VOICE.md` 或服务商不支持，按逐帧配音，语气会平一些

## 服务商和配置

项目根目录 `voiceover.config.json` 的 `tts`：`provider`、`reference`（参考音色，相对项目根）、`style`（嗓音和场合描述）、`speed`、`voice`。找不到配置文件时：在作品项目里（往上能找到 `studio.json`）**拒绝配音**，提示把 `tts` 搬进 `voiceover.config.json`（免得用默认音色付费配错声音；`--check` 照常可用）；不在作品项目里才用默认值（qwenaudio，倍速 1.0），并打一行 ⚠。

可选服务商：`cosyvoice`、`qwenaudio`（默认）、`seedaudio`、`volcengine`。**kokoro、edge 已删除**：它们不给逐字时间，字幕和重点词对不上。用户要用它们时说明原因，让用户在上面四个里选。

不克隆音色：`tts.reference` 是让配音向参考音频靠拢，怎么录见 `references/setup.md`。

## 缓存

配音按台词、导演稿、TTS 设置算缓存键，缓存在 `<项目根>/.media/voice-cache/`（项目根 = 有 `voiceover.config.json` 的目录），各期共用：别期用过的台词、没改过的句子不会重复付费。找不到配置文件时缓存放在工程目录下。

## 重新配音会让 ③a 失效

`audio_meta.json` 是 kv ③a（导演脚本）的确认指纹之一。重配后它变了，`kv status` 会说 ③a 确认后改过，要请用户重新确认；之后 `vd cues <工程> --check`、`vd build` 会按新的时间自动更新所有 @词的秒数。已有样片和成片也跟着旧了，要重新渲染。

## 出错时

- 找不到 `SCRIPT.md`：确认工程目录对不对
- `VOICE.md 和 SCRIPT.md 对不上`：报错会逐条列出，改 `VOICE.md` 里的台词跟 `SCRIPT.md` 一致
- `--pause` 不是数字：写秒数，如 `0.4`
- 缺密钥：看 `references/setup.md`，密钥放环境变量或项目根 `.env`，由用户自己填
