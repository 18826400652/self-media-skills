// 读音表：只改送给 TTS 的文字（SSML），口播原文、字幕、关键词不变。
// 配置 tts.pronounce = { "AI": "<say-as interpret-as=\"characters\">AI</say-as>" }：键是原文里的词，值是 SSML 片段。
// 只对支持 SSML 的服务商生效（provider 导出 ssml = true，如 CosyVoice）。
// TTS 按 SSML 读完返回的逐字时间可能变样（「A」「,I」「,」，或换成的中文字），用 restoreSpans 合并回原文的词。

const ASCII_LETTER = /[A-Za-z]/;
const escapeXml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** 原文 → { ttsText, spans }：命中的词换成 SSML 片段（英文单词内部不算命中），spans 是命中处在原文里的 [start, end) */
export function applyPronounce(text, map = {}) {
  const keys = Object.keys(map).filter(Boolean).sort((a, b) => b.length - a.length);
  const spans = [];
  for (let i = 0; i < text.length; ) {
    const key = keys.find((k) => text.startsWith(k, i)
      && !(ASCII_LETTER.test(k[0]) && ASCII_LETTER.test(text[i - 1] ?? ""))
      && !(ASCII_LETTER.test(k[k.length - 1]) && ASCII_LETTER.test(text[i + k.length] ?? "")));
    if (key) {
      spans.push({ start: i, end: i + key.length });
      i += key.length;
    } else i++;
  }
  if (!spans.length) return { ttsText: text, spans };
  let out = "";
  let pos = 0;
  for (const s of spans) {
    out += escapeXml(text.slice(pos, s.start)) + map[text.slice(s.start, s.end)];
    pos = s.end;
  }
  return { ttsText: `<speak>${out}${escapeXml(text.slice(pos))}</speak>`, spans };
}

const skipSpace = (text, p) => {
  while (p < text.length && /\s/.test(text[p])) p++;
  return p;
};

/** 时间戳里的一个字（去掉空白）能否从原文 p 处对上；对上返回结束位置，否则 -1 */
function matchAt(token, text, p) {
  const chars = [...token.replace(/\s+/g, "")];
  if (!chars.length) return -1;
  for (const ch of chars) {
    p = skipSpace(text, p);
    const t = text.slice(p, p + ch.length);
    if (t.toLowerCase() !== ch.toLowerCase()) return -1;
    p += ch.length;
  }
  return p;
}

const PUNCT_ONLY = /^[\p{P}\p{S}\s]*$/u;
const chars = (token) => [...token.replace(/\s+/g, "")];
const piece = (w, text) => ({ text, start: w.start, end: w.end });

/** 时间戳里的一个字，最短的哪段后缀能从原文 p 处对上（TTS 把「I帮」并成一个字时）；返回切分位置，没有返回 -1 */
function suffixAt(token, text, p) {
  const cs = chars(token);
  for (let k = 1; k < cs.length; k++) if (matchAt(cs.slice(k).join(""), text, p) >= 0) return k;
  return -1;
}

/** 时间戳里的一个字从原文 p 处往下对，走到某个命中处的起点时（TTS 把「给A」并成一个字），返回切分位置，否则 -1 */
function prefixBeforeSpan(token, text, p, spans) {
  const cs = chars(token);
  for (let k = 0; k < cs.length; k++) {
    p = skipSpace(text, p);
    if (k > 0 && spans.some((s) => s.start === p)) return k;
    if (text.slice(p, p + cs[k].length).toLowerCase() !== cs[k].toLowerCase()) return -1;
    p += cs[k].length;
  }
  return -1;
}

/** 逐字时间 → 命中处的几个字合并成原文的词（时间取首尾），其余原样；跨边界的字从边界拆开（两半沿用原时间）；对不上就整体原样返回 */
export function restoreSpans(words, text, spans) {
  if (!spans?.length) return words;
  const queue = words.slice();
  const out = [];
  let pos = 0;
  for (let i = 0; i < queue.length; ) {
    pos = skipSpace(text, pos);
    const span = spans.find((s) => s.start === pos);
    if (span) {
      let j = i;
      for (; j < queue.length; j++) {
        if (j > i && matchAt(queue[j].text, text, span.end) >= 0) break;
        const k = suffixAt(queue[j].text, text, span.end);
        if (k > 0) {
          const cs = chars(queue[j].text);
          queue.splice(j, 1, piece(queue[j], cs.slice(0, k).join("")), piece(queue[j], cs.slice(k).join("")));
          j++;
          break;
        }
      }
      if (j === queue.length && !PUNCT_ONLY.test(text.slice(span.end))) return words;
      out.push({ text: text.slice(span.start, span.end), start: queue[i].start, end: queue[j - 1].end });
      pos = span.end;
      i = j;
      continue;
    }
    const k = prefixBeforeSpan(queue[i].text, text, pos, spans);
    if (k > 0) {
      const cs = chars(queue[i].text);
      const head = cs.slice(0, k).join("");
      out.push(piece(queue[i], head));
      pos = matchAt(head, text, pos);
      queue[i] = piece(queue[i], cs.slice(k).join(""));
      continue;
    }
    const end = matchAt(queue[i].text, text, pos);
    if (end >= 0) pos = end;
    out.push(queue[i]);
    i++;
  }
  return out;
}
