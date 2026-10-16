// 由 shared/node/script-md.mjs 同步而来，不要在这里改：改正本后跑 st sync-shared
// 抖音 SCRIPT.md 解析：sc（口播检查）、kv（依据检查）、vo（配音）共用同一套规则。
// 标题行：## 或 ###，带 (Frame N)（大小写不限）开一帧；口播行：4 个以上空格或 Tab 开头，一行一句；
// 以 ** 开头的是元数据：Emotion/情感、重点词/Highlight、依据。没有口播的帧不输出。
const HEADING_RE = /^#{2,3}\s+.*?\(frame\s+(\d+)\)/i;
const SPOKEN_RE = /^(?: {4,}|\t)(.+)$/;
const EMOTION_RE = /^\s*\*\*(?:Emotion|情感)[:：]\*\*\s*(\S+)/i;
const KEYWORDS_RE = /^\s*\*\*(?:Highlight|重点词)[:：]\*\*\s*(.+)$/i;
const BASIS_RE = /^\s*\*\*依据[:：]\*\*\s*(.*)$/;
const KEYWORD_SPLIT = /[、,，\s]+/;

/** @returns {{ frame: number, text: string, sentences: string[], emotion: string, keywords: string[], basis: string|null }[]} */
export function parseScript(md) {
  const out = [];
  let cur = null;
  const flush = () => {
    if (cur?.sentences.length) out.push({ ...cur, text: cur.sentences.join("") });
    cur = null;
  };
  for (const line of md.split(/\r?\n/)) {
    const h = line.match(HEADING_RE);
    if (h) {
      flush();
      cur = { frame: Number(h[1]), text: "", sentences: [], emotion: "", keywords: [], basis: null };
      continue;
    }
    if (!cur) continue;
    const emotion = line.match(EMOTION_RE);
    if (emotion) cur.emotion = emotion[1];
    const keywords = line.match(KEYWORDS_RE);
    if (keywords) cur.keywords = keywords[1].split(KEYWORD_SPLIT).filter(Boolean);
    const basis = line.match(BASIS_RE);
    if (basis) cur.basis = basis[1].trim();
    if (/^\s*\*\*/.test(line)) continue;
    const spoken = line.match(SPOKEN_RE);
    if (spoken && spoken[1].trim()) cur.sentences.push(spoken[1].trim());
  }
  flush();
  return out;
}
