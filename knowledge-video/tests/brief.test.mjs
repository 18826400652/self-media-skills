import assert from "node:assert/strict";
import { test } from "node:test";
import { renderBrief } from "../scripts/lib/brief.mjs";

const s = { title: "论文", url: "https://arxiv.org/abs/2005.11401", type: "paper", quote: "原文一句", accessed: "2026-10-07" };
const research = {
  topic: "RAG 是什么", question: "为什么知识库答得准？",
  claims: [
    { id: "c01", text: "先检索再生成", kind: "fact", confidence: "high", sources: [s] },
    { id: "c02", text: "没被用到的事实", kind: "fact", confidence: "medium", sources: [s, s] },
  ],
  open_questions: ["准确率提升多少？"],
};
const lines = [
  { frame: 1, text: "问它却在瞎编。", basis: "观点" },
  { frame: 2, text: "它先翻资料，", basis: "c01" },
  { frame: 3, text: "再回答。", basis: "c01" },
  { frame: 4, text: "就像开卷考试。", basis: "类比" },
];

test("renderBrief：被用到的事实在前，列出处、摘录、引用它的全部口播", () => {
  const md = renderBrief(research, lines);
  assert.match(md, /^# 研究简报：RAG 是什么/);
  assert.match(md, /> 这期要回答：为什么知识库答得准？/);
  assert.match(md, /## 脚本用到的事实（1 条）[\s\S]*### c01 · 可信度 高[\s\S]*先检索再生成/);
  assert.match(md, /- \[论文\]\(https:\/\/arxiv\.org\/abs\/2005\.11401\)（论文 · 查阅 2026-10-07）\n  > 原文一句/);
  assert.match(md, /- 口播：第 2 句「它先翻资料，」；第 3 句「再回答。」/);
  assert.equal(md.match(/### c01/g).length, 1, "同一个 claim 只列一次");
  assert.ok(md.indexOf("## 没被脚本用到的事实") > md.indexOf("### c01"));
  assert.match(md, /## 没被脚本用到的事实（1 条）[\s\S]*### c02 · 可信度 中/);
  assert.match(md, /## 没查到可靠来源的问题\n\n- 准确率提升多少？/);
  assert.match(md, /## 类比和观点句（不需要来源）\n\n- 第 1 句（观点）「问它却在瞎编。」\n- 第 4 句（类比）「就像开卷考试。」/);
});

test("renderBrief：没有 open_questions 时不出这一节", () => {
  assert.doesNotMatch(renderBrief({ ...research, open_questions: [] }, lines), /没查到可靠来源/);
});
