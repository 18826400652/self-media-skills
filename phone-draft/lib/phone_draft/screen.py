"""从 dumpsys 输出判断屏幕状态。"""
import re

KEYGUARD = re.compile(r"(mKeyguardShowing|isKeyguardShowing|mShowingLockscreen)=true")


def screen_state(power_dump, window_dump):
    if "mWakefulness=Awake" not in power_dump:
        return "off"
    return "locked" if KEYGUARD.search(window_dump) else "ready"


RUN_SCREEN_TIMEOUT = 30 * 60 * 1000  # 毫秒：发草稿期间至少亮屏这么久（等视频导入、图片上传时没有触摸）


def keyboard_shown(input_method_dump):
    return "mInputShown=true" in input_method_dump


def longer_timeout(current):
    """当前自动熄屏时间（settings 的字符串）不够一次运行时，返回要临时设的值；够长返回 None。"""
    try:
        return None if int(current.strip()) >= RUN_SCREEN_TIMEOUT else RUN_SCREEN_TIMEOUT
    except ValueError:
        return RUN_SCREEN_TIMEOUT
