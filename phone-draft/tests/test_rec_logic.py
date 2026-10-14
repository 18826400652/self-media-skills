from phone_draft.rec_logic import (OUT_H, OUT_W, answer_done, chip_on, content_labels, dnd_on, pad_color,
                                   rec_info, same_text, type_plan, video_filter)


def test_type_plan_short_text_two_chars_each():
    assert type_plan("帮我写一条消息") == ["帮我", "写一", "条消", "息"]


def test_type_plan_long_text_at_most_40_steps():
    steps = type_plan("字" * 195)
    assert len(steps) <= 40 and "".join(steps) == "字" * 195


def test_type_plan_keeps_newlines_as_own_items():
    steps = type_plan("第一行\n「第二行」")
    assert "\n" in steps
    assert "".join(steps) == "第一行\n「第二行」"
    assert all(s == "\n" or "\n" not in s for s in steps)


def test_same_text_ignores_whitespace():
    assert same_text("第一行\n第二行 ", "第一行 第二行")
    assert not same_text("第一行", "第一行。")


def test_content_labels_drops_status_bar_items():
    items = [("支付宝通知：", "", "[146,10][202,116]"), ("5:23", "com.android.systemui:id/clock", "[56,38][137,87]"),
             ("开启新对话", "", "[985,153][1048,216]")]
    assert content_labels(items) == ["开启新对话"]


BASE = ["开启新对话", "帮我写一条消息"]


def test_answer_done_after_new_text_stable_three_polls():
    after = ["帮我写一条消息", "阿杰，图麻烦发我一下", "复制"]
    assert answer_done([after] * 4, BASE, "帮我写一条消息")


def test_answer_not_done_when_only_prompt_appeared():
    thinking = ["开启新对话", "帮我写一条消息"]
    assert not answer_done([thinking] * 6, BASE, "帮我写一条消息")


def test_answer_not_done_when_only_hint_reappeared():
    before_typing = ["新对话", "发消息或按住说话..."]
    before_send = ["新对话", "帮我写一条消息"]
    thinking = ["新对话", "帮我写一条消息", "发消息或按住说话..."]
    assert not answer_done([thinking] * 6, before_typing + before_send, "帮我写一条消息")


def test_answer_not_done_while_text_changing():
    hist = [["阿"], ["阿杰"], ["阿杰，图"], ["阿杰，图麻烦"]]
    assert not answer_done(hist, BASE, "帮我写一条消息")


def test_answer_not_done_without_marker():
    after = ["阿杰，图麻烦发我一下"]
    assert not answer_done([after] * 4, BASE, "帮我写一条消息", marker_ok=False)


def test_chip_on_by_background_color():
    assert chip_on((236, 242, 254))
    assert not chip_on((255, 255, 255))


def test_pad_color_hex():
    assert pad_color((255, 255, 255)) == "0xffffff"
    assert pad_color((1, 2, 3, 255)) == "0x010203"


def test_video_filter_crops_scales_and_pads():
    f = video_filter("0xffffff")
    assert "crop=iw:ih-120:0:120" in f
    assert f"scale=-2:{OUT_H}" in f
    assert f"pad={OUT_W}:{OUT_H}:(ow-iw)/2:0:color=0xffffff" in f
    assert f.startswith("fps=30") and f.endswith("format=yuv420p")


def test_dnd_on():
    assert dnd_on("1\n") and dnd_on("3")
    assert not dnd_on("0") and not dnd_on("null") and not dnd_on("")


def test_rec_info_rounds_and_labels_phone():
    info = rec_info({"typed": 2.0412, "sent": 8.0805, "done": 17.9642}, "deepseek", False, False)
    assert info == {"seconds": 9.88, "pastedAt": 2.04, "sentAt": 8.08, "doneAt": 17.96, "viewport": [1080, 1920],
                    "app": "deepseek", "device": "phone", "think": False, "search": False}


from phone_draft.rec_logic import was_sent


def test_was_sent_when_input_no_longer_holds_prompt():
    assert was_sent("", "第一行\n第二行")
    assert was_sent("发消息或按住说话...", "第一行\n第二行")
    assert not was_sent("第一行 第二行", "第一行\n第二行")


from phone_draft.rec_logic import page_text


def test_page_text_appends_copied_answer():
    assert page_text(["问", "答（前半）"], None) == "问\n答（前半）\n"
    assert page_text(["问"], "完整回答\n第二段") == "问\n\n## 复制的完整回答\n\n完整回答\n第二段\n"


def test_answer_not_done_with_only_short_status_text():
    base = ["新对话", "发消息..."]
    waiting = ["新对话", "帮我写一条消息", "思考中", "发消息..."]
    assert not answer_done([waiting] * 6, base, "帮我写一条消息")


def test_answer_not_done_when_bubble_differs_from_prompt_only_in_spaces():
    base = ["新对话"]
    waiting = ["新对话", "第一行 第二行"]
    assert not answer_done([waiting] * 6, base, "第一行\n第二行")


from phone_draft.rec_logic import accept_copied


def test_accept_copied_needs_change_and_overlap_with_answer():
    labels = ["帮我写", "阿杰，活动页的图大概什么时候能好呀？"]
    assert accept_copied("阿杰，活动页的图大概什么时候能好呀？这边等着上线", "<<pd>>", labels)
    assert not accept_copied("<<pd>>", "<<pd>>", labels)           # 复制没生效
    assert not accept_copied("的图。", "<<pd>>", labels)            # 剪贴板是提问的最后一段
    assert not accept_copied(None, "<<pd>>", labels)
