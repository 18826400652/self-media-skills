// 抖音专用检查（纯函数）：按 @词 落定时刻查出画面、安全区、字幕带、栏目标签遮挡、@词 元素可见；每 0.5 秒比画面签名查 2 秒不动
import { W, H, frameCraft } from "./craft.mjs";
const TOL = 2;
const SAFE = { top: 200, right: 160, bottom: 480 }; // 平台界面占的边（director-rules 第 11 条）
const RIGHT_FROM = 760; // 右侧按钮列（头像、点赞、评论、收藏、分享）从这里往下；上半屏内容可以用到 x 1020
export const CAPTION = { top: 1180, bottom: 1440 }; // 字幕带只放字幕
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
    if (!seg) continue; // 落在这次没构建的段里（样片）
    const t = r2(Math.min(at + SETTLE, seg.end - 0.05));
    if (t < duration) inspect.push({ t, label: `@${cue}`, cue, seg: seg.id });
  }
  for (const s of segs) if (s.end <= duration) inspect.push({ t: r2(s.end - SEG_TAIL), label: `${s.id} 结尾`, seg: s.id });
  // 开场（0.05 秒：第一帧，画面还没开始演）+ 首帧（0.8 秒，入场基本落定）
  const open = segs.find((s) => s.start <= 0.05 && 0.05 < s.end);
  if (open && 0.05 < duration) inspect.push({ t: 0.05, label: "开场", seg: open.id });
  const first = segs.find((s) => s.start <= 0.8 && 0.8 < s.end);
  if (first && 0.8 < duration && !inspect.some((x) => x.t === 0.8)) inspect.push({ t: 0.8, label: "首帧", seg: first.id });
  inspect.sort((a, b) => a.t - b.t);
  const end = Math.min(duration, built.total);
  const grid = [];
  for (let t = 0; t < end; t = r2(t + GRID)) if (segs.some((s) => t >= s.start && t < s.end)) grid.push(t);
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

// 构图：一段里所有截图（@词 落定和段结尾）最低的内容元素都在这条线以上 = 整段挤在上方、下半屏空着（约为可用区 200–1150 的 60%）
const LOW_CONTENT = 770;

/** 整段内容只占上方 → ⚠（有时是故意的，所以不算 ✗）；只看一张会把段尾收起来的转场误报 */
export function checkComposition(frames) {
  const lowest = new Map();
  for (const f of frames) {
    if (!f.seg) continue;
    const bottoms = f.data.elements.filter((e) => (e.text || e.key) && (e.opacity ?? 1) > 0.05).map((e) => e.box[3]);
    if (bottoms.length) lowest.set(f.seg, { t: f.t, low: Math.max(lowest.get(f.seg)?.low ?? 0, ...bottoms) });
  }
  return [...lowest].filter(([, v]) => v.low < LOW_CONTENT).map(([seg, v]) => {
    const low = Math.round(v.low);
    return { level: "warn", kind: "composition", sel: seg, t: v.t, msg: `${seg} 整段内容最低只到 y ${low}，字幕带上方一直空着 ${CAPTION.top - 30 - low} 像素：画面挤在上方，放大或往下铺（主要内容铺到 y 1150 左右）` };
  });
}

/** 0.0s 开场：要有 ≥96px 的字、≥30% 的主体簇、可见的证据元素；全部 warn */
export function checkFirstFrame(frames) {
  const f = frames.find((x) => x.label === "开场");
  if (!f) return [];
  const { maxFont, cluster } = frameCraft(f);
  const proof = (f.data?.elements ?? []).some((e) => e.proof && (e.opacity ?? 1) > 0.05 && e.box[2] > e.box[0] && e.box[3] > e.box[1]);
  const out = [];
  if (maxFont < 96) out.push({ level: "warn", kind: "attention-first-font", sel: "", t: f.t, msg: `首帧最大字号 ${Math.round(maxFont)}px（<96）：第一秒没有落点` });
  if (cluster < 30) out.push({ level: "warn", kind: "attention-first-cluster", sel: "", t: f.t, msg: `首帧主体簇 ${cluster.toFixed(1)}%（<30）：第一秒没有主体` });
  if (!proof) out.push({ level: "warn", kind: "attention-first-proof", sel: "", t: f.t, msg: "首帧没有可见的证据元素：给成品截图 / 录屏加 data-vd-proof" });
  return out;
}

export function checkCues(frames, cues) {
  const out = [];
  const seen = new Set();
  for (const m of frames.flatMap((f) => f.data.cueMarks)) {
    const key = `${m.sel}|${m.cue}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!Object.hasOwn(cues, m.cue)) {
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

/** 网格里连续满足 same(起点, 当前) 且时间不断开、持续 ≥ STILL 秒的区间 */
function runs(grid, keep, same) {
  const out = [];
  let i = 0;
  while (i < grid.length) {
    if (!keep(grid[i])) { i++; continue; }
    let j = i;
    // 时间不连续（中间是没构建的段）就断开
    while (j + 1 < grid.length && same(grid[i], grid[j + 1]) && grid[j + 1].t - grid[j].t <= GRID + 0.01) j++;
    if (grid[j].t - grid[i].t >= STILL) out.push({ from: grid[i].t, to: grid[j].t });
    i = j + 1;
  }
  return out;
}

export const stillWindows = (grid) => runs(grid, () => true, (a, b) => a.sig === b.sig);

/** 段内一个内容元素（文字或 data-vd-key）都没有、只剩背景和账号固定元素的区间 */
export const emptyWindows = (grid) => runs(grid, (g) => g.n === 0, (_a, b) => b.n === 0);

export function summarize(issues) {
  const groups = new Map();
  for (const i of issues) {
    const key = `${i.kind}|${i.sel}`;
    groups.set(key, [...(groups.get(key) ?? []), i]);
  }
  return [...groups.values()].map((g) => (g.length === 1 ? g[0] : { ...g[0], msg: `${g[0].msg}（共 ${g.length} 处）` }));
}


export { analyzeCraft, checkCraft, craftCounts, craftSummary, CRAFT_DEFAULTS } from "./craft.mjs";
