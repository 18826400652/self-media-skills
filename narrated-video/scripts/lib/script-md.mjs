// 解析 脚本.md 的「分镜」表格：一行 = 一句口播。
import { readFileSync } from "node:fs";

const SPLIT_KEYWORDS = /[、,，\s]+/;

function cells(row) {
  return row
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());
}

/** @returns {{ n: number, text: string, highlights: string[] }[]} */
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
    }));

  if (lines.length === 0) {
    throw new Error(`${scriptPath}: 分镜表格里没有填写口播的行`);
  }
  return lines;
}
