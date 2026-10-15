import assert from "node:assert/strict";
import { test } from "node:test";
import { candidatesText, installAll, main } from "../scripts/vd.mjs";
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

test("vd：未知子命令打印用法并返回 2", async () => {
  assert.equal(await main(["nope", "x"]), 2);
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
