// 视频流水线重组（2026-10-16）以后，代码里不应再出现 template 做法和 narrated-video 的痕迹。
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { test } from "node:test";
import { TOOLKIT_DIR } from "../scripts/lib/project.mjs";

const SKIP_DIRS = new Set(["node_modules", ".venv", ".git", "docs", "vendor", "fixtures"]);
const CODE = new Set([".mjs", ".js", ".py", ".json", ".sh", ""]);
const LEGACY = [/narrated-video/, /抖音-director/, /STORYBOARD/, /faceless-explainer/, /hf-build/, /\bnv (hf-audio|render|draft|rec|verify|init|hf-kit)\b/, /["'`]nv["'`]/];
// 白名单：整个文件放行，每条写明原因。其余命中都是漏网之鱼，要改代码，不要放宽正则。
const ALLOW = new Set([
  "voiceover/scripts/lib/caption-groups.mjs", // 文件头要写出移植来源 faceless-explainer（Apache-2.0 要求保留出处）
  "studio/tests/project.test.mjs", // 造 narrated-video / nv 的旧软链，测 st install 会清掉；并断言 doctor 输出不再提 faceless-explainer
  "studio/tests/new.test.mjs", // 断言 st new 不再生成 STORYBOARD.md 等旧产物
  "voiceover/tests/vo.test.mjs", // 断言 vo 不再写 STORYBOARD.md 等旧产物
  "knowledge-video/tests/practical.test.mjs", // 断言步骤提示里不再出现 nv、抖音-director、STORYBOARD
  "knowledge-video/tests/status.test.mjs", // 断言进度提示里不再出现 nv、抖音-director
]);
const SELF = "studio/tests/no-legacy.test.mjs";

function* codeFiles(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) yield* codeFiles(join(dir, e.name)); continue; }
    if (CODE.has(extname(e.name)) && e.name !== "package-lock.json") yield join(dir, e.name);
  }
}

test("代码里不再引用 narrated-video、nv 命令、抖音-director、STORYBOARD、faceless-explainer", () => {
  const hits = [];
  for (const f of codeFiles(TOOLKIT_DIR)) {
    const rel = relative(TOOLKIT_DIR, f);
    if (rel === SELF || ALLOW.has(rel)) continue;
    readFileSync(f, "utf8").split("\n").forEach((line, i) => {
      if (LEGACY.some((re) => re.test(line))) hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(hits, []);
});
