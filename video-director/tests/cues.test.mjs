import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildCues, charStream, lineTimes, resolveCue, segmentTimes } from "../scripts/lib/cues.mjs";

const META = JSON.parse(readFileSync(new URL("./fixtures/rag-audio_meta.json", import.meta.url)));
const near = (a, b, eps = 0.05) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

test("lineTimes：句与句首尾相接，总长 61.6 秒", () => {
  const L = lineTimes(META);
  assert.equal(L.length, 17);
  near(L[1].start, 3.32);
  near(L[3].start, 11.18);
  near(L[16].end, 61.61);
});

test("resolveCue：真实配音里的关键词时间（RAG 第 1–4 句）", () => {
  const s = charStream(META);
  near(resolveCue(s, "编一套").start, 2.82);
  near(resolveCue(s, "根本没这条").start, 6.07);
  near(resolveCue(s, "不在里面").start, 10.44);
  near(resolveCue(s, "先去翻资料").start, 13.55);
});

test("规范化匹配：空格、标点、大小写、多字切片（问A + I）都不影响", () => {
  const s = charStream(META);
  near(resolveCue(s, "RAG 说白了").start, 11.22);
  near(resolveCue(s, "rag说白了").start, 11.22);
  near(resolveCue(s, "问AI").start, 0.04);
});

test("#序号：同一个词第 2 次出现", () => {
  const s = charStream(META);
  const first = resolveCue(s, "资料", 1).start;
  const second = resolveCue(s, "资料", 2).start;
  assert.ok(second > first);
});

test("跨 Line：词的前半在上一句末尾、后半在下一句开头也能找到", () => {
  const s = charStream(META);
  near(resolveCue(s, "编一套听着").start, 2.82);
});

test("resolveCue 词不存在：报错并给出最接近的 3 个候选", () => {
  const s = charStream(META);
  assert.throws(() => resolveCue(s, "编一条"), (err) => /口播里找不到「编一条」/.test(err.message) && /最接近的：.*编一套/.test(err.message));
  assert.throws(() => resolveCue(s, "资料", 99), /「资料」只出现了 \d+ 次，没有第 99 次/);
});

test("segmentTimes + buildCues：段时间来自句时间；cues 键名带序号", () => {
  const segs = segmentTimes([{ id: "a", lines: [1, 2] }, { id: "b", lines: [3, 17] }], lineTimes(META));
  near(segs[0].duration, 7.13);
  near(segs[1].start, 7.13);
  const parsed = { vd: { segments: [{ id: "a", lines: [1, 17] }] }, tokens: [{ text: "编一套", nth: 1 }, { text: "资料", nth: 2 }] };
  const b = buildCues(parsed, META);
  near(b.cues["编一套"], 2.82);
  assert.ok(b.cues["资料#2"] > 0);
  near(b.total, 61.61);
});

test("buildCues：没写 #序号 但口播里出现多次的词给出警告（列出出现在第几句）", () => {
  const parsed = { vd: { segments: [{ id: "a", lines: [1, 17] }] }, tokens: [{ text: "资料", nth: 1 }, { text: "编一套", nth: 1 }, { text: "资料", nth: 2 }] };
  const b = buildCues(parsed, META);
  assert.equal(b.warnings.length, 1);
  assert.match(b.warnings[0], /@资料 在口播里出现了 \d+ 次（第 [\d、]+ 句），现在用的是第 1 次；要别的写 @资料#2/);
});

test("segmentTimes：组件段落带上 component 和 vars", () => {
  const [s] = segmentTimes([{ id: "a", lines: [1, 2], component: "dy-scene-steps", vars: { title: "x" } }], lineTimes(META));
  assert.equal(s.component, "dy-scene-steps");
  assert.deepEqual(s.vars, { title: "x" });
});

test("buildCues：组件段 vars.cues 里的 @词 换成「从这段开头算」的秒数，数字原样保留（P-36b）", () => {
  const parsed = {
    vd: { segments: [{ id: "a", lines: [1, 2] }, { id: "b", lines: [3, 17], component: "dy-checklist", vars: { items: "x|y|z", cues: "@不在里面| 3 |@先去翻资料" } }] },
    tokens: [{ text: "不在里面", nth: 1 }, { text: "先去翻资料", nth: 1 }],
  };
  const b = buildCues(parsed, META);
  const seg = b.segments[1];
  const [c0, c1, c2] = seg.vars.cues.split("|").map(Number);
  near(c0, 10.44 - seg.start);
  assert.equal(c1, 3);
  near(c2, 13.55 - seg.start);
  assert.equal(seg.vars.items, "x|y|z");
  assert.equal(parsed.vd.segments[1].vars.cues, "@不在里面| 3 |@先去翻资料", "不改原来的 DIRECTOR 数据");
});

test("buildCues：vars.cues 的 @词 不在这一段里时报错，说清是哪一段第几拍", () => {
  const parsed = {
    vd: { segments: [{ id: "a", lines: [1, 2], component: "dy-checklist", vars: { cues: "@编一套|@先去翻资料" } }, { id: "b", lines: [3, 17] }] },
    tokens: [{ text: "编一套", nth: 1 }, { text: "先去翻资料", nth: 1 }],
  };
  assert.throws(() => buildCues(parsed, META), /段 a 的 cues 第 2 拍「@先去翻资料」在 [\d.]+ 秒，不在这一段（[\d.]+–[\d.]+ 秒）里/);
});

test("buildCues：vars.cues 是 JSON 列表（dy-rec-phone 自己的点击、框选格式）时原样保留，不当成 | 分隔的节拍", () => {
  const own = '[{"type":"box","t":1.5,"x":50,"y":80,"label":"标题 | 正文"}]';
  const parsed = { vd: { segments: [{ id: "a", lines: [1, 17], component: "dy-rec-phone", vars: { cues: own } }] }, tokens: [] };
  assert.equal(buildCues(parsed, META).segments[0].vars.cues, own);
});
