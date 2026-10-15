// bin/nv 入口
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

const NV = new URL("../bin/nv", import.meta.url).pathname;

test("nv help 显示文件头的完整命令列表（含 nv draft 和透传说明），不带后面的脚本", () => {
  const out = execFileSync(NV, ["help"], { encoding: "utf8" });
  assert.match(out, /nv draft/);
  assert.match(out, /透传给 hyperframes/);
  assert.doesNotMatch(out, /set -euo|^#/m);
});
