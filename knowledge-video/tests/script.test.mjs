import assert from "node:assert/strict";
import { test } from "node:test";
import { basisOf, checkBasis, parseScriptBasis } from "../scripts/lib/script.mjs";

const MD = [
  "# SCRIPT", "",
  "## Line 1 — 钩子 (Frame 1)", "", "**重点词:** 瞎编", "**依据:** 观点", "", "    同一个问题，问知识库答对了，问它却在瞎编。", "",
  "## Line 2 — 定义 (Frame 2)", "", "**依据：** c01、c02", "", "    它会先翻资料，", "    再回答。", "",
  "## Line 3 — 类比 (Frame 3)", "", "    就像开卷考试。", "",
].join("\n");

test("parseScriptBasis：读帧号、口播（多行拼接）、依据（中英文冒号都行）", () => {
  assert.deepEqual(parseScriptBasis(MD), [
    { frame: 1, text: "同一个问题，问知识库答对了，问它却在瞎编。", basis: "观点" },
    { frame: 2, text: "它会先翻资料，再回答。", basis: "c01、c02" },
    { frame: 3, text: "就像开卷考试。", basis: null },
  ]);
});

test("basisOf：claim 列表（逗号、顿号、空格）、类比、观点；混用无效", () => {
  assert.deepEqual(basisOf("c01, c03"), { kind: "claims", ids: ["c01", "c03"] });
  assert.deepEqual(basisOf("c01、c02 c04"), { kind: "claims", ids: ["c01", "c02", "c04"] });
  assert.deepEqual(basisOf("类比"), { kind: "类比", ids: [] });
  assert.deepEqual(basisOf(" 观点 "), { kind: "观点", ids: [] });
  assert.equal(basisOf("c01, 观点").kind, "invalid");
  assert.equal(basisOf("").kind, "invalid");
});

test("checkBasis：漏标、无效取值、引用不存在的 claim 报错；没被引用的 claim 警告", () => {
  const research = { claims: [{ id: "c01" }, { id: "c02" }, { id: "c09" }] };
  const lines = [
    { frame: 1, text: "a", basis: "观点" },
    { frame: 2, text: "b", basis: "c01, c05" },
    { frame: 3, text: "c", basis: null },
    { frame: 4, text: "d", basis: "c01 类比" },
  ];
  const issues = checkBasis(lines, research);
  const e = issues.filter((i) => i.level === "error").map((i) => i.msg);
  const w = issues.filter((i) => i.level === "warn").map((i) => i.msg);
  assert.ok(e.some((m) => /第 3 句：缺少「\*\*依据:\*\*」/.test(m)));
  assert.ok(e.some((m) => /第 2 句：引用的 c05 不在 research\.json 里/.test(m)));
  assert.ok(e.some((m) => /第 4 句：依据只能是 claim 编号、「类比」或「观点」/.test(m)));
  assert.deepEqual(w, ["c02、c09 没被脚本用到（研究多余，或脚本漏了重点）"]);
});

test("checkBasis：实用技巧类只要求依据行存在且非空；没有口播时报错", () => {
  assert.deepEqual(checkBasis([{ frame: 1, text: "a", basis: "R1" }], null, "practical"), []);
  assert.match(checkBasis([{ frame: 1, text: "a", basis: null }], null, "practical")[0].msg, /第 1 句：缺少/);
  assert.match(checkBasis([], null)[0].msg, /SCRIPT\.md 里没有读到口播/);
});
