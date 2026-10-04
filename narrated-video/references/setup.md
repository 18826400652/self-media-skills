# 环境搭建与排坑

需要 Node.js 22 以上、FFmpeg、Python（用 uv 管理）。

## 安装

```bash
cd <skill 目录>
npm install                            # HyperFrames（锁定 0.8.119）+ yauzl
bin/nv browser ensure                  # 下载渲染用的 chrome-headless-shell

# TTS：edge（微软音色，需联网）+ Kokoro（本地离线）
uv venv .venv && VIRTUAL_ENV=.venv uv pip install dashscope edge-tts kokoro-onnx soundfile

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
