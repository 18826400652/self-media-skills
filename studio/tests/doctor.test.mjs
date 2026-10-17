// st init / st doctor：新项目的配置和依赖检查（全流程检查报告 P-11、P-09、P-14）
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkDeps, checkShared, doctor } from "../scripts/lib/doctor.mjs";
import { initProject } from "../scripts/lib/init.mjs";

const tmp = (p) => mkdtempSync(join(tmpdir(), p));
const quiet = () => {};
const capture = () => {
  const lines = [];
  return { log: (l) => lines.push(l), text: () => lines.join("\n") };
};
const vdConfig = (dir) => JSON.parse(readFileSync(join(dir, "video-director.config.json"), "utf8"));

/** 假的 HOME：withSfx 时带 media-use 的音效库 */
function fakeHome({ withSfx }) {
  const home = tmp("st-home-");
  if (withSfx) {
    const sfx = join(home, ".claude/skills/media-use/audio/assets/sfx");
    mkdirSync(sfx, { recursive: true });
    writeFileSync(join(sfx, "pop.mp3"), "x");
  }
  return home;
}

test("st init：找得到 media-use 的音效库，sfxDir 就指向它", () => {
  const home = fakeHome({ withSfx: true });
  const dir = join(tmp("st-init-"), "proj");
  initProject({ dir, home }, quiet);
  assert.equal(vdConfig(dir).sfxDir, join(home, ".claude/skills/media-use/audio/assets/sfx"));
});

test("st init：没有 media-use 音效库，sfxDir 留在项目里；doctor 报音效目录是空的", () => {
  const home = fakeHome({ withSfx: false });
  const dir = join(tmp("st-init-"), "proj");
  initProject({ dir, home }, quiet);
  assert.equal(vdConfig(dir).sfxDir, "06-品牌资产/音效");
  const out = capture();
  doctor({ cwd: dir, log: out.log, home });
  assert.match(out.text(), /✗ .*sfxDir.*音效目录是空的/);
});

test("st doctor：sfxDir 里有音频文件就不报", () => {
  const home = fakeHome({ withSfx: false });
  const dir = join(tmp("st-init-"), "proj");
  initProject({ dir, home }, quiet);
  writeFileSync(join(dir, "06-品牌资产/音效/click.wav"), "x");
  const out = capture();
  doctor({ cwd: dir, log: out.log, home });
  assert.doesNotMatch(out.text(), /音效目录是空的/);
});

const setJson = (dir, file, patch) => {
  const p = join(dir, file);
  writeFileSync(p, JSON.stringify({ ...JSON.parse(readFileSync(p, "utf8")), ...patch(JSON.parse(readFileSync(p, "utf8"))) }));
};

test("st doctor：配置里还是模板占位（括号说明）→ 进成品的字段报 ✗", () => {
  const home = fakeHome({ withSfx: true });
  const dir = join(tmp("st-init-"), "proj");
  initProject({ dir, home }, quiet);
  const out = capture();
  doctor({ cwd: dir, log: out.log, home });
  assert.match(out.text(), /✗ voiceover\.config\.json 的 tts\.style 还是模板占位/);
});

test("st init：账号名、观众、领取方式只在 studio.json 一处；其他配置不再重复这些字段（knowledge-video 的死字段也删了）", () => {
  const home = fakeHome({ withSfx: true });
  const dir = join(tmp("st-init-"), "proj");
  initProject({ dir, home, account: "小林", audience: "上班族", lead: "公众号回复「待办」领" }, quiet);
  const studio = JSON.parse(readFileSync(join(dir, "studio.json"), "utf8"));
  assert.deepEqual([studio.account, studio.audience, studio.lead], ["小林", "上班族", "公众号回复「待办」领"]);
  const cfg = (f) => JSON.parse(readFileSync(join(dir, f), "utf8"));
  assert.equal("account" in cfg("wechat-article.config.json"), false);
  assert.equal("footer" in cfg("image-cards.config.json"), false);
  assert.equal("audience" in cfg("knowledge-video.config.json"), false);
  assert.equal("series" in cfg("knowledge-video.config.json"), false);
  assert.match(readFileSync(join(dir, "CLAUDE.md"), "utf8"), /studio\.json/);
});

test("st doctor：studio.json 没写账号名、观众、领取方式 → 账号方向没填完的 ⚠ 里列出来", () => {
  const home = fakeHome({ withSfx: true });
  const dir = join(tmp("st-init-"), "proj");
  initProject({ dir, home }, quiet);
  const out = capture();
  doctor({ cwd: dir, log: out.log, home });
  assert.match(out.text(), /⚠ 账号方向还没填完/);
  for (const k of ["account", "audience", "lead"]) assert.match(out.text(), new RegExp(`studio\\.json 的 ${k} 没填`));
});

test("st doctor：占位字段填了真实值、或字段不存在 → 不报", () => {
  const home = fakeHome({ withSfx: true });
  const dir = join(tmp("st-init-"), "proj");
  initProject({ dir, home, account: "小号", audience: "新手" }, quiet);
  setJson(dir, "voiceover.config.json", (c) => ({ tts: { ...c.tts, style: "中年男性，像跟朋友聊天" } }));
  writeFileSync(join(dir, "wechat-article.config.json"), JSON.stringify({ theme: "grace" }));
  const out = capture();
  doctor({ cwd: dir, log: out.log, home });
  assert.doesNotMatch(out.text(), /还是模板占位/);
});

/** 假工具包：node 技能装了 x 没装 y；py 技能的假 python 导入 uiautomator2 会失败 */
function fakeToolkit() {
  const tk = tmp("st-tk-");
  mkdirSync(join(tk, "node-skill/node_modules/x"), { recursive: true });
  writeFileSync(join(tk, "node-skill/SKILL.md"), "x");
  writeFileSync(join(tk, "node-skill/package.json"), JSON.stringify({ dependencies: { x: "1" }, devDependencies: { y: "1" } }));
  writeFileSync(join(tk, "node-skill/node_modules/x/package.json"), "{}");
  mkdirSync(join(tk, "py-skill/.venv/bin"), { recursive: true });
  writeFileSync(join(tk, "py-skill/SKILL.md"), "x");
  writeFileSync(join(tk, "py-skill/requirements.txt"), "uiautomator2==3.*\nwebsocket-client==1.*\n");
  writeFileSync(join(tk, "py-skill/.venv/bin/python"), '#!/bin/sh\ncase "$*" in *uiautomator2*) exit 1;; esac\nexit 0\n', { mode: 0o755 });
  return tk;
}
const recorder = () => {
  const r = { fails: [], oks: [] };
  return { r, out: { ok: (m) => r.oks.push(m), warn: () => {}, fail: (m) => r.fails.push(m) } };
};

test("checkDeps：node_modules 里缺哪个包、.venv 里导入不了哪个模块，逐个报出来", () => {
  const { r, out } = recorder();
  checkDeps(out, fakeToolkit());
  assert.ok(r.fails.some((m) => /^node-skill 缺 Node 依赖：y（/.test(m)), r.fails.join("\n"));
  assert.ok(r.fails.some((m) => /^py-skill 缺 Python 依赖：uiautomator2（/.test(m)), r.fails.join("\n"));
});

test("checkDeps：都装齐时打印一行 ✓ 汇总", () => {
  const tk = fakeToolkit();
  mkdirSync(join(tk, "node-skill/node_modules/y"), { recursive: true });
  writeFileSync(join(tk, "node-skill/node_modules/y/package.json"), "{}");
  writeFileSync(join(tk, "py-skill/.venv/bin/python"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const { r, out } = recorder();
  checkDeps(out, tk);
  assert.ok(!r.fails.some((m) => /skill/.test(m)), r.fails.join("\n"));
  assert.ok(r.oks.some((m) => /依赖都装好了/.test(m)), r.oks.join("\n"));
});

test("st doctor：参考音色不存在时，指向怎么准备的文档", () => {
  const home = fakeHome({ withSfx: true });
  const dir = join(tmp("st-init-"), "proj");
  initProject({ dir, home }, quiet);
  const out = capture();
  doctor({ cwd: dir, log: out.log, home });
  assert.match(out.text(), /✗ voiceover\.config\.json 里的路径不存在：tts\.reference=.*voiceover\/references\/setup\.md「参考音色」/);
});

test("checkShared：拷贝和正本不一致 → ✗，提示改正本后跑 st sync-shared；一致 → ✓", () => {
  const tk = mkdtempSync(join(tmpdir(), "st-doc-shared-"));
  mkdirSync(join(tk, "shared/node"), { recursive: true });
  mkdirSync(join(tk, "a/lib"), { recursive: true });
  writeFileSync(join(tk, "shared/manifest.json"), JSON.stringify({ "node/x.mjs": ["a/lib/x.mjs"] }));
  writeFileSync(join(tk, "shared/node/x.mjs"), "export const x = 1;\n");
  writeFileSync(join(tk, "a/lib/x.mjs"), "被手改了\n");
  const lines = [];
  const out = { ok: (m) => lines.push(`✓ ${m}`), warn: (m) => lines.push(`⚠ ${m}`), fail: (m) => lines.push(`✗ ${m}`) };
  checkShared(out, tk);
  assert.match(lines.join("\n"), /✗ .*a\/lib\/x\.mjs.*改正本后跑 st sync-shared/);
});

test("checkShared：没有 shared/（studio 单独拷走）→ ⚠ 跳过，不算要修，不报原始 ENOENT", () => {
  const tk = mkdtempSync(join(tmpdir(), "st-doc-noshared-"));
  const lines = [];
  const out = { ok: (m) => lines.push(`✓ ${m}`), warn: (m) => lines.push(`⚠ ${m}`), fail: (m) => lines.push(`✗ ${m}`) };
  checkShared(out, tk);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^⚠ .*没有 shared\/.*跳过/);
  assert.doesNotMatch(lines[0], /ENOENT/);
});
