// st install --deps：装依赖慢、失败时说清楚在装什么、哪个 skill 没装好（全流程检查报告 P-01）
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { install } from "../scripts/lib/install.mjs";

const tmp = (p) => mkdtempSync(join(tmpdir(), p));

/** 假工具包：a 有 package-lock.json，b 有 requirements.txt */
function fakeToolkit() {
  const tk = tmp("st-tk-");
  for (const [s, f] of [["a-skill", "package-lock.json"], ["b-skill", "requirements.txt"]]) {
    mkdirSync(join(tk, s), { recursive: true });
    writeFileSync(join(tk, s, "SKILL.md"), "x");
    writeFileSync(join(tk, s, f), "{}");
  }
  return tk;
}

test("st install --deps：每个 skill 装依赖前说在装哪个、可能很慢；失败的 skill 在最后点名并提示 st doctor", () => {
  const lines = [];
  const run = (cmd, args, cwd) => !cwd.endsWith("b-skill"); // b-skill 的命令都失败
  const code = install({ deps: true, home: tmp("st-home-"), toolkit: fakeToolkit(), log: (l) => lines.push(l), run });
  const out = lines.join("\n");
  assert.equal(code, 1);
  assert.match(out, /装 a-skill 的依赖.*可能要几分钟/);
  assert.match(out, /装 b-skill 的依赖/);
  assert.match(out, /依赖没装好：b-skill/);
  assert.doesNotMatch(out, /依赖没装好：.*a-skill/);
  assert.match(out, /st doctor/);
});
