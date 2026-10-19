// st test：一次跑完工具包里所有测试套件，汇总通过数、失败数、跳过的原因
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { findSuites, nodeTestArgs, testAll } from "../scripts/lib/test-all.mjs";

function write(root, rel, text) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
}
const testFile = (...cases) => `import { test } from "node:test";\n${cases.join("\n")}\n`;
const OK = (name) => `test("${name}", () => {});`;
const BROKEN = 'test("坏了", () => { throw new Error("x"); });';
const PASS = testFile(OK("ok"));
const pkg = (deps) => JSON.stringify({ scripts: { test: "node --test tests/*.test.mjs" }, ...(deps ? { dependencies: deps } : {}) });

/** 假工具包：好的、坏的、缺依赖的 Node 套件，shared，有 / 没 venv 的 Python 套件 */
function toolkit() {
  const root = mkdtempSync(join(tmpdir(), "st-test-"));
  write(root, "good/package.json", pkg());
  write(root, "good/tests/a.test.mjs", testFile(OK("ok"), OK("ok2")));
  write(root, "bad/package.json", pkg());
  write(root, "bad/tests/a.test.mjs", testFile(OK("ok"), BROKEN));
  write(root, "needdeps/package.json", pkg({ "left-pad": "1" }));
  write(root, "needdeps/tests/a.test.mjs", PASS);
  write(root, "shared/tests/s.test.mjs", PASS);
  write(root, "nopkg/tests/n.test.mjs", PASS);
  write(root, "py/tests/test_x.py", "def test_x(): pass\n");
  write(root, "py/.venv/bin/python", '#!/usr/bin/env bash\necho "3 passed in 0.01s"\n');
  chmodSync(join(root, "py/.venv/bin/python"), 0o755);
  write(root, "novenv/tests/test_y.py", "def test_y(): pass\n");
  write(root, "docs/x.md", "不是套件");
  return root;
}

function run(root, opts = {}) {
  const lines = [];
  const code = testAll({ toolkit: root, log: (l) => lines.push(l), ...opts });
  return { code, text: lines.join("\n") };
}

test("findSuites：tests/ 里有 *.test.mjs 的 skill（不管有没有 package.json）、带 test_*.py 的目录；其余目录不算", () => {
  const names = findSuites(toolkit()).map((s) => s.name).sort();
  assert.deepEqual(names, ["bad", "good", "needdeps", "nopkg", "novenv", "py", "shared"]);
});

test("st test：逐个套件给出通过数、失败数；有失败退出码 1，并列出失败的用例名", () => {
  const { code, text } = run(toolkit());
  assert.equal(code, 1);
  assert.match(text, /✓ good +2 通过/);
  assert.match(text, /✗ bad +1 通过 1 失败/);
  assert.match(text, /坏了/);
  assert.match(text, /✓ py +3 通过/);
  assert.match(text, /✓ shared +1 通过/);
  assert.match(text, /✓ nopkg +1 通过/);
});

test("st test：缺 node_modules、没有 Python 环境的套件跳过并说怎么装；只有跳过时退出码 0，--strict 时 1", () => {
  const root = toolkit();
  const only = ["good", "needdeps", "novenv"];
  const r = run(root, { only });
  assert.equal(r.code, 0);
  assert.match(r.text, /⚠ needdeps +跳过：缺依赖，先 cd needdeps && npm ci/);
  assert.match(r.text, /⚠ novenv +跳过：没有 Python 环境/);
  assert.equal(run(root, { only, strict: true }).code, 1);
});

test("st test <套件…>：只跑点名的；点了不存在的报错并列出有哪些", () => {
  const root = toolkit();
  const r = run(root, { only: ["good"] });
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.text, /bad/);
  assert.throws(() => run(root, { only: ["nope"] }), /没有这个套件：nope[\s\S]*good/);
});

test("st test：node --test 强制 TAP reporter，Node 24 的 spec 输出也能数通过数", () => {
  assert.deepEqual(nodeTestArgs(["tests/a.test.mjs"]), ["--test", "--test-reporter=tap", "tests/a.test.mjs"]);
});
