// 字幕分组：audio_meta.json（每帧的词，帧内时间）→ caption_groups.json（全片时间），vd 的字幕组件读它。
//
// 分组规则移植自 HyperFrames（https://github.com/heygen-com/hyperframes）faceless-explainer skill 的
// scripts/captions.mjs（hyperframes 0.8.143），许可证 Apache-2.0，版权归原作者。
// 改动：帧的开始时间改用 audio_meta 各帧 duration_s 累加（原来从 STORYBOARD.md 读）；只算分组，不生成字幕 HTML。
const SILENCE_GAP = 0.18; // 和上一个词之间静音超过这么多秒 → 开新组
const TAIL_PAD = 0.12; // 一组在最后一个词说完后多停留的秒数
const SENT_END = /[.?!,;:—]$/;
const BARE_PUNCT = /^[.?!,;:—–-]+$/;
const DENSITY_WINDOW = 1.0; // 秒：算语速用的窗口
const WIDTH = 1080;
const HEIGHT = 1920;

const r3 = (x) => Number(x.toFixed(3));
const wordCap = (density) => (density > 3.5 ? 2 : density > 2.5 ? 3 : 4);

/** 各帧的词 → 全片时间的词流（按开始时间排好） */
function absoluteWords(voices) {
  const words = [];
  let base = 0;
  for (const v of [...voices].sort((a, b) => a.frame - b.frame)) {
    for (const w of v.words ?? []) {
      const text = String(w.text ?? "").trim();
      if (!text || BARE_PUNCT.test(text) || !Number.isFinite(w.start) || !Number.isFinite(w.end)) continue;
      words.push({ text, start: r3(base + w.start), end: r3(base + w.end), frame: v.frame });
    }
    base += v.duration_s;
  }
  return words.sort((a, b) => a.start - b.start);
}

/** 换帧、静音、字数满了开新组；句末标点收组 */
function group(words) {
  const densityAt = (i) => {
    const t0 = words[i].start;
    let n = 0;
    for (let j = i; j < words.length && words[j].start < t0 + DENSITY_WINDOW; j++) n++;
    return n / DENSITY_WINDOW;
  };
  const groups = [];
  let cur = null;
  words.forEach((w, i) => {
    const prev = cur?.words.at(-1);
    if (!cur || w.frame !== cur.frame || (prev && w.start - prev.end > SILENCE_GAP) || cur.words.length >= cur.cap) {
      if (cur) groups.push(cur);
      cur = { frame: w.frame, cap: wordCap(densityAt(i)), words: [] };
    }
    cur.words.push(w);
    if (SENT_END.test(w.text)) {
      groups.push(cur);
      cur = null;
    }
  });
  if (cur) groups.push(cur);
  return groups;
}

export function buildCaptionGroups(meta) {
  const voices = meta.voices ?? [];
  const groups = group(absoluteWords(voices));
  return {
    total_duration_s: r3(voices.reduce((a, v) => a + v.duration_s, 0)),
    width: WIDTH,
    height: HEIGHT,
    groups: groups.map((g, gi) => {
      const next = groups[gi + 1];
      let end = r3(g.words.at(-1).end + TAIL_PAD);
      if (next && next.words[0].start < end) end = r3(next.words[0].start);
      return {
        id: `caption-group-${gi}`,
        frame: g.frame,
        start: r3(g.words[0].start),
        end,
        text: g.words.map((w) => w.text).join(" "),
        words: g.words.map((w, wi) => ({ id: `caption-word-${gi}-${wi}`, text: w.text, start: w.start, end: w.end })),
      };
    }),
  };
}
