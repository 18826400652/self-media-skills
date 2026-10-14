"""各 AI App 的界面操作，pd rec 按名字加载。新增 App：照 deepseek.py 写一个模块，登记到 APPS。"""
import importlib

from ..core import fail

APPS = {"deepseek": "DeepSeek", "doubao": "豆包"}


def load_app(name):
    if name not in APPS:
        fail(f"不支持的 App：{name}（可用：{', '.join(APPS)}）")
    return importlib.import_module(f"{__name__}.{name}")
