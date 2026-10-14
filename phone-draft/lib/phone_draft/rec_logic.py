"""录 AI App 实测的纯逻辑：分段打字、判断回答结束、开关颜色、视频滤镜、输出信息。"""
import math
import re

STATUS_BAR = 120      # 像素：手机状态栏高度（MEIZU 20 实测 116），录屏时裁掉，读界面时去掉
OUT_W, OUT_H = 1080, 1920
MAX_TYPE_STEPS = 40   # 整段提问最多分几次输入（长提问每次多打几个字，打字过程不会太长）
MIN_STEP = 2
BOUNDS = re.compile(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]")


def type_plan(text, max_steps=MAX_TYPE_STEPS):
    """分段输入的计划：换行单独一项（按回车），其余每段 size 个字。"""
    plain = text.replace("\n", "")
    size = max(MIN_STEP, math.ceil(len(plain) / max_steps)) if plain else MIN_STEP
    steps = []
    for i, line in enumerate(text.split("\n")):
        if i:
            steps.append("\n")
        steps.extend(line[j:j + size] for j in range(0, len(line), size))
    return steps


def same_text(a, b):
    return re.sub(r"\s+", "", a) == re.sub(r"\s+", "", b)


def content_labels(items, status_bar=STATUS_BAR):
    """去掉状态栏里的控件（通知图标没有 id，只能按位置判断）。"""
    out = []
    for label, _rid, bounds in items:
        m = BOUNDS.match(bounds)
        if m and int(m.group(4)) <= status_bar:
            continue
        out.append(label)
    return out


def answer_done(history, baseline, prompt, marker_ok=True, stable=3):
    """发送后每秒一次的界面文字 history：出现了提问以外的新文字，且最后 stable+1 次都一样。"""
    if not marker_ok or len(history) < stable + 1:
        return False
    last = history[-1]
    if any(h != last for h in history[-(stable + 1):]):
        return False
    return bool(set(last) - set(baseline) - {prompt})


def was_sent(input_now, prompt):
    """发送后输入框不再是这段提问（清空或回到提示文字），才算发出去了。"""
    return not same_text(input_now, prompt)


def chip_on(rgb):
    r, _g, b = rgb[:3]
    return b - r >= 10


def pad_color(rgb):
    return "0x{:02x}{:02x}{:02x}".format(*rgb[:3])


def video_filter(color, status_bar=STATUS_BAR):
    return (f"fps=30,crop=iw:ih-{status_bar}:0:{status_bar},scale=-2:{OUT_H},"
            f"pad={OUT_W}:{OUT_H}:(ow-iw)/2:0:color={color},format=yuv420p")


def dnd_on(zen_mode):
    v = zen_mode.strip()
    return v not in ("", "0", "null")


def page_text(labels, copied):
    """.txt 内容：回答结束时界面上的文字（长回答只有屏幕上那一段），加上复制按钮拿到的完整回答（有的话）。"""
    text = "\n".join(labels) + "\n"
    return text + f"\n## 复制的完整回答\n\n{copied.strip()}\n" if copied else text


def rec_info(marks, app, think, search):
    r = lambda x: round(x, 2)  # noqa: E731
    return {"seconds": r(marks["done"] - marks["sent"]), "pastedAt": r(marks["typed"]), "sentAt": r(marks["sent"]),
            "doneAt": r(marks["done"]), "viewport": [OUT_W, OUT_H], "app": app, "device": "phone",
            "think": think, "search": search}
