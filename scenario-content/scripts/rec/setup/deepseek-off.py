# sc rec 的录前准备（REC_SETUP）：关掉 DeepSeek 网页版的「深度思考」「智能搜索」，关不掉就报错停止。
# 用法：REC_SETUP=<本文件> sc rec <输出.mp4> --prompt <提问> --url https://chat.deepseek.com/
# 用 JS 点击（不用鼠标事件）：窗口在后台时鼠标事件可能卡住。按钮「开」时文字是蓝色；「关」时是白色或黑色（随深浅色），所以按「是不是蓝色」判断。
import json, time

_JS_STATE = """(()=>{const b=[...document.querySelectorAll('div[role=button],button,span')]
  .filter(e=>/^(深度思考|智能搜索)$/.test(e.innerText.trim()));const r={};
  b.forEach(e=>{const n=e.innerText.trim();if(n in r)return;const t=e.closest('[role=button]')||e;
  const c=getComputedStyle(t).color.match(/\\d+/g).map(Number);
  r[n]={on:c[2]-c[0]>80,idx:b.indexOf(e)}});return JSON.stringify(r)})()"""
_JS_CLICK = """(n=>{const e=[...document.querySelectorAll('div[role=button],button,span')]
  .find(e=>e.innerText.trim()===n);(e.closest('[role=button]')||e).click()})(%s)"""

for _ in range(2):
    state = json.loads(js(_JS_STATE))
    for name, s in state.items():
        if s["on"]:
            js(_JS_CLICK % json.dumps(name))
            time.sleep(0.6)
state = json.loads(js(_JS_STATE))
if len(state) < 2 or any(s["on"] for s in state.values()):
    raise SystemExit(f"DeepSeek 开关没关掉：{state}")
print("DeepSeek 深度思考、智能搜索：关")
