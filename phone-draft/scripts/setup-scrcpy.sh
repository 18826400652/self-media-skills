#!/usr/bin/env bash
# 下载 scrcpy 官方 Linux 便携版到 skills/phone-draft/vendor/（pd rec 录屏用；不入库）
set -euo pipefail
VERSION=v5.0.1
DIR="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)/vendor"
NAME="scrcpy-linux-x86_64-$VERSION"
if [[ -x "$DIR/$NAME/scrcpy" ]]; then echo "✓ 已安装 $DIR/$NAME"; exit 0; fi
mkdir -p "$DIR"
PROXY=${https_proxy:-${http_proxy:-}}
PART="$DIR/$NAME.tar.gz.part"
# 断点续传 + 重试：国内网络下载 GitHub 常常中途断
curl -fL ${PROXY:+-x "$PROXY"} -C - --retry 10 --retry-all-errors --retry-delay 3 --speed-limit 1000 --speed-time 60 \
  -o "$PART" "https://github.com/Genymobile/scrcpy/releases/download/$VERSION/$NAME.tar.gz"
tar xzf "$PART" -C "$DIR" && rm "$PART"
echo "✓ 已安装 $DIR/$NAME"
