import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lib"))
from copy_format import CopyFormatError, parse_copy  # noqa: E402


def write(tmp_path, text):
    p = tmp_path / "文案.md"
    p.write_text(text, encoding="utf-8")
    return str(p)


def test_parses_title_paragraphs_and_topics(tmp_path):
    path = write(tmp_path, "## 标题\n\n一条消息\n\n## 正文\n\n第一段\n\n\n第二段\n\n## 话题\n\n#AI #效率 工具\n")
    assert parse_copy(path) == {"title": "一条消息", "paragraphs": ["第一段", "", "第二段"], "topics": ["AI", "效率"]}


def test_section_titles_only_need_prefix(tmp_path):
    path = write(tmp_path, "## 标题（≤20 字）\n标题A\n## 正文（口语）\n正文\n")
    assert parse_copy(path)["title"] == "标题A"
    assert parse_copy(path)["topics"] == []


def test_missing_title_section_raises(tmp_path):
    with pytest.raises(CopyFormatError, match="标题"):
        parse_copy(write(tmp_path, "## 正文\n正文\n"))


def test_empty_title_raises(tmp_path):
    with pytest.raises(CopyFormatError, match="空"):
        parse_copy(write(tmp_path, "## 标题\n\n## 正文\n正文\n"))
