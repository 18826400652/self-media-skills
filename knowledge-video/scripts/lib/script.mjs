// SCRIPT.md 每句口播的「依据」检查：引用哪几条 claim，或是类比、观点。解析用 shared/script-md 的 parseScript（basis 字段）。
// 口播块：「## Line N — 标签 (Frame N)」，口播是缩进 4 格的行；依据写一行「**依据:** c01, c03」。
const SPLIT_RE = /[,，、\s]+/;
const CLAIM_RE = /^c\d+$/;
const LABELS = ["类比", "观点"];

/** 依据原文 → { kind, ids } */
export function basisOf(raw) {
  const parts = String(raw ?? "").split(SPLIT_RE).filter(Boolean);
  if (parts.length === 1 && LABELS.includes(parts[0])) return { kind: parts[0], ids: [] };
  if (parts.length && parts.every((p) => CLAIM_RE.test(p))) return { kind: "claims", ids: parts };
  return { kind: "invalid", ids: [] };
}

const error = (msg) => ({ level: "error", msg });
const warn = (msg) => ({ level: "warn", msg });

/**
 * 核对每句依据。type = "practical"（实用技巧）时只要求依据行存在且非空（依据是实测轮次，如 R1）。
 * research 为 null 时不核对 claim 是否存在。
 */
export function checkBasis(lines, research, type = "concept") {
  if (!lines.length) return [error("SCRIPT.md 里没有读到口播（检查「## Line N … (Frame N)」标题和缩进 4 格的口播行）")];
  const issues = [];
  const known = new Set((research?.claims ?? []).map((c) => c?.id));
  const used = new Set();
  for (const l of lines) {
    if (!l.basis) {
      issues.push(error(`第 ${l.frame} 句：缺少「**依据:**」一行`));
      continue;
    }
    if (type === "practical") continue;
    const b = basisOf(l.basis);
    if (b.kind === "invalid") {
      issues.push(error(`第 ${l.frame} 句：依据只能是 claim 编号、「类比」或「观点」，不能混用（现在是「${l.basis}」）`));
      continue;
    }
    for (const id of b.ids) {
      used.add(id);
      if (research && !known.has(id)) issues.push(error(`第 ${l.frame} 句：引用的 ${id} 不在 research.json 里`));
    }
  }
  if (research && type !== "practical") {
    const unused = [...known].filter((id) => id && !used.has(id));
    if (unused.length) issues.push(warn(`${unused.join("、")} 没被脚本用到（研究多余，或脚本漏了重点）`));
  }
  return issues;
}
