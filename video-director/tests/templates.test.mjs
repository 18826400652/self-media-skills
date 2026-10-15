import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseDirector } from "../scripts/lib/director.mjs";

const read = (p) => readFileSync(new URL(`../templates/${p}`, import.meta.url), "utf8");

test("templates/DIRECTOR.md：章节齐全、机器块合法，唯一的问题是（待填）还没写", () => {
  const p = parseDirector(read("DIRECTOR.md"));
  assert.deepEqual(p.errors, ["还有（待填）没写完"]);
  assert.ok(p.vd.segments.length > 0);
});

test("templates/index.html：四个 vd 标记都在", () => {
  const html = read("index.html");
  for (const n of ["head", "audio", "segments", "brand"]) assert.ok(html.includes(`<!-- vd:${n} --><!-- /vd:${n} -->`), n);
});

// 项目品牌目录里的 brand-*.html 同样只能用字体变量，由 st doctor 检查（工具包测试不读作品项目）
test("单段模板只用 var(--vd-*) 字体变量（hyperframes lint 看不到跨文件的 @font-face）", () => {
  const files = { "segment.html": read("segment.html") };
  for (const [name, html] of Object.entries(files)) {
    const literal = [...html.matchAll(/font-family:\s*([^;"]*"[^"]+"[^;]*);/g)].map((m) => m[1]);
    assert.deepEqual(literal, [], `${name} 写了字体名`);
  }
  assert.match(read("index.html"), /--vd-serif: "Noto Serif SC Variable"/);
});
