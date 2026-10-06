// research.json 校验：每条事实（claim）都要有可追溯的来源。规则见 SKILL.md「研究」和 references/research.md。
const KINDS = ["fact", "number"];
const CONFIDENCES = ["high", "medium", "low"];
const SOURCE_TYPES = ["official", "paper", "media", "other"];
const ID_RE = /^c\d+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STRONG_MIN_SOURCES = 2; // 数字类、可信度不高的 claim：至少几个来源（或 1 个官方来源）

const error = (msg) => ({ level: "error", msg });
const warn = (msg) => ({ level: "warn", msg });

/** 文本 → { data, issues }；JSON 坏了不抛异常 */
export function parseResearchJson(text) {
  try {
    return { data: JSON.parse(text), issues: [] };
  } catch (err) {
    return { data: null, issues: [error(`research.json 不是合法 JSON：${err.message}`)] };
  }
}

function checkSource(id, s, i) {
  const at = `${id} 的第 ${i + 1} 个来源`;
  const out = [];
  if (!/^https?:\/\//.test(String(s?.url ?? ""))) out.push(error(`${at}：url 要以 http:// 或 https:// 开头`));
  if (!String(s?.quote ?? "").trim()) out.push(error(`${at}：quote 不能为空（摘录来源原文，不要转述）`));
  if (!DATE_RE.test(String(s?.accessed ?? ""))) out.push(error(`${at}：accessed 要写成 YYYY-MM-DD`));
  if (!SOURCE_TYPES.includes(s?.type)) out.push(error(`${at}：type 只能是 official、paper、media、other`));
  return out;
}

function checkClaim(c, seen) {
  const id = String(c?.id ?? "?");
  const out = [];
  if (!ID_RE.test(id)) out.push(error(`${id}：id 要写成 c 加数字（如 c01）`));
  else if (seen.has(id)) out.push(error(`${id}：id 重复`));
  seen.add(id);
  if (!KINDS.includes(c?.kind)) out.push(error(`${id}：kind 只能是 fact 或 number`));
  if (!CONFIDENCES.includes(c?.confidence)) out.push(error(`${id}：confidence 只能是 high、medium、low`));
  const sources = Array.isArray(c?.sources) ? c.sources : [];
  if (!sources.length) return [...out, error(`${id}：至少要有 1 个来源`)];
  sources.forEach((s, i) => out.push(...checkSource(id, s, i)));
  const hasOfficial = sources.some((s) => s?.type === "official");
  const strong = c?.kind === "number" || c?.confidence !== "high";
  if (strong && sources.length < STRONG_MIN_SOURCES && !hasOfficial) {
    out.push(error(`${id}：数字类或可信度不是 high，要 ${STRONG_MIN_SOURCES} 个来源或 1 个官方来源`));
  }
  if (sources.every((s) => s?.type === "media" || s?.type === "other")) {
    out.push(warn(`${id}：只有媒体或其他来源，最好补一个官方文档或论文`));
  }
  return out;
}

/** @returns {{ level: "error"|"warn", msg: string }[]} */
export function validateResearch(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [error("research.json 必须是一个对象")];
  if (!Array.isArray(data.claims)) return [error("research.json 的 claims 必须是数组")];
  const seen = new Set();
  return data.claims.flatMap((c) => checkClaim(c, seen));
}
