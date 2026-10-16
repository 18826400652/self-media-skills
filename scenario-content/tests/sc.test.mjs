// sc 的纯逻辑测试：node --test tests/*.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

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

test("抖音发布文案标题超过 30 字给出 ⚠", async () => {
  const { runChecks, loadConfig } = await import("../scripts/sc.mjs");
  const title = "这是一个特别特别长的抖音标题，用来测试超过三十个字的时候会不会给出提醒呀";
  const dir = ep({ "抖音/发布文案.md": `## 标题\n\n${title}\n\n## 正文\n\n正文\n` });
  const config = { ...loadConfig(dir), platformFiles: { douyinCopy: "抖音/发布文案.md" } };
  const items = runChecks(dir, config);
  assert.ok(items.some((i) => i.file === "抖音/发布文案.md" && i.level === "⚠" && /抖音标题/.test(i.msg)));
});

/** 只放一份抖音 SCRIPT.md 的作品，返回这份文件的检查结果 */
const scriptItems = async (md) => {
  const { runChecks, loadConfig } = await import("../scripts/sc.mjs");
  const dir = ep({ "抖音/SCRIPT.md": md });
  const config = { ...loadConfig(dir), platformFiles: { douyinScript: "抖音/SCRIPT.md" } };
  return runChecks(dir, config).filter((i) => i.file === "抖音/SCRIPT.md");
};

test("抖音口播检查：每句超长、情感无效、书面词按 (Frame N) 报出", async () => {
  const items = await scriptItems("## 钩子 (Frame 1)\n**Emotion:** 惊讶怪\n\n    这一句写得特别特别特别特别特别特别特别特别特别特别长了吧。\n    因此不行。\n");
  assert.ok(items.some((i) => i.level === "⚠" && /第 1 帧有一句/.test(i.msg)));
  assert.ok(items.some((i) => i.level === "✗" && /情感「惊讶怪」无效/.test(i.msg)));
  assert.ok(items.some((i) => i.level === "⚠" && /书面词「因此」/.test(i.msg)));
});

test("抖音口播检查：小写 frame、### 标题、Tab 缩进的口播也读得到（和 vo 同一套规则）", async () => {
  const items = await scriptItems("### 钩子 (frame 1)\n\tAI 写了 3 条。\n");
  assert.ok(items.some((i) => i.level === "⚠" && /第 1 句有阿拉伯数字/.test(i.msg)));
});

// st new 之后的母稿：{{…}} 已替换，小节下面还是模板的括号说明
const DRAFT_TEMPLATE = (await import("node:fs")).readFileSync(new URL("../../studio/templates/母稿模板.md", import.meta.url), "utf8").replace(/\{\{[^}]+\}\}/g, "X");
const SECTIONS = { requiredSections: ["成品", "场景", "步骤", "坑", "领"] };
const draftItems = async (md) => {
  const { runChecks, loadConfig } = await import("../scripts/sc.mjs");
  const dir = ep({ "母稿.md": md });
  return runChecks(dir, { ...loadConfig(dir), ...SECTIONS }).filter((i) => i.file === "母稿.md");
};

test("母稿还是模板（小节下只有括号说明）→ ✗ 列出没写内容的小节", async () => {
  const items = await draftItems(DRAFT_TEMPLATE);
  const bad = items.find((i) => i.level === "✗");
  assert.ok(bad, "空模板应报 ✗");
  for (const k of SECTIONS.requiredSections) assert.match(bad.msg, new RegExp(k));
});

test("母稿每个必需小节都有正文 → 结构完整", async () => {
  const md = DRAFT_TEMPLATE.replace(/^（[^\n]*）$/gm, "这里是正文。");
  const items = await draftItems(md);
  assert.ok(!items.some((i) => i.level === "✗"), JSON.stringify(items));
});

test("母稿只有一个小节没写 → 只列这一个", async () => {
  const md = DRAFT_TEMPLATE.replace(/^（[^\n]*）$/gm, "这里是正文。").replace(/## 我踩的坑\n\n这里是正文。/, "## 我踩的坑\n\n（实测里真实遇到的问题）");
  const bad = (await draftItems(md)).find((i) => i.level === "✗");
  assert.ok(bad);
  assert.match(bad.msg, /坑/);
  assert.doesNotMatch(bad.msg, /成品/);
});

test("项目配置没写 requiredSections 时，内置默认和母稿模板、骨架配置一致：填好的模板母稿结构完整", async () => {
  const { runChecks, loadConfig } = await import("../scripts/sc.mjs");
  const dir = ep({ "母稿.md": DRAFT_TEMPLATE.replace(/^（[^\n]*）$/gm, "这里是正文。") });
  const config = loadConfig(dir);
  const bad = runChecks(dir, config).filter((i) => i.file === "母稿.md" && i.level === "✗");
  assert.deepEqual(bad, []);
});

test("skill 自带的 templates/母稿.md 和内置必需小节一致（SKILL.md 让照它写）", async () => {
  const { runChecks, loadConfig } = await import("../scripts/sc.mjs");
  const own = (await import("node:fs")).readFileSync(new URL("../templates/母稿.md", import.meta.url), "utf8");
  const dir = ep({ "母稿.md": own.replace(/\{\{[^}]+\}\}/g, "X").replace(/^（[^\n]*）$/gm, "这里是正文。") });
  assert.deepEqual(runChecks(dir, loadConfig(dir)).filter((i) => i.file === "母稿.md" && i.level === "✗"), []);
});
