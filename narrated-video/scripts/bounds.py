"""越框检查：在「干净画面」里找伸出 glow 四角框的内容（nv hf-build 调用）。

干净画面：nv hf-build 截图前隐藏了底色、光晕、四角框、角标、进度条和字幕，底是纯黑，剩下的全是内容。
框住内容区的是 y 200–1160（x 40–1040），字幕从 1180 起；角标在 y 250 左右那一行。
检查三块（1080×1920 竖屏）：
- bottom：框下沿以下（y ≥ 1166，留 6px 给发光边）
- side：左右框外（x < 34 或 x ≥ 1046，y 200–1160）
- kicker：角标那一行（y 236–300），只查显示角标的帧
很暗的玻璃面板也要算内容，所以阈值很低（任一通道 > 12）。

用法：标准输入给 JSON 数组 [{file, frame, kicker}]，输出有问题的帧 [{file, frame, zones:[{zone, box:[x0,y0,x1,y1]}]}]。
"""

import json
import sys

from PIL import Image

ZONES = [
    ("bottom", [(0, 1166, 1080, 1920)]),
    ("side", [(0, 200, 34, 1160), (1046, 200, 1080, 1160)]),
    ("kicker", [(0, 236, 1080, 300)]),
]
LEVEL = 12  # 黑底上任一通道超过它就算内容
MIN_HITS = 40  # 抽样（隔 2 像素）命中多少个才算越界，过滤零星噪点
STEP = 2


def hits(px, box):
    x0, y0, x1, y1 = box
    return [(x, y) for y in range(y0, y1, STEP) for x in range(x0, x1, STEP) if max(px[x, y]) > LEVEL]


def check(item):
    img = Image.open(item["file"]).convert("RGB")
    if img.size != (1080, 1920):
        img = img.resize((1080, 1920))
    px = img.load()
    found = []
    for name, boxes in ZONES:
        if name == "kicker" and not item.get("kicker", True):
            continue
        pts = [p for b in boxes for p in hits(px, b)]
        if len(pts) < MIN_HITS:
            continue
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        found.append({"zone": name, "box": [min(xs), min(ys), max(xs), max(ys)]})
    return found


if __name__ == "__main__":
    items = json.load(sys.stdin)
    out = []
    for item in items:
        zones = check(item)
        if zones:
            out.append({"file": item["file"], "frame": item.get("frame"), "zones": zones})
    print(json.dumps(out, ensure_ascii=False))
