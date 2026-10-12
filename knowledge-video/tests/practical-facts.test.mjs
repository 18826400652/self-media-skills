import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { episode } from "./helpers.mjs";
import { collectPracticalFacts, fingerprint, templateHashes } from "../scripts/lib/practical-facts.mjs";

const scOk = () => ({ items: [] });
const voiceOk = () => ({ ok: true, msg: "" });
const run = (o = {}) => ({ type: "practical", gates: {}, done: {}, templates: {}, ...o });
const collect = (dir, r = run(), o = {}) => collectPracticalFacts(dir, r, { runSc: scOk, runVoiceCheck: voiceOk, experienceDir: join(dir, "经验库"), ...o });
const touch = (dir, rel, sec) => utimesSync(join(dir, rel), sec, sec);

test("sc 的问题按文件归到第 1–6 步；topic-unconfirmed 不算", () => {
  const dir = episode({ "实测/录屏-1.mp4": "x" });
  const items = [
    { level: "✗", msg: "场景卡未填写：时间", file: "场景卡.md" },
    { level: "✗", msg: "选题关用户还没确认", file: "选题关.md", code: "topic-unconfirmed" },
    { level: "⚠", msg: "AI 腔", file: "母稿.md" },
  ];
  const f = collect(dir, run(), { runSc: () => ({ items }) });
  assert.equal(f.steps.scenario.ok, false);
  assert.match(f.steps.scenario.why, /时间/);
  assert.equal(f.steps.topic.ok, true);
  assert.equal(f.steps.draft.ok, true);
  assert.equal(f.steps.selfcheck.ok, false);
});

test("sc 跑不起来：第 1 步没做完，原因写清楚", () => {
  const f = collect(episode({}), run(), { runSc: () => ({ error: "找不到 sc 命令" }) });
  assert.equal(f.steps.scenario.ok, false);
  assert.match(f.steps.scenario.why, /找不到 sc 命令/);
});

test("实测要有录屏；脚本要写过且 VOICE 检查通过", () => {
  const tpl = { "抖音/SCRIPT.md": "## a (Frame 1)\n\n    （占位）\n" };
  const dir = episode(tpl);
  const r = run({ templates: templateHashes(dir, ["抖音/SCRIPT.md"]) });
  let f = collect(dir, r);
  assert.equal(f.steps.test.ok, false);
  assert.match(f.steps.test.why, /录屏/);
  assert.equal(f.steps.script.ok, false);
  assert.match(f.steps.script.why, /空模板/);
  const dir2 = episode({ "抖音/SCRIPT.md": "## a (Frame 1)\n\n    写了。\n" });
  f = collect(dir2, run(), { runVoiceCheck: () => ({ ok: false, msg: "VOICE.md 和 SCRIPT.md 对不上" }) });
  assert.equal(f.steps.script.ok, false);
  assert.match(f.steps.script.why, /对不上/);
});

test("newer：sheet 比 STORYBOARD 旧、mp4 比 sheet 旧都不算做完；qa 要 passed", () => {
  const dir = episode({ "抖音/audio_meta.json": "{}", "抖音/STORYBOARD.md": "x", "抖音/snapshots/sheet.jpg": "x", "抖音/renders/a.mp4": "x", "qa.json": '{"passed":true}' });
  touch(dir, "抖音/STORYBOARD.md", 1000); touch(dir, "抖音/snapshots/sheet.jpg", 2000); touch(dir, "抖音/renders/a.mp4", 3000);
  let f = collect(dir);
  assert.equal(f.steps.storyboard.ok, true);
  assert.equal(f.steps.render.ok, true);
  touch(dir, "抖音/STORYBOARD.md", 2500);
  f = collect(dir);
  assert.equal(f.steps.storyboard.ok, false);
  assert.match(f.steps.storyboard.why, /重新 nv hf-build/);
  touch(dir, "抖音/STORYBOARD.md", 1000); touch(dir, "抖音/renders/a.mp4", 1500);
  f = collect(dir);
  assert.equal(f.steps.render.ok, false);
});

test("确认节点：指纹一致 passed，不一致 stale", () => {
  const dir = episode({ "选题关.md": "v1" });
  const fp = fingerprint(dir, "topic");
  const r = run({ gates: { topic: { passed: true, at: "2026-10-12", quote: "通过", fingerprint: fp, edits: [] } } });
  assert.deepEqual(collect(dir, r).gates.topic, { passed: true, at: "2026-10-12", quote: "通过", stale: false });
  const dir2 = episode({ "选题关.md": "v2" });
  assert.equal(collect(dir2, r).gates.topic.stale, true);
  assert.equal(collect(dir, run()).gates.script.passed, false);
});

test("草稿步骤：内容空模板 content=false；写好没记 done 只差存草稿；出图要比源文件新", () => {
  const dir = episode({ "公众号/文章.md": "tpl", "小红书/卡片.md": "c", "小红书/文案.md": "w", "小红书/out/01.png": "p", "抖音/封面.md": "f" });
  touch(dir, "小红书/卡片.md", 2000); touch(dir, "小红书/out/01.png", 1000);
  const r = run({ templates: templateHashes(dir, ["公众号/文章.md"]) });
  let f = collect(dir, r);
  assert.equal(f.steps.wechat.content, false);
  assert.equal(f.steps.xiaohongshu.content, false);
  assert.match(f.steps.xiaohongshu.why, /ic render/);
  assert.equal(f.steps.douyin.content, false);
  touch(dir, "小红书/out/01.png", 3000);
  f = collect(dir, { ...r, done: { xiaohongshu: "2026-10-12" } });
  assert.equal(f.steps.xiaohongshu.ok, true);
});

test("发布记录看置顶评论；复盘看经验库里有没有带简称的文件", () => {
  const tpl = "### 置顶评论（原文）\n\n```\n（视频里承诺的模板或资料，直接可复制）\n```\n";
  const dir = episode({ "发布记录.md": tpl, "经验库/2026-10-12-别的.md": "x" });
  let f = collect(dir);
  assert.equal(f.steps.record.ok, false);
  assert.equal(f.steps.retro.ok, false);
  const dir2 = episode({ "发布记录.md": "### 置顶评论（原文）\n\n```\n选题关五问……\n```\n" });
  mkdirSync(join(dir2, "经验库"));
  writeFileSync(join(dir2, "经验库", `2026-10-12-${basename(dir2)}.md`), "x");
  f = collect(dir2);
  assert.equal(f.steps.record.ok, true);
  assert.equal(f.steps.retro.ok, true);
});
