// wa preview：除了 预览.html，还截一张手机宽度的整页 预览.png（不用自己起服务器、开浏览器截图）
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { findChrome } from "../scripts/lib/shared/chrome.mjs";

const WA = join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), "scripts", "wa.mjs");
const article = (body) => {
  const dir = mkdtempSync(join(tmpdir(), "wa-preview-"));
  writeFileSync(join(dir, "wechat-article.config.json"), JSON.stringify({ theme: "grace" }));
  writeFileSync(join(dir, "文章.md"), `---\ntitle: 测试\n---\n\n${body}\n`);
  return dir;
};
const pngSize = (f) => { const b = readFileSync(f); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

test("wa preview：写 预览.html 和整页 预览.png（手机宽度、2 倍清晰度，长文整篇都在）", { skip: !findChrome() && "没有 Chrome" }, () => {
  const dir = article(Array.from({ length: 40 }, (_, i) => `第 ${i + 1} 段，正文内容。`).join("\n\n"));
  const r = spawnSync("node", [WA, "preview", join(dir, "文章.md")], { encoding: "utf8", timeout: 120000 });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(dir, "预览.html")));
  assert.ok(existsSync(join(dir, "预览.png")), r.stdout + r.stderr);
  const [w, h] = pngSize(join(dir, "预览.png"));
  assert.equal(w, 912, "手机栏 420px + 两边各 18px 内边距，× 2");
  assert.ok(h > 2 * 1500, `40 段的长文要截全，现在高 ${h}`);
  assert.match(r.stdout, /预览\.png/);
});

test("wa preview：找不到 Chrome 时照样写 预览.html，提醒截不了图", () => {
  const dir = article("一段。");
  const r = spawnSync("node", [WA, "preview", join(dir, "文章.md")], { encoding: "utf8", env: { ...process.env, CHROME_PATH: "/nope/chrome" } });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(dir, "预览.html")));
  assert.equal(existsSync(join(dir, "预览.png")), false);
  assert.match(r.stderr, /截图没做.*CHROME_PATH|Chrome/);
});
