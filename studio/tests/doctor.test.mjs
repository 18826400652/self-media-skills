// st init / st doctor：新项目的配置和依赖检查（全流程检查报告 P-11、P-09、P-14）
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { doctor } from "../scripts/lib/doctor.mjs";
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
