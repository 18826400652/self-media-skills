// sc rec 浏览器模式：录前准备（关 DeepSeek 开关）怎么选、回答结束怎么判断
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";
import { DEEPSEEK_OFF, browserSetup } from "../scripts/lib/rec-browser.mjs";
import { SKILL_DIR } from "../scripts/lib/rec-config.mjs";

test("browserSetup：DeepSeek 网页默认关深度思考、智能搜索（和手机 --app 一样）", () => {
  assert.equal(browserSetup({ url: "https://chat.deepseek.com/" }), DEEPSEEK_OFF);
  assert.match(DEEPSEEK_OFF, /rec\/setup\/deepseek-off\.py$/);
});

test("browserSetup：别的网站不做准备；--setup 指定的优先", () => {
  assert.equal(browserSetup({ url: "https://www.doubao.com/chat/" }), "");
  assert.equal(browserSetup({ url: "https://chat.deepseek.com/", setup: "/x/my.py" }), "/x/my.py");
  assert.equal(browserSetup({ url: "https://chat.deepseek.com/", setup: "none" }), "");
});

test("browserSetup：浏览器模式要开 --think / --search → 说清楚做不到，不悄悄忽略", () => {
  assert.throws(() => browserSetup({ url: "https://chat.deepseek.com/", think: true }), /浏览器模式.*--think.*手机 --app/);
  assert.throws(() => browserSetup({ url: "https://chat.deepseek.com/", search: true }), /--search/);
});

// 回答结束的判断（scripts/rec/answer_watch.py，纯逻辑）：喂 [秒, 页面文字长度] 序列，看在哪一秒判定结束
function doneAt(before, trace) {
  const code = `
import json, sys
exec(open(sys.argv[1], encoding="utf-8").read())
w = AnswerWatch(before=${before}, t_send=0)
for t, n in json.loads(sys.argv[2]):
    if w.feed(t, n):
        print(t); break
else:
    print("none")
`;
  const r = spawnSync("python3", ["-c", code, join(SKILL_DIR, "scripts/rec/answer_watch.py"), JSON.stringify(trace)], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
const steps = (from, to, f) => Array.from({ length: Math.round((to - from) / 0.25) + 1 }, (_, i) => [from + i * 0.25, f(from + i * 0.25)]);

test("AnswerWatch：长提问在对话里被折叠、回答比提问短，也能在答完 2.5 秒后判定结束", () => {
  // 发送前 1000 字；1 秒时提问气泡出现（折叠后只多 200 字）；3–6 秒回答流出 150 字；之后不变
  const trace = steps(0, 30, (t) => (t < 1 ? 1000 : t < 3 ? 1200 : t < 6 ? 1200 + Math.floor((t - 3) * 50) : 1350));
  const at = Number(doneAt(1000, trace));
  assert.ok(at >= 8.5 && at <= 9.5, `判定在 ${at} 秒`);
});

test("AnswerWatch：发送后先思考几秒（只有提问气泡、文字不动），不会提前判定结束", () => {
  const trace = steps(0, 30, (t) => (t < 1 ? 1000 : t < 8 ? 1200 : t < 12 ? 1200 + Math.floor((t - 8) * 40) : 1360));
  const at = Number(doneAt(1000, trace));
  assert.ok(at >= 14.5 && at <= 15.5, `判定在 ${at} 秒`);
});

test("AnswerWatch：页面一直没动静 → 不判定结束（等到超时）", () => {
  assert.equal(doneAt(1000, steps(0, 30, () => 1000)), "none");
});
