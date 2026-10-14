"""富文本剪贴板：在手机 Edge 里渲染 HTML、选中、复制，再切回 App 粘贴。
手机 Edge 运行时开放 localabstract:chrome_devtools_remote，经 adb forward 用 CDP 驱动。"""
import base64
import io
import json
import re
import time
from html.parser import HTMLParser

import websocket

from .core import fail, log
from .device import device, paste

EDGE = "com.microsoft.emmx"
DEVTOOLS_SOCKET = "localabstract:chrome_devtools_remote"
LOCAL_PORT = 9340
CHUNK = 200_000
CLIP_LIMIT = 300_000      # 一次粘贴的 HTML 字符数上限：Android 剪贴板（binder）约 1MB，HTML 按 UTF-16 存且另附纯文本
IMAGE_LIMIT = 200_000     # 单张内联图超过这个字符数就重新编码成 JPEG
JPEG_QUALITY = 80
MAX_WIDTH = 1080
VOID_TAGS = {"area", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}
DATA_IMAGE = re.compile(r'src="(data:image/[a-z+]+;base64,([A-Za-z0-9+/=]+))"')
SOCKET_WAIT_ROUNDS = 20
COPY_JS = """(() => {
  document.body.innerHTML = window.__pd.join('');
  const range = document.createRange();
  range.selectNodeContents(document.body);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  return document.execCommand('copy');
})()"""


def copy_steps(html, chunk=CHUNK):
    steps = ["window.__pd = []"]
    for i in range(0, len(html), chunk):
        # json.dumps 默认 ensure_ascii，  和 </script> 都安全
        steps.append(f"window.__pd.push({json.dumps(html[i:i + chunk])})")
    steps.append(COPY_JS)
    return steps


def _to_jpeg(b64, max_chars):
    from PIL import Image  # uiautomator2 自带 Pillow
    img = Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGB")
    for width in (MAX_WIDTH, MAX_WIDTH * 3 // 4, MAX_WIDTH // 2):
        scaled = img if img.width <= width else img.resize((width, round(img.height * width / img.width)))
        for quality in (JPEG_QUALITY, 60, 40):
            buf = io.BytesIO()
            scaled.save(buf, "JPEG", quality=quality)
            uri = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
            if len(uri) <= max_chars:
                return uri
    raise ValueError(f"有一张图压缩后仍有 {len(uri)} 字符，超过一次粘贴的上限 {max_chars}")


def shrink_data_images(html, max_chars=IMAGE_LIMIT):
    """内联图太大时重新编码成 JPEG（限宽 1080），小图保持原样。"""
    def repl(m):
        return m.group(0) if len(m.group(1)) <= max_chars else f'src="{_to_jpeg(m.group(2), max_chars)}"'
    return DATA_IMAGE.sub(repl, html)


class _ChildBounds(HTMLParser):
    """找出根元素的每个直接子节点在源码里的结束位置。"""

    def __init__(self, html):
        super().__init__(convert_charrefs=False)
        self.html, self.depth, self.ends = html, 0, []
        self.line_starts = [0] + [i + 1 for i, c in enumerate(html) if c == "\n"]

    def _offset(self):
        line, col = self.getpos()
        return self.line_starts[line - 1] + col

    def handle_starttag(self, tag, attrs):
        if tag in VOID_TAGS:
            self.handle_startendtag(tag, attrs)
            return
        self.depth += 1

    def handle_startendtag(self, tag, attrs):
        if self.depth == 1:
            self.ends.append(self._offset() + len(self.get_starttag_text()))

    def handle_endtag(self, tag):
        if tag in VOID_TAGS:
            return
        self.depth -= 1
        if self.depth == 1:
            self.ends.append(self.html.index(">", self._offset()) + 1)


def html_chunks(html, limit=CLIP_LIMIT):
    """HTML 太大时按根元素的直接子节点切成几段，每段都套上原来的根标签，保留整体样式。"""
    if len(html) <= limit:
        return [html]
    open_end = html.index(">") + 1
    close_start = html.rindex("</")
    head, tail = html[:open_end], html[close_start:]
    parser = _ChildBounds(html)
    parser.feed(html)
    chunks, start, budget = [], open_end, limit - len(head) - len(tail)
    for prev, end in zip([open_end] + parser.ends, parser.ends + [close_start]):
        if end - prev > budget:
            raise ValueError(f"正文里有一段太大（{end - prev} 字符），一次粘贴放不下")
        if end - start > budget:
            chunks.append(head + html[start:prev] + tail)
            start = prev
    chunks.append(head + html[start:close_start] + tail)
    return chunks


def _connect(path):
    # 本机端口不走代理（环境里有 http_proxy）
    return websocket.create_connection(f"ws://127.0.0.1:{LOCAL_PORT}{path}", timeout=60,
                                       suppress_origin=True, http_no_proxy=["127.0.0.1"])


def _browser_call(method, params):
    """手机 Edge 不支持 /json/new，标签页用浏览器级的 Target.* 命令开关。"""
    ws = _connect("/devtools/browser")
    try:
        ws.send(json.dumps({"id": 1, "method": method, "params": params}))
        return json.loads(ws.recv()).get("result", {})
    finally:
        ws.close()


def _open_edge_tab():
    d = device()
    d.shell(f"monkey -p {EDGE} -c android.intent.category.LAUNCHER 1")
    for _ in range(SOCKET_WAIT_ROUNDS):
        if "chrome_devtools_remote" in d.shell("cat /proc/net/unix").output:
            break
        time.sleep(0.5)
    else:
        fail("手机 Edge 没有开放调试接口：确认手机装了 Edge 且「USB 调试」已开")
    d.adb_device.forward(f"tcp:{LOCAL_PORT}", DEVTOOLS_SOCKET)
    target_id = _browser_call("Target.createTarget", {"url": "about:blank"}).get("targetId")
    if not target_id:
        fail("手机 Edge 新开标签页失败")
    return target_id


def _evaluate(ws, expr, msg_id):
    ws.send(json.dumps({"id": msg_id, "method": "Runtime.evaluate",
                        "params": {"expression": expr, "userGesture": True, "returnByValue": True}}))
    while True:
        msg = json.loads(ws.recv())
        if msg.get("id") == msg_id:
            return msg.get("result", {}).get("result", {}).get("value")


def _copy_in_edge(html):
    target_id = _open_edge_tab()
    ws = _connect(f"/devtools/page/{target_id}")
    try:
        copied = None
        for i, expr in enumerate(copy_steps(html), start=1):
            copied = _evaluate(ws, expr, i)
        if copied is not True:
            fail("手机 Edge 复制富文本失败（execCommand('copy') 返回 false）")
    finally:
        ws.close()
        _browser_call("Target.closeTarget", {"targetId": target_id})


def paste_html(html, back_to, focus):
    """把 HTML 带格式粘进 back_to App：focus() 负责点进编辑区，之后光标移到末尾再粘贴。
    内容大时先缩图、再分几段依次粘贴。"""
    try:
        chunks = html_chunks(shrink_data_images(html))
    except ValueError as err:
        fail(str(err))
    for i, chunk in enumerate(chunks, start=1):
        _copy_in_edge(chunk)
        log(f"已复制第 {i}/{len(chunks)} 段富文本（{len(chunk)} 字符）")
        device().shell(f"monkey -p {back_to} -c android.intent.category.LAUNCHER 1")
        time.sleep(2)
        focus()
        device().shell("input keycombination 113 123")  # Ctrl+End：光标移到正文末尾
        time.sleep(0.5)
        paste()
        time.sleep(3)
