// 导演稿 VOICE.md 的纯逻辑测试：node --test tests/*.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkDirection, frameCuts, parseVoiceDirection, quotedText, splitWordsByFrame } from "../scripts/lib/voice-direction.mjs";

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
