import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseDirector } from "../scripts/lib/director.mjs";

const read = (p) => readFileSync(new URL(`../templates/${p}`, import.meta.url), "utf8");

test("templates/DIRECTOR.md：章节齐全、机器块合法，只差（待填）和栏目标签没写", () => {
  const p = parseDirector(read("DIRECTOR.md"));
  assert.deepEqual(p.errors, ["还有（待填）没写完", "kicker（栏目标签）还没填：（栏目 · 第 N 期）"]);
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

test("模板不写死真实项目的系列名；kicker 是占位，校验会提醒填", () => {
  const md = read("DIRECTOR.md");
  assert.doesNotMatch(md, /AI 概念一分钟/);
  assert.ok(parseDirector(md).errors.some((e) => /kicker（栏目标签）还没填/.test(e)));
});

test("kicker 填了真实栏目名就不报", () => {
  const md = read("DIRECTOR.md").replace(/"kicker": "[^"]*"/, '"kicker": "某栏目 · 第 3 期"');
  assert.ok(!parseDirector(md).errors.some((e) => /kicker/.test(e)));
});

test("templates/DIRECTOR.md：说明文字里没有被当成 @词 的字（全文写完后 vd cues 不再多出「词」）", () => {
  // 机器块和（待填）行里的 @词 是要换掉的占位，换掉后不会留下；其余说明文字会一直留在写好的 DIRECTOR.md 里
  const prose = read("DIRECTOR.md").replace(/```json[\s\S]*?```/, "").split("\n").filter((l) => !l.includes("（待填")).join("\n");
  assert.deepEqual(parseDirector(prose).tokens, []);
});

test("templates/DIRECTOR.md：§3 有 6 行视觉工艺自检，§1 有材质与视觉规范", () => {
  const md = read("DIRECTOR.md");
  for (const k of ["视觉工艺 · 主体", "视觉工艺 · 材质", "视觉工艺 · 字阶", "视觉工艺 · 空白带", "视觉工艺 · 色彩锚点", "视觉工艺 · 构图变化"]) {
    assert.ok(md.includes(k), "缺少 " + k);
  }
  assert.match(md, /- \*\*材质与光影\*\*/);
  assert.match(md, /- \*\*视觉规范\*\*/);
  const prose = md.replace(/```json[\s\S]*?```/, "").split("\n").filter((l) => !l.includes("（待填")).join("\n");
  assert.deepEqual(parseDirector(prose).tokens, []);
});
