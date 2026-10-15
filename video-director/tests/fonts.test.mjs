import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fontsCss, writeFonts } from "../scripts/lib/fonts.mjs";

test("writeFonts：三种字体 + fonts.css，css 里引用的文件都在，每种字体带许可证", () => {
  const out = mkdtempSync(join(tmpdir(), "vd-fonts-"));
  writeFonts(out);
  const css = readFileSync(join(out, "fonts.css"), "utf8");
  for (const fam of ["Noto Sans SC Variable", "Noto Serif SC Variable", "JetBrains Mono"]) assert.ok(css.includes(`font-family: '${fam}'`), fam);
  const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1]);
  assert.ok(urls.length > 200);
  for (const u of urls) assert.ok(existsSync(join(out, u)), u);
  for (const d of ["noto-sans-sc", "noto-serif-sc", "jetbrains-mono"]) assert.ok(readdirSync(join(out, d)).includes("LICENSE.txt"), d);
  assert.doesNotMatch(css, /\.\/files\//);
});

test("fontsCss：中文字体按 unicode-range 拆分，不带 italic", () => {
  const css = fontsCss();
  assert.match(css, /unicode-range:/);
  assert.doesNotMatch(css, /italic/);
});
