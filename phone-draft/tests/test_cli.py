import pytest

from phone_draft import cli
from phone_draft.connect import DeviceUnavailable


def test_run_exits_3_when_no_device(monkeypatch, tmp_path, capsys):
    step = tmp_path / "step.py"
    step.write_text("raise AssertionError('不应执行')")

    def unavailable():
        raise DeviceUnavailable("手机没连上。…pd connect…--via browser")

    monkeypatch.setattr(cli, "ensure_connected", unavailable)
    with pytest.raises(SystemExit) as err:
        cli.main(["run", str(step)])
    assert err.value.code == cli.EXIT_NO_DEVICE
    assert "--via browser" in capsys.readouterr().out


def test_run_passes_payload_and_runs_step(monkeypatch, tmp_path):
    payload = tmp_path / "p.json"
    payload.write_text('{"title": "x"}', encoding="utf-8")
    out = tmp_path / "out.txt"
    step = tmp_path / "step.py"
    step.write_text(f"import os\nopen({str(out)!r}, 'w').write(os.environ['PD_PAYLOAD'])\n")
    monkeypatch.setattr(cli, "ensure_connected", lambda: "serial")
    cli.main(["run", str(step), str(payload)])
    assert out.read_text() == str(payload)


def test_unknown_command_prints_usage(capsys):
    with pytest.raises(SystemExit) as err:
        cli.main(["nope"])
    assert err.value.code == 1
    assert "用法" in capsys.readouterr().err


def test_public_api_exports():
    import phone_draft
    for name in ["PAYLOAD", "read_copy", "tap_text", "paste_html", "push_media", "clean_media", "check_readback"]:
        assert hasattr(phone_draft, name)


def test_run_step_sees_payload_through_package_import(monkeypatch, tmp_path):
    """phone_draft 包在 cli 启动时已被导入，步骤脚本拿到的 PAYLOAD 仍要是本次的载荷。"""
    import phone_draft
    payload = tmp_path / "p.json"
    payload.write_text('{"title": "本次"}', encoding="utf-8")
    out = tmp_path / "out.txt"
    step = tmp_path / "step.py"
    step.write_text(f"from phone_draft import PAYLOAD\nopen({str(out)!r}, 'w', encoding='utf-8').write(PAYLOAD['title'])\n")
    monkeypatch.setattr(cli, "ensure_connected", lambda: "serial")
    cli.main(["run", str(step), str(payload)])
    assert out.read_text(encoding="utf-8") == "本次"
    assert phone_draft.PAYLOAD is phone_draft.core.PAYLOAD
