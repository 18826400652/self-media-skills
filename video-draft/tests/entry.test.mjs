import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const SKILL = new URL("..", import.meta.url).pathname;

test("bin/vdraft 经软链接调用、放在中文和空格路径下也能找到脚本", () => {
  const dir = join(mkdtempSync(join(tmpdir(), "vdraft-")), "工具 copy");
  cpSync(SKILL, dir, { recursive: true });
  const r = spawnSync(join(dir, "bin/vdraft"), [], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /用法：vdraft/);
});
