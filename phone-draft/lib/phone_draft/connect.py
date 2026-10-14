"""找到可用的手机：解析 adb devices、选序列号、无线断线后用上次地址自动重连。"""
import os
import subprocess
from pathlib import Path

ONLINE = "device"
ADB_TIMEOUT = 30
CONNECTED_MARKERS = ("connected to", "already connected")
PAIR_HELP = ("第一次用：手机「开发者选项 → 无线调试 → 使用配对码配对设备」，"
             "执行 adb pair IP:配对端口 配对码，再 pd connect IP:连接端口")
RECONNECT_HELP = ("到手机「开发者选项 → 无线调试」页看「IP 地址和端口」（重启或换网络后端口会变），"
                  "执行 pd connect IP:端口；或者加 --via browser 改用浏览器")


class DeviceUnavailable(Exception):
    pass


def adb(args):
    proc = subprocess.run(["adb", *args], capture_output=True, text=True, timeout=ADB_TIMEOUT)
    return (proc.stdout + proc.stderr).strip()


def _state_file():
    return Path(os.environ.get("PD_STATE_DIR", Path.home() / ".config" / "phone-draft")) / "last-address"


def load_last_address():
    f = _state_file()
    return f.read_text().strip() if f.exists() else None


def save_last_address(addr):
    f = _state_file()
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(addr)


def parse_devices(output):
    devices = []
    for line in output.splitlines():
        parts = line.split()
        if len(parts) >= 2 and not line.startswith("List of devices") and not line.startswith("*"):
            devices.append((parts[0], parts[1]))
    return devices


def pick_serial(devices, preferred):
    online = [serial for serial, state in devices if state == ONLINE]
    for want in (os.environ.get("ANDROID_SERIAL"), preferred):
        if want and want in online:
            return want
    return online[0] if online else None


def ensure_connected(run=adb):
    last = load_last_address()
    serial = pick_serial(parse_devices(run(["devices"])), last)
    if serial:
        return serial
    if not last:
        raise DeviceUnavailable(f"没有连上手机。{PAIR_HELP}；或者加 --via browser 改用浏览器")
    run(["connect", last])
    serial = pick_serial(parse_devices(run(["devices"])), last)
    if serial:
        return serial
    raise DeviceUnavailable(f"手机没连上（上次的地址 {last} 连不通）。{RECONNECT_HELP}")


def connect(addr=None, run=adb):
    addr = addr or load_last_address()
    if not addr:
        raise DeviceUnavailable(f"没有记住的地址。{PAIR_HELP}")
    out = run(["connect", addr])
    if not any(m in out for m in CONNECTED_MARKERS):
        raise DeviceUnavailable(f"连接 {addr} 失败：{out}。{RECONNECT_HELP}")
    save_last_address(addr)
    return addr
