# 抖音「发草稿」手机步骤：由 `vdraft` 生成载荷后，经 `pd run` 在手机的抖音 App 里执行。
# 载荷：{"video"（成片路径）, "copy"（发布文案.md，格式见 copy_format）}
# 抖音的 resource-id 是混淆过的，按文字和无障碍描述找控件。
# 发布页没有存草稿按钮：填好标题和描述后退回剪辑页，点「返回」→「存草稿」。不点「发作品」「限时日常」。
import re
import time

from phone_draft import *

APP = "com.ss.android.ugc.aweme"
TITLE_MAX = 30
SHOOT = "拍摄，按钮"          # 首页底部的「+」；进了拍摄页同名的是录制键，只在首页点一次
ALBUM = "相册"
UNSELECTED = "未选中"
TITLE_HINT = "添加标题"
EDIT_TEXT = "android.widget.EditText"
PUBLISH_BACK = "返回，按钮"
EDIT_BACK = "返回"
SAVE_DRAFT = "存草稿"
RESUME_PROMPT = "继续编辑作品吗"
DRAFT_BOX = re.compile(r"本地草稿箱\D*(\d+)\s*个草稿")
CAMERA_CLOSE = "关闭"
PAGE_WAIT = 3

COPY = read_copy(PAYLOAD["copy"])


def description():
    topics = " ".join(f"#{t}" for t in COPY["topics"])
    body = "\n".join(COPY["paragraphs"])
    return body + (f"\n{topics} " if topics else "")


def open_home():
    open_app(APP)
    time.sleep(PAGE_WAIT)
    if text_exists(RESUME_PROMPT, contains=True):  # 上次没编辑完的作品：存进草稿箱，不替人丢弃
        tap_text(SAVE_DRAFT)
        log("抖音里有上次没编辑完的作品，已先存进草稿箱")
        time.sleep(PAGE_WAIT)
    dismiss(["我知道了", "以后再说"])
    wait_text("首页", what="抖音首页")


def draft_count():
    """「我」页上「本地草稿箱，N个草稿」的 N（没有草稿时不显示，算 0）。"""
    tap_text("我")
    time.sleep(PAGE_WAIT)
    counts = [int(m.group(1)) for t, _, _ in ui_texts() for m in [DRAFT_BOX.search(t)] if m]
    tap_text("首页")
    time.sleep(1)
    return counts[0] if counts else 0


def open_album():
    tap_desc(SHOOT)
    tap_desc(ALBUM)
    if not device()(descriptionContains=UNSELECTED).wait(timeout=15):
        fail_with_ui("相册没有打开")
    time.sleep(1.5)  # 网格刚出现时还在加载


def pick_video():
    """刚推进相册的成片最新，排在第一格。"""
    device()(descriptionContains=UNSELECTED)[0].click()
    if not device()(textStartsWith="下一步").wait(timeout=5):
        fail_with_ui("没选中视频")
    device()(textStartsWith="下一步").click()  # 「下一步 (1)」
    wait_text("下一步", timeout=60, what="剪辑页（视频导入完成）")
    time.sleep(PAGE_WAIT)
    tap_text("下一步")
    if not device()(className=EDIT_TEXT).wait(timeout=30):
        fail_with_ui("没进发布页")
    time.sleep(PAGE_WAIT)


def fill_field(index, text, what):
    field = device()(className=EDIT_TEXT)[index]
    field.click()
    time.sleep(0.5)
    type_text(text)
    time.sleep(1)
    check_readback(text, device()(className=EDIT_TEXT)[index].get_text(), what)


def fill_publish_page():
    title = COPY["title"]
    if len(title) > TITLE_MAX:
        fail(f"标题 {len(title)} 字，超过抖音上限 {TITLE_MAX}：{title}")
    fill_field(0, title, "标题")
    fill_field(1, description(), "作品描述")
    hide_keyboard()
    shot("douyin-filled")
    log(f"标题：{title}｜话题 {len(COPY['topics'])} 个")


def save_draft():
    tap_desc(PUBLISH_BACK)            # 发布页 → 剪辑页
    wait_text("下一步", what="剪辑页")
    tap_desc(EDIT_BACK)
    wait_text(SAVE_DRAFT, what="返回菜单")
    tap_text(SAVE_DRAFT)
    if not device()(description=CAMERA_CLOSE).wait(timeout=15):  # 存完回到拍摄页（「已保存」是 toast，读不到）
        fail_with_ui("存草稿后没有回到拍摄页")
    shot("douyin-saved")
    tap_desc(CAMERA_CLOSE)
    wait_text("首页", what="抖音首页")


REMOTES = push_media([PAYLOAD["video"]])
open_home()
before = draft_count()
open_album()
check_newest(REMOTES)
pick_video()
fill_publish_page()
save_draft()
after = draft_count()
if after != before + 1:
    fail_with_ui(f"草稿箱数量没有加一（之前 {before}，现在 {after}），请到「我 → 草稿箱」检查")
clean_media()  # 抖音存草稿时会把视频复制进自己的草稿箱，相册里的临时文件可以删
print(f"✓ 抖音草稿已保存：{COPY['title']}。到 App「我 → 草稿箱」确认后由你发布。", flush=True)
