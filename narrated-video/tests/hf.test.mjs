// HyperFrames 配音与成片检查相关的纯逻辑测试：node --test tests/*.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseHfScript, restoreCase, toCaptionWords } from "../scripts/hf-audio.mjs";

const chars = (s, t0 = 0, step = 0.1) => [...s].map((ch, i) => ({ text: ch, start: t0 + i * step, end: t0 + (i + 1) * step }));

test("parseHfScript 读出帧号、口播、情感和重点词", () => {
  const md = `## Line 1 — 钩子 (Frame 1)\n\n**重点词:** 八秒钟、一下午\n**Emotion:** 惊讶\n\n    AI八秒钟，干完了我一下午的活。\n\n## Line 2 (Frame 2)\n\n    第二句。\n`;
  const lines = parseHfScript(md);
  assert.equal(lines.length, 2);
  assert.deepEqual([lines[0].frame, lines[0].text, lines[0].emotion], [1, "AI八秒钟，干完了我一下午的活。", "惊讶"]);
  assert.deepEqual(lines[0].keywords, ["八秒钟", "一下午"]);
  assert.equal(lines[1].emotion, "");
});

test("toCaptionWords 按分句切开、重点词单独成段并加 *、中文标点换成英文", () => {
  const words = chars("说好不重复，结果数错了！");
  const out = toCaptionWords(words, ["数错了"]);
  assert.deepEqual(out.map((w) => w.text), ["说好不重复,", "结果", "*数错了!"]);
  assert.equal(out[2].start, words[8].start);
});

test("restoreCase 把 TTS 小写的英文恢复成口播原文写法", () => {
  const words = [{ text: "我", start: 0 }, { text: "让deepseek", start: 0.1 }, { text: "整", start: 0.5 }];
  assert.deepEqual(restoreCase(words, "我让DeepSeek整理").map((w) => w.text), ["我", "让DeepSeek", "整"]);
});

test("toCaptionWords：TTS 把标点和后面的字并成一个时间戳，也要在标点处断句", () => {
  const words = [{ text: "为", start: 0, end: 0.2 }, { text: "啥", start: 0.2, end: 0.4 }, { text: "？AI", start: 0.4, end: 0.8 }, { text: "不", start: 0.8, end: 1 }, { text: "是", start: 1, end: 1.2 }];
  assert.deepEqual(toCaptionWords(words, []).map((w) => w.text), ["为啥?", "AI不是"]);
  assert.deepEqual(toCaptionWords([{ text: "「A/B」", start: 0, end: 1 }], []).map((w) => w.text), ["「A/B」"]);
});
