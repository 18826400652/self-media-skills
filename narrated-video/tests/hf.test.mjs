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

test("verify.evaluate：帧数、时长、声音、尺寸逐项判断", async () => {
  const { evaluate } = await import("../scripts/verify.mjs");
  const streams = [{ codec_type: "video", codec_name: "h264", width: 1080, height: 1920, avg_frame_rate: "30/1" }, { codec_type: "audio", duration: "34.6" }];
  const good = evaluate({ streams, packets: 1038, duration: 34.6, volume: { mean: -22, max: -1.6 }, expected: { width: 1080, height: 1920, duration: 34.6 }, blackSpans: [] });
  assert.equal(good.filter((i) => i.level !== "✓").length, 0);
  const bad = evaluate({ streams: [streams[0]], packets: 900, duration: 34.6, volume: { mean: -91, max: -91 }, expected: { width: 1080, height: 1920, duration: 30 }, blackSpans: [[3, 4.2]] });
  const msgs = bad.map((i) => i.level + i.msg).join("\n");
  assert.match(msgs, /✗帧数 900/);
  assert.match(msgs, /✗时长 34.60 秒，工程是 30 秒/);
  assert.match(msgs, /✗没有声音流/);
  assert.match(msgs, /⚠有 1 段纯黑画面/);
});
