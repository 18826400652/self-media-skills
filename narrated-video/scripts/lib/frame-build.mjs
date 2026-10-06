// 帧模板：STORYBOARD 里一行 `- build: {…}` → 一帧画面（compositions/frames/NN-*.html）。
// 纯函数，不读写文件；hf-frames.mjs 负责读 STORYBOARD 和写文件。
//
// build 参数（JSON，都可选，按需组合；元素从上到下叠放）：
//   ground: "bg" | "accent"            底色；accent = 整屏强调色（「翻车」帧），文字自动换成深色
//   rec:   { src, mediaStart, rate, dim, chip }   录屏（nv rec 录的视频），放在角标下方
//   timer: { value, unit, note }       录屏上的计时面板（数到真实用时）
//   lead:  { text, top, at }           一行灰色说明文字
//   kit:   { name, top, width, opts }  一个 hf-kit 组件，如 { "name": "compare", "opts": {…} }；width 默认 960，"auto" 不限宽
//   title: { label, lines, top, center }  大字标题（lines 每项一行，**词** 用强调色）；center = 居中（一句话冲击帧）
//   kicker: false                      这一帧不显示角标（钩子帧用：第一眼不要有「上课」感）
//   camera: "push"                     整帧缓慢推近（1 → 1.04，贯穿全帧），让落定后的静态画面不死板；录屏帧不用
// 视觉风格 f.look（项目配置 hfKit.look）："flat" 纯色底（默认）；"glow" 光晕颗粒底色 + HUD 四角和进度条 + 玻璃卡片（样式在 hf-kit/kit-glow.js）。
// 时间写法：数字 = 帧内秒数；"@词" = 说到这个词的时刻；"@词#2" = 第二次说到。
// 位置都在抖音安全区内（内容 x 60–1020、y 230–1150）。

import { LOCAL_GSAP } from "./localize.mjs";

const CUE_RE = /^@(.+?)(?:#(\d+))?$/;
const REC_BOX = { left: 95, top: 340, width: 890, height: 1582 };
const PUSH_SCALE = 1.04; // camera: "push" 推到多大：观众察觉不到「在动」，但画面不会死

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const TIME_KEY_RE = /^(at|until|[a-z][A-Za-z]*At)$/; // 时间字段：at、until、inAt、noteAt、zoomInAt……

/**
 * 转成 JS 字面量；时间字段（at、xxxAt，及其数组）里的 "@词" / "@词#2" → C("词", 2)。
 * 只认时间字段：聊天文字「@你 十分钟后……」这类内容原样保留。time = true 表示 value 本身就是时间。
 */
export function toJs(value, time = false) {
  if (typeof value === "string") {
    const m = time ? value.match(CUE_RE) : null;
    if (m) return m[2] ? `C(${JSON.stringify(m[1])}, ${m[2]})` : `C(${JSON.stringify(m[1])})`;
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((v) => toJs(v, time)).join(", ")}]`;
  if (value && typeof value === "object") {
    return `{ ${Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${toJs(v, TIME_KEY_RE.test(k))}`).join(", ")} }`;
  }
  return JSON.stringify(value);
}

const at = (v, fallback = 0) => toJs(v ?? fallback, true);

const MAX_SEGMENTS = 8; // 进度条最多几段：帧多时一段代表几帧

/** 第 n 帧（共 total 帧）的进度条：几段、亮几段（第一帧至少亮一段，最后一帧全亮） */
export function progressSegments(n, total, max = MAX_SEGMENTS) {
  const count = Math.min(total, max);
  return { count, lit: Math.max(1, Math.round((n / total) * count)) };
}

/** HUD：四角 + 进度条；progress = false（钩子帧）只留四角，第一眼不要「上课感」 */
function hudPart(n, total, progress) {
  const corners = '<i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i>';
  if (!progress) return `<div class="kit-hud">${corners}</div>`;
  const { count, lit } = progressSegments(n, total);
  const bars = Array.from({ length: count }, (_, i) => (i < lit ? '<i class="on"></i>' : "<i></i>")).join("");
  return `<div class="kit-hud">${corners}<div class="kit-progress">${bars}</div></div>`;
}

/** **词** → 强调色 span */
const inlineAccent = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<span class="P-acc">$1</span>');

function recPart(b, dur, hook) {
  const r = b.rec;
  const v = `<video id="P-v" class="clip" src="${esc(r.src ?? "assets/rec.mp4")}" data-start="0" data-duration="${dur}" data-media-start="${r.mediaStart ?? 0}" data-playback-rate="${r.rate ?? 1}" data-track-index="1" muted playsinline style="position:absolute;left:${REC_BOX.left}px;top:${REC_BOX.top}px;width:${REC_BOX.width}px;height:${REC_BOX.height}px;object-fit:cover;border:1px solid var(--kit-line)"></video>`;
  const parts = [v];
  if (r.dim) parts.push('<div class="P-dim"></div>');
  if (r.chip) parts.push(`<div class="P-chip${hook("kit-chip")}">${esc(r.chip)}</div>`);
  return parts;
}

/**
 * @param {{ n: number, id: string, duration: number, kicker: string, tokens: object, build: object }} f
 *   tokens：品牌色和字体（hf-kit 的 TOKENS 合并项目配置），翻转底色时要用具体色值
 * @returns {string} 帧的 HTML（<template> 子合成）
 */
export function buildFrame(f) {
  const b = f.build ?? {};
  const p = `p${String(f.n).padStart(2, "0")}`;
  const accent = b.ground === "accent";
  const glow = (f.look ?? "flat") === "glow";
  if (glow && !(f.total > 0)) throw new Error(`第 ${f.n} 帧：glow 需要 total（总帧数）`);
  const hook = (cls) => (glow ? ` ${cls}` : ""); // glow 时给元素加 kit-glow.js 认的类名；flat 输出保持原样
  const body = [];
  const js = [];
  const css = [];

  if (b.rec) {
    body.push(...recPart(b, f.duration, hook));
    css.push(".P-dim { position: absolute; inset: 0; background: color-mix(in srgb, var(--kit-bg) 62%, transparent); z-index: 2; }");
    css.push(".P-chip { position: absolute; left: 60px; top: 292px; z-index: 5; font-size: 26px; font-weight: 700; color: var(--kit-bg); background: var(--kit-accent); padding: 6px 16px; }");
  }
  if (b.timer) {
    const t = b.timer;
    body.push(`<div class="P-panel${hook("kit-glass-panel")}"><div id="P-n"></div>${t.note ? `<div class="P-note">${esc(t.note)}</div>` : ""}</div>`);
    css.push(".P-panel { position: absolute; left: 60px; top: 860px; z-index: 5; padding: 24px 36px; background: color-mix(in srgb, var(--kit-bg) 90%, transparent); border-left: 8px solid var(--kit-accent); }");
    css.push(".P-note { font-size: 30px; font-weight: 500; color: var(--kit-muted); margin-top: 48px; }");
    js.push(`Kit.number(tl, "#P-n", ${toJs({ value: t.value, unit: t.unit ?? "秒", countFrom: 0, countDur: t.countDur ?? Math.max(0.5, f.duration - 0.3), at: 0.05, size: t.size ?? 150 })});`);
  }
  if (b.lead) {
    body.push(`<div class="P-lead" id="P-l" style="top:${b.lead.top ?? 600}px">${inlineAccent(b.lead.text)}</div>`);
    js.push(`tl.fromTo("#P-l", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.4, ease: E }, ${at(b.lead.at)});`);
  }
  if (b.kit) {
    const k = b.kit;
    if (!k.name) throw new Error(`第 ${f.n} 帧 build.kit 缺少 name（如 "compare"）`);
    const width = k.width === "auto" ? "" : `width:${k.width ?? 960}px;`; // auto：不限宽（划掉换新这类短词，按字号显示）
    body.push(`<div id="P-k" style="position:absolute;left:60px;top:${k.top ?? 560}px;${width}z-index:5"></div>`);
    js.push(`Kit.${k.name}(tl, "#P-k", ${toJs(k.opts ?? {})});`);
  }
  if (b.title) {
    const t = b.title;
    if (t.label) {
      body.push(`<div class="P-label${hook("kit-label")}${t.center ? " P-center" : ""}" id="P-tl" style="top:${(t.top ?? 690) - 130}px">${esc(t.label)}</div>`);
      js.push(`tl.fromTo("#P-tl", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4, ease: E }, ${at(t.labelAt)});`);
    }
    (t.lines ?? []).forEach((line, i) => {
      const text = typeof line === "string" ? line : line.text;
      const when = typeof line === "string" ? i * 0.6 + 0.3 : line.at;
      body.push(`<div class="P-h${t.center ? " P-center" : ""}" id="P-h${i}" style="top:${(t.top ?? 690) + i * 140}px">${inlineAccent(text)}</div>`);
      js.push(`tl.fromTo("#P-h${i}", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.45, ease: E }, ${at(when)});`);
    });
    css.push(".P-label { position: absolute; left: 60px; font-size: 44px; font-weight: 900; color: var(--kit-bg); background: var(--kit-accent); padding: 6px 20px; }");
    css.push(".P-h { position: absolute; left: 60px; right: 60px; font-size: 104px; font-weight: 900; line-height: 1.2; text-wrap: balance; }");
    if (t.center) css.push(".P-center { left: 60px; right: 60px; width: fit-content; margin-inline: auto; text-align: center; }");
  }
  if (b.camera === "push") {
    js.push(`tl.fromTo("#P-cam", { scale: 1 }, { scale: ${PUSH_SCALE}, duration: ${f.duration}, ease: "sine.inOut" }, 0);`);
  } else if (b.camera) {
    throw new Error(`第 ${f.n} 帧 camera 只支持 "push"，收到 ${JSON.stringify(b.camera)}`);
  }

  const T = f.tokens;
  // 强调色底：这一帧里的文字、组件改用深色（组件颜色读 --kit-*，在根元素上覆盖）
  const ground = accent ? T.accent : "var(--kit-bg)";
  const rootVars = accent ? ` --kit-ink: ${T.bg}; --kit-accent: ${T.bg}; --kit-muted: color-mix(in srgb, ${T.bg} 50%, transparent);` : "";
  const sub = (s) => s.replace(/P-/g, `${p}-`);
  return `<!-- 由 nv hf-frames 根据 STORYBOARD.md 第 ${f.n} 帧的 build 生成，改 STORYBOARD 后重跑；要手写这一帧就删掉 build 行 -->
<template>
  <div id="${p}-root" data-composition-id="${f.id}" data-start="0" data-duration="${f.duration}" data-width="1080" data-height="1920">
    <style>
      #${p}-root { position: relative; width: 1080px; height: 1920px; overflow: hidden; container-type: size; font-family: ${T.font}; color: var(--kit-ink); -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;${rootVars} }
      .${p}-ground { position: absolute; inset: 0; ${glow ? "background-color" : "background"}: ${ground}; }
      .${p}-kicker { position: absolute; left: 60px; top: 250px; z-index: 5; font-size: 30px; font-weight: 700; letter-spacing: 0.12em; color: ${accent ? `color-mix(in srgb, ${T.bg} 55%, transparent)` : "var(--kit-accent)"}; }
      .${p}-lead { position: absolute; left: 60px; right: 60px; z-index: 5; font-size: 52px; font-weight: 500; color: var(--kit-muted); text-wrap: balance; }
      .${p}-acc { color: var(--kit-accent); }
${css.map((c) => `      ${sub(c)}`).join("\n")}
    </style>
    <div id="${p}-ground" class="${p}-ground${glow ? ` kit-atmo${accent ? " is-accent" : ""}` : ""} clip" data-start="0" data-duration="${f.duration}" data-track-index="0"></div>
${glow ? `    ${hudPart(f.n, f.total, b.kicker !== false)}\n` : ""}${b.kicker === false ? "" : `    <div class="${p}-kicker${hook("kit-kicker")}">${esc(f.kicker)}</div>\n`}${b.camera ? `    <div id="${p}-cam" style="position:absolute;inset:0;transform-origin:50% 40%">\n` : ""}${body.map((x) => `    ${b.camera ? "  " : ""}${sub(x)}`).join("\n")}${b.camera ? "\n    </div>" : ""}
    <script src="${LOCAL_GSAP}"></script>
    <script src="compositions/kit/cues.js"></script>
    <script src="compositions/kit/kit.js"></script>
${glow ? '    <script src="compositions/kit/kit-glow.js"></script>\n' : ""}    <script src="compositions/kit/kit-scenes.js"></script>
    <script>
      (function () {
        var tl = gsap.timeline({ paused: true });
        var E = "power3.out";
        var C = function (w, n) { return Kit.cue(${f.n}, w, n) - 0.05; }; // 说到这个词（提前一点点出现）
${js.map((x) => `        ${sub(x)}`).join("\n")}
        window.__timelines = window.__timelines || {};
        window.__timelines["${f.id}"] = tl;
      })();
    </script>
  </div>
</template>
`;
}

/** STORYBOARD.md → [{ n, id, src, duration, build }]（只读需要的字段） */
export function parseStoryboardFrames(md) {
  const kicker = md.match(/^kicker:\s*(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "") ?? "";
  const frames = md.split(/^## Frame /m).slice(1).map((block) => {
    const n = Number(block.match(/^(\d+)/)?.[1]);
    const field = (k) => block.match(new RegExp(`^- ${k}:\\s*(.+)$`, "m"))?.[1]?.trim();
    const src = field("src");
    const raw = field("build");
    let build = null;
    if (raw) {
      try {
        build = JSON.parse(raw);
      } catch (err) {
        throw new Error(`第 ${n} 帧的 build 不是合法 JSON：${err.message}`);
      }
    }
    return { n, src, id: src?.match(/frames\/([^/]+)\.html$/)?.[1], duration: Number(field("duration")?.replace(/s$/, "")), build };
  });
  return { kicker, frames };
}
