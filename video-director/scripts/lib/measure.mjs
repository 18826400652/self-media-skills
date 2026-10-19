// 内容区像素差分：只看画面内容（x 60–1020、y 230–1150），字幕带和栏目标签不参与。
// 1fps 采样、相邻 1 秒差，再按 2 秒窗口汇总：窗口里任意一秒有变化，就算这个窗口「有变化」。
export const SAMPLE = { fps: 1, width: 48, height: 46, crop: "960:920:60:230", window: 2, threshold: 0.01 };

/** 解码参数：1fps、裁到内容区、缩到 48×46 灰度；每帧 2208 字节 */
export function ffmpegFramesArgs(file, sample = SAMPLE) {
  return [
    "-v", "error", "-i", file,
    "-vf", `fps=${sample.fps},crop=${sample.crop},scale=${sample.width}:${sample.height},format=gray`,
    "-f", "rawvideo", "-",
  ];
}

/**
 * 原始灰度帧 → 静态率 / 变化事件 / 变化率 / 最长静止。
 * - 相邻帧差 = 内容区平均绝对差 / 255，>= threshold 记为变化；
 * - 2 秒窗口 t 有变化 = changed[t .. t+window-1] 里任意一个为 true；
 * - changeEvents 只合并连续的变化帧（中间隔一帧静止算两次）；
 * - longestStill 是保守值：连续无变化窗口数 / fps。
 */
export function analyzeFrames(buf, opts = {}) {
  const { fps, width, height, window, threshold } = { ...SAMPLE, ...opts };
  const size = width * height;
  const frames = Math.floor((buf?.length ?? 0) / size);
  const duration = fps ? frames / fps : 0;
  const empty = { frames, windows: 0, changedWindows: 0, staticRatio: 1, changeEvents: 0, changeRate: 0, longestStill: 0, duration };
  if (frames < window + 2) return empty;

  const changed = [];
  for (let i = 0; i + 1 < frames; i++) {
    let sum = 0;
    const a = i * size, b = (i + 1) * size;
    for (let p = 0; p < size; p++) sum += Math.abs(buf[a + p] - buf[b + p]);
    changed.push(sum / size / 255 >= threshold);
  }

  const windows = frames - window;
  let changedWindows = 0, run = 0, longest = 0;
  for (let t = 0; t < windows; t++) {
    let any = false;
    for (let k = 0; k < window; k++) if (changed[t + k]) { any = true; break; }
    if (any) { changedWindows++; run = 0; } else { run++; longest = Math.max(longest, run); }
  }

  let events = 0;
  for (let i = 0; i < changed.length; i++) if (changed[i] && !changed[i - 1]) events++;

  return {
    frames,
    windows,
    changedWindows,
    staticRatio: (windows - changedWindows) / windows,
    changeEvents: events,
    changeRate: duration ? (events / duration) * 60 : 0,
    longestStill: fps ? longest / fps : 0,
    duration,
  };
}
