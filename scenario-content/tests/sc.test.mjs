// sc 的纯逻辑测试：node --test tests/*.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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

test("parseGate：字段未填、对标行数、用户确认", async () => {
  const { parseGate } = await import("../scripts/sc.mjs");
  const md = [
    "# 选题关", "", "- 目标观众：想用 AI 做自媒体的人", "- 标题候选 1：（写三个）", "- 用户确认：", "",
    "## 对标", "", "| 平台 | 标题 | 点赞 | 收藏 | 角度 |", "|---|---|---|---|---|",
    "| 抖音 | Claude Code 零基础终极教程 | 86.9万 | | 上手 |", "| 小红书 | 10 个 AI Skills | 5276 | 8738 | 合集 |", "| （平台） | （标题） | | | |",
  ].join("\n");
  const g = parseGate(md);
  assert.deepEqual(g.empty, ["标题候选 1", "用户确认"]);
  assert.equal(g.benchRows, 2);
  assert.equal(g.confirmed, false);
  assert.equal(parseGate("- 用户确认：2026-10-08 通过").confirmed, true);
});

test("parseCount：万、+、空值", async () => {
  const { parseCount } = await import("../scripts/sc.mjs");
  assert.equal(parseCount("1.2万"), 12000);
  assert.equal(parseCount("10万+"), 100000);
  assert.equal(parseCount("5276"), 5276);
  assert.equal(parseCount(null), 0);
  assert.equal(parseCount("赞"), 0);
});

test("parseDouyinText：按「时长 / 点赞 / 标题 / @作者」切出视频", async () => {
  const { parseDouyinText } = await import("../scripts/sc.mjs");
  const text = ["综合", "视频", "02:52", "86", "普通人做自媒体别乱冲 #ai博主", "@舟仔", "2月前", "合集",
    "53:00", "86.9万", "Claude Code 零基础终极教程！", "@木子不写代码", "1年前", "01:00:12", "不是数字", "标题"].join("\n");
  assert.deepEqual(parseDouyinText(text), [
    { duration: "02:52", likes: 86, title: "普通人做自媒体别乱冲 #ai博主", author: "舟仔" },
    { duration: "53:00", likes: 869000, title: "Claude Code 零基础终极教程！", author: "木子不写代码" },
  ]);
});

function ep(files) {
  const dir = mkdtempSync(join(tmpdir(), "sc-"));
  for (const [p, v] of Object.entries(files)) {
    mkdirSync(join(dir, p, ".."), { recursive: true });
    writeFileSync(join(dir, p), v);
  }
  return dir;
}

test("runChecks：每条问题带 file；选题关没确认单独一条 topic-unconfirmed", async () => {
  const { runChecks, loadConfig } = await import("../scripts/sc.mjs");
  const dir = ep({ "选题关.md": "- 标题候选 1：好\n- 用户确认：（用户看过后写）\n" });
  const items = runChecks(dir, loadConfig(dir));
  const gate = items.filter((i) => i.file === "选题关.md");
  assert.ok(gate.some((i) => i.code === "topic-unconfirmed" && i.level === "✗"));
  assert.ok(!gate.some((i) => /未填写：.*用户确认/.test(i.msg)));
  assert.ok(items.some((i) => i.file === "场景卡.md" && i.level === "✗"));
  assert.ok(items.some((i) => i.file === "实测记录.md"));
});

test("sc check --json 输出 items，有 ✗ 退出码 1", () => {
  const SC = fileURLToPath(new URL("../scripts/sc.mjs", import.meta.url));
  const r = spawnSync(process.execPath, [SC, "check", ep({}), "--json"], { encoding: "utf8" });
  assert.equal(r.status, 1);
  const { items } = JSON.parse(r.stdout);
  assert.ok(items.some((i) => i.file === "场景卡.md" && i.msg === "缺少 场景卡.md"));
});
