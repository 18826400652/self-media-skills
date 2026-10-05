# 小红书「发草稿」步骤：由 `ic draft` 生成载荷后，经 `bd run` 在已登录的浏览器里执行。
# 载荷：{"copy"（文案.md 路径，格式见 browser-draft 的 read_copy）, "images"（本地路径，按顺序）}
# 只点「暂存离开」，不点「发布」。
import html as htmllib
import time

PUBLISH_URL = "https://creator.xiaohongshu.com/publish/publish?source=official&from=tab_switch&target=image"
BODY = ".tiptap.ProseMirror"
TITLE_MAX = 20
COPY = read_copy(PAYLOAD["copy"])
DRAFT_COUNT = """(() => { const m = document.body.innerText.match(/草稿箱\\s*[（(](\\d+)[）)]/); return m ? Number(m[1]) : -1; })()"""


def open_publish_page():
    open_tab(PUBLISH_URL, reuse="creator.xiaohongshu.com")
    # 上一次没填完的页面会拦着离开，先解除再重新打开，保证从空白发布页开始
    js("window.onbeforeunload = null")
    goto_url(PUBLISH_URL)
    wait_for_load()
    time.sleep(2)
    if "login" in page_info()["url"]:
        fail("没有登录小红书创作服务平台：请在浏览器打开 https://creator.xiaohongshu.com 登录后重试")
    if not click_text("上传图文"):
        fail("找不到「上传图文」，发布页可能改版了")
    wait_until("""!!document.querySelector("input[type=file]")""", what="图文上传区")
    return js(DRAFT_COUNT)


def upload_images():
    images = PAYLOAD["images"]
    js("""document.querySelector("input[type=file]").setAttribute("data-bd", "images")""")
    upload('[data-bd="images"]', images)
    wait_until(f"""/{len(images)}\\s*\\/\\s*18/.test(document.body.innerText)""", timeout=120,
               what=f"{len(images)} 张图片上传完成")
    log(f"已上传 {len(images)} 张图片")
    time.sleep(1)
    dismiss(["我知道了"])


def fill_title():
    title = COPY["title"]
    if len(title) > TITLE_MAX:
        fail(f"标题超过 {TITLE_MAX} 字：{title}")
    js("""(() => { const t = [...document.querySelectorAll("input")].find(e => /填写标题/.test(e.placeholder));
      t.setAttribute("data-bd", "title"); t.focus(); t.select(); })()""")
    cdp("Input.insertText", text=title)
    key = dict(key="End", code="End", windowsVirtualKeyCode=35)
    cdp("Input.dispatchKeyEvent", type="keyDown", **key)
    cdp("Input.dispatchKeyEvent", type="keyUp", **key)
    value = js("""document.querySelector('[data-bd="title"]').value""")
    if value != title:
        fail(f"标题没填对：期望「{title}」，实际「{value}」")
    log(f"标题：{title}")


def fill_body():
    html = "".join(f"<p>{htmllib.escape(p)}</p>" if p else "<p></p>" for p in COPY["paragraphs"])
    paste_html(BODY, html)
    first = next(p for p in COPY["paragraphs"] if p)
    wait_until(f"""document.querySelector({js_str(BODY)}).innerText.includes({js_str(first[:15])})""", what="正文粘贴")
    log(f"正文 {sum(1 for p in COPY['paragraphs'] if p)} 段")


def add_topics():
    """话题要从联想列表里选，才会变成可点击的话题（纯文本 #xx 不算）。"""
    topics = COPY["topics"]
    if not topics:
        return
    js(f"""(() => {{ const e = document.querySelector({js_str(BODY)}); e.focus();
      const s = getSelection(); s.selectAllChildren(e); s.collapseToEnd(); }})()""")
    cdp("Input.insertText", text="\n")
    missing = []
    for topic in topics:
        cdp("Input.insertText", text=f"#{topic}")
        time.sleep(2)
        picked = js(f"""(() => {{ const n = [...document.querySelectorAll("span.name")]
            .find(e => e.offsetParent && e.textContent.trim() === {js_str('#' + topic)});
          if (!n) return false; (n.closest("[class*=item]") || n.parentElement).click(); return true; }})()""")
        if not picked:
            missing.append(topic)
            cdp("Input.insertText", text=" ")  # 联想里没有完全一致的话题：保留为普通文字
        time.sleep(0.8)
    count = js(f"""document.querySelectorAll({js_str(BODY + ' a.tiptap-topic')}).length""")
    log(f"话题 {count}/{len(topics)} 个已识别" + (f"，没有匹配到：{'、'.join(missing)}（保留为普通文字）" if missing else ""))


def save_draft(before):
    # 「暂存离开」和「发布」在自定义元素 xhs-publish-btn 的闭合 shadow DOM 里（挂在 _sr 上），按文字找，绝不按坐标点
    if not click_text("暂存离开", host="xhs-publish-btn"):
        fail("找不到「暂存离开」，发布页可能改版了")
    wait_until(f"""{DRAFT_COUNT} > {before}""", timeout=30, what="草稿箱数量增加")
    log(f"已暂存到草稿箱（{before} → {js(DRAFT_COUNT)}）")


before = open_publish_page()
upload_images()
fill_title()
fill_body()
add_topics()
shot("xiaohongshu-draft")
save_draft(before)
print(f"✓ 小红书草稿已暂存：{COPY['title']}。在创作服务平台「草稿箱」里打开预览，确认后由你发布。")
