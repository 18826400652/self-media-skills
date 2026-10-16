import types
import pytest

from phone_draft import apps
from phone_draft.apps import doubao


def test_load_app_known():
    assert apps.load_app("deepseek").PACKAGE == "com.deepseek.chat"
    assert apps.load_app("doubao").PACKAGE == "com.larus.nova"


def test_load_app_unknown_lists_choices(capsys):
    with pytest.raises(SystemExit):
        apps.load_app("kimi")
    assert "deepseek" in capsys.readouterr().out


def test_unexpected_labels_lists_unknown_labels():
    labels = ["新对话", "内容由 AI 生成", "打电话", "视频通话", "拍题答疑", "照片动起来", "发消息或按住说话...",
              "2026年6月黄姓男宝双字水名推荐"]
    assert doubao.unexpected_labels(labels) == ["2026年6月黄姓男宝双字水名推荐"]


def test_doubao_rejects_think_and_search(capsys):
    with pytest.raises(SystemExit):
        doubao.set_toggles(True, False)
    assert "豆包" in capsys.readouterr().out
    doubao.set_toggles(False, False)  # 不报错


from phone_draft.apps import deepseek

DS_CHROME = ["打开侧边栏", "自动朗读", "开启新对话", "发消息或按住说话", "深度思考", "智能搜索", "上传文件", "切换至语音"]


def test_deepseek_empty_chat_allows_any_single_greeting():
    assert deepseek.is_empty_chat(DS_CHROME + ["欢迎回来，想从哪里开始？"])
    assert deepseek.is_empty_chat(DS_CHROME + ["你好，我能帮什么忙吗？"])


def test_deepseek_not_empty_with_history():
    assert not deepseek.is_empty_chat(DS_CHROME + ["帮我写一条微信消息", "阿杰，图麻烦发我一下", "复制", "重新生成"])
    assert not deepseek.is_empty_chat(DS_CHROME + ["帮我写一条微信消息", "阿杰，图麻烦发我一下"])


def test_closest_right_picks_nearest_in_same_row():
    search = {"left": 132, "right": 727, "top": 171, "bottom": 233}
    far = {"left": 925, "right": 1047, "top": 138, "bottom": 260}
    near = {"left": 804, "right": 870, "top": 169, "bottom": 235}
    other_row = {"left": 750, "right": 800, "top": 2142, "bottom": 2297}
    assert doubao.closest_right(search, [far, other_row, near]) == 2
    assert doubao.closest_right(search, [other_row]) is None


def test_unexpected_labels_error_is_short():
    long = "先懂孩子，再教孩子\n" + "很长的私人内容" * 50
    assert len(doubao.short_labels([long, "豆包"])) < 80


def test_send_button_is_lowest_icon_right_of_input():
    box = {"left": 33, "right": 925, "top": 1121, "bottom": 1459}
    expand = {"left": 925, "right": 1047, "top": 1121, "bottom": 1271}
    send = {"left": 925, "right": 1047, "top": 1318, "bottom": 1473}
    assert doubao.send_button(box, [expand, send]) == 1
    assert doubao.send_button(box, [send]) == 0
    assert doubao.send_button(box, []) is None


def test_unexpected_labels_ignores_leftover_input_text():
    labels = ["新对话", "打电话", "用版本二，按阿杰的反应再改一版"]
    assert doubao.unexpected_labels(labels, input_text="用版本二，按阿杰的反应再改一版") == []
    assert doubao.unexpected_labels(labels) == ["用版本二，按阿杰的反应再改一版"]


def test_deepseek_done_marker_is_in_input_bar_not_below_answer():
    # 回答比一屏长时「复制」在屏幕外、不在界面结构里；输入栏的语音键生成时变成停止键，回答完才回来
    assert deepseek.DONE_DESC == "切换至语音"


def test_doubao_new_chat_entries_2026_10():
    """2026-10 版新对话页底部四个入口：打电话、AI 创作、拍题答疑、AI 播客"""
    labels = ["新对话", "内容由 AI 生成", "打电话", "AI 创作", "拍题答疑", "AI 播客", "发消息或按住说话..."]
    assert doubao.unexpected_labels(labels) == []


def test_doubao_update_dialog_action():
    assert doubao.update_dialog_action(["发现新版本", "立即更新", "稍后再说"]) == "稍后再说"
    assert doubao.update_dialog_action(["版本更新", "立即更新", "取消"]) == "取消"
    assert doubao.update_dialog_action(["发现新版本", "立即更新"]) == "manual"
    assert doubao.update_dialog_action(["新对话", "打电话"]) is None


def test_doubao_ui_not_found_becomes_chinese_hint(capsys):
    class UiObjectNotFoundError(Exception):
        pass

    def boom():
        raise UiObjectNotFoundError((-32001, "androidx.test.uiautomator.UiObjectNotFoundException"))

    with pytest.raises(SystemExit):
        doubao.guard_ui(boom)()
    err = capsys.readouterr()
    assert "豆包的界面和脚本预期的不一样" in err.out + err.err


def test_doubao_dismiss_update_dialog_reads_ui_texts_tuples(monkeypatch):
    """ui_texts() 给的是 (文字, id, 位置)，要按文字认弹窗"""
    clicked = []
    monkeypatch.setattr(doubao, "ui_texts", lambda: [("发现新版本", "id/t", "[0,0][1,1]"), ("稍后再说", "id/b", "[0,0][1,1]")])
    monkeypatch.setattr(doubao, "device", lambda: (lambda **kw: type("S", (), {"click": lambda self: clicked.append(kw["text"])})()))
    monkeypatch.setattr(doubao.time, "sleep", lambda s: None)
    doubao.dismiss_update_dialog()
    assert clicked == ["稍后再说"]


class _Sel:
    def __init__(self, exists, clicks):
        self.exists = exists
        self._clicks = clicks

    def click(self):
        self._clicks.append(1)


def test_doubao_done_marker_is_regenerate_under_answer():
    """豆包回答完，回答下面才出现「重新生成」（P-43：之前没有标记，标题变了就当回答完）。
    平常的界面里这个按钮只有 resource-id，没有描述；描述只在另一种渲染里有"""
    assert doubao.DONE_ID == "com.larus.nova:id/msg_action_regenerate"
    assert doubao.DONE_DESC == "重新生成"


@pytest.mark.parametrize("shown, clicked", [(True, 1), (False, 0)])
def test_doubao_follow_answer_taps_scroll_to_bottom(monkeypatch, shown, clicked):
    """提问长到占满屏幕时回答在屏幕外：看到「转至底部」就点，回答和「重新生成」才在屏幕上"""
    clicks, asked = [], []

    def phone(**kw):
        asked.append(kw)
        return _Sel(shown, clicks)

    monkeypatch.setattr(doubao, "device", lambda: phone)
    monkeypatch.setattr(doubao, "_down_arrow", lambda: None)
    doubao.follow_answer()
    assert asked == [{"description": "转至底部"}]
    assert len(clicks) == clicked


def test_doubao_follow_answer_taps_plain_down_arrow(monkeypatch):
    """刚发送时的 ↓ 是没有描述的 ImageView：没有「转至底部」时点它"""
    clicks = []
    monkeypatch.setattr(doubao, "device", lambda: (lambda **kw: _Sel(False, clicks)))
    monkeypatch.setattr(doubao, "_down_arrow", lambda: _Sel(True, clicks))
    doubao.follow_answer()
    assert len(clicks) == 1


def _b(l, t, r, b):
    return {"left": l, "top": t, "right": r, "bottom": b}


def test_doubao_down_arrow_is_centered_just_above_input():
    """2026-10 实测（1080 宽）：↓ 在 [477,1825][603,1951]，输入区分隔线从 y 1968 开始"""
    splitter = _b(0, 1968, 1080, 1971)
    arrow, send, title_icon = _b(477, 1825, 603, 1951), _b(935, 2154, 1003, 2283), _b(500, 60, 580, 140)
    assert doubao.down_arrow_index(splitter, [send, title_icon, arrow], 1080) == 2
    assert doubao.down_arrow_index(splitter, [send, title_icon], 1080) is None
    assert doubao.down_arrow_index(None, [arrow], 1080) is None


def test_doubao_reveal_done_swipes_up_a_little(monkeypatch):
    swipes = []
    phone = types.SimpleNamespace(info={"displayWidth": 1080, "displayHeight": 2400},
                                  swipe=lambda *a, **kw: swipes.append(a))
    monkeypatch.setattr(doubao, "device", lambda: phone)
    doubao.reveal_done()
    (x1, y1, x2, y2), = [s[:4] for s in swipes]
    assert x1 == x2 == 540 and y1 > y2 and y1 - y2 <= 600
