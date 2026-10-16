import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const SKILL = new URL("..", import.meta.url).pathname;
const SCRIPT_MD = "## 一 (Frame 1)\n\n    第一句。\n";

test("bin/vo 放在中文和空格路径下也能跑，--check 不花钱", () => {
  const tool = join(mkdtempSync(join(tmpdir(), "vo-")), "工具 copy");
  cpSync(SKILL, tool, { recursive: true, filter: (p) => !p.includes(".venv") });
  const work = join(mkdtempSync(join(tmpdir(), "vo-")), "04-作品 a", "抖音");
  mkdirSync(work, { recursive: true });
  writeFileSync(join(work, "SCRIPT.md"), SCRIPT_MD);
  const r = spawnSync(join(tool, "bin/vo"), [work, "--check"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /没有可用的 VOICE\.md，会逐帧配音/);
});

test("缺参数：用法写 vo", () => {
  const r = spawnSync(join(SKILL, "bin/vo"), [], { encoding: "utf8" });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /用法：vo <工程目录>/);
});

test("vo --help / -h：打印用法，退出 0", () => {
  for (const flag of ["--help", "-h"]) {
    const r = spawnSync(join(SKILL, "bin/vo"), [flag], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /用法：vo <工程目录>/);
  }
});

test("工程目录写成了 --开头的选项：打印用法，不去找 --xxx/SCRIPT.md", () => {
  const r = spawnSync(join(SKILL, "bin/vo"), ["--voice", "x"], { encoding: "utf8" });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /用法：vo <工程目录>/);
  assert.doesNotMatch(r.stderr, /SCRIPT\.md/);
});

/** 一个带 SCRIPT.md 的作品目录；withStudio 时根目录放 studio.json */
function workDir(withStudio) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "vo-")));
  if (withStudio) writeFileSync(join(root, "studio.json"), "{}");
  const work = join(root, "04-作品", "抖音");
  mkdirSync(work, { recursive: true });
  writeFileSync(join(work, "SCRIPT.md"), SCRIPT_MD);
  return { root, work };
}

test("作品项目（有 studio.json）里没有 voiceover.config.json：拒绝，不合成、不建 assets/voice", () => {
  const { root, work } = workDir(true);
  const r = spawnSync(join(SKILL, "bin/vo"), [work], { encoding: "utf8" });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, new RegExp(`这是作品项目（找到 ${join(root, "studio.json")}），但没有 voiceover\\.config\\.json`));
  assert.match(r.stderr, /旧配音配置里的 tts/);
  assert.equal(existsSync(join(work, "assets", "voice")), false);
});

test("作品项目里没有 voiceover.config.json 时 --check 照常能用", () => {
  const { work } = workDir(true);
  const r = spawnSync(join(SKILL, "bin/vo"), [work, "--check"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
});

test("--help 写在工程目录后面也打印用法、退出 0（不报「参数错误」）", () => {
  for (const flag of ["--help", "-h"]) {
    const r = spawnSync(join(SKILL, "bin/vo"), ["某个工程", flag], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /用法：vo <工程目录>/);
    assert.doesNotMatch(r.stderr, /参数错误/);
  }
});

test("bin/vo 给 Node 打开代理支持（NODE_USE_ENV_PROXY=1），本机走代理时 fetch 才连得上", () => {
  const work = mkdtempSync(join(tmpdir(), "vo-"));
  writeFileSync(join(work, "SCRIPT.md"), SCRIPT_MD);
  const probe = join(work, "probe.mjs");
  writeFileSync(probe, "console.log('PROXY=' + process.env.NODE_USE_ENV_PROXY)\n");
  const r = spawnSync("bash", ["-c", `sed 's#"$SKILL_DIR/scripts/vo.mjs"#"${probe}"#' "${join(SKILL, "bin/vo")}" > "${work}/vo" && bash "${work}/vo"`], { encoding: "utf8", env: { ...process.env, NODE_USE_ENV_PROXY: "" } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /PROXY=1/);
});
