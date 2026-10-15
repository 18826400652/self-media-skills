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
  touch(dir, "抖音/audio_meta.json", 1000); touch(dir, "抖音/STORYBOARD.md", 1000); touch(dir, "抖音/snapshots/sheet.jpg", 2000); touch(dir, "抖音/renders/a.mp4", 3000);
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

test("草稿步骤：内容空模板 content=false；写好没记 done 只差存草稿；抖音封面出图要比源文件新", () => {
  const dir = episode({ "公众号/文章.md": "tpl", "小红书/文案.md": "tpl", "抖音/发布文案.md": "写好了", "抖音/封面.md": "f", "抖音/out/01.png": "p" });
  touch(dir, "抖音/封面.md", 2000); touch(dir, "抖音/out/01.png", 1000);
  const r = run({ templates: templateHashes(dir, ["公众号/文章.md", "小红书/文案.md"]) });
  let f = collect(dir, r);
  assert.equal(f.steps.wechat.content, false);
  assert.equal(f.steps.xiaohongshu.content, false);
  assert.match(f.steps.xiaohongshu.why, /小红书\/文案\.md/);
  assert.equal(f.steps.douyin.content, false);
  assert.match(f.steps.douyin.why, /ic render/);
  touch(dir, "抖音/out/01.png", 3000);
  assert.equal(collect(dir, r).steps.douyin.content, true);
});

test("抖音草稿：发布文案还是空模板时 content=false", () => {
  const dir = episode({ "抖音/发布文案.md": "tpl", "抖音/封面.md": "f", "抖音/out/01.png": "p" });
  touch(dir, "抖音/封面.md", 1000); touch(dir, "抖音/out/01.png", 2000);
  const r = run({ templates: templateHashes(dir, ["抖音/发布文案.md"]) });
  let f = collect(dir, r);
  assert.equal(f.steps.douyin.content, false);
  assert.match(f.steps.douyin.why, /抖音\/发布文案\.md/);
  writeFileSync(join(dir, "抖音/发布文案.md"), "## 标题\n不露脸也能做\n");
  f = collect(dir, { ...r, done: { douyin: "2026-10-14" } });
  assert.equal(f.steps.douyin.ok, true);
});

test("小红书发视频：只要写好文案，不要卡片", () => {
  const dir = episode({ "小红书/文案.md": "## 标题\n不露脸也能做\n" });
  let f = collect(dir, run());
  assert.equal(f.steps.xiaohongshu.content, true);
  assert.equal(f.steps.xiaohongshu.ok, false);
  f = collect(dir, run({ done: { xiaohongshu: "2026-10-14" } }));
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

test("渲染后还没重新 QA：qa.json 比成片旧不算做完", () => {
  const dir = episode({ "抖音/audio_meta.json": "{}", "抖音/STORYBOARD.md": "x", "抖音/snapshots/sheet.jpg": "x", "抖音/renders/a.mp4": "x", "qa.json": '{"passed":true}' });
  touch(dir, "抖音/audio_meta.json", 1000); touch(dir, "抖音/STORYBOARD.md", 1000); touch(dir, "抖音/snapshots/sheet.jpg", 2000);
  touch(dir, "qa.json", 2500); touch(dir, "抖音/renders/a.mp4", 3000);
  const f = collect(dir);
  assert.equal(f.steps.render.ok, false);
  assert.match(f.steps.render.why, /重新 QA/);
});

test("重新配音（audio_meta 比 sheet 新）：第 8 步不算做完", () => {
  const dir = episode({ "抖音/audio_meta.json": "{}", "抖音/STORYBOARD.md": "x", "抖音/snapshots/sheet.jpg": "x" });
  touch(dir, "抖音/STORYBOARD.md", 1000); touch(dir, "抖音/snapshots/sheet.jpg", 2000); touch(dir, "抖音/audio_meta.json", 3000);
  const f = collect(dir);
  assert.equal(f.steps.storyboard.ok, false);
  assert.match(f.steps.storyboard.why, /重新 nv hf-build/);
});

test("预览-压缩.mp4 不算成片：第 9 步和 ④ 指纹只看正式渲染", () => {
  const dir = episode({ "抖音/audio_meta.json": "{}", "抖音/STORYBOARD.md": "x", "抖音/snapshots/sheet.jpg": "x", "抖音/renders/01.mp4": "old", "抖音/renders/预览-压缩.mp4": "p", "qa.json": '{"passed":true}' });
  touch(dir, "抖音/audio_meta.json", 1000); touch(dir, "抖音/STORYBOARD.md", 1000); touch(dir, "抖音/snapshots/sheet.jpg", 2000);
  touch(dir, "抖音/renders/01.mp4", 1500); touch(dir, "抖音/renders/预览-压缩.mp4", 3000); touch(dir, "qa.json", 3500);
  assert.equal(collect(dir).steps.render.ok, false);
  const fp = fingerprint(dir, "final");
  writeFileSync(join(dir, "抖音/renders/预览-压缩.mp4"), "p2");
  assert.equal(fingerprint(dir, "final"), fp);
});

const vdOk = () => ({ ok: true, msg: "" });
const D = "抖音-director";
const dRun = (o = {}) => run({ video: "director", ...o });
const dCollect = (dir, r = dRun(), o = {}) => collect(dir, r, { runVdCues: vdOk, ...o });

test("director：第 8 步要配音、DIRECTOR.md、vd cues 通过；导演工程里的配音旧了不算", () => {
  let f = dCollect(episode({}));
  assert.equal(f.video, "director");
  assert.match(f.steps.director.why, /还没配音/);
  f = dCollect(episode({ "抖音/audio_meta.json": "{}" }));
  assert.match(f.steps.director.why, /还没有 抖音-director\/DIRECTOR\.md/);
  const dir = episode({ "抖音/audio_meta.json": "{}", [`${D}/DIRECTOR.md`]: "x", [`${D}/audio_meta.json`]: "{}" });
  assert.match(dCollect(dir, dRun(), { runVdCues: () => ({ ok: false, msg: "第 3 句没有分到任何段" }) }).steps.director.why, /第 3 句/);
  assert.equal(dCollect(dir).steps.director.ok, true);
  touch(dir, `${D}/audio_meta.json`, 1000);
  touch(dir, "抖音/audio_meta.json", 2000);
  assert.match(dCollect(dir).steps.director.why, /重新配过音/);
});

test("director：样片要比 DIRECTOR.md 新", () => {
  const dir = episode({ [`${D}/DIRECTOR.md`]: "x" });
  assert.match(dCollect(dir).steps.sample.why, /renders\/sample\.mp4/);
  mkdirSync(join(dir, D, "renders"), { recursive: true });
  writeFileSync(join(dir, D, "renders/sample.mp4"), "v");
  touch(dir, `${D}/DIRECTOR.md`, 2000);
  touch(dir, `${D}/renders/sample.mp4`, 1000);
  assert.match(dCollect(dir).steps.sample.why, /DIRECTOR\.md 改过/);
  touch(dir, `${D}/renders/sample.mp4`, 3000);
  assert.equal(dCollect(dir).steps.sample.ok, true);
});

test("director：渲染步骤看正式成片（不算 sample / compare / 预览）、vd qa、qa.json", () => {
  const files = { [`${D}/DIRECTOR.md`]: "x", [`${D}/index.html`]: "<html>", [`${D}/renders/sample.mp4`]: "v", [`${D}/renders/compare.mp4`]: "v", [`${D}/renders/预览-1.mp4`]: "v" };
  let dir = episode(files);
  assert.match(dCollect(dir).steps.render.why, /还没渲染/);
  dir = episode({ ...files, [`${D}/renders/01.mp4`]: "v" });
  for (const [f, s] of [[`${D}/DIRECTOR.md`, 1000], [`${D}/index.html`, 1000], [`${D}/renders/01.mp4`, 3000]]) touch(dir, f, s);
  assert.match(dCollect(dir).steps.render.why, /还没跑 vd qa/);
  writeFileSync(join(dir, D, "qa-douyin.json"), JSON.stringify({ passed: false }));
  touch(dir, `${D}/qa-douyin.json`, 2000);
  assert.match(dCollect(dir).steps.render.why, /vd qa 还有 ✗/);
  writeFileSync(join(dir, D, "qa-douyin.json"), JSON.stringify({ passed: true }));
  touch(dir, `${D}/qa-douyin.json`, 2000);
  touch(dir, `${D}/index.html`, 2500);
  assert.match(dCollect(dir).steps.render.why, /画面改过，要重跑 vd qa/);
  touch(dir, `${D}/index.html`, 1500);
  assert.match(dCollect(dir).steps.render.why, /还没写 qa\.json/);
  writeFileSync(join(dir, "qa.json"), JSON.stringify({ passed: true }));
  touch(dir, "qa.json", 4000);
  assert.equal(dCollect(dir).steps.render.ok, true);
});

test("director 指纹：③a 看 DIRECTOR.md 和配音，③b 看样片，④ 看正式成片", () => {
  const dir = episode({ "抖音/audio_meta.json": "{}", [`${D}/DIRECTOR.md`]: "x", [`${D}/renders/sample.mp4`]: "s", [`${D}/renders/01.mp4`]: "f" });
  const before = ["director", "sample", "final"].map((g) => fingerprint(dir, g, "director"));
  writeFileSync(join(dir, D, "DIRECTOR.md"), "y");
  writeFileSync(join(dir, D, "renders/sample.mp4"), "s2");
  writeFileSync(join(dir, D, "renders/compare.mp4"), "c");
  const after = ["director", "sample", "final"].map((g) => fingerprint(dir, g, "director"));
  assert.notEqual(after[0], before[0]);
  assert.notEqual(after[1], before[1]);
  assert.equal(after[2], before[2], "compare.mp4 不影响 ④");
  const f = dCollect(dir, dRun({ gates: { director: { passed: true, fingerprint: before[0] } } }));
  assert.deepEqual(Object.keys(f.gates), ["topic", "script", "director", "sample", "final"]);
  assert.equal(f.gates.director.stale, true);
});
