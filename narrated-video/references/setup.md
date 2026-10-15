# 环境搭建与排坑

需要 Node.js 22 以上、FFmpeg、Python（用 uv 管理）。

## 安装

```bash
cd <skill 目录>
npm install                            # HyperFrames（锁定 0.8.119）+ yauzl
bin/nv browser ensure                  # 下载渲染用的 chrome-headless-shell

# TTS：edge（微软音色，需联网）+ Kokoro（本地离线）；fonttools + brotli 用于中文字体子集（nv hf-fonts）；
# pillow 用于截图的「内容铺开」检查（nv hf-build --snap）
uv venv .venv && VIRTUAL_ENV=.venv uv pip install dashscope edge-tts kokoro-onnx soundfile fonttools brotli pillow

# 让 nv 全局可用，并注册给 Claude Code
ln -s "$PWD/bin/nv" ~/.local/bin/nv
ln -s "$PWD" ~/.claude/skills/narrated-video

nv doctor
```

## 系统依赖：Chrome 运行库 + 中文字体

有 sudo：

```bash
sudo apt install -y libnss3 fonts-noto-cjk
```

没有 sudo 时，下载 deb 包，解压到用户目录。`bin/nv` 会自动把 `~/.local/lib/chrome-deps` 加进 `LD_LIBRARY_PATH`：

```bash
apt-get download --print-uris libnss3 libnspr4 fonts-noto-cjk   # 拿到包地址
# 国内把 archive.ubuntu.com 换成 mirrors.aliyun.com，速度差上百倍；下载后核对 SHA512
dpkg -x <包>.deb <解压目录>
# libnss3、libnspr4 的 usr/lib/x86_64-linux-gnu/*  → ~/.local/lib/chrome-deps/
# fonts-noto-cjk 的 NotoSansCJK-*.ttc           → ~/.local/share/fonts/，再运行 fc-cache -f
```

检查 Chrome 是否还缺库：

```bash
LD_LIBRARY_PATH=~/.local/lib/chrome-deps ldd ~/.cache/hyperframes/chrome/*/linux-*/*/chrome-headless-shell | grep "not found"
```

## 参考音色（seedaudio、qwenaudio）

配音的音色和说话方式会向参考音频靠拢。`st doctor` 报 `tts.reference` 不存在时按下面准备：

- **录什么**：你自己（或授权的配音人）平时说话的样子，最好就是一段口播；一个人、无背景音乐、无回声，开头结尾别留长静音。语气要和你希望成片的语气一致——录得一本正经，配出来也一本正经
- **多长、多大**：30 秒以内、10MB 以内（两家接口的上限，tts/seedaudio.mjs、tts/qwenaudio.mjs）；10–20 秒的干净人声就够
- **格式**：wav 或 mp3（qwenaudio 还认 ogg / opus）；手机录的 m4a 先转：`ffmpeg -i 录音.m4a -ac 1 -ar 24000 参考音色.wav`
- **放哪**：默认 `06-品牌资产/参考音色.wav`；放别处就改 `narrated-video.config.json` 的 `tts.reference`（相对项目根目录）
- **换了参考音频**：配音缓存认的是路径不是内容，换文件不换名字时旧缓存还会命中——删掉项目根目录的 `.media/voice-cache/` 再配
- 不想用参考音频：seedaudio 可以改填 `tts.voice`（音色 ID，二选一）；qwenaudio 只支持参考音频；都不写就完全按 `tts.style` 的描述生成音色

## 录屏（nv rec）连接浏览器

推荐给自动化单独开一个浏览器用户，用固定调试端口启动（**不会弹「允许远程调试」**，也碰不到日常浏览的标签页）：

```
msedge.exe --remote-debugging-port=9333 --user-data-dir="C:\Users\<你>\EdgeAutomation" --no-first-run
```

做成桌面快捷方式，第一次打开时在里面登录要录的 AI 产品。项目配置：

```json
"rec": { "cdpPort": 9333, "theme": "dark", "hide": "<要隐藏的元素 CSS>" }
```

- `cdpPort`：从 `http://127.0.0.1:<端口>/json/version` 取连接地址（WSL 需 mirrored 网络模式）
- `theme`：录屏时模拟系统深色 / 浅色，让不同浏览器用户录出来的样子一致
- 备选：在日常浏览器的 `edge://inspect/#remote-debugging` 勾选远程调试，配置 `rec.devtoolsActivePort`（DevToolsActivePort 文件路径）。缺点是每次新连接都要在浏览器里点「允许」，而且页面内跳转会让连接断开

## 常见问题

| 现象 | 原因与解决 |
|---|---|
| doctor 提示 `Archive extractor Not found` | 系统没有 unzip。本 skill 已依赖 `yauzl` 作为替代，执行 `npm install` 即可 |
| snap 版 Chromium 超时 | 不要用系统 Chromium，用 `nv browser ensure` 下载 HyperFrames 管理的 Chrome |
| `libnspr4.so: cannot open shared object file` | 缺 Chrome 运行库，见上文 |
| 中文显示成方块 | 缺中文字体，见上文 |
| `tts` 报 `Download timed out after 30000ms` | Kokoro 模型约 310MB，自带下载只等 30 秒。手动下载到缓存目录（见下） |
| 渲染输出跑到当前目录 | 用 `nv render`，不要直接用 `hyperframes render` |
| 渲染提示 `BeginFrame did not run` | WSL 软件渲染的提示，不影响结果 |

Kokoro 模型手动下载：

```bash
mkdir -p ~/.cache/hyperframes/tts/{models,voices}
curl -L -o ~/.cache/hyperframes/tts/models/kokoro-v1.0.onnx \
  https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
curl -L -o ~/.cache/hyperframes/tts/voices/voices-v1.0.bin \
  https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
```

## 升级 HyperFrames

版本锁定是为了让旧视频能按原样重新渲染。升级时先改 `package.json` 里的版本号并运行 `npm install`，再用 `examples/流程测试` 跑一遍 `nv voice` → `nv check` → `nv render`，确认渲染结果正常。
