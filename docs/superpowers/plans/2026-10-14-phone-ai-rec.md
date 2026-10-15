# 手机 AI App 录实测（pd rec）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `pd rec deepseek|doubao 提问.txt 输出.mp4` 在真手机的 AI App 里打字、发送、等回答结束并录屏，输出和 `nv rec` 同格式的 mp4 / json / txt；`nv rec --app …` 调用它。

**Architecture:** 能力放在 `skills/phone-draft`：纯逻辑（分段打字、判断回答结束、开关颜色、视频滤镜、json 内容）在 `rec_logic.py`，录屏进程和转码在 `recorder.py`，各 App 的界面操作在 `apps/*.py`，流程在 `rec.py`，命令入口 `pd rec`。录屏用 scrcpy 便携版（无窗口、mkv），结束后 ffmpeg 裁状态栏、缩放、补边成 1080×1920。`nv rec` 加 `--app` 分支，调 `pd rec`。

**Tech Stack:** Python 3.13 + uiautomator2 3.x + Pillow（phone-draft 的 .venv 里已有）、scrcpy v5.0.1 Linux 便携版、ffmpeg（系统已装）、Node 22（`nv`，测试用 `node --test`）、pytest 8。

**Spec:** `docs/superpowers/specs/2026-10-14-phone-ai-rec-design.md`

## Global Constraints

- 输出视频：1080×1920，30 帧恒定帧率，H.264（libx264，crf 18），yuv420p。状态栏裁掉顶部 120 像素。
- json 字段：`seconds, pastedAt, sentAt, doneAt, viewport([1080,1920]), app, device("phone"), think, search`；时间保留两位小数，单位秒，从录屏开始算。
- 隐私：勿扰模式没开就不录；没进空白新对话就不录；录屏只在进了新对话之后开始。
- DeepSeek 默认关「深度思考」「智能搜索」；`--think` / `--search` 打开；豆包传这两个参数报错。
- 不点任何「发布 / 发表」类按钮（沿用 `is_forbidden`；「发送」不在禁止名单里）。
- 失败时 `fail_with_ui` 留截图和界面文字；手机不可用退出码 3。
- 每个 skill 的依赖装在自己目录里；scrcpy 下载到 `skills/phone-draft/vendor/`，不入库。国内网络：GitHub 下载走 `http://127.0.0.1:10808` 代理。
- 文档用中文；提交信息结尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- 工作目录：worktree `/home/power/self-media-phone-draft`，分支 `phone-draft`。

## Review Focus

1. 多行提问（第 4、6 轮实测都是多行）：换行要变成输入框里的换行，不能提前发送 → Task 1 `test_type_plan_keeps_newlines_as_own_items`，Task 5 真机验证用多行提问。
2. 豆包新对话里出现不认识的文字（历史消息、新的推荐按钮）：要拒绝录，而不是照录 → Task 3 `test_unexpected_labels_lists_unknown_labels`。
3. 回答前有「思考」停顿、界面几秒不变：不能提前判定结束（豆包发送后输入框提示文字会重新出现，基准要包含打字前的界面）→ Task 1 `test_answer_not_done_when_only_prompt_appeared`、`test_answer_not_done_when_only_hint_reappeared`。
4. 状态栏通知图标（没有 id）混进界面文字和 txt → Task 1 `test_content_labels_drops_status_bar_items`。
5. 录屏中途出错（找不到发送键、超时）：scrcpy 要正常停、mkv 要留下，不留僵尸进程 → Task 2 `test_recorder_stop_is_idempotent`，Task 5 真机验证一次超时。

---

### Task 1: 纯逻辑 rec_logic.py

**Files:**
- Create: `skills/phone-draft/lib/phone_draft/rec_logic.py`
- Test: `skills/phone-draft/tests/test_rec_logic.py`

**Interfaces:**
- Produces:
  - `STATUS_BAR = 120`, `OUT_W = 1080`, `OUT_H = 1920`, `MAX_TYPE_STEPS = 40`
  - `type_plan(text: str, max_steps=MAX_TYPE_STEPS) -> list[str]`：分段，换行单独成一项 `"\n"`
  - `same_text(a: str, b: str) -> bool`：忽略所有空白比较
  - `content_labels(items: list[tuple[str, str, str]], status_bar=STATUS_BAR) -> list[str]`：items 是 `ui_texts()` 的 `(文字, id, "[x1,y1][x2,y2]")`，去掉下边缘 ≤ status_bar 的
  - `answer_done(history: list[list[str]], baseline: list[str], prompt: str, marker_ok=True, stable=3) -> bool`
  - `chip_on(rgb: tuple) -> bool`：蓝 − 红 ≥ 10
  - `pad_color(rgb: tuple) -> str`：`"0xRRGGBB"`
  - `video_filter(color: str, status_bar=STATUS_BAR) -> str`
  - `dnd_on(zen_mode: str) -> bool`
  - `rec_info(marks: dict, app: str, think: bool, search: bool) -> dict`：marks 键 `typed, sent, done`

- [ ] **Step 1: 写失败的测试**

```python
# skills/phone-draft/tests/test_rec_logic.py
from phone_draft.rec_logic import (OUT_H, OUT_W, answer_done, chip_on, content_labels, dnd_on, pad_color,
                                   rec_info, same_text, type_plan, video_filter)


def test_type_plan_short_text_two_chars_each():
    assert type_plan("帮我写一条消息") == ["帮我", "写一", "条消", "息"]


def test_type_plan_long_text_at_most_40_steps():
    steps = type_plan("字" * 195)
    assert len(steps) <= 40 and "".join(steps) == "字" * 195


def test_type_plan_keeps_newlines_as_own_items():
    steps = type_plan("第一行\n「第二行」")
    assert "\n" in steps
    assert "".join(steps) == "第一行\n「第二行」"
    assert all(s == "\n" or "\n" not in s for s in steps)


def test_same_text_ignores_whitespace():
    assert same_text("第一行\n第二行 ", "第一行 第二行")
    assert not same_text("第一行", "第一行。")


def test_content_labels_drops_status_bar_items():
    items = [("支付宝通知：", "", "[146,10][202,116]"), ("5:23", "com.android.systemui:id/clock", "[56,38][137,87]"),
             ("开启新对话", "", "[985,153][1048,216]")]
    assert content_labels(items) == ["开启新对话"]


BASE = ["开启新对话", "帮我写一条消息"]


def test_answer_done_after_new_text_stable_three_polls():
    after = ["帮我写一条消息", "阿杰，图麻烦发我一下", "复制"]
    assert answer_done([after] * 4, BASE, "帮我写一条消息")


def test_answer_not_done_when_only_prompt_appeared():
    thinking = ["开启新对话", "帮我写一条消息"]
    assert not answer_done([thinking] * 6, BASE, "帮我写一条消息")


def test_answer_not_done_when_only_hint_reappeared():
    before_typing = ["新对话", "发消息或按住说话..."]
    before_send = ["新对话", "帮我写一条消息"]
    thinking = ["新对话", "帮我写一条消息", "发消息或按住说话..."]
    assert not answer_done([thinking] * 6, before_typing + before_send, "帮我写一条消息")


def test_answer_not_done_while_text_changing():
    hist = [["阿"], ["阿杰"], ["阿杰，图"], ["阿杰，图麻烦"]]
    assert not answer_done(hist, BASE, "帮我写一条消息")


def test_answer_not_done_without_marker():
    after = ["阿杰，图麻烦发我一下"]
    assert not answer_done([after] * 4, BASE, "帮我写一条消息", marker_ok=False)


def test_chip_on_by_background_color():
    assert chip_on((236, 242, 254))
    assert not chip_on((255, 255, 255))


def test_pad_color_hex():
    assert pad_color((255, 255, 255)) == "0xffffff"
    assert pad_color((1, 2, 3, 255)) == "0x010203"


def test_video_filter_crops_scales_and_pads():
    f = video_filter("0xffffff")
    assert "crop=iw:ih-120:0:120" in f
    assert f"scale=-2:{OUT_H}" in f
    assert f"pad={OUT_W}:{OUT_H}:(ow-iw)/2:0:color=0xffffff" in f
    assert f.startswith("fps=30") and f.endswith("format=yuv420p")


def test_dnd_on():
    assert dnd_on("1\n") and dnd_on("3")
    assert not dnd_on("0") and not dnd_on("null") and not dnd_on("")


def test_rec_info_rounds_and_labels_phone():
    info = rec_info({"typed": 2.0412, "sent": 8.0805, "done": 17.9642}, "deepseek", False, False)
    assert info == {"seconds": 9.88, "pastedAt": 2.04, "sentAt": 8.08, "doneAt": 17.96, "viewport": [1080, 1920],
                    "app": "deepseek", "device": "phone", "think": False, "search": False}
```

- [ ] **Step 2: 运行，确认失败**

Run: `cd /home/power/self-media-phone-draft/skills/phone-draft && .venv/bin/pytest -p no:cacheprovider tests/test_rec_logic.py -q`
Expected: 收集时报 `ModuleNotFoundError: No module named 'phone_draft.rec_logic'`

- [ ] **Step 3: 实现**

```python
# skills/phone-draft/lib/phone_draft/rec_logic.py
"""录 AI App 实测的纯逻辑：分段打字、判断回答结束、开关颜色、视频滤镜、输出信息。"""
import math
import re

STATUS_BAR = 120      # 像素：手机状态栏高度（MEIZU 20 实测 116），录屏时裁掉，读界面时去掉
OUT_W, OUT_H = 1080, 1920
MAX_TYPE_STEPS = 40   # 整段提问最多分几次输入（长提问每次多打几个字，打字过程不会太长）
MIN_STEP = 2
BOUNDS = re.compile(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]")


def type_plan(text, max_steps=MAX_TYPE_STEPS):
    """分段输入的计划：换行单独一项（按回车），其余每段 size 个字。"""
    plain = text.replace("\n", "")
    size = max(MIN_STEP, math.ceil(len(plain) / max_steps)) if plain else MIN_STEP
    steps = []
    for i, line in enumerate(text.split("\n")):
        if i:
            steps.append("\n")
        steps.extend(line[j:j + size] for j in range(0, len(line), size))
    return steps


def same_text(a, b):
    return re.sub(r"\s+", "", a) == re.sub(r"\s+", "", b)


def content_labels(items, status_bar=STATUS_BAR):
    """去掉状态栏里的控件（通知图标没有 id，只能按位置判断）。"""
    out = []
    for label, _rid, bounds in items:
        m = BOUNDS.match(bounds)
        if m and int(m.group(4)) <= status_bar:
            continue
        out.append(label)
    return out


def answer_done(history, baseline, prompt, marker_ok=True, stable=3):
    """发送后每秒一次的界面文字 history：出现了提问以外的新文字，且最后 stable+1 次都一样。"""
    if not marker_ok or len(history) < stable + 1:
        return False
    last = history[-1]
    if any(h != last for h in history[-(stable + 1):]):
        return False
    return bool(set(last) - set(baseline) - {prompt})


def chip_on(rgb):
    r, _g, b = rgb[:3]
    return b - r >= 10


def pad_color(rgb):
    return "0x{:02x}{:02x}{:02x}".format(*rgb[:3])


def video_filter(color, status_bar=STATUS_BAR):
    return (f"fps=30,crop=iw:ih-{status_bar}:0:{status_bar},scale=-2:{OUT_H},"
            f"pad={OUT_W}:{OUT_H}:(ow-iw)/2:0:color={color},format=yuv420p")


def dnd_on(zen_mode):
    v = zen_mode.strip()
    return v not in ("", "0", "null")


def rec_info(marks, app, think, search):
    r = lambda x: round(x, 2)  # noqa: E731
    return {"seconds": r(marks["done"] - marks["sent"]), "pastedAt": r(marks["typed"]), "sentAt": r(marks["sent"]),
            "doneAt": r(marks["done"]), "viewport": [OUT_W, OUT_H], "app": app, "device": "phone",
            "think": think, "search": search}
```

- [ ] **Step 4: 运行，确认通过**

Run: `.venv/bin/pytest -p no:cacheprovider tests/test_rec_logic.py -q`
Expected: `15 passed`

- [ ] **Step 5: 提交**

```bash
git add skills/phone-draft/lib/phone_draft/rec_logic.py skills/phone-draft/tests/test_rec_logic.py
git commit -m "feat: pd rec 纯逻辑（分段打字、回答结束判断、开关颜色、视频滤镜）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 录屏进程和转码 recorder.py + scrcpy 安装

**Files:**
- Create: `skills/phone-draft/lib/phone_draft/recorder.py`
- Create: `skills/phone-draft/scripts/setup-scrcpy.sh`
- Create: `skills/phone-draft/.gitignore`
- Test: `skills/phone-draft/tests/test_recorder.py`

**Interfaces:**
- Consumes: `rec_logic.video_filter`, `rec_logic.pad_color`；`core.fail`
- Produces:
  - `SCRCPY_VERSION = "v5.0.1"`
  - `scrcpy_path() -> str`：`$PD_SCRCPY` 或 `vendor/scrcpy-linux-x86_64-v5.0.1/scrcpy`；不存在时 `fail`，提示运行 `scripts/setup-scrcpy.sh`
  - `class Recorder(serial: str, mkv: str)`：`.start()`（等到日志出现 `Recording started`，最多 15 秒）、`.now() -> float`（距录屏开始的秒数）、`.stop()`（发 SIGINT 等它写完；重复调用无害；进程退出时自动调用）
  - `finish_video(mkv: str, mp4: str) -> None`：取 0.5 秒处一帧左边缘 (2, 高/2) 的颜色做补边色，按 `video_filter` 转码

- [ ] **Step 1: 写失败的测试**

```python
# skills/phone-draft/tests/test_recorder.py
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
```

- [ ] **Step 2: 运行，确认失败**

Run: `.venv/bin/pytest -p no:cacheprovider tests/test_recorder.py -q`
Expected: `ModuleNotFoundError: No module named 'phone_draft.recorder'`

- [ ] **Step 3: 实现**

```python
# skills/phone-draft/lib/phone_draft/recorder.py
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
START_WAIT = 15   # 秒：等 scrcpy 开始写文件
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
            self.proc = subprocess.Popen([scrcpy_path(), "-s", self.serial, "--no-window", "--no-audio",
                                          f"--record={self.mkv}", "--max-fps=60"],
                                         stdout=log, stderr=subprocess.STDOUT, env=env)
        atexit.register(self.stop)
        deadline = time.time() + START_WAIT
        while "Recording started" not in Path(log_path).read_text(errors="replace"):
            if self.proc.poll() is not None or time.time() > deadline:
                self.stop()
                fail(f"录屏没有开始，看 {log_path}")
            time.sleep(0.2)
        self.t0 = time.time()

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
```

```bash
# skills/phone-draft/scripts/setup-scrcpy.sh
#!/usr/bin/env bash
# 下载 scrcpy 官方 Linux 便携版到 skills/phone-draft/vendor/（pd rec 录屏用；不入库）
set -euo pipefail
VERSION=v5.0.1
DIR="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)/vendor"
NAME="scrcpy-linux-x86_64-$VERSION"
if [[ -x "$DIR/$NAME/scrcpy" ]]; then echo "✓ 已安装 $DIR/$NAME"; exit 0; fi
mkdir -p "$DIR"
PROXY=${https_proxy:-${http_proxy:-}}
curl -fL ${PROXY:+-x "$PROXY"} -m 300 -o "$DIR/$NAME.tar.gz" \
  "https://github.com/Genymobile/scrcpy/releases/download/$VERSION/$NAME.tar.gz"
tar xzf "$DIR/$NAME.tar.gz" -C "$DIR" && rm "$DIR/$NAME.tar.gz"
echo "✓ 已安装 $DIR/$NAME"
```

```gitignore
# skills/phone-draft/.gitignore
vendor/
```

- [ ] **Step 4: 运行，确认通过**

Run: `.venv/bin/pytest -p no:cacheprovider tests/test_recorder.py -q`
Expected: `3 passed`

- [ ] **Step 5: 安装 scrcpy 并真机录 3 秒**

Run:
```bash
chmod +x skills/phone-draft/scripts/setup-scrcpy.sh && http_proxy=http://127.0.0.1:10808 skills/phone-draft/scripts/setup-scrcpy.sh
cd skills/phone-draft && PYTHONPATH=lib .venv/bin/python -c "
import time
from phone_draft.device import device
from phone_draft.recorder import Recorder, finish_video
r = Recorder(device().serial, '/tmp/phone-draft/t.mkv'); r.start(); time.sleep(3); r.stop()
finish_video('/tmp/phone-draft/t.mkv', '/tmp/phone-draft/t.mp4'); print('ok')"
ffprobe -v error -show_entries stream=width,height -of csv=p=0 /tmp/phone-draft/t.mp4
```
Expected: `✓ 已安装 …`、`ok`、`1080,1920`。手机锁屏时请用户解锁后重跑。

- [ ] **Step 6: 提交**

```bash
git add skills/phone-draft/lib/phone_draft/recorder.py skills/phone-draft/scripts/setup-scrcpy.sh skills/phone-draft/.gitignore skills/phone-draft/tests/test_recorder.py
git commit -m "feat: pd rec 录屏进程（scrcpy）和转码成 1080×1920

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: App 操作 apps/deepseek.py、apps/doubao.py

**Files:**
- Create: `skills/phone-draft/lib/phone_draft/apps/__init__.py`
- Create: `skills/phone-draft/lib/phone_draft/apps/deepseek.py`
- Create: `skills/phone-draft/lib/phone_draft/apps/doubao.py`
- Test: `skills/phone-draft/tests/test_apps.py`

**Interfaces:**
- Consumes: `device()`, `open_app`, `tap_desc`, `tap_text`, `text_exists`, `hide_keyboard`, `ui_texts`, `fail`, `fail_with_ui`；`rec_logic.chip_on`, `rec_logic.content_labels`
- Produces（每个 App 模块都有）:
  - `PACKAGE: str`, `DONE_DESC: str | None`（回答结束时出现的按钮描述，DeepSeek「复制」，豆包 None）
  - `open_new_chat() -> None`：冷启动并进入空白新对话，不是空白就 `fail_with_ui`
  - `set_toggles(think: bool, search: bool) -> None`
  - `prepare_input() -> None`：清掉残留文字、收起键盘
  - `focus_input() -> None`：点输入框，弹出键盘
  - `input_text() -> str`：当前输入框里的文字
  - `send() -> None`
- `apps.load_app(name: str) -> module`：未知名字 `fail`，列出可用的
- `doubao.unexpected_labels(labels: list[str]) -> list[str]`：新对话里不认识的文字

- [ ] **Step 1: 写失败的测试**

```python
# skills/phone-draft/tests/test_apps.py
import pytest

from phone_draft import apps
from phone_draft.apps import doubao


def test_load_app_known():
    assert apps.load_app("deepseek").PACKAGE == "com.deepseek.chat"
    assert apps.load_app("doubao").PACKAGE == "com.larus.nova"


def test_load_app_unknown_lists_choices(capsys):
    with pytest.raises(SystemExit):
        apps.load_app("kimi")
    assert "deepseek" in capsys.readouterr().out


def test_unexpected_labels_lists_unknown_labels():
    labels = ["新对话", "内容由 AI 生成", "打电话", "视频通话", "拍题答疑", "照片动起来", "发消息或按住说话...",
              "2026年6月黄姓男宝双字水名推荐"]
    assert doubao.unexpected_labels(labels) == ["2026年6月黄姓男宝双字水名推荐"]


def test_doubao_rejects_think_and_search(capsys):
    with pytest.raises(SystemExit):
        doubao.set_toggles(True, False)
    assert "豆包" in capsys.readouterr().out
    doubao.set_toggles(False, False)  # 不报错
```

- [ ] **Step 2: 运行，确认失败**

Run: `.venv/bin/pytest -p no:cacheprovider tests/test_apps.py -q`
Expected: `ModuleNotFoundError: No module named 'phone_draft.apps'`

- [ ] **Step 3: 实现**

```python
# skills/phone-draft/lib/phone_draft/apps/__init__.py
"""各 AI App 的界面操作，pd rec 按名字加载。新增 App：照 deepseek.py 写一个模块，登记到 APPS。"""
import importlib

from ..core import fail

APPS = {"deepseek": "DeepSeek", "doubao": "豆包"}


def load_app(name):
    if name not in APPS:
        fail(f"不支持的 App：{name}（可用：{', '.join(APPS)}）")
    return importlib.import_module(f"{__name__}.{name}")
```

```python
# skills/phone-draft/lib/phone_draft/apps/deepseek.py
"""DeepSeek App（com.deepseek.chat）：控件文字和描述都是中文，按文字找。"""
import time

from ..core import fail_with_ui
from ..device import device, hide_keyboard, open_app, tap_desc, tap_text, text_exists
from ..rec_logic import chip_on

PACKAGE = "com.deepseek.chat"
DONE_DESC = "复制"                 # 回答结束后出现
EMPTY_MARK = "你好，我能帮什么忙吗？"  # 空白新对话才有
HINT = "发消息或按住说话"
EDIT = "android.widget.EditText"
TOGGLES = {"think": "深度思考", "search": "智能搜索"}
CHIP_BG_OFFSET = 60                # 像素：按钮文字左边这么远是按钮底色（不是图标）


def open_new_chat():
    open_app(PACKAGE)
    tap_desc("开启新对话")
    time.sleep(1.5)
    if not text_exists(EMPTY_MARK):
        fail_with_ui("没进到 DeepSeek 的空白新对话，不录")


def _toggle_on(label):
    b = device()(text=label).info["bounds"]
    img = device().screenshot()
    return chip_on(img.getpixel((b["left"] - CHIP_BG_OFFSET, (b["top"] + b["bottom"]) // 2)))


def set_toggles(think, search):
    """App 会记住上次的开关，每轮都按要求设一遍并核对。"""
    for key, want in (("think", think), ("search", search)):
        label = TOGGLES[key]
        if _toggle_on(label) != want:
            tap_text(label)
            time.sleep(1)
        if _toggle_on(label) != want:
            fail_with_ui(f"「{label}」没能{'打开' if want else '关掉'}")


def prepare_input():
    box = device()(className=EDIT)
    if box.exists:  # 上次没发出去的文字
        box.clear_text()
        hide_keyboard()
        time.sleep(1)
    if not text_exists(HINT):
        fail_with_ui("输入框没清空")


def focus_input():
    tap_text(HINT)
    time.sleep(0.6)


def input_text():
    box = device()(className=EDIT)
    return box.get_text() if box.exists else ""


def send():
    tap_desc("发送")
```

```python
# skills/phone-draft/lib/phone_draft/apps/doubao.py
"""豆包 App（com.larus.nova）：很多按钮没有文字和描述，按位置相对已知文字找。
打开时停在上次的对话，新对话要从侧边栏顶部的按钮进；侧边栏有历史标题，所以录屏只在进了新对话之后开始。"""
import time

from ..core import fail, fail_with_ui
from ..device import device, hide_keyboard, open_app, ui_texts
from ..rec_logic import content_labels

PACKAGE = "com.larus.nova"
DONE_DESC = None
EDIT = "android.widget.EditText"
IMAGE = "android.widget.ImageView"
TOP_BAR = 300          # 像素：顶栏下边界
# 空白新对话里应该只有这些文字；出现别的（历史消息、新推荐）就不录
EMPTY_LABELS = {"新对话", "内容由 AI 生成", "打电话", "视频通话", "拍题答疑", "照片动起来", "按住说话",
                "发消息或按住说话...", "发消息..."}


def unexpected_labels(labels):
    return [t for t in labels if t not in EMPTY_LABELS]


def _bounds(sel):
    return sel.info["bounds"]


def _right_of(anchor, class_name):
    """和 anchor 同一行、在它右边的第一个可点控件。"""
    sel = device()(className=class_name, clickable=True)
    for i in range(sel.count):
        b = _bounds(sel[i])
        if b["left"] >= anchor["right"] - 5 and b["top"] < anchor["bottom"] and b["bottom"] > anchor["top"]:
            return sel[i]
    return None


def open_new_chat():
    open_app(PACKAGE)
    menu = device()(className=IMAGE, clickable=True)
    if not menu.exists or _bounds(menu[0])["top"] > TOP_BAR:
        fail_with_ui("找不到豆包左上角的菜单按钮")
    menu[0].click()                       # 打开侧边栏（有历史标题，此时还没开始录）
    time.sleep(1.5)
    search = device()(text="搜索")
    if not search.wait(timeout=5):
        fail_with_ui("侧边栏没打开")
    new_chat = _right_of(_bounds(search), IMAGE)
    if new_chat is None:
        fail_with_ui("找不到侧边栏的「新对话」按钮")
    new_chat.click()
    time.sleep(2)
    extra = unexpected_labels(content_labels(ui_texts()))
    if extra:
        fail_with_ui(f"豆包新对话里有不认识的内容，为免录到私人对话已停下：{extra[:3]}")


def set_toggles(think, search):
    if think or search:
        fail("豆包没有「深度思考」「智能搜索」开关，不能用 --think / --search")


def prepare_input():
    voice = device()(text="按住说话")
    if voice.exists:                      # 语音模式：点右边的键盘图标切成打字
        kb = _right_of(_bounds(voice), IMAGE)
        if kb is None:
            fail_with_ui("找不到切换键盘的按钮")
        kb.click()
        time.sleep(1)
    box = device()(className=EDIT)
    if not box.wait(timeout=5):
        fail_with_ui("找不到豆包的输入框")
    if box.get_text() and not box.get_text().startswith("发消息"):
        box.clear_text()
    hide_keyboard()
    time.sleep(1)


def focus_input():
    device()(className=EDIT).click()
    time.sleep(0.6)


def input_text():
    box = device()(className=EDIT)
    return box.get_text() if box.exists else ""


def send():
    box = device()(className=EDIT)
    btn = _right_of(_bounds(box), IMAGE)
    if btn is None:
        fail_with_ui("找不到豆包的发送键")
    btn.click()
```

- [ ] **Step 4: 运行，确认通过**

Run: `.venv/bin/pytest -p no:cacheprovider tests/test_apps.py -q`
Expected: `4 passed`

- [ ] **Step 5: 真机走一遍（不录屏、不发送）**

写一个临时脚本到 scratchpad（不入库），对两个 App 各跑：`open_new_chat()` → `set_toggles(False, False)` → `prepare_input()` → `focus_input()` → 输入「测试」→ 打印 `input_text()` → `prepare_input()` 清掉。DeepSeek 再跑一次 `set_toggles(True, False)` 后 `set_toggles(False, False)`，确认颜色判断对。
Run: `PATH=<scratchpad>:$PATH pd run <scratchpad>/apps_probe.py`
Expected: 两个 App 都打印 `测试`；没有 `✗`。失败就看 `/tmp/phone-draft/*-fail.png` 调整选择器，并在 ledger 记 Ruling。

- [ ] **Step 6: 提交**

```bash
git add skills/phone-draft/lib/phone_draft/apps skills/phone-draft/tests/test_apps.py
git commit -m "feat: pd rec 的 DeepSeek、豆包界面操作（新对话、开关、输入、发送）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 流程 rec.py + `pd rec` 命令

**Files:**
- Create: `skills/phone-draft/lib/phone_draft/rec.py`
- Modify: `skills/phone-draft/lib/phone_draft/cli.py`（加 `rec` 子命令和 USAGE）
- Modify: `skills/phone-draft/bin/pd`（注释里的用法）
- Test: `skills/phone-draft/tests/test_cli.py`（加 rec 用例）

**Interfaces:**
- Consumes: Task 1 全部、Task 2 `Recorder`/`finish_video`、Task 3 `load_app` 和 App 模块接口；`device()`, `ui_texts`, `type_text`, `fail`, `fail_with_ui`, `log`
- Produces:
  - `rec.parse_args(args: list[str]) -> dict`：`{app, prompt, out, think, search, timeout}`；参数不对 `fail`（含用法）
  - `rec.record(app, prompt_file, out, think=False, search=False, timeout=300) -> dict`（返回写进 json 的信息）
  - `pd rec <app> <提问.txt> <输出.mp4> [--think] [--search] [--timeout 秒]`；手机不可用退出码 3

- [ ] **Step 1: 写失败的测试**

```python
# 追加到 skills/phone-draft/tests/test_cli.py
from phone_draft import rec


def test_rec_parse_args_flags(tmp_path):
    p = tmp_path / "q.txt"
    p.write_text("问", encoding="utf-8")
    a = rec.parse_args(["deepseek", str(p), str(tmp_path / "o.mp4"), "--think", "--timeout", "120"])
    assert a == {"app": "deepseek", "prompt": str(p), "out": str(tmp_path / "o.mp4"), "think": True,
                 "search": False, "timeout": 120}


def test_rec_parse_args_requires_mp4_and_existing_prompt(tmp_path, capsys):
    with pytest.raises(SystemExit):
        rec.parse_args(["deepseek", str(tmp_path / "missing.txt"), str(tmp_path / "o.mp4")])
    assert "找不到提问文件" in capsys.readouterr().out
    p = tmp_path / "q.txt"
    p.write_text("问", encoding="utf-8")
    with pytest.raises(SystemExit):
        rec.parse_args(["deepseek", str(p), str(tmp_path / "o.mkv")])


def test_rec_exits_3_when_no_device(monkeypatch, tmp_path):
    p = tmp_path / "q.txt"
    p.write_text("问", encoding="utf-8")

    def unavailable():
        raise DeviceUnavailable("手机没连上")

    monkeypatch.setattr(cli, "ensure_connected", unavailable)
    with pytest.raises(SystemExit) as err:
        cli.main(["rec", "deepseek", str(p), str(tmp_path / "o.mp4")])
    assert err.value.code == cli.EXIT_NO_DEVICE


def test_rec_calls_record_with_parsed_args(monkeypatch, tmp_path):
    p = tmp_path / "q.txt"
    p.write_text("问", encoding="utf-8")
    seen = {}
    monkeypatch.setattr(cli, "ensure_connected", lambda: "serial")
    monkeypatch.setattr(rec, "record", lambda **kw: seen.update(kw) or {})
    cli.main(["rec", "doubao", str(p), str(tmp_path / "o.mp4")])
    assert seen["app"] == "doubao" and seen["think"] is False and seen["timeout"] == 300
```

- [ ] **Step 2: 运行，确认失败**

Run: `.venv/bin/pytest -p no:cacheprovider tests/test_cli.py -q`
Expected: `ImportError: cannot import name 'rec' from 'phone_draft'`

- [ ] **Step 3: 实现 rec.py**

```python
# skills/phone-draft/lib/phone_draft/rec.py
"""pd rec：在手机 AI App 里打字、发送、等回答结束，全程录屏。输出和 nv rec 同格式：.mp4 / .json / .txt。"""
import json
import os
import time

from .apps import load_app
from .core import fail, log
from .device import device, type_text, ui_texts, fail_with_ui
from .rec_logic import answer_done, content_labels, dnd_on, rec_info, same_text, type_plan
from .recorder import Recorder, finish_video

USAGE = "用法：pd rec deepseek|doubao <提问.txt> <输出.mp4> [--think] [--search] [--timeout 秒]"
DEFAULT_TIMEOUT = 300
LEAD_IN = 2        # 秒：开录后先停一会再点输入框
TYPE_GAP = 0.12
BEFORE_SEND = 0.8
TAIL = 2           # 秒：回答结束后多录一会
POLL = 1


def parse_args(args):
    pos = [a for a in args if not a.startswith("--")]
    timeout = DEFAULT_TIMEOUT
    if "--timeout" in args:
        i = args.index("--timeout")
        if i + 1 >= len(args) or not args[i + 1].isdigit():
            fail(f"--timeout 要写秒数。{USAGE}")
        timeout = int(args[i + 1])
        pos.remove(args[i + 1])
    if len(pos) != 3:
        fail(USAGE)
    app, prompt, out = pos
    if not os.path.isfile(prompt):
        fail(f"找不到提问文件：{prompt}")
    if not out.endswith(".mp4"):
        fail(f"输出要是 .mp4：{out}")
    return {"app": app, "prompt": prompt, "out": out, "think": "--think" in args, "search": "--search" in args,
            "timeout": timeout}


def _labels():
    return content_labels(ui_texts())


def _type(prompt):
    for step in type_plan(prompt):
        if step == "\n":
            device().press("enter")   # 两个 App 的输入法回车都是换行，不是发送
        else:
            type_text(step)
        time.sleep(TYPE_GAP)


def _wait_answer(app, rec, baseline, prompt, sent, timeout, mkv):
    history = []
    while True:
        time.sleep(POLL)
        history.append(_labels())
        marker = app.DONE_DESC is None or device()(description=app.DONE_DESC).exists
        if answer_done(history, baseline, prompt, marker):
            return
        if rec.now() - sent > timeout:
            rec.stop()
            fail_with_ui(f"等了 {timeout} 秒回答还没结束（原始录屏留在 {mkv}）")


def record(app, prompt, out, think=False, search=False, timeout=DEFAULT_TIMEOUT):
    mod = load_app(app)
    text = open(prompt, encoding="utf-8").read().strip()
    d = device()
    if not dnd_on(d.shell("settings get global zen_mode").output):
        fail("手机没开勿扰模式：录屏会录到弹出的通知。请先打开勿扰再录")
    mod.open_new_chat()               # 之后才开始录：侧边栏、历史对话不进画面
    mod.set_toggles(think, search)
    mod.prepare_input()
    before_typing = _labels()         # 含输入框提示文字：发送后它会重新出现，不能算「新文字」
    base = out[:-len(".mp4")]
    mkv = base + ".raw.mkv"
    rec = Recorder(d.serial, mkv)
    rec.start()
    time.sleep(LEAD_IN)
    mod.focus_input()
    marks = {"typed": rec.now()}
    _type(text)
    if not same_text(mod.input_text(), text):
        rec.stop()
        fail_with_ui(f"输入框里的文字和提问不一致，没有发送：{mod.input_text()[:40]}…")
    time.sleep(BEFORE_SEND)
    baseline = before_typing + _labels()
    marks["sent"] = rec.now()
    mod.send()
    _wait_answer(mod, rec, baseline, text, marks["sent"], timeout, mkv)
    marks["done"] = rec.now()
    page = _labels()
    time.sleep(TAIL)
    rec.stop()
    finish_video(mkv, out)
    for f in (mkv, mkv + ".log"):
        os.remove(f)
    info = rec_info(marks, app, think, search)
    with open(base + ".json", "w", encoding="utf-8") as f:
        json.dump(info, f, ensure_ascii=False, indent=2)
        f.write("\n")
    with open(base + ".txt", "w", encoding="utf-8") as f:
        f.write("\n".join(page) + "\n")
    log(f"界面文字：{base}.txt")
    print(f"✓ {out}（发送后 {info['seconds']} 秒回答完；视频里 {info['sentAt']}s 发送、{info['doneAt']}s 结束）",
          flush=True)
    return info
```

- [ ] **Step 4: 接进 cli.py**

在 `cli.py` 里：
- 文件头 docstring 和 `USAGE` 改成 `"用法：pd devices | pd connect [IP:端口] | pd ui [名字] | pd run <步骤.py> [载荷.json] | pd rec deepseek|doubao <提问.txt> <输出.mp4> [--think] [--search] [--timeout 秒]"`
- 顶部加 `from . import rec`
- `main` 里 `if cmd == "run" …` 之后加：

```python
        if cmd == "rec" and args:
            opts = rec.parse_args(args)
            ensure_connected()
            rec.record(**opts)
            return None
```

`bin/pd` 第 3 行注释同步加上 `| pd rec <app> <提问.txt> <输出.mp4>`。

- [ ] **Step 5: 运行，确认通过**

Run: `.venv/bin/pytest -p no:cacheprovider tests -q`
Expected: 全部通过（原 65 + Task 1–4 新增 26 = 91 passed）

- [ ] **Step 6: 提交**

```bash
git add skills/phone-draft/lib/phone_draft/rec.py skills/phone-draft/lib/phone_draft/cli.py skills/phone-draft/bin/pd skills/phone-draft/tests/test_cli.py
git commit -m "feat: pd rec 命令：手机 AI App 打字、发送、等回答、录屏

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 真机验证 pd rec（两个 App、多行提问、超时）

**Files:**
- 无代码改动预期；发现问题按 systematic-debugging 修，修复带测试，ledger 记 Ruling。

**Interfaces:**
- Consumes: `pd rec`（Task 4）

- [ ] **Step 1: 提醒用户**：手机解锁、开勿扰、USB 调试开着。
- [ ] **Step 2: DeepSeek 单行**

Run: `cd "/home/power/self-media/04-作品/普通人的AI课/05-一条消息/实测" && PATH=<scratchpad>:$PATH pd rec deepseek 提问-1-一句话.txt <scratchpad>/v-ds1.mp4`
Expected: `✓ …（发送后 N 秒回答完…）`；`v-ds1.json` 里 `think:false`；`v-ds1.txt` 含回答；`ffprobe` 显示 `1080,1920`。抽 5 帧拼图看：开头没有键盘残留、没有状态栏、左右补边颜色和 App 背景一致。

- [ ] **Step 3: 豆包多行**

Run: `… pd rec doubao 提问-4-我的口气.txt <scratchpad>/v-db4.mp4`
Expected: `✓`；拼图里输入框显示 4 行，提问作为一条消息发出（不是拆成多条）；`.txt` 含回答。

- [ ] **Step 4: 超时路径**

Run: `… pd rec deepseek 提问-1-一句话.txt <scratchpad>/v-to.mp4 --timeout 1`
Expected: `✗ 等了 1 秒回答还没结束（原始录屏留在 …v-to.raw.mkv）`；`pgrep -x scrcpy` 无输出；`v-to.raw.mkv` 存在、能用 ffprobe 读。

- [ ] **Step 5: 勿扰关掉时**：请用户临时关勿扰，跑 Step 2 的命令。
Expected: `✗ 手机没开勿扰模式…`，没有开始录（没有 `.raw.mkv`）。然后请用户重新打开勿扰。

- [ ] **Step 6: 记录**：结果写进 ledger；测试中在两个 App 里产生的对话列给用户决定删不删。

---

### Task 6: `nv rec --app` 分支

**Files:**
- Modify: `skills/narrated-video/scripts/rec.mjs`
- Modify: `skills/narrated-video/bin/nv`（第 13 行注释）
- Test: `skills/narrated-video/tests/rec-via.test.mjs`

**Interfaces:**
- Consumes: `pd rec <app> <提问> <输出> [--think] [--search]`，退出码 3 = 手机不可用
- Produces: `nv rec <输出.mp4> --prompt <提问.txt> --app deepseek|doubao [--think] [--search]`；`--url <网址>` 或 `--via browser` 走原浏览器流程；都没有就报错

- [ ] **Step 1: 写失败的测试**

```javascript
// skills/narrated-video/tests/rec-via.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(SKILL, "scripts", "rec.mjs");

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "rec-via-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  for (const name of ["pd", "browser-harness"]) {
    const f = join(bin, name);
    writeFileSync(f, `#!/usr/bin/env bash\necho "${name} $*" >> "${dir}/calls.log"\nexit \${FAKE_PD_EXIT:-0}\n`);
    chmodSync(f, 0o755);
  }
  writeFileSync(join(dir, "提问.txt"), "帮我写一条消息\n");
  return { dir, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } };
}

const calls = (dir) => (existsSync(join(dir, "calls.log")) ? readFileSync(join(dir, "calls.log"), "utf8") : "");
const run = (args, env) => spawnSync("node", [SCRIPT, ...args], { env, encoding: "utf8" });

test("--app 走手机：调用 pd rec，参数原样传", () => {
  const { dir, env } = setup();
  const r = run([join(dir, "rec.mp4"), "--prompt", join(dir, "提问.txt"), "--app", "deepseek", "--think"], env);
  assert.equal(r.status, 0, r.stderr);
  assert.match(calls(dir), new RegExp(`^pd rec deepseek ${join(dir, "提问.txt")} ${join(dir, "rec.mp4")} --think\\n$`));
});

test("手机不可用：报错并提示 --url，不自动走浏览器", () => {
  const { dir, env } = setup();
  const r = run([join(dir, "rec.mp4"), "--prompt", join(dir, "提问.txt"), "--app", "doubao"], { ...env, FAKE_PD_EXIT: "3" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--url/);
  assert.doesNotMatch(calls(dir), /browser-harness/);
});

test("既没有 --app 也没有 --url / --via browser：报错并列出两种写法", () => {
  const { dir, env } = setup();
  const r = run([join(dir, "rec.mp4"), "--prompt", join(dir, "提问.txt")], env);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--app deepseek\|doubao/);
  assert.match(r.stderr, /--url/);
  assert.equal(calls(dir), "");
});

test("--app 和 --url 同时给：报错", () => {
  const { dir, env } = setup();
  const r = run([join(dir, "rec.mp4"), "--prompt", join(dir, "提问.txt"), "--app", "deepseek", "--url", "https://x"], env);
  assert.equal(r.status, 1);
  assert.equal(calls(dir), "");
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `cd skills/narrated-video && node --test tests/rec-via.test.mjs`
Expected: 4 个都失败（`--app` 现在被当成位置参数 / 不报错）

- [ ] **Step 3: 实现**

`rec.mjs` 改动：
1. 文件头用法注释第一行改为：
   `// 用法：nv rec <输出.mp4> --prompt <文字文件> --app deepseek|doubao [--think] [--search]   （手机，推荐）`
   `//       nv rec <输出.mp4> --prompt <文字文件> --url <网址> | --via browser [--input …] [--hide …] [--size 540x960]   （浏览器）`
2. `parseArgs`：识别 `--app`、`--via`（带值）和布尔 `--think`、`--search`：

```javascript
function parseArgs(argv) {
  const opts = { size: "540x960", input: "textarea", hide: "", url: "", app: "", via: "", think: false, search: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const m = argv[i].match(/^--(prompt|url|input|hide|size|app|via)$/);
    if (m) opts[m[1]] = argv[++i];
    else if (argv[i] === "--think" || argv[i] === "--search") opts[argv[i].slice(2)] = true;
    else rest.push(argv[i]);
  }
  const usage = "用法：nv rec <输出.mp4> --prompt <提问.txt> --app deepseek|doubao [--think] [--search]（手机）\n" +
    "      nv rec <输出.mp4> --prompt <提问.txt> --url <网址> | --via browser（浏览器）";
  if (!rest[0] || !opts.prompt) throw new Error(usage);
  const browser = Boolean(opts.url) || opts.via === "browser";
  if (opts.app && browser) throw new Error(`--app（手机）和 --url / --via browser（浏览器）只能选一种\n${usage}`);
  if (!opts.app && !browser) throw new Error(usage);
  const [w, h] = opts.size.split("x").map(Number);
  if (!w || !h) throw new Error(`--size 写法应为 宽x高：${opts.size}`);
  return { out: resolve(rest[0]), prompt: resolve(opts.prompt), w, h, ...opts };
}
```

3. 新函数 `recPhone(o)`，在 `main()` 里 `if (!existsSync(o.prompt)) …` 之后：`if (o.app) return recPhone(o);`

```javascript
import { spawnSync } from "node:child_process";   // 和已有的 execFileSync 合并成一行 import

const EXIT_NO_DEVICE = 3;

function recPhone(o) {
  const args = ["rec", o.app, o.prompt, o.out, ...(o.think ? ["--think"] : []), ...(o.search ? ["--search"] : [])];
  const r = spawnSync("pd", args, { stdio: "inherit" });
  if (r.error) throw new Error(`调用 pd 失败：${r.error.message}（phone-draft 装好了吗？）`);
  if (r.status === EXIT_NO_DEVICE) throw new Error("手机不可用（没连上或锁屏）。处理好再录，或改用 --url <网址> 走浏览器");
  if (r.status !== 0) throw new Error("手机录屏失败，看上面的输出");
}
```

4. `bin/nv` 第 13 行注释改为 `#   nv rec <输出.mp4> --prompt <文件> --app deepseek|doubao   录 AI 对话实测（手机 App；--url 走浏览器）`

- [ ] **Step 4: 运行，确认通过**

Run: `node --test tests/rec-via.test.mjs && node --test tests/draft-via.test.mjs && npm test 2>&1 | tail -3`
Expected: rec-via 4 pass，draft-via 7 pass，`npm test` 无失败（原 89 + 4）

- [ ] **Step 5: 真机走一遍 nv 入口**

Run: `cd "/home/power/self-media/04-作品/普通人的AI课/05-一条消息/实测" && PATH=<scratchpad>:$PATH /home/power/self-media-phone-draft/skills/narrated-video/bin/nv rec <scratchpad>/v-nv.mp4 --prompt 提问-1-一句话.txt --app deepseek`
Expected: `✓ …`，生成 `v-nv.mp4/.json/.txt`

- [ ] **Step 6: 提交**

```bash
git add skills/narrated-video/scripts/rec.mjs skills/narrated-video/bin/nv skills/narrated-video/tests/rec-via.test.mjs
git commit -m "feat: nv rec --app 走手机 AI App 录实测；浏览器改用 --url / --via browser

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 文档

**Files:**
- Modify: `skills/phone-draft/SKILL.md`（description、命令、规则、前提、踩过的坑）
- Modify: `skills/narrated-video/SKILL.md:39`（`nv rec` 那一行）
- Modify: `skills/narrated-video/references/douyin-recipe.md:123,163`
- Modify: `skills/scenario-content/SKILL.md:53-55`
- Modify: `skills/knowledge-video/scripts/lib/practical.mjs:29`
- Modify: `CLAUDE.md`（视频流程里「实测时 `nv rec` 录屏」）

**Interfaces:** 无代码接口。

- [ ] **Step 1: phone-draft/SKILL.md**
  - frontmatter description 改为：「通过 adb（uiautomator2）操作安卓手机：把做好的内容填进抖音、小红书、公众号助手存成草稿（不点发布）；在 DeepSeek、豆包 App 里自动提问并录屏做实测（pd rec）。……当用户要「用手机发草稿」「用手机录 AI 实测」、手机连不上要重连，或要给某个 App 新写脚本时使用。」
  - 命令块加：`pd rec deepseek|doubao <提问.txt> <输出.mp4> [--think] [--search] [--timeout 300]   # 在 AI App 里提问并录屏，输出 .mp4/.json/.txt（和 nv rec 同格式）`
  - 新增小节「录 AI 实测（pd rec）」：流程 9 步的简写；隐私规则（勿扰、新对话才录、豆包侧边栏不进画面）；DeepSeek 开关默认关、App 会记住上次设置所以每轮都设；输出视频处理（裁 120 像素状态栏、缩放、补边）；`.txt` 是界面文字；scrcpy 安装 `scripts/setup-scrcpy.sh`。
  - 前提加：scrcpy；录之前开勿扰。
  - 踩过的坑加：DeepSeek 输入框没获得焦点时只是一段提示文字（`发消息或按住说话`），点了才变成 EditText；发送后 App 自己收键盘，再按返回会退出 App；豆包打开停在上次的对话、「聊聊新话题」只是分隔线，新对话要从侧边栏进；豆包按钮多数没有描述，按位置找；DeepSeek 开关颜色：开淡蓝 (236,242,254)、关白；手机 Edge 的调试接口要「USB 调试」开着（`adb_enabled=1`），只开无线调试不够。
- [ ] **Step 2: narrated-video/SKILL.md 第 39 行** 改为：
  `| \`nv rec <工程>/capture/assets/rec.mp4 --prompt 提问.txt --app deepseek\|doubao\` | （可选，强烈推荐）在真手机的 AI App 里录真实操作：打字 → 发送 → 回答完，输出 1080×1920；同时输出用时（.json）和界面文字（.txt，写进实测记录）。DeepSeek 默认关深度思考 / 智能搜索，要开加 \`--think\` / \`--search\`。录前手机解锁、开勿扰。没有手机时用 \`--url <AI 网址>\` 走浏览器（录前确认已登录、新对话、模型开关与实测一致、侧边栏收起） |`
- [ ] **Step 3: douyin-recipe.md** 第 123 行改为「用 `nv rec … --app deepseek|doubao` 在手机 App 里录下全过程」；第 163 行补一句「手机录屏的 `pastedAt` 是开始打字的时刻」。
- [ ] **Step 4: scenario-content/SKILL.md 53–55 行**：示例命令改为 `nv rec 实测/录屏-第N轮.mp4 --prompt 提问.txt --app deepseek`（手机 App；没有手机时 `--url <AI 网址>`），说明「自动打字、发送，回答结束自动停」。
- [ ] **Step 5: practical.mjs 第 29 行** test 文字改为 `"按 scenario-content 第 3 步实测（nv rec --app 手机录屏，同一提问跑两轮），写 实测记录.md"`；跑 `cd skills/knowledge-video && npm test` 确认没有测试依赖原文字。
- [ ] **Step 6: CLAUDE.md** 视频流程里「实测时 `nv rec` 录屏」改为「实测时 `nv rec --app deepseek|doubao` 用手机 App 录屏」。
- [ ] **Step 7: 全部测试**

Run: `skills/phone-draft/.venv/bin/pytest -p no:cacheprovider skills/phone-draft/tests skills/browser-draft/tests -q && (cd skills/narrated-video && npm test 2>&1 | tail -3) && (cd skills/knowledge-video && npm test 2>&1 | tail -3)`
Expected: 全部通过

- [ ] **Step 8: 提交**

```bash
git add skills/phone-draft/SKILL.md skills/narrated-video/SKILL.md skills/narrated-video/references/douyin-recipe.md skills/scenario-content/SKILL.md skills/knowledge-video/scripts/lib/practical.mjs CLAUDE.md
git commit -m "docs: 实测录屏改为手机 AI App（pd rec / nv rec --app）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
