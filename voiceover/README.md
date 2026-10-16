# voiceover

口播稿配音：工程里的 `SCRIPT.md`（+ 可选的配音导演稿 `VOICE.md`）→ 每帧一段配音、逐字时间、字幕分组。命令 `vo`。

不依赖 HyperFrames，也不依赖其他 skill；下游（video-director 等）只通过下面的三个文件读它的结果。

## 用法

```bash
vo <工程目录> --check                      # 只检查 VOICE.md 和 SCRIPT.md 对不对得上，不生成、不花钱
vo <工程目录> [--pause 秒] [--voice x] [--speed x] [--provider x] [--model x]
```

示例（一期作品里工程目录是 `抖音/`）：

```bash
vo 抖音 --check && vo 抖音
```

## 输入

工程目录里的：

- `SCRIPT.md`：`## 段名 (Frame N)` 开一帧；缩进 4 格的行是口播原文；可选 `**Emotion:** 惊讶`、`**重点词:** 八秒钟、一下午`
- `VOICE.md`（可选）：配音导演稿，写法见 `references/voice-direction.md`

配置：从工程目录往上找 `voiceover.config.json`，只读 `tts` 字段（`provider`、`reference`、`style`、`speed`、`voice`）；找不到用默认值（qwenaudio，倍速 1.0）。

## 文件接口

vo 写进工程目录、下游只读的三样东西：

### `assets/voice/NN.wav`

每帧一段配音。`NN` 从 `01` 开始，两位数。首尾静音已切；最后一帧结尾留 0.8 秒空白。

### `audio_meta.json`

```json
{
  "bgm": null,
  "bgm_pending": false,
  "voices": [
    {
      "frame": 1,
      "path": "assets/voice/01.wav",
      "duration_s": 6.52,
      "words": [{ "id": "w0", "text": "*八秒钟", "start": 0.12, "end": 0.74 }],
      "chars": [{ "text": "八", "start": 0.12, "end": 0.3 }]
    }
  ],
  "sfx": []
}
```

- `voices[]`：每帧一项。`frame` 是帧号，`path` 是 wav 相对工程的路径，`duration_s` 是这一帧的时长（秒）
- `words[]`：按分句切开的词级时间（`id` 形如 `w0`），分句末尾的标点转成英文标点（`，` → `,`、`。` → `.`），字幕分组据此收组；`chars[]`：字级时间。**时间都是帧内秒数**（从这一帧的 wav 开头算）
- 重点词（`SCRIPT.md` 的 `**重点词:**`）的 `text` 以 `*` 开头，字幕据此高亮，显示时去掉
- `bgm`、`bgm_pending`：vo 固定写 `null`、`false`，由 vd 配乐时使用
- `sfx`：vo 重配时保留文件里原有的 `sfx`，不清空

### `caption_groups.json`

```json
{
  "total_duration_s": 52.3,
  "width": 1080,
  "height": 1920,
  "groups": [
    {
      "id": "caption-group-0", "frame": 1, "start": 0.04, "end": 1.36, "text": "同一篇公众号,",
      "words": [{ "id": "caption-word-0-0", "text": "同一篇公众号,", "start": 0.04, "end": 1.32 }]
    }
  ]
}
```

- **时间是全片秒数**（帧内时间 + 这一帧在全片的开始时间；前面各帧 `duration_s` 之和）
- 分组规则：去掉空词和只有标点的词，按开始时间排序；换帧、和上一个词之间静音超过 0.18 秒、或达到字数上限（往后 1 秒内的词数 > 3.5 取 2，> 2.5 取 3，否则 4）时开新组；词以 `.?!,;:—` 结尾时收组
- 每组结束时间 = 最后一个词的结束时间 + 0.12 秒，但不超过下一组的开始时间；`text` 用空格连接各词，重点词的 `*` 保留
- `total_duration_s` = 各帧 `duration_s` 之和；`width`/`height` 固定 1080×1920

## 缓存

缓存键里有台词、导演稿和 TTS 设置，和哪一期无关。放在 `<项目根>/.media/voice-cache/`（项目根 = 有 `voiceover.config.json` 的目录），各期共用；没有配置文件时放工程目录下。

## 服务商

`cosyvoice`、`qwenaudio`（默认）、`seedaudio`、`volcengine`。都要给逐字时间。kokoro、edge 不给逐字时间，已删除。密钥、参考音色、cosyvoice 的 Python 环境见 `references/setup.md`。

## 测试

```bash
cd voiceover && node --test tests/*.test.mjs
```

## 依赖

Node.js 22+、FFmpeg；cosyvoice 另需 Python（`uv venv .venv && uv pip install --python .venv/bin/python dashscope`）。各服务商的接口和密钥自备。

## 来源与许可证

- 配音、对齐、缓存等代码由本仓库早先的配音讲解视频 skill（已删除）拆分而来，随仓库许可证
- `scripts/lib/caption-groups.mjs` 的分组规则移植自 HyperFrames（https://github.com/heygen-com/hyperframes）faceless-explainer skill 的 `scripts/captions.mjs`（hyperframes 0.8.143），许可证 Apache-2.0，版权归原作者；改动：帧开始时间改用 `audio_meta.json` 各帧 `duration_s` 累加，只算分组，不生成字幕 HTML
