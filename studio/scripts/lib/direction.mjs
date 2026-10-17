// 定方向：账号方向（账号定位 + 语气指南 + studio.json 的 account、audience、lead）和每个系列的系列说明，
// 要和用户聊完、用户明确通过后 st confirm 记下原话和指纹；没填完、没确认、确认后改过，st new 都拦。
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { MARKER, STUDIO_DIR, templatePath } from "./project.mjs";
import { substitute } from "./new.mjs";

const ACCOUNT_TEMPLATES = { positioning: "账号定位.md", voiceGuide: "语气指南.md" };
const FIELDS = {
  account: "账号名，公众号作者、封面角标、发草稿核对都用它",
  audience: "目标观众",
  lead: "模板怎么领，如「点头像进粉丝群领」，st new 填进各平台模板",
};
const MAX_GAPS = 12;

const sha = (text) => createHash("sha256").update(text).digest("hex").slice(0, 16);
const today = () => new Date().toLocaleDateString("sv-SE");
const PAREN = /（[^）\n]*）/;
const isSeparator = (l) => /^\|[\s:|-]+\|$/.test(l);
const hasEmptyCell = (l) => /^\|.*\|$/.test(l) && !isSeparator(l) && l.split("|").slice(1, -1).some((c) => !c.trim());
/** 一行看起来还是待填的样子：带「（…）」说明、空列表项、表格有空格子 */
const looksBlank = (l) => PAREN.test(l) || /^(-|\d+\.)$/.test(l) || hasEmptyCell(l);
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const SLOT = /\{\{[^}]+\}\}/;
/**
 * 模板里要用户填的行（标题、引用说明、表格分隔行不算），转成判断文件里某一行还没填的函数。
 * {{…}} 的位置换成什么都认得出；模板这行本身没有待填的样子（如「- 目标观众：{{观众}}」）时，
 * 只有 {{…}} 的位置还是 st init 留的「（目标观众）」才算没填，用户自己写的括号不算
 */
function hintMatchers(template) {
  const lines = template.split("\n").map((l) => l.trim()).filter((l) => l && !/^[#>]/.test(l) && !isSeparator(l));
  const hints = [...new Set(lines.filter((l) => SLOT.test(l) || looksBlank(l)))];
  return hints.map((l) => {
    const re = new RegExp(`^${l.split(SLOT).map(escape).join("(.*)")}$`);
    const selfBlank = looksBlank(l.replace(new RegExp(SLOT.source, "g"), "x"));
    return (line) => {
      const m = line.match(re);
      return !!m && (selfBlank || m.slice(1).every((v) => !v.trim() || /^（[^）\n]*）$/.test(v.trim())));
    };
  });
}

/**
 * 文件里还没填的行：和模板里要填的行对得上，而且还是待填的样子（原样留着「（…）」、空列表项、空格子）。
 * 空列表项、单独一行的说明看不出是哪项，前面带上所在的小标题
 */
export function docGaps(text, template) {
  const matchers = hintMatchers(template);
  let heading = "";
  const gaps = [];
  for (const raw of text.split("\n")) {
    const l = raw.trim();
    if (/^#+ /.test(l)) heading = l.replace(/^#+ /, "");
    if (!looksBlank(l) || !matchers.some((isGap) => isGap(l))) continue;
    gaps.push(heading && /^(（|-$|\d+\.)/.test(l) ? `「${heading}」${/^(-|\d+\.)$/.test(l) ? "下面还是空的" : `：${l}`}` : l);
  }
  return [...new Set(gaps)];
}

const fileGaps = (root, rel, template) => {
  const p = join(root, rel);
  return existsSync(p) ? docGaps(readFileSync(p, "utf8"), template).map((g) => `${rel}：${g}`) : [`${rel}：文件不存在`];
};
const hashFiles = (root, rels) => Object.fromEntries(rels.map((rel) => [rel, existsSync(join(root, rel)) ? sha(readFileSync(join(root, rel))) : null]));
const diffKeys = (was = {}, now = {}) => [...new Set([...Object.keys(was), ...Object.keys(now)])].filter((k) => was[k] !== now[k]);

function judge(gaps, confirmed, now, changedOf) {
  if (gaps.length) return { state: "unfilled", gaps, changed: [] };
  if (!confirmed) return { state: "unconfirmed", gaps, changed: [] };
  const changed = changedOf(confirmed, now);
  return { state: changed.length ? "stale" : "ok", gaps, changed, at: confirmed.at, quote: confirmed.quote };
}

// ---- 账号方向 ----

const accountFiles = (project) => Object.keys(ACCOUNT_TEMPLATES).map((k) => project[k]);
const accountSnapshot = (project) => ({
  files: hashFiles(project.root, accountFiles(project)),
  fields: Object.fromEntries(Object.keys(FIELDS).map((k) => [k, project[k] ?? ""])),
});

export function accountStatus(project) {
  const gaps = [
    ...Object.entries(FIELDS).filter(([k]) => !project[k]).map(([k, use]) => `${MARKER} 的 ${k} 没填：${use}`),
    ...Object.entries(ACCOUNT_TEMPLATES).flatMap(([k, tpl]) => fileGaps(project.root, project[k], readFileSync(join(STUDIO_DIR, "skeleton/00-规划", tpl), "utf8"))),
  ];
  return judge(gaps, project.confirmed?.account, accountSnapshot(project), (c, now) => [
    ...diffKeys(c.files, now.files),
    ...diffKeys(c.fields, now.fields).map((k) => `${MARKER} 的 ${k}`),
  ]);
}

// ---- 系列 ----

const readRegistry = (project) => (existsSync(project.abs.registry) ? JSON.parse(readFileSync(project.abs.registry, "utf8")) : {});
const writeRegistry = (project, reg) => writeFileSync(project.abs.registry, JSON.stringify(reg, null, 2) + "\n");
const seriesDocRel = (project, name) => relative(project.root, join(dirname(project.abs.registry), `${name}.md`));
const seriesTemplate = (project) => readFileSync(templatePath(project, "系列说明模板.md"), "utf8");

export function seriesStatus(project, name) {
  const entry = readRegistry(project)[name];
  if (!entry) return { state: "unregistered", gaps: [], changed: [] };
  const rel = seriesDocRel(project, name);
  return judge(fileGaps(project.root, rel, seriesTemplate(project)), entry.confirmed, hashFiles(project.root, [rel]), (c, now) => diffKeys(c.files, now));
}

// ---- 给人看的说明 ----

const confirmCmd = (series) => (series ? `st confirm series ${series} "用户原话"` : `st confirm account "用户原话"`);
const listGaps = (gaps) => [...gaps.slice(0, MAX_GAPS), ...(gaps.length > MAX_GAPS ? [`……还有 ${gaps.length - MAX_GAPS} 处`] : [])].map((g) => `\n    · ${g}`).join("");

/** 一句话说清现在的状态和下一步；ok 时是「已确认」 */
export function describe(status, series) {
  const who = series ? `系列「${series}」` : "账号方向";
  const how = series ? `系列说明 ${series}.md 一节一节和用户聊` : "按 studio/references/direction.md 一项一项和用户聊";
  switch (status.state) {
    case "ok": return `${who}已确认（${status.at}「${status.quote}」）`;
    case "unregistered": return `${who}没登记：先 st series add ${series}`;
    case "unfilled": return `${who}还没填完（${how}，用户通过后 ${confirmCmd(series)}）：${listGaps(status.gaps)}`;
    case "unconfirmed": return `${who}填完了还没确认：整份复述给用户，用户明确通过后 ${confirmCmd(series)}`;
    case "stale": return `${who}确认后改过（${status.changed.join("、")}）：把改了什么告诉用户，用户再通过后 ${confirmCmd(series)}`;
  }
}

/** st new 前检查：返回没定好的说明（没有问题返回空数组）；单篇只看账号方向 */
export function directionProblems(project, series) {
  const account = accountStatus(project);
  const out = account.state === "ok" ? [] : [describe(account)];
  if (series && series !== "单篇") {
    const s = seriesStatus(project, series);
    if (s.state !== "ok") out.push(describe(s, series));
  }
  return out;
}

// ---- st confirm / st series add ----

const withHistory = (old, rec) => {
  const history = old?.quote ? [...(old.history ?? []), { at: old.at, quote: old.quote }] : old?.history;
  return { ...rec, ...(history ? { history } : {}) };
};
const requireQuote = (quote, usage) => {
  if (!quote?.trim()) throw new Error(`要写用户原话：${usage}`);
  return quote.trim();
};

export function confirmAccount(project, quote) {
  const q = requireQuote(quote, confirmCmd());
  const s = accountStatus(project);
  if (s.state === "unfilled") throw new Error(describe(s));
  const path = join(project.root, MARKER);
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const rec = withHistory(raw.confirmed?.account, { at: today(), quote: q, ...accountSnapshot(project) });
  writeFileSync(path, JSON.stringify({ ...raw, confirmed: { ...raw.confirmed, account: rec } }, null, 2) + "\n");
  return `✓ 账号方向已确认（${rec.at}「${q}」）。下一步：st series add <系列名> --label 显示名，再和用户聊系列说明`;
}

const requireAccount = (project) => {
  const s = accountStatus(project);
  if (s.state !== "ok") throw new Error(`先定账号方向，再定系列。${describe(s)}`);
};

export function confirmSeries(project, name, quote) {
  if (!name) throw new Error(`用法：${confirmCmd("<系列>")}`);
  const q = requireQuote(quote, confirmCmd(name));
  const reg = readRegistry(project);
  if (!reg[name]) throw new Error(`系列「${name}」未登记，已登记的：${Object.keys(reg).join("、") || "（无）"}；新系列先 st series add ${name}`);
  requireAccount(project);
  const s = seriesStatus(project, name);
  if (s.state === "unfilled") throw new Error(describe(s, name));
  const rel = seriesDocRel(project, name);
  const rec = withHistory(reg[name].confirmed, { at: today(), quote: q, files: hashFiles(project.root, [rel]) });
  writeRegistry(project, { ...reg, [name]: { ...reg[name], confirmed: rec } });
  return `✓ 系列「${name}」已确认（${rec.at}「${q}」）。新建一期前先和用户挑题（见 studio/references/direction.md），选定后 st new ${name} <简称>`;
}

export function parseSeriesArgs(argv) {
  const [sub, name, ...rest] = argv;
  const usage = "用法：st series add <系列名> [--label 显示名] [--unit 期] [--type practical|concept]";
  if (sub !== "add" || !name) throw new Error(usage);
  const opts = { name, label: name, unit: "期", type: "practical" };
  for (let i = 0; i < rest.length; i++) {
    const key = { "--label": "label", "--unit": "unit", "--type": "type" }[rest[i]];
    if (!key || !rest[i + 1]) throw new Error(usage);
    opts[key] = rest[++i];
  }
  return opts;
}

export function addSeries(project, { name, label, unit, type }) {
  if (/[/&]/.test(name) || name === "单篇") throw new Error(`系列名里不能有 / 或 &，也不能叫「单篇」：${name}`);
  if (!["practical", "concept"].includes(type)) throw new Error(`--type 只能是 practical 或 concept：${type}`);
  requireAccount(project);
  const reg = readRegistry(project);
  if (reg[name]) throw new Error(`系列「${name}」已经登记了（${project.registry}）`);
  writeRegistry(project, { ...reg, [name]: { label, unit, type } });
  const rel = seriesDocRel(project, name);
  const doc = join(project.root, rel);
  if (!existsSync(doc)) writeFileSync(doc, substitute(seriesTemplate(project), { 系列: label, 观众: project.audience, 账号定位: project.positioning }));
  return [
    `✓ 已登记系列「${name}」（${label}，${type}）；系列说明：${rel}`,
    `下一步：按 ${rel} 一节一节和用户聊（每节先给候选，和账号定位对照），用户通过后 ${confirmCmd(name)}`,
  ];
}
