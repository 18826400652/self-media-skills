# 公众号「发草稿」手机步骤：由 `wa draft` 生成载荷后，经 `pd run` 在手机的公众号助手里执行。
# 载荷：{"title", "author", "html"（本地图片已内联为 data:）, "cover", "images", "account"}
# 只点「保存」，不点「下一步」里的发表。
# 公众号助手不能上传粘贴进来的内联图片（显示「上传失败，网络异常」），所以正文按图片切开：
# 文字段用富文本粘贴，图片推进相册后用编辑器的「插图」按钮从相册插入。
import os
import re
import time

from phone_draft import *
from phone_draft.html_parts import body_complete, save_data_uri, split_images, text_length

APP = "com.tencent.mp"
ID = "com.tencent.mp:id/"
WEBVIEW = ID + "editor_webview"
TITLE = ID + "title_edit_text"
COUNTER = ID + "tv_text_counter"
ALBUM_BUTTON = ID + "iv_album"
KEYBOARD_BUTTON = ID + "iv_keyboard"
ALBUM_CELL = ID + "iv_media"
ALBUM_CHECK = ID + "check_view"
ALBUM_DONE = ID + "tv_next"
SAVE = ID + "save_to_cloud"
DRAFT_DESC = ID + "tv_draft_desc"
IMAGE_ERROR = "处图片发生错误"
BODY_Y = 0.16          # 空白编辑器里正文第一行在 WebView 内的相对高度
IMAGE_UPLOAD_WAIT = 6  # 秒：从相册插入一张图后等它上传
ALBUM_LOAD_WAIT = 1.5
SETTLE_POLL = 3
MAX_SCROLLS = 40
MAX_IMAGES = 12      # 相册一屏放得下的格子数；更多图要滚动选，没做，改用 --via browser
SAVED_COUNT = re.compile(r"(\d+)\s*字")


def check_account():
    account = PAYLOAD.get("account")
    if account and not text_exists(account):
        fail_with_ui(f"公众号助手当前登录的不是「{account}」：请在 App 里切换账号后重试")
    log(f"账号：{account or '（配置里没写 account，跳过核对）'}")


def open_editor():
    open_app(APP)
    wait_text("创作发表", what="公众号助手首页")
    check_account()
    tap_text("文章")
    tap_text("写新文章")
    wait_text("下一步", what="文章编辑页")
    time.sleep(2)


def click_body_start():
    b = device()(resourceId=WEBVIEW).info["bounds"]
    device().click((b["left"] + b["right"]) // 2, int(b["top"] + (b["bottom"] - b["top"]) * BODY_Y))


def prepare_images(parts):
    """内联图片写成文件按顺序推进相册；返回推上去的文件和每张图在相册网格里的位置（最新的排最前）。"""
    srcs = [src for kind, src in parts if kind == "image"]
    if len(srcs) > MAX_IMAGES:
        fail(f"正文有 {len(srcs)} 张图，手机方案最多 {MAX_IMAGES} 张；请改用 --via browser")
    for src in srcs:
        if not src.startswith("data:"):
            fail(f"正文里有网络图片（{src[:60]}），手机发草稿只支持本地图片；请改用 --via browser")
    files = [save_data_uri(src, os.path.join(OUT_DIR, f"wechat-img{i:02d}")) for i, src in enumerate(srcs, 1)]
    remotes = push_media(files) if files else []
    return remotes, [len(files) - i for i in range(1, len(files) + 1)]


def refocus_body():
    """插图后编辑器会失去焦点：点工具栏的「切换键盘」把焦点和光标还给正文。"""
    if not device()(resourceId=KEYBOARD_BUTTON).exists:
        device().press("back")  # 收起可能弹出的图片菜单
        time.sleep(1)
    tap_id(KEYBOARD_BUTTON)
    time.sleep(1)


def end_of_body():
    device().shell("input keycombination 113 123")  # Ctrl+End
    time.sleep(0.5)


def insert_image(remotes, grid_index, n):
    end_of_body()
    check_newest(remotes)
    tap_id(ALBUM_BUTTON)
    if not device()(resourceId=ALBUM_CELL).wait(timeout=10):
        fail_with_ui("相册没有打开")
    time.sleep(ALBUM_LOAD_WAIT)  # 网格刚出现时还在加载，马上点会点空
    for _ in range(2):
        device()(resourceId=ALBUM_CHECK)[grid_index].click()
        if device()(resourceId=ALBUM_DONE).wait(timeout=3):
            break
    else:
        fail_with_ui(f"相册里没选中第 {n} 张图")
    tap_id(ALBUM_DONE)
    wait_text("下一步", what="插图后回到编辑页")
    time.sleep(IMAGE_UPLOAD_WAIT)
    log(f"已插入第 {n} 张图")


def fill_body():
    parts = split_images(PAYLOAD["html"])
    remotes, grid = prepare_images(parts)
    first, image_no = True, 0
    for kind, value in parts:
        if kind == "html":
            paste_html(value, back_to=APP, focus=click_body_start if first else refocus_body)
            first = False
        else:
            insert_image(remotes, grid[image_no], image_no + 1)
            image_no += 1
    check_count(wait_body_settled(), "编辑器字数栏")
    shot("wechat-body")


def word_count():
    sel = device()(resourceId=COUNTER)
    text = sel.get_text() if sel.exists else ""
    return int(text) if text and text.isdigit() else None


def wait_body_settled():
    """图片上传完、字数不再变化才算好；出现图片错误就停。"""
    deadline = time.time() + 60 + 10 * int(PAYLOAD.get("images") or 0)
    last, stable, unknown = None, 0, 0
    while time.time() < deadline:
        if text_exists(IMAGE_ERROR, contains=True):
            fail_with_ui("有图片上传失败：在编辑页点「查看」处理后手动保存，或改用 --via browser")
        count = word_count()
        unknown = unknown + 1 if count is None else 0
        stable = stable + 1 if count and count == last else 0
        if stable >= 2 or unknown >= 3:  # 字数栏有时不显示：连续 3 次读不到且没报错也算好
            log(f"正文已粘贴，{count if count else '字数栏未显示'} 字")
            return count
        last = count
        time.sleep(SETTLE_POLL)
    fail_with_ui("正文粘贴后一直没稳定下来（字数还在变或读不到字数）")


def check_count(count, where):
    """App 显示的字数远少于正文，说明粘贴丢了内容（剪贴板静默丢弃过大内容时就是这样）。"""
    expected = text_length(PAYLOAD["html"])
    if not body_complete(count, expected):
        fail_with_ui(f"正文可能没粘贴全：{where}显示 {count} 字，正文约 {expected} 字。请在手机上检查，或改用 --via browser")
    return count is not None


def saved_count():
    """保存后按钮变成「已保存 N字」。"""
    m = SAVED_COUNT.search(device()(resourceId=SAVE).get_text() or "")
    return int(m.group(1)) if m else None


def fill_title():
    """标题框只在滚到最顶上时才在界面里。"""
    hide_keyboard()
    title = device()(resourceId=TITLE)
    for _ in range(MAX_SCROLLS):
        if title.exists:
            break
        device().swipe_ext("down", scale=0.9)
    if not title.wait(timeout=3):
        fail_with_ui("找不到标题输入框")
    title.click()
    time.sleep(0.5)
    type_text(PAYLOAD["title"])
    time.sleep(1)
    check_readback(PAYLOAD["title"], title.get_text(), "标题")
    log(f"标题：{PAYLOAD['title']}")


def save_and_verify():
    """返回字数是否核对过。"""
    hide_keyboard()
    tap_id(SAVE)
    time.sleep(3)
    dismiss(["我知道了"])
    shot("wechat-saved")
    checked = check_count(saved_count(), "保存按钮")
    device().press("back")
    time.sleep(2)
    if text_exists("放弃编辑"):
        fail_with_ui("保存没有生效：退出时还在问是否保存。请在手机上检查后手动保存")
    wait_text("创作发表", what="公众号助手首页")
    check_readback(PAYLOAD["title"], device()(resourceId=DRAFT_DESC).get_text(), "草稿列表里的标题")
    return checked


open_editor()
fill_body()
fill_title()
counted = save_and_verify()
clean_media()
note = "" if counted else "（App 没显示字数，没法核对正文是否粘贴全，请打开草稿看一眼结尾）"
print(f"✓ 公众号草稿已保存：{PAYLOAD['title']}。封面、作者请在手机上「下一步」里确认后由你发表。{note}", flush=True)
