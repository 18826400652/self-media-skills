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


FLAGS = {"--think", "--search", "--timeout"}


def parse_args(args):
    unknown = [a for a in args if a.startswith("--") and a not in FLAGS]
    if unknown:
        fail(f"不认识的参数：{' '.join(unknown)}。{USAGE}")
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


def read_prompt(path):
    """统一换行符：Windows 写的文件是 \r\n，\r 会被当成字符打进输入框。"""
    with open(path, encoding="utf-8", newline="") as f:
        return f.read().replace("\r\n", "\n").replace("\r", "\n").strip()


def _clipboard(d):
    try:
        return d.clipboard
    except Exception:  # noqa: BLE001 —— 读不到就不恢复
        return None


def _restore_clipboard(d, saved):
    """打字（uiautomator2 经剪贴板粘贴）和「复制」都会改剪贴板，录完放回用户原来复制的内容。"""
    if saved is None:
        return
    try:
        d.clipboard = saved
    except Exception:  # noqa: BLE001
        log("没能恢复手机剪贴板里原来的内容")


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


def _done_marker(app):
    """回答完的标记在不在屏幕上：DONE_ID（resource-id）或 DONE_DESC（描述）任一出现；两个都没定义的 App 不看标记"""
    done_id, desc = getattr(app, "DONE_ID", None), app.DONE_DESC
    if done_id is None and desc is None:
        return True
    return bool((done_id and device()(resourceId=done_id).exists) or (desc and device()(description=desc).exists))


def _wait_answer(app, rec, baseline, prompt, sent, timeout, mkv):
    history = []
    while True:
        time.sleep(POLL)
        follow = getattr(app, "follow_answer", None)  # 回答在屏幕外时把它滚进来（豆包）
        if follow:
            follow()
        history.append(_labels())
        marker = _done_marker(app)
        if answer_done(history, baseline, prompt, marker):
            return
        # 文字已经不变了、完成标记却不在屏幕上：多半在屏幕下沿外，让 App 往上推一点（豆包）
        reveal = getattr(app, "reveal_done", None)
        if reveal and not marker and answer_done(history, baseline, prompt):
            reveal()
        if rec.now() - sent > timeout:
            rec.stop()
            fail_with_ui(f"等了 {timeout} 秒回答还没结束（原始录屏留在 {mkv}）")


def _restore(mod, before):
    """改回用户原来的开关。失败只提示，不盖住原来的错误。"""
    try:
        mod.set_toggles(*before)
    except (Exception, SystemExit):  # noqa: BLE001
        log(f"没能把开关改回原来的设置（深度思考、智能搜索：{before}），请在 App 里手动改回")


def _capture(mod, rec, text, mkv, timeout):
    """录屏中的一轮：打字、发送、等回答。返回 (marks, 回答结束时的界面文字)。"""
    before_typing = _labels()         # 含输入框提示文字：发送后它会重新出现，不能算「新文字」
    rec.start()
    time.sleep(LEAD_IN)
    mod.focus_input()
    marks = {"typed": rec.now()}
    _type(text)
    if not same_text(mod.input_text(), text):
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
    return marks, page


def _write_outputs(out, mkv, marks, page, copied, app, think, search, can_copy=False):
    base = out[:-len(".mp4")]
    finish_video(mkv, out)
    for f in (mkv, mkv + ".log"):
        os.remove(f)
    info = rec_info(marks, app, think, search)
    if can_copy:  # 这个 App 能点「复制」拿完整回答：记下拿没拿到
        info["copied"] = copied is not None
    with open(base + ".json", "w", encoding="utf-8") as f:
        json.dump(info, f, ensure_ascii=False, indent=2)
        f.write("\n")
    with open(base + ".txt", "w", encoding="utf-8") as f:
        f.write(page_text(page, copied))
    log(f"界面文字：{base}.txt")
    print(f"✓ {out}（发送后 {info['seconds']} 秒回答完；视频里 {info['sentAt']}s 发送、{info['doneAt']}s 结束）",
          flush=True)
    if can_copy and copied is None:
        print(f"⚠ 没拿到完整回答（点「复制」失败）：{base}.txt 里只有录屏结束时屏幕上的那部分，长回答会缺一截。"
              "实测记录要原样粘贴完整回答：重录一轮，或在手机上手动复制", flush=True)
    return info


def record(app, prompt, out, think=False, search=False, timeout=DEFAULT_TIMEOUT):
    mod = load_app(app)
    text = read_prompt(prompt)
    d = device()
    if not dnd_on(d.shell("settings get global zen_mode").output):
        fail("手机没开勿扰模式：录屏会录到弹出的通知。请先打开勿扰再录")
    mod.open_new_chat()               # 之后才开始录：侧边栏、历史对话不进画面
    before = mod.current_toggles()    # 录完（包括中途失败）都改回用户原来的开关和剪贴板
    saved_clip = _clipboard(d)
    mkv = out[:-len(".mp4")] + ".raw.mkv"
    rec = Recorder(d.serial, mkv)
    try:
        mod.set_toggles(think, search)
        mod.prepare_input()
        marks, page = _capture(mod, rec, text, mkv, timeout)
        rec.stop()
        copied = mod.copy_answer(page) if hasattr(mod, "copy_answer") else None  # 录屏已停，滑动不进画面
    finally:
        rec.stop()
        _restore(mod, before)
        _restore_clipboard(d, saved_clip)
    return _write_outputs(out, mkv, marks, page, copied, app, think, search, can_copy=hasattr(mod, "copy_answer"))
