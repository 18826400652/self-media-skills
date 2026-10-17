// 监控：st log-hook（Claude Code 钩子，记下工具包命令的结果）和 st review（汇总问题、找偏好候选）
// 钩子收到的 JSON 格式按 2026-10-17 实测：成功是 PostToolUse（tool_response.stdout/stderr、duration_ms），
// 退出码非 0 是 PostToolUseFailure（error = "Exit code N\n输出"）
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { logEntry } from "../scripts/lib/monitor.mjs";
import { projectsDirName, review } from "../scripts/lib/review.mjs";
import { TOOLKIT_DIR } from "../scripts/lib/project.mjs";

const ST = resolve(dirname(fileURLToPath(import.meta.url)), "../scripts/st.mjs");
const ok = (command, stdout = "", stderr = "") => ({ hook_event_name: "PostToolUse", session_id: "s1", cwd: "/p", tool_name: "Bash", tool_input: { command }, tool_response: { stdout, stderr }, duration_ms: 1200 });
const fail = (command, error) => ({ hook_event_name: "PostToolUseFailure", session_id: "s1", cwd: "/p", tool_name: "Bash", tool_input: { command }, error, duration_ms: 300 });

function project() {
  const root = mkdtempSync(join(tmpdir(), "st-mon-"));
  writeFileSync(join(root, "studio.json"), "{}");
  mkdirSync(join(root, "04-作品/AI办公/01-群聊/抖音"), { recursive: true });
  return root;
}

test("logEntry：工具包命令成功也记，输出里的 ✗ / ⚠ 行留下来", () => {
  const e = logEntry(ok("cd 04-作品 && kv status 01-群聊 | tail -3", "✓ 1 场景卡\n✗ sc check：母稿有占位\n⚠ 选题关没确认\n"));
  assert.equal(e.ok, true);
  assert.deepEqual(e.tools, ["kv"]);
  assert.deepEqual(e.problems, ["✗ sc check：母稿有占位", "⚠ 选题关没确认"]);
  assert.equal(e.ms, 1200);
  assert.equal(e.session, "s1");
});

test("logEntry：失败记退出码和报错最后几行", () => {
  const e = logEntry(fail("vo 抖音", "Exit code 1\n读取 SCRIPT.md\n✗ fetch failed"));
  assert.equal(e.ok, false);
  assert.equal(e.exit, 1);
  assert.deepEqual(e.tools, ["vo"]);
  assert.deepEqual(e.problems, ["✗ fetch failed"]);
  assert.match(e.tail, /fetch failed/);
});

test("logEntry：不是工具包命令、不是 Bash → 不记", () => {
  assert.equal(logEntry(ok("ls -la")), null);
  assert.equal(logEntry(ok("cat vd.log")), null, "文件名里带 vd 不算");
  assert.equal(logEntry({ ...ok("kv status ."), tool_name: "Read" }), null);
  assert.deepEqual(logEntry(ok("vd build 抖音 && vd qa 抖音")).tools, ["vd"]);
});

test("st log-hook：在作品项目里 → 追加到 .studio/log/日期.jsonl；不在项目里或输入坏了 → 不写、不报错", () => {
  const root = project();
  const run = (payload) => spawnSync(process.execPath, [ST, "log-hook"], { input: typeof payload === "string" ? payload : JSON.stringify(payload), encoding: "utf8" });
  assert.equal(run({ ...fail("vd build 抖音", "Exit code 1\n✗ 缺 caption_groups.json"), cwd: join(root, "04-作品") }).status, 0);
  const logs = readdirSync(join(root, ".studio/log"));
  assert.equal(logs.length, 1);
  assert.match(logs[0], /^\d{4}-\d{2}-\d{2}\.jsonl$/);
  const line = JSON.parse(readFileSync(join(root, ".studio/log", logs[0]), "utf8").trim());
  assert.equal(line.exit, 1);
  assert.match(line.at, /^\d{4}-\d{2}-\d{2}T/);
  const outside = mkdtempSync(join(tmpdir(), "st-mon-"));
  assert.equal(run({ ...ok("kv status ."), cwd: outside }).status, 0);
  assert.equal(existsSync(join(outside, ".studio")), false);
  assert.equal(run("{坏的").status, 0);
});

test("projectsDirName：会话记录目录名 = 路径里非字母数字都换成 -", () => {
  assert.equal(projectsDirName("/home/power/e2e-1016"), "-home-power-e2e-1016");
  assert.equal(projectsDirName("/home/a/我的 作品"), "-home-a------", "实测：中文字和空格各换成一个 -");
});

function fakeHome(root, lines) {
  const home = mkdtempSync(join(tmpdir(), "st-home-"));
  const dir = join(home, ".claude/projects", projectsDirName(root));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "s1.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return home;
}
const toolUse = (name, input) => ({ type: "assistant", timestamp: new Date().toISOString(), message: { content: [{ type: "tool_use", name, input }] } });

test("review：失败按报错归类计数；会话里翻工具包源码的地方列出来（读 SKILL.md、references 不算）", () => {
  const root = project();
  mkdirSync(join(root, ".studio/log"), { recursive: true });
  const at = new Date().toISOString();
  const entries = [
    { at, ok: false, exit: 1, tools: ["vo"], command: "vo 抖音", problems: ["✗ fetch failed"] },
    { at, ok: false, exit: 1, tools: ["vo"], command: "vo 抖音 --pause 0.3", problems: ["✗ fetch failed"] },
    { at, ok: true, tools: ["kv"], command: "kv status .", problems: ["⚠ 选题关没确认"] },
  ];
  writeFileSync(join(root, ".studio/log/2026-10-17.jsonl"), entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
  const src = join(TOOLKIT_DIR, "scenario-content/scripts/rec.mjs");
  const home = fakeHome(root, [
    toolUse("Read", { file_path: src }),
    toolUse("Read", { file_path: join(TOOLKIT_DIR, "studio/SKILL.md") }),
    toolUse("Bash", { command: `grep -n REC_TIMEOUT ${join(TOOLKIT_DIR, "scenario-content/scripts/rec/screencast.py")}` }),
  ]);
  const text = review(root, { sinceDays: 7, home });
  assert.match(text, /✗ fetch failed.*2 次/);
  assert.match(text, /vo/);
  assert.match(text, /scenario-content\/scripts\/rec\.mjs/);
  assert.match(text, /scenario-content\/scripts\/rec\/screencast\.py/);
  assert.doesNotMatch(text, /studio\/SKILL\.md/);
});

test("review：先 cd 进工具包再用相对路径翻、从 ~/.claude/skills/<名字>/ 读源码，也算", () => {
  const root = project();
  const home = fakeHome(root, [
    toolUse("Bash", { command: `cd ${join(TOOLKIT_DIR, "studio")}; ls scripts skeleton; grep -rn account scripts/lib/*.mjs | head` }),
    toolUse("Read", { file_path: "SKILLS/scenario-content/scripts/rec.mjs" }),
    toolUse("Read", { file_path: "SKILLS/studio/references/workflow.md" }),
  ].map((r) => JSON.parse(JSON.stringify(r).replaceAll("SKILLS", "HOME_SKILLS"))));
  // fakeHome 之后才知道 home，把占位换成真实的 ~/.claude/skills
  const dir = join(home, ".claude/projects", projectsDirName(root));
  const f = join(dir, "s1.jsonl");
  writeFileSync(f, readFileSync(f, "utf8").replaceAll("HOME_SKILLS", join(home, ".claude/skills")));
  const text = review(root, { sinceDays: 7, home });
  assert.match(text, /studio\/scripts\/lib\/\*\.mjs/);
  assert.match(text, /scenario-content\/scripts\/rec\.mjs/);
  assert.doesNotMatch(text, /workflow\.md/);
});

test("review：工具问题.md 里记的、各期确认节点的修改意见（偏好候选）都列出来；「通过」这类不列", () => {
  const root = project();
  mkdirSync(join(root, "07-复盘"), { recursive: true });
  writeFileSync(join(root, "07-复盘/工具问题.md"), "# 工具问题\n\n- 2026-10-17 · vd build · 报错看不懂，翻了源码 · 01-群聊\n");
  writeFileSync(join(root, "04-作品/AI办公/01-群聊/run.json"), JSON.stringify({
    gates: {
      sample: { passed: true, at: "2026-10-17", quote: "这版可以，通过", edits: [{ at: "2026-10-16", quote: "下半屏太空了，内容往下铺" }] },
      topic: { passed: true, at: "2026-10-15", quote: "通过", history: [{ at: "2026-10-14", quote: "领模板改成公众号回复关键词" }] },
    },
  }));
  const text = review(root, { sinceDays: 7, home: mkdtempSync(join(tmpdir(), "st-home-")) });
  assert.match(text, /报错看不懂，翻了源码/);
  assert.match(text, /2026-10-16 01-群聊 ③b：「下半屏太空了，内容往下铺」/);
  assert.match(text, /领模板改成公众号回复关键词/);
  assert.doesNotMatch(text, /「通过」/);
  assert.match(text, /00-规划\/偏好\.md/);
});

test("review：什么都没有时说清楚，不报错", () => {
  const text = review(project(), { sinceDays: 7, home: mkdtempSync(join(tmpdir(), "st-home-")) });
  assert.match(text, /没有记录到工具包命令/);
});
