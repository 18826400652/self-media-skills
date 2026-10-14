import json
import re

from phone_draft.clipboard import copy_steps


def chunks_from(steps):
    return [json.loads(m.group(1)) for s in steps for m in [re.match(r"window\.__pd\.push\((.*)\)$", s, re.S)] if m]


def test_small_html_is_one_chunk_and_ends_with_copy():
    steps = copy_steps("<p>你好</p>")
    assert steps[0] == "window.__pd = []"
    assert chunks_from(steps) == ["<p>你好</p>"]
    assert "execCommand('copy')" in steps[-1]


def test_large_html_is_split_and_reassembles_exactly():
    html = "<p>" + "图" * 450_001 + "</p>" + '<img src="data:image/png;base64,QUJD">'
    steps = copy_steps(html, chunk=200_000)
    parts = chunks_from(steps)
    assert len(parts) == 3
    assert all(len(p) <= 200_000 for p in parts)
    assert "".join(parts) == html


def test_quotes_and_script_tags_are_escaped_safely():
    html = "<p>'\"</script> </p>"
    assert "".join(chunks_from(copy_steps(html))) == html


# ---- 大内容：缩图 + 分块（Android 剪贴板一次只能放约 1MB）----
import base64
import io

import pytest
from PIL import Image

from phone_draft.clipboard import html_chunks, shrink_data_images


def png_data_uri(size=(1200, 1600)):
    buf = io.BytesIO()
    Image.effect_noise(size, 60).convert("RGB").save(buf, "PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def test_shrink_reencodes_big_images_as_smaller_jpeg():
    big = png_data_uri()
    html = f'<p>a</p><img src="{big}"><img src="data:image/png;base64,QUJD">'
    out = shrink_data_images(html, max_chars=150_000)
    srcs = re.findall(r'src="([^"]+)"', out)
    assert srcs[0].startswith("data:image/jpeg;base64,") and len(srcs[0]) <= 150_000
    assert srcs[1] == "data:image/png;base64,QUJD"  # 小图不动
    assert out.startswith("<p>a</p>")


ROOT = '<section id="wenyan" style="font-size: 16px">'


def test_chunks_split_children_and_keep_root_wrapper():
    kids = ["<p>一</p>", '<p><img src="x"></p>', "<h2>二</h2>", "<br>", "<p>三</p>"]
    html = ROOT + "".join(kids) + "</section>"
    chunks = html_chunks(html, limit=len(ROOT) + 30)
    assert len(chunks) > 1
    assert all(c.startswith(ROOT) and c.endswith("</section>") for c in chunks)
    inner = "".join(c[len(ROOT):-len("</section>")] for c in chunks)
    assert inner == "".join(kids)


def test_small_html_is_one_chunk_unchanged():
    html = ROOT + "<p>一</p></section>"
    assert html_chunks(html, limit=10_000) == [html]


def test_single_child_too_big_raises():
    html = ROOT + "<p>" + "字" * 500 + "</p></section>"
    with pytest.raises(ValueError, match="太大"):
        html_chunks(html, limit=200)
