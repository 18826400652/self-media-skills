// bin/nv 入口
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

const NV = new URL("../bin/nv", import.meta.url).pathname;

test("nv help 显示文件头的命令列表（含透传说明），不再列 draft，不带后面的脚本，不再列 template 命令", () => {
  const out = execFileSync(NV, ["help"], { encoding: "utf8" });
  assert.doesNotMatch(out, /nv draft/);
  assert.match(out, /透传给 hyperframes/);
  assert.doesNotMatch(out, /hf-build|hf-kit|nv voice|nv new/);
  assert.doesNotMatch(out, /set -euo|^#/m);
});
