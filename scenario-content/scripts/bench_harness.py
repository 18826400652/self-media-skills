# sc bench 在 browser-harness 里执行的部分：逐个关键词打开搜索页，每个关键词输出一行 JSON。
# 输入用环境变量：BENCH_KWS、BENCH_PLATFORMS（JSON 数组）。抖音输出页面全文，由 sc.mjs 解析。
import json, os, time, urllib.parse

KWS = json.loads(os.environ["BENCH_KWS"])
PLATFORMS = json.loads(os.environ["BENCH_PLATFORMS"])
XHS_ITEM = """(function(){var c=window.__INITIAL_STATE__.search.feeds._value[%d].noteCard;if(!c)return '';
var t=c.interactInfo||{};return JSON.stringify([c.displayTitle,c.user&&c.user.nickName,t.likedCount,t.collectedCount])})()"""

def url(platform, kw):
    q = urllib.parse.quote(kw)
    if platform == "抖音":
        return "https://www.douyin.com/search/" + q + "?type=video"
    return "https://www.xiaohongshu.com/search_result?keyword=" + q + "&type=51"

def scroll():
    for _ in range(3):
        js("window.scrollBy(0,2500)")
        time.sleep(3)

first = True
for platform in PLATFORMS:
    for kw in KWS:
        if first:
            new_tab(url(platform, kw))
            first = False
        else:
            goto_url(url(platform, kw))
        wait_for_load()
        time.sleep(7)
        scroll()
        row = {"platform": platform, "keyword": kw}
        if platform == "抖音":
            row["text"] = js("document.body.innerText") or ""
        else:
            n = js("(window.__INITIAL_STATE__&&window.__INITIAL_STATE__.search.feeds._value||[]).length") or 0
            if n == 0 and "登录" in (js("document.body.innerText.slice(0,200)") or ""):
                raise SystemExit("小红书要登录后才有搜索结果：请在这个浏览器里登录小红书")
            row["items"] = [json.loads(s) for s in (js(XHS_ITEM % i) for i in range(min(n, 60))) if s]
        print(json.dumps(row, ensure_ascii=False), flush=True)
        time.sleep(4)
