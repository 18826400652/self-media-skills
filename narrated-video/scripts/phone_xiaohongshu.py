# 小红书「发草稿」手机步骤（发视频）：由 `nv draft --to xiaohongshu` 生成载荷后，经 `pd run` 在手机的小红书 App 里执行。
# 载荷：{"video"（成片路径）, "copy"（发布文案.md，格式见 copy_format）}
# 小红书的 resource-id 是混淆过的，按文字和无障碍描述找控件。只点「存草稿」，不点「发布笔记」。
import re
import time

from phone_draft import *

APP = "com.xingin.xhs"
TITLE_MAX = 20
PLUS = "发布"                 # 首页底部「+」的无障碍描述；只是进入发布流程的入口
FROM_ALBUM = "从相册选择"
EDIT_TEXT = "android.widget.EditText"
SAVE_DRAFT = "存草稿"
SAVE_CONFIRM = "保存笔记至草稿箱"   # 点「存草稿」后的确认框：只在文字里有「草稿箱」时点「确定」
DRAFT_BOX = re.compile(r"草稿箱\D*(\d+)")   # 「我」页上的「草稿箱·N」
CHECK_BOX_MAX = 200           # 相册格子右上角的勾选框（没有文字和描述）比格子小
GRID_TOP = 350                # 勾选框在顶部分类标签下面
PAGE_WAIT = 3

COPY = read_copy(PAYLOAD["copy"])


def description():
    topics = " ".join(f"#{t}" for t in COPY["topics"])
    body = "\n".join(COPY["paragraphs"])
    return body + (f"\n{topics} " if topics else "")


def open_home():
    open_app(APP)
    dismiss(["我知道了", "稍后再说"])
    wait_text("首页", what="小红书首页")


def draft_count():
    """「我」页上「草稿箱·N」的 N（没有草稿时不显示，算 0）。"""
    tap_text("我")
    time.sleep(PAGE_WAIT)
    counts = [int(m.group(1)) for t, _, _ in ui_texts() for m in [DRAFT_BOX.search(t)] if m]
    tap_text("首页")
    time.sleep(1)
    return counts[0] if counts else 0


def open_album():
    tap_desc(PLUS, allow_forbidden=True)
    tap_text(FROM_ALBUM)
    time.sleep(PAGE_WAIT)  # 网格刚出现时还在加载


def first_check_box():
    """第一个格子（最新推进相册的成片）右上角的勾选框。"""
    boxes = []
    sel = device()(className="android.widget.FrameLayout", clickable=True)
    for i in range(sel.count):
        b = sel[i].info["bounds"]
        w, h = b["right"] - b["left"], b["bottom"] - b["top"]
        if w < CHECK_BOX_MAX and h < CHECK_BOX_MAX and b["top"] > GRID_TOP:
            boxes.append((b["top"], b["left"], sel[i]))
    if not boxes:
        fail_with_ui("相册里找不到勾选框")
    return min(boxes, key=lambda x: (x[0], x[1]))[2]


def pick_video():
    first_check_box().click()
    if not device()(textStartsWith="下一步").wait(timeout=5):
        fail_with_ui("没选中视频")
    device()(textStartsWith="下一步").click()  # 「下一步(1)」
    wait_text("下一步", timeout=60, what="视频编辑页")
    time.sleep(PAGE_WAIT)
    tap_text("下一步")
    if not device()(className=EDIT_TEXT).wait(timeout=30):
        fail_with_ui("没进发布页")
    time.sleep(PAGE_WAIT)


def fill_field(index, text, what):
    device()(className=EDIT_TEXT)[index].click()
    time.sleep(0.5)
    type_text(text)
    time.sleep(1)
    check_readback(text, device()(className=EDIT_TEXT)[index].get_text(), what)


def fill_publish_page():
    title = COPY["title"]
    if len(title) > TITLE_MAX:
        fail(f"标题 {len(title)} 字，超过小红书上限 {TITLE_MAX}：{title}")
    fill_field(0, title, "标题")
    fill_field(1, description(), "正文")
    device().press("back")  # 收起键盘
    time.sleep(1)
    shot("xhs-filled")
    log(f"标题：{title}｜话题 {len(COPY['topics'])} 个")


def save_draft():
    tap_text(SAVE_DRAFT)
    wait_text(SAVE_CONFIRM, contains=True, what="存草稿确认框")
    tap_text("确定")
    wait_text("首页", timeout=20, what="存完回到首页")
    shot("xhs-saved")


push_media([PAYLOAD["video"]])
open_home()
before = draft_count()
open_album()
pick_video()
fill_publish_page()
save_draft()
after = draft_count()
if after != before + 1:
    fail_with_ui(f"草稿箱数量没有加一（之前 {before}，现在 {after}），请到「我 → 草稿箱」检查")
clean_media()  # 小红书存草稿时会复制视频，相册里的临时文件可以删
print(f"✓ 小红书草稿已保存：{COPY['title']}。到 App「我 → 草稿箱」确认后由你发布。", flush=True)
