"""落定后还动不动：比较每帧「落定前 0.7 秒」和「落定」两张截图（nv hf-build --motion 截的）。

用法：python stillness.py <帧1落定前.png> <帧1落定.png> [<帧2落定前.png> <帧2落定.png> ...]
只看内容区（x 60–1020，y 310–1150：角标以下、字幕带以上，和 occupancy.py 一致），
字幕逐字变色不算「在动」。
校准（RAG 那期，glow）：缓推 1.5～14，圈词笔迹抖动 0.66，只有光晕呼吸 0.09～0.24，完全静止 0。门槛 0.3 在 hf-build.mjs。每对输出一行 JSON：{"frame": 第几帧, "diff": 平均像素差（灰度 0–255）}。
"""

import json
import sys

import numpy as np
from PIL import Image

ZONE = (60, 310, 1020, 1150)  # 左 上 右 下（1080×1920 竖屏）


def gray(path):
    img = Image.open(path).convert("L")
    if img.size != (1080, 1920):
        img = img.resize((1080, 1920))
    return np.asarray(img.crop(ZONE), dtype=np.float32)


def main(paths):
    if len(paths) % 2:
        sys.exit("截图要成对传入（落定前、落定）")
    for i in range(0, len(paths), 2):
        diff = float(np.abs(gray(paths[i]) - gray(paths[i + 1])).mean())
        print(json.dumps({"frame": i // 2 + 1, "diff": round(diff, 3)}))


if __name__ == "__main__":
    main(sys.argv[1:])
