import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runDraft, takeVia } from "../node/draft-run.mjs";

/** 假 bd / pd：把参数和载荷内容记进 calls.log，按 exit 退出；PATH 只放它们和系统命令 */
function fakeBins(exit = 0) {
  const dir = mkdtempSync(join(tmpdir(), "draft-run-"));
  mkdirSync(join(dir, "bin"));
  for (const name of ["bd", "pd"]) {
    const f = join(dir, "bin", name);
    writeFileSync(f, `#!/usr/bin/env bash\necho "${name} $1 $2" >> "${dir}/calls.log"\ncat "$3" >> "${dir}/calls.log"\nexit ${exit}\n`);
    chmodSync(f, 0o755);
  }
  return dir;
}
const withPath = (path, fn) => {
  const old = process.env.PATH;
  process.env.PATH = path;
  try { return fn(); } finally { process.env.PATH = old; }
};
const calls = (dir) => (existsSync(join(dir, "calls.log")) ? readFileSync(join(dir, "calls.log"), "utf8") : "");
const fakePath = (dir) => `${join(dir, "bin")}:/usr/bin:/bin`;

test("takeVia：默认 browser；取出 --via 和它的值；值不对报错", () => {
  assert.deepEqual(takeVia(["a.md"]), ["browser", ["a.md"]]);
  assert.deepEqual(takeVia(["draft", "--via", "phone", "a.md"]), ["phone", ["draft", "a.md"]]);
  assert.throws(() => takeVia(["--via", "pc"]), /--via 只能是 browser 或 phone，收到：pc/);
});

test("runDraft：写载荷 JSON，调 bd run <步骤> <载荷>", () => {
  const dir = fakeBins();
  withPath(fakePath(dir), () => runDraft("browser", { browser: "/s/draft_x.py" }, { copy: "文案.md" }, { tmpPrefix: "t-" }));
  assert.match(calls(dir), /^bd run \/s\/draft_x\.py\n\{"copy":"文案\.md"\}/);
});

test("runDraft：phone 调 pd；手机不可用（退出码 3）→ 提示去掉 --via phone", () => {
  const dir = fakeBins(3);
  assert.throws(() => withPath(fakePath(dir), () => runDraft("phone", { phone: "/s/phone_x.py" }, {})), /手机不可用（见上面的提示）；去掉 --via phone 改用浏览器/);
  assert.match(calls(dir), /^pd run \/s\/phone_x\.py/);
});

test("runDraft：其他失败 → 发草稿失败，看上面的输出", () => {
  const dir = fakeBins(1);
  assert.throws(() => withPath(fakePath(dir), () => runDraft("browser", { browser: "/s/x.py" }, {})), /发草稿失败，看上面的输出/);
});

test("runDraft：命令找不到 → 说要装哪个 skill", () => {
  assert.throws(() => withPath("/nowhere", () => runDraft("browser", { browser: "/s/x.py" }, {})), /需要 bd 命令（skills\/browser-draft，软链接到 PATH）/);
  assert.throws(() => withPath("/nowhere", () => runDraft("phone", { phone: "/s/x.py" }, {})), /需要 pd 命令（skills\/phone-draft，软链接到 PATH）/);
});

test("runDraft：这个平台没有该方式的步骤 → 报错，不调命令", () => {
  const dir = fakeBins();
  assert.throws(() => withPath(fakePath(dir), () => runDraft("phone", { browser: "/s/x.py" }, {})), /这个平台没有 --via phone 的步骤（可用：browser）/);
  assert.equal(calls(dir), "");
});

test("takeVia：--via 后面没写值 → 说要写什么，不报「收到：undefined」", () => {
  assert.throws(() => takeVia(["a.md", "--via"]), (e) => /--via 后面要写 browser 或 phone/.test(e.message) && !/undefined/.test(e.message));
});
