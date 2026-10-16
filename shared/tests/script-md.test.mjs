import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { emotionIssues, parseScript } from "../node/script-md.mjs";

const fixture = (f) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");

test("读帧号、口播、情感、重点词、依据", () => {
  const md = "# SCRIPT\n\n## Line 1 — 钩子 (Frame 1)\n\n**重点词:** 八秒钟、一下午\n**Emotion:** 惊讶\n**依据:** c01, c02\n\n    AI八秒钟，干完了我一下午的活。\n\n## Line 2 (Frame 2)\n\n    第二句。\n";
  assert.deepEqual(parseScript(md), [
    { frame: 1, text: "AI八秒钟，干完了我一下午的活。", sentences: ["AI八秒钟，干完了我一下午的活。"], emotion: "惊讶", keywords: ["八秒钟", "一下午"], basis: "c01, c02" },
    { frame: 2, text: "第二句。", sentences: ["第二句。"], emotion: "", keywords: [], basis: null },
  ]);
});

test("标题：## 或 ###，(frame N) 大小写不限", () => {
  const md = "### a (frame 3)\n\n    三。\n\n## b (FRAME 4)\n\n    四。\n";
  assert.deepEqual(parseScript(md).map((l) => [l.frame, l.text]), [[3, "三。"], [4, "四。"]]);
});

test("口播行：4 个以上空格或 Tab；少于 4 个空格不算", () => {
  const md = "## a (Frame 1)\n\n    四空格。\n      六空格。\n\tTab。\n  两空格不算。\n";
  assert.deepEqual(parseScript(md)[0].sentences, ["四空格。", "六空格。", "Tab。"]);
  assert.equal(parseScript(md)[0].text, "四空格。六空格。Tab。");
});

test("元数据中英文冒号都行；Highlight、情感 是别名", () => {
  const md = "## a (Frame 1)\n**情感：** 开心\n**Highlight:** 甲,乙 丙\n**依据：** 类比\n\n    一句。\n";
  const [l] = parseScript(md);
  assert.deepEqual([l.emotion, l.keywords, l.basis], ["开心", ["甲", "乙", "丙"], "类比"]);
});

test("第一个标题之前的内容忽略；没有口播的帧不输出", () => {
  const md = "    标题前的缩进行。\n\n## a (Frame 1)\n**Emotion:** 平静\n\n## b (Frame 2)\n\n    有口播。\n";
  assert.deepEqual(parseScript(md).map((l) => l.frame), [2]);
});

test("CRLF 换行也能读", () => {
  const md = "## a (Frame 1)\r\n**Emotion:** 惊讶\r\n\r\n    一句。\r\n";
  assert.deepEqual(parseScript(md), [{ frame: 1, text: "一句。", sentences: ["一句。"], emotion: "惊讶", keywords: [], basis: null }]);
});

test("flow-check 02 的真实 SCRIPT.md：frame、text、emotion、keywords 和 vo 原来的读法逐帧一致（配音缓存键不变）", () => {
  const want = JSON.parse(fixture("flow-check-02-vo-expected.json"));
  const got = parseScript(fixture("flow-check-02-SCRIPT.md")).map(({ frame, text, emotion, keywords }) => ({ frame, text, emotion, keywords }));
  assert.deepEqual(got, want);
});

test("emotionIssues：同一帧写了好几个情感 → 列出全部，配音用最后一个", () => {
  const md = "## 钩子 (Frame 1)\n**Emotion:** 惊讶\n    第一句。\n**情感：** 开心\n    第二句。\n## 二 (Frame 2)\n**Emotion:** 平静\n    第三句。\n";
  assert.deepEqual(emotionIssues(md), [{ frame: 1, kind: "multiple", values: ["惊讶", "开心"] }]);
  assert.equal(parseScript(md)[0].emotion, "开心");
});

test("emotionIssues：**Emotion:** 不在行首（写在口播或别的文字后面）→ 不生效，报出来", () => {
  const md = "## 钩子 (Frame 3)\n    第一句。 **Emotion:** 惊讶\n说明文字 **情感：** 开心\n";
  assert.deepEqual(emotionIssues(md), [{ frame: 3, kind: "inline", values: ["惊讶", "开心"] }]);
  assert.equal(parseScript(md)[0].emotion, "");
});

test("emotionIssues：flow-check 02 真实稿没有问题", () => {
  assert.deepEqual(emotionIssues(fixture("flow-check-02-SCRIPT.md")), []);
});
