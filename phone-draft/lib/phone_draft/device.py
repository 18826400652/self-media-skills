"""uiautomator2 操作：按文字找控件、等待、输入、截图。失败时留下截图和界面文字。"""
import os
import time
import xml.etree.ElementTree as ET

import uiautomator2 as u2

from .connect import DeviceUnavailable, ensure_connected
from .core import OUT_DIR, fail, is_forbidden, log
from .screen import screen_state

APP_START_WAIT = 3
_device = None


def device():
    global _device
    if _device is None:
        try:
            serial = ensure_connected()
        except DeviceUnavailable as err:
            fail(str(err))
        _device = u2.connect(serial)
        ensure_screen_ready()
    return _device


def _state(d):
    return screen_state(d.shell("dumpsys power").output, d.shell("dumpsys window").output)


def ensure_screen_ready():
    d = _device
    if _state(d) == "off":
        d.screen_on()
        time.sleep(1)
        d.swipe_ext("up", scale=0.8)
        time.sleep(1)
    if _state(d) != "ready":
        fail("手机锁着屏，请先解锁手机（或在设置里把自动锁屏时间调长）后重试")


def open_app(package):
    device().app_start(package, stop=True)
    time.sleep(APP_START_WAIT)


def _selector(text, contains):
    return device()(textContains=text) if contains else device()(text=text)


def text_exists(text, contains=False):
    return _selector(text, contains).exists


def wait_text(text, timeout=15, contains=False, what=None):
    if not _selector(text, contains).wait(timeout=timeout):
        fail_with_ui(f"等了 {timeout} 秒没出现「{text}」（{what or '页面就绪'}）")


def tap_text(text, contains=False, timeout=10):
    sel = _selector(text, contains)
    if not sel.wait(timeout=timeout):
        fail_with_ui(f"找不到「{text}」")
    actual = sel.get_text() or text
    if is_forbidden(actual):
        fail(f"拒绝点击「{actual}」：只存草稿，发布由你在手机上确认后操作")
    sel.click()


def tap_desc(desc, contains=False, timeout=10, allow_forbidden=False):
    """按无障碍描述点击（抖音等 App 的 resource-id 是混淆过的，描述更稳定）。
    allow_forbidden 只给「进入发布页」的入口用（如小红书底部的「+」，描述就叫「发布」），不能用于真正的发布按钮。"""
    sel = device()(descriptionContains=desc) if contains else device()(description=desc)
    if not sel.wait(timeout=timeout):
        fail_with_ui(f"找不到描述为「{desc}」的控件")
    actual = sel.info.get("contentDescription") or desc
    if is_forbidden(actual) and not allow_forbidden:
        fail(f"拒绝点击「{actual}」：只存草稿，发布由你在手机上确认后操作")
    sel.click()


def tap_id(resource_id, timeout=10):
    sel = device()(resourceId=resource_id)
    if not sel.wait(timeout=timeout):
        fail_with_ui(f"找不到控件 {resource_id}")
    label = sel.get_text() or ""
    if is_forbidden(label):
        fail(f"拒绝点击「{label}」：只存草稿")
    sel.click()


def dismiss(texts, rounds=2):
    for _ in range(rounds):
        for t in texts:
            if text_exists(t):
                device()(text=t).click()
                log(f"关掉提示：{t}")
                time.sleep(1)


def type_text(text):
    device().send_keys(text, clear=False)


def paste():
    device().shell("input keyevent 279")


def ui_texts():
    root = ET.fromstring(device().dump_hierarchy())
    out = []
    for node in root.iter("node"):
        label = node.get("text") or node.get("content-desc") or ""
        if label.strip():
            out.append((label, node.get("resource-id", ""), node.get("bounds", "")))
    return out


def shot(name):
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, f"{name}.png")
    device().screenshot(path)
    log(f"截图：{path}")
    return path


def fail_with_ui(msg):
    stamp = time.strftime("%H%M%S")
    try:
        shot(f"{stamp}-fail")
        dump = os.path.join(OUT_DIR, f"{stamp}-fail.txt")
        with open(dump, "w", encoding="utf-8") as f:
            f.writelines(f"{t}\t{rid}\t{b}\n" for t, rid, b in ui_texts())
        log(f"界面文字：{dump}")
    except Exception as err:  # 留证据失败不应掩盖原始错误
        log(f"保存失败现场时出错：{err}")
    fail(msg)
