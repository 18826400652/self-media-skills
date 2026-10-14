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


def test_flyme_real_output_dozing_and_locked():
    """2026-10-14 魅族 20 / Flyme 12.6 实测输出。"""
    assert screen_state("  mWakefulness=Dozing\n  mWakefulnessChanging=false\n", "") == "off"
    window = "    mKeyguardOccluded=false mKeyguardOccludedChanged=false\n    isKeyguardShowing=true\n"
    assert screen_state("  mWakefulness=Awake\n", window) == "locked"
