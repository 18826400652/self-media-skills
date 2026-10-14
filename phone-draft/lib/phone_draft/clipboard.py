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
SOCKET_WAIT_ROUNDS = 20
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


def _url(path):
    return f"http://127.0.0.1:{LOCAL_PORT}{path}"


def _open_edge_tab():
    d = device()
    d.shell(f"monkey -p {EDGE} -c android.intent.category.LAUNCHER 1")
    for _ in range(SOCKET_WAIT_ROUNDS):
        if "chrome_devtools_remote" in d.shell("cat /proc/net/unix").output:
            break
        time.sleep(0.5)
    else:
        fail("手机 Edge 没有开放调试接口：确认手机装了 Edge 且「USB 调试」已开")
    d.adb_device.forward(f"tcp:{LOCAL_PORT}", DEVTOOLS_SOCKET)
    req = urllib.request.Request(_url("/json/new?about:blank"), method="PUT")
    return json.load(urllib.request.urlopen(req, timeout=10))


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
        # /json/close 返回纯文本，不做 JSON 解析
        urllib.request.urlopen(_url(f"/json/close/{target['id']}"), timeout=10).read()
    log(f"已复制 {len(html)} 字符的富文本")
    device().shell(f"monkey -p {back_to} -c android.intent.category.LAUNCHER 1")
    time.sleep(2)
    focus()
    paste()
    time.sleep(3)
