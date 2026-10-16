import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { COMMANDS, candidatesText, installAll, main, runHyperframes } from "../scripts/vd.mjs";
import { project } from "./helpers.mjs";

test("vd cues：DIRECTOR.md 有错时全部列出并返回 1，不写 cues.js", async () => {
  const dir = project({
    "video-director.config.json": { fontsDir: "/f", gsap: "/g.js", brandDir: "b", sfxDir: "/s", hfVersion: "0.8.143" },
    "ep/DIRECTOR.md": "# 导演脚本\n没有机器块",
    "ep/audio_meta.json": { voices: [{ frame: 1, duration_s: 1, words: [{ text: "你好", start: 0, end: 1 }] }] },
  });
  const errs = [];
  const orig = console.error;
  console.error = (m) => errs.push(m);
  try { assert.equal(await main(["cues", `${dir}/ep`]), 1); } finally { console.error = orig; }
  assert.match(errs.join("\n"), /缺少 ```json vd 机器块/);
  assert.match(errs.join("\n"), /缺少章节「## 1. 视觉方案」/);
});

test("vd：没有子命令打印用法并返回 2", async () => {
  assert.equal(await main([]), 2);
});

test("main：不认识的子命令原样透传给 hyperframes，返回它的退出码", async () => {
  const seen = [];
  const code = await main(["lint", "抖音", "--json"], { passthrough: (args) => (seen.push(args), 7) });
  assert.equal(code, 7);
  assert.deepEqual(seen, [["lint", "抖音", "--json"]]);
});

test("main：init 建工程；目录不空时退出码 1", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vd-main-"));
  writeFileSync(join(dir, "x"), "");
  assert.equal(await main(["init", dir]), 1);
});

test("vd build：工程里没有 caption_groups.json → 报错，提示先跑 vo", async () => {
  const dir = project({ "video-director.config.json": { brandDir: "b", sfxDir: "s" }, "抖音/DIRECTOR.md": "x", "抖音/audio_meta.json": { voices: [] } });
  const err = [];
  const orig = console.error;
  console.error = (m) => err.push(m);
  try {
    assert.equal(await main(["build", join(dir, "抖音")]), 1);
  } finally {
    console.error = orig;
  }
  assert.match(err.join("\n"), /没有 caption_groups\.json.*先跑 vo/);
});

test("installAll：没有组件段时不联网、不建锁文件", () => {
  const never = () => { throw new Error("不应调用"); };
  assert.deepEqual(installAll(project({}), { segments: [{ id: "a" }] }, {}, { ensureLock: never, fetchArchive: never, installComponent: never, writeLock: never }), []);
});

test("installAll：每个组件只装一次，用锁定的提交号；只装要构建的段", () => {
  const calls = [];
  const deps = {
    ensureLock: (_d, opts) => { calls.push(["lock", opts.update]); return { sha: "c".repeat(40), changed: true }; },
    writeLock: (_d, sha) => calls.push(["write", sha]),
    fetchArchive: (sha) => { calls.push(["fetch", sha]); return "/repo"; },
    installComponent: (_r, name) => { calls.push(["install", name]); return [`compositions/${name}.html`, "assets/dykit/dykit.css"]; },
  };
  const segs = [{ id: "a", component: "dy-scene-steps" }, { id: "b" }, { id: "c", component: "dy-scene-steps" }, { id: "d", component: "dy-vs-compare" }];
  const files = installAll(project({}), { segments: segs }, { update: true, only: ["a", "b", "c"] }, deps);
  assert.deepEqual(files, ["compositions/dy-scene-steps.html", "assets/dykit/dykit.css"]);
  assert.deepEqual(calls, [["lock", true], ["fetch", "c".repeat(40)], ["install", "dy-scene-steps"], ["write", "c".repeat(40)]]);
});

test("candidatesText：列出组件候选；没有时写「无」", () => {
  assert.equal(candidatesText([]), "◇ 组件候选：无");
  assert.equal(candidatesText([{ scene: "文件被盖红章", name: "dy-stamp", vars: "text", from: "seg-01-hook" }]), "◇ 组件候选 1 个（交成片时请用户决定要不要提交到 hyperframes）：\n  - dy-stamp：文件被盖红章（来自 seg-01-hook）");
});

test("installAll：升级后下载失败，锁文件不变（旧缓存还能用）", () => {
  const writes = [];
  const deps = {
    ensureLock: () => ({ sha: "d".repeat(40), changed: true }),
    fetchArchive: () => { throw new Error("下载组件库失败"); },
    installComponent: () => [],
    writeLock: (_d, sha) => writes.push(sha),
  };
  assert.throws(() => installAll(project({}), { segments: [{ id: "a", component: "dy-x" }] }, { update: true }, deps), /下载组件库失败/);
  assert.deepEqual(writes, []);
});

test("vd cues --check：DIRECTOR.md 有错返回 1，且不写 cues.js", async () => {
  const { existsSync } = await import("node:fs");
  const dir = project({
    "video-director.config.json": { fontsDir: "/f", gsap: "/g.js", brandDir: "b", sfxDir: "/s", hfVersion: "0.8.143" },
    "ep/DIRECTOR.md": "# 导演脚本\n没有机器块",
    "ep/audio_meta.json": { voices: [{ frame: 1, duration_s: 1, words: [{ text: "你好", start: 0, end: 1 }] }] },
  });
  const orig = console.error;
  console.error = () => {};
  try { assert.equal(await main(["cues", `${dir}/ep`, "--check"]), 1); } finally { console.error = orig; }
  assert.equal(existsSync(`${dir}/ep/cues.js`), false);
});

const SECTIONS = ["## 1. 视觉方案", "## 2. 分段", "## 3. 导演规则自检", "## 4. 音乐", "## 5. 账号固定元素", "## 6. 新增内容", "## 7. 样片范围", "## 8. 组件候选"];
const okVd = {
  kicker: "栏目 · 第 1 期",
  palette: { bg: "#F1ECE2", ink: "#1C1A17", muted: "#6E675C", accent: "#FFD84D", alert: "#D2372A" },
  segments: [{ id: "seg-01", lines: [1, 1] }],
  sfx: [], music: null,
  ending: { next: "下一期", question: "问题", cta: "评论区说说 ↓", hold: 2 },
  sample: { segments: ["seg-01"], end: "@你好", tail: 0.5 },
};
const okDirector = ["# 导演脚本", ...SECTIONS.flatMap((x) => [x, "说到 @你好 时出现。"]), "```json vd", JSON.stringify(okVd), "```"].join("\n\n");

test("vd cues --check：段里用了 at(\"词\")，DIRECTOR.md 却没有这个 @词 → 返回 1，指出文件和词", async () => {
  const dir = project({
    "ep/DIRECTOR.md": okDirector,
    "ep/audio_meta.json": { voices: [{ frame: 1, duration_s: 1, words: [{ text: "你好世界", start: 0, end: 1 }] }] },
    "ep/compositions/frames/seg-01.html": `<script>tl.to(a, {}, at("你好")); tl.to(b, {}, at('世界'));</script>`,
  });
  const errs = [];
  const orig = console.error;
  console.error = (m) => errs.push(m);
  try { assert.equal(await main(["cues", `${dir}/ep`, "--check"]), 1); } finally { console.error = orig; }
  assert.match(errs.join("\n"), /seg-01\.html.*at\("世界"\)/);
  assert.doesNotMatch(errs.join("\n"), /at\("你好"\)/);
});

test("vd cues --check：段里的 at() 都在 DIRECTOR.md 里 → 通过", async () => {
  const dir = project({
    "ep/DIRECTOR.md": okDirector,
    "ep/audio_meta.json": { voices: [{ frame: 1, duration_s: 1, words: [{ text: "你好世界", start: 0, end: 1 }] }] },
    "ep/compositions/frames/seg-01.html": `<script>tl.to(a, {}, at("你好"));</script>`,
  });
  const orig = console.log;
  console.log = () => {};
  try { assert.equal(await main(["cues", `${dir}/ep`, "--check"]), 0); } finally { console.log = orig; }
});

test("vd qa：找不到 Chrome 时先报错退出，不读工程、不装依赖", async () => {
  const { existsSync } = await import("node:fs");
  const dir = project({ "ep/x": "" });
  const old = process.env.CHROME_PATH;
  process.env.CHROME_PATH = "/nope/chrome";
  const errs = [];
  const orig = console.error;
  console.error = (m) => errs.push(m);
  try { assert.equal(await main(["qa", `${dir}/ep`]), 1); } finally {
    console.error = orig;
    if (old === undefined) delete process.env.CHROME_PATH; else process.env.CHROME_PATH = old;
  }
  assert.match(errs.join("\n"), /找不到 Chrome/);
  assert.equal(existsSync(`${dir}/ep/node_modules`), false);
});

test("installAll：组件撑不满它的段时报错，列出每一段", () => {
  const deps = {
    ensureLock: () => ({ sha: "c".repeat(40), changed: false }),
    writeLock: () => {},
    fetchArchive: () => "/repo",
    installComponent: (_r, name) => [`compositions/${name}.html`],
    componentInfo: () => ({ html: "tl.to('#x', { opacity: 0 }, 5);", minDuration: 4.3 }),
  };
  const segs = [{ id: "seg-02", component: "dy-checklist", duration: 17.8 }, { id: "seg-05", component: "dy-checklist", duration: 5 }];
  assert.throws(() => installAll(project({}), { segments: segs }, {}, deps), (err) => /seg-02/.test(err.message) && !/seg-05/.test(err.message));
});

test("installAll：dy-rec-phone 的录屏比段短 → 打 ⚠，不中断构建", () => {
  const deps = {
    ensureLock: () => ({ sha: "c".repeat(40), changed: false }),
    writeLock: () => {},
    fetchArchive: () => "/repo",
    installComponent: (_r, name) => [`compositions/${name}.html`],
    componentInfo: () => ({ html: "const D = HF.duration(root, 8); [\"data-duration\", String(D)]", minDuration: 5 }),
    probeLen: (p) => (p.endsWith("rec/a.mp4") ? 8 : 20),
  };
  const segs = [
    { id: "seg-03", component: "dy-rec-phone", duration: 15, vars: { src: "rec/a.mp4" } },
    { id: "seg-04", component: "dy-rec-phone", duration: 15, vars: { src: "rec/b.mp4" } },
  ];
  const warns = [];
  const orig = console.warn;
  console.warn = (m) => warns.push(m);
  try { installAll(project({}), { segments: segs }, {}, deps); } finally { console.warn = orig; }
  assert.equal(warns.length, 1);
  assert.match(warns[0], /⚠ seg-03/);
});

test("透传：hyperframes 没装时打印安装提示并返回 1，不是静默退出", async () => {
  const errs = [];
  const orig = console.error;
  console.error = (m) => errs.push(m);
  try {
    const missing = () => { throw new Error("video-director 还没装 hyperframes：cd /x && npm ci（或 st install --deps）"); };
    const code = await main(["lint", "抖音"], { passthrough: (args) => runHyperframes(args, { requireBin: missing }) });
    assert.equal(code, 1);
  } finally { console.error = orig; }
  assert.match(errs.join("\n"), /还没装 hyperframes.*npm ci/);
});

test("vd check：没装 hyperframes → 报安装办法，先于读工程（空目录也一样）", () => {
  const dir = mkdtempSync(join(tmpdir(), "vd-check-"));
  const noHf = () => { throw new Error("video-director 还没装 hyperframes：cd /x && npm ci（或 st install --deps）"); };
  assert.throws(() => COMMANDS.check(dir, [], {}, { requireBin: noHf }), /还没装 hyperframes.*npm ci/);
});

test("vd components：按工程锁定的版本读组件目录，带关键词只列相关的", async () => {
  const repo = project({ "catalog/catalog.json": { components: [{ id: "dy-checklist", purpose: "打勾清单" }, { id: "dy-vs-compare", purpose: "左右对比" }] } });
  const dir = project({ "ep/x": "" });
  const logs = [];
  const orig = console.log;
  console.log = (m) => logs.push(m);
  try {
    await COMMANDS.components(`${dir}/ep`, ["对比"], { ensureLock: () => ({ sha: "a".repeat(40) }), fetchArchive: () => repo });
  } finally { console.log = orig; }
  assert.match(logs.join("\n"), /@aaaaaaa/);
  assert.match(logs.join("\n"), /dy-vs-compare/);
  assert.doesNotMatch(logs.join("\n"), /dy-checklist/);
});
