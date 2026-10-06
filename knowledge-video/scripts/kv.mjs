#!/usr/bin/env node
// 用法：kv check|brief|status <作品目录>
//   check   检查 research.json、SCRIPT.md 的依据、qa.json（存在时）。有 ✗ 退出码 1
//   brief   research.json → 研究简报.md（给人在确认节点 ① 看）
//   status  当前阶段、下一步、还没通过的确认节点
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { renderBrief } from "./lib/brief.mjs";
import { loadConfig } from "./lib/config.mjs";
import { validateQa } from "./lib/qa.mjs";
import { parseResearchJson, validateResearch } from "./lib/research.mjs";
import { checkBasis, parseScriptBasis } from "./lib/script.mjs";
import { detectStatus } from "./lib/status.mjs";

export const FILES = { brief: "brief.md", research: "research.json", script: "抖音/SCRIPT.md", qa: "qa.json", run: "run.json" };
const USAGE = "用法：kv check|brief|status <作品目录>";

/** run.json → 对象；没有时 null；坏了报中文错误 */
export function readRun(dir) {
  const p = join(dir, FILES.run);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch (err) {
    throw new Error(`run.json 不是合法 JSON：${err.message}`);
  }
}

export const episodeType = (run) => (run?.type === "practical" ? "practical" : "concept");

function readJson(dir, name, validate) {
  const p = join(dir, name);
  if (!existsSync(p)) return { data: null, issues: [], missing: true };
  const parsed = name === FILES.research ? parseResearchJson(readFileSync(p, "utf8")) : (() => {
    try {
      return { data: JSON.parse(readFileSync(p, "utf8")), issues: [] };
    } catch (err) {
      return { data: null, issues: [{ level: "error", msg: `${name} 不是合法 JSON：${err.message}` }] };
    }
  })();
  // 解析失败用解析错误；解析成功（哪怕内容是 null）一律交给校验函数，不能悄悄放过
  return { ...parsed, issues: parsed.issues.length ? parsed.issues : validate(parsed.data), missing: false };
}

/** @returns {{ issues: {level: string, msg: string}[], notes: string[] }} */
export function runCheck(dir) {
  const type = episodeType(readRun(dir));
  const issues = [];
  const notes = [];
  let research = null;
  if (type === "concept") {
    const r = readJson(dir, FILES.research, validateResearch);
    if (r.missing) notes.push("· 还没有 research.json（求真阶段的产物）");
    else if (!r.issues.some((i) => i.level === "error")) notes.push(`✓ research.json：${r.data.claims.length} 条事实都有来源`);
    issues.push(...r.issues);
    research = r.data;
  }
  const scriptPath = join(dir, FILES.script);
  if (!existsSync(scriptPath)) notes.push(`· 还没有 ${FILES.script}`);
  else {
    const lines = parseScriptBasis(readFileSync(scriptPath, "utf8"));
    const si = checkBasis(lines, research, type);
    if (!si.some((i) => i.level === "error")) notes.push(`✓ ${FILES.script}：${lines.length} 句口播都标了依据`);
    issues.push(...si);
  }
  const q = readJson(dir, FILES.qa, validateQa);
  if (!q.missing) {
    if (!q.issues.length) notes.push(`✓ qa.json：${q.data.passed ? "通过" : "未通过"}，${q.data.issues.length} 个问题`);
    issues.push(...q.issues);
  }
  return { issues, notes };
}

function printCheck(dir) {
  const { issues, notes } = runCheck(dir);
  for (const n of notes) console.log(n);
  for (const i of issues) console.log(`${i.level === "error" ? "✗" : "⚠"} ${i.msg}`);
  return issues.some((i) => i.level === "error") ? 1 : 0;
}

const BRIEF_OUT = "研究简报.md";

function writeBrief(dir) {
  const r = readJson(dir, FILES.research, validateResearch);
  if (r.missing) {
    console.log("✗ 还没有 research.json");
    return 1;
  }
  if (r.issues.some((i) => i.level === "error")) {
    console.log("✗ research.json 有错误，先修好（kv check）");
    return 1;
  }
  const scriptPath = join(dir, FILES.script);
  const lines = existsSync(scriptPath) ? parseScriptBasis(readFileSync(scriptPath, "utf8")) : [];
  writeFileSync(join(dir, BRIEF_OUT), renderBrief(r.data, lines));
  console.log(`✓ ${BRIEF_OUT}（${r.data.claims.length} 条事实，${lines.length} 句口播）`);
  return 0;
}

const GATE_LABEL = { script: "① 研究简报 + 脚本", storyboard: "② 分镜总览图", final: "③ 成片" };
const TYPE_LABEL = { concept: "概念科普", practical: "实用技巧" };

function hasFileIn(dir, sub, re) {
  const p = join(dir, sub);
  return existsSync(p) && readdirSync(p).some((f) => re.test(f));
}

/** 读作品目录里的文件和 run.json，交给 detectStatus */
export function collectFacts(dir) {
  const run = readRun(dir);
  const type = episodeType(run);
  const gate = (k) => run?.gates?.[k]?.passed === true;
  const qaPath = join(dir, FILES.qa);
  let qa = null;
  if (existsSync(qaPath)) {
    try {
      qa = { passed: JSON.parse(readFileSync(qaPath, "utf8")).passed === true };
    } catch {
      qa = { passed: false };
    }
  }
  return {
    type,
    hasBrief: existsSync(join(dir, FILES.brief)),
    hasEvidence: existsSync(join(dir, type === "practical" ? "实测记录.md" : FILES.research)),
    hasScript: existsSync(join(dir, FILES.script)),
    checkOk: !runCheck(dir).issues.some((i) => i.level === "error"),
    hasStoryboard: existsSync(join(dir, "抖音/STORYBOARD.md")),
    hasSheet: existsSync(join(dir, "抖音/snapshots/sheet.jpg")),
    hasRender: hasFileIn(dir, "抖音/renders", /\.mp4$/),
    qa,
    gates: { script: gate("script"), storyboard: gate("storyboard"), final: gate("final") },
  };
}

function printStatus(dir) {
  const f = collectFacts(dir);
  const s = detectStatus(f);
  console.log(`类型：${TYPE_LABEL[f.type]}`);
  console.log(`阶段：${s.stage}`);
  console.log(`下一步：${s.next}`);
  if (s.waitingFor) console.log(`等用户确认：${GATE_LABEL[s.waitingFor]}`);
  console.log(`确认节点：${Object.entries(f.gates).map(([k, v]) => `${GATE_LABEL[k]} ${v ? "✓" : "·"}`).join("  ")}`);
  if (s.stage === "done") {
    const cfg = loadConfig(dir);
    console.log(`经验库：${join(cfg.root, cfg.experienceDir)}`);
  }
  return 0;
}

function main(argv) {
  const [cmd, target] = argv;
  if (!target || !["check", "brief", "status"].includes(cmd)) {
    console.error(USAGE);
    return 1;
  }
  const dir = resolve(target);
  if (!existsSync(dir)) {
    console.error(`找不到作品目录：${dir}`);
    return 1;
  }
  if (cmd === "check") return printCheck(dir);
  if (cmd === "brief") return writeBrief(dir);
  return printStatus(dir);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    console.error(`✗ ${err.message}`);
    process.exitCode = 1;
  }
}
