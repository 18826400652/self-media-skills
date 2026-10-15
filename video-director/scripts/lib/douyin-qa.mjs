// 抖音专用检查（纯函数）：按 @词 落定时刻查出画面、安全区、字幕带、栏目标签遮挡、@词 元素可见；每 0.5 秒比画面签名查 2 秒不动
const W = 1080, H = 1920, TOL = 2;
const SAFE = { top: 200, right: 160, bottom: 480 }; // 平台界面占的边（director-rules 第 11 条）
const RIGHT_FROM = 760; // 右侧按钮列（头像、点赞、评论、收藏、分享）从这里往下；上半屏内容可以用到 x 1020
const CAPTION = { top: 1180, bottom: 1440 }; // 字幕带只放字幕
const SETTLE = 0.8; // @词 后多久算落定
const SEG_TAIL = 0.3; // 每段结尾前多久截一张
const GRID = 0.5;
const STILL = 2;
const r2 = (x) => Math.round(x * 100) / 100;

export function qaTimes(built, duration) {
  const segs = built.segments.map((s) => ({ id: s.id, start: s.start, end: r2(s.start + s.duration) }));
  const inspect = [];
  for (const [cue, at] of Object.entries(built.cues)) {
    const seg = segs.find((s) => at >= s.start && at < s.end);
    const t = r2(Math.min(at + SETTLE, (seg?.end ?? Infinity) - 0.05));
    if (t < duration) inspect.push({ t, label: `@${cue}`, cue });
  }
  for (const s of segs) if (s.end <= duration) inspect.push({ t: r2(s.end - SEG_TAIL), label: `${s.id} 结尾` });
  inspect.sort((a, b) => a.t - b.t);
  const end = Math.min(duration, built.total);
  const grid = [];
  for (let t = 0; t < end; t = r2(t + GRID)) grid.push(t);
  return { inspect, grid };
}

const at = (f) => `t=${f.t}s（${f.label}）`;

export function checkFrame(f) {
  const out = [];
  const add = (kind, sel, what) => out.push({ level: "error", kind, sel, t: f.t, msg: `${at(f)}${sel} ${what}` });
  for (const e of f.data.elements) {
    if (!(e.text || e.key) || e.allowSafe) continue;
    const [x1, y1, x2, y2] = e.box;
    if (x1 < -TOL || y1 < -TOL || x2 > W + TOL || y2 > H + TOL) { add("out", e.sel, "出了画面"); continue; }
    if (y1 < SAFE.top - TOL) add("top", e.sel, `进了顶部 ${SAFE.top} 像素（平台界面）`);
    if (x2 > W - SAFE.right + TOL && y2 > RIGHT_FROM + TOL) add("right", e.sel, `进了右侧 ${SAFE.right} 像素（点赞、评论按钮）`);
    if (y2 > H - SAFE.bottom + TOL) add("bottom", e.sel, `进了底部 ${SAFE.bottom} 像素（标题、文案）`);
    else if (y2 > CAPTION.top + TOL && y1 < CAPTION.bottom - TOL) add("caption", e.sel, `压到字幕带 y ${CAPTION.top}–${CAPTION.bottom}`);
  }
  const k = f.data.kicker;
  if (k.visible && k.occludedBy) out.push({ level: "error", kind: "kicker", sel: k.occludedBy, t: f.t, msg: `${at(f)}栏目标签被 ${k.occludedBy} 挡住` });
  return out;
}

export function checkCues(frames, cues) {
  const out = [];
  const seen = new Set();
  for (const m of frames.flatMap((f) => f.data.cueMarks)) {
    const key = `${m.sel}|${m.cue}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!(m.cue in cues)) {
      out.push({ level: "error", kind: "cue-unknown", sel: m.sel, t: 0, msg: `${m.sel} 的 data-vd-cue="${m.cue}" 不是 DIRECTOR.md 里的 @词` });
      continue;
    }
    const f = frames.find((x) => x.cue === m.cue);
    if (!f) continue; // 超出这次构建的时长（样片）
    const mine = f.data.cueMarks.find((x) => x.sel === m.sel && x.cue === m.cue);
    if (mine && !mine.visible) out.push({ level: "error", kind: "cue-hidden", sel: m.sel, t: f.t, msg: `@${m.cue}（t=${f.t}s）时 ${m.sel} 看不见` });
  }
  return out;
}

export function stillWindows(grid) {
  const out = [];
  let i = 0;
  while (i < grid.length) {
    let j = i;
    while (j + 1 < grid.length && grid[j + 1].sig === grid[i].sig) j++;
    if (grid[j].t - grid[i].t >= STILL) out.push({ from: grid[i].t, to: grid[j].t });
    i = j + 1;
  }
  return out;
}

export function summarize(issues) {
  const groups = new Map();
  for (const i of issues) {
    const key = `${i.kind}|${i.sel}`;
    groups.set(key, [...(groups.get(key) ?? []), i]);
  }
  return [...groups.values()].map((g) => (g.length === 1 ? g[0] : { ...g[0], msg: `${g[0].msg}（共 ${g.length} 处）` }));
}
