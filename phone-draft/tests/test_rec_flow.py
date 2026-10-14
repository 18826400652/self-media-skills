"""rec.record 的流程：失败时也要停录屏、恢复开关；隐私拒绝不留现场文件。"""
import types

import pytest

from phone_draft import rec
from phone_draft.apps import deepseek, doubao


class FakeRecorder:
    def __init__(self, *a):
        self.stopped = 0

    def start(self):
        pass

    def now(self):
        return 1.0

    def stop(self):
        self.stopped += 1


def fake_app(calls, send_fails=True):
    def send():
        if send_fails:
            raise SystemExit(2)
    return types.SimpleNamespace(
        DONE_DESC=None, open_new_chat=lambda: None, current_toggles=lambda: (True, True),
        set_toggles=lambda t, s: calls.append((t, s)), prepare_input=lambda: None, focus_input=lambda: None,
        input_text=lambda: "问", send=send)


def test_record_restores_toggles_and_stops_recorder_on_failure(monkeypatch, tmp_path):
    calls, recs = [], []
    prompt = tmp_path / "q.txt"
    prompt.write_text("问", encoding="utf-8")
    monkeypatch.setattr(rec, "load_app", lambda name: fake_app(calls))
    phone = types.SimpleNamespace(shell=lambda cmd: types.SimpleNamespace(output="1"), serial="s", clipboard="用户复制的内容")

    def typing(text):
        phone.clipboard = text[-2:]  # uiautomator2 打字是经剪贴板粘贴的

    monkeypatch.setattr(rec, "device", lambda: phone)
    monkeypatch.setattr(rec, "Recorder", lambda *a: recs.append(FakeRecorder()) or recs[-1])
    monkeypatch.setattr(rec, "_labels", lambda: [])
    monkeypatch.setattr(rec, "_type", typing)
    monkeypatch.setattr(rec.time, "sleep", lambda s: None)
    with pytest.raises(SystemExit):
        rec.record("deepseek", str(prompt), str(tmp_path / "o.mp4"))
    assert calls == [(False, False), (True, True)]
    assert recs[0].stopped >= 1
    assert phone.clipboard == "用户复制的内容"


@pytest.mark.parametrize("mod, labels", [
    (doubao, ["新对话", "我家孩子的私人对话内容很长很长"]),
    (deepseek, ["开启新对话", "第一条私人消息", "第二条私人消息"]),
])
def test_privacy_refusal_leaves_no_dump(monkeypatch, mod, labels, capsys):
    monkeypatch.setattr(mod, "fail_with_ui", lambda msg: pytest.fail("隐私拒绝不能留截图和界面文字"))
    with pytest.raises(SystemExit):
        mod.refuse_if_not_empty(labels)
    out = capsys.readouterr().out
    assert "私人对话内容很长很长" not in out and "第二条私人消息" not in out
