// 把语音识别的时间戳对齐回口播原文：识别出的字可能和原文不一样（「四十五」识别成「45」、「AI腔」识别成「挨挨枪」），
// 按字做最长公共子序列，对上的字直接用识别的时间，对不上的几个字在前后对上的字之间均分。
// 给不返回时间戳的音频生成模型（如千问音频生成）补逐字时间。

const STRIP = /[\p{P}\p{S}\s]/u;
const isText = (ch) => !STRIP.test(ch);
const key = (ch) => ch.toLowerCase();
const round3 = (x) => Math.round(x * 1000) / 1000;

/** 识别结果的词 [{ text, start, end }] → 逐字，词内时间按字数均分；标点丢掉 */
export function toChars(words) {
  return words.flatMap((w) => {
    const chars = [...w.text].filter(isText);
    const step = (w.end - w.start) / (chars.length || 1);
    return chars.map((ch, i) => ({ ch, start: w.start + i * step, end: w.start + (i + 1) * step }));
  });
}

/** 两串字的最长公共子序列：返回 [[i, j], …]（a 的第 i 个字对上 b 的第 j 个字） */
function lcsPairs(a, b) {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const pairs = [];
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (a[i] === b[j]) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return pairs;
}

/**
 * @param asrWords 识别结果 [{ text, start, end }]（秒）
 * @param text     要对齐的原文（可含标点）
 * @returns 原文每个字一条 [{ text, start, end }]；标点单独一条、时长为 0，挂在前一个字结尾
 */
export function alignToText(asrWords, text) {
  const heard = toChars(asrWords);
  const chars = [...text];
  const textIdx = chars.map((ch, i) => (isText(ch) ? i : -1)).filter((i) => i >= 0);
  const pairs = lcsPairs(textIdx.map((i) => key(chars[i])), heard.map((h) => key(h.ch)));
  const times = new Array(textIdx.length).fill(null);
  for (const [i, j] of pairs) times[i] = { start: heard[j].start, end: heard[j].end };

  // 对不上的一串字：在前后对上的字之间均分（开头、结尾用识别结果的首尾时间兜底）
  const first = heard[0]?.start ?? 0;
  const last = heard.at(-1)?.end ?? 0;
  for (let i = 0; i < times.length; ) {
    if (times[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < times.length && !times[j]) j++;
    const from = i > 0 ? times[i - 1].end : first;
    const to = j < times.length ? times[j].start : last;
    const step = Math.max(0, to - from) / (j - i);
    for (let k = i; k < j; k++) times[k] = { start: from + (k - i) * step, end: from + (k - i + 1) * step };
    i = j;
  }

  const out = [];
  let t = 0;
  for (const [n, ch] of chars.entries()) {
    const idx = textIdx.indexOf(n);
    if (idx < 0) {
      out.push({ text: ch, start: round3(t), end: round3(t) });
      continue;
    }
    const { start, end } = times[idx];
    out.push({ text: ch, start: round3(start), end: round3(end) });
    t = end;
  }
  // 标点和前一个字并在一起（「对，」），和其他服务商的时间戳格式一致
  return out.reduce((acc, w) => {
    if (!isText(w.text) && acc.length && [...acc.at(-1).text].some(isText)) acc.at(-1).text += w.text;
    else acc.push(w);
    return acc;
  }, []);
}
