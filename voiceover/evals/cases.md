# voiceover 评估用例

格式：输入 → 期望特征。逐条假装收到输入、只读 SKILL.md，对照期望特征。

## 1. 典型：给 抖音/ 配音

- 输入：「SCRIPT.md 和 VOICE.md 写好了，给 抖音/ 配音」
- 期望：
  - 先跑 `vo 抖音 --check`（不花钱），通过后才跑 `vo 抖音`
  - 说明会写出三样东西：`assets/voice/NN.wav`、`audio_meta.json`、`caption_groups.json`
  - 不碰 `DIRECTOR.md`、`index.html`（那是 vd 的事）
  - 不把配音复制到别的目录（直接写在工程里）

## 2. 模糊：配个音

- 输入：「配个音」
- 期望：
  - 不直接开跑
  - 先问是哪个工程目录（一期作品里一般是 `抖音/`），并确认 `SCRIPT.md`、`VOICE.md` 写好了没有
  - 提一句 `--check` 不花钱，可以先查

## 3. 极简：重配

- 输入：「重配」
- 期望：
  - 提醒重新配音会改 `audio_meta.json`，kv 的 ③a（导演脚本）会因此失效，要请用户重新确认
  - 提醒缓存：台词、导演稿、音色设置都没变的句子命中缓存，不重复花钱；改过的句子才重新生成
  - 要重配的工程目录没说清就问

## 4. 矛盾：用 kokoro 配音

- 输入：「用 kokoro 配音，免费的」
- 期望：
  - 说明 kokoro（和 edge）已经删了：它们不给逐字时间，字幕和重点词对不上
  - 列出现在可选的服务商：cosyvoice、qwenaudio（默认）、seedaudio、volcengine
  - 不自己改回去、不绕开；让用户选一个，改 `voiceover.config.json` 的 `tts.provider` 或临时 `--provider`

## 5. 超出能力：顺便把视频渲染出来

- 输入：「配完音顺便把视频渲染出来」
- 期望：
  - 说明渲染是 `vd render 抖音`，不是 vo 的事；vo 只管配音、逐字时间和字幕分组
  - 配音做完后告诉用户下一步是写 `DIRECTOR.md`（`vd cues 抖音 --check`），而不是直接渲染

## 6. 缺文件：只有 SCRIPT.md，没有 VOICE.md

- 输入：「给 抖音/ 配音」，但工程里只有 SCRIPT.md
- 期望：
  - 说明没有 `VOICE.md` 也能配，但服务商支持导演稿（seedaudio、qwenaudio）时语气会平，问用户要不要先写
  - 要写时指向 `references/voice-direction.md`

## 7. 超出能力：克隆我的声音

- 输入：「帮我克隆我的声音」
- 期望：
  - 说明 vo 不克隆音色：用参考音频（`tts.reference`）让配音靠拢，怎么录见 `references/setup.md`
  - 不编造做不到的功能
