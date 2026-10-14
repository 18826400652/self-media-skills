"""pd rec：在手机 AI App 里打字、发送、等回答结束，全程录屏。输出和 nv rec 同格式：.mp4 / .json / .txt。"""
import json
import os
import time

from .apps import load_app
from .core import fail, log
from .device import device, type_text, ui_texts, fail_with_ui
from .rec_logic import answer_done, content_labels, dnd_on, page_text, rec_info, same_text, type_plan, was_sent
from .recorder import Recorder, finish_video

USAGE = "用法：pd rec deepseek|doubao <提问.txt> <输出.mp4> [--think] [--search] [--timeout 秒]"
DEFAULT_TIMEOUT = 300
LEAD_IN = 2        # 秒：开录后先停一会再点输入框
TYPE_GAP = 0.12
BEFORE_SEND = 0.8
TAIL = 2           # 秒：回答结束后多录一会
POLL = 1
SEND_CHECK = 5     # 秒：发送后输入框要在这么久内清空


def parse_args(args):
    pos = [a for a in args if not a.startswith("--")]
    timeout = DEFAULT_TIMEOUT
    if "--timeout" in args:
        i = args.index("--timeout")
        if i + 1 >= len(args) or not args[i + 1].isdigit():
            fail(f"--timeout 要写秒数。{USAGE}")
        timeout = int(args[i + 1])
        pos.remove(args[i + 1])
    if len(pos) != 3:
        fail(USAGE)
    app, prompt, out = pos
    if not os.path.isfile(prompt):
        fail(f"找不到提问文件：{prompt}")
    if not out.endswith(".mp4"):
        fail(f"输出要是 .mp4：{out}")
    return {"app": app, "prompt": prompt, "out": out, "think": "--think" in args, "search": "--search" in args,
            "timeout": timeout}


def _labels():
    return content_labels(ui_texts())


def _type(prompt):
    for step in type_plan(prompt):
        if step == "\n":
            device().press("enter")   # 两个 App 的输入法回车都是换行，不是发送
        else:
            type_text(step)
        time.sleep(TYPE_GAP)


def _check_sent(app, rec, prompt, mkv):
    deadline = time.time() + SEND_CHECK
    while time.time() < deadline:
        time.sleep(0.5)
        if was_sent(app.input_text(), prompt):
            return
    rec.stop()
    fail_with_ui(f"点了发送，但提问还在输入框里，没发出去（原始录屏留在 {mkv}）")


def _wait_answer(app, rec, baseline, prompt, sent, timeout, mkv):
    history = []
    while True:
        time.sleep(POLL)
        history.append(_labels())
        marker = app.DONE_DESC is None or device()(description=app.DONE_DESC).exists
        if answer_done(history, baseline, prompt, marker):
            return
        if rec.now() - sent > timeout:
            rec.stop()
            fail_with_ui(f"等了 {timeout} 秒回答还没结束（原始录屏留在 {mkv}）")


def record(app, prompt, out, think=False, search=False, timeout=DEFAULT_TIMEOUT):
    mod = load_app(app)
    text = open(prompt, encoding="utf-8").read().strip()
    d = device()
    if not dnd_on(d.shell("settings get global zen_mode").output):
        fail("手机没开勿扰模式：录屏会录到弹出的通知。请先打开勿扰再录")
    mod.open_new_chat()               # 之后才开始录：侧边栏、历史对话不进画面
    mod.set_toggles(think, search)
    mod.prepare_input()
    before_typing = _labels()         # 含输入框提示文字：发送后它会重新出现，不能算「新文字」
    base = out[:-len(".mp4")]
    mkv = base + ".raw.mkv"
    rec = Recorder(d.serial, mkv)
    rec.start()
    time.sleep(LEAD_IN)
    mod.focus_input()
    marks = {"typed": rec.now()}
    _type(text)
    if not same_text(mod.input_text(), text):
        rec.stop()
        fail_with_ui(f"输入框里的文字和提问不一致，没有发送：{mod.input_text()[:40]}…")
    time.sleep(BEFORE_SEND)
    baseline = before_typing + _labels()
    marks["sent"] = rec.now()
    mod.send()
    _check_sent(mod, rec, text, mkv)
    _wait_answer(mod, rec, baseline, text, marks["sent"], timeout, mkv)
    marks["done"] = rec.now()
    page = _labels()
    time.sleep(TAIL)
    rec.stop()
    copied = mod.copy_answer() if hasattr(mod, "copy_answer") else None  # 录屏已停，滑动不进画面
    finish_video(mkv, out)
    for f in (mkv, mkv + ".log"):
        os.remove(f)
    info = rec_info(marks, app, think, search)
    with open(base + ".json", "w", encoding="utf-8") as f:
        json.dump(info, f, ensure_ascii=False, indent=2)
        f.write("\n")
    with open(base + ".txt", "w", encoding="utf-8") as f:
        f.write(page_text(page, copied))
    log(f"界面文字：{base}.txt")
    print(f"✓ {out}（发送后 {info['seconds']} 秒回答完；视频里 {info['sentAt']}s 发送、{info['doneAt']}s 结束）",
          flush=True)
    return info
