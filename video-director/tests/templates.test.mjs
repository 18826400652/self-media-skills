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
