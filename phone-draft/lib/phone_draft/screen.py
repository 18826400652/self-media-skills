"""从 dumpsys 输出判断屏幕状态。"""
import re

KEYGUARD = re.compile(r"(mKeyguardShowing|isKeyguardShowing|mShowingLockscreen)=true")


def screen_state(power_dump, window_dump):
    if "mWakefulness=Awake" not in power_dump:
        return "off"
    return "locked" if KEYGUARD.search(window_dump) else "ready"
