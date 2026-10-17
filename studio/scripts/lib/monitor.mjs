// st log-hook：作品项目的 Claude Code 钩子（.claude/settings.json 的 PostToolUse / PostToolUseFailure）调用。
// 只记工具包命令（st kv sc vo vd vdraft wa ic bd pd）：命令、成败、退出码、输出里的 ✗ / ⚠ 行、用时，
// 写到 <项目根>/.studio/log/<日期>.jsonl，给 st review 汇总。钩子永远不能挡住 Claude：任何错误都吞掉、退出码 0。
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { findRoot } from "./project.mjs";

const TOOLS = ["st", "kv", "sc", "vo", "vd", "vdraft", "wa", "ic", "bd", "pd"];
// 命令开头、或 ; & | ( 之后的工具名才算（cat vd.log、路径里的 /vd/ 不算）
const TOOL_RE = new RegExp(`(?:^|[;&|(]\\s*)(${TOOLS.join("|")})(?=\\s|$)`, "gm");
const PROBLEM_RE = /^\s*[✗⚠]/;
const MAX_PROBLEMS = 8;

/** 钩子收到的 JSON → 一条日志；不是工具包命令返回 null */
export function logEntry(p) {
  if (p?.tool_name !== "Bash") return null;
  const command = String(p.tool_input?.command ?? "");
  const tools = [...new Set([...command.matchAll(TOOL_RE)].map((m) => m[1]))];
  if (!tools.length) return null;
  const failed = p.hook_event_name === "PostToolUseFailure";
  const output = failed ? String(p.error ?? "") : `${p.tool_response?.stdout ?? ""}\n${p.tool_response?.stderr ?? ""}`;
  const lines = output.split("\n").map((l) => l.trimEnd()).filter(Boolean);
  const exit = failed ? Number(output.match(/^Exit code (\d+)/)?.[1] ?? NaN) : 0;
  return {
    at: new Date().toISOString(),
    session: p.session_id ?? "",
    cwd: p.cwd ?? "",
    tools,
    command: command.slice(0, 400),
    ok: !failed,
    ...(failed ? { exit: Number.isNaN(exit) ? null : exit, tail: lines.slice(-3).join("\n").slice(0, 600) } : {}),
    problems: lines.filter((l) => PROBLEM_RE.test(l)).map((l) => l.trim().slice(0, 300)).slice(0, MAX_PROBLEMS),
    ms: p.duration_ms ?? null,
  };
}

const today = () => new Date().toISOString().slice(0, 10);

/** 读 stdin 的钩子 JSON，在作品项目里就追加一行日志；出任何错都不影响 Claude */
export function logHook(input) {
  try {
    const p = JSON.parse(input);
    const entry = logEntry(p);
    const root = entry && findRoot(p.cwd || process.cwd());
    if (!root) return;
    const dir = join(root, ".studio", "log");
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, `${today()}.jsonl`), `${JSON.stringify(entry)}\n`);
  } catch {
    // 钩子出错不能挡住 Claude 的工作
  }
}
