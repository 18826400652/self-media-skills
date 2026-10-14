// 千问音频生成适配器的纯逻辑测试（不联网）：node --test tests/*.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildBody, buildPrompt, spokenText } from "../tts/qwenaudio.mjs";

test("buildPrompt：参考音频用 @voice1 引用，导演稿和逐帧两种写法", () => {
  assert.equal(
    buildPrompt({ text: "你好。", style: "男性（30岁）", reference: "a.wav" }),
    "男性（30岁，饰演者为@voice1），说道：“你好。”只说引号里的话，一字不改，不加背景音乐和音效。",
  );
  assert.match(buildPrompt({ style: "男性（30岁）", reference: "a.wav", direction: '说道："你好。"' }), /^男性（30岁，饰演者为@voice1）。\n说道："你好。"\n只说引号里的话/);
});

test("buildBody：单声道 24k、语速用 rate、填了 seed 才带；不支持音色 ID", () => {
  const body = buildBody({ text: "你好", speed: 1.1 });
  assert.equal(body.model, "qwen-audio-3.1-tts-next");
  assert.deepEqual([body.input.channels, body.input.sample_rate, body.input.rate, body.input.seed], [1, 24000, 1.1, undefined]);
  assert.equal(buildBody({ text: "你好", seed: 7 }).input.seed, 7);
  assert.throws(() => buildBody({ text: "你好", voice: "v" }), /不支持音色 ID/);
});

test("spokenText：导演稿取引号里的台词，逐帧取 text", () => {
  assert.equal(spokenText({ direction: '真诚地说道："看完…呃，不想发。"边想边说。' }), "看完…呃，不想发。");
  assert.equal(spokenText({ text: "你好" }), "你好");
});
