from phone_draft.screen import screen_state

AWAKE = "  mWakefulness=Awake\n"
ASLEEP = "  mWakefulness=Asleep\n"


def test_asleep_is_off():
    assert screen_state(ASLEEP, "") == "off"


def test_awake_with_keyguard_is_locked():
    assert screen_state(AWAKE, "    mKeyguardShowing=true\n") == "locked"
    assert screen_state(AWAKE, "  isKeyguardShowing=true\n") == "locked"


def test_awake_without_keyguard_is_ready():
    assert screen_state(AWAKE, "    mKeyguardShowing=false\n") == "ready"
