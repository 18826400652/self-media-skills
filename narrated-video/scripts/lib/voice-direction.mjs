// 配音导演稿 VOICE.md：按段写给音频生成模型（seedaudio）的表演提示，一段覆盖连续几帧，整段一次生成，
// 再按逐字时间戳切回每一帧。写法见 references/voice-direction.md。
//
//   ## 段 1 (Frame 1-4)
//   ```text
//   开头她带着点不甘心，语速稍快地说道："AI帮我做了五条视频，每一项检查都过了。"然后停顿一下……
//   ```
//
// 规则：引号里的台词连起来（不计标点、空格、大小写）必须等于这几帧的口播原文；每一帧恰好属于一段。

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

/** 提示里引号（"…" 或 “…”）中的台词，按出现顺序连起来 */
export function quotedText(prompt) {
  return [...prompt.matchAll(/"([^"]*)"|“([^”]*)”/g)].map((m) => m[1] ?? m[2]).join("");
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
