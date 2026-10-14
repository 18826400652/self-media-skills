"""HTML 处理：缩小内联图、按根元素的直接子节点切段、把图片单独拆出来（给只能从相册插图的编辑器）。"""
import base64
import io
import os
import re
from html.parser import HTMLParser

CLIP_LIMIT = 300_000      # 一次粘贴的 HTML 字符数上限：Android 剪贴板（binder）约 1MB，HTML 按 UTF-16 存且另附纯文本
IMAGE_LIMIT = 200_000     # 单张内联图超过这个字符数就重新编码成 JPEG
JPEG_QUALITY = 80
MAX_WIDTH = 1080
VOID_TAGS = {"area", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}
DATA_IMAGE = re.compile(r'src="(data:image/[a-z+]+;base64,([A-Za-z0-9+/=]+))"')


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


def _root_parts(html):
    """(根开标签, 子节点源码列表, 根闭标签)"""
    open_end = html.index(">") + 1
    close_start = html.rindex("</")
    parser = _ChildBounds(html)
    parser.feed(html)
    bounds = [open_end] + parser.ends + [close_start]
    kids = [html[a:b] for a, b in zip(bounds, bounds[1:]) if html[a:b]]
    return html[:open_end], kids, html[close_start:]


IMG_ONLY = re.compile(r'^\s*<(\w+)[^>]*>\s*<img\b[^>]*\bsrc="([^"]+)"[^>]*>\s*</\1>\s*$', re.S)


def split_images(html):
    """按顺序切成 [("html", 片段), ("image", src), …]：只装着一张图的子节点（如 <p><img></p>）单独成项，
    其余连续的子节点合成一段，并套上原来的根标签。"""
    head, kids, tail = _root_parts(html)
    parts, buf = [], []
    for kid in kids:
        m = IMG_ONLY.match(kid)
        if m:
            if "".join(buf).strip():
                parts.append(("html", head + "".join(buf) + tail))
            buf = []
            parts.append(("image", m.group(2)))
        else:
            buf.append(kid)
    if "".join(buf).strip():
        parts.append(("html", head + "".join(buf) + tail))
    return parts


def save_data_uri(uri, path_base):
    """data:image/xxx;base64,… 写成文件，返回路径（扩展名按图片类型）。"""
    m = re.match(r"data:image/([a-z+]+);base64,(.*)$", uri, re.S)
    if not m:
        raise ValueError(f"不是内联图片：{uri[:40]}…")
    ext = {"jpeg": ".jpg", "svg+xml": ".svg"}.get(m.group(1), "." + m.group(1))
    path = path_base + ext
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "wb") as f:
        f.write(base64.b64decode(m.group(2)))
    return path
