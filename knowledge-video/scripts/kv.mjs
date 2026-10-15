#!/usr/bin/env node
// 用法：kv check|brief|status|init|gate|done <作品目录> …
//   check   检查 research.json、SCRIPT.md 的依据、qa.json（存在时）。有 ✗ 退出码 1
//   brief   research.json → 研究简报.md（给人在确认节点 ① 看）
//   status  当前阶段、下一步、还没通过的确认节点（实用类：完整一期的 14 步）
//   init    [--fresh] [--video director|template]   新建 run.json（有 场景卡.md 为实用类）；--fresh 记下刚生成的模板，用来判断「还没写」；--video 视频做法
//   gate    <节点> [--edit] "用户原话"   记录用户确认（实用类：topic script storyboard final）
//   done    <wechat|xiaohongshu|douyin>   存草稿成功后记一笔
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { renderBrief } from "./lib/brief.mjs";
import { loadConfig } from "./lib/config.mjs";
import { validateQa } from "./lib/qa.mjs";
import { parseResearchJson, validateResearch } from "./lib/research.mjs";
import { checkBasis, parseScriptBasis } from "./lib/script.mjs";
import { detectStatus, isEvidenceFilled, isScriptFilled } from "./lib/status.mjs";
import { DRAFT_KEYS, GATE_LABEL as P_GATE_LABEL, doneBlocker, gateBlocker, gatesFor, practicalStatus } from "./lib/practical.mjs";
import { DIRECTOR_DIR, FINAL_RE, videoMode } from "./lib/video.mjs";
import { collectPracticalFacts, defaultRunners, fingerprint, templateHashes } from "./lib/practical-facts.mjs";

export const FILES = { brief: "brief.md", research: "research.json", script: "抖音/SCRIPT.md", qa: "qa.json", run: "run.json" };
const USAGE = "用法：kv check|brief|status <作品目录>\n      kv init <作品目录> [--fresh] [--video director|template]\n      kv gate <作品目录> <节点> [--edit] \"用户原话\"\n      kv done <作品目录> <wechat|xiaohongshu|douyin>";

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
    // research.json 有错时不拿它核对 claim（格式不对会让核对本身出错）；只检查依据行存在和写法
    research = r.issues.some((i) => i.level === "error") ? null : r.data;
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

const GATE_LABEL = { script: "① 研究简报 + 脚本", storyboard: "② 分镜总览图", director: "②a 导演脚本", sample: "②b 风格样片", final: "③ 成片" };
const CONCEPT_GATES = { template: ["script", "storyboard", "final"], director: ["script", "director", "sample", "final"] };
const TYPE_LABEL = { concept: "概念科普", practical: "实用技巧" };

function hasFileIn(dir, sub, re) {
  const p = join(dir, sub);
  return existsSync(p) && readdirSync(p).some((f) => re.test(f));
}

/** 文件存在、且不是没填的模板（新建作品脚本会预先放好空模板） */
function fileFilled(path, filled) {
  return existsSync(path) && filled(readFileSync(path, "utf8"));
}

/** 读作品目录里的文件和 run.json，交给 detectStatus */
export function collectFacts(dir) {
  const run = readRun(dir);
  const type = episodeType(run);
  const video = videoMode(run);
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
  const vdQaPath = join(dir, DIRECTOR_DIR, "qa-douyin.json");
  let vdQa = null;
  if (existsSync(vdQaPath)) {
    try {
      vdQa = { passed: JSON.parse(readFileSync(vdQaPath, "utf8")).passed === true };
    } catch {
      vdQa = { passed: false };
    }
  }
  return {
    type,
    video,
    hasBrief: existsSync(join(dir, FILES.brief)),
    hasEvidence: fileFilled(join(dir, type === "practical" ? "实测记录.md" : FILES.research), (t) => isEvidenceFilled(type, t)),
    hasScript: fileFilled(join(dir, FILES.script), isScriptFilled),
    checkOk: !runCheck(dir).issues.some((i) => i.level === "error"),
    hasStoryboard: existsSync(join(dir, "抖音/STORYBOARD.md")),
    hasSheet: existsSync(join(dir, "抖音/snapshots/sheet.jpg")),
    hasDirector: existsSync(join(dir, DIRECTOR_DIR, "DIRECTOR.md")),
    hasSample: existsSync(join(dir, DIRECTOR_DIR, "renders/sample.mp4")),
    hasRender: video === "director" ? hasFileIn(dir, `${DIRECTOR_DIR}/renders`, FINAL_RE) : hasFileIn(dir, "抖音/renders", /\.mp4$/),
    vdQa,
    qa,
    gates: Object.fromEntries(CONCEPT_GATES[video].map((k) => [k, gate(k)])),
  };
}

const TEMPLATES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "templates");
const TEMPLATE_FILES = ["抖音/SCRIPT.md", "抖音/STORYBOARD.md", "公众号/文章.md", "小红书/文案.md", "抖音/发布文案.md"];
const today = () => new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD，本地时区
const oneLine = (s) => s.replace(/\s*\n\s*/g, " ").trim();
const looksPractical = (dir) => existsSync(join(dir, "场景卡.md"));
const writeRun = (dir, run) => writeFileSync(join(dir, FILES.run), JSON.stringify(run, null, 2) + "\n");

function practicalFacts(dir, run) {
  const cfg = loadConfig(dir);
  return collectPracticalFacts(dir, run, { ...defaultRunners(), experienceDir: join(cfg.root, cfg.experienceDir) });
}

/** 读 run.json；实用类目录没有 run.json 时报错（不能当概念科普处理） */
function requirePracticalRun(dir) {
  const run = readRun(dir);
  if (!run && looksPractical(dir)) throw new Error("这是实用类作品，还没有 run.json：先跑 kv init <作品目录>");
  return run;
}

function initRun(dir, args) {
  if (readRun(dir)) throw new Error("已经有 run.json 了");
  const vi = args.indexOf("--video");
  const video = vi >= 0 ? args[vi + 1] : null;
  if (vi >= 0 && !["director", "template"].includes(video)) throw new Error(`--video 只能是 director 或 template：${video ?? "（空）"}`);
  const practical = looksPractical(dir);
  const run = JSON.parse(readFileSync(join(TEMPLATES_DIR, practical ? "run-practical.json" : "run.json"), "utf8"));
  if (video) run.video = video;
  if (practical && args.includes("--fresh")) run.templates = templateHashes(dir, TEMPLATE_FILES);
  writeRun(dir, run);
  console.log(`✓ run.json（${TYPE_LABEL[episodeType(run)]}，视频做法 ${videoMode(run)}）`);
  return 0;
}

/** 选题关通过时同步写「用户确认」行（sc check 读这一行） */
function syncTopicFile(dir, quote) {
  const p = join(dir, "选题关.md");
  const md = readFileSync(p, "utf8");
  const line = `- 用户确认：${today()} 通过（用户：「${quote}」）`;
  const re = /^- 用户确认[：:].*$/m;
  writeFileSync(p, re.test(md) ? md.replace(re, () => line) : `${md.trimEnd()}\n${line}\n`);
}

function recordGate(dir, args) {
  const run = requirePracticalRun(dir);
  if (episodeType(run) !== "practical") throw new Error("kv gate 只用于实用类作品（概念科普按 SKILL.md 手改 run.json）");
  const [gate, ...rest] = args;
  const edit = rest.includes("--edit");
  const quote = oneLine(rest.filter((a) => a !== "--edit").join(" "));
  const allowed = gatesFor(videoMode(run));
  if (!allowed.includes(gate)) throw new Error(`没有这个确认节点：${gate ?? "（空）"}（可选：${allowed.join("、")}）`);
  const g = run.gates?.[gate] ?? { passed: false, at: null, quote: null, fingerprint: null, edits: [] }; // 老 run.json 没有 director、sample
  run.gates = run.gates ?? {};
  if (!quote) throw new Error('要写用户原话：kv gate <作品> <节点> "用户原话"');
  if (edit) {
    run.gates[gate] = { ...g, passed: false, edits: [...(g.edits ?? []), { at: today(), quote }] };
    writeRun(dir, run);
    console.log(`✓ 记下 ${P_GATE_LABEL[gate]} 的修改意见，改完再请用户确认`);
    return 0;
  }
  const blocker = gateBlocker(practicalFacts(dir, run), gate);
  if (blocker) {
    console.log(`✗ 还不能记 ${P_GATE_LABEL[gate]}：${blocker}`);
    return 1;
  }
  if (gate === "topic") syncTopicFile(dir, quote);
  run.gates[gate] = { ...g, passed: true, at: today(), quote, fingerprint: fingerprint(dir, gate, videoMode(run)) };
  writeRun(dir, run);
  console.log(`✓ ${P_GATE_LABEL[gate]} 通过（${today()}「${quote}」）`);
  return 0;
}

function recordDone(dir, args) {
  const run = requirePracticalRun(dir);
  const [key] = args;
  if (!DRAFT_KEYS.includes(key)) throw new Error(`只能记 ${DRAFT_KEYS.join("、")}：${key ?? "（空）"}`);
  const blocker = doneBlocker(practicalFacts(dir, run), key);
  if (blocker) {
    console.log(`✗ 还不能记 ${key}：${blocker}`);
    return 1;
  }
  run.done = { ...(run.done ?? {}), [key]: today() };
  writeRun(dir, run);
  console.log(`✓ ${key} 草稿已记录`);
  return 0;
}

function gateText(row, g) {
  const label = P_GATE_LABEL[row.gate];
  if (row.gateState === "passed") return `  ${label} ✓ ${g.at}「${g.quote}」`;
  if (row.gateState === "stale") return `  ${label} 确认后改过`;
  if (row.gateState === "waiting") return `  ${label} 等用户确认`;
  return "";
}

function printPracticalStatus(dir, run) {
  const s = practicalStatus(practicalFacts(dir, run));
  console.log(`类型：实用技巧（视频做法 ${videoMode(run)}）`);
  for (const r of s.rows) {
    console.log(` ${r.done ? "✓" : "·"} ${String(r.n).padStart(2)} ${r.label}${r.gate ? gateText(r, run.gates?.[r.gate]) : ""}`);
  }
  console.log(`下一步：${s.next}`);
  return 0;
}

function printStatus(dir) {
  const run = requirePracticalRun(dir);
  if (episodeType(run) === "practical") return printPracticalStatus(dir, run);
  const f = collectFacts(dir);
  const s = detectStatus(f);
  console.log(`类型：${TYPE_LABEL[f.type]}（视频做法 ${f.video}）`);
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
  const [cmd, target, ...rest] = argv;
  if (!target || !["check", "brief", "status", "init", "gate", "done"].includes(cmd)) {
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
  if (cmd === "init") return initRun(dir, rest);
  if (cmd === "gate") return recordGate(dir, rest);
  if (cmd === "done") return recordDone(dir, rest);
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
