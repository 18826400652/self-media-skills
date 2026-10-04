// 解析 脚本.md 的「分镜」表格：一行 = 一句口播。
import { readFileSync } from "node:fs";

const SPLIT_KEYWORDS = /[、,，\s]+/;
const SPLIT_SFX = /[;；]+/;
// 一个音效：名字 [+秒数 | @关键词]，如 "whoosh"、"ping +1.2"、"error @数错了"
const SFX_RE = /^([\w.-]+)\s*(?:\+\s*([\d.]+)|@\s*(\S+))?$/;

/** 「音效」列 → [{ name, offset, word }]；写法错了直接报错 */
export function parseSfx(cell, lineNo) {
  return String(cell || "")
    .split(SPLIT_SFX)
    .map((s) => s.trim())
    .filter((s) => s && s !== "-" && s !== "—")
    .map((s) => {
      const m = s.match(SFX_RE);
      if (!m) throw new Error(`第 ${lineNo} 句的音效写法不对：「${s}」（例：whoosh、ping +1.2、error @数错了）`);
      return { name: m[1], offset: m[2] ? Number(m[2]) : 0, word: m[3] || null };
    });
}

function cells(row) {
  return row
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());
}

/** @returns {{ n: number, text: string, highlights: string[], emotion: string, sfx: {name: string, offset: number, word: string|null}[] }[]} */
export function parseScript(scriptPath) {
  const md = readFileSync(scriptPath, "utf8");
  const sectionStart = md.indexOf("## 分镜");
  if (sectionStart < 0) {
    throw new Error(`${scriptPath}: 缺少「## 分镜」小节`);
  }
  const tableRows = md
    .slice(sectionStart)
    .split("\n")
    .filter((l) => l.trim().startsWith("|"));

  const header = tableRows.length ? cells(tableRows[0]) : [];
  const textCol = header.findIndex((h) => h.startsWith("口播"));
  const markCol = header.findIndex((h) => h.startsWith("重点词"));
  const emotionCol = header.findIndex((h) => h.startsWith("情感")); // 可选列：逐句情感
  const sfxCol = header.findIndex((h) => h.startsWith("音效")); // 可选列：逐句音效
  if (textCol < 0) {
    throw new Error(`${scriptPath}: 找不到「## 分镜」表格里的「口播」列`);
  }

  const lines = tableRows
    .map(cells)
    .filter((c) => /^\d+$/.test(c[0]) && c[textCol])
    .map((c) => ({
      n: Number(c[0]),
      text: c[textCol],
      highlights: markCol >= 0 && c[markCol] ? c[markCol].split(SPLIT_KEYWORDS).filter(Boolean) : [],
      emotion: emotionCol >= 0 ? c[emotionCol] ?? "" : "",
      sfx: sfxCol >= 0 ? parseSfx(c[sfxCol], Number(c[0])) : [],
    }));

  if (lines.length === 0) {
    throw new Error(`${scriptPath}: 分镜表格里没有填写口播的行`);
  }
  return lines;
}
