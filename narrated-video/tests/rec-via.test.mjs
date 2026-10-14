import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(SKILL, "scripts", "rec.mjs");

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "rec-via-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  for (const name of ["pd", "browser-harness"]) {
    const f = join(bin, name);
    writeFileSync(f, `#!/usr/bin/env bash\necho "${name} $*" >> "${dir}/calls.log"\nexit \${FAKE_PD_EXIT:-0}\n`);
    chmodSync(f, 0o755);
  }
  writeFileSync(join(dir, "提问.txt"), "帮我写一条消息\n");
  return { dir, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } };
}

const calls = (dir) => (existsSync(join(dir, "calls.log")) ? readFileSync(join(dir, "calls.log"), "utf8") : "");
const run = (args, env) => spawnSync("node", [SCRIPT, ...args], { env, encoding: "utf8" });

test("--app 走手机：调用 pd rec，参数原样传", () => {
  const { dir, env } = setup();
  const r = run([join(dir, "rec.mp4"), "--prompt", join(dir, "提问.txt"), "--app", "deepseek", "--think"], env);
  assert.equal(r.status, 0, r.stderr);
  assert.match(calls(dir), new RegExp(`^pd rec deepseek ${join(dir, "提问.txt")} ${join(dir, "rec.mp4")} --think\\n$`));
});

test("手机不可用：报错并提示 --url，不自动走浏览器", () => {
  const { dir, env } = setup();
  const r = run([join(dir, "rec.mp4"), "--prompt", join(dir, "提问.txt"), "--app", "doubao"], { ...env, FAKE_PD_EXIT: "3" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--url/);
  assert.doesNotMatch(calls(dir), /browser-harness/);
});

test("既没有 --app 也没有 --url / --via browser：报错并列出两种写法", () => {
  const { dir, env } = setup();
  const r = run([join(dir, "rec.mp4"), "--prompt", join(dir, "提问.txt")], env);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--app deepseek\|doubao/);
  assert.match(r.stderr, /--url/);
  assert.equal(calls(dir), "");
});

test("--app 和 --url 同时给：报错", () => {
  const { dir, env } = setup();
  const r = run([join(dir, "rec.mp4"), "--prompt", join(dir, "提问.txt"), "--app", "deepseek", "--url", "https://x"], env);
  assert.equal(r.status, 1);
  assert.equal(calls(dir), "");
  assert.match(r.stderr, /只能选一种/);
});
