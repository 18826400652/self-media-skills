"""用 scrcpy 录手机屏幕（无窗口、无声音、mkv：中途出错也不丢文件），结束后转成 1080×1920 的 mp4。"""
import atexit
import os
import shutil
import signal
import subprocess
import tempfile
import time
from pathlib import Path

from PIL import Image

from .core import fail
from .rec_logic import pad_color, video_filter

SKILL_DIR = Path(__file__).resolve().parents[2]
SCRCPY_VERSION = "v5.0.1"
START_WAIT = 15   # 秒：等 scrcpy 开始写录屏文件
STOP_WAIT = 30


def scrcpy_path():
    path = os.environ.get("PD_SCRCPY") or str(SKILL_DIR / "vendor" / f"scrcpy-linux-x86_64-{SCRCPY_VERSION}" / "scrcpy")
    if not os.path.isfile(path):
        fail(f"没有 scrcpy（{path}）：运行 {SKILL_DIR}/scripts/setup-scrcpy.sh 安装，或设环境变量 PD_SCRCPY")
    return path


class Recorder:
    def __init__(self, serial, mkv):
        self.serial, self.mkv, self.proc, self.t0 = serial, mkv, None, None

    def start(self):
        log_path = self.mkv + ".log"
        env = {**os.environ, "ADB": shutil.which("adb") or "adb"}
        with open(log_path, "w") as log:
            # 输出重定向到文件时是整块缓冲的，stdbuf 让日志按行写出，才能及时看到「Recording started」
            line_buffered = ["stdbuf", "-oL", "-eL"] if shutil.which("stdbuf") else []
            self.proc = subprocess.Popen([*line_buffered, scrcpy_path(), "-s", self.serial, "--no-window", "--no-audio",
                                          f"--record={self.mkv}", "--max-fps=60"],
                                         stdout=log, stderr=subprocess.STDOUT, env=env)
        atexit.register(self.stop)
        deadline = time.time() + START_WAIT
        while not self._started(log_path):
            if self.proc.poll() is not None or time.time() > deadline:
                self.stop()
                fail(f"录屏没有开始，看 {log_path}")
            time.sleep(0.2)
        self.t0 = time.time()

    def _started(self, log_path):
        if "Recording started" in Path(log_path).read_text(errors="replace"):
            return True
        return os.path.exists(self.mkv) and os.path.getsize(self.mkv) > 0

    def now(self):
        return time.time() - self.t0

    def stop(self):
        if self.proc is None or self.proc.poll() is not None:
            return
        self.proc.send_signal(signal.SIGINT)
        try:
            self.proc.wait(timeout=STOP_WAIT)
        except subprocess.TimeoutExpired:
            self.proc.kill()
            self.proc.wait()


def _edge_color(mkv):
    with tempfile.TemporaryDirectory() as tmp:
        png = os.path.join(tmp, "f.png")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", "0.5", "-i", mkv, "-frames:v", "1", png], check=True)
        img = Image.open(png).convert("RGB")
        return pad_color(img.getpixel((2, img.height // 2)))


def finish_video(mkv, mp4):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", mkv, "-vf", video_filter(_edge_color(mkv)),
                    "-c:v", "libx264", "-crf", "18", "-an", mp4], check=True)
