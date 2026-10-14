"""DeepSeek App（com.deepseek.chat）：控件文字和描述都是中文，按文字找。"""
import time

from ..device import device, fail_with_ui, hide_keyboard, open_app, tap_desc, ui_texts
from ..rec_logic import BOUNDS, chip_on, content_labels

PACKAGE = "com.deepseek.chat"
DONE_DESC = "切换至语音"           # 输入栏右下角：生成回答时是停止键，回答完才变回语音键
COPY_DESC = "复制"                 # 回答下面的复制按钮（长回答时在屏幕外，要往下滑）
MAX_SWIPES = 15
# 空白新对话里只有这些按钮，加一行问候语（每次不一样：「你好，我能帮什么忙吗？」「欢迎回来，想从哪里开始？」）
CHROME = {"打开侧边栏", "自动朗读", "开启新对话", "发消息或按住说话", "深度思考", "智能搜索", "上传文件", "切换至语音"}
HINT = "发消息或按住说话"
EDIT = "android.widget.EditText"
TOGGLES = {"think": "深度思考", "search": "智能搜索"}
CHIP_BG_OFFSET = 60                # 像素：按钮文字左边这么远是按钮底色（不是图标）
FIND_WAIT = 10


def is_empty_chat(labels):
    return len([t for t in labels if t not in CHROME]) <= 1


def open_new_chat():
    open_app(PACKAGE)
    tap_desc("开启新对话")
    time.sleep(1.5)
    if not is_empty_chat(content_labels(ui_texts())):
        fail_with_ui("没进到 DeepSeek 的空白新对话，不录")


def _find(label):
    """从导出的界面结构里找文字的位置。点完「开启新对话」后，按文字查找（UiSelector）有时一直找不到，
    导出的结构 1–2 秒后就有了，所以 DeepSeek 的控件都按这里给的坐标点。"""
    deadline = time.time() + FIND_WAIT
    while time.time() < deadline:
        for text, _rid, bounds in ui_texts():
            if text == label:
                x1, y1, x2, y2 = map(int, BOUNDS.match(bounds).groups())
                return x1, y1, x2, y2
        time.sleep(1)
    fail_with_ui(f"找不到「{label}」")


def _tap(label):
    x1, y1, x2, y2 = _find(label)
    device().click((x1 + x2) // 2, (y1 + y2) // 2)


def _toggle_on(label):
    x1, y1, _x2, y2 = _find(label)
    img = device().screenshot()
    return chip_on(img.getpixel((x1 - CHIP_BG_OFFSET, (y1 + y2) // 2)))


def current_toggles():
    return _toggle_on(TOGGLES["think"]), _toggle_on(TOGGLES["search"])


def set_toggles(think, search):
    """App 会记住上次的开关，每轮都按要求设一遍并核对。"""
    for key, want in (("think", think), ("search", search)):
        label = TOGGLES[key]
        if _toggle_on(label) != want:
            _tap(label)
            time.sleep(1)
        if _toggle_on(label) != want:
            fail_with_ui(f"「{label}」没能{'打开' if want else '关掉'}")


def prepare_input():
    box = device()(className=EDIT)
    if box.exists:  # 上次没发出去的文字
        box.clear_text()
        hide_keyboard()
        time.sleep(1)
    _find(HINT)  # 清空后提示文字回来


def focus_input():
    _tap(HINT)
    time.sleep(0.6)


def input_text():
    box = device()(className=EDIT)
    return box.get_text() if box.exists else ""


def send():
    tap_desc("发送")


def copy_answer():
    """录屏停止后：滑到回答末尾点「复制」，读剪贴板拿完整回答（界面结构里只有屏幕上那一段）。读不到返回 None。"""
    d = device()
    for _ in range(MAX_SWIPES):
        if d(description=COPY_DESC).exists:
            break
        d.swipe_ext("up", scale=0.6)
        time.sleep(0.6)
    btn = d(description=COPY_DESC)
    if not btn.exists:
        return None
    btn[btn.count - 1].click()
    time.sleep(1)
    try:
        return d.clipboard or None
    except Exception:  # 读剪贴板失败不影响录屏结果
        return None
