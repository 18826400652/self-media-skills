// 导演稿 VOICE.md 的纯逻辑测试：node --test tests/*.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { adoptPunctuation, checkDirection, dropExtras, frameCuts, parseVoiceDirection, quotedText, splitWordsByFrame, spokenPrompt } from "../scripts/lib/voice-direction.mjs";

const MD = `# VOICE

## 开场 (Frame 1-2)

\`\`\`text
她带着点不甘心说道："AI帮我做了五条视频。"然后放轻说：“可我一条都不想发。”
接着真诚地问："你也有过吗？"
\`\`\`

## 收尾 (Frame 3)

\`\`\`text
她轻快地说："就聊到这。"
\`\`\`
`;
const LINES = [
  { frame: 1, text: "AI帮我做了五条视频。可我一条都不想发。" },
  { frame: 2, text: "你也有过吗？" },
  { frame: 3, text: "就聊到这。" },
];

test("parseVoiceDirection：按 (Frame a-b) 分段，提示词取代码块", () => {
  const segs = parseVoiceDirection(MD);
  assert.deepEqual(segs.map((s) => [s.name, s.frames]), [["开场", [1, 2]], ["收尾", [3]]]);
  assert.match(segs[0].prompt, /^她带着点不甘心/);
  assert.match(segs[0].prompt, /你也有过吗？"$/);
});

test("quotedText：英文和中文引号里的台词按顺序连起来", () => {
  assert.equal(quotedText('说："甲。"又说：“乙。”'), "甲。乙。");
});

test("checkDirection：对得上没问题；改字、漏帧、重复都报出来", () => {
  assert.deepEqual(checkDirection(parseVoiceDirection(MD), LINES), []);
  const bad = parseVoiceDirection(MD.replace("五条视频", "5条视频").replace("(Frame 3)", "(Frame 2)"));
  const problems = checkDirection(bad, LINES);
  assert.ok(problems.some((p) => p.includes("引号里的台词和口播原文不一致") && p.includes("从第 7 个字开始不同")));
  assert.ok(problems.some((p) => p.includes("第 2 帧同时在")));
  assert.ok(problems.some((p) => p.includes("第 3 帧没有写进任何一段")));
});

test("splitWordsByFrame：按原文字数分帧，英文词按字母数算，标点跟前一帧；字数对不上报错", () => {
  const words = [
    { text: "好", start: 0, end: 0.2 },
    { text: "AI", start: 0.2, end: 0.5 },
    { text: "。", start: 0.5, end: 0.5 },
    { text: "再", start: 0.9, end: 1.1 },
    { text: "见！", start: 1.1, end: 1.3 },
  ];
  const groups = splitWordsByFrame(words, ["好AI。", "再见！"]);
  assert.deepEqual(groups.map((g) => g.map((w) => w.text)), [["好", "AI", "。"], ["再", "见！"]]);
  assert.throws(() => splitWordsByFrame(words, ["好A。", "I再见！"]), /跨过了第 1 帧/);
  assert.throws(() => splitWordsByFrame(words, ["好AI。", "再见啊！"]), /第 2 帧的时间戳字数/);
});

test("frameCuts：帧之间切在停顿中间，首尾留余量", () => {
  const groups = [[{ text: "好", start: 0.3, end: 0.5 }, { text: "。", start: 0.5, end: 0.5 }], [{ text: "再", start: 0.9, end: 1.2 }]];
  const cuts = frameCuts(groups, 2, { head: 0.04, tail: 0.08 });
  assert.deepEqual(cuts.map((c) => [c.start.toFixed(2), c.end.toFixed(2)]), [["0.26", "0.70"], ["0.70", "1.28"]]);
});

test("花括号语气词：核对时忽略，发给模型时去掉花括号，没配对报错", () => {
  const prompt = '语气真诚，说道："可我自己看完…{呃，}一条都不想发。自己却…{却…}刷不下去。"边想边说。';
  assert.equal(quotedText(prompt), "可我自己看完…一条都不想发。自己却…刷不下去。");
  assert.equal(spokenPrompt(prompt), '语气真诚，说道："可我自己看完…呃，一条都不想发。自己却…却…刷不下去。"边想边说。');
  const lines = [{ frame: 1, text: "可我自己看完，一条都不想发。" }, { frame: 2, text: "自己却刷不下去。" }];
  assert.deepEqual(checkDirection([{ name: "段", frames: [1, 2], prompt }], lines), []);
  const broken = checkDirection([{ name: "段", frames: [1, 2], prompt: prompt.replace("{却…}", "{却…") }], lines);
  assert.ok(broken.some((p) => p.includes("没有配对")));
});

test("dropExtras：按导演稿去掉标出的语气词和重复，模型多加的「嗯」也去掉；改了字报错", () => {
  const prompt = '说道："看完…{呃，}不想发。却…{却…}刷。"';
  const w = (text, start) => ({ text, start, end: start + 0.1 });
  const words = [w("看", 0), w("完", 0.1), w("…", 0.2), w("呃", 0.5), w("，", 0.6), w("不", 0.7), w("想", 0.8), w("发", 0.9), w("。", 1), w("嗯", 1.1), w("却", 1.2), w("…", 1.3), w("却", 1.5), w("…", 1.6), w("刷", 1.7), w("。", 1.8)];
  const kept = dropExtras(words, prompt).filter((x) => /\p{L}/u.test(x.text));
  assert.deepEqual(kept.map((x) => [x.text, x.start]), [["看", 0], ["完", 0.1], ["不", 0.7], ["想", 0.8], ["发", 0.9], ["却", 1.2], ["刷", 1.7]]);
  assert.throws(() => dropExtras([w("看", 0), w("见", 0.1)], prompt), /对不上/);
});

test("adoptPunctuation：字幕用原文的标点，停顿用的「…」不进字幕", () => {
  const words = [
    { text: "看", start: 0, end: 0.1 }, { text: "完…", start: 0.1, end: 0.2 },
    { text: "DeepSeek", start: 0.3, end: 0.8 }, { text: "发", start: 0.9, end: 1 }, { text: "。", start: 1, end: 1 },
  ];
  assert.deepEqual(adoptPunctuation(words, "看完，DeepSeek发。").map((x) => x.text), ["看", "完，", "DeepSeek", "发。"]);
});
