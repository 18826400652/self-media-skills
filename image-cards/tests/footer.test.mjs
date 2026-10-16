// ic 的角标：卡片 frontmatter → image-cards.config.json 的 footer → studio.json 的账号名（@账号名）
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const IC = join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), "scripts", "ic.mjs");

function preview(files) {
  const dir = mkdtempSync(join(tmpdir(), "ic-footer-"));
  for (const [f, c] of Object.entries(files)) writeFileSync(join(dir, f), typeof c === "string" ? c : JSON.stringify(c));
  const r = spawnSync("node", [IC, "preview", join(dir, "卡片.md")], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return readFileSync(join(dir, "卡片预览.html"), "utf8");
}

test("配置没写 footer：角标用 studio.json 的账号名", () => {
  const html = preview({ "卡片.md": "# 第一张\n", "studio.json": { account: "小林的AI办公室" }, "image-cards.config.json": { preset: "xiaohongshu" } });
  assert.match(html, /<footer class="card-footer"><span>@小林的AI办公室<\/span>/);
});

test("配置写了 footer 就用配置的；卡片 frontmatter 优先", () => {
  assert.match(preview({ "卡片.md": "# 第一张\n", "studio.json": { account: "小林" }, "image-cards.config.json": { footer: "@别的" } }), /<span>@别的<\/span>/);
  assert.match(preview({ "卡片.md": "---\nfooter: 卡片自己的\n---\n# 第一张\n", "studio.json": { account: "小林" } }), /<span>卡片自己的<\/span>/);
});
