# 在 browser-harness 里运行（helpers 已预载：cdp、js、drain_events、click_at_xy、new_tab、wait_for_load）。
# 参数通过环境变量传入，由 scripts/rec.mjs 设置：
#   REC_DIR 帧输出目录；REC_PROMPT_FILE 要粘贴的文字；REC_URL 打开的网址（空 = 用当前标签页）
#   REC_W / REC_H 模拟的手机视口（CSS 像素，按 2 倍像素录制）；REC_INPUT 输入框选择器；REC_HIDE 要隐藏的元素（CSS）
#   REC_SETUP 录之前执行的 Python 文件（可选，如关掉模型开关）；REC_TIMEOUT 最长等待秒数；REC_THEME dark / light（模拟系统深浅色，空 = 不改）
import base64, json, os, time

D = os.environ["REC_DIR"]
W, H = int(os.environ.get("REC_W", "540")), int(os.environ.get("REC_H", "960"))
prompt = open(os.environ["REC_PROMPT_FILE"], encoding="utf-8").read().rstrip("\n")
frames, marks = [], {}

def pump():
    for ev in drain_events():
        if ev.get("method") == "Page.screencastFrame":
            p = ev["params"]
            open(f"{D}/f{len(frames):05d}.jpg", "wb").write(base64.b64decode(p["data"]))
            frames.append(p["metadata"]["timestamp"])
            cdp("Page.screencastFrameAck", sessionId=p["sessionId"])

def wait(sec):
    end = time.time() + sec
    while time.time() < end:
        pump(); time.sleep(0.03)

def text_len():
    return js("document.documentElement.innerText.length")

if os.environ.get("REC_URL"):
    new_tab(os.environ["REC_URL"]); wait_for_load()
cdp("Emulation.setDeviceMetricsOverride", width=W, height=H, deviceScaleFactor=2, mobile=True)
theme = os.environ.get("REC_THEME", "")
if theme:  # 网页跟随系统深浅色时，统一录成同一种（不同浏览器用户的设置可能不一样）
    cdp("Emulation.setEmulatedMedia", features=[{"name": "prefers-color-scheme", "value": theme}])
time.sleep(1.5)
setup = os.environ.get("REC_SETUP", "")
if setup:  # 录之前在页面里做的准备（如关掉模型开关），由调用方提供的 Python 文件，helpers 可用
    exec(open(setup, encoding="utf-8").read())
    time.sleep(0.5)
hide = os.environ.get("REC_HIDE", "")
if hide:
    js("(()=>{const s=document.createElement('style');s.textContent=" + json.dumps(hide + "{display:none!important}") + ";document.head.appendChild(s);})()")
sel = os.environ.get("REC_INPUT", "textarea")
box = js("(()=>{const e=document.querySelector(" + json.dumps(sel) + ");if(!e)return null;const r=e.getBoundingClientRect();return JSON.stringify([r.x+r.width/2,r.y+r.height/2]);})()")
if not box:
    raise SystemExit("找不到输入框：" + sel)
x, y = json.loads(box)
cdp("Input.dispatchMouseEvent", type="mouseMoved", x=W / 2, y=H / 4)
click_at_xy(x, y)
drain_events()
try:
    cdp("Page.startScreencast", format="jpeg", quality=88, maxWidth=W * 2, maxHeight=H * 2, everyNthFrame=1)
    wait(1.5)
    cdp("Input.insertText", text=prompt); marks["pasted"] = time.time()
    wait(1.5)
    cdp("Input.dispatchKeyEvent", type="keyDown", key="Enter", code="Enter", windowsVirtualKeyCode=13, text="\r")
    cdp("Input.dispatchKeyEvent", type="keyUp", key="Enter", code="Enter", windowsVirtualKeyCode=13)
    marks["sent"] = t_send = time.time()
    # 页面文字连续 2.5 秒不变（且发送后至少 4 秒）= 回答结束。
    # 有的 AI 发送后先「思考」几秒、文字不变，所以还要求页面文字比发送前多出「提问长度 + 50 字」，
    # 即回答已经开始出现（提问本身会先显示在对话里）
    base = text_len() or 0
    grown = lambda n: n is not None and n > base + len(prompt) + 50
    last, stable = None, time.time()
    while time.time() - t_send < float(os.environ.get("REC_TIMEOUT", "120")):
        wait(0.25)
        cur = text_len()
        if cur != last:
            last, stable = cur, time.time()
        elif time.time() - stable > 2.5 and time.time() - t_send > 4 and grown(cur):
            break
    marks["done"] = stable
    wait(1.5)
finally:
    cdp("Page.stopScreencast")
    wait(0.3)
    cdp("Emulation.clearDeviceMetricsOverride")
    if theme:
        cdp("Emulation.setEmulatedMedia", features=[])
open(f"{D}/page.txt", "w", encoding="utf-8").write(js("document.documentElement.innerText") or "")
json.dump({"frames": frames, "marks": marks, "viewport": [W, H]}, open(f"{D}/meta.json", "w"))
print(json.dumps({"frames": len(frames), "seconds": round(marks["done"] - marks["sent"], 2)}))
