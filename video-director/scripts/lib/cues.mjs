// audio_meta.json（nv hf-audio）→ 全片字流 → @词 的秒数
const KEEP = /[\p{L}\p{N}]/u;
const norm = (s) => Array.from(String(s).toLowerCase()).filter((c) => KEEP.test(c)).join("");
const round = (x) => Math.round(x * 1000) / 1000;

export function lineTimes(meta) {
  let t = 0;
  return [...meta.voices].sort((a, b) => a.frame - b.frame).map((v) => {
    const r = { line: v.frame, start: round(t), end: round(t + v.duration_s) };
    t += v.duration_s;
    return r;
  });
}

/** 每个字一项，时间在所在切片内平均分配；只保留字母和数字 */
export function charStream(meta) {
  const out = [];
  let off = 0;
  for (const v of [...meta.voices].sort((a, b) => a.frame - b.frame)) {
    for (const piece of v.chars?.length ? v.chars : v.words) {
      const chars = Array.from(norm(piece.text));
      const step = (piece.end - piece.start) / Math.max(chars.length, 1);
      chars.forEach((ch, i) => out.push({ ch, start: round(off + piece.start + i * step), end: round(off + piece.start + (i + 1) * step), line: v.frame }));
    }
    off += v.duration_s;
  }
  return out;
}

export function resolveCue(stream, text, nth = 1) {
  const needle = norm(text);
  if (!needle) throw new Error(`@词「${text}」去掉标点后是空的`);
  const hay = stream.map((c) => c.ch).join("");
  const hits = [];
  for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + 1)) hits.push(i);
  if (!hits.length) throw new Error(`口播里找不到「${text}」。最接近的：${closest(hay, needle).join("、")}`);
  if (nth > hits.length) throw new Error(`「${text}」只出现了 ${hits.length} 次，没有第 ${nth} 次`);
  const i = hits[nth - 1];
  return { start: stream[i].start, end: stream[i + needle.length - 1].end };
}

/** 同长度子串里，和目标逐字相同最多的 3 个（去重） */
function closest(hay, needle) {
  const n = needle.length;
  const scored = [];
  for (let i = 0; i + n <= hay.length; i++) {
    const sub = hay.slice(i, i + n);
    let same = 0;
    for (let k = 0; k < n; k++) if (sub[k] === needle[k]) same++;
    scored.push([same, sub]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  return [...new Set(scored.map((s) => s[1]))].slice(0, 3);
}

export function segmentTimes(segments, lines) {
  const byLine = new Map(lines.map((l) => [l.line, l]));
  return segments.map((s) => {
    const a = byLine.get(s.lines[0]), b = byLine.get(s.lines[1]);
    if (!a || !b) throw new Error(`段 ${s.id} 的句号 ${s.lines.join("–")} 超出配音范围（共 ${lines.length} 句）`);
    return { id: s.id, start: a.start, duration: round(b.end - a.start) };
  });
}

export function buildCues({ vd, tokens }, meta) {
  const stream = charStream(meta);
  const lines = lineTimes(meta);
  const cues = {};
  for (const t of tokens) cues[t.nth > 1 ? `${t.text}#${t.nth}` : t.text] = resolveCue(stream, t.text, t.nth).start;
  return { cues, segments: segmentTimes(vd.segments, lines), lines, total: lines.at(-1).end };
}
