# browser-draft 公共函数：bd run 会把本文件拼在步骤脚本前面，一起交给 browser-harness 执行。
# browser-harness 的 helpers（js、cdp、new_tab、switch_tab、capture_screenshot…）已预先导入。
import json
import re
import os
import time

OUT_DIR = os.environ.get("BD_OUT", "/tmp/browser-draft")
_payload_path = os.environ.get("BD_PAYLOAD", "")
PAYLOAD = json.load(open(_payload_path, encoding="utf-8")) if _payload_path else {}

# 只发草稿：这些按钮永远不点，发布由人在确认后操作
FORBIDDEN_CLICKS = ("发表", "发布", "群发", "立即发布", "定时发布")


def log(msg):
    print(f"· {msg}", flush=True)


def fail(msg):
    print(f"✗ {msg}", flush=True)
    raise SystemExit(2)


def js_str(value):
    """Python 值 → JS 字面量，拼进 js() 表达式用。"""
    return json.dumps(value, ensure_ascii=False)


def find_tab(url_part):
    for t in cdp("Target.getTargets")["targetInfos"]:
        if t["type"] == "page" and url_part in t["url"]:
            return t["targetId"]
    return None


def open_tab(url, reuse=None):
    """切到 URL 含 reuse 的已有标签页，没有就新开。browser-harness 每次调用连的标签页不固定，必须先切。"""
    tid = find_tab(reuse) if reuse else None
    if tid:
        switch_tab(tid)
    else:
        new_tab(url)
    wait_for_load()
    return page_info()["url"]


def wait_until(expr, timeout=15.0, interval=0.5, what="页面就绪"):
    """反复求值 JS 表达式，直到为真，返回它的值。"""
    end = time.time() + timeout
    while time.time() < end:
        try:
            value = js(expr)
        except Exception:
            value = None
        if value:
            return value
        time.sleep(interval)
    fail(f"等待超时：{what}")


def visible_text_exists(text):
    return js(f"""[...document.querySelectorAll("button, a, span, div")].some(e => e.offsetParent && e.childElementCount <= 2 && e.textContent.trim() === {js_str(text)})""")


def click_text(text, host=None, allow_forbidden=False):
    """点击文字完全等于 text 的可见按钮或链接，返回是否点到。
    host：按钮在某个自定义元素的 shadow DOM 里时，传这个元素的选择器（闭合的 shadow root 若挂在 _sr 上也能找到）。"""
    if text in FORBIDDEN_CLICKS and not allow_forbidden:
        fail(f"拒绝点击「{text}」：只发草稿，发布由人操作")
    root = "document" if host is None else f"""(() => {{ const h = document.querySelector({js_str(host)}); return h && (h.shadowRoot || h._sr); }})()"""
    return js(f"""(() => {{
      const root = {root};
      if (!root) return false;
      const els = [...root.querySelectorAll("button, a, span, div, li")]
        .filter(e => e.childElementCount <= 2 && e.textContent.trim() === {js_str(text)} && e.getClientRects().length);
      const el = els.find(e => /^(BUTTON|A)$/.test(e.tagName)) || els[els.length - 1];
      if (!el) return false;
      el.scrollIntoView({{block: "center"}});
      el.click();
      return true;
    }})()""")


def dismiss(texts, rounds=3):
    """关掉功能介绍之类的弹窗：依次点「我知道了」「稍后再说」等。不开通任何东西。"""
    for _ in range(rounds):
        clicked = [t for t in texts if click_text(t)]
        if not clicked:
            return
        log(f"关闭弹窗：{'、'.join(clicked)}")
        time.sleep(1.5)


def set_editable_text(selector, text):
    """给 contenteditable（ProseMirror 等）换成纯文本，用 execCommand 走编辑器自己的输入流程。"""
    return js(f"""(() => {{
      const el = document.querySelector({js_str(selector)});
      if (!el) return false;
      el.focus();
      const r = document.createRange(); r.selectNodeContents(el);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      document.execCommand("delete");
      document.execCommand("insertText", false, {js_str(text)});
      return el.innerText.trim() === {js_str(text)}.trim();
    }})()""")


def paste_html(selector, html, chunk=40000):
    """把 HTML 粘贴进编辑器。先试合成的 paste 事件（tiptap 等多数编辑器认，不碰用户剪贴板）；
    内容没变化再走真实剪贴板 + Ctrl+V（公众号编辑器只认这个，会覆盖用户剪贴板）。
    单条 CDP 消息有大小限制，HTML 分块传进页面。"""
    js("window.__bd_html = ''")
    for i in range(0, len(html), chunk):
        js(f"window.__bd_html += {js_str(html[i:i + chunk])}")
    snapshot = f"(document.querySelector({js_str(selector)}) || {{}}).innerHTML"
    before = js(snapshot)
    if before is None:
        fail(f"找不到编辑器：{selector}")
    js(f"""(() => {{
      const ed = document.querySelector({js_str(selector)});
      ed.focus();
      const s = getSelection(); s.selectAllChildren(ed);
      const dt = new DataTransfer();
      dt.setData("text/html", window.__bd_html);
      dt.setData("text/plain", " ");
      ed.dispatchEvent(new ClipboardEvent("paste", {{clipboardData: dt, bubbles: true, cancelable: true}}));
    }})()""")
    time.sleep(1.5)
    if js(snapshot) != before:
        return
    _paste_via_clipboard(selector)


def _paste_via_clipboard(selector):
    # 浏览器窗口不在前台时 clipboard.write 会一直挂起：打开焦点模拟，并加超时
    cdp("Emulation.setFocusEmulationEnabled", enabled=True)
    cdp("Page.bringToFront")
    ok = js(f"""(async () => {{
      const ed = document.querySelector({js_str(selector)});
      ed.focus();
      const r = document.createRange(); r.selectNodeContents(ed);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      const write = navigator.clipboard.write([new ClipboardItem({{
        "text/html": new Blob([window.__bd_html], {{type: "text/html"}}),
        "text/plain": new Blob([ed.innerText || " "], {{type: "text/plain"}}) }})]).then(() => "ok");
      const timeout = new Promise(r => setTimeout(() => r("写剪贴板超时（浏览器窗口可能不在前台）"), 5000));
      try {{ return await Promise.race([write, timeout]); }} catch (e) {{ return "写剪贴板失败：" + e; }}
    }})()""")
    if ok != "ok":
        fail(f"粘贴失败：{ok}")
    time.sleep(0.5)
    key = dict(key="v", code="KeyV", modifiers=2, windowsVirtualKeyCode=86, nativeVirtualKeyCode=86)
    cdp("Input.dispatchKeyEvent", type="rawKeyDown", commands=["paste"], **key)
    cdp("Input.dispatchKeyEvent", type="keyUp", **key)


def upload(selector, paths):
    """给（通常隐藏的）文件输入框设置本地文件。路径要浏览器能读到：WSL 下会转成 Windows 路径。"""
    paths = [to_browser_path(p) for p in ([paths] if isinstance(paths, str) else paths)]
    upload_file(selector, paths)


def to_browser_path(path):
    """WSL 里的路径交给 Windows 上的浏览器时，要转成 \\\\wsl.localhost\\… 或 C:\\… 形式。"""
    path = os.path.abspath(path)
    if not os.environ.get("BD_WINDOWS_BROWSER"):
        return path
    if path.startswith("/mnt/") and len(path) > 6 and path[6] == "/":
        return f"{path[5].upper()}:\\" + path[7:].replace("/", "\\")
    return f"\\\\wsl.localhost\\{os.environ['WSL_DISTRO_NAME']}" + path.replace("/", "\\")


def shot(name):
    path = os.path.join(OUT_DIR, f"{name}.png")
    capture_screenshot(path)
    log(f"截图：{path}")
    return path


def read_copy(path):
    """读发布文案，格式见 copy_format.parse_copy（bd run 把 copy_format.py 拼在本文件前面）。"""
    try:
        return parse_copy(path)
    except CopyFormatError as err:
        fail(str(err))
