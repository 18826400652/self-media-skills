import json

import pytest

from phone_draft import core


@pytest.mark.parametrize("text", ["发布", "发表", "群发", "立即发布", "发布笔记", " 发布 ", "定时发布", "发作品", "限时日常", " 限时日常"])
def test_publish_buttons_are_forbidden(text):
    assert core.is_forbidden(text)


@pytest.mark.parametrize("text", ["存草稿", "保存草稿", "暂存离开", "保存", "下一步", "草稿箱", "发布草稿到草稿箱"])
def test_draft_buttons_are_allowed(text):
    assert not core.is_forbidden(text)


def test_readback_equal_ignores_whitespace():
    core.check_readback("一条 消息\n", "一条消息", "标题")


def test_readback_truncated_mentions_truncation(capsys):
    with pytest.raises(SystemExit):
        core.check_readback("这是一个超过二十个字的小红书标题会被截断掉吧", "这是一个超过二十个字的小红书标题会被", "标题")
    assert "截断" in capsys.readouterr().out


def test_readback_mismatch_fails(capsys):
    with pytest.raises(SystemExit):
        core.check_readback("甲", "乙", "标题")
    assert "标题" in capsys.readouterr().out


def test_payload_loaded_from_env(tmp_path, monkeypatch):
    p = tmp_path / "payload.json"
    p.write_text(json.dumps({"title": "x"}), encoding="utf-8")
    monkeypatch.setenv("PD_PAYLOAD", str(p))
    assert core.load_payload() == {"title": "x"}
    monkeypatch.delenv("PD_PAYLOAD")
    assert core.load_payload() == {}


def test_read_copy_fails_cleanly_on_bad_file(tmp_path, capsys):
    p = tmp_path / "文案.md"
    p.write_text("## 正文\nx\n", encoding="utf-8")
    with pytest.raises(SystemExit):
        core.read_copy(str(p))
    assert "标题" in capsys.readouterr().out
