import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(SKILL, "scripts", "vdraft.mjs");

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
  writeFileSync(join(dir, "成片.mp4"), "x");
  writeFileSync(join(dir, "文案.md"), "## 标题\n测试\n## 正文\n正文\n");
  return { dir, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } };
}

const calls = (dir) => (existsSync(join(dir, "calls.log")) ? readFileSync(join(dir, "calls.log"), "utf8") : "");
const run = (args, env, extra = {}) => spawnSync("node", [SCRIPT, ...args], { env, encoding: "utf8", ...extra });

test("默认走浏览器：调用 bd run draft_douyin.py", () => {
  const { dir, env } = setup();
  const r = run([join(dir, "成片.mp4"), "--copy", join(dir, "文案.md")], env);
  assert.equal(r.status, 0, r.stderr);
  assert.match(calls(dir), /^bd run .*draft_douyin\.py /);
});

test("--via phone 调用 pd run phone_douyin.py", () => {
  const { dir, env } = setup();
  const r = run([...[join(dir, "成片.mp4"), "--copy", join(dir, "文案.md")], "--via", "phone"], env);
  assert.equal(r.status, 0, r.stderr);
  assert.match(calls(dir), /^pd run .*phone_douyin\.py /);
});

test("手机不可用时报错，不回落到浏览器", () => {
  const { dir, env } = setup();
  const r = run([join(dir, "成片.mp4"), "--copy", join(dir, "文案.md"), "--via", "phone"], { ...env, FAKE_PD_EXIT: "3" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /手机不可用/);
  assert.match(r.stderr, /去掉 --via phone 改用浏览器/);
  assert.doesNotMatch(calls(dir), /^bd /m);
});

test("--via 的值不对就报错", () => {
  const { dir, env } = setup();
  const r = run([...[join(dir, "成片.mp4"), "--copy", join(dir, "文案.md")], "--via", "usb"], env);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--via 只能是 browser 或 phone/);
});

test("--to xiaohongshu 默认走浏览器：调用 bd run draft_xiaohongshu.py", () => {
  const { dir, env } = setup();
  const r = run([...[join(dir, "成片.mp4"), "--copy", join(dir, "文案.md")], "--to", "xiaohongshu"], env);
  assert.equal(r.status, 0, r.stderr);
  assert.match(calls(dir), /^bd run .*video-draft\/scripts\/draft_xiaohongshu\.py /);
});

test("--to xiaohongshu --via phone 调用 pd run phone_xiaohongshu.py", () => {
  const { dir, env } = setup();
  const r = run([join(dir, "成片.mp4"), "--copy", join(dir, "文案.md"), "--to", "xiaohongshu", "--via", "phone"], env);
  assert.equal(r.status, 0, r.stderr);
  assert.match(calls(dir), /^pd run .*phone_xiaohongshu\.py /);
});

test("--to 的值不对就报错", () => {
  const { dir, env } = setup();
  const r = run([join(dir, "成片.mp4"), "--copy", join(dir, "文案.md"), "--to", "weibo"], env);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /douyin 或 xiaohongshu/);
});

/** 假 bd / pd 把载荷文件内容也记下来 */
function setupWithPayload() {
  const s = setup();
  for (const name of ["pd", "bd"]) {
    writeFileSync(join(s.dir, "bin", name), `#!/usr/bin/env bash\necho "${name} $*" >> "${s.dir}/calls.log"\ncat "$3" > "${s.dir}/payload.json"\n`);
  }
  writeFileSync(join(s.dir, "封面.png"), "png");
  return s;
}
const payloadOf = (dir) => JSON.parse(readFileSync(join(dir, "payload.json"), "utf8"));

test("--cover 把封面图路径放进载荷（抖音、小红书都支持）", () => {
  for (const to of ["douyin", "xiaohongshu"]) {
    const { dir, env } = setupWithPayload();
    const r = run([join(dir, "成片.mp4"), "--copy", join(dir, "文案.md"), "--cover", join(dir, "封面.png"), "--to", to], env);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(payloadOf(dir).cover, join(dir, "封面.png"));
    assert.equal(payloadOf(dir).video, join(dir, "成片.mp4"));
  }
});

test("不传 --cover 时载荷里没有 cover", () => {
  const { dir, env } = setupWithPayload();
  const r = run([join(dir, "成片.mp4"), "--copy", join(dir, "文案.md")], env);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(payloadOf(dir).cover, undefined);
});

test("--cover 文件不存在或不是图片就报错", () => {
  const { dir, env } = setupWithPayload();
  let r = run([join(dir, "成片.mp4"), "--copy", join(dir, "文案.md"), "--cover", join(dir, "没有.png")], env);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /封面图不存在/);
  r = run([join(dir, "成片.mp4"), "--copy", join(dir, "文案.md"), "--cover", join(dir, "文案.md")], env);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /png 或 jpg/);
  assert.equal(calls(dir), "");
});

test("--cover 不支持手机", () => {
  const { dir, env } = setupWithPayload();
  const r = run([join(dir, "成片.mp4"), "--copy", join(dir, "文案.md"), "--cover", join(dir, "封面.png"), "--via", "phone"], env);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /封面图.*浏览器/);
  assert.equal(calls(dir), "");
});

test("缺参数：用法写 vdraft", () => {
  const { env } = setup();
  const r = run([], env);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /用法：vdraft <成片\.mp4> --copy/);
});
