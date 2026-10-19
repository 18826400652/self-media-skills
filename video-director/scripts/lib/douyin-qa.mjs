// 抖音专用检查（纯函数）：按 @词 落定时刻查出画面、安全区、字幕带、栏目标签遮挡、@词 元素可见；每 0.5 秒比画面签名查 2 秒不动
const W = 1080, H = 1920, TOL = 2;
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
  // 首帧（0.8 秒，入场基本落定；还没进第一段就不加）
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

// 视觉工艺：主体簇、字阶、空白带、材质、构图变化（纯函数，只报 warn）
const CONTENT = { left: 60, right: 1020, top: 230, bottom: 1150 };
const CLUSTER_GAP = 60;
// 项目可以在 video-director.config.json 的 craft 里覆盖这些默认值
export const CRAFT_DEFAULTS = { typeFloor: 64, typeRatio: 1.6, hookFont: 96, hookCluster: 35, subjectMin: 30, gapMax: 250, variety: 70, materialMin: 2, scaleCv: 0.15 };
const MATERIAL_NAMES = { shadow: "多层投影", grain: "纹理", vignette: "暗角", rotation: "离轴或胶带" };

const median = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const areaOf = (b) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
const visible = (x) => (x.opacity ?? 1) > 0.05 && areaOf(x.box) > 0;
const textSizes = (f) => (f.data?.texts ?? []).filter(visible).map((t) => ({ size: t.fontSize, area: areaOf(t.box) })).filter((x) => Number.isFinite(x.size) && x.size > 0);
const frameMax = (f) => { const s = textSizes(f); return s.length ? Math.max(...s.map((x) => x.size)) : 0; };
/** 最大字号 / 主体字号：主体字号 = 比最大字号小的字号里总面积最大的那个（小标签拉不低它） */
const frameRatio = (f) => {
  const s = textSizes(f);
  if (!s.length) return 0;
  const max = Math.max(...s.map((x) => x.size));
  const bySize = new Map();
  for (const x of s) if (x.size < max) bySize.set(x.size, (bySize.get(x.size) ?? 0) + x.area);
  if (!bySize.size) return 1;
  const body = [...bySize.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return body ? max / body : 1;
};

/** 60px 内邻近的框合并成簇，返回并集包围盒 */
function mergeClusters(boxes, gap = CLUSTER_GAP) {
  if (!boxes.length) return [];
  const parent = boxes.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (i, j) => { parent[find(i)] = find(j); };
  const gapX = (a, b) => Math.max(0, Math.max(a[0], b[0]) - Math.min(a[2], b[2]));
  const gapY = (a, b) => Math.max(0, Math.max(a[1], b[1]) - Math.min(a[3], b[3]));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (gapX(boxes[i], boxes[j]) <= gap && gapY(boxes[i], boxes[j]) <= gap) union(i, j);
  const groups = new Map();
  for (let i = 0; i < boxes.length; i++) {
    const r = find(i), b = boxes[i], c = groups.get(r);
    groups.set(r, c ? [Math.min(c[0], b[0]), Math.min(c[1], b[1]), Math.max(c[2], b[2]), Math.max(c[3], b[3])] : [...b]);
  }
  return [...groups.values()];
}

function maxCluster(f) {
  const boxes = (f.data?.blocks ?? []).filter(visible).filter((b) => areaOf(b.box) < 0.9 * W * H).map((b) => b.box);
  const cs = mergeClusters(boxes).map((b) => ({ box: b, ratio: (areaOf(b) / (W * H)) * 100 }));
  return cs.sort((a, b) => b.ratio - a.ratio)[0] ?? null;
}

function maxGap(f) {
  const rowCount = (CONTENT.bottom - CONTENT.top) / 5;
  const spans = Array.from({ length: rowCount }, () => []);
  // 全屏背景块不算内容：否则它一行一行把整个内容区涂满，空白带永远是 0
  const blocks = (f.data?.blocks ?? []).filter((b) => areaOf(b.box) < 0.9 * W * H);
  for (const e of [...blocks, ...(f.data?.texts ?? [])]) {
    if (!visible(e)) continue;
    const [x1, y1, x2, y2] = e.box;
    const l = Math.max(x1, CONTENT.left), r = Math.min(x2, CONTENT.right);
    if (r <= l) continue;
    const from = Math.max(CONTENT.top, Math.floor(y1 / 5) * 5);
    const to = Math.min(CONTENT.bottom, y2);
    for (let y = from; y < to; y += 5) spans[(y - CONTENT.top) / 5].push([l, r]);
  }
  // 一行至少被 10% 内容宽覆盖才算“有内容”：20px 的小标签不能把 415px 的洞填掉
  const minRow = 0.1 * (CONTENT.right - CONTENT.left);
  const rows = new Uint8Array(rowCount);
  for (let i = 0; i < rowCount; i++) {
    const xs = spans[i].sort((a, b) => a[0] - b[0]);
    let total = 0, curL = null, curR = null;
    for (const [l, r] of xs) {
      if (curL === null) { curL = l; curR = r; continue; }
      if (l <= curR) { curR = Math.max(curR, r); continue; }
      total += curR - curL;
      curL = l;
      curR = r;
    }
    if (curL !== null) total += curR - curL;
    rows[i] = total >= minRow ? 1 : 0;
  }
  let best = 0, bestAt = CONTENT.top, run = 0;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i]) { run = 0; continue; }
    run += 5;
    if (run > best) { best = run; bestAt = CONTENT.top + i * 5 - run + 5; }
  }
  return { gap: best, at: bestAt };
}

/** 汇总视觉工艺指标；旧工程没有 blocks/texts 时返回空结构 */
export function analyzeCraft(frames) {
  const usable = frames.filter((f) => (f.data?.blocks?.length ?? 0) || (f.data?.texts?.length ?? 0));
  if (!usable.length) {
    return { first: null, segments: [], material: { shadow: false, grain: false, vignette: false, rotation: false, score: 0, missing: Object.values(MATERIAL_NAMES) }, variety: { total: 0, centered: 0, centers: [], scales: [], scaleBands: 0, scaleCv: 0 }, color: [] };
  }
  const bySeg = new Map();
  for (const f of frames) {
    if (!f.seg) continue;
    if (!bySeg.has(f.seg)) bySeg.set(f.seg, []);
    bySeg.get(f.seg).push(f);
  }
  const segments = [...bySeg.entries()].map(([id, fs]) => {
    const withContent = fs.filter((f) => (f.data?.blocks?.length ?? 0) || (f.data?.texts?.length ?? 0));
    const hasBlocks = fs.some((f) => (f.data?.blocks?.length ?? 0) > 0);
    const hasText = fs.some((f) => textSizes(f).length > 0);
    const maxFonts = fs.map(frameMax).filter((n) => n > 0);
    const ratios = fs.map(frameRatio).filter((n) => n > 0);
    const clusters = withContent.map(maxCluster).filter(Boolean);
    const gaps = withContent.map(maxGap);
    const biggest = clusters.sort((a, b) => b.ratio - a.ratio)[0];
    const widest = gaps.sort((a, b) => b.gap - a.gap)[0] ?? { gap: 0, at: CONTENT.top };
    return {
      id,
      t: fs[0].t,
      maxFont: maxFonts.length ? median(maxFonts) : 0,
      ratio: ratios.length ? median(ratios) : 0,
      cluster: biggest ? biggest.ratio : null,
      gap: hasBlocks || hasText ? widest.gap : 0,
      gapAt: widest.at,
      center: biggest ? (biggest.box[0] + biggest.box[2]) / 2 : null,
      hasBlocks,
      hasText,
    };
  });
  const firstFrame = frames.find((f) => f.label === "首帧") ?? [...frames].sort((a, b) => a.t - b.t)[0];
  const firstCluster = firstFrame ? maxCluster(firstFrame) : null;
  const first = firstFrame && (textSizes(firstFrame).length || firstCluster) ? {
    t: firstFrame.t,
    label: firstFrame.label,
    maxFont: frameMax(firstFrame),
    cluster: firstCluster ? firstCluster.ratio : null,
  } : null;
  const allBlocks = frames.flatMap((f) => f.data?.blocks ?? []);
  // 材质分只认主体面积：2.2% 的便利贴旋转/投影不该给整片材质加分
  const mainBlocks = allBlocks.filter((b) => areaOf(b.box) >= 0.05 * W * H);
  const shadow = mainBlocks.some((b) => String(b.shadow ?? "").split(/rgba?[(]/g).length - 1 >= 2);
  const materials = new Set(frames.flatMap((f) => f.data?.materials ?? []));
  const grain = materials.has("grain");
  const vignette = materials.has("vignette");
  const rotation = mainBlocks.some((b) => Math.abs(b.rot ?? 0) >= 3 && Math.abs(b.rot ?? 0) <= 8) || materials.has("tape");
  const flags = { shadow, grain, vignette, rotation };
  const missing = Object.entries(flags).filter(([, v]) => !v).map(([k]) => MATERIAL_NAMES[k]);
  const material = { ...flags, score: Object.values(flags).filter(Boolean).length, missing };
  const centers = segments.map((s) => s.center).filter((x) => x !== null);
  const scales = segments.map((s) => s.cluster).filter((x) => x !== null);
  const variety = { total: centers.length, centered: 0, centers, scales, scaleBands: 0, scaleCv: 0 };
  if (centers.length) {
    const mid = median(centers);
    variety.centered = centers.filter((x) => Math.abs(x - mid) <= 0.05 * W).length;
  }
  if (scales.length) {
    const mean = scales.reduce((a, b) => a + b, 0) / scales.length;
    variety.scaleCv = mean ? Math.sqrt(scales.reduce((a, b) => a + (b - mean) ** 2, 0) / scales.length) / mean : 0;
    variety.scaleBands = new Set(scales.map((x) => Math.floor(x / 5))).size;
  }
  const color = frames.map((f) => ({ t: f.t, ...(f.data?.px ?? {}) })).filter((x) => x.vivid !== undefined);
  return { first, segments, material, variety, color };
}

/** 视觉工艺检查：全部 warn；sel 是段 id（全片级的为空串） */
export function checkCraft(frames, craft = {}) {
  const o = { ...CRAFT_DEFAULTS, ...craft };
  const m = analyzeCraft(frames);
  const out = [];
  const add = (kind, sel, t, msg) => out.push({ level: "warn", kind, sel, t, msg });
  const allow = new Set(frames.flatMap((f) => f.data?.aestheticOk ?? []));
  const t0 = m.first?.t ?? 0;
  for (const s of m.segments) {
    if (allow.has(s.id)) continue;
    if (s.hasText && s.maxFont > 0 && s.maxFont < o.typeFloor) add("craft-type", s.id, s.t, s.id + " 段内最大字号中位 " + Math.round(s.maxFont) + "px（<" + o.typeFloor + "）：标题和正文一个量级");
    if (s.hasText && s.ratio > 0 && s.ratio < o.typeRatio) add("craft-hierarchy", s.id, s.t, s.id + " 字号层级 " + s.ratio.toFixed(2) + "（最大/主体，<" + o.typeRatio + "）：画面没有落点");
    if (s.hasBlocks && s.cluster !== null && s.cluster < o.subjectMin) add("craft-subject", s.id, s.t, s.id + " 主体簇最大 " + s.cluster.toFixed(1) + "%（<" + o.subjectMin + "%）：画面没有视觉重心");
    if (s.gap > o.gapMax) add("craft-gap", s.id, s.t, s.id + " 内容区最大空白带 " + s.gap + "px（y " + s.gapAt + " 起，>" + o.gapMax + "）：中间空一大块");
  }
  if (m.first) {
    const fontBad = m.first.maxFont > 0 && m.first.maxFont < o.hookFont;
    const clusterBad = m.first.cluster !== null && m.first.cluster < o.hookCluster;
    if (fontBad || clusterBad) {
      const font = m.first.maxFont ? Math.round(m.first.maxFont) + "px" : "—";
      const cluster = m.first.cluster !== null ? m.first.cluster.toFixed(1) + "%" : "—";
      add("craft-hook", "", t0, "首帧最大字号 " + font + "（<" + o.hookFont + "）、主体簇 " + cluster + "（<" + o.hookCluster + "%）：第一秒没有落点");
    }
  }
  if (frames.some((f) => (f.data?.blocks?.length ?? 0) > 0) && m.material.score < o.materialMin) {
    add("craft-material", "", t0, "全片材质 " + m.material.score + "/4（" + m.material.missing.map((x) => x + "×").join(" ") + "）：像线框，不像实景");
  }
  const centerBad = m.variety.total >= 3 && (m.variety.centered / m.variety.total) * 100 >= o.variety;
  const scaleBad = m.variety.scales.length >= 3 && (m.variety.scaleCv < o.scaleCv || m.variety.scaleBands < 3);
  if (centerBad || scaleBad) {
    const parts = [];
    if (centerBad) {
      const mid = median(m.variety.centers);
      const lo = Math.round(mid - 0.05 * W), hi = Math.round(mid + 0.05 * W);
      parts.push(m.variety.total + " 段里 " + m.variety.centered + " 段主体中心在 x " + lo + "–" + hi + "（±5% 宽）：构图雷同");
    }
    if (scaleBad) {
      const lo = Math.round(Math.min(...m.variety.scales)), hi = Math.round(Math.max(...m.variety.scales));
      parts.push("主体大小都在 " + lo + "–" + hi + "%（" + m.variety.scaleBands + " 个档 / 变化 " + Math.round(m.variety.scaleCv * 100) + "%）：景别没有变化");
    }
    add("craft-variety", "", t0, parts.join("；"));
  }
  return out;
}

// 视觉工艺告警的类别：键是 kind，值是 [counts 的键, 中文名]
const CRAFT_KINDS = {
  "craft-type": ["type", "字阶"],
  "craft-hierarchy": ["hierarchy", "层级"],
  "craft-hook": ["hook", "首帧"],
  "craft-subject": ["subject", "主体"],
  "craft-gap": ["gap", "空白"],
  "craft-material": ["material", "材质"],
  "craft-variety": ["variety", "构图"],
};

/** 按类数 craft 告警；没有的类别是 0 */
export function craftCounts(issues) {
  const out = { type: 0, hierarchy: 0, hook: 0, subject: 0, gap: 0, material: 0, variety: 0 };
  for (const i of issues) {
    const k = CRAFT_KINDS[i.kind];
    if (k) out[k[0]] += 1;
  }
  return out;
}

/** vd qa 的两行摘要：指标行 + 分类计数行；没有可展示的指标返回 null */
export function craftSummary(craft) {
  if (!craft?.segments?.length) return null;
  const s = craft.segments;
  const fonts = s.map((x) => x.maxFont).filter(Boolean);
  const clusters = s.map((x) => x.cluster).filter((x) => x !== null);
  if (!fonts.length || !clusters.length) return null;
  const f = craft.first;
  const head = f ? Math.round(f.maxFont) + "px / 簇 " + (f.cluster === null ? "—" : f.cluster.toFixed(1) + "%") : "—";
  const metrics = "视觉工艺：首帧 " + head +
    " · 段内字号 " + Math.round(Math.min(...fonts)) + "–" + Math.round(Math.max(...fonts)) + "px" +
    " · 主体簇 " + Math.min(...clusters).toFixed(1) + "–" + Math.max(...clusters).toFixed(1) + "%" +
    " · 空白带 " + Math.max(...s.map((x) => x.gap)) + "px" +
    " · 材质 " + craft.material.score + "/4" +
    " · 构图 " + craft.variety.centered + "/" + craft.variety.total + " 段居中";
  const counts = Object.entries(CRAFT_KINDS)
    .map(([, [key, label]]) => [label, craft.counts?.[key] ?? 0])
    .filter(([, n]) => n > 0)
    .map(([label, n]) => label + " " + n)
    .join(" · ") || "0 条";
  return { metrics, counts };
}
