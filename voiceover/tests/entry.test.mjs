import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
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
