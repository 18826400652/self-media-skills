// 读音表的纯逻辑测试：node --test tests/*.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { applyPronounce, restoreSpans } from "../scripts/lib/pronounce.mjs";

const AI = '<say-as interpret-as="characters">AI</say-as>';

test("applyPronounce：命中的词换成 SSML 片段，整句包进 <speak>，记下原文位置", () => {
  const r = applyPronounce("AI帮我做了五条视频。", { AI });
  assert.equal(r.ttsText, `<speak>${AI}帮我做了五条视频。</speak>`);
  assert.deepEqual(r.spans, [{ start: 0, end: 2 }]);
});

test("applyPronounce：英文单词内部不替换（OpenAI、AIGC）；没命中原样返回", () => {
  assert.deepEqual(applyPronounce("OpenAI 和 AIGC", { AI }), { ttsText: "OpenAI 和 AIGC", spans: [] });
  assert.deepEqual(applyPronounce("随便一句", {}), { ttsText: "随便一句", spans: [] });
});

test("applyPronounce：其余文字转义 SSML 特殊字符，多处命中都换", () => {
  const r = applyPronounce("A&B，AI和AI", { AI });
  assert.equal(r.ttsText, `<speak>A&amp;B，${AI}和${AI}</speak>`);
  assert.deepEqual(r.spans, [{ start: 4, end: 6 }, { start: 7, end: 9 }]);
});

test("restoreSpans：逐字母读的 A / ,I / , 合并回原文的 AI（CosyVoice 实测返回）", () => {
  const words = [
    { text: "A", start: 0.29, end: 0.436 },
    { text: ",I", start: 0.472, end: 0.69 },
    { text: ",", start: 0.69, end: 0.8 },
    { text: "帮", start: 0.8, end: 0.945 },
    { text: "我", start: 0.981, end: 1.054 },
  ];
  assert.deepEqual(restoreSpans(words, "AI帮我", [{ start: 0, end: 2 }]), [
    { text: "AI", start: 0.29, end: 0.8 },
    { text: "帮", start: 0.8, end: 0.945 },
    { text: "我", start: 0.981, end: 1.054 },
  ]);
});

test("restoreSpans：替换成中文读法（诶爱）也合并回 AI；句中、原文自带标点都对得上", () => {
  const words = [
    { text: "用", start: 0, end: 0.1 },
    { text: "诶", start: 0.1, end: 0.2 },
    { text: "爱", start: 0.2, end: 0.3 },
    { text: "，", start: 0.3, end: 0.35 },
    { text: "好", start: 0.35, end: 0.5 },
  ];
  assert.deepEqual(restoreSpans(words, "用AI，好", [{ start: 1, end: 3 }]), [
    { text: "用", start: 0, end: 0.1 },
    { text: "AI", start: 0.1, end: 0.3 },
    { text: "，", start: 0.3, end: 0.35 },
    { text: "好", start: 0.35, end: 0.5 },
  ]);
});

test("restoreSpans：对不上（后面的字一直找不到）就原样返回，不弄乱时间", () => {
  const words = [{ text: "A", start: 0, end: 0.1 }, { text: "I", start: 0.1, end: 0.2 }, { text: "x", start: 0.2, end: 0.3 }];
  assert.deepEqual(restoreSpans(words, "AI帮我", [{ start: 0, end: 2 }]), words);
  assert.deepEqual(restoreSpans(words, "AIx", []), words);
});

test("restoreSpans：前一个字和 A 并在一起（「给A」，实测第 3 帧）也能从边界拆开", () => {
  const w = (text, start) => ({ text, start, end: start + 0.1 });
  const words = [w("交", 0), w("给A", 0.1), w(",I", 0.2), w(",", 0.3), w("。", 0.4), w("写", 0.5)];
  assert.deepEqual(restoreSpans(words, "交给AI。写", [{ start: 2, end: 4 }]), [
    w("交", 0), w("给", 0.1), { text: "AI", start: 0.1, end: 0.4 }, w("。", 0.4), w("写", 0.5),
  ]);
});

test("restoreSpans：I 和后一个字并在一起（「I帮」）也从结尾拆开", () => {
  const w = (text, start) => ({ text, start, end: start + 0.1 });
  const words = [w("A", 0), w("I帮", 0.1), w("我", 0.2)];
  assert.deepEqual(restoreSpans(words, "AI帮我", [{ start: 0, end: 2 }]), [
    { text: "AI", start: 0, end: 0.2 }, w("帮", 0.1), w("我", 0.2),
  ]);
});
