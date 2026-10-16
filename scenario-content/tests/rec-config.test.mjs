// sc rec / rec-flow 的配置：scenario-content.config.json 的 rec 字段
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fromRoot, loadRecConfig } from "../scripts/lib/rec-config.mjs";

test("loadRecConfig：从作品子目录往上找 scenario-content.config.json，取 rec 字段", () => {
  const root = mkdtempSync(join(tmpdir(), "sc-rec-"));
  writeFileSync(join(root, "scenario-content.config.json"), JSON.stringify({ voiceGuide: "x", rec: { cdpPort: 9333, theme: "dark" } }));
  mkdirSync(join(root, "04-作品/a/实测"), { recursive: true });
  const c = loadRecConfig(join(root, "04-作品/a/实测"));
  assert.equal(c.root, root);
  assert.deepEqual(c.rec, { cdpPort: 9333, theme: "dark" });
  assert.equal(fromRoot(c, "x/y.txt"), join(root, "x/y.txt"));
  assert.equal(fromRoot(c, undefined), null);
});

test("loadRecConfig：找不到配置 → rec 是空对象，root 是起始目录", () => {
  const dir = mkdtempSync(join(tmpdir(), "sc-rec-"));
  const c = loadRecConfig(dir);
  assert.deepEqual(c.rec, {});
  assert.equal(c.root, dir);
  assert.equal(c.configPath, null);
});

test("loadRecConfig：配置不是合法 JSON → 报中文错误", () => {
  const root = mkdtempSync(join(tmpdir(), "sc-rec-"));
  writeFileSync(join(root, "scenario-content.config.json"), "{");
  assert.throws(() => loadRecConfig(root), /scenario-content\.config\.json 不是合法的 JSON/);
});
