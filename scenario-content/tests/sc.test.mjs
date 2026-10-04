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
    { n: "1", text: "同一个问题，问了两遍。", emo: "惊讶" },
    { n: "2", text: "第二句。", emo: "平静" },
  ]);
});
