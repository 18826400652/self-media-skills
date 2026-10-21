// audio_meta.json（vo）→ 全片字流 → @词 的秒数
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
  return { start: stream[i].start, end: stream[i + needle.length - 1].end, lines: hits.map((h) => stream[h].line) };
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
    const seg = { id: s.id, start: a.start, duration: round(b.end - a.start), transition: s.transition ?? "auto", overlays: [] };
    const component = s.shot && s.shot !== "custom" ? s.shot : s.component;
    // 组件段几拍之间画面不动：默认整段慢推镜（VDACT.applyDrift）；镜头自带动作，不加
    const drift = s.drift ?? (!!s.component && !s.shot);
    if (component) return { ...seg, component, vars: s.vars ?? {}, drift };
    if (s.shot === "custom") return { ...seg, custom: { reason: s.reason, need: s.need, candidate: s.candidate } };
    return seg;
  });
}

export function buildCues({ vd, tokens }, meta) {
  const stream = charStream(meta);
  const lines = lineTimes(meta);
  const cues = {};
  const warnings = [];
  for (const t of tokens) {
    const r = resolveCue(stream, t.text, t.nth);
    cues[t.nth > 1 ? `${t.text}#${t.nth}` : t.text] = r.start;
    if (t.nth === 1 && r.lines.length > 1)
      warnings.push(`@${t.text} 在口播里出现了 ${r.lines.length} 次（第 ${r.lines.join("、")} 句），现在用的是第 1 次；要别的写 @${t.text}#2`);
  }
  const segments = segmentTimes(vd.segments, lines).map((s, i) => {
    const overlays = (vd.segments[i].overlays ?? []).map((o) => overlayTimes(s, o, stream, cues));
    return { ...withVarCues(s, stream, cues), overlays };
  });
  return { cues, warnings, segments, lines, total: lines.at(-1).end };
}

const CUE = /^@(.+?)(?:#(\d+))?$/;

const cueTime = (raw, stream, cues) => {
  const m = raw.trim().match(CUE);
  const nth = m[2] ? Number(m[2]) : 1;
  return cues[nth > 1 ? `${m[1]}#${nth}` : m[1]] ?? resolveCue(stream, m[1], nth).start;
};

/** 段里的叠加镜头：从 @词 开始到段尾；它的 vars.cues 从 overlay 开始算 */
function overlayTimes(seg, o, stream, cues) {
  const t = cueTime(o.at, stream, cues);
  const end = seg.start + seg.duration;
  if (t < seg.start || t > end)
    throw new Error(`段 ${seg.id} 的 overlay「${o.at}」在 ${round(t)} 秒，不在这一段（${round(seg.start)}–${round(end)} 秒）里`);
  const ov = { id: seg.id, component: o.shot, start: t, duration: round(end - t), vars: o.vars ?? {} };
  const { id: _id, ...rest } = withVarCues(ov, stream, cues);
  return rest;
}

/** 组件段 vars.cues（| 隔开）里的 @词 → 从这段开头算的秒数，交给组件的 HF.cues；数字原样保留 */
function withVarCues(seg, stream, cues) {
  // JSON 列表是 dy-rec-phone 自己的 cues 格式（点击、框选，每项带 t），原样交给组件
  if (typeof seg.vars?.cues !== "string" || seg.vars.cues.trim().startsWith("[")) return seg;
  const beats = seg.vars.cues.split("|").map((raw, i) => {
    const m = raw.trim().match(CUE);
    if (!m) return raw.trim();
    const nth = m[2] ? Number(m[2]) : 1;
    const t = cues[nth > 1 ? `${m[1]}#${nth}` : m[1]] ?? resolveCue(stream, m[1], nth).start;
    const rel = round(t - seg.start);
    if (rel < 0 || rel > seg.duration)
      throw new Error(`段 ${seg.id} 的 cues 第 ${i + 1} 拍「${raw.trim()}」在 ${round(t)} 秒，不在这一段（${round(seg.start)}–${round(seg.start + seg.duration)} 秒）里`);
    return String(rel);
  });
  const names = seg.vars.cues.split("|").map((raw) => raw.trim().match(CUE)?.[1] ?? "");
  return { ...seg, vars: { ...seg.vars, cues: beats.join("|"), cueNames: names.join("|") } };
}
