import json
import subprocess

import pytest

from phone_draft import recorder


def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                          "stream=width,height,r_frame_rate", "-of", "json", path],
                         capture_output=True, text=True, check=True).stdout
    return json.loads(out)["streams"][0]


def test_finish_video_makes_1080x1920_30fps(tmp_path):
    src = tmp_path / "raw.mkv"
    subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=white:s=1080x2400:d=1:r=20",
                    "-c:v", "libx264", str(src)], check=True)
    out = tmp_path / "rec.mp4"
    recorder.finish_video(str(src), str(out))
    s = probe(str(out))
    assert (s["width"], s["height"], s["r_frame_rate"]) == (1080, 1920, "30/1")


def test_scrcpy_path_missing_fails_with_setup_hint(monkeypatch, tmp_path, capsys):
    monkeypatch.setenv("PD_SCRCPY", str(tmp_path / "nope"))
    with pytest.raises(SystemExit):
        recorder.scrcpy_path()
    assert "setup-scrcpy.sh" in capsys.readouterr().out


def test_recorder_stop_is_idempotent(tmp_path):
    rec = recorder.Recorder("serial", str(tmp_path / "x.mkv"))
    rec.proc = subprocess.Popen(["sleep", "30"])
    rec.stop()
    rec.stop()
    assert rec.proc.poll() is not None


def test_recorder_start_detects_recording_by_file_not_buffered_log(monkeypatch, tmp_path):
    fake = tmp_path / "scrcpy"
    # 真 scrcpy 的输出重定向到文件时是整块缓冲的：「Recording started」要到退出才写出来
    fake.write_text('#!/usr/bin/env bash\nfor a in "$@"; do case $a in --record=*) f=${a#--record=};; esac; done\n'
                    'printf x > "$f"\ntrap \'echo "INFO: Recording started"; exit 0\' INT\nwhile true; do sleep 0.1; done\n')
    fake.chmod(0o755)
    monkeypatch.setenv("PD_SCRCPY", str(fake))
    monkeypatch.setattr(recorder, "START_WAIT", 3)
    rec = recorder.Recorder("serial", str(tmp_path / "x.mkv"))
    rec.start()
    assert rec.now() >= 0
    rec.stop()
