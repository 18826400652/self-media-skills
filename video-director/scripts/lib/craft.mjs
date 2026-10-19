// 视觉工艺：主体簇、字阶、空白带、材质、构图变化（纯函数，只报 warn）
export const W = 1080, H = 1920;

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

/** 单帧落点：最大字号 + 最大主体簇占比（首帧检查用） */
export function frameCraft(f) {
  const c = maxCluster(f);
  return { maxFont: frameMax(f), cluster: c ? c.ratio : 0 };
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