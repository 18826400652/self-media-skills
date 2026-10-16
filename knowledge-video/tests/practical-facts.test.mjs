import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { episode } from "./helpers.mjs";
import { collectPracticalFacts, fingerprint, gateFileHashes, legacyFingerprint, qaProblem, templateHashes } from "../scripts/lib/practical-facts.mjs";

// qa.md 规定的检查项全部写上的 qa.json
const ALL_CHECKS = ["safe-area", "text-size", "density", "typo", "fact-on-screen", "rhythm", "motion"];
const scOk = () => ({ items: [] });
const voiceOk = () => ({ ok: true, msg: "" });
const run = (o = {}) => ({ type: "practical", gates: {}, done: {}, templates: {}, ...o });
const collect = (dir, r = run(), o = {}) => collectPracticalFacts(dir, r, { runSc: scOk, runVoiceCheck: voiceOk, runVdCues: () => ({ ok: true, msg: "" }), experienceDir: join(dir, "经验库"), ...o });
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
  assert.match(f.steps.test.why, /录屏.*sc rec/);
  assert.equal(f.steps.script.ok, false);
  assert.match(f.steps.script.why, /空模板/);
  const dir2 = episode({ "抖音/SCRIPT.md": "## a (Frame 1)\n\n    写了。\n" });
  f = collect(dir2, run(), { runVoiceCheck: () => ({ ok: false, msg: "VOICE.md 和 SCRIPT.md 对不上" }) });
  assert.equal(f.steps.script.ok, false);
  assert.match(f.steps.script.why, /对不上/);
});

test("确认节点：指纹一致 passed，不一致 stale", () => {
  const dir = episode({ "选题关.md": "v1" });
  const fp = fingerprint(dir, "topic");
  const r = run({ gates: { topic: { passed: true, at: "2026-10-12", quote: "通过", fingerprint: fp, edits: [] } } });
  assert.deepEqual(collect(dir, r).gates.topic, { passed: true, at: "2026-10-12", quote: "通过", stale: false, changed: [] });
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

const vdOk = () => ({ ok: true, msg: "" });
const D = "抖音";
const dCollect = (dir, r = run(), o = {}) => collect(dir, r, { runVdCues: vdOk, ...o });

test("第 8 步：没配音、没 DIRECTOR.md 时说清楚缺什么", () => {
  assert.match(dCollect(episode({})).steps.director.why, /还没配音（vo 抖音）/);
  assert.match(dCollect(episode({ "抖音/audio_meta.json": "{}" })).steps.director.why, /还没有 抖音\/DIRECTOR\.md/);
});

test("director：缺 caption_groups.json 或 assets/voice/ 的配音文件 → 第 8 步不通过，说缺哪个", () => {
  const meta = JSON.stringify({ voices: [{ frame: 1, path: "assets/voice/01.wav" }, { frame: 2, path: "assets/voice/02.wav" }] });
  const dir = episode({ [`${D}/audio_meta.json`]: meta, [`${D}/DIRECTOR.md`]: "x" });
  assert.match(dCollect(dir).steps.director.why, /没有 caption_groups\.json.*vo 抖音/);
  writeFileSync(join(dir, D, "caption_groups.json"), "{}");
  mkdirSync(join(dir, D, "assets/voice"), { recursive: true });
  writeFileSync(join(dir, D, "assets/voice/01.wav"), "a");
  assert.match(dCollect(dir).steps.director.why, /缺配音文件：assets\/voice\/02\.wav.*vo 抖音/);
  writeFileSync(join(dir, D, "assets/voice/02.wav"), "a");
  assert.equal(dCollect(dir).steps.director.ok, true);
});

test("director：样片要有 renders/sample.mp4 且样片 vd qa 通过；只改 DIRECTOR.md 不算样片过期（③a 失效会把关）", () => {
  const dir = episode({ [`${D}/DIRECTOR.md`]: "x" });
  assert.match(dCollect(dir).steps.sample.why, /renders\/sample\.mp4/);
  mkdirSync(join(dir, D, "renders"), { recursive: true });
  writeFileSync(join(dir, D, "renders/sample.mp4"), "v");
  assert.match(dCollect(dir).steps.sample.why, /样片还没跑 vd qa/);
  writeFileSync(join(dir, D, "qa-douyin-sample.json"), JSON.stringify({ passed: false }));
  assert.match(dCollect(dir).steps.sample.why, /样片 vd qa 还有 ✗/);
  writeFileSync(join(dir, D, "qa-douyin-sample.json"), JSON.stringify({ passed: true }));
  touch(dir, `${D}/DIRECTOR.md`, 2000);
  touch(dir, `${D}/renders/sample.mp4`, 1000);
  assert.equal(dCollect(dir).steps.sample.ok, true);
});

test("director：成片比工程里的 HTML 旧 → 要重新渲染；只改 DIRECTOR.md（如补组件候选）不用重渲染", () => {
  const dir = episode({ [`${D}/DIRECTOR.md`]: "x", [`${D}/index.html`]: "<html>", [`${D}/compositions/frames/s1.html`]: "<div>", [`${D}/renders/01.mp4`]: "v", [`${D}/qa-douyin.json`]: { passed: true }, "qa.json": { passed: true, checked: ALL_CHECKS } });
  for (const [f, t] of [[`${D}/index.html`, 1000], [`${D}/compositions/frames/s1.html`, 1000], [`${D}/renders/01.mp4`, 2000], [`${D}/qa-douyin.json`, 1500], ["qa.json", 3000], [`${D}/DIRECTOR.md`, 4000]]) touch(dir, f, t);
  assert.equal(dCollect(dir).steps.render.ok, true);
  touch(dir, `${D}/compositions/frames/s1.html`, 2500);
  assert.match(dCollect(dir).steps.render.why, /画面改过，要重新渲染/);
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
  writeFileSync(join(dir, "qa.json"), JSON.stringify({ passed: true, checked: ALL_CHECKS }));
  touch(dir, "qa.json", 4000);
  assert.equal(dCollect(dir).steps.render.ok, true);
});

test("director 指纹：③a 看 DIRECTOR.md 和配音，③b 看样片，④ 看正式成片", () => {
  const dir = episode({ "抖音/audio_meta.json": "{}", [`${D}/DIRECTOR.md`]: "x", [`${D}/renders/sample.mp4`]: "s", [`${D}/renders/01.mp4`]: "f" });
  const before = ["director", "sample", "final"].map((g) => fingerprint(dir, g));
  writeFileSync(join(dir, D, "DIRECTOR.md"), "y");
  writeFileSync(join(dir, D, "renders/sample.mp4"), "s2");
  writeFileSync(join(dir, D, "renders/compare.mp4"), "c");
  const after = ["director", "sample", "final"].map((g) => fingerprint(dir, g));
  assert.notEqual(after[0], before[0]);
  assert.notEqual(after[1], before[1]);
  assert.equal(after[2], before[2], "compare.mp4 不影响 ④");
  const md = "# 导演脚本\n## 7. 样片范围\n前两段\n## 8. 组件候选\n| 画面 | 名 |\n";
  writeFileSync(join(dir, D, "DIRECTOR.md"), md);
  const fp = fingerprint(dir, "director");
  writeFileSync(join(dir, D, "DIRECTOR.md"), md + "| 小票 | dy-receipt |\n");
  assert.equal(fingerprint(dir, "director"), fp, "只补第 8 节组件候选，③a 不失效");
  writeFileSync(join(dir, D, "DIRECTOR.md"), md.replace("前两段", "前三段"));
  assert.notEqual(fingerprint(dir, "director"), fp);
  const f = dCollect(dir, run({ gates: { director: { passed: true, fingerprint: before[0] } } }));
  assert.deepEqual(Object.keys(f.gates), ["topic", "script", "director", "sample", "final"]);
  assert.equal(f.gates.director.stale, true);
});


test("第 8 步：配音、字幕分组、DIRECTOR.md 齐了才跑 vd cues；vd cues 不过（如还是模板）→ 不通过，原因来自 vd", () => {
  const dir = episode({ "抖音/SCRIPT.md": "x", "抖音/DIRECTOR.md": "模板", "抖音/audio_meta.json": { voices: [] }, "抖音/caption_groups.json": { groups: [] } });
  const bad = dCollect(dir, run(), { runVdCues: () => ({ ok: false, msg: "DIRECTOR.md 有 13 处问题" }) });
  assert.equal(bad.steps.director.ok, false);
  assert.match(bad.steps.director.why, /13 处问题/);
  assert.equal(dCollect(dir).steps.director.ok, true);
  assert.equal("video" in dCollect(dir), false);
});

test("旧 run.json（video: template、有 storyboard 节点）照常判断，不崩（Review Focus 3）", () => {
  const dir = episode({ "抖音/SCRIPT.md": "x" });
  const f = dCollect(dir, run({ video: "template", gates: { storyboard: { passed: true, fingerprint: "x" } } }));
  assert.deepEqual(Object.keys(f.gates).sort(), ["director", "final", "sample", "script", "topic"]);
  assert.equal(f.steps.director.ok, false);
});

test("qaProblem：checked 缺 qa.md 七项之一 → 列出缺的", () => {
  assert.match(qaProblem({ passed: true, checked: ["typo"], issues: [] }), /safe-area.*motion/);
});

test("qaProblem：写了通过但还有 high 级问题 → 不算通过", () => {
  assert.match(qaProblem({ passed: true, checked: ALL_CHECKS, issues: [{ severity: "high", problem: "x" }] }), /high/);
});

test("qaProblem：passed:false → 有没修的问题；七项齐全、只有 medium → 没问题", () => {
  assert.match(qaProblem({ passed: false, checked: ALL_CHECKS, issues: [] }), /没修/);
  assert.equal(qaProblem({ passed: true, checked: ALL_CHECKS, issues: [{ severity: "medium" }] }), null);
});

test("第 10 步用 qaProblem 判定：checked 不全不算做完", () => {
  const dir = episode({ [`${D}/index.html`]: "<html>", [`${D}/renders/a.mp4`]: "x", [`${D}/qa-douyin.json`]: { passed: true }, "qa.json": '{"passed":true,"checked":["typo"]}' });
  touch(dir, `${D}/index.html`, 1000); touch(dir, `${D}/qa-douyin.json`, 2000); touch(dir, `${D}/renders/a.mp4`, 3000); touch(dir, "qa.json", 4000);
  const f = collect(dir);
  assert.equal(f.steps.render.ok, false);
  assert.match(f.steps.render.why, /safe-area/);
});

test("渲染后还没重新 QA：qa.json 比成片旧不算做完", () => {
  const dir = episode({ [`${D}/index.html`]: "<html>", [`${D}/renders/a.mp4`]: "x", [`${D}/qa-douyin.json`]: { passed: true }, "qa.json": { passed: true, checked: ALL_CHECKS } });
  touch(dir, `${D}/index.html`, 1000); touch(dir, `${D}/qa-douyin.json`, 2000); touch(dir, "qa.json", 2500); touch(dir, `${D}/renders/a.mp4`, 3000);
  const f = collect(dir);
  assert.equal(f.steps.render.ok, false);
  assert.match(f.steps.render.why, /重新 QA/);
  assert.match(f.steps.render.why, /qa\.json 比成片旧.*看过新成片再更新 qa\.json/);
});

test("自检只看内容阶段：公众号文章残留占位 → 第 6 步通过，公众号那一步不通过并写出文件", () => {
  const dir = episode({ "实测/录屏-1.mp4": "x" });
  const items = [{ level: "✗", msg: "公众号/文章.md:23 残留占位符：{{关键词}}", file: "公众号/文章.md" }];
  const f = collect(dir, run(), { runSc: () => ({ items }) });
  assert.equal(f.steps.selfcheck.ok, true);
  assert.equal(f.steps.wechat.ok, false);
  assert.match(f.steps.wechat.why, /公众号\/文章\.md/);
});

test("自检：母稿残留占位 → 第 6 步不通过，原因写出文件", () => {
  const dir = episode({ "实测/录屏-1.mp4": "x" });
  const items = [{ level: "✗", msg: "母稿.md:3 残留占位符", file: "母稿.md" }];
  const f = collect(dir, run(), { runSc: () => ({ items }) });
  assert.equal(f.steps.selfcheck.ok, false);
  assert.match(f.steps.selfcheck.why, /母稿\.md/);
});

test("抖音 SCRIPT.md 的 ✗ 归到第 7 步，不挡第 6 步", () => {
  const dir = episode({ "实测/录屏-1.mp4": "x", "抖音/SCRIPT.md": "## a (Frame 1)\n\n    写好了\n" });
  const items = [{ level: "✗", msg: "抖音第 1 句情感「x」无效", file: "抖音/SCRIPT.md" }];
  const f = collect(dir, run(), { runSc: () => ({ items }) });
  assert.equal(f.steps.selfcheck.ok, true);
  assert.equal(f.steps.script.ok, false);
  assert.match(f.steps.script.why, /情感/);
});

test("公众号文章写了但还残留占位 → 公众号那一步报 sc 的问题，算内容没写好（kv done 会拒绝）", () => {
  const dir = episode({ "实测/录屏-1.mp4": "x", "公众号/文章.md": "# 标题\n\n正文，后台回复「{{关键词}}」领\n" });
  const items = [{ level: "✗", msg: "公众号/文章.md:3 残留占位符", file: "公众号/文章.md" }];
  const f = collect(dir, run(), { runSc: () => ({ items }) });
  assert.equal(f.steps.wechat.ok, false);
  assert.equal(f.steps.wechat.content, false);
  assert.match(f.steps.wechat.why, /残留占位符/);
});

test("③a 指纹不看排版：反引号、加粗、空白、表格对齐、机器块缩进改了不失效；改了内容才失效", () => {
  const vd = { segments: [{ id: "seg-01", lines: [1, 2] }], palette: { bg: "#000000" } };
  const md = (body, json = JSON.stringify(vd, null, 2)) => `# 导演脚本\n## 2. 分段\n${body}\n\`\`\`json vd\n${json}\n\`\`\`\n`;
  const dir = episode({ [`${D}/DIRECTOR.md`]: md("说到 `@一张表` 时**表格展开**。\n\n| 段 | 画面 |\n|---|---|\n| 1 | 气泡 |") });
  const fp = fingerprint(dir, "director");
  writeFileSync(join(dir, D, "DIRECTOR.md"), md("说到 @一张表  时表格展开。\n| 段   | 画面 |\n|:--|:--:|\n| 1 |  气泡 |", JSON.stringify(vd)));
  assert.equal(fingerprint(dir, "director"), fp, "只改格式");
  writeFileSync(join(dir, D, "DIRECTOR.md"), md("说到 @一张表 时表格展开。\n| 段 | 画面 |\n|---|---|\n| 1 | 便签 |"));
  assert.notEqual(fingerprint(dir, "director"), fp, "画面内容改了");
  writeFileSync(join(dir, D, "DIRECTOR.md"), md("说到 `@一张表` 时**表格展开**。\n\n| 段 | 画面 |\n|---|---|\n| 1 | 气泡 |", JSON.stringify({ ...vd, palette: { bg: "#111111" } })));
  assert.notEqual(fingerprint(dir, "director"), fp, "机器块内容改了");
});

test("确认节点：老 run.json 里按原文算的指纹照样认；失效时说出改了哪个文件", () => {
  const dir = episode({ [`${D}/DIRECTOR.md`]: "# 导演\n说到 @词 时出现\n", [`${D}/audio_meta.json`]: "{}" });
  const legacy = legacyFingerprint(dir, "director");
  assert.equal(dCollect(dir, run({ gates: { director: { passed: true, fingerprint: legacy } } })).gates.director.stale, false);
  const files = gateFileHashes(dir, "director");
  writeFileSync(join(dir, D, "DIRECTOR.md"), "# 导演\n说到 @词 时消失\n");
  const g = dCollect(dir, run({ gates: { director: { passed: true, fingerprint: "old", files } } })).gates.director;
  assert.equal(g.stale, true);
  assert.deepEqual(g.changed, [`${D}/DIRECTOR.md`]);
});
