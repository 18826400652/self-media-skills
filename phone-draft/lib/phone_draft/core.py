"""与设备无关的公共部分：载荷、输出、只存草稿的保护、读回校验。"""
import json
import os
import re
import tempfile

from copy_format import CopyFormatError, parse_copy

OUT_DIR = os.path.join(os.environ.get("TMPDIR") or tempfile.gettempdir(), "phone-draft")
FORBIDDEN_WORDS = ("发表", "发布", "群发", "发作品", "日常")  # 抖音的发布按钮叫「发作品」，「限时日常」也是直接发出
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
    """只存草稿：含发表 / 发布 / 群发 / 发作品 / 日常、又不是「草稿」类的按钮一律不点。"""
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
