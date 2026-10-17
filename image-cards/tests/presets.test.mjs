// 预设：公众号封面（头条 2.35:1、次条 1:1）文字居中，转发卡片裁中间 1:1 时标题不被切
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const SKILL = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function preview(preset) {
  const dir = mkdtempSync(join(tmpdir(), "ic-preset-"));
  writeFileSync(join(dir, "封面.md"), `---\npreset: ${preset}\n---\n\n# 183条群消息\n\n副标题\n`);
  const r = spawnSync("node", [join(SKILL, "scripts/ic.mjs"), "preview", join(dir, "封面.md")], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return readFileSync(join(dir, "卡片预览.html"), "utf8");
}

test("公众号两个封面预设：卡片带 card-center，封面版式文字居中", () => {
  for (const p of ["wechat-cover", "wechat-cover-square"]) assert.match(preview(p), /<section class="card layout-cover card-center"/, p);
  assert.match(readFileSync(join(SKILL, "layouts/cards.css"), "utf8"), /\.card-center \.card-body \{[^}]*text-align: center/);
});

test("小红书、抖音封面不变（不居中）", () => {
  for (const p of ["xiaohongshu", "douyin-cover"]) assert.doesNotMatch(preview(p), /<section class="[^"]*card-center/, p);
});
