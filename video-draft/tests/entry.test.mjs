import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const SKILL = new URL("..", import.meta.url).pathname;

test("bin/vdraft 经软链接调用（st install 装到 ~/.local/bin 的样子）、放在中文和空格路径下也能找到脚本", () => {
  const root = mkdtempSync(join(tmpdir(), "vdraft-"));
  const dir = join(root, "工具 copy");
  cpSync(SKILL, dir, { recursive: true });
  mkdirSync(join(root, "bin"));
  symlinkSync(join(dir, "bin/vdraft"), join(root, "bin/vdraft"));
  const r = spawnSync(join(root, "bin/vdraft"), [], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /用法：vdraft/);
});
