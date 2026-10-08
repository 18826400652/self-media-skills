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

/** 逐字时间 → 命中处的几个字合并成原文的词（时间取首尾），其余原样；对不上就整体原样返回 */
export function restoreSpans(words, text, spans) {
  if (!spans?.length) return words;
  const out = [];
  let pos = 0;
  for (let i = 0; i < words.length; ) {
    pos = skipSpace(text, pos);
    const span = spans.find((s) => s.start === pos);
    if (span) {
      let j = i + 1;
      while (j < words.length && matchAt(words[j].text, text, span.end) < 0) j++;
      if (j === words.length && !PUNCT_ONLY.test(text.slice(span.end))) return words;
      out.push({ text: text.slice(span.start, span.end), start: words[i].start, end: words[j - 1].end });
      pos = span.end;
      i = j;
      continue;
    }
    const end = matchAt(words[i].text, text, pos);
    if (end >= 0) pos = end;
    out.push(words[i]);
    i++;
  }
  return out;
}
