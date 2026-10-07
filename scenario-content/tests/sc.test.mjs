// sc 的纯逻辑测试：node --test tests/*.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { douyinLines } from "../scripts/sc.mjs";

test("douyinLines 读旧版分镜表：行号、口播、情感", () => {
  const md = "| # | 段落 | 口播（配音原文） | 情感 |\n|---|---|---|---|\n| 1 | 钩子 | 你有没有过这种时候？ | 惊讶 |\n| 2 | 铺垫 | 领导丢来两百条反馈。 | |\n";
  assert.deepEqual(douyinLines(md), [
    { n: "1", text: "你有没有过这种时候？", emo: "惊讶" },
    { n: "2", text: "领导丢来两百条反馈。", emo: "" },
  ]);
});

test("douyinLines 读 HyperFrames SCRIPT.md：(Frame N)、缩进口播、Emotion / 情感", () => {
  const md = "# SCRIPT\n\n- 发布文案：xx\n\n## Line 1 — 钩子 (Frame 1)\n\n**Emotion:** 惊讶\n\n    同一个问题，问了两遍。\n\n## Line 2 (Frame 2)\n\n**情感:** 平静\n\n    第二句。\n";
  assert.deepEqual(douyinLines(md), [
    { n: "1", text: "同一个问题，问了两遍。", emo: "惊讶", sentences: ["同一个问题，问了两遍。"] },
    { n: "2", text: "第二句。", emo: "平静", sentences: ["第二句。"] },
  ]);
});

test("douyinLines：一帧写好几行口播，每行一句，text 是整帧连起来", () => {
  const md = "## 钩子 (Frame 1)\n\n    会上说的是再看看。\n    AI写成了不加。\n";
  assert.deepEqual(douyinLines(md), [
    { n: "1", text: "会上说的是再看看。AI写成了不加。", emo: "", sentences: ["会上说的是再看看。", "AI写成了不加。"] },
  ]);
});

test("parseFeynman 读追问表、术语表和类比；占位和「没有」算未回答", async () => {
  const { parseFeynman } = await import("../scripts/sc.mjs");
  const md = [
    "## ② 零基础的人会追问什么", "", "| 他会问 | 母稿里的回答（大白话） |", "|---|---|",
    "| 为什么会数错？ | 它是一个字一个字往下写的 |", "| 为什么两次不一样？ | **没有** |", "| （占位问题） | （） |", "",
    "## ③ 术语 → 改成", "", "| 术语 | 改成 |", "|---|---|", "| 去重 | 同一条不算两次 |", "| （如：x） | （） |", "",
    "## ④ 类比", "", "- 类比：列编号就是要小票", "- 要传达的属性：有明细才能核对", "- 检验：（）",
  ].join("\n");
  const f = parseFeynman(md);
  assert.deepEqual(f.questions.map((q) => [q.q, !!q.answer]), [["为什么会数错？", true], ["为什么两次不一样？", false]]);
  assert.deepEqual(f.terms, ["去重"]);
  assert.equal(f.analogy, "列编号就是要小票");
  assert.equal(f.verified, "");
});
