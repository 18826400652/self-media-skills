"""把图片、视频推进手机相册（DCIM/phone-draft），用完清理。"""
import os
import re
import time

from .core import fail, log
from .device import device

REMOTE_DIR = "/sdcard/DCIM/phone-draft"
PUSH_GAP = 1.1  # 秒：让每个文件的「添加时间」不同，相册排序才稳定
NEWEST_QUERY = ("content query --uri content://media/external/file --projection _display_name:date_added"
                " --where 'media_type IN (1,3)' --sort 'date_added DESC'")
DISPLAY_NAME = re.compile(r"_display_name=([^,]+),")


def remote_names(paths, stamp):
    return [f"{REMOTE_DIR}/pd{stamp}_{i:02d}{os.path.splitext(p)[1].lower()}" for i, p in enumerate(paths, start=1)]


def _scan(remote):
    device().shell(f"am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file://{remote}")


def push_media(paths):
    d = device()
    d.shell(f"mkdir -p {REMOTE_DIR}")
    remotes = remote_names(paths, time.strftime("%m%dT%H%M%S"))
    for local, remote in zip(paths, remotes):
        d.push(local, remote)
        _scan(remote)
        time.sleep(PUSH_GAP)
    log(f"已推送 {len(remotes)} 个文件到相册 {REMOTE_DIR}")
    return remotes


def clean_media():
    d = device()
    files = d.shell(f"ls {REMOTE_DIR} 2>/dev/null").output.split()
    for name in files:
        d.shell(f"rm -f {REMOTE_DIR}/{name}")
        _scan(f"{REMOTE_DIR}/{name}")
    if files:
        log(f"已清理相册里的 {len(files)} 个临时文件")


def newest_names(query_output):
    return DISPLAY_NAME.findall(query_output)


def newest_matches(names, remotes):
    """相册最前面的几项正好是刚推的文件（最新的排最前）。"""
    expected = [os.path.basename(r) for r in reversed(remotes)]
    return names[:len(expected)] == expected


def check_newest(remotes):
    """选相册格子前确认最新的就是我们推的：运行中进来新照片（截图、微信自动保存）会让格子错位，选到别的照片。"""
    names = newest_names(device().shell(NEWEST_QUERY).output)
    if not newest_matches(names, remotes):
        fail(f"相册里最新的不是刚推的文件（最新几项：{', '.join(names[:3])}）：运行中有新照片进了相册，"
             "为避免把别的照片放进草稿已停下，请重试")
