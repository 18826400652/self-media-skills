# 公众号「发草稿」步骤：由 `wa draft` 生成载荷后，经 `bd run` 在已登录的浏览器里执行。
# 载荷：{"title", "author", "html"（图片已内联为 data:）, "cover"（本地路径或空）, "images"（正文图片数）}
# 只保存草稿，不发表。
import re
import time

BODY = ".rich_media_content .ProseMirror"
# 封面设好后，封面区会出现微信图床的背景图（「拖拽或选择封面」按钮本身一直在页面里，不能用来判断）
COVER_SET = """[...document.querySelectorAll("[class*=cover] [style*=background]")].some(e => e.offsetParent && /mmbiz/.test(e.style.backgroundImage))"""
POPUPS = ["我知道了", "稍后再说"]
AUTHOR_MAX = 8  # 公众号作者字数上限


def mark_title_and_author():
    """标题是正文之外的第一个 ProseMirror；作者是带「请输入作者」占位的输入框。打上 data-bd 方便后面选。"""
    return js("""(() => {
      const t = [...document.querySelectorAll(".ProseMirror")].find(e => !e.closest(".rich_media_content"));
      if (t) t.setAttribute("data-bd", "title");
      const a = [...document.querySelectorAll("input, textarea, [contenteditable=true]")]
        .find(e => /请输入作者/.test(e.getAttribute("placeholder") || e.getAttribute("data-placeholder") || e.textContent || ""));
      if (a) a.setAttribute("data-bd", "author");
      return (t ? "title" : "") + (a ? "+author:" + a.tagName : "");
    })()""")


def set_author(author):
    """作者是普通 input。逐字按键（fill_input）在这里会把每个中文字打两遍；
    直接改 value 页面又不认（字数计数不更新、保存被「作者不能超过8个字」拦下）。
    可靠做法：全选 → 原生 insertText → 补一个 keyup（页面在 keyup 时重新计数）→ 失焦。"""
    js("""(() => { const el = document.querySelector('[data-bd="author"]'); el.focus(); el.select(); })()""")
    cdp("Input.insertText", text=author)
    key = dict(key="End", code="End", windowsVirtualKeyCode=35)
    cdp("Input.dispatchKeyEvent", type="keyDown", **key)
    cdp("Input.dispatchKeyEvent", type="keyUp", **key)
    js("""document.querySelector('[data-bd="author"]').blur()""")
    time.sleep(0.5)
    value = js("""document.querySelector('[data-bd="author"]').value""")
    if value != author:
        fail(f"作者没填对：期望「{author}」，实际「{value}」")
    if visible_text_exists(f"作者不能超过{AUTHOR_MAX}个字"):
        fail(f"作者「{author}」超过公众号限制")


def open_editor():
    url = open_tab("https://mp.weixin.qq.com/", reuse="mp.weixin.qq.com/cgi-bin/")
    token = re.search(r"token=(\d+)", url)
    if not token:
        fail("没有登录公众号后台：请在浏览器打开 https://mp.weixin.qq.com 扫码登录后重试")
    goto_url(f"https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&token={token[1]}&lang=zh_CN")
    wait_for_load()
    wait_until(f"!!document.querySelector({js_str(BODY)})", timeout=30, what="图文编辑器加载")
    time.sleep(2)
    dismiss(POPUPS)


def fill_title_author():
    found = mark_title_and_author()
    if "title" not in found:
        fail("找不到标题输入框，编辑器页面可能改版了")
    if not set_editable_text('[data-bd="title"]', PAYLOAD["title"]):
        fail("标题没填进去")
    log(f"标题：{PAYLOAD['title']}")
    author = PAYLOAD.get("author")
    if author and "author" in found:
        if len(author) > AUTHOR_MAX:
            fail(f"作者「{author}」超过公众号限制的 {AUTHOR_MAX} 个字")
        set_author(author)
        log(f"作者：{author}")


def paste_body():
    paste_html(BODY, PAYLOAD["html"])
    # 公众号会弹「内容结构检测」（只是建议）：记下提示后继续插入
    time.sleep(4)
    if visible_text_exists("继续插入"):
        report = js("""(() => {
          const d = [...document.querySelectorAll("*")].find(e => e.offsetParent && (e.innerText || "").startsWith("内容结构检测") && e.innerText.includes("继续插入"));
          return d ? (d.innerText.match(/第 \\d+ 段\\s*\\n\\s*[^\\n]+/g) || []).map(s => s.replace(/\\s+/g, " ")).join("\\n") : "";
        })()""")
        log("编辑器「内容结构检测」提示（建议项，已继续插入）：\n" + (report or "（未读到明细）"))
        click_text("继续插入")
    expected = PAYLOAD.get("images", 0)
    wait_until(f"""(() => {{ const e = document.querySelector({js_str(BODY)});
      return e && e.innerText.trim().length > 50 && e.querySelectorAll('img[src*="mmbiz"]').length >= {expected}; }})()""",
               timeout=60, what=f"正文粘贴完成、{expected} 张图片转存到微信图床")
    log(f"正文已粘贴，{expected} 张图片已转存")


def set_cover():
    cover = PAYLOAD.get("cover")
    if not cover:
        log("没有指定封面，跳过（发布前在后台设置）")
        return
    # 悬停出菜单。用 JS 派发 mouseover：CDP 的 mouseMoved 在这个页面上会卡住
    hovered = js("""(() => { const e = document.querySelector(".js_share_type_none_image");
      if (!e) return false; e.scrollIntoView({block: "center"});
      for (const el of [e, e.parentElement, e.parentElement.parentElement])
        for (const type of ["mouseover", "mouseenter"]) el.dispatchEvent(new MouseEvent(type, {bubbles: true}));
      return true; })()""")
    if not hovered:
        fail("找不到「拖拽或选择封面」，编辑器页面可能改版了")
    time.sleep(1)
    if not click_text("从图片库选择"):
        fail("封面菜单里没有「从图片库选择」")
    wait_until("""[...document.querySelectorAll("input[type=file]")].some(i => /image\\/bmp/.test(i.accept))""",
               what="图片库弹窗")
    js("""(() => { const i = [...document.querySelectorAll("input[type=file]")].find(i => /image\\/bmp/.test(i.accept)); i.setAttribute("data-bd", "cover-input"); })()""")
    upload('[data-bd="cover-input"]', cover)
    log("封面上传中")
    # 上传完成后图片会出现在列表里并被选中，「下一步」变成可点
    wait_until("""(() => { const b = [...document.querySelectorAll("button")].find(e => e.offsetParent && e.textContent.trim() === "下一步");
      return b && !b.disabled && !/disabled/.test(b.className); })()""", timeout=60, what="封面上传完成")
    click_text("下一步")
    time.sleep(2)
    for confirm in ("确认", "完成", "确定"):
        if click_text(confirm):
            break
    wait_until(COVER_SET, timeout=20, what="封面设置完成")
    log("封面已设置")


def save_draft():
    """以保存后弹出的绿色提示「已保存」为准（同时会多一条「手动保存」历史版本）。
    底栏的「HH:MM 已保存」不会刷新，URL 里的 appmsgid 来自自动保存，都不能用来判断。"""
    click_text("保存为草稿")
    start = time.time()
    while time.time() - start < 30:
        time.sleep(0.5)
        for err in (f"作者不能超过{AUTHOR_MAX}个字", "标题不能为空", "正文不能为空"):
            if visible_text_exists(err):
                fail(f"保存被拦下：{err}")
        if visible_text_exists("已保存"):
            break
    else:
        fail("保存草稿超时：没有看到「已保存」提示")
    appmsgid = re.search(r"appmsgid=(\d+)", page_info()["url"])[1]
    log(f"已保存为草稿（appmsgid={appmsgid}）")
    return appmsgid


open_editor()
fill_title_author()
paste_body()
set_cover()
shot("wechat-draft")
appmsgid = save_draft()
print(f"✓ 公众号草稿已保存：{PAYLOAD['title']}（appmsgid={appmsgid}）。到后台草稿箱预览，确认后由你发表。")
