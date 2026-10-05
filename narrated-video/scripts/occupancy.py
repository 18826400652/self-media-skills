"""测量每帧主体内容铺开了多少（借鉴 nutllwhy/hyperframes-motion-library 的「真实内容铺开检查」）。

用法：python occupancy.py <竖屏截图.png> [...]
在内容区（x 60–1020，y 310–1150：角标以下、字幕带以上）里，找出和背景色不同的像素，
取它们的外接框，输出外接框占内容区的面积比和横向 / 纵向跨度（每张图一行 JSON）。
背景色取内容区左下角附近的颜色，所以整屏强调色（黄底）的帧也能测。
只测静态截图：用每帧「落定」时刻的截图。
"""

import json
import sys

from PIL import Image

ZONE = (60, 310, 1020, 1150)  # 左 上 右 下（1080×1920 竖屏）
DIFF = 48  # 和背景色的 RGB 差值总和超过这个才算内容
DENSITY = 0.004  # 一行 / 一列里内容像素占比超过它才算「有内容」，过滤噪点和细线


def measure(path):
    img = Image.open(path).convert("RGB")
    if img.size != (1080, 1920):
        img = img.resize((1080, 1920))
    x0, y0, x1, y1 = ZONE
    crop = img.crop(ZONE)
    w, h = crop.size
    bg = crop.getpixel((8, h - 8))
    px = crop.load()
    cols = [0] * w
    rows = [0] * h
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            r, g, b = px[x, y]
            if abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2]) > DIFF:
                cols[x] += 1
                rows[y] += 1
    col_on = [i for i, c in enumerate(cols) if c > DENSITY * h / 2]
    row_on = [i for i, c in enumerate(rows) if c > DENSITY * w / 2]
    if not col_on or not row_on:
        return {"file": path, "occupancy": 0, "spanX": 0, "spanY": 0}
    span_x = (col_on[-1] - col_on[0]) / w
    span_y = (row_on[-1] - row_on[0]) / h
    return {"file": path, "occupancy": round(span_x * span_y, 3), "spanX": round(span_x, 3), "spanY": round(span_y, 3)}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__, file=sys.stderr)
        sys.exit(2)
    for p in sys.argv[1:]:
        print(json.dumps(measure(p), ensure_ascii=False))
