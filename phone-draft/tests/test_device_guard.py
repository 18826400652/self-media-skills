from phone_draft.screen import keyboard_shown, longer_timeout


def test_keyboard_shown_reads_input_method_dump():
    assert keyboard_shown("  mInputShown=true mShowRequested=true")
    assert not keyboard_shown("  mInputShown=false")
    assert not keyboard_shown("")


def test_longer_timeout_only_when_shorter_than_run_need():
    assert longer_timeout("300000") == 1800000
    assert longer_timeout("30000\n") == 1800000
    assert longer_timeout("3600000") is None
    assert longer_timeout("garbage") == 1800000
