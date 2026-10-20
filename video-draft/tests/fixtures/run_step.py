# 用假的浏览器函数执行一个存草稿步骤脚本（不连浏览器）：python3 run_step.py <脚本> <场景 JSON>
# 场景：{"payload": {...}, "copy": {...}, "missing": ["选择器片段", ...]}（js() 表达式里含这些片段时返回 None，模拟页面上找不到）
import json
import sys
import time

script, scenario = sys.argv[1], json.loads(sys.argv[2])
time.sleep = lambda *_: None
drafts = {"n": 0}


def fail(msg):
    print(f"✗ {msg}", flush=True)
    raise SystemExit(2)


def js(expr):
    if any(m in expr for m in scenario.get("missing", [])):
        return None
    if "草稿箱" in expr:
        drafts["n"] += 1
        return drafts["n"]
    if "getBoundingClientRect" in expr:
        return [10, 10]
    if 'data-bd="title"' in expr and ".value" in expr:
        return scenario["copy"]["title"]
    if "tiptap-topic" in expr:
        return 0
    return True


env = {
    "PAYLOAD": scenario["payload"],
    "read_copy": lambda _p: scenario["copy"],
    "log": lambda m: print(f"· {m}", flush=True),
    "fail": fail,
    "js": js,
    "js_str": lambda v: json.dumps(v, ensure_ascii=False),
    "wait_until": lambda expr, **_: ("ok" if "上传失败" in expr else "x"),
    "page_info": lambda: {"url": "https://creator.xiaohongshu.com/publish"},
    "click_text": lambda *a, **k: True,
    **{name: (lambda *a, **k: None) for name in ["open_tab", "goto_url", "wait_for_load", "upload", "dismiss", "click_at_xy", "cdp", "paste_html", "shot"]},
}
exec(compile(open(script, encoding="utf-8").read(), script, "exec"), env)
