"""步骤脚本用 `from phone_draft import *` 取得这些函数。"""
from .clipboard import paste_html
from .core import OUT_DIR, PAYLOAD, check_readback, fail, log, read_copy
from .device import (device, dismiss, fail_with_ui, hide_keyboard, open_app, paste, shot, tap_desc, tap_id, tap_text,
                     text_exists, type_text, ui_texts, wait_text)
from .media import check_newest, clean_media, push_media

__all__ = ["PAYLOAD", "OUT_DIR", "log", "fail", "read_copy", "check_readback", "device", "open_app",
           "text_exists", "wait_text", "tap_text", "tap_desc", "tap_id", "dismiss", "hide_keyboard", "type_text", "paste", "ui_texts",
           "shot", "fail_with_ui", "paste_html", "push_media", "check_newest", "clean_media"]
