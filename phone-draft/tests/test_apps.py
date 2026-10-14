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
