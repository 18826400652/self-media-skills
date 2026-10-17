# A6：浏览器卡住时（新开标签页超时、Target is closing）不再甩出原始 Python 堆栈，说清楚怎么办；open_tab 先重试一次。
import os
import subprocess
from pathlib import Path

SKILL = Path(__file__).resolve().parents[1]
BD = SKILL / "bin" / "bd"


def run_bd(tmp_path, harness_body):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    h = bin_dir / "browser-harness"
    h.write_text("#!/usr/bin/env bash\n" + harness_body)
    h.chmod(0o755)
    step = tmp_path / "step.py"
    step.write_text("print('· 步骤开始')\n")
    env = {**os.environ, "PATH": f"{bin_dir}:{os.environ['PATH']}", "BU_CDP_WS": "ws://x", "BD_OUT": str(tmp_path / "out")}
    return subprocess.run([str(BD), "run", str(step)], capture_output=True, text=True, env=env, cwd=tmp_path)


TRACE = '''echo "Target is closing"
echo "· 标题：测试"
echo "Target is closing"
cat >&2 <<'T'
Traceback (most recent call last):
  File "<string>", line 79, in open_tab
  File "helpers.py", line 99, in request
TimeoutError: timed out
T
exit 1
'''


def test_traceback_becomes_one_line_hint_and_full_trace_saved(tmp_path):
    r = run_bd(tmp_path, TRACE)
    assert r.returncode == 1
    assert "Traceback" not in r.stderr
    assert "浏览器没响应" in r.stderr and "TimeoutError: timed out" in r.stderr
    assert "草稿没存好" in r.stderr
    saved = tmp_path / "out" / "last-error.txt"
    assert "Traceback" in saved.read_text()
    assert str(saved) in r.stderr


def test_target_is_closing_noise_hidden_normal_output_kept(tmp_path):
    r = run_bd(tmp_path, TRACE)
    assert "Target is closing" not in r.stdout
    assert "· 标题：测试" in r.stdout


def test_success_passes_through(tmp_path):
    r = run_bd(tmp_path, 'echo "✓ 已保存"\nexit 0\n')
    assert r.returncode == 0
    assert "✓ 已保存" in r.stdout


def test_fail_exit_2_from_step_keeps_its_own_message(tmp_path):
    # 步骤脚本自己 fail() 的（✗ 开头、退出码 2）原样给出，不加「浏览器没响应」
    r = run_bd(tmp_path, 'echo "✗ 等待超时：编辑器"\nexit 2\n')
    assert r.returncode == 2
    assert "✗ 等待超时：编辑器" in r.stdout
    assert "浏览器没响应" not in r.stderr


def test_open_tab_retries_once_then_explains(tmp_path):
    calls = []

    def flaky_new_tab(url):
        calls.append(url)
        if len(calls) == 1:
            raise TimeoutError("timed out")

    g = {"cdp": lambda *a, **k: {"targetInfos": []}, "new_tab": flaky_new_tab, "switch_tab": lambda t: None,
         "wait_for_load": lambda: None, "page_info": lambda: {"url": "https://mp.weixin.qq.com/"}, "js": lambda e: None}
    exec((SKILL / "lib" / "copy_format.py").read_text(encoding="utf-8") + "\n" + (SKILL / "lib" / "bd.py").read_text(encoding="utf-8"), g)
    g["time"].sleep = lambda s: None
    assert g["open_tab"]("https://mp.weixin.qq.com/") == "https://mp.weixin.qq.com/"
    assert len(calls) == 2

    def always_fail(url):
        raise RuntimeError("Target is closing")

    g["new_tab"] = always_fail
    try:
        g["open_tab"]("https://mp.weixin.qq.com/")
        raise AssertionError("应该报错")
    except SystemExit as e:
        assert e.code == 2
