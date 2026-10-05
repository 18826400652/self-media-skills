# 抖音「发草稿」步骤：由 `nv draft` 生成载荷后，经 `bd run` 在已登录的浏览器里执行。
# 载荷：{"video"（本地 MP4）, "copy"（发布文案.md，格式见 browser-draft 的 read_copy）}
# 只点「暂存离开」，不点「发布」。
# 抖音网页端只保留「一条」未发布的作品（再次打开上传页会提示继续编辑 / 放弃），不是草稿列表。
import time

UPLOAD_URL = "https://creator.douyin.com/creator-micro/content/upload"
TITLE_MAX = 30
PENDING = "你还有上次未发布的视频"
COPY = read_copy(PAYLOAD["copy"])


def open_upload_page():
    open_tab(UPLOAD_URL, reuse="creator.douyin.com")
    goto_url(UPLOAD_URL)
    wait_for_load()
    time.sleep(3)
    if "login" in page_info()["url"] or visible_text_exists("扫码登录"):
        fail("没有登录抖音创作者中心：请在浏览器打开 https://creator.douyin.com 登录后重试")
    if PENDING in js("document.body.innerText"):
        fail("抖音里已有一条未发布的作品（暂存只能保留一条）。先在创作者中心「继续编辑」把它发布或「放弃」，再重新运行")


def upload_video():
    wait_until("""!!document.querySelector("input[type=file][accept*=video]")""", what="视频上传区")
    js("""document.querySelector("input[type=file][accept*=video]").setAttribute("data-bd", "video")""")
    upload('[data-bd="video"]', PAYLOAD["video"])
    wait_until("""[...document.querySelectorAll("input")].some(e => /填写作品标题/.test(e.placeholder))""",
               timeout=60, what="进入作品编辑页")
    # 以「上传成功」为准（「重新上传」在失败时也会出现，不能用）
    state = wait_until("""(() => { const t = document.body.innerText;
      return t.includes("上传失败") ? "fail" : t.includes("上传成功") ? "ok" : ""; })()""", timeout=600, what="视频上传完成")
    if state == "fail":
        fail("视频上传失败（抖音页面提示「上传失败」），重新运行试试")
    log("视频已上传")
    time.sleep(1)
    dismiss(["我知道了"], rounds=2)


def fill_title():
    title = COPY["title"]
    if len(title) > TITLE_MAX:
        fail(f"标题超过 {TITLE_MAX} 字：{title}")
    js("""(() => { const t = [...document.querySelectorAll("input")].find(e => /填写作品标题/.test(e.placeholder));
      t.setAttribute("data-bd", "title"); t.focus(); t.select(); })()""")
    cdp("Input.insertText", text=title)
    key = dict(key="End", code="End", windowsVirtualKeyCode=35)
    cdp("Input.dispatchKeyEvent", type="keyDown", **key)
    cdp("Input.dispatchKeyEvent", type="keyUp", **key)
    value = js("""document.querySelector('[data-bd="title"]').value""")
    if value != title:
        fail(f"标题没填对：期望「{title}」，实际「{value}」")
    log(f"标题：{title}")


def focus_description_end():
    js("""(() => { const e = [...document.querySelectorAll("[contenteditable=true]")].find(e => e.offsetParent);
      e.setAttribute("data-bd", "desc"); e.focus();
      const s = getSelection(); s.selectAllChildren(e); s.collapseToEnd(); })()""")


def fill_description():
    """简介编辑器是抖音自研的，逐段 insertText，段间用回车。"""
    focus_description_end()
    lines = COPY["paragraphs"]
    for i, line in enumerate(lines):
        if line:
            cdp("Input.insertText", text=line)
        if i < len(lines) - 1:
            press_key("Enter")
    first = next((p for p in lines if p), "")
    if first:
        wait_until(f"""document.querySelector('[data-bd="desc"]').innerText.includes({js_str(first[:12])})""", what="简介填写")
    log(f"简介 {sum(1 for p in lines if p)} 段")


def add_topics():
    """输入 #话题 后，联想列表里有完全一致的就点选，没有就保留为文字。"""
    topics = COPY["topics"]
    if not topics:
        return
    focus_description_end()
    press_key("Enter")
    picked = 0
    pick = """(() => {{ const n = [...document.querySelectorAll("[class*=tag-hash-view-name]")]
        .find(e => e.getClientRects().length && e.textContent.trim().toLowerCase() === {name});
      if (!n) return false; (n.closest("[class*=mention-suggest-item]") || n.parentElement).click(); return true; }})()"""
    for topic in topics:
        cdp("Input.insertText", text=f"#{topic}")
        # 联想列表异步出来，最多等 6 秒（抖音话题不区分大小写，如 DeepSeek / deepseek）
        for _ in range(12):
            time.sleep(0.5)
            if js(pick.format(name=js_str(topic.lower()))):
                picked += 1
                break
        cdp("Input.insertText", text=" ")
        time.sleep(0.5)
    log(f"话题 {len(topics)} 个（联想里匹配到 {picked} 个）")


COVER_DONE_ENABLED = """(() => { const b = [...document.querySelectorAll("button")].find(b => b.getClientRects().length && b.textContent.trim() === "完成");
  return !!b && !b.disabled; })()"""


def set_default_cover():
    """封面必填，尽力而为：打开封面弹窗，等视频画面加载出来后「完成」，用视频画面做横封面（4:3），
    抖音再据此生成竖封面（3:4）。弹窗里的视频画面有时一直加载不出来（「完成」一直灰着），
    这时关掉弹窗、照常暂存，提示人在预览时选封面。自定义封面图暂不支持。返回是否设置成功。"""
    if not click_text("选择封面"):
        log("封面已存在，跳过")
        return True
    wait_until("""/设置横封面/.test(document.body.innerText)""", what="封面弹窗")
    end = time.time() + 60
    while time.time() < end and not js(COVER_DONE_ENABLED):
        time.sleep(2)
    if js(COVER_DONE_ENABLED):
        click_text("完成")
        time.sleep(2)
        if visible_text_exists("暂不设置"):
            click_text("暂不设置")
            time.sleep(1)
        if not visible_text_exists("选择封面"):
            log("封面：视频画面（横 4:3，竖封面由抖音生成）")
            return True
    # 关弹窗：右上角的关闭图标只认它自己的 click 事件
    js("""(() => { const x = [...document.querySelectorAll("svg[class*=close-]")].find(e => e.getClientRects().length);
      if (x) x.dispatchEvent(new MouseEvent("click", {bubbles: true})); })()""")
    time.sleep(1.5)
    log("⚠ 封面没设上（抖音封面弹窗里的视频画面没加载出来）。封面是必填项，预览时请在页面上选一下")
    return False


def save_draft():
    # 「上传成功」在检测完成后会消失，这里只排除失败
    if "上传失败" in js("document.body.innerText"):
        fail("视频上传失败，没有暂存")
    if not click_text("暂存离开"):
        fail("找不到「暂存离开」，上传页可能改版了")
    wait_until(f"""document.body.innerText.includes({js_str(PENDING)})""", timeout=30, what="暂存完成")
    log("已暂存（创作者中心上传页会提示「继续编辑」）")


open_upload_page()
upload_video()
fill_title()
fill_description()
add_topics()
cover_ok = set_default_cover()
js("window.scrollTo(0, 0)")
shot("douyin-draft")
save_draft()
note = "封面用的是视频画面，可以在那里换" if cover_ok else "封面还没设，发布前要选一张"
print(f"✓ 抖音作品已暂存：{COPY['title']}。在创作者中心「发布视频」页点「继续编辑」预览（{note}），确认后由你发布。")
