// st init / st doctor：新项目的配置和依赖检查（全流程检查报告 P-11、P-09、P-14）
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkDeps, doctor } from "../scripts/lib/doctor.mjs";
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
  assert.match(out.text(), /✗ narrated-video\.config\.json 的 tts\.style 还是模板占位/);
  assert.match(out.text(), /✗ wechat-article\.config\.json 的 account 还是模板占位/);
});

test("st doctor：占位字段填了真实值、或字段不存在 → 不报", () => {
  const home = fakeHome({ withSfx: true });
  const dir = join(tmp("st-init-"), "proj");
  initProject({ dir, home, account: "小号", audience: "新手" }, quiet);
  setJson(dir, "narrated-video.config.json", (c) => ({ tts: { ...c.tts, style: "中年男性，像跟朋友聊天" } }));
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
