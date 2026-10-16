// 识别结果对齐回原文的纯逻辑测试：node --test tests/*.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { alignToText, toChars } from "../scripts/lib/align.mjs";

test("toChars：词内时间按字数均分，标点丢掉", () => {
  assert.deepEqual(toChars([{ text: "检查，", start: 1, end: 1.4 }]).map((c) => [c.ch, c.start, c.end]), [["检", 1, 1.2], ["查", 1.2, 1.4]]);
});

test("alignToText：对上的字用识别时间，识别错的字在前后之间均分，标点挂在前一个字", () => {
  const heard = [
    { text: "没有", start: 5.2, end: 5.6 },
    { text: "挨挨枪，", start: 5.6, end: 6.2 },
    { text: "标题", start: 6.2, end: 6.6 },
  ];
  const out = alignToText(heard, "没有AI腔，标题");
  assert.deepEqual(out.map((w) => w.text), ["没", "有", "A", "I", "腔，", "标", "题"]);
  assert.deepEqual([out[2].start, out[4].end], [5.6, 6.2]);
  assert.deepEqual(out.at(-1), { text: "题", start: 6.4, end: 6.6 });
});

test("alignToText：数字读法不同（四十五 / 45）也能落在前后之间；原文没有的「嗯」被跳过", () => {
  const heard = [{ text: "嗯", start: 0, end: 0.3 }, { text: "45张", start: 1, end: 1.6 }, { text: "卡片", start: 1.6, end: 2 }];
  const out = alignToText(heard, "四十五张卡片");
  assert.equal(out[0].text, "四");
  assert.ok(out[0].start >= 0 && out[2].end <= 1.4 + 1e-9);
  assert.deepEqual(out.slice(3).map((w) => [w.text, w.start, w.end]), [["张", 1.4, 1.6], ["卡", 1.6, 1.8], ["片", 1.8, 2]]);
});
