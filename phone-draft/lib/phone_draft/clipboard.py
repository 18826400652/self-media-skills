"""富文本剪贴板：在手机 Edge 里渲染 HTML、选中、复制，再切回 App 粘贴。
手机 Edge 运行时开放 localabstract:chrome_devtools_remote，经 adb forward 用 CDP 驱动。"""
import json
import time

import websocket

from .core import fail, log
from .device import device, paste
from .html_parts import html_chunks, shrink_data_images

EDGE = "com.microsoft.emmx"
DEVTOOLS_SOCKET = "localabstract:chrome_devtools_remote"
LOCAL_PORT = 9340
SOCKET_WAIT_ROUNDS = 20
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


def _connect(path):
    # 本机端口不走代理（环境里有 http_proxy）
    return websocket.create_connection(f"ws://127.0.0.1:{LOCAL_PORT}{path}", timeout=60,
                                       suppress_origin=True, http_no_proxy=["127.0.0.1"])


def _browser_call(method, params):
    """手机 Edge 不支持 /json/new，标签页用浏览器级的 Target.* 命令开关。"""
    ws = _connect("/devtools/browser")
    try:
        ws.send(json.dumps({"id": 1, "method": method, "params": params}))
        return json.loads(ws.recv()).get("result", {})
    finally:
        ws.close()


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
    target_id = _browser_call("Target.createTarget", {"url": "about:blank"}).get("targetId")
    if not target_id:
        fail("手机 Edge 新开标签页失败")
    return target_id


def _evaluate(ws, expr, msg_id):
    ws.send(json.dumps({"id": msg_id, "method": "Runtime.evaluate",
                        "params": {"expression": expr, "userGesture": True, "returnByValue": True}}))
    while True:
        msg = json.loads(ws.recv())
        if msg.get("id") == msg_id:
            return msg.get("result", {}).get("result", {}).get("value")


def _copy_in_edge(html):
    target_id = _open_edge_tab()
    ws = _connect(f"/devtools/page/{target_id}")
    try:
        copied = None
        for i, expr in enumerate(copy_steps(html), start=1):
            copied = _evaluate(ws, expr, i)
        if copied is not True:
            fail("手机 Edge 复制富文本失败（execCommand('copy') 返回 false）")
    finally:
        ws.close()
        _browser_call("Target.closeTarget", {"targetId": target_id})


def paste_html(html, back_to, focus):
    """把 HTML 带格式粘进 back_to App：focus() 负责点进编辑区，之后光标移到末尾再粘贴。
    内容大时先缩图、再分几段依次粘贴。"""
    try:
        chunks = html_chunks(shrink_data_images(html))
    except ValueError as err:
        fail(str(err))
    for i, chunk in enumerate(chunks, start=1):
        _copy_in_edge(chunk)
        log(f"已复制第 {i}/{len(chunks)} 段富文本（{len(chunk)} 字符）")
        device().shell(f"monkey -p {back_to} -c android.intent.category.LAUNCHER 1")
        time.sleep(2)
        focus()
        device().shell("input keycombination 113 123")  # Ctrl+End：光标移到正文末尾
        time.sleep(0.5)
        paste()
        time.sleep(3)
