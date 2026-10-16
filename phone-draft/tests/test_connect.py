import pytest

from phone_draft import connect as c

LIST = "List of devices attached\n{}\n"


class FakeAdb:
    """按调用顺序返回预设输出，并记下调用参数。"""

    def __init__(self, *outputs):
        self.outputs = list(outputs)
        self.calls = []

    def __call__(self, args):
        self.calls.append(args)
        return self.outputs.pop(0)


@pytest.fixture(autouse=True)
def state_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("PD_STATE_DIR", str(tmp_path))
    monkeypatch.delenv("ANDROID_SERIAL", raising=False)
    return tmp_path


def test_parse_devices_skips_header_and_blank():
    out = LIST.format("192.168.3.3:43223\tdevice product:meizu_20_CN\n381QYFCN\tunauthorized")
    assert c.parse_devices(out) == [("192.168.3.3:43223", "device"), ("381QYFCN", "unauthorized")]


def test_pick_serial_ignores_offline_and_prefers_preferred():
    devices = [("a:1", "offline"), ("USB1", "device"), ("b:2", "device")]
    assert c.pick_serial(devices, "b:2") == "b:2"
    assert c.pick_serial(devices, None) == "USB1"
    assert c.pick_serial([("a:1", "offline")], None) is None


def test_android_serial_env_wins(monkeypatch):
    monkeypatch.setenv("ANDROID_SERIAL", "b:2")
    assert c.pick_serial([("USB1", "device"), ("b:2", "device")], None) == "b:2"


def test_ensure_connected_returns_online_device_without_reconnect():
    adb = FakeAdb(LIST.format("192.168.3.3:43223\tdevice"))
    assert c.ensure_connected(adb) == "192.168.3.3:43223"
    assert adb.calls == [["devices"]]


def test_ensure_connected_reconnects_last_address(state_dir):
    (state_dir / "last-address").write_text("192.168.3.3:43223")
    adb = FakeAdb(LIST.format(""), "connected to 192.168.3.3:43223", LIST.format("192.168.3.3:43223\tdevice"))
    assert c.ensure_connected(adb) == "192.168.3.3:43223"
    assert adb.calls[1] == ["connect", "192.168.3.3:43223"]


def test_ensure_connected_explains_port_change(state_dir):
    (state_dir / "last-address").write_text("192.168.3.3:43223")
    adb = FakeAdb(LIST.format(""), "failed to connect to 192.168.3.3:43223", LIST.format(""))
    with pytest.raises(c.DeviceUnavailable) as err:
        c.ensure_connected(adb)
    assert "pd connect" in str(err.value) and "无线调试" in str(err.value) and "--via browser" in str(err.value)


def test_ensure_connected_without_history_explains_pairing():
    with pytest.raises(c.DeviceUnavailable, match="adb pair"):
        c.ensure_connected(FakeAdb(LIST.format("")))


def test_connect_saves_address_on_success(state_dir):
    assert c.connect("192.168.3.3:40000", FakeAdb("connected to 192.168.3.3:40000")) == "192.168.3.3:40000"
    assert (state_dir / "last-address").read_text() == "192.168.3.3:40000"


def test_connect_already_connected_counts_as_success(state_dir):
    c.connect("192.168.3.3:40000", FakeAdb("already connected to 192.168.3.3:40000"))
    assert (state_dir / "last-address").read_text() == "192.168.3.3:40000"


def test_connect_failure_does_not_overwrite_address(state_dir):
    (state_dir / "last-address").write_text("old:1")
    with pytest.raises(c.DeviceUnavailable, match="failed"):
        c.connect("192.168.3.3:40000", FakeAdb("failed to connect to 192.168.3.3:40000"))
    assert (state_dir / "last-address").read_text() == "old:1"


def test_connect_without_address_uses_last(state_dir):
    (state_dir / "last-address").write_text("192.168.3.3:43223")
    adb = FakeAdb("connected to 192.168.3.3:43223")
    c.connect(None, adb)
    assert adb.calls == [["connect", "192.168.3.3:43223"]]


def test_adb_timeout_becomes_device_unavailable(monkeypatch):
    """adb 卡住（如无线调试地址变了）超时 → 当成「手机不可用」给出重连提示，不抛原始 TimeoutExpired 堆栈"""
    import subprocess

    def hang(cmd, **kw):
        raise subprocess.TimeoutExpired(cmd, kw.get("timeout"))

    monkeypatch.setattr(c.subprocess, "run", hang)
    with pytest.raises(c.DeviceUnavailable, match=r"adb connect 1\.2\.3\.4:5555 超过 \d+ 秒没响应.*pd connect IP:端口"):
        c.adb(["connect", "1.2.3.4:5555"])
