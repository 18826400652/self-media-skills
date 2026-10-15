"""豆包 App（com.larus.nova）：很多按钮没有文字和描述，按位置相对已知文字找。
打开时停在上次的对话，新对话要从侧边栏顶部的按钮进；侧边栏有历史标题，所以录屏只在进了新对话之后开始。"""
import time

from ..core import fail
from ..device import device, fail_with_ui, hide_keyboard, open_app, ui_texts
from ..rec_logic import content_labels

PACKAGE = "com.larus.nova"
# 回答完，回答下面的一排按钮（复制、朗读、收藏、分享、重新生成）才出现。平常的界面里只有 resource-id，
# 往上翻过之后的另一种渲染里才有描述，两个都认
DONE_ID = "com.larus.nova:id/msg_action_regenerate"
DONE_DESC = "重新生成"
SCROLL_TO_BOTTOM = "转至底部"   # 往上翻过回答时，回答右下角的「到底部」按钮有这个描述
SPLITTER = "com.larus.nova:id/splitter"   # 输入区上沿的分隔线
ARROW_GAP = 60         # 像素：刚发送时的 ↓（没有描述）贴在分隔线上方这么近
EDIT = "android.widget.EditText"
IMAGE = "android.widget.ImageView"
TOP_BAR = 300          # 像素：顶栏下边界
# 空白新对话里应该只有这些文字；出现别的（历史消息、新推荐）就不录
EMPTY_LABELS = {"新对话", "内容由 AI 生成", "打电话", "视频通话", "拍题答疑", "照片动起来", "按住说话",
                "AI 创作", "AI 播客",       # 2026-10 版新对话页底部的入口
                "发消息或按住说话...", "发消息..."}
# 打开 App 时弹的更新窗口：认标题，再找「不更新」的按钮点掉
UPDATE_TITLES = ("发现新版本", "版本更新", "新版本")
UPDATE_DISMISS = ("稍后再说", "以后再说", "下次再说", "暂不更新", "稍后", "取消", "关闭")


def update_dialog_action(labels):
    """不是更新窗口返回 None；能关掉返回要点的按钮文字；关不掉返回 "manual"。"""
    if not any(t in label for label in labels for t in UPDATE_TITLES):
        return None
    return next((d for d in UPDATE_DISMISS if d in labels), "manual")


def guard_ui(fn):
    """找不到界面元素时 uiautomator2 抛英文异常：换成能看懂的中文提示（多半是弹了窗口或豆包改版了）。"""
    def wrapped(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except Exception as err:  # noqa: BLE001 —— 只认 uiautomator2 的「找不到元素」，其他照常抛
            if type(err).__name__ != "UiObjectNotFoundError":
                raise
            fail("豆包的界面和脚本预期的不一样（可能弹了更新或活动窗口，也可能改版了）：把手机上的窗口关掉再录；"
                 "还不行就用 pd ui doubao 看看现在的界面")
    return wrapped


def unexpected_labels(labels, input_text=""):
    """input_text：输入框里上次没发出去的文字，接下来会清空，不算对话内容。"""
    return [t for t in labels if t not in EMPTY_LABELS and t != input_text]


def _bounds(sel):
    return sel.info["bounds"]


def closest_right(anchor, candidates):
    """和 anchor 同一行、在它右边、离它最近的那个的下标（侧边栏打开时，主界面的图标也在同一行更右边）。"""
    best = None
    for i, b in enumerate(candidates):
        if b["left"] >= anchor["right"] - 5 and b["top"] < anchor["bottom"] and b["bottom"] > anchor["top"]:
            if best is None or b["left"] < candidates[best]["left"]:
                best = i
    return best


def send_button(box, candidates):
    """输入框右边同一行里最靠下的图标：两行以上时上面多出一个「展开全屏」，发送键在下面。"""
    right = [i for i, b in enumerate(candidates)
             if b["left"] >= box["right"] - 5 and b["top"] < box["bottom"] and b["bottom"] > box["top"]]
    return max(right, key=lambda i: candidates[i]["bottom"]) if right else None


def _right_of(anchor, class_name):
    sel = device()(className=class_name, clickable=True)
    views = [sel[i] for i in range(sel.count)]
    i = closest_right(anchor, [_bounds(v) for v in views])
    return None if i is None else views[i]


def short_labels(labels, width=12):
    """报错时只露每段开头几个字：不把私人对话整段打到终端里。"""
    return "、".join(t.replace("\n", " ")[:width] for t in labels[:3])


def dismiss_update_dialog():
    action = update_dialog_action([label for label, *_ in ui_texts()])
    if action is None:
        return
    if action == "manual":
        fail("豆包弹了更新窗口，找不到「稍后 / 取消」按钮：在手机上手动关掉再录")
    device()(text=action).click()
    time.sleep(1)


@guard_ui
def open_new_chat():
    open_app(PACKAGE)
    time.sleep(1)
    dismiss_update_dialog()
    menu = device()(className=IMAGE, clickable=True)
    if not menu.exists or _bounds(menu[0])["top"] > TOP_BAR:
        fail_with_ui("找不到豆包左上角的菜单按钮")
    menu[0].click()                       # 打开侧边栏（有历史标题，此时还没开始录）
    time.sleep(1.5)
    search = device()(text="搜索")
    if not search.wait(timeout=5):
        fail_with_ui("侧边栏没打开")
    new_chat = _right_of(_bounds(search), IMAGE)
    if new_chat is None:
        fail_with_ui("找不到侧边栏的「新对话」按钮")
    new_chat.click()
    time.sleep(2)
    refuse_if_not_empty(content_labels(ui_texts()), input_text())


def refuse_if_not_empty(labels, input_text=""):
    """新对话里有不认识的文字就停下。不用 fail_with_ui：它会把整屏截图和全部文字存成文件，那是私人对话。"""
    extra = unexpected_labels(labels, input_text)
    if extra:
        fail(f"豆包新对话里有不认识的内容，为免录到私人对话已停下：{short_labels(extra)}")


def current_toggles():
    return False, False


def set_toggles(think, search):
    if think or search:
        fail("豆包没有「深度思考」「智能搜索」开关，不能用 --think / --search")


def prepare_input():
    voice = device()(text="按住说话")
    if voice.exists:                      # 语音模式：点右边的键盘图标切成打字
        kb = _right_of(_bounds(voice), IMAGE)
        if kb is None:
            fail_with_ui("找不到切换键盘的按钮")
        kb.click()
        time.sleep(1)
    box = device()(className=EDIT)
    if not box.wait(timeout=5):
        fail_with_ui("找不到豆包的输入框")
    if box.get_text() and not box.get_text().startswith("发消息"):
        box.clear_text()
    hide_keyboard()
    time.sleep(1)


def focus_input():
    device()(className=EDIT).click()
    time.sleep(0.6)


def input_text():
    box = device()(className=EDIT)
    return box.get_text() if box.exists else ""


def send():
    box = device()(className=EDIT)
    sel = device()(className=IMAGE, clickable=True)
    views = [sel[i] for i in range(sel.count)]
    i = send_button(_bounds(box), [_bounds(v) for v in views])
    if i is None:
        fail_with_ui("找不到豆包的发送键")
    views[i].click()


def down_arrow_index(splitter, candidates, width):
    """刚发送、回答在屏幕外时出现的 ↓：水平居中、紧贴在输入区分隔线上方的图标。返回下标或 None"""
    if splitter is None:
        return None
    for i, b in enumerate(candidates):
        centered = abs((b["left"] + b["right"]) / 2 - width / 2) <= width * 0.06
        if centered and 0 <= splitter["top"] - b["bottom"] <= ARROW_GAP:
            return i
    return None


def _down_arrow():
    line = device()(resourceId=SPLITTER)
    if not line.exists:
        return None
    sel = device()(className=IMAGE, clickable=True)
    views = [sel[i] for i in range(sel.count)]
    i = down_arrow_index(_bounds(line), [_bounds(v) for v in views], device().info["displayWidth"])
    return None if i is None else views[i]


def follow_answer():
    """等回答时每轮调一次：提问长到占满屏幕时回答在屏幕外，点 ↓ 把它滚进来，录屏录得到回答、也看得见完成标记"""
    btn = device()(description=SCROLL_TO_BOTTOM)
    if btn.exists:
        btn.click()
        return
    arrow = _down_arrow()
    if arrow is not None:
        arrow.click()


def reveal_done():
    """回答写完、文字不再变时调：完成标记那排按钮常在屏幕下沿外，往上推一小段把它露出来"""
    d = device()
    w, h = d.info["displayWidth"], d.info["displayHeight"]
    d.swipe(w // 2, int(h * 0.65), w // 2, int(h * 0.45), 0.3)
