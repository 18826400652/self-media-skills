import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(SKILL, "scripts", "draft.mjs");

/** 假的 pd / bd：把参数写进 calls.log，按 FAKE_PD_EXIT / FAKE_BD_EXIT 退出 */
function setup() {
  const dir = mkdtempSync(join(tmpdir(), "via-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  for (const name of ["pd", "bd"]) {
    const f = join(bin, name);
    writeFileSync(f, `#!/usr/bin/env bash\necho "${name} $*" >> "${dir}/calls.log"\nexit \${FAKE_${name.toUpperCase()}_EXIT:-0}\n`);
    chmodSync(f, 0o755);
  }
  mkdirSync(join(dir, "out"));
  writeFileSync(join(dir, "out", "01.png"), "x");
  writeFileSync(join(dir, "文案.md"), "## 标题\n测试\n## 正文\n正文\n");
  return { dir, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } };
}

const calls = (dir) => (existsSync(join(dir, "calls.log")) ? readFileSync(join(dir, "calls.log"), "utf8") : "");
const run = (args, env, extra = {}) => spawnSync("node", [SCRIPT, ...args], { env, encoding: "utf8", ...extra });

test("默认走浏览器：调用 bd run draft_xiaohongshu.py", () => {
  const { dir, env } = setup();
  const r = run([join(dir, "文案.md")], env);
  assert.equal(r.status, 0, r.stderr);
  assert.match(calls(dir), /^bd run .*draft_xiaohongshu\.py /);
});

test("--via browser 调用 bd run draft_xiaohongshu.py", () => {
  const { dir, env } = setup();
  const r = run([join(dir, "文案.md"), "--via", "browser"], env);
  assert.equal(r.status, 0, r.stderr);
  assert.match(calls(dir), /^bd run .*draft_xiaohongshu\.py /);
});

test("--via phone 报错，指向 vdraft --to xiaohongshu（小红书手机端发视频）", () => {
  const { dir, env } = setup();
  const r = run([join(dir, "文案.md"), "--via", "phone"], env);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /vdraft .*--to xiaohongshu/);
  assert.equal(calls(dir), "");
});

test("--via 的值不对就报错", () => {
  const { dir, env } = setup();
  const r = run([join(dir, "文案.md"), "--via", "usb"], env);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--via 只能是 browser 或 phone/);
});
