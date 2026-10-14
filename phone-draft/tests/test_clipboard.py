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
