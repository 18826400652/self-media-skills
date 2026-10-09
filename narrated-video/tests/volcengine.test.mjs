// 火山 TTS 适配器的纯逻辑测试（不联网）：node --test tests/*.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzePcm, buildBody, collect, fixWords, speechRate, splitJsonObjects } from "../tts/volcengine.mjs";

const empty = { audio: [], words: [], done: false, error: null };

test("speechRate：倍速换成 -50 ~ 100，超出范围截断", () => {
  assert.equal(speechRate(1), 0);
  assert.equal(speechRate(1.1), 10);
  assert.equal(speechRate(0.3), -50);
  assert.equal(speechRate(3), 100);
});

test("buildBody：2.0 开字幕，1.0 开时间戳；语音指令放进 additions", () => {
  const v2 = buildBody({ text: "你好", voice: "v", speed: 1, instruction: "说慢一点" });
  assert.equal(v2.req_params.audio_params.enable_subtitle, true);
  assert.deepEqual(JSON.parse(v2.req_params.additions), { context_texts: ["说慢一点"] });
  const v1 = buildBody({ text: "你好", voice: "v", speed: 1, model: "seed-tts-1.0" });
  assert.equal(v1.req_params.audio_params.enable_timestamp, true);
  assert.equal(v1.req_params.additions, undefined);
});

test("splitJsonObjects：连在一起或被截断的 JSON 都能切开，字符串里的括号不算", () => {
  const { objects, rest } = splitJsonObjects('{"a":"}{"}\n{"b":1}{"c":');
  assert.deepEqual(objects, [{ a: "}{" }, { b: 1 }]);
  assert.equal(rest, '{"c":');
});

test("collect：累加音频和逐字时间，收到 20000000 算结束，其他错误码报错", () => {
  let s = collect({ code: 0, data: Buffer.from("ab").toString("base64") }, empty);
  s = collect({ code: 0, data: null, sentence: { text: "其他人。", words: [{ word: "其", startTime: 0.2, endTime: 0.3 }, { word: "人。", startTime: 0.5, endTime: 0.8 }] } }, s);
  s = collect({ code: 20000000, message: "ok", data: null }, s);
  assert.equal(Buffer.concat(s.audio).toString(), "ab");
  assert.deepEqual(s.words, [{ text: "其", start: 0.2, end: 0.3 }, { text: "人。", start: 0.5, end: 0.8 }]);
  assert.equal(s.done, true);
  assert.match(collect({ code: 45000000, message: "bad speaker" }, empty).error, /45000000 bad speaker/);
});

test("analyzePcm：找出声音结束时间和句中停顿", () => {
  const rate = 1000; // 每帧 20 个采样
  const loud = (sec) => new Array(Math.round(sec * rate)).fill(8000);
  const quiet = (sec) => new Array(Math.round(sec * rate)).fill(0);
  const pcm = Buffer.from(new Int16Array([...quiet(0.1), ...loud(0.4), ...quiet(0.2), ...loud(0.3), ...quiet(0.3)]).buffer);
  const r = analyzePcm(pcm, rate);
  assert.equal(r.speechEnd.toFixed(2), "1.00");
  assert.deepEqual(r.gaps.map((g) => g.map((t) => t.toFixed(2))), [["0.50", "0.70"]]);
});

test("fixWords：英文短点往前接；最后一次停顿后的字拉伸到声音结束", () => {
  const words = [
    { text: "用", start: 0.3, end: 0.4 },
    { text: "DeepSeek", start: 0.88, end: 0.91 },
    { text: "写", start: 0.91, end: 1.0 },
    { text: "就", start: 1.2, end: 1.3 },
    { text: "完了。", start: 1.3, end: 1.4 },
  ];
  const fixed = fixWords(words, { speechEnd: 1.6, gaps: [[1.05, 1.2]] });
  assert.deepEqual(fixed[1], { text: "DeepSeek", start: 0.4, end: 0.91 });
  assert.deepEqual(fixed.slice(3), [{ text: "就", start: 1.2, end: 1.4 }, { text: "完了。", start: 1.4, end: 1.6 }]);
  assert.deepEqual(fixWords(words, { speechEnd: 1.42, gaps: [] }).at(-1), words.at(-1));
});

test("fixWords：停顿后只剩零长度的标点时，从最后一个字开始拉伸", () => {
  const words = [
    { text: "2", start: 7.2, end: 7.52 },
    { text: "个", start: 7.52, end: 7.56 },
    { text: "？", start: 7.56, end: 7.56 },
  ];
  const fixed = fixWords(words, { speechEnd: 7.8, gaps: [[7.38, 7.58]] });
  assert.deepEqual(fixed.slice(1), [{ text: "个", start: 7.52, end: 7.8 }, { text: "？", start: 7.8, end: 7.8 }]);
});
