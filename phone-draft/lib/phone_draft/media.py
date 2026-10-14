"""把图片、视频推进手机相册（DCIM/phone-draft），用完清理。"""
import os
import time

from .core import log
from .device import device

REMOTE_DIR = "/sdcard/DCIM/phone-draft"
PUSH_GAP = 1.1  # 秒：让每个文件的「添加时间」不同，相册排序才稳定


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
