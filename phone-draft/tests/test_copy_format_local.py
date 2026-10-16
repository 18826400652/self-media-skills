# phone-draft 自带 copy_format（由 shared/ 同步），不借 browser-draft 的：单独拷走也能用
import subprocess
import sys
from pathlib import Path

SKILL = Path(__file__).resolve().parents[1]


def test_lib_has_own_copy_format():
    assert (SKILL / "lib" / "copy_format.py").exists()


def test_import_without_browser_draft_on_path(tmp_path):
    copy = tmp_path / "文案.md"
    copy.write_text("## 标题\n测试\n## 正文\n第一行\n## 话题\n#AI #效率\n", encoding="utf-8")
    code = f"import copy_format; print(copy_format.parse_copy({str(copy)!r})['topics'])"
    r = subprocess.run([sys.executable, "-c", code], env={"PYTHONPATH": str(SKILL / "lib")}, capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    assert "['AI', '效率']" in r.stdout


def test_pd_entry_does_not_reference_browser_draft():
    assert "browser-draft" not in (SKILL / "bin" / "pd").read_text(encoding="utf-8")
