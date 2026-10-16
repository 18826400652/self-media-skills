import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildCaptionGroups } from "../scripts/lib/caption-groups.mjs";

const fixture = (f) => JSON.parse(readFileSync(new URL(`./fixtures/director-02/${f}`, import.meta.url), "utf8"));
const near = (a, b) => Math.abs(a - b) <= 0.0015;
const w = (text, start, end) => ({ text, start, end });
const voice = (frame, duration_s, words) => ({ frame, duration_s, words });

test("和 faceless captions.mjs 生成的那份逐组一致（flow-check 02：63 个词 → 49 组）", () => {
  const want = fixture("caption_groups.json");
  const got = buildCaptionGroups(fixture("audio_meta.json"));
  assert.equal(got.groups.length, want.groups.length);
  assert.ok(near(got.total_duration_s, want.total_duration_s));
  assert.deepEqual([got.width, got.height], [1080, 1920]);
  got.groups.forEach((g, i) => {
    const e = want.groups[i];
    assert.equal(g.id, e.id);
    assert.equal(g.frame, e.frame, `第 ${i} 组 frame`);
    assert.equal(g.text, e.text, `第 ${i} 组 text`);
    assert.ok(near(g.start, e.start) && near(g.end, e.end), `第 ${i} 组时间 ${g.start}-${g.end} ≠ ${e.start}-${e.end}`);
    assert.equal(g.words.length, e.words.length);
    g.words.forEach((x, j) => assert.ok(x.text === e.words[j].text && near(x.start, e.words[j].start) && near(x.end, e.words[j].end)));
  });
});

test("全片时间 = 帧内时间 + 前面各帧 duration_s 之和（duration_s 含段间停顿时也对得上）", () => {
  const meta = { voices: [voice(1, 2.5, [w("第一句.", 0.1, 1.0)]), voice(2, 1.5, [w("第二句.", 0.2, 1.1)])] }; // 第 1 帧说完 1.0 秒，含停顿共 2.5 秒
  const g = buildCaptionGroups(meta).groups;
  assert.deepEqual(g.map((x) => [x.frame, x.start]), [[1, 0.1], [2, 2.7]]);
  assert.equal(buildCaptionGroups(meta).total_duration_s, 4);
});

test("voices 顺序乱了也按帧号算开始时间", () => {
  const meta = { voices: [voice(2, 1, [w("二.", 0, 0.5)]), voice(1, 3, [w("一.", 0, 0.5)])] };
  assert.deepEqual(buildCaptionGroups(meta).groups.map((x) => [x.frame, x.start]), [[1, 0], [2, 3]]);
});

test("换帧一定开新组；句末标点收组", () => {
  const meta = { voices: [voice(1, 1, [w("甲", 0, 0.2), w("乙.", 0.2, 0.4), w("丙", 0.4, 0.6)]), voice(2, 1, [w("丁", 0, 0.2)])] };
  assert.deepEqual(buildCaptionGroups(meta).groups.map((x) => x.text), ["甲 乙.", "丙", "丁"]);
});

test("和上一个词之间静音超过 0.18 秒开新组", () => {
  const meta = { voices: [voice(1, 2, [w("甲", 0, 0.2), w("乙", 0.39, 0.5), w("丙", 0.5, 0.6)])] };
  assert.deepEqual(buildCaptionGroups(meta).groups.map((x) => x.text), ["甲", "乙 丙"]);
});

test("字数上限按往后 1 秒的词数：> 3.5 个/秒最多 2 个词", () => {
  const fast = [0, 0.1, 0.2, 0.3, 0.4, 0.5].map((t, i) => w(`词${i}`, t, t + 0.1));
  assert.deepEqual(buildCaptionGroups({ voices: [voice(1, 1, fast)] }).groups.map((x) => x.words.length), [2, 2, 2]);
});

test("结束时间 = 最后一个词 + 0.12 秒，但不超过下一组开始", () => {
  const meta = { voices: [voice(1, 3, [w("甲.", 0, 0.5), w("乙.", 0.55, 1.0), w("丙.", 2.0, 2.5)])] };
  assert.deepEqual(buildCaptionGroups(meta).groups.map((x) => x.end), [0.55, 1.12, 2.62]);
});

test("去掉空词和只有标点的词；重点词的 * 保留在 text 里", () => {
  const meta = { voices: [voice(1, 2, [w(" ", 0, 0.1), w(",", 0.1, 0.2), w("*十秒", 0.2, 0.6), w("改完.", 0.6, 1.0)])] };
  assert.deepEqual(buildCaptionGroups(meta).groups.map((x) => x.text), ["*十秒 改完."]);
});

test("字数上限：往后 1 秒 3 个词（> 2.5 个/秒）最多 3 个词", () => {
  const starts = [0, 0.35, 0.7, 1.05, 1.4, 1.75, 2.1];
  const words = starts.map((t, i) => w(`词${i}`, t, t + 0.3));
  assert.deepEqual(buildCaptionGroups({ voices: [voice(1, 3, words)] }).groups.map((x) => x.words.length), [3, 3, 1]);
});

test("字数上限：往后 1 秒 2 个词（≤ 2.5 个/秒）最多 4 个词", () => {
  const starts = [0, 0.5, 1, 1.5, 2, 2.5];
  const words = starts.map((t, i) => w(`词${i}`, t, t + 0.4));
  assert.deepEqual(buildCaptionGroups({ voices: [voice(1, 3, words)] }).groups.map((x) => x.words.length), [4, 2]);
});
