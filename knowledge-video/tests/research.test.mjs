import assert from "node:assert/strict";
import { test } from "node:test";
import { parseResearchJson, validateResearch } from "../scripts/lib/research.mjs";

const src = (o = {}) => ({ title: "T", url: "https://a.com", type: "official", quote: "原文", accessed: "2026-10-07", ...o });
const claim = (o = {}) => ({ id: "c01", text: "事实", kind: "fact", confidence: "high", sources: [src()], ...o });
const errors = (issues) => issues.filter((i) => i.level === "error").map((i) => i.msg);
const warns = (issues) => issues.filter((i) => i.level === "warn").map((i) => i.msg);

test("合格的 research.json 没有问题", () => {
  assert.deepEqual(validateResearch({ topic: "RAG", claims: [claim()] }), []);
});

test("JSON 坏了、claims 不是数组：中文错误，不抛异常", () => {
  const bad = parseResearchJson("{坏");
  assert.equal(bad.data, null);
  assert.match(errors(bad.issues)[0], /research\.json 不是合法 JSON/);
  assert.match(errors(validateResearch({ claims: "x" }))[0], /claims 必须是数组/);
  assert.match(errors(validateResearch(null))[0], /research\.json 必须是一个对象/);
});

test("id、kind、confidence 的取值", () => {
  const e = errors(validateResearch({ claims: [claim({ id: "x1", kind: "guess", confidence: "sure" }), claim({ id: "c02" }), claim({ id: "c02" })] }));
  assert.ok(e.some((m) => /x1：id 要写成 c 加数字/.test(m)));
  assert.ok(e.some((m) => /kind 只能是 fact 或 number/.test(m)));
  assert.ok(e.some((m) => /confidence 只能是 high、medium、low/.test(m)));
  assert.ok(e.some((m) => /c02：id 重复/.test(m)));
});

test("来源：至少一个；url、quote、accessed、type 都要对", () => {
  assert.match(errors(validateResearch({ claims: [claim({ sources: [] })] }))[0], /c01：至少要有 1 个来源/);
  const e = errors(validateResearch({ claims: [claim({ sources: [src({ url: "a.com", quote: " ", accessed: "10/7", type: "blog" })] })] }));
  assert.ok(e.some((m) => /url 要以 http/.test(m)));
  assert.ok(e.some((m) => /quote 不能为空/.test(m)));
  assert.ok(e.some((m) => /accessed 要写成 YYYY-MM-DD/.test(m)));
  assert.ok(e.some((m) => /type 只能是 official、paper、media、other/.test(m)));
});

test("number 类或可信度不高：要 2 个来源，或 1 个官方来源", () => {
  const one = [src({ type: "media" })];
  assert.match(errors(validateResearch({ claims: [claim({ kind: "number", sources: one })] }))[0], /c01：数字类或可信度不是 high，要 2 个来源或 1 个官方来源/);
  assert.match(errors(validateResearch({ claims: [claim({ confidence: "medium", sources: one })] }))[0], /要 2 个来源或 1 个官方来源/);
  assert.deepEqual(errors(validateResearch({ claims: [claim({ kind: "number", sources: [src()] })] })), []);
  assert.deepEqual(errors(validateResearch({ claims: [claim({ kind: "number", sources: [src({ type: "media" }), src({ type: "paper" })] })] })), []);
});

test("只有媒体或其他来源：警告", () => {
  assert.match(warns(validateResearch({ claims: [claim({ sources: [src({ type: "media" })] })] }))[0], /c01：只有媒体或其他来源/);
});
