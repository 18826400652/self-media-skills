"""pd 命令：devices | connect [IP:端口] | ui [名字] | run <步骤.py> [载荷.json] | rec <App> <提问.txt> <输出.mp4>"""
import os
import runpy
import sys

from . import rec
from .connect import DeviceUnavailable, connect, ensure_connected

EXIT_NO_DEVICE = 3
USAGE = "用法：pd devices | pd connect [IP:端口] | pd ui [名字] | pd run <步骤.py> [载荷.json] | pd rec deepseek|doubao <提问.txt> <输出.mp4> [--think] [--search] [--timeout 秒]"


def _no_device(err):
    print(f"✗ {err}", flush=True)
    raise SystemExit(EXIT_NO_DEVICE)


def cmd_devices():
    from .device import _state, device
    d = device()
    info = d.device_info
    battery = d.shell("dumpsys battery | grep -m1 ' level:'").output.strip()
    print(f"✓ {d.serial}  {info.get('brand')} {info.get('model')}  Android {info.get('version')}  {battery}  屏幕：{_state(d)}")


def cmd_ui(name="ui"):
    from .device import shot, ui_texts
    shot(name)
    for text, rid, bounds in ui_texts():
        print(f"{text}\t{rid}\t{bounds}")


def cmd_run(step, payload=None):
    if not os.path.isfile(step):
        print(f"✗ 步骤脚本不存在：{step}")
        raise SystemExit(1)
    os.environ["PD_PAYLOAD"] = os.path.abspath(payload) if payload else ""
    # `python -m phone_draft.cli` 启动时包已导入、PAYLOAD 已读过（当时还没有载荷）：
    # 原地刷新同一个字典，步骤脚本 `from phone_draft import PAYLOAD` 拿到的就是本次载荷
    from .core import PAYLOAD, load_payload
    PAYLOAD.clear()
    PAYLOAD.update(load_payload())
    ensure_connected()
    runpy.run_path(step, run_name="__main__")


def main(argv):
    cmd, args = (argv[0], argv[1:]) if argv else ("", [])
    try:
        if cmd == "devices":
            ensure_connected()
            return cmd_devices()
        if cmd == "connect":
            print(f"✓ 已连接 {connect(args[0] if args else None)}")
            return None
        if cmd == "ui":
            ensure_connected()
            return cmd_ui(*args[:1])
        if cmd == "run" and args:
            return cmd_run(*args[:2])
        if cmd == "rec" and args:
            opts = rec.parse_args(args)
            ensure_connected()
            rec.record(**opts)
            return None
    except DeviceUnavailable as err:
        _no_device(err)
    print(USAGE, file=sys.stderr)
    raise SystemExit(1)


if __name__ == "__main__":
    main(sys.argv[1:])
