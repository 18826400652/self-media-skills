# 手机发草稿（phone-draft）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `wa draft` / `ic draft` / `nv draft` 默认通过 adb 操作安卓手机上的公众号助手、小红书、抖音 App 存草稿，`--via browser` 保留原浏览器方案。

**Architecture:** 新 skill `skills/phone-draft`（命令 `pd`）：Python 包 `phone_draft` 封装 uiautomator2（连接、按文字点击、等待、输入、截图、推相册）和「手机 Edge + CDP 写富文本剪贴板」；各平台的手机步骤脚本 `phone_*.py` 放在各自 skill 里，`pd run` 执行。三个平台命令加 `--via`，载荷格式不变。发布文案解析从 browser-draft 抽成共享模块 `copy_format.py`。

**Tech Stack:** Python 3（uv 建 `.venv`）、uiautomator2、websocket-client、pytest；Node 18+ 的 `node:test`；adb 34。

**Spec:** `docs/superpowers/specs/2026-10-13-phone-draft-design.md`

## Global Constraints

- 只存草稿，永远不点发布：含「发表」「发布」「群发」且不含「草稿」的按钮一律拒绝点击。
- 登录、扫码、验证、开通功能：停下交给用户；相册权限这类必要授权可以点允许。
- 失败时停在原地，不自动后退或放弃；截图 + 界面文字存到 `$TMPDIR/phone-draft/`（未设 TMPDIR 时 `/tmp/phone-draft/`）。
- 手机不可用时报错并提示 `pd connect` 或 `--via browser`，**不悄悄回落**到浏览器。
- 默认 `--via phone`。
- 公众号助手账号必须是配置 `account`（「小白个人成长」），不一致就停。
- 相册文件推到 `/sdcard/DCIM/phone-draft/`，草稿保存成功后清理（若 App 仍引用原文件则改为下次运行前清理）。
- 文档用中文；依赖装在 skill 自己目录（`.venv/`、`node_modules/`）；pip 用国内镜像 `-i https://pypi.tuna.tsinghua.edu.cn/simple`，只在命令行指定。
- 新 skill 软链接到 `~/.claude/skills/phone-draft`，`bin/pd` 软链接到 `~/.local/bin/pd`。
- 代码改动在独立 worktree（用户常同时开多个会话）；不提交视频、图片产物。
- 提交信息末尾加 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。

## Review Focus

- adb 服务重启或手机重启后无线连接丢失（本会话已发生过）：`pd` 应自动用上次地址重连；端口变了要报清楚「到手机无线调试页看新端口，`pd connect IP:端口`」。→ Task 2 测试。
- 手机黑屏或锁屏：uiautomator 操作会全部失败；应先唤醒，锁屏时报「请先解锁手机」。→ Task 3 测试。
- 标题超过平台上限（小红书 20 字、抖音描述 / 公众号标题各有上限）被 App 静默截断：读回比对时要报「可能被截断」，不能当成功。→ Task 3 测试。
- 同一台手机同时 USB 和无线在线、或多台设备：要明确选一个序列号，不能让 uiautomator2 报歧义。→ Task 2 测试。
- 长文含多张内嵌图片，HTML 几 MB：CDP 单条消息过大，需分块传入。→ Task 4 测试。

---

## 文件结构

```
skills/browser-draft/lib/copy_format.py      新：发布文案解析（parse_copy），bd 和 pd 共用
skills/browser-draft/lib/bd.py               改：read_copy 改为调用 parse_copy
skills/browser-draft/bin/bd                  改：拼接 copy_format.py
skills/browser-draft/tests/test_copy_format.py  新

skills/phone-draft/
  SKILL.md                                   新：用法、规则、写步骤脚本的函数表、踩坑
  requirements.txt                           新
  bin/pd                                     新：bash 入口，设 PYTHONPATH，调 python -m phone_draft.cli
  lib/phone_draft/__init__.py                新：对步骤脚本公开的函数
  lib/phone_draft/core.py                    新：PAYLOAD、log/fail、OUT_DIR、is_forbidden、check_readback
  lib/phone_draft/connect.py                 新：adb 设备解析、选序列号、自动重连、记住地址
  lib/phone_draft/device.py                  新：uiautomator2 操作（open_app、tap_text…、shot、ui_texts）
  lib/phone_draft/screen.py                  新：亮屏 / 锁屏判断与唤醒
  lib/phone_draft/media.py                   新：push_media / clean_media
  lib/phone_draft/clipboard.py               新：手机 Edge + CDP 写富文本剪贴板 → 粘贴
  lib/phone_draft/cli.py                     新：pd devices | connect | ui | run
  tests/test_core.py, test_connect.py, test_screen.py, test_media.py, test_clipboard.py, test_cli.py

skills/wechat-article/scripts/phone_wechat.py    新
skills/wechat-article/scripts/wa.mjs             改：--via、payload 加 account
skills/wechat-article/tests/draft-via.test.mjs   新
skills/image-cards/scripts/phone_xiaohongshu.py  新
skills/image-cards/scripts/draft.mjs             改：--via
skills/image-cards/tests/draft-via.test.mjs      新
skills/narrated-video/scripts/phone_douyin.py    新
skills/narrated-video/scripts/draft.mjs          改：--via
skills/narrated-video/tests/draft-via.test.mjs   新
wechat-article.config.json                       改：account
CLAUDE.md、各 SKILL.md、memory                   改：文档
```

---

### Task 0：准备 worktree 和手机连接

- [ ] **Step 1：建 worktree**（按 superpowers:using-git-worktrees）

```bash
cd /home/power/self-media
git worktree add ../self-media-phone-draft -b phone-draft
cd ../self-media-phone-draft
```

之后所有路径都相对这个 worktree。`~/.local/bin` 里的 `wa/ic/nv/bd` 软链接仍指向主目录，测试本分支时直接用 worktree 里的 `skills/*/bin/*` 路径。

- [ ] **Step 2：确认手机在线**

```bash
adb devices -l
```

如果为空：让用户在手机「开发者选项 → 无线调试」页看「IP 地址和端口」，执行 `adb connect 192.168.3.3:<端口>`（已配对过，不用再 pair）。不要自己猜端口。

---

### Task 1：发布文案解析抽成共享模块

**Files:**
- Create: `skills/browser-draft/lib/copy_format.py`
- Modify: `skills/browser-draft/lib/bd.py`（`read_copy` 函数，约 181–211 行）
- Modify: `skills/browser-draft/bin/bd`（`run)` 分支的 `exec browser-harness` 行）
- Test: `skills/browser-draft/tests/test_copy_format.py`

**Interfaces:**
- Produces: `copy_format.parse_copy(path: str) -> {"title": str, "paragraphs": list[str], "topics": list[str]}`；格式错误抛 `copy_format.CopyFormatError(ValueError)`。`bd.py` 和 `phone_draft` 都用它包一层 `read_copy(path)`（出错 `fail`）。

- [ ] **Step 1：写失败的测试**

```python
# skills/browser-draft/tests/test_copy_format.py
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lib"))
from copy_format import CopyFormatError, parse_copy  # noqa: E402


def write(tmp_path, text):
    p = tmp_path / "文案.md"
    p.write_text(text, encoding="utf-8")
    return str(p)


def test_parses_title_paragraphs_and_topics(tmp_path):
    path = write(tmp_path, "## 标题\n\n一条消息\n\n## 正文\n\n第一段\n\n\n第二段\n\n## 话题\n\n#AI #效率 工具\n")
    assert parse_copy(path) == {"title": "一条消息", "paragraphs": ["第一段", "", "第二段"], "topics": ["AI", "效率"]}


def test_section_titles_only_need_prefix(tmp_path):
    path = write(tmp_path, "## 标题（≤20 字）\n标题A\n## 正文（口语）\n正文\n")
    assert parse_copy(path)["title"] == "标题A"
    assert parse_copy(path)["topics"] == []


def test_missing_title_section_raises(tmp_path):
    with pytest.raises(CopyFormatError, match="标题"):
        parse_copy(write(tmp_path, "## 正文\n正文\n"))


def test_empty_title_raises(tmp_path):
    with pytest.raises(CopyFormatError, match="空"):
        parse_copy(write(tmp_path, "## 标题\n\n## 正文\n正文\n"))
```

- [ ] **Step 2：跑测试确认失败**

先给 phone-draft 建好 venv（后面任务也用它跑所有 Python 测试）：

```bash
mkdir -p skills/phone-draft
printf 'uiautomator2==3.*\nwebsocket-client==1.*\npytest==8.*\n' > skills/phone-draft/requirements.txt
cd skills/phone-draft && uv venv .venv && uv pip install --python .venv/bin/python -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple && cd -
skills/phone-draft/.venv/bin/pytest skills/browser-draft/tests -q
```
Expected: FAIL，`ModuleNotFoundError: No module named 'copy_format'`

- [ ] **Step 3：实现**

```python
# skills/browser-draft/lib/copy_format.py
# 发布文案（Markdown）解析：browser-draft 和 phone-draft 共用。
# 按「## 」分段，段名以「标题」「正文」「话题」开头的分别是标题、正文（按行，连续空行合并为一个空串）、话题（#xx，不带 #）。
import re


class CopyFormatError(ValueError):
    pass


def parse_copy(path):
    sections, current = {}, None
    for line in open(path, encoding="utf-8").read().split("\n"):
        if line.startswith("## "):
            current = line[3:].strip()
            sections[current] = []
        elif current:
            sections[current].append(line.strip())

    def section(prefix, required=True):
        key = next((k for k in sections if k.startswith(prefix)), None)
        if key is None and required:
            raise CopyFormatError(f"文案里缺少「## {prefix}…」段落：{path}")
        return sections.get(key, [])

    title = next((l for l in section("标题") if l), "")
    if not title:
        raise CopyFormatError(f"文案的「标题」段落是空的：{path}")
    paragraphs = []
    for line in section("正文"):
        if line or (paragraphs and paragraphs[-1] != ""):
            paragraphs.append(line)
    while paragraphs and paragraphs[-1] == "":
        paragraphs.pop()
    topics = re.findall(r"#([^\s#]+)", " ".join(section("话题", required=False)))
    return {"title": title, "paragraphs": paragraphs, "topics": topics}
```

把 `bd.py` 里整个 `read_copy` 函数替换为：

```python
def read_copy(path):
    """读发布文案，格式见 copy_format.parse_copy（bd run 把 copy_format.py 拼在本文件前面）。"""
    try:
        return parse_copy(path)
    except CopyFormatError as err:
        fail(str(err))
```

`bin/bd` 的执行行改为：

```bash
    exec browser-harness -c "$(cat "$SKILL_DIR/lib/copy_format.py" "$SKILL_DIR/lib/bd.py" "$step")"
```

- [ ] **Step 4：跑测试确认通过**

Run: `skills/phone-draft/.venv/bin/pytest skills/browser-draft/tests -q` → Expected: 4 passed

再确认拼接后语法没坏：`cat skills/browser-draft/lib/copy_format.py skills/browser-draft/lib/bd.py | python3 -c "import ast,sys; ast.parse(sys.stdin.read())"` → 无输出。

- [ ] **Step 5：提交**

```bash
git add skills/browser-draft skills/phone-draft/requirements.txt
git commit -m "refactor: 发布文案解析抽成 copy_format，供浏览器和手机发草稿共用"
```

`.venv` 不提交：确认 `.gitignore` 已忽略 `.venv/`（`git check-ignore skills/phone-draft/.venv`），没有就在 `skills/phone-draft/.gitignore` 写 `.venv/`。

---

### Task 2：连接管理（connect.py）

**Files:**
- Create: `skills/phone-draft/lib/phone_draft/__init__.py`（先空文件）
- Create: `skills/phone-draft/lib/phone_draft/connect.py`
- Test: `skills/phone-draft/tests/test_connect.py`、`skills/phone-draft/tests/conftest.py`

**Interfaces:**
- Produces:
  - `parse_devices(output: str) -> list[tuple[str, str]]`（序列号, 状态）
  - `pick_serial(devices, preferred: str | None) -> str | None`
  - `ensure_connected(run=adb) -> str`：返回可用序列号；不可用抛 `DeviceUnavailable`
  - `connect(addr: str | None, run=adb) -> str`：连上返回地址并记住
  - `class DeviceUnavailable(Exception)`
  - `run` 签名：`run(args: list[str]) -> str`（adb 的 stdout+stderr）
  - 记住的地址文件：环境变量 `PD_STATE_DIR`（默认 `~/.config/phone-draft`）下的 `last-address`

- [ ] **Step 1：写失败的测试**

```python
# skills/phone-draft/tests/conftest.py
import sys
from pathlib import Path

LIB = Path(__file__).resolve().parents[1] / "lib"
sys.path.insert(0, str(LIB))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "browser-draft" / "lib"))
```

```python
# skills/phone-draft/tests/test_connect.py
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
```

- [ ] **Step 2：跑测试确认失败**

Run: `cd skills/phone-draft && .venv/bin/pytest tests/test_connect.py -q` → Expected: FAIL（`cannot import name 'connect'`）

- [ ] **Step 3：实现**

```python
# skills/phone-draft/lib/phone_draft/connect.py
"""找到可用的手机：解析 adb devices、选序列号、无线断线后用上次地址自动重连。"""
import os
import subprocess
from pathlib import Path

ONLINE = "device"
CONNECTED_MARKERS = ("connected to", "already connected")
PAIR_HELP = ("第一次用：手机「开发者选项 → 无线调试 → 使用配对码配对设备」，"
             "执行 adb pair IP:配对端口 配对码，再 pd connect IP:连接端口")
RECONNECT_HELP = ("到手机「开发者选项 → 无线调试」页看「IP 地址和端口」（重启或换网络后端口会变），"
                  "执行 pd connect IP:端口；或者加 --via browser 改用浏览器")


class DeviceUnavailable(Exception):
    pass


def adb(args):
    proc = subprocess.run(["adb", *args], capture_output=True, text=True, timeout=30)
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
```

- [ ] **Step 4：跑测试确认通过**

Run: `.venv/bin/pytest tests/test_connect.py -q` → Expected: 11 passed

- [ ] **Step 5：提交**

```bash
git add skills/phone-draft/lib skills/phone-draft/tests
git commit -m "feat: phone-draft 连接管理——选设备、断线用上次地址自动重连"
```

---

### Task 3：核心函数、亮屏检查、设备操作

**Files:**
- Create: `skills/phone-draft/lib/phone_draft/core.py`
- Create: `skills/phone-draft/lib/phone_draft/screen.py`
- Create: `skills/phone-draft/lib/phone_draft/device.py`
- Test: `skills/phone-draft/tests/test_core.py`、`skills/phone-draft/tests/test_screen.py`

**Interfaces:**
- Consumes: `connect.ensure_connected() -> str`
- Produces（core.py）：
  - `OUT_DIR: str`（`$TMPDIR/phone-draft` 或 `/tmp/phone-draft`）、`PAYLOAD: dict`（读环境变量 `PD_PAYLOAD` 指向的 JSON；没有则 `{}`）
  - `log(msg)`、`fail(msg) -> NoReturn`（打印 `✗ msg`，`raise SystemExit(2)`）
  - `is_forbidden(text: str) -> bool`
  - `check_readback(expected: str, actual: str, what: str) -> None`（不一致 `fail`；`actual` 是 `expected` 的前缀时提示「可能被 App 截断」）
  - `read_copy(path) -> dict`（包 `parse_copy`，出错 `fail`）
- Produces（screen.py）：`screen_state(power_dump: str, window_dump: str) -> "off" | "locked" | "ready"`
- Produces（device.py，模块内单例 `device()` 返回 `uiautomator2.Device`）：
  - `device() -> u2.Device`（首次调用：`ensure_connected` → `u2.connect(serial)` → `ensure_screen_ready`）
  - `ensure_screen_ready()`：黑屏就按电源键唤醒并上滑；仍锁屏 `fail("手机锁着屏，请先解锁…")`
  - `open_app(package: str)`：`app_start(package, stop=True)`，等 3 秒
  - `text_exists(text, contains=False) -> bool`
  - `wait_text(text, timeout=15, contains=False, what=None)`：超时 `fail_with_ui`
  - `tap_text(text, contains=False, timeout=10)`：`is_forbidden` 时 `fail`；找不到 `fail_with_ui`
  - `tap_id(resource_id, timeout=10)`
  - `dismiss(texts: list[str], rounds=2)`：出现就点，不出现跳过
  - `type_text(text: str)`：向当前焦点输入中文（`d.send_keys(text, clear=False)`）
  - `paste()`：`input keyevent 279`
  - `ui_texts() -> list[tuple[str, str, str]]`（文字, resource-id, bounds）：可见的非空 text / content-desc 节点
  - `shot(name) -> str`、`fail_with_ui(msg) -> NoReturn`（截图 + `ui_texts` 写到 `OUT_DIR/<时间>-fail.txt`，再 `fail`）

- [ ] **Step 1：写失败的测试**

```python
# skills/phone-draft/tests/test_core.py
import json

import pytest

from phone_draft import core


@pytest.mark.parametrize("text", ["发布", "发表", "群发", "立即发布", "发布笔记", " 发布 ", "定时发布"])
def test_publish_buttons_are_forbidden(text):
    assert core.is_forbidden(text)


@pytest.mark.parametrize("text", ["存草稿", "保存草稿", "暂存离开", "保存", "下一步", "草稿箱", "发布草稿到草稿箱"])
def test_draft_buttons_are_allowed(text):
    assert not core.is_forbidden(text)


def test_readback_equal_ignores_whitespace():
    core.check_readback("一条 消息\n", "一条消息", "标题")


def test_readback_truncated_mentions_truncation(capsys):
    with pytest.raises(SystemExit):
        core.check_readback("这是一个超过二十个字的小红书标题会被截断掉吧", "这是一个超过二十个字的小红书标题会被", "标题")
    assert "截断" in capsys.readouterr().out


def test_readback_mismatch_fails(capsys):
    with pytest.raises(SystemExit):
        core.check_readback("甲", "乙", "标题")
    assert "标题" in capsys.readouterr().out


def test_payload_loaded_from_env(tmp_path, monkeypatch):
    p = tmp_path / "payload.json"
    p.write_text(json.dumps({"title": "x"}), encoding="utf-8")
    monkeypatch.setenv("PD_PAYLOAD", str(p))
    assert core.load_payload() == {"title": "x"}
    monkeypatch.delenv("PD_PAYLOAD")
    assert core.load_payload() == {}


def test_read_copy_fails_cleanly_on_bad_file(tmp_path, capsys):
    p = tmp_path / "文案.md"
    p.write_text("## 正文\nx\n", encoding="utf-8")
    with pytest.raises(SystemExit):
        core.read_copy(str(p))
    assert "标题" in capsys.readouterr().out
```

```python
# skills/phone-draft/tests/test_screen.py
from phone_draft.screen import screen_state

AWAKE = "  mWakefulness=Awake\n"
ASLEEP = "  mWakefulness=Asleep\n"


def test_asleep_is_off():
    assert screen_state(ASLEEP, "") == "off"


def test_awake_with_keyguard_is_locked():
    assert screen_state(AWAKE, "    mKeyguardShowing=true\n") == "locked"
    assert screen_state(AWAKE, "  isKeyguardShowing=true\n") == "locked"


def test_awake_without_keyguard_is_ready():
    assert screen_state(AWAKE, "    mKeyguardShowing=false\n") == "ready"
```

- [ ] **Step 2：跑测试确认失败**

Run: `.venv/bin/pytest tests/test_core.py tests/test_screen.py -q` → Expected: FAIL（ImportError）

- [ ] **Step 3：实现 core.py 和 screen.py**

```python
# skills/phone-draft/lib/phone_draft/core.py
"""与设备无关的公共部分：载荷、输出、只存草稿的保护、读回校验。"""
import json
import os
import re
import tempfile

from copy_format import CopyFormatError, parse_copy

OUT_DIR = os.path.join(os.environ.get("TMPDIR") or tempfile.gettempdir(), "phone-draft")
FORBIDDEN_WORDS = ("发表", "发布", "群发")
DRAFT_WORD = "草稿"


def load_payload():
    path = os.environ.get("PD_PAYLOAD", "")
    return json.load(open(path, encoding="utf-8")) if path else {}


PAYLOAD = load_payload()


def log(msg):
    print(f"· {msg}", flush=True)


def fail(msg):
    print(f"✗ {msg}", flush=True)
    raise SystemExit(2)


def is_forbidden(text):
    """只存草稿：含发表 / 发布 / 群发、又不是「草稿」类的按钮一律不点。"""
    t = text.strip()
    return any(w in t for w in FORBIDDEN_WORDS) and DRAFT_WORD not in t


def _norm(s):
    return re.sub(r"\s+", "", s or "")


def check_readback(expected, actual, what):
    exp, got = _norm(expected), _norm(actual)
    if exp == got:
        return
    if got and exp.startswith(got):
        fail(f"{what}只填进去了 {len(got)} 字，可能被 App 截断（原文 {len(exp)} 字）：{actual}")
    fail(f"{what}读回来不一致：期望「{expected}」，实际「{actual}」")


def read_copy(path):
    try:
        return parse_copy(path)
    except CopyFormatError as err:
        fail(str(err))
```

```python
# skills/phone-draft/lib/phone_draft/screen.py
"""从 dumpsys 输出判断屏幕状态。"""
import re

KEYGUARD = re.compile(r"(mKeyguardShowing|isKeyguardShowing|mShowingLockscreen)=true")


def screen_state(power_dump, window_dump):
    if "mWakefulness=Awake" not in power_dump:
        return "off"
    return "locked" if KEYGUARD.search(window_dump) else "ready"
```

- [ ] **Step 4：跑测试确认通过**

Run: `.venv/bin/pytest tests -q` → Expected: 全部 passed

- [ ] **Step 5：在真机上核对 dumpsys 字段**

```bash
adb shell dumpsys power | grep mWakefulness
adb shell dumpsys window | grep -iE "keyguardshowing|showinglockscreen"
```

分别在亮屏解锁、锁屏（按一次电源键再按一次，停在锁屏界面）两种状态下运行。若 Flyme 的字段名不同，把实际输出的行加进 `test_screen.py` 新用例，再改 `KEYGUARD` 正则，直到测试通过。

- [ ] **Step 6：实现 device.py**

```python
# skills/phone-draft/lib/phone_draft/device.py
"""uiautomator2 操作：按文字找控件、等待、输入、截图。失败时留下截图和界面文字。"""
import os
import time
import xml.etree.ElementTree as ET

import uiautomator2 as u2

from .connect import DeviceUnavailable, ensure_connected
from .core import OUT_DIR, fail, is_forbidden, log
from .screen import screen_state

APP_START_WAIT = 3
_device = None


def device():
    global _device
    if _device is None:
        try:
            serial = ensure_connected()
        except DeviceUnavailable as err:
            fail(str(err))
        _device = u2.connect(serial)
        ensure_screen_ready()
    return _device


def _state(d):
    return screen_state(d.shell("dumpsys power").output, d.shell("dumpsys window").output)


def ensure_screen_ready():
    d = _device
    if _state(d) == "off":
        d.screen_on()
        time.sleep(1)
        d.swipe_ext("up", scale=0.8)
        time.sleep(1)
    if _state(d) != "ready":
        fail("手机锁着屏，请先解锁手机（或在设置里把自动锁屏时间调长）后重试")


def open_app(package):
    device().app_start(package, stop=True)
    time.sleep(APP_START_WAIT)


def _selector(text, contains):
    return device()(textContains=text) if contains else device()(text=text)


def text_exists(text, contains=False):
    return _selector(text, contains).exists


def wait_text(text, timeout=15, contains=False, what=None):
    if not _selector(text, contains).wait(timeout=timeout):
        fail_with_ui(f"等了 {timeout} 秒没出现「{text}」（{what or '页面就绪'}）")


def tap_text(text, contains=False, timeout=10):
    sel = _selector(text, contains)
    if not sel.wait(timeout=timeout):
        fail_with_ui(f"找不到「{text}」")
    actual = sel.get_text() or text
    if is_forbidden(actual):
        fail(f"拒绝点击「{actual}」：只存草稿，发布由你在手机上确认后操作")
    sel.click()


def tap_id(resource_id, timeout=10):
    sel = device()(resourceId=resource_id)
    if not sel.wait(timeout=timeout):
        fail_with_ui(f"找不到控件 {resource_id}")
    if is_forbidden(sel.get_text() or ""):
        fail(f"拒绝点击「{sel.get_text()}」：只存草稿")
    sel.click()


def dismiss(texts, rounds=2):
    for _ in range(rounds):
        for t in texts:
            if text_exists(t):
                device()(text=t).click()
                log(f"关掉提示：{t}")
                time.sleep(1)


def type_text(text):
    device().send_keys(text, clear=False)


def paste():
    device().shell("input keyevent 279")


def ui_texts():
    root = ET.fromstring(device().dump_hierarchy())
    out = []
    for node in root.iter("node"):
        label = node.get("text") or node.get("content-desc") or ""
        if label.strip():
            out.append((label, node.get("resource-id", ""), node.get("bounds", "")))
    return out


def shot(name):
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, f"{name}.png")
    device().screenshot(path)
    log(f"截图：{path}")
    return path


def fail_with_ui(msg):
    stamp = time.strftime("%H%M%S")
    try:
        shot(f"{stamp}-fail")
        os.makedirs(OUT_DIR, exist_ok=True)
        dump = os.path.join(OUT_DIR, f"{stamp}-fail.txt")
        with open(dump, "w", encoding="utf-8") as f:
            f.writelines(f"{t}\t{rid}\t{b}\n" for t, rid, b in ui_texts())
        log(f"界面文字：{dump}")
    except Exception as err:  # 留证据失败不应掩盖原始错误
        log(f"保存失败现场时出错：{err}")
    fail(msg)
```

- [ ] **Step 7：真机冒烟**

```bash
cd skills/phone-draft
PYTHONPATH=lib:../browser-draft/lib .venv/bin/python -c "
from phone_draft.device import device, open_app, wait_text, ui_texts, shot
d = device(); print(d.info['productName'])
open_app('com.tencent.mp'); wait_text('创作发表'); print(ui_texts()[:8]); shot('smoke')
"
```

Expected：第一次会自动往手机装 ATX 辅助 App——Flyme 若弹「允许安装」，请用户点允许；随后打印 `meizu20` 之类型号、包含「小白个人成长」「创作发表」的文字列表，截图路径。看一眼截图确认是公众号助手首页。

- [ ] **Step 8：提交**

```bash
git add skills/phone-draft/lib skills/phone-draft/tests
git commit -m "feat: phone-draft 核心——只存草稿保护、读回校验、亮屏检查、uiautomator2 操作"
```

---

### Task 4：富文本剪贴板（手机 Edge + CDP）和相册

**Files:**
- Create: `skills/phone-draft/lib/phone_draft/clipboard.py`
- Create: `skills/phone-draft/lib/phone_draft/media.py`
- Test: `skills/phone-draft/tests/test_clipboard.py`、`skills/phone-draft/tests/test_media.py`

**Interfaces:**
- Consumes: `device()`、`paste()`、`fail`、`log`
- Produces:
  - `clipboard.copy_steps(html: str, chunk: int = 200_000) -> list[str]`（要依次 `Runtime.evaluate` 的 JS 表达式；最后一条返回 `true` 表示复制成功）
  - `clipboard.paste_html(html: str, back_to: str, focus: Callable[[], None]) -> None`：手机 Edge 复制 → `monkey` 切回 `back_to` 包 → 调 `focus()` 把光标放到要粘贴的位置 → `paste()`
  - `media.REMOTE_DIR = "/sdcard/DCIM/phone-draft"`
  - `media.remote_names(paths: list[str], stamp: str) -> list[str]`（`pd<stamp>_<两位序号><扩展名>`，ASCII）
  - `media.push_media(paths: list[str]) -> list[str]`：按顺序逐个推送（间隔 1.1 秒，保证「添加时间」不同），触发媒体扫描，返回手机路径
  - `media.clean_media() -> None`
  - 相册选择器顺序约定：最新的在最前，所以第 1 张（最早推送）在网格里排第 N 位

- [ ] **Step 1：写失败的测试**

```python
# skills/phone-draft/tests/test_clipboard.py
import json
import re

from phone_draft.clipboard import copy_steps


def chunks_from(steps):
    return [json.loads(m.group(1)) for s in steps for m in [re.match(r"window\.__pd\.push\((.*)\)$", s, re.S)] if m]


def test_small_html_is_one_chunk_and_ends_with_copy():
    steps = copy_steps("<p>你好</p>")
    assert steps[0] == "window.__pd = []"
    assert chunks_from(steps) == ["<p>你好</p>"]
    assert "execCommand('copy')" in steps[-1]


def test_large_html_is_split_and_reassembles_exactly():
    html = "<p>" + "图" * 450_001 + "</p>" + '<img src="data:image/png;base64,QUJD">'
    steps = copy_steps(html, chunk=200_000)
    parts = chunks_from(steps)
    assert len(parts) == 3
    assert all(len(p) <= 200_000 for p in parts)
    assert "".join(parts) == html


def test_quotes_and_script_tags_are_escaped_safely():
    html = "<p>'\"</script> </p>"
    assert "".join(chunks_from(copy_steps(html))) == html
```

```python
# skills/phone-draft/tests/test_media.py
from phone_draft.media import REMOTE_DIR, remote_names


def test_remote_names_keep_order_and_extension_and_are_ascii():
    names = remote_names(["/a/封面.PNG", "/b/02.jpg", "/c/成片.mp4"], "1013T1200")
    assert names == [f"{REMOTE_DIR}/pd1013T1200_01.png", f"{REMOTE_DIR}/pd1013T1200_02.jpg", f"{REMOTE_DIR}/pd1013T1200_03.mp4"]
    assert all(n.isascii() for n in names)
```

- [ ] **Step 2：跑测试确认失败**

Run: `.venv/bin/pytest tests/test_clipboard.py tests/test_media.py -q` → Expected: FAIL（ImportError）

- [ ] **Step 3：实现**

```python
# skills/phone-draft/lib/phone_draft/clipboard.py
"""富文本剪贴板：在手机 Edge 里渲染 HTML、选中、复制，再切回 App 粘贴。
手机 Edge 运行时开放 localabstract:chrome_devtools_remote，经 adb forward 用 CDP 驱动。"""
import json
import time
import urllib.request

import websocket

from .core import fail, log
from .device import device, paste

EDGE = "com.microsoft.emmx"
DEVTOOLS_SOCKET = "localabstract:chrome_devtools_remote"
LOCAL_PORT = 9340
CHUNK = 200_000
COPY_JS = """(() => {
  document.body.innerHTML = window.__pd.join('');
  const range = document.createRange();
  range.selectNodeContents(document.body);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  return document.execCommand('copy');
})()"""


def copy_steps(html, chunk=CHUNK):
    steps = ["window.__pd = []"]
    for i in range(0, len(html), chunk):
        # json.dumps 默认 ensure_ascii，  和 </script> 都安全
        steps.append(f"window.__pd.push({json.dumps(html[i:i + chunk])})")
    steps.append(COPY_JS)
    return steps


def _http(path, method="GET"):
    req = urllib.request.Request(f"http://127.0.0.1:{LOCAL_PORT}{path}", method=method)
    return json.load(urllib.request.urlopen(req, timeout=10))


def _open_edge_tab():
    d = device()
    d.shell(f"monkey -p {EDGE} -c android.intent.category.LAUNCHER 1")
    for _ in range(20):
        if "chrome_devtools_remote" in d.shell("cat /proc/net/unix").output:
            break
        time.sleep(0.5)
    else:
        fail("手机 Edge 没有开放调试接口：确认手机装了 Edge 且「USB 调试」已开")
    d.adb_device.forward(f"tcp:{LOCAL_PORT}", DEVTOOLS_SOCKET)
    return _http("/json/new?about:blank", method="PUT")


def _evaluate(ws, expr, msg_id):
    ws.send(json.dumps({"id": msg_id, "method": "Runtime.evaluate",
                        "params": {"expression": expr, "userGesture": True, "returnByValue": True}}))
    while True:
        msg = json.loads(ws.recv())
        if msg.get("id") == msg_id:
            return msg.get("result", {}).get("result", {}).get("value")


def paste_html(html, back_to, focus):
    target = _open_edge_tab()
    ws = websocket.create_connection(target["webSocketDebuggerUrl"], timeout=60, suppress_origin=True)
    try:
        copied = None
        for i, expr in enumerate(copy_steps(html), start=1):
            copied = _evaluate(ws, expr, i)
        if copied is not True:
            fail("手机 Edge 复制富文本失败（execCommand('copy') 返回 false）")
    finally:
        ws.close()
        # /json/close 返回纯文本，不走 _http 的 JSON 解析
        urllib.request.urlopen(f"http://127.0.0.1:{LOCAL_PORT}/json/close/{target['id']}", timeout=10).read()
    log(f"已复制 {len(html)} 字符的富文本")
    device().shell(f"monkey -p {back_to} -c android.intent.category.LAUNCHER 1")
    time.sleep(2)
    focus()
    paste()
    time.sleep(3)
```

```python
# skills/phone-draft/lib/phone_draft/media.py
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
    files = d.shell(f"ls {REMOTE_DIR}").output.split()
    for name in files:
        d.shell(f"rm -f {REMOTE_DIR}/{name}")
        _scan(f"{REMOTE_DIR}/{name}")
    if files:
        log(f"已清理相册里的 {len(files)} 个临时文件")
```

- [ ] **Step 4：跑测试确认通过**

Run: `.venv/bin/pytest tests -q` → Expected: 全部 passed

- [ ] **Step 5：真机验证剪贴板和相册**

```bash
PYTHONPATH=lib:../browser-draft/lib .venv/bin/python -c "
from phone_draft.device import device, open_app, wait_text, tap_text, shot
from phone_draft.clipboard import paste_html
from phone_draft import media
p = media.push_media(['$(ls ../../04-作品/普通人的AI课/05-一条消息/小红书/out/*.png | head -1)'])
print(device().shell('content query --uri content://media/external/images/media --projection _data --where \"_data LIKE \'%phone-draft%\'\"').output)
media.clean_media()
"
```

Expected：`content query` 输出里有 `phone-draft/pd…_01.png`（说明媒体扫描生效）。如果没有，Android 16 可能忽略了广播：把 `_scan` 改为 `content call --uri content://media --method scan_volume --arg external_primary`，再试，以 `content query` 能查到为准。

剪贴板：在公众号助手里打开「写新文章」编辑页后再跑（用户说可以才跑，跑完放弃编辑）：

```bash
PYTHONPATH=lib:../browser-draft/lib .venv/bin/python -c "
from phone_draft.device import device, shot
from phone_draft.clipboard import paste_html
paste_html('<h2 style=\"color:#c00\">测试标题</h2><p><strong>加粗</strong>正文</p>', 'com.tencent.mp', lambda: device().click(0.5, 0.3))
shot('clip')
"
```

Expected：截图里编辑器出现红色「测试标题」和加粗文字。然后手动（或用 `tap_text`）退出并选「放弃编辑」。

- [ ] **Step 6：提交**

```bash
git add skills/phone-draft/lib skills/phone-draft/tests
git commit -m "feat: phone-draft 富文本剪贴板（手机 Edge + CDP，分块）和相册推送"
```

---

### Task 5：`pd` 命令行和公开接口

**Files:**
- Create: `skills/phone-draft/lib/phone_draft/cli.py`
- Modify: `skills/phone-draft/lib/phone_draft/__init__.py`
- Create: `skills/phone-draft/bin/pd`
- Test: `skills/phone-draft/tests/test_cli.py`

**Interfaces:**
- Consumes: 前面所有模块
- Produces:
  - `pd devices`：打印序列号、型号、电量、屏幕状态；手机不可用时退出码 3
  - `pd connect [IP:端口]`：成功打印 `✓ 已连接 IP:端口`；失败退出码 3
  - `pd ui [名字]`：截图 + 打印界面文字（探索 App 用）
  - `pd run <步骤.py> [载荷.json]`：设 `PD_PAYLOAD`，先 `ensure_connected`（不可用退出码 3），再 `runpy.run_path(step, run_name="__main__")`；步骤脚本 `fail` 退出码 2
  - `from phone_draft import *` 提供：`PAYLOAD, OUT_DIR, log, fail, read_copy, check_readback, device, open_app, text_exists, wait_text, tap_text, tap_id, dismiss, type_text, paste, ui_texts, shot, fail_with_ui, paste_html, push_media, clean_media`
  - 退出码常量：`EXIT_NO_DEVICE = 3`

- [ ] **Step 1：写失败的测试**

```python
# skills/phone-draft/tests/test_cli.py
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
```

- [ ] **Step 2：跑测试确认失败**

Run: `.venv/bin/pytest tests/test_cli.py -q` → Expected: FAIL

- [ ] **Step 3：实现**

```python
# skills/phone-draft/lib/phone_draft/cli.py
"""pd 命令：devices | connect [IP:端口] | ui [名字] | run <步骤.py> [载荷.json]"""
import os
import runpy
import sys

from .connect import DeviceUnavailable, connect, ensure_connected

EXIT_NO_DEVICE = 3
USAGE = "用法：pd devices | pd connect [IP:端口] | pd ui [名字] | pd run <步骤.py> [载荷.json]"


def _no_device(err):
    print(f"✗ {err}", flush=True)
    raise SystemExit(EXIT_NO_DEVICE)


def cmd_devices():
    from .device import _state, device
    d = device()
    info = d.device_info
    battery = d.shell("dumpsys battery | grep level").output.strip()
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
    except DeviceUnavailable as err:
        _no_device(err)
    print(USAGE, file=sys.stderr)
    raise SystemExit(1)


if __name__ == "__main__":
    main(sys.argv[1:])
```

注意：`PAYLOAD` 在 `core` 被导入时读取环境变量，所以 `cmd_run` 必须在导入步骤脚本（它会 `from phone_draft import *`）之前设好 `PD_PAYLOAD`——上面的顺序满足这一点，且 `cli.py` 顶部不导入 `core`/`device`。

```python
# skills/phone-draft/lib/phone_draft/__init__.py
"""步骤脚本用 `from phone_draft import *` 取得这些函数。"""
from .clipboard import paste_html
from .core import OUT_DIR, PAYLOAD, check_readback, fail, log, read_copy
from .device import (device, dismiss, fail_with_ui, open_app, paste, shot, tap_id, tap_text,
                     text_exists, type_text, ui_texts, wait_text)
from .media import clean_media, push_media

__all__ = ["PAYLOAD", "OUT_DIR", "log", "fail", "read_copy", "check_readback", "device", "open_app",
           "text_exists", "wait_text", "tap_text", "tap_id", "dismiss", "type_text", "paste", "ui_texts",
           "shot", "fail_with_ui", "paste_html", "push_media", "clean_media"]
```

`test_cli.py` 的前两个测试 import 了 `phone_draft.cli`，会触发 `__init__` 导入 `core` → `PAYLOAD` 在测试开始前就读好了；`test_run_passes_payload_and_runs_step` 只检查环境变量，不依赖 `PAYLOAD`，所以没问题。

```bash
# skills/phone-draft/bin/pd
#!/usr/bin/env bash
# phone-draft 入口：通过 adb 操作安卓手机上的 App 存草稿。
#   pd devices | pd connect [IP:端口] | pd ui [名字] | pd run <步骤.py> [载荷.json]
set -euo pipefail
SKILL_DIR="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"
PY="$SKILL_DIR/.venv/bin/python"
if [[ ! -x "$PY" ]]; then
  echo "✗ 未安装依赖：cd $SKILL_DIR && uv venv .venv && uv pip install --python .venv/bin/python -r requirements.txt" >&2
  exit 1
fi
command -v adb >/dev/null || { echo "✗ 需要 adb（Android platform-tools）" >&2; exit 1; }
export PYTHONPATH="$SKILL_DIR/lib:$SKILL_DIR/../browser-draft/lib${PYTHONPATH:+:$PYTHONPATH}"
exec "$PY" -m phone_draft.cli "$@"
```

```bash
chmod +x skills/phone-draft/bin/pd
```

- [ ] **Step 4：跑测试确认通过**

Run: `.venv/bin/pytest tests -q` → Expected: 全部 passed

- [ ] **Step 5：真机验证命令行**

```bash
skills/phone-draft/bin/pd devices
skills/phone-draft/bin/pd ui home
adb disconnect && skills/phone-draft/bin/pd devices   # 断开后应自动用上次地址重连
```

第三条要求 `~/.config/phone-draft/last-address` 里已有地址：先跑一次 `skills/phone-draft/bin/pd connect 192.168.3.3:<当前端口>`。Expected：三条都成功，第三条输出里设备仍是 192.168.3.3。

- [ ] **Step 6：提交**

```bash
git add skills/phone-draft
git commit -m "feat: pd 命令——devices、connect、ui、run"
```

---

### Task 6：三个平台命令加 `--via`

**Files:**
- Modify: `skills/wechat-article/scripts/wa.mjs`（`draft` 和 `main` 函数）
- Modify: `skills/image-cards/scripts/draft.mjs`
- Modify: `skills/narrated-video/scripts/draft.mjs`
- Modify: `wechat-article.config.json`（加 `"account": "小白个人成长"`）
- Modify: `skills/wechat-article/package.json`、`skills/image-cards/package.json`（加 `"scripts": {"test": "node --test tests/*.test.mjs"}`）
- Test: 三个 skill 各一个 `tests/draft-via.test.mjs`

**Interfaces:**
- Consumes: `pd run <步骤> <载荷>`（退出码 3 = 手机不可用）、`bd run <步骤> <载荷>`
- Produces:
  - 三个命令都接受 `--via phone|browser`，默认 `phone`；其他值报错退出 1
  - 手机步骤脚本路径：`<skill>/scripts/phone_wechat.py`、`phone_xiaohongshu.py`、`phone_douyin.py`
  - 公众号载荷多一个字段 `account`（来自配置，没有则空串）
  - `pd` 退出码 3 时，错误信息包含 `--via browser`，且**不调用 bd**

每个文件里加同样的小函数（三个 skill 相互独立，不跨 skill import）：

```js
const VIA = { phone: ["pd", "phone"], browser: ["bd", "browser"] };

/** 从参数里取出 --via phone|browser（默认 phone），返回 [via, 其余参数] */
function takeVia(argv) {
  const i = argv.indexOf("--via");
  if (i < 0) return ["phone", argv];
  const via = argv[i + 1];
  if (!VIA[via]) throw new Error(`--via 只能是 phone 或 browser，收到：${via}`);
  return [via, [...argv.slice(0, i), ...argv.slice(i + 2)]];
}

function runDraft(via, steps, payloadFile) {
  const [bin] = VIA[via];
  try {
    execFileSync(bin, ["run", steps[via], payloadFile], { stdio: "inherit" });
  } catch (err) {
    if (err.code === "ENOENT") throw new Error(`需要 ${bin} 命令（skills/${via === "phone" ? "phone-draft" : "browser-draft"}，软链接到 PATH）`);
    if (via === "phone" && err.status === 3) throw new Error("手机不可用（见上面的提示），也可以加 --via browser 改用浏览器");
    throw new Error("发草稿失败，看上面的输出");
  }
}
```

- [ ] **Step 1：写失败的测试（以 image-cards 为例，另两个照写，见下）**

```js
// skills/image-cards/tests/draft-via.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(SKILL, "scripts", "draft.mjs");

/** 假的 pd / bd：把参数写进 calls.log，按 FAKE_PD_EXIT 退出 */
function setup() {
  const dir = mkdtempSync(join(tmpdir(), "via-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  for (const name of ["pd", "bd"]) {
    const f = join(bin, name);
    writeFileSync(f, `#!/usr/bin/env bash\necho "${name} $*" >> "${dir}/calls.log"\nexit \${FAKE_${name.toUpperCase()}_EXIT:-0}\n`);
    chmodSync(f, 0o755);
  }
  mkdirSync(join(dir, "out"));
  writeFileSync(join(dir, "out", "01.png"), "x");
  writeFileSync(join(dir, "文案.md"), "## 标题\n测试\n## 正文\n正文\n");
  return { dir, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } };
}

const calls = (dir) => (existsSync(join(dir, "calls.log")) ? readFileSync(join(dir, "calls.log"), "utf8") : "");

test("默认走手机：调用 pd run phone_xiaohongshu.py", () => {
  const { dir, env } = setup();
  const r = spawnSync("node", [SCRIPT, join(dir, "文案.md")], { env, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(calls(dir), /^pd run .*phone_xiaohongshu\.py /);
});

test("--via browser 调用 bd run draft_xiaohongshu.py", () => {
  const { dir, env } = setup();
  const r = spawnSync("node", [SCRIPT, join(dir, "文案.md"), "--via", "browser"], { env, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(calls(dir), /^bd run .*draft_xiaohongshu\.py /);
});

test("手机不可用时报错、提示 --via browser，不回落到浏览器", () => {
  const { dir, env } = setup();
  const r = spawnSync("node", [SCRIPT, join(dir, "文案.md")], { env: { ...env, FAKE_PD_EXIT: "3" }, encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--via browser/);
  assert.doesNotMatch(calls(dir), /^bd /m);
});

test("--via 的值不对就报错", () => {
  const { dir, env } = setup();
  const r = spawnSync("node", [SCRIPT, join(dir, "文案.md"), "--via", "usb"], { env, encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /phone 或 browser/);
});
```

`narrated-video/tests/draft-via.test.mjs`：同样四个用例，`SCRIPT` 为 `scripts/draft.mjs`，参数为 `[join(dir, "成片.mp4"), "--copy", join(dir, "文案.md")]`（`setup` 里额外 `writeFileSync(join(dir, "成片.mp4"), "x")`），断言脚本名换成 `phone_douyin.py` / `draft_douyin.py`。

`wechat-article/tests/draft-via.test.mjs`：`SCRIPT` 为 `scripts/wa.mjs`，参数为 `["draft", join(dir, "文章.md")]`，`setup` 写一个最小文章：

```js
writeFileSync(join(dir, "文章.md"), "---\ntitle: 测试文章\n---\n\n正文一段。\n");
```

断言脚本名换成 `phone_wechat.py` / `draft_wechat.py`；再加一个用例检查载荷带 `account`：

```js
test("公众号载荷带 account", () => {
  const { dir, env } = setup();
  const r = spawnSync("node", [SCRIPT, "draft", join(dir, "文章.md")], { env, encoding: "utf8", cwd: resolve(SKILL, "../..") });
  assert.equal(r.status, 0, r.stderr);
  const payloadPath = calls(dir).trim().split(" ").pop();
  assert.equal(JSON.parse(readFileSync(payloadPath, "utf8")).account, "小白个人成长");
});
```

（`wa` 从项目根读 `wechat-article.config.json`，所以这个用例 `cwd` 设为仓库根；先看 `wa.mjs` 里 `loadConfig` 怎么找配置，若不是按 cwd 找，按它的规则调整 `cwd`。）

- [ ] **Step 2：跑测试确认失败**

```bash
(cd skills/image-cards && node --test tests/draft-via.test.mjs)
(cd skills/narrated-video && node --test tests/draft-via.test.mjs)
(cd skills/wechat-article && node --test tests/draft-via.test.mjs)
```
Expected：「默认走手机」等用例 FAIL（现在调用的是 bd）。

- [ ] **Step 3：改三个入口**

`skills/image-cards/scripts/draft.mjs`：
- 顶部注释第一行改为 `// ic draft <文案.md> [--images 目录] [--via phone|browser]：把卡片图片 + 文案存进小红书草稿箱（默认用 adb 操作手机，browser 用已登录的浏览器）。`
- 加入上面的 `VIA`、`takeVia`、`runDraft`。
- `main()` 第一行改为 `const [via, rest] = takeVia(process.argv.slice(2)); const opts = parseArgs(rest);`，用法提示改为 `用法：ic draft <文案.md> [--images 目录] [--via phone|browser]`。
- 把 `try { execFileSync("bd", …) } catch …` 整段替换为：

```js
  runDraft(via, { phone: join(SKILL_DIR, "scripts", "phone_xiaohongshu.py"), browser: join(SKILL_DIR, "scripts", "draft_xiaohongshu.py") }, payloadFile);
```

`skills/narrated-video/scripts/draft.mjs`：同样处理；`main()` 开头 `const [via, rest] = takeVia(process.argv.slice(2)); const { video, copy } = parseArgs(rest);`；`USAGE` 改为 `用法：nv draft <成片.mp4> --copy <发布文案.md> [--via phone|browser]`；步骤为 `phone_douyin.py` / `draft_douyin.py`。同步改 `bin/nv` 顶部注释那行 `nv draft`。

`skills/wechat-article/scripts/wa.mjs`：
- `main()` 改为先 `const [via, rest] = takeVia(process.argv.slice(2)); const [cmd, file] = rest;`，`draft` 调用时传 `via`：`commands[cmd](resolve(file), config, via)`（按现有调用方式调整，保留其他命令不受影响）。
- `draft(file, config, via = "phone")`：`payload` 加 `account: config.account ?? ""`；把 `try { execFileSync("bd", …) } catch …` 替换为：

```js
  runDraft(via, { phone: join(SKILL_DIR, "scripts", "phone_wechat.py"), browser: join(SKILL_DIR, "scripts", "draft_wechat.py") }, payloadFile);
```

- 顶部注释 `wa draft` 那行改为 `//   wa draft   <文章.md> [--via phone|browser]  存进公众号草稿箱：默认用 adb 操作手机上的公众号助手，browser 用已登录的浏览器`。

`wechat-article.config.json` 加 `"account": "小白个人成长"`。

- [ ] **Step 4：跑测试确认通过**

三条命令同 Step 2，Expected：全部 pass。再跑各 skill 原有测试确认没坏：`(cd skills/narrated-video && npm test)`。

- [ ] **Step 5：提交**

```bash
git add skills/wechat-article skills/image-cards skills/narrated-video wechat-article.config.json
git commit -m "feat: wa/ic/nv draft 加 --via phone|browser，默认走手机，手机不可用不回落"
```

---

### Task 7：公众号助手步骤脚本（phone_wechat.py）

**Files:**
- Create: `skills/wechat-article/scripts/phone_wechat.py`

**Interfaces:**
- Consumes: 载荷 `{"title", "author", "html"（图片已内联为 data:）, "cover", "images", "account"}`；`from phone_draft import *`
- Produces: 公众号助手草稿箱里出现该标题的草稿；成功最后一行输出 `✓ 公众号草稿已保存：<标题>…`

已知界面（2026-10-12 实测）：首页有账号名文字、「文章」；点「文章」弹出「写新文章 / 导入已有文章 / 转载 / 取消」；编辑页顶部「保存」（`com.tencent.mp:id/save_to_cloud`）和「下一步」（`com.tencent.mp:id/btn_action_option`）；正文和标题在 WebView `com.tencent.mp:id/editor_webview` 里，uiautomator 读不到里面的文字；标题占位「输入标题」在 WebView 顶部，正文占位「想说点什么」在其下；有上传失败图片时底部出现「N处图片发生错误」，退出编辑会被「文章内含有上传失败的图片…」拦住；退出未保存的编辑会弹「保存草稿 / 放弃编辑 / 取消」。

- [ ] **Step 1：写脚本**

```python
# skills/wechat-article/scripts/phone_wechat.py
# 公众号「发草稿」手机步骤：由 `wa draft` 生成载荷后，经 `pd run` 在手机的公众号助手里执行。
# 载荷：{"title", "author", "html"（本地图片已内联为 data:）, "cover", "images", "account"}
# 只点「保存」，不点「下一步」里的发表。
import re
import time

from phone_draft import *

APP = "com.tencent.mp"
WEBVIEW = "com.tencent.mp:id/editor_webview"
SAVE = "com.tencent.mp:id/save_to_cloud"
IMAGE_ERROR = re.compile(r"(\d+)处图片发生错误")
TITLE_Y = 0.06   # 标题行在 WebView 内的相对高度
BODY_Y = 0.16    # 正文第一行在 WebView 内的相对高度


def webview_point(rel_y):
    b = device()(resourceId=WEBVIEW).info["bounds"]
    return (b["left"] + b["right"]) // 2, int(b["top"] + (b["bottom"] - b["top"]) * rel_y)


def check_account():
    account = PAYLOAD.get("account")
    if account and not text_exists(account):
        fail_with_ui(f"公众号助手当前登录的不是「{account}」：请在 App 里切换账号后重试")
    log(f"账号：{account or '（配置里没写 account，跳过核对）'}")


def open_editor():
    open_app(APP)
    wait_text("创作发表", what="公众号助手首页")
    check_account()
    tap_text("文章")
    tap_text("写新文章")
    wait_text("保存", what="文章编辑页")
    time.sleep(2)


def fill_title():
    device().click(*webview_point(TITLE_Y))
    time.sleep(1)
    type_text(PAYLOAD["title"])
    log(f"标题：{PAYLOAD['title']}")


def word_count():
    """底部右侧的纯数字文本是正文字数（实测截图里是 2187）。"""
    return next((int(t) for t, _, _ in ui_texts() if t.isdigit()), None)


def wait_body_settled():
    """图片会逐张转存到微信图床：每 5 秒看一次，有错误提示就停；字数连续两次不变即认为粘贴完成。"""
    deadline = time.time() + 60 + 10 * int(PAYLOAD.get("images") or 0)
    last, stable = None, 0
    while time.time() < deadline:
        if any(IMAGE_ERROR.search(t) for t, _, _ in ui_texts()):
            fail_with_ui("有图片上传失败：在编辑页点「查看」处理后手动保存，或改用 --via browser")
        count = word_count()
        stable = stable + 1 if count and count == last else 0
        if stable >= 2:
            log(f"正文已粘贴，{count} 字")
            return
        last = count
        time.sleep(5)
    fail_with_ui("正文粘贴后一直没稳定下来（字数还在变或读不到字数）")


def fill_body():
    paste_html(PAYLOAD["html"], back_to=APP, focus=lambda: device().click(*webview_point(BODY_Y)))
    wait_body_settled()
    device().press("back")  # 收起键盘，露出顶部按钮
    shot("wechat-body")


def save():
    tap_id(SAVE)
    time.sleep(3)
    dismiss(["我知道了"])
    shot("wechat-saved")


def verify_in_drafts():
    device().press("back")
    time.sleep(2)
    if text_exists("放弃编辑"):
        fail_with_ui("保存没有生效：退出时还在问是否保存。请在手机上检查后手动保存")
    wait_text("草稿", what="公众号助手首页")
    tap_text("草稿")
    wait_text(PAYLOAD["title"][:12], contains=True, what="草稿列表里的新草稿")


open_editor()
fill_title()
fill_body()
save()
verify_in_drafts()
print(f"✓ 公众号草稿已保存：{PAYLOAD['title']}。封面、作者请在手机上「下一步」里确认后由你发表。", flush=True)
```

字数读取依赖底部那个纯数字文本；Step 2 若发现读不到（`word_count()` 一直是 None），用 `pd ui` 找到它的 resource-id，改成按 id 读。

- [ ] **Step 2：逐步在真机上核对（先确认用户此刻不用手机）**

用 `05-一条消息` 的文章跑（本分支的 wa）：

```bash
node skills/wechat-article/scripts/wa.mjs draft "04-作品/普通人的AI课/05-一条消息/公众号/文章.md"
```

逐个核对、出问题就用 `skills/phone-draft/bin/pd ui` 看界面再改脚本：
1. 标题有没有进标题行（看 `wechat-body.png`）。如果标题跑进了正文，调 `TITLE_Y`；如果 `type_text` 打不出中文，改用 `paste_html` 的纯文本版本（`paste_html(html.escape(title), …)`）。
2. 正文样式和图片是否都正常、底部有没有「N处图片发生错误」。若 data: 图片全部失败，停下来告诉用户，按 spec 的后备方案（图片推相册 + 编辑器插图按钮）另开任务，不要在这里硬做。
3. 「保存」后有没有「已保存」类提示；把实际出现的提示文字加进 `save()` 里用 `wait_text` 等它。
4. 草稿列表能否找到标题。

- [ ] **Step 3：截图给用户看，确认草稿内容**

把 `wechat-body.png`、`wechat-saved.png` 用 Read 看一遍，再请用户在手机草稿箱里打开核对。问用户这份测试草稿留着还是删掉。

- [ ] **Step 4：提交**

```bash
git add skills/wechat-article/scripts/phone_wechat.py
git commit -m "feat: 公众号助手手机发草稿——核对账号、填标题、富文本粘贴正文、保存"
```

---

### Task 8：小红书步骤脚本（phone_xiaohongshu.py）

**Files:**
- Create: `skills/image-cards/scripts/phone_xiaohongshu.py`

**Interfaces:**
- Consumes: 载荷 `{"copy", "images"}`（与浏览器版相同）；`from phone_draft import *`
- Produces: 小红书草稿箱多一篇；最后一行 `✓ 小红书草稿已保存：<标题>…`

- [ ] **Step 1：探索界面，记下每一步的真实文字**

```bash
adb shell monkey -p com.xingin.xhs -c android.intent.category.LAUNCHER 1; sleep 4
skills/phone-draft/bin/pd ui xhs-home
```

依次手动（`adb shell input tap x y`，坐标取自 `pd ui` 的 bounds 中心）走一遍：首页「+」→ 相册页 → 选 2 张图 → 「下一步」→ 图片编辑页 →「下一步」→ 笔记编辑页（标题框、正文框、话题）→ 找「存草稿」类按钮。每一页都 `pd ui xhs-<页>` 记下：按钮文字或 resource-id、标题和正文输入框的 resource-id、相册网格的 resource-id 和每格的选择框。**全程不点发布**；走完在编辑页按返回，若弹「保存草稿 / 不保存」选不保存。

把探索结果写在脚本顶部的常量里（下面的值是要替换的候选，以 `pd ui` 实际看到的为准）。

- [ ] **Step 2：写脚本**

```python
# skills/image-cards/scripts/phone_xiaohongshu.py
# 小红书「发草稿」手机步骤：由 `ic draft` 生成载荷后，经 `pd run` 在手机的小红书 App 里执行。
# 载荷：{"copy"（文案.md，格式见 copy_format）, "images"（本地路径，按顺序）}
# 只点「存草稿」，不点「发布笔记」。
import time

from phone_draft import *

APP = "com.xingin.xhs"
TITLE_MAX = 20
# ↓ 以下文字 / id 来自 Step 1 的 pd ui 探索结果
PLUS_ID = "com.xingin.xhs:id/index_tab_publish"  # 首页底部「+」：它的无障碍描述是「发布」，按文字点会被只存草稿保护拒绝，所以按 id 点
ALBUM_TAB = "相册"
NEXT = "下一步"
TITLE_ID = "com.xingin.xhs:id/titleEditText"
BODY_ID = "com.xingin.xhs:id/contentEditText"
SAVE_DRAFT = "存草稿"
SAVED_HINT = "已保存"

COPY = read_copy(PAYLOAD["copy"])


def pick_images(remotes):
    """相册网格最新在前：第 1 张（最早推送）在第 N 格。按 1..N 的顺序依次勾选。"""
    n = len(remotes)
    cells = device()(resourceId="com.xingin.xhs:id/selectView")  # Step 1 探到的勾选框 id
    if cells.count < n:
        fail_with_ui(f"相册里只看到 {cells.count} 格，少于 {n} 张图")
    for i in range(n - 1, -1, -1):
        cells[i].click()
        time.sleep(0.5)
    log(f"已按顺序选中 {n} 张图")


def fill_text():
    title = COPY["title"]
    if len(title) > TITLE_MAX:
        fail(f"标题 {len(title)} 字，超过小红书上限 {TITLE_MAX}：{title}")
    device()(resourceId=TITLE_ID).click()
    type_text(title)
    check_readback(title, device()(resourceId=TITLE_ID).get_text(), "标题")
    body = "\n".join(COPY["paragraphs"])
    topics = " ".join(f"#{t}" for t in COPY["topics"])
    device()(resourceId=BODY_ID).click()
    type_text(body + ("\n" + topics if topics else ""))
    log(f"标题：{title}｜正文 {len(body)} 字｜话题 {len(COPY['topics'])} 个")


remotes = push_media(PAYLOAD["images"])
open_app(APP)
dismiss(["我知道了", "稍后再说"])
tap_id(PLUS_ID)
tap_text(ALBUM_TAB)
pick_images(remotes)
tap_text(NEXT)
time.sleep(2)
tap_text(NEXT)  # 图片编辑页 → 笔记编辑页；若 Step 1 发现只有一个「下一步」，删掉这一行
fill_text()
shot("xhs-filled")
tap_text(SAVE_DRAFT)
wait_text(SAVED_HINT, contains=True, what="存草稿成功提示")
shot("xhs-saved")
clean_media()
print(f"✓ 小红书草稿已保存：{COPY['title']}（{len(remotes)} 张图）。到 App「我 → 草稿箱」确认后由你发布。", flush=True)
```

话题：小红书输入 `#xx` 后通常会弹话题联想，直接继续输入可能把联想项选进去或不选。Step 3 实测时看 `xhs-filled.png` 里话题是否成了蓝色话题；若没有，把话题改为逐个 `type_text("#" + t)` → `time.sleep(1)` → 点联想列表第一项（`pd ui` 探到其 id）。

- [ ] **Step 3：真机跑通**

```bash
node skills/image-cards/scripts/draft.mjs "04-作品/普通人的AI课/05-一条消息/小红书/文案.md"
```

核对 `xhs-filled.png`（图片顺序、标题、正文、话题）和 `xhs-saved.png`；保存后相册临时文件被清理后，打开 App 草稿箱看草稿图片是否仍完整——如果图片丢了，说明 App 仍引用原文件：把 `clean_media()` 从结尾挪到 `push_media` 之前（清理上一次的），并在 SKILL.md 里写明。

- [ ] **Step 4：截图给用户确认，问测试草稿留不留**

- [ ] **Step 5：提交**

```bash
git add skills/image-cards/scripts/phone_xiaohongshu.py
git commit -m "feat: 小红书手机发草稿——推图、按序选图、填标题正文话题、存草稿"
```

---

### Task 9：抖音步骤脚本（phone_douyin.py）

**Files:**
- Create: `skills/narrated-video/scripts/phone_douyin.py`

**Interfaces:**
- Consumes: 载荷 `{"video", "copy"}`；`from phone_draft import *`
- Produces: 抖音草稿箱多一条；最后一行 `✓ 抖音草稿已保存：<标题>…`

- [ ] **Step 1：探索界面**

同 Task 8 Step 1，用 `pd ui dy-<页>` 走一遍：首页「+」→ 相册 → 选视频 → 下一步（剪辑页）→ 下一步（发布页：作品描述输入框、「存草稿」按钮）。顺便确认：草稿箱里已有草稿时是否有限制或提示。**不点发布**；走完返回，弹窗选不保存 / 放弃本次（这是探索中我们自己新建的内容，点放弃前先确认屏幕上是我们刚选的测试视频）。

需要一份抖音发布文案测试：在 scratchpad 写一个

```markdown
## 标题
测试：AI 写的消息先让它替对方读一遍
## 正文
测试草稿，确认后删除。
## 话题
#AI #效率
```

- [ ] **Step 2：写脚本**

```python
# skills/narrated-video/scripts/phone_douyin.py
# 抖音「发草稿」手机步骤：由 `nv draft` 生成载荷后，经 `pd run` 在手机的抖音 App 里执行。
# 载荷：{"video"（成片路径）, "copy"（发布文案.md，格式见 copy_format）}
# 只点「存草稿」，不点「发布」。
import time

from phone_draft import *

APP = "com.ss.android.ugc.aweme"
TITLE_MAX = 30
# ↓ 以下文字 / id 来自 Step 1 的 pd ui 探索结果
PLUS = "拍摄"
ALBUM = "相册"
NEXT = "下一步"
DESC_ID = "com.ss.android.ugc.aweme:id/editor_text"
SAVE_DRAFT = "存草稿"
SAVED_HINT = "草稿"

COPY = read_copy(PAYLOAD["copy"])


def pick_video():
    first = device()(resourceId="com.ss.android.ugc.aweme:id/media_item")  # Step 1 探到的相册格子 id
    if not first.wait(timeout=10):
        fail_with_ui("相册里没看到视频")
    first[0].click()  # 刚推送的视频最新，在第一格
    time.sleep(1)


def fill_desc():
    title = COPY["title"]
    if len(title) > TITLE_MAX:
        fail(f"标题 {len(title)} 字，超过抖音上限 {TITLE_MAX}：{title}")
    lines = [title, *COPY["paragraphs"]]
    topics = " ".join(f"#{t}" for t in COPY["topics"])
    desc = "\n".join(lines) + (("\n" + topics) if topics else "")
    device()(resourceId=DESC_ID).click()
    type_text(desc)
    check_readback(desc, device()(resourceId=DESC_ID).get_text(), "作品描述")
    log(f"描述：{title}｜话题 {len(COPY['topics'])} 个")


push_media([PAYLOAD["video"]])
open_app(APP)
dismiss(["我知道了", "以后再说", "取消"])
tap_text(PLUS)
tap_text(ALBUM)
pick_video()
tap_text(NEXT)
wait_text(NEXT, what="剪辑页")
tap_text(NEXT)
wait_text(SAVE_DRAFT, what="发布页")
fill_desc()
shot("douyin-filled")
tap_text(SAVE_DRAFT)
wait_text(SAVED_HINT, contains=True, what="存草稿成功")
shot("douyin-saved")
clean_media()
print(f"✓ 抖音草稿已保存：{COPY['title']}。到 App「我 → 草稿」确认后由你发布。", flush=True)
```

`dismiss` 里的「取消」可能误关有用的弹窗：Step 3 实测时如果首页没有弹窗就删掉它；读回比对时抖音可能把话题转成特殊样式文字，若 `check_readback` 因话题失败，改成只比对标题和正文部分（`desc` 去掉话题行），话题用截图核对。

- [ ] **Step 3：真机跑通**

```bash
node skills/narrated-video/scripts/draft.mjs "04-作品/普通人的AI课/05-一条消息/抖音/renders/05-一条消息.mp4" --copy <scratchpad>/抖音文案.md
```

核对两张截图；同 Task 8 检查清理相册后草稿视频是否仍可播放。

- [ ] **Step 4：截图给用户确认，问测试草稿留不留**

- [ ] **Step 5：提交**

```bash
git add skills/narrated-video/scripts/phone_douyin.py
git commit -m "feat: 抖音手机发草稿——推视频、选片、填描述、存草稿"
```

---

### Task 10：文档、软链接、收尾

**Files:**
- Create: `skills/phone-draft/SKILL.md`
- Modify: `skills/browser-draft/SKILL.md`（开头说明「默认改走手机，见 phone-draft；本 skill 作为 `--via browser` 后备」）
- Modify: `skills/wechat-article/SKILL.md`、`skills/image-cards/SKILL.md`、`skills/narrated-video/SKILL.md`（draft 命令行加 `[--via phone|browser]`，说明默认走手机）
- Modify: `CLAUDE.md` 第 12 行公众号那条：`发草稿用 wa draft（默认通过 adb 操作手机上的公众号助手，skills/phone-draft；--via browser 用浏览器，skills/browser-draft）`
- Memory：更新 `wechat-draft-by-browser.md`（改名语义为「发草稿」：默认手机、浏览器后备、无线调试重连方法），MEMORY.md 对应一行

- [ ] **Step 1：写 `skills/phone-draft/SKILL.md`**

```markdown
---
name: phone-draft
description: 通过 adb（uiautomator2）操作安卓手机上的 App，把做好的内容填进发布页并存成草稿，不点发布。
  提供 pd 命令和一组公共函数（打开 App、按文字点击、等待、输入中文、富文本粘贴、推相册、截图），
  各平台的具体步骤写成脚本放在各自的 skill 里（如 wechat-article 的 phone_wechat.py）。
  当用户要「用手机发草稿」「自动存到 App 草稿箱」、手机连不上要重连，或要给某个 App 新写一个发草稿脚本时使用。
---

# phone-draft：用手机自动存草稿

（正文包含：命令表 pd devices / connect / ui / run；平台命令表 wa/ic/nv draft 默认走手机；
规则（只存草稿、登录交给人、失败停在原地、相册 DCIM/phone-draft 用完清理）；
前提（开发者选项、无线调试配对 adb pair、pd connect 记住地址、断线自动重连、重启后端口会变）；
写步骤脚本：`from phone_draft import *` 的函数表（与 Task 5 的 __all__ 一一对应）；
踩坑（Task 7–9 实测中记下的：WebView 里的文字读不到要按相对位置点、相册最新在前、
公众号图片失败会拦住退出、富文本靠手机 Edge 复制等）。每节写实，不留空。）
```

把上面括号里的提纲写成完整正文，函数表逐个列出 Task 5 `__all__` 里的名字和一句话作用；踩坑一节只写 Task 7–9 实测确认过的事实。

- [ ] **Step 2：改其他 SKILL.md、CLAUDE.md**（按 Files 列表逐个改，用词和现有文档一致）

- [ ] **Step 3：全部测试**

```bash
skills/phone-draft/.venv/bin/pytest skills/phone-draft/tests skills/browser-draft/tests -q
(cd skills/narrated-video && npm test) && (cd skills/image-cards && npm test) && (cd skills/wechat-article && npm test)
```
Expected：全部通过。

- [ ] **Step 4：提交并合并**

```bash
git add -A skills CLAUDE.md
git commit -m "docs: phone-draft 说明，各平台 draft 默认走手机"
```

按 superpowers:finishing-a-development-branch 合并回 main（先 `git -C /home/power/self-media log main --oneline -5` 看别的会话有没有新提交，有就先 rebase）。

- [ ] **Step 5：装软链接（合并到 main 之后，在主目录做）**

```bash
cd /home/power/self-media/skills/phone-draft && uv venv .venv && uv pip install --python .venv/bin/python -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
ln -s /home/power/self-media/skills/phone-draft ~/.claude/skills/phone-draft
ln -s /home/power/self-media/skills/phone-draft/bin/pd ~/.local/bin/pd
pd devices
```
Expected：`pd devices` 打印魅族 20 的信息。

- [ ] **Step 6：更新 memory**（按 Files 列表）
