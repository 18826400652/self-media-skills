// st review：汇总作品项目里的工具问题和偏好候选，给人看、也给 Claude 看。
//   1. .studio/log/*.jsonl（st log-hook 记的）：失败按报错归类计数，✗ / ⚠ 提示按出现次数排
//   2. Claude Code 会话记录（~/.claude/projects/<目录名>/*.jsonl）：翻了工具包源码的地方 = 文档没写清
//   3. 07-复盘/工具问题.md：Claude 按 CLAUDE.md 规则手记的
//   4. 各期 run.json 里确认节点的修改意见和旧原话：挑出长期偏好记进 00-规划/偏好.md
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import { TOOLKIT_DIR } from "./project.mjs";

const DAY = 86400000;
const GATE_LABEL = { topic: "①", script: "②", director: "③a", sample: "③b", final: "④" };
// 读这些不算「翻源码」：本来就该读的说明
const DOC_RE = /(^|\/)(SKILL\.md|README\.md|(references|templates|evals)(\/|$))/;
const TRIVIAL_RE = /^(通过|可以|好|好的|行|ok|没问题)[。！!.，, ]*$/i;
const MAX_ROWS = 15;

/** Claude Code 把启动目录变成会话记录目录名的规则：非字母数字都换成 - */
export const projectsDirName = (dir) => dir.replace(/[^A-Za-z0-9]/g, "-");

function readJsonl(file) {
  return readFileSync(file, "utf8").split("\n").filter(Boolean).flatMap((l) => {
    try { return [JSON.parse(l)]; } catch { return []; }
  });
}

const recent = (sinceMs) => (file) => statSync(file).mtimeMs >= sinceMs;

function countBy(items, key) {
  const m = new Map();
  for (const it of items) {
    const k = key(it);
    const prev = m.get(k);
    m.set(k, { item: prev?.item ?? it, n: (prev?.n ?? 0) + 1 });
  }
  return [...m.values()].sort((a, b) => b.n - a.n);
}

function logSection(root, sinceMs) {
  const dir = join(root, ".studio/log");
  const entries = existsSync(dir)
    ? readdirSync(dir).filter((f) => f.endsWith(".jsonl")).map((f) => join(dir, f)).filter(recent(sinceMs)).flatMap(readJsonl).filter((e) => Date.parse(e.at) >= sinceMs)
    : [];
  if (!entries.length) return ["## 工具包命令", "", "没有记录到工具包命令（作品项目的 .claude/settings.json 没配钩子？跑 st doctor 看）。"];
  const failed = entries.filter((e) => !e.ok);
  const out = ["## 工具包命令", "", `共 ${entries.length} 次，失败 ${failed.length} 次。`, ""];
  if (failed.length) {
    out.push("### 失败（按报错归类）", "");
    for (const { item, n } of countBy(failed, (e) => e.problems?.[0] ?? e.tail?.split("\n").at(-1) ?? `退出码 ${e.exit}`).slice(0, MAX_ROWS)) {
      out.push(`- ${item.problems?.[0] ?? item.tail?.split("\n").at(-1) ?? `退出码 ${item.exit}`}（${n} 次；${item.tools.join("、")}；例：\`${item.command.slice(0, 120)}\`）`);
    }
    out.push("");
  }
  const warns = entries.filter((e) => e.ok).flatMap((e) => (e.problems ?? []).map((p) => ({ p, tools: e.tools })));
  if (warns.length) {
    out.push("### 成功但带 ✗ / ⚠ 的提示", "");
    for (const { item, n } of countBy(warns, (w) => w.p).slice(0, MAX_ROWS)) out.push(`- ${item.p}（${n} 次；${item.tools.join("、")}）`);
    out.push("");
  }
  return out;
}

const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const READ_VERB = /\b(cat|sed|grep|rg|head|tail|less|awk|ls|find)\b/;

/** 一条工具调用里碰到的工具包文件（相对工具包的路径）。roots：工具包目录、~/.claude/skills（skill 软链在这里） */
function toolkitPaths(c, roots) {
  if (c.name === "Read") {
    const f = c.input?.file_path ?? "";
    const root = roots.find((r) => f.startsWith(`${r}/`));
    return root ? [f.slice(root.length + 1)] : [];
  }
  const cmd = c.name === "Bash" ? c.input?.command ?? "" : "";
  if (!READ_VERB.test(cmd)) return [];
  const out = [];
  for (const r of roots) {
    for (const m of cmd.matchAll(new RegExp(`${esc(r)}/([^\\s'"|;&)]+)`, "g"))) out.push(m[1]);
    // 先 cd 进工具包，再用相对路径翻：cd <工具包>/studio; grep scripts/lib/*.mjs
    const cd = cmd.match(new RegExp(`\\bcd\\s+${esc(r)}/([^\\s;&]+)`));
    if (cd) for (const m of cmd.matchAll(/(?:^|\s)((?:scripts|lib|bin|tts|tests)\/[^\s'"|;&)]*)/g)) out.push(`${cd[1]}/${m[1]}`);
  }
  return out;
}

/** 会话里读了工具包里哪些「不是文档」的文件 */
function sourceReads(root, home, sinceMs, toolkit) {
  const base = join(home, ".claude/projects");
  if (!existsSync(base)) return [];
  const prefix = projectsDirName(root);
  const dirs = readdirSync(base).filter((d) => d === prefix || d.startsWith(`${prefix}-`)).map((d) => join(base, d));
  const roots = [toolkit, join(home, ".claude/skills")];
  const hits = [];
  for (const file of dirs.flatMap((d) => readdirSync(d).filter((f) => f.endsWith(".jsonl")).map((f) => join(d, f))).filter(recent(sinceMs))) {
    for (const rec of readJsonl(file)) {
      for (const c of rec.message?.content ?? []) {
        if (c?.type === "tool_use") hits.push(...toolkitPaths(c, roots).filter((rel) => !DOC_RE.test(rel)));
      }
    }
  }
  return hits;
}

function sourceSection(root, home, sinceMs, toolkit) {
  const hits = sourceReads(root, home, sinceMs, toolkit);
  const out = ["## 翻了工具包源码的地方（说明文档没写清）", ""];
  if (!hits.length) return [...out, "没有。"];
  for (const { item, n } of countBy(hits, (h) => h).slice(0, MAX_ROWS)) out.push(`- ${item}（${n} 次）`);
  return out;
}

function notesSection(root) {
  const f = join(root, "07-复盘/工具问题.md");
  const items = existsSync(f) ? readFileSync(f, "utf8").split("\n").filter((l) => /^\s*-\s+\d{4}-\d{2}-\d{2}/.test(l)) : [];
  return ["## 工具问题.md 里记的", "", ...(items.length ? items.map((l) => l.trim()) : ["没有。"])];
}

function runFiles(dir, depth = 0) {
  if (!existsSync(dir) || depth > 3) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isFile() && e.name === "run.json") return [p];
    return e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules" ? runFiles(p, depth + 1) : [];
  });
}

function prefSection(root) {
  const works = (() => {
    try { return JSON.parse(readFileSync(join(root, "studio.json"), "utf8")).works ?? "04-作品"; } catch { return "04-作品"; }
  })();
  const said = [];
  for (const f of runFiles(join(root, works))) {
    let run;
    try { run = JSON.parse(readFileSync(f, "utf8")); } catch { continue; }
    const ep = relative(join(root, works), join(f, "..")).split("/").pop();
    for (const [gate, g] of Object.entries(run.gates ?? {})) {
      for (const q of [...(g.edits ?? []), ...(g.history ?? []), ...(g.quote ? [{ at: g.at, quote: g.quote }] : [])]) {
        if (q.quote && !TRIVIAL_RE.test(q.quote.trim())) said.push(`- ${q.at ?? ""} ${ep} ${GATE_LABEL[gate] ?? gate}：「${q.quote}」`);
      }
    }
  }
  const out = ["## 确认节点里说过的话（偏好候选）", "", "挑出「以后都这样」的，记进 `00-规划/偏好.md`；只针对某一期的不用记。", ""];
  return [...out, ...(said.length ? said.sort() : ["没有。"])];
}

/** 生成汇总（Markdown 文本） */
export function review(root, { sinceDays = 7, home = homedir(), toolkit = TOOLKIT_DIR } = {}) {
  const sinceMs = Date.now() - sinceDays * DAY;
  return [
    `# 工具检查（最近 ${sinceDays} 天，${root}）`, "",
    ...logSection(root, sinceMs), "",
    ...sourceSection(root, home, sinceMs, toolkit), "",
    ...notesSection(root), "",
    ...prefSection(root), "",
  ].join("\n");
}
