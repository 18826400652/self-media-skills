// 定方向：账号方向、系列说明没填完或没确认时 st new 硬拦；st confirm 记原话和指纹；st series add 登记系列
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { accountStatus, docGaps, seriesStatus } from "../scripts/lib/direction.mjs";
import { doctor } from "../scripts/lib/doctor.mjs";
import { initProject } from "../scripts/lib/init.mjs";
import { loadProject } from "../scripts/lib/project.mjs";

const ST = resolve(dirname(fileURLToPath(import.meta.url)), "../scripts/st.mjs");
const quiet = () => {};

const POSITIONING = `# 账号定位

- 账号名：小林的AI课
- 目标观众：刚入职、不懂技术的上班族
- 看完的感受：原来这么简单，我今天就能用上
- 人设：刚入职一年的运营，自己踩过的坑

## 变现路径

先领模板进粉丝群，以后卖 AI 办公小课；口播里不出现微信号

## 选题标准

当天能用上；开头三秒亮成品
`;
const VOICE = `# 语气指南

## 像谁说话

同事之间随口分享

## 要

- 先说结果

## 不要

- 不说「赋能」
`;

function write(root, rel, text) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
}

/** st init 建的空项目；fakeBin 放假的 vd、kv（st new 要用） */
function project() {
  const dir = join(mkdtempSync(join(tmpdir(), "st-dir-")), "proj");
  initProject({ dir, home: mkdtempSync(join(tmpdir(), "st-home-")) }, quiet);
  const bin = join(dir, ".bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "vd"), `#!/usr/bin/env bash\nif [[ "$1" == init ]]; then mkdir -p "$2"; fi\n`);
  writeFileSync(join(bin, "kv"), `#!/usr/bin/env bash\necho "$@" >> "${join(dir, "kv.log")}"\n`);
  for (const f of ["vd", "kv"]) chmodSync(join(bin, f), 0o755);
  return { dir, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } };
}

const st = (p, ...args) => spawnSync(process.execPath, [ST, ...args], { cwd: p.dir, env: p.env, encoding: "utf8" });
const studioJson = (p) => JSON.parse(readFileSync(join(p.dir, "studio.json"), "utf8"));
const registry = (p) => JSON.parse(readFileSync(join(p.dir, "00-规划/系列/系列.json"), "utf8"));

/** 把账号方向填完：两份文件 + studio.json 的 account、audience、lead */
function fillAccount(p) {
  write(p.dir, "00-规划/账号定位.md", POSITIONING);
  write(p.dir, "00-规划/语气指南.md", VOICE);
  writeFileSync(join(p.dir, "studio.json"), JSON.stringify({ ...studioJson(p), account: "小林的AI课", audience: "不懂技术的上班族", lead: "点头像进粉丝群领" }, null, 2));
}

/** 系列说明：把模板里的每个「（…）」和空格子都换成真内容 */
function fillSeriesDoc(p, name) {
  const f = join(p.dir, `00-规划/系列/${name}.md`);
  const fillRow = (l) => (/^\|.*\|$/.test(l) && !/^\|[\s:|-]+\|$/.test(l) ? l.split("|").map((c, i, a) => (i > 0 && i < a.length - 1 && !c.trim() ? " 已填 " : c)).join("|") : l);
  const text = readFileSync(f, "utf8").replace(/（[^）\n]*）/g, "已填").split("\n").map(fillRow).join("\n");
  writeFileSync(f, text);
}

function readyProject() {
  const p = project();
  fillAccount(p);
  assert.equal(st(p, "confirm", "account", "可以，就这样").status, 0);
  assert.equal(st(p, "series", "add", "飞书技巧", "--label", "飞书小技巧").status, 0);
  fillSeriesDoc(p, "飞书技巧");
  assert.equal(st(p, "confirm", "series", "飞书技巧", "系列这样定了").status, 0);
  return p;
}

// ---- 没填完的地方 ----

test("docGaps：模板里的「（…）」说明、空列表项、空表格格子原样留着就算没填", () => {
  const tpl = "# 标题\n\n> 说明（不算）\n\n- 账号名：{{账号}}\n- 人设：（你是谁）\n\n## 要\n\n-\n\n| 平台 | 做什么 |\n|---|---|\n| 抖音 | |\n";
  const filled = "# 标题\n\n> 说明（不算）\n\n- 账号名：小林\n- 人设：（你是谁）\n\n## 要\n\n- 先说结果\n\n| 平台 | 做什么 |\n|---|---|\n| 抖音 | |\n";
  assert.deepEqual(docGaps(filled, tpl), ["- 人设：（你是谁）", "| 抖音 | |"]);
  assert.deepEqual(docGaps(tpl.replace("{{账号}}", "（账号名）"), tpl).length, 4);
});

test("docGaps：模板里的 {{…}} 换成什么值都认得出（studio.json 后来改了观众也一样）", () => {
  const tpl = "| 目标观众 | {{观众}}（这个系列具体针对他们的哪种处境） |\n";
  assert.equal(docGaps("| 目标观众 | 新观众（这个系列具体针对他们的哪种处境） |\n", tpl).length, 1);
  assert.equal(docGaps("| 目标观众 | 新观众里刚入职的 |\n", tpl).length, 0);
});

test("docGaps：{{…}} 的位置填了带括号的真内容不算没填；还是 st init 留的「（目标观众）」才算", () => {
  const tpl = "- 目标观众：{{观众}}\n";
  assert.deepEqual(docGaps("- 目标观众：不懂技术的上班族（文员、行政），不会写代码\n", tpl), []);
  assert.deepEqual(docGaps("- 目标观众：（目标观众）\n", tpl), ["- 目标观众：（目标观众）"]);
});

test("账号方向：刚 st init 的项目是「没填完」，列出缺的项和 studio.json 缺的字段", () => {
  const p = project();
  const s = accountStatus(loadProject(p.dir));
  assert.equal(s.state, "unfilled");
  assert.ok(s.gaps.some((g) => g.includes("看完的感受")), s.gaps.join("\n"));
  assert.ok(s.gaps.some((g) => g.includes("语气指南.md")), s.gaps.join("\n"));
  assert.ok(s.gaps.some((g) => g.includes("lead")), s.gaps.join("\n"));
});

test("账号方向：填完没确认是「没确认」；确认后是 ok；确认后改了文件是「确认后改过」，说出改了哪个", () => {
  const p = project();
  fillAccount(p);
  assert.equal(accountStatus(loadProject(p.dir)).state, "unconfirmed");
  assert.equal(st(p, "confirm", "account", "可以，就这样").status, 0);
  assert.equal(accountStatus(loadProject(p.dir)).state, "ok");
  const c = studioJson(p).confirmed.account;
  assert.equal(c.quote, "可以，就这样");
  assert.ok(c.at && c.files["00-规划/账号定位.md"], JSON.stringify(c));
  write(p.dir, "00-规划/语气指南.md", VOICE + "\n- 不用感叹号\n");
  const s = accountStatus(loadProject(p.dir));
  assert.equal(s.state, "stale");
  assert.deepEqual(s.changed, ["00-规划/语气指南.md"]);
});

test("账号方向：确认后改了 studio.json 的 audience 也算改过", () => {
  const p = project();
  fillAccount(p);
  st(p, "confirm", "account", "可以");
  writeFileSync(join(p.dir, "studio.json"), JSON.stringify({ ...studioJson(p), audience: "大学生" }, null, 2));
  const s = accountStatus(loadProject(p.dir));
  assert.equal(s.state, "stale");
  assert.deepEqual(s.changed, ["studio.json 的 audience"]);
});

// ---- st confirm ----

test("st confirm account：没填完拒绝，列出缺的项，不写 confirmed", () => {
  const p = project();
  const r = st(p, "confirm", "account", "可以");
  assert.equal(r.status, 1);
  assert.match(r.stdout + r.stderr, /还没填完[\s\S]*看完的感受/);
  assert.equal(studioJson(p).confirmed, undefined);
});

test("st confirm：没写用户原话拒绝", () => {
  const p = project();
  fillAccount(p);
  const r = st(p, "confirm", "account");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /用户原话/);
});

test("st confirm account：再确认时上一次的原话留进 history", () => {
  const p = project();
  fillAccount(p);
  st(p, "confirm", "account", "第一次");
  st(p, "confirm", "account", "第二次");
  const c = studioJson(p).confirmed.account;
  assert.equal(c.quote, "第二次");
  assert.deepEqual(c.history.map((h) => h.quote), ["第一次"]);
});

// ---- st series add / confirm series ----

test("st series add：账号方向没确认就拦", () => {
  const p = project();
  const r = st(p, "series", "add", "飞书技巧");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /先定账号方向/);
  assert.deepEqual(registry(p), {});
});

test("st series add：登记进系列.json（label、unit、type 有默认值），用模板建系列说明", () => {
  const p = project();
  fillAccount(p);
  st(p, "confirm", "account", "可以");
  const r = st(p, "series", "add", "飞书技巧", "--label", "飞书小技巧");
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(registry(p)["飞书技巧"], { label: "飞书小技巧", unit: "期", type: "practical" });
  const doc = readFileSync(join(p.dir, "00-规划/系列/飞书技巧.md"), "utf8");
  assert.match(doc, /# 系列规划：飞书小技巧/);
  assert.match(r.stdout, /st confirm series 飞书技巧/);
  assert.equal(seriesStatus(loadProject(p.dir), "飞书技巧").state, "unfilled");
});

test("st series add：已登记的、type 不对的、名字带 / 的都拒绝", () => {
  const p = readyProject();
  assert.match(st(p, "series", "add", "飞书技巧").stderr, /已经登记/);
  assert.match(st(p, "series", "add", "新的", "--type", "news").stderr, /practical 或 concept/);
  assert.match(st(p, "series", "add", "a/b").stderr, /不能有 \//);
});

test("st confirm series：没填完拒绝；填完记在登记表的这个系列下；改了系列说明是「确认后改过」", () => {
  const p = project();
  fillAccount(p);
  st(p, "confirm", "account", "可以");
  st(p, "series", "add", "飞书技巧");
  const r = st(p, "confirm", "series", "飞书技巧", "行");
  assert.equal(r.status, 1);
  assert.match(r.stdout + r.stderr, /还没填完/);
  fillSeriesDoc(p, "飞书技巧");
  assert.equal(st(p, "confirm", "series", "飞书技巧", "行").status, 0);
  assert.equal(registry(p)["飞书技巧"].confirmed.quote, "行");
  assert.equal(seriesStatus(loadProject(p.dir), "飞书技巧").state, "ok");
  write(p.dir, "00-规划/系列/飞书技巧.md", readFileSync(join(p.dir, "00-规划/系列/飞书技巧.md"), "utf8") + "\n多一行\n");
  assert.equal(seriesStatus(loadProject(p.dir), "飞书技巧").state, "stale");
});

test("st confirm series：没登记的系列报错并列出已登记的", () => {
  const p = readyProject();
  const r = st(p, "confirm", "series", "没有这个", "行");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /未登记[\s\S]*飞书技巧/);
});

// ---- st new 硬拦 ----

test("st new：账号方向没定就拦，说清缺什么、怎么补，不建作品", () => {
  const p = project();
  writeFileSync(join(p.dir, "00-规划/系列/系列.json"), JSON.stringify({ 飞书技巧: { label: "飞书", unit: "期" } }));
  const r = st(p, "new", "飞书技巧", "周报");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /账号方向/);
  assert.match(r.stderr, /st confirm account/);
  assert.match(r.stderr, /--先不定/);
  assert.equal(existsSync(join(p.dir, "04-作品/飞书技巧")), false);
});

test("st new：账号定了、系列没确认也拦", () => {
  const p = project();
  fillAccount(p);
  st(p, "confirm", "account", "可以");
  st(p, "series", "add", "飞书技巧");
  const r = st(p, "new", "飞书技巧", "周报");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /系列「飞书技巧」/);
  assert.match(r.stderr, /st confirm series 飞书技巧/);
});

test("st new：账号、系列都确认了就照常建", () => {
  const p = readyProject();
  const r = st(p, "new", "飞书技巧", "周报");
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(p.dir, "04-作品/飞书技巧/01-周报/场景卡.md")));
  assert.doesNotMatch(readFileSync(join(p.dir, "kv.log"), "utf8"), /--unsettled/);
});

test("st new：确认后改过也拦（要重新确认）", () => {
  const p = readyProject();
  write(p.dir, "00-规划/账号定位.md", POSITIONING + "\n改了\n");
  const r = st(p, "new", "飞书技巧", "周报");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /确认后改过[\s\S]*账号定位\.md/);
});

test("st new 单篇：只看账号方向", () => {
  const p = project();
  fillAccount(p);
  assert.equal(st(p, "new", "单篇", "随笔").status, 1);
  st(p, "confirm", "account", "可以");
  const r = st(p, "new", "单篇", "随笔");
  assert.equal(r.status, 0, r.stderr);
});

test("st new --先不定：照样建，提醒后果，并让 kv 在 run.json 里记下", () => {
  const p = project();
  writeFileSync(join(p.dir, "00-规划/系列/系列.json"), JSON.stringify({ 飞书技巧: { label: "飞书", unit: "期" } }));
  const r = st(p, "new", "飞书技巧", "周报", "--先不定");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /⚠ .*先不定/);
  const kv = readFileSync(join(p.dir, "kv.log"), "utf8");
  assert.match(kv, /--fresh --unsettled .*账号方向/);
});

// ---- doctor ----

test("st doctor：账号方向、各系列没填完 / 没确认 / 确认后改过都报 ⚠", () => {
  const p = project();
  const lines = [];
  doctor({ cwd: p.dir, log: (l) => lines.push(l), home: mkdtempSync(join(tmpdir(), "st-home-")) });
  assert.match(lines.join("\n"), /⚠ 账号方向还没填完/);

  const q = readyProject();
  st(q, "series", "add", "第二个");
  const out = [];
  doctor({ cwd: q.dir, log: (l) => out.push(l), home: mkdtempSync(join(tmpdir(), "st-home-")) });
  const text = out.join("\n");
  assert.match(text, /✓ 账号方向已确认/);
  assert.match(text, /✓ 系列「飞书技巧」已确认/);
  assert.match(text, /⚠ 系列「第二个」还没填完/);
});
