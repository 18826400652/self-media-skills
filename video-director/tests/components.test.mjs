import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { REPO, ensureLock, fetchArchive, fitProblem, installComponent, latestSha, readLock, recordingProblem, writeLock } from "../scripts/lib/components.mjs";
import { project } from "./helpers.mjs";

const SHA = "a".repeat(40), SHA2 = "b".repeat(40);
const ok = (sha) => () => ({ status: 0, stdout: JSON.stringify({ sha }), stderr: "" });
const never = () => { throw new Error("不应联网"); };

/** 假仓库：registry 清单 + 组件源 + dykit 资源包 */
function fakeRepo() {
  return project({
    "registry/registry.json": { items: [{ name: "dykit" }, { name: "dy-scene-title" }, { name: "dy-scene-steps" }] },
    "registry/blocks/dykit/registry-item.json": { name: "dykit", files: [
      { path: "assets/dykit/dykit.css", url: "https://x/main/assets/dykit/dykit.css", target: "assets/dykit/dykit.css" },
      { path: "assets/dykit/theme.css", url: "https://x/main/assets/dykit/theme.css", target: "assets/dykit/theme.css" } ] },
    "registry/blocks/dy-scene-title/registry-item.json": { name: "dy-scene-title", registryDependencies: ["dykit"], files: [{ path: "dy-scene-title.html", target: "compositions/dy-scene-title.html" }] },
    "registry/blocks/dy-scene-title/dy-scene-title.html": "<html>title</html>",
    "assets/dykit/dykit.css": "/* css */", "assets/dykit/theme.css": "/* theme */",
  });
}

test("latestSha：解析 GitHub API 的 sha；失败给中文错误", () => {
  assert.equal(latestSha(ok(SHA)), SHA);
  assert.throws(() => latestSha(() => ({ status: 6, stdout: "", stderr: "Could not resolve host" })), /取不到 18826400652\/hyperframes 的最新提交号.*网络/);
  assert.throws(() => latestSha(() => ({ status: 0, stdout: "<html>", stderr: "" })), /取不到/);
});

test("ensureLock：没有锁文件时取最新但不写文件（下载安装成功后才写）；已有锁文件不联网；update 换成最新", () => {
  const dir = project({});
  assert.deepEqual(ensureLock(dir, {}, ok(SHA)), { sha: SHA, changed: true });
  assert.equal(readLock(dir), null);
  writeLock(dir, SHA);
  assert.deepEqual(readLock(dir), { repo: REPO, sha: SHA });
  assert.deepEqual(ensureLock(dir, {}, never), { sha: SHA, changed: false });
  assert.deepEqual(ensureLock(dir, { update: true }, ok(SHA2)), { sha: SHA2, changed: true });
  assert.equal(readLock(dir).sha, SHA);
});

test("readLock：锁文件不是 JSON 时报中文错误", () => {
  assert.throws(() => readLock(project({ "components.lock.json": "{bad" })), /components\.lock\.json.*删掉/);
});

test("fetchArchive：别的进程已经放好同一个 sha 时，用现成的，不删", () => {
  const cache = project({}), src = fakeRepo();
  const fake = (cmd, args) => {
    if (cmd === "curl") {
      // 下载期间另一个进程先完成了
      cpSync(src, join(cache, SHA), { recursive: true });
      writeFileSync(join(cache, SHA, "marker"), "other");
      return { status: 0, stdout: "", stderr: "", ...runTar(args[args.indexOf("-o") + 1], src) };
    }
    return realRun(cmd, args);
  };
  assert.equal(fetchArchive(SHA, cache, fake), join(cache, SHA));
  assert.ok(existsSync(join(cache, SHA, "marker")));
  assert.deepEqual(readdir(cache), [SHA]);
});

test("readLock：锁文件内容不对时报中文错误", () => {
  const dir = project({ "components.lock.json": { repo: REPO, sha: "main" } });
  assert.throws(() => readLock(dir), /components\.lock\.json.*提交号/);
});

test("fetchArchive：已缓存直接返回，不下载", () => {
  const cache = project({ [`${SHA}/registry/registry.json`]: "{}" });
  assert.equal(fetchArchive(SHA, cache, never), join(cache, SHA));
});

test("fetchArchive 下载失败不留半截缓存，报中文错误并给出地址", () => {
  const cache = project({});
  assert.throws(() => fetchArchive(SHA, cache, () => ({ status: 22, stdout: "", stderr: "404" })), /下载组件库失败.*codeload\.github\.com\/18826400652\/hyperframes\/tar\.gz\/a{40}/);
  assert.equal(existsSync(join(cache, SHA)), false);
});

test("fetchArchive：下载、解包到 <sha> 目录，临时文件清掉", () => {
  const cache = project({}), src = fakeRepo();
  // 假 curl：把假仓库打成 tar.gz（带一层顶级目录，和 codeload 一样）
  const fake = (cmd, args) => {
    if (cmd === "curl") {
      const out = args[args.indexOf("-o") + 1];
      return { status: 0, stdout: "", stderr: "", ...runTar(out, src) };
    }
    return realRun(cmd, args);
  };
  const dest = fetchArchive(SHA, cache, fake);
  assert.equal(dest, join(cache, SHA));
  assert.ok(existsSync(join(dest, "registry/registry.json")));
  assert.deepEqual(readdir(cache), [SHA]);
});

test("installComponent：复制组件和 dykit 资源包（资源从仓库路径取，不看 url）", () => {
  const repo = fakeRepo(), proj = project({});
  const files = installComponent(repo, "dy-scene-title", proj);
  assert.deepEqual(files.sort(), ["assets/dykit/dykit.css", "assets/dykit/theme.css", "compositions/dy-scene-title.html"]);
  assert.equal(readFileSync(join(proj, "compositions/dy-scene-title.html"), "utf8"), "<html>title</html>");
});

test("installComponent 组件不存在：报错并列出相近的组件名", () => {
  assert.throws(() => installComponent(fakeRepo(), "dy-scene-titel", project({})), /组件库里没有 dy-scene-titel.*dy-scene-title/);
});

test("installComponent：缓存的仓库里缺文件时报错，不装空文件", () => {
  const repo = fakeRepo();
  writeFileSync(join(repo, "registry/blocks/dy-scene-title/registry-item.json"), JSON.stringify({ name: "dy-scene-title", files: [{ path: "nope.html", target: "compositions/nope.html" }] }));
  assert.throws(() => installComponent(repo, "dy-scene-title", project({})), /组件 dy-scene-title 缺文件 nope\.html/);
});

// ---- 测试用小工具 ----
const readdir = (d) => readdirSync(d).sort();
const realRun = (cmd, args) => { const r = spawnSync(cmd, args, { encoding: "utf8" }); return { status: r.status, stdout: r.stdout, stderr: r.stderr }; };
function runTar(out, src) {
  const stage = mkdtempSync(join(tmpdir(), "vd-tar-"));
  cpSync(src, join(stage, "hyperframes-xyz"), { recursive: true });
  const r = spawnSync("tar", ["-czf", out, "-C", stage, "hyperframes-xyz"], { encoding: "utf8" });
  return { status: r.status, stderr: r.stderr };
}

test("installComponent：目标路径跑出工程目录时报错", () => {
  const repo = fakeRepo();
  writeFileSync(join(repo, "registry/blocks/dy-scene-title/registry-item.json"), JSON.stringify({ name: "dy-scene-title", files: [{ path: "dy-scene-title.html", target: "../escape.html" }] }));
  assert.throws(() => installComponent(repo, "dy-scene-title", project({})), /目标路径不在工程里/);
});

test("fitProblem：组件时间写死、段比组件建议时长长 2 秒以上 → 说明撑不满", () => {
  const msg = fitProblem({ name: "dy-checklist", html: "tl.to('#ck', { opacity: 0 }, 5.1);", minDuration: 4.3, segId: "seg-02", segDuration: 17.8 });
  assert.match(msg, /seg-02/);
  assert.match(msg, /dy-checklist/);
  assert.match(msg, /4\.3/);
  assert.match(msg, /17\.8/);
});

test("fitProblem：段长在组件建议时长 + 2 秒以内 → 不报", () => {
  assert.equal(fitProblem({ name: "dy-checklist", html: "", minDuration: 4.3, segId: "s", segDuration: 6.2 }), null);
});

test("fitProblem：组件按宿主时长（HF.duration）撑满 → 段再长也不报", () => {
  assert.equal(fitProblem({ name: "dy-scene-title", html: "const D = HF.duration(root, 4);", minDuration: 4, segId: "s", segDuration: 30 }), null);
});

const HOLDS = '["data-duration", String(D)]';

test("recordingProblem：录屏比段短 → 提醒后面停在最后一帧，说出两边秒数", () => {
  const msg = recordingProblem({ segId: "seg-03", src: "assets/rec/a.mp4", recLen: 8, segDuration: 15.2, html: HOLDS });
  assert.match(msg, /seg-03/);
  assert.match(msg, /assets\/rec\/a\.mp4/);
  assert.match(msg, /8\.0 秒/);
  assert.match(msg, /15\.2 秒/);
  assert.match(msg, /最后一帧/);
});

test("recordingProblem：录屏和段差不到 0.5 秒、或更长 → 不报", () => {
  assert.equal(recordingProblem({ segId: "s", src: "a.mp4", recLen: 14.8, segDuration: 15.2, html: HOLDS }), null);
  assert.equal(recordingProblem({ segId: "s", src: "a.mp4", recLen: 30, segDuration: 15.2, html: HOLDS }), null);
});

test("recordingProblem：组件是旧版（放完不停住）→ 说后面是空的，让换新版组件", () => {
  const msg = recordingProblem({ segId: "s", src: "a.mp4", recLen: 8, segDuration: 15, html: '["data-start", String(start)]' });
  assert.match(msg, /空/);
  assert.match(msg, /--update-components/);
});

test("recordingProblem：读不到录屏时长 → 说找不到或读不了", () => {
  assert.match(recordingProblem({ segId: "s", src: "nope.mp4", recLen: 0, segDuration: 15, html: HOLDS }), /nope\.mp4 读不到时长/);
});

test("catalogText：每个组件一段：名字、用途、适合、最短时长、节拍、变量（默认值）；关键词按名字、用途、适合筛", async () => {
  const { catalogText } = await import("../scripts/lib/components.mjs");
  const catalog = { components: [
    { id: "dy-checklist", kind: "overlay", purpose: "打勾清单", suitableFor: "列步骤、要点", minDuration: 4, beats: ["每一项出现"], variables: [{ id: "title", label: "标题", default: "记住这 3 点" }, { id: "items", label: "要点(| 分隔)", default: "a|b" }] },
    { id: "dy-vs-compare", kind: "overlay", purpose: "左右对比表", suitableFor: "两种做法对比", minDuration: 5, variables: [] },
  ] };
  const all = catalogText(catalog);
  assert.match(all, /^dy-checklist（overlay）：打勾清单/m);
  assert.match(all, /适合：列步骤、要点；至少 4 秒；节拍：每一项出现/);
  assert.match(all, /title 标题 = "记住这 3 点"/);
  assert.match(all, /^dy-vs-compare/m);
  const found = catalogText(catalog, "对比");
  assert.doesNotMatch(found, /dy-checklist/);
  assert.match(found, /dy-vs-compare/);
  assert.match(catalogText(catalog, "没有的词"), /没有和「没有的词」相关的组件/);
});
