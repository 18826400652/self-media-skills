// Seed-Audio 适配器的纯逻辑测试（不联网）：node --test tests/*.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildBody, buildPrompt, persona, toWords } from "../tts/seedaudio.mjs";

test("persona：参考音色时把「饰演者为@音频1」放进第一个括号；没有括号就补", () => {
  assert.equal(persona({ style: "女性（28岁左右，嗓音温暖），正在录口播。", reference: "a.wav" }), "女性（28岁左右，嗓音温暖，饰演者为@音频1），正在录口播");
  assert.equal(persona({ style: "像聊天一样", voice: "v" }), "说话人（饰演者为@音频1），像聊天一样");
  assert.equal(persona({ style: "像聊天一样" }), "像聊天一样");
  assert.equal(persona({}), "说话人");
});

test("buildPrompt：逐帧是「人设，说道：“台词”」；有导演稿时是人设 + 导演稿，都要求一字不改", () => {
  assert.equal(
    buildPrompt({ text: "你好。", style: "男性（30岁）", voice: "v" }),
    "男性（30岁，饰演者为@音频1），说道：“你好。”只说引号里的话，一字不改，不加背景音乐和音效。",
  );
  assert.equal(
    buildPrompt({ text: "你好。", style: "男性（30岁）", voice: "v", direction: '她轻声说："你好。"\n' }),
    '男性（30岁，饰演者为@音频1）。\n她轻声说："你好。"\n只说引号里的话，一字不改，不加背景音乐和音效。',
  );
});

test("buildBody：音色 ID 放进 references，开字幕；voice 和 reference 同时写报错", () => {
  const body = buildBody({ text: "你好", voice: "zh_male_x", speed: 1.1 });
  assert.equal(body.model, "seed-audio-1.0");
  assert.deepEqual(body.references, [{ speaker: "zh_male_x" }]);
  assert.equal(body.audio_config.enable_subtitle, true);
  assert.equal(body.audio_config.speech_rate, 10);
  assert.equal(buildBody({ text: "你好" }).references, undefined);
  assert.throws(() => buildBody({ text: "你好", voice: "v", reference: "a.wav" }), /只能写一个/);
});

test("toWords：毫秒换成秒，丢掉空字", () => {
  const subtitle = { sentences: [{ words: [{ text: "你", start_time: 100, end_time: 250 }, { text: " ", start_time: 250, end_time: 260 }, { text: "好。", start_time: 260, end_time: 500 }] }] };
  assert.deepEqual(toWords(subtitle), [{ text: "你", start: 0.1, end: 0.25 }, { text: "好。", start: 0.26, end: 0.5 }]);
  assert.deepEqual(toWords(undefined), []);
});
