import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

test("vd.mjs：放在带中文和空格的路径下也能运行（不能静默退出 0）", () => {
  const dir = join(mkdtempSync(join(tmpdir(), "vd-")), "工具 copy");
  cpSync(new URL("../scripts", import.meta.url), join(dir, "scripts"), { recursive: true });
  const r = spawnSync("node", [join(dir, "scripts/vd.mjs"), "nope"], { encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /用法：vd build\|cues\|check/);
});
