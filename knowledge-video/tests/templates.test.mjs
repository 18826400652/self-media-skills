import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { validateResearch } from "../scripts/lib/research.mjs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("templates/research.json 是合格的示例", () => {
  const issues = validateResearch(JSON.parse(read("templates/research.json")));
  assert.deepEqual(issues.filter((i) => i.level === "error"), []);
});

test("templates/run.json 的阶段和确认节点齐全", () => {
  const run = JSON.parse(read("templates/run.json"));
  assert.equal(run.stage, "brief");
  assert.equal(run.video, "director", "概念科普新作品默认用导演流程");
  assert.deepEqual(Object.keys(run.gates), ["script", "storyboard", "director", "sample", "final"]);
  for (const g of Object.values(run.gates)) assert.deepEqual(g, { passed: false, at: null, edits: [] });
});

test("SKILL.md 有 frontmatter；文档里提到的文件都存在", () => {
  const skill = read("SKILL.md");
  assert.match(skill, /^---\nname: knowledge-video\ndescription: /);
  for (const p of ["types/concept.md", "types/practical.md", "references/research.md", "references/script.md", "references/qa.md", "templates/brief.md"]) {
    assert.ok(existsSync(new URL(`../${p}`, import.meta.url)), `${p} 不存在`);
    assert.ok(skill.includes(p), `SKILL.md 没提到 ${p}`);
  }
});
