# 在 browser-harness 里运行（helpers 已预载：cdp、js、drain_events、click_at_xy、new_tab、wait_for_load、capture_screenshot）。
# 由 scripts/rec-flow.mjs 设置环境变量后调用：
#   REC_DIR 帧输出目录；REC_STEPS 步骤脚本；REC_URL 打开的网址（空 = 用当前标签页）
#   REC_W / REC_H 视口（CSS 像素）；REC_SCALE 像素倍数；REC_FPS 最高帧率；REC_THEME dark / light；REC_HIDE 要隐藏的元素
#   REC_DOWNLOAD_DIR 下载目录（浏览器那一侧的路径，空 = 不改）
# 步骤脚本是普通 Python，可以直接用下面这些函数（等待时会持续录帧）：
#   wait(秒)、wait_until(js表达式, timeout, what)、mark(名字)、log(文字)
#   click_text(文字, exact=True)、click_css(选择器)、type_into(选择器, 文字)、shot(路径)
import base64, json, os, time

D = os.environ["REC_DIR"]
W, H = int(os.environ.get("REC_W", "1280")), int(os.environ.get("REC_H", "720"))
SCALE = float(os.environ.get("REC_SCALE", "1.5"))
MIN_GAP = 1 / float(os.environ.get("REC_FPS", "15"))
frames, marks, logs = [], {}, []
_last = [0.0]

def pump():
    for ev in drain_events():
        if ev.get("method") != "Page.screencastFrame":
            continue
        p = ev["params"]
        cdp("Page.screencastFrameAck", sessionId=p["sessionId"])
        t = p["metadata"]["timestamp"]
        if t - _last[0] < MIN_GAP:  # 限帧率：长时间录制（如等生成）时控制帧数
            continue
        _last[0] = t
        open(f"{D}/f{len(frames):05d}.jpg", "wb").write(base64.b64decode(p["data"]))
        frames.append(t)

def wait(sec):
    end = time.time() + sec
    while time.time() < end:
        pump(); time.sleep(0.03)

def wait_until(expr, timeout=60, what="条件成立", interval=0.5):
    end = time.time() + timeout
    while time.time() < end:
        value = js(expr)
        if value:
            return value
        wait(interval)
    raise SystemExit(f"超时（{timeout} 秒）：等{what}")

def mark(name):
    marks[name] = time.time()
    log(f"[{name}]")

def log(msg):
    stamp = round(time.time() - (frames[0] if frames else time.time()), 1)
    logs.append(f"{stamp}s {msg}")
    print(f"· {msg}", flush=True)

def _center(find_js):
    r = js("(()=>{const e=" + find_js + ";if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return JSON.stringify([r.x+r.width/2,r.y+r.height/2]);})()")
    return json.loads(r) if r else None

def click_text(text, exact=True, timeout=10):
    """点击文字匹配的可见按钮或链接（真实鼠标点击，录屏里能看到）。"""
    cond = "t===" + json.dumps(text) if exact else "t.includes(" + json.dumps(text) + ")"
    find = ("[...document.querySelectorAll('button,a,[role=button],label')].find(e=>{const t=e.textContent.trim();"
            "return e.getClientRects().length && !e.disabled && (" + cond + ");})")
    end = time.time() + timeout
    while time.time() < end:
        xy = _center(find)
        if xy:
            wait(0.4)
            xy = _center(find)
            click_at_xy(*xy)
            log(f"点击「{text}」")
            return
        wait(0.5)
    raise SystemExit(f"找不到可点的「{text}」")

def click_css(selector, timeout=10):
    """点击选择器匹配的第一个可见元素（真实鼠标点击）。"""
    find = "[...document.querySelectorAll(" + json.dumps(selector) + ")].find(e=>e.getClientRects().length && !e.disabled)"
    end = time.time() + timeout
    while time.time() < end:
        xy = _center(find)
        if xy:
            wait(0.4)
            click_at_xy(*xy)
            log(f"点击 {selector}")
            return
        wait(0.5)
    raise SystemExit(f"找不到可点的 {selector}")

def type_into(selector, text):
    """点进输入框，整段输入（等同粘贴）。"""
    xy = _center("document.querySelector(" + json.dumps(selector) + ")")
    if not xy:
        raise SystemExit("找不到输入框：" + selector)
    click_at_xy(*xy)
    wait(0.3)
    js("(()=>{const e=document.querySelector(" + json.dumps(selector) + ");e.focus();if(e.select)e.select();})()")
    cdp("Input.insertText", text=text)
    log(f"输入 {len(text)} 字到 {selector}")

def shot(path):
    capture_screenshot(path)
    log(f"截图 {os.path.basename(path)}")

# 在单独的浏览器窗口里录：和别人共用一个窗口时，对方切换标签页会让这一页转到后台，
# 后台页不出画面，鼠标事件也会卡住
if os.environ.get("REC_URL"):
    switch_tab(cdp("Target.createTarget", url="about:blank", newWindow=True)["targetId"])
    goto_url(os.environ["REC_URL"]); wait_for_load()
cdp("Page.bringToFront")
cdp("Emulation.setFocusEmulationEnabled", enabled=True)
cdp("Emulation.setDeviceMetricsOverride", width=W, height=H, deviceScaleFactor=SCALE, mobile=False)
theme = os.environ.get("REC_THEME", "")
if theme:
    cdp("Emulation.setEmulatedMedia", features=[{"name": "prefers-color-scheme", "value": theme}])
if os.environ.get("REC_DOWNLOAD_DIR"):
    cdp("Browser.setDownloadBehavior", behavior="allow", downloadPath=os.environ["REC_DOWNLOAD_DIR"])
hide = os.environ.get("REC_HIDE", "")
if hide:
    js("(()=>{const s=document.createElement('style');s.textContent=" + json.dumps(hide + "{display:none!important}") + ";document.head.appendChild(s);})()")
time.sleep(1.5)
drain_events()
failed = None
try:
    cdp("Page.startScreencast", format="jpeg", quality=85, maxWidth=int(W * SCALE), maxHeight=int(H * SCALE), everyNthFrame=1)
    wait(1)
    mark("start")
    exec(compile(open(os.environ["REC_STEPS"], encoding="utf-8").read(), os.environ["REC_STEPS"], "exec"))
    mark("end")
    wait(1.5)
except BaseException as e:  # 任何出错都要把已录的帧和日志留下来
    failed = str(e) if isinstance(e, SystemExit) else f"{type(e).__name__}: {e}"
    log("✗ " + failed)
    wait(1)
finally:
    cdp("Page.stopScreencast")
    wait(0.3)
    cdp("Emulation.clearDeviceMetricsOverride")
    cdp("Emulation.setFocusEmulationEnabled", enabled=False)
    if theme:
        cdp("Emulation.setEmulatedMedia", features=[])
open(f"{D}/page.txt", "w", encoding="utf-8").write(js("document.documentElement.innerText") or "")
json.dump({"frames": frames, "marks": marks, "logs": logs, "viewport": [W, H], "failed": failed}, open(f"{D}/meta.json", "w"), ensure_ascii=False)
print(json.dumps({"frames": len(frames), "failed": failed}, ensure_ascii=False))
