# 环境搭建

需要 Node.js 22 以上和 FFmpeg。

## 密钥

各服务商的密钥放环境变量，或项目根目录的 `.env`（不入 git）。例如 qwenaudio、cosyvoice 用 `DASHSCOPE_API_KEY`。

## 参考音色（seedaudio、qwenaudio）

配音的音色和说话方式会向参考音频靠拢。`st doctor` 报 `tts.reference` 不存在时按下面准备：

- **录什么**：你自己（或授权的配音人）平时说话的样子，最好就是一段口播；一个人、无背景音乐、无回声，开头结尾别留长静音。语气要和你希望成片的语气一致——录得一本正经，配出来也一本正经
- **多长、多大**：30 秒以内、10MB 以内（两家接口的上限，tts/seedaudio.mjs、tts/qwenaudio.mjs）；10–20 秒的干净人声就够
- **格式**：wav 或 mp3（qwenaudio 还认 ogg / opus）；手机录的 m4a 先转：`ffmpeg -i 录音.m4a -ac 1 -ar 24000 参考音色.wav`
- **放哪**：默认 `06-品牌资产/参考音色.wav`；放别处就改 `voiceover.config.json` 的 `tts.reference`（相对项目根目录）
- **换了参考音频**：配音缓存按参考音频的内容算，换了录音（哪怕文件名不变）会重新配；只是挪了位置、内容没变的照样命中
- 不想用参考音频：seedaudio 可以改填 `tts.voice`（音色 ID，二选一）；qwenaudio 只支持参考音频；都不写就完全按 `tts.style` 的描述生成音色

## cosyvoice（可选）

只有 `tts.provider` 是 `cosyvoice` 时才要：

    cd <工具包>/voiceover && uv venv .venv && uv pip install --python .venv/bin/python dashscope

`st install --deps` 会自动装。qwenaudio、seedaudio、volcengine 不需要 Python。
