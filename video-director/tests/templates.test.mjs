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

test("templates/index.html：三个 vd 标记都在", () => {
  const html = read("index.html");
  for (const n of ["audio", "segments", "brand"]) assert.ok(html.includes(`<!-- vd:${n} --><!-- /vd:${n} -->`), n);
});

test("账号固定元素和单段模板只用 var(--vd-*) 字体变量（hyperframes lint 看不到跨文件的 @font-face）", () => {
  const brand = (f) => readFileSync(new URL(`../../../06-品牌资产/hyperframes/${f}`, import.meta.url), "utf8");
  const files = { "segment.html": read("segment.html"), ...Object.fromEntries(["brand-kicker.html", "brand-captions.html", "brand-ending.html"].map((f) => [f, brand(f)])) };
  for (const [name, html] of Object.entries(files)) {
    const literal = [...html.matchAll(/font-family:\s*([^;"]*"[^"]+"[^;]*);/g)].map((m) => m[1]);
    assert.deepEqual(literal, [], `${name} 写了字体名`);
  }
  assert.match(read("index.html"), /--vd-serif: "Noto Serif SC Variable"/);
});
