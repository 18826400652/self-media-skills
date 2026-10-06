// research.json + 脚本依据 → 研究简报（Markdown），给人在确认节点 ① 对照：每条事实旁边列出引用它的口播原句。
import { basisOf } from "./script.mjs";

const CONF = { high: "高", medium: "中", low: "低" };
const TYPE = { official: "官方", paper: "论文", media: "媒体", other: "其他" };

function claimBlock(c, refs) {
  const out = [`### ${c.id} · 可信度 ${CONF[c.confidence] ?? c.confidence}${c.kind === "number" ? " · 数字" : ""}`, "", c.text, ""];
  for (const s of c.sources ?? []) {
    out.push(`- [${s.title}](${s.url})（${TYPE[s.type] ?? s.type} · 查阅 ${s.accessed}）`, `  > ${s.quote}`);
  }
  if (refs.length) out.push(`- 口播：${refs.map((l) => `第 ${l.frame} 句「${l.text}」`).join("；")}`);
  out.push("");
  return out;
}

/** @returns {string} */
export function renderBrief(research, lines) {
  const refs = new Map(); // claim id → 引用它的口播（按句序）
  const labeled = [];
  for (const l of lines) {
    const b = basisOf(l.basis);
    if (b.kind === "claims") b.ids.forEach((id) => refs.set(id, [...(refs.get(id) ?? []), l]));
    else if (b.kind === "类比" || b.kind === "观点") labeled.push({ ...l, kind: b.kind });
  }
  const claims = research.claims ?? [];
  const used = claims.filter((c) => refs.has(c.id));
  const unused = claims.filter((c) => !refs.has(c.id));
  const out = [`# 研究简报：${research.topic ?? ""}`, ""];
  if (research.question) out.push(`> 这期要回答：${research.question}`, "");
  out.push(`## 脚本用到的事实（${used.length} 条）`, "");
  used.forEach((c) => out.push(...claimBlock(c, refs.get(c.id))));
  if (unused.length) {
    out.push(`## 没被脚本用到的事实（${unused.length} 条）`, "");
    unused.forEach((c) => out.push(...claimBlock(c, [])));
  }
  if (research.open_questions?.length) {
    out.push("## 没查到可靠来源的问题", "", ...research.open_questions.map((q) => `- ${q}`), "");
  }
  if (labeled.length) {
    out.push("## 类比和观点句（不需要来源）", "", ...labeled.map((l) => `- 第 ${l.frame} 句（${l.kind}）「${l.text}」`), "");
  }
  return out.join("\n");
}
