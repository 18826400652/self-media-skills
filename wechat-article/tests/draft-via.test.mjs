import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(SKILL, "scripts", "wa.mjs");

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
  writeFileSync(join(dir, "文章.md"), "---\ntitle: 测试文章\n---\n\n正文一段。\n");
  writeFileSync(join(dir, "wechat-article.config.json"), JSON.stringify({ theme: "grace", account: "测试号" }));
  return { dir, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } };
}

const calls = (dir) => (existsSync(join(dir, "calls.log")) ? readFileSync(join(dir, "calls.log"), "utf8") : "");
const run = (args, env, extra = {}) => spawnSync("node", [SCRIPT, ...args], { env, encoding: "utf8", ...extra });

test("默认走浏览器：调用 bd run draft_wechat.py", () => {
  const { dir, env } = setup();
  const r = run(["draft", join(dir, "文章.md")], env);
  assert.equal(r.status, 0, r.stderr);
  assert.match(calls(dir), /^bd run .*draft_wechat\.py /);
});

test("--via phone 调用 pd run phone_wechat.py", () => {
  const { dir, env } = setup();
  const r = run([...["draft", join(dir, "文章.md")], "--via", "phone"], env);
  assert.equal(r.status, 0, r.stderr);
  assert.match(calls(dir), /^pd run .*phone_wechat\.py /);
});

test("手机不可用时报错，不回落到浏览器", () => {
  const { dir, env } = setup();
  const r = run(["draft", join(dir, "文章.md"), "--via", "phone"], { ...env, FAKE_PD_EXIT: "3" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /手机不可用/);
  assert.match(r.stderr, /去掉 --via phone 改用浏览器/);
  assert.doesNotMatch(calls(dir), /^bd /m);
});

test("--via 的值不对就报错", () => {
  const { dir, env } = setup();
  const r = run([...["draft", join(dir, "文章.md")], "--via", "usb"], env);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--via 只能是 browser 或 phone/);
});

test("公众号载荷带配置里的 account", () => {
  const { dir, env } = setup();
  const r = run(["draft", join(dir, "文章.md")], env);
  assert.equal(r.status, 0, r.stderr);
  const payloadPath = calls(dir).trim().split(" ").pop();
  assert.equal(JSON.parse(readFileSync(payloadPath, "utf8")).account, "测试号");
});

test("配置里没写 account（或还是占位）→ 用 studio.json 的 account（账号名只写一处）", () => {
  for (const cfg of [{ theme: "grace" }, { theme: "grace", account: "（公众号名称）" }]) {
    const { dir, env } = setup();
    writeFileSync(join(dir, "wechat-article.config.json"), JSON.stringify(cfg));
    writeFileSync(join(dir, "studio.json"), JSON.stringify({ account: "小林的AI办公室" }));
    const r = run(["draft", join(dir, "文章.md")], env);
    assert.equal(r.status, 0, r.stderr);
    const payloadPath = calls(dir).trim().split(" ").pop();
    assert.equal(JSON.parse(readFileSync(payloadPath, "utf8")).account, "小林的AI办公室");
  }
});
