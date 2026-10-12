// 配音导演稿 VOICE.md：按段写给音频生成模型（seedaudio）的提示，一段覆盖连续几帧，整段一次生成，
// 再按逐字时间戳切回每一帧。写法见 references/voice-direction.md。
//
//   ## 段 1 (Frame 1-4)
//   ```text
//   语速稍微偏快，语气真诚，带点自嘲，说道："AI帮我做了五条视频…每一项检查，都过了。可我自己看完…{呃，}一条都不想发。"边想边说……
//   ```
//
// 规则：引号里的台词连起来（不计标点、空格、大小写）必须等于这几帧的口播原文；每一帧恰好属于一段。
// 花括号 {呃，} {却…} 是额外加的语气词和重复：照样念，但不算原文、不进字幕；发给模型时去掉花括号。

const STRIP = /[\p{P}\p{S}\s]/gu;
/** 只留文字：去掉标点、空格，英文转小写 */
export const bare = (s) => s.replace(STRIP, "").toLowerCase();

/** VOICE.md → [{ name, frames: [首帧..末帧], prompt }] */
export function parseVoiceDirection(md) {
  const segments = [];
  let cur = null;
  let inFence = false;
  for (const line of md.split(/\r?\n/)) {
    const h = !inFence && line.match(/^#{2,3}\s+(.*?)\s*\(frames?\s+(\d+)(?:\s*[-–~]\s*(\d+))?\)/i);
    if (h) {
      const [first, last] = [Number(h[2]), Number(h[3] ?? h[2])];
      if (last < first) throw new Error(`VOICE.md「${line.trim()}」的帧号写反了`);
      cur = { name: h[1] || `Frame ${first}-${last}`, frames: Array.from({ length: last - first + 1 }, (_, i) => first + i), prompt: "" };
      segments.push(cur);
      continue;
    }
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence && cur) cur.prompt += `${line}\n`;
  }
  return segments.map((s) => ({ ...s, prompt: s.prompt.trim() }));
}

/** 提示里引号（"…" 或 “…”）中的台词，按出现顺序连起来；keepExtras 为 false 时去掉 {语气词} */
export function quotedText(prompt, { keepExtras = false } = {}) {
  const text = [...prompt.matchAll(/"([^"]*)"|“([^”]*)”/g)].map((m) => m[1] ?? m[2]).join("");
  return keepExtras ? text : text.replace(EXTRA, "");
}

const EXTRA = /\{[^{}]*\}/g;

/** 发给模型的提示：花括号去掉、里面的语气词保留 */
export const spokenPrompt = (prompt) => prompt.replace(/\{([^{}]*)\}/g, "$1");

/** 引号里要念的每个字（不计标点），标出哪些是 {语气词}：[{ ch, extra }] */
export function spokenChars(prompt) {
  const out = [];
  let extra = false;
  for (const ch of quotedText(prompt, { keepExtras: true })) {
    if (ch === "{") extra = true;
    else if (ch === "}") extra = false;
    else if (bare(ch)) out.push({ ch: bare(ch), extra });
  }
  return out;
}

const FILLERS = new Set(["呃", "嗯", "啊", "额", "哎", "唉"]);

/**
 * 去掉时间戳里的 {语气词}：按要念的字逐个对齐，标成 extra 的字丢掉；模型自己多加的常见语气词（呃、嗯…）也丢掉。
 * @returns 只剩原文的逐字时间（标点照旧留着）
 */
export function dropExtras(words, prompt) {
  const want = spokenChars(prompt);
  let i = 0;
  const out = [];
  for (const w of words) {
    const chars = [...bare(w.text)];
    if (!chars.length) {
      out.push(w);
      continue;
    }
    const matches = chars.every((ch, k) => want[i + k]?.ch === ch);
    if (!matches) {
      if (chars.every((ch) => FILLERS.has(ch))) continue;
      throw new Error(`时间戳「${w.text}」和导演稿对不上（第 ${i + 1} 个字应是「${want[i]?.ch ?? "（已结束）"}」），模型可能改了字`);
    }
    const isExtra = want.slice(i, i + chars.length).every((c) => c.extra);
    i += chars.length;
    if (!isExtra) out.push(w);
  }
  return out;
}

/** 时间戳里的标点换成口播原文的标点（导演稿里为了停顿加的「…」不进字幕） */
export function adoptPunctuation(words, text) {
  const src = [...text];
  let pos = 0;
  const out = [];
  for (const w of words) {
    const letters = [...w.text].filter((ch) => bare(ch)).join("");
    if (!letters) continue;
    let k = pos;
    for (const ch of letters) {
      while (k < src.length && !bare(src[k])) k++;
      if (k >= src.length || bare(src[k]) !== bare(ch)) throw new Error(`字幕「${letters}」在原文「${text}」里对不上`);
      k++;
    }
    let end = k;
    while (end < src.length && !bare(src[end])) end++;
    out.push({ ...w, text: src.slice(pos, end).join("").replace(/^[\p{P}\p{S}\s]+/u, "") });
    pos = end;
  }
  return out;
}

/**
 * 检查导演稿和口播稿对得上：每帧恰好属于一段、每段帧号连续、引号台词等于原文。
 * @param segments parseVoiceDirection 的结果
 * @param lines    parseHfScript 的结果 [{ frame, text }]
 * @returns 问题列表（空 = 没问题）
 */
export function checkDirection(segments, lines) {
  const problems = [];
  const byFrame = new Map(lines.map((l) => [l.frame, l]));
  const seen = new Map();
  for (const seg of segments) {
    if (!seg.prompt) problems.push(`「${seg.name}」没有提示词（要写在 \`\`\`text 代码块里）`);
    for (const f of seg.frames) {
      if (!byFrame.has(f)) problems.push(`「${seg.name}」写了第 ${f} 帧，SCRIPT.md 里没有这一帧`);
      if (seen.has(f)) problems.push(`第 ${f} 帧同时在「${seen.get(f)}」和「${seg.name}」里`);
      seen.set(f, seg.name);
    }
    const braces = quotedText(seg.prompt, { keepExtras: true }).replace(/[^{}]/g, "");
    if (!/^(\{\})*$/.test(braces)) problems.push(`「${seg.name}」的花括号 {} 没有配对（语气词要写成 {呃，}）`);
    const want = seg.frames.map((f) => byFrame.get(f)?.text ?? "").join("");
    const got = quotedText(seg.prompt);
    if (seg.prompt && bare(got) !== bare(want)) {
      problems.push(`「${seg.name}」引号里的台词和口播原文不一致：\n    原文：${want}\n    引号：${got}${diffHint(bare(want), bare(got))}`);
    }
  }
  for (const l of lines) if (!seen.has(l.frame)) problems.push(`第 ${l.frame} 帧没有写进任何一段`);
  return problems;
}

function diffHint(want, got) {
  const a = [...want];
  const b = [...got];
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return `\n    从第 ${i + 1} 个字开始不同：原文「${a.slice(i, i + 8).join("")}」引号「${b.slice(i, i + 8).join("")}」`;
}

const charCount = (s) => [...bare(s)].length;

/**
 * 整段的逐字时间 → 每帧一组。按原文字数分：一个时间戳词（如 DeepSeek、频，）计它的文字个数，纯标点跟着前一帧。
 * @param words      [{ text, start, end }]（整段，单位秒）
 * @param frameTexts 每帧口播原文
 * @returns [[words…], …]（时间仍是整段里的绝对时间）
 */
export function splitWordsByFrame(words, frameTexts) {
  const needs = frameTexts.map(charCount);
  const groups = frameTexts.map(() => []);
  let frame = 0;
  let count = 0;
  for (const w of words) {
    const n = charCount(w.text);
    if (n > 0 && count >= needs[frame]) {
      frame++;
      count = 0;
    }
    if (frame >= frameTexts.length) throw new Error(`时间戳比原文多出了「${w.text}」，模型可能加了字`);
    groups[frame].push(w);
    count += n;
    if (count > needs[frame]) throw new Error(`时间戳「${w.text}」跨过了第 ${frame + 1} 帧的结尾，和原文对不上`);
  }
  const short = needs.findIndex((need, i) => groups[i].reduce((a, w) => a + charCount(w.text), 0) !== need);
  if (short >= 0) throw new Error(`第 ${short + 1} 帧的时间戳字数和原文对不上（原文 ${needs[short]} 字），模型可能漏读或改了字`);
  return groups;
}

/** 每帧的切点：上一帧最后一个字和下一帧第一个字中间；首尾留一点余量 */
export function frameCuts(groups, duration, { head = 0.04, tail = 0.08 } = {}) {
  const spoken = groups.map((g) => g.filter((w) => charCount(w.text) > 0));
  return spoken.map((g, i) => {
    const start = i === 0 ? Math.max(0, g[0].start - head) : (spoken[i - 1].at(-1).end + g[0].start) / 2;
    const end = i === spoken.length - 1 ? Math.min(duration, g.at(-1).end + tail) : (g.at(-1).end + spoken[i + 1][0].start) / 2;
    return { start, end };
  });
}
