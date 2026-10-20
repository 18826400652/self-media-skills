// 写 cues.js、复制品牌子画面和字体、替换 index.html 的 vd 标记块
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ACTIONS_JS } from "./actions.mjs";
import { writeFonts } from "./fonts.mjs";
import { CAPTION } from "./douyin-qa.mjs";
import { transitionPlan } from "./transitions.mjs";

const esc = (s) => String(s).replaceAll("&", "&amp;").replaceAll("'", "&#39;").replaceAll("<", "&lt;");
const vars = (o) => `data-variable-values='${esc(JSON.stringify(o))}'`;
const r3 = (x) => Math.round(x * 1000) / 1000;

export function replaceBlock(html, name, content) {
  const open = `<!-- vd:${name} -->`, close = `<!-- /vd:${name} -->`;
  const a = html.indexOf(open), b = html.indexOf(close);
  if (a < 0 || b < a) throw new Error(`index.html 缺少标记 ${open} … ${close}（从 templates/index.html 复制）`);
  return html.slice(0, a + open.length) + content + html.slice(b);
}

export function setRootDuration(html, seconds) {
  return html.replace(/(data-composition-id="main"[^>]*?data-duration=")[^"]*(")/, `$1${seconds}$2`);
}

export function cuesJs({ cues, segments }) {
  const seg = Object.fromEntries(segments.map((s) => [s.id, { start: s.start, duration: s.duration }]));
  return `// vd build 生成，不要手改。各段用 VD.at("词", "段id") 取相对段开头的秒数
window.VD = {
  cues: ${JSON.stringify(cues)},
  seg: ${JSON.stringify(seg)},
  at(name, segId) {
    if (!(name in this.cues)) throw new Error("cues 里没有「" + name + "」：先在 DIRECTOR.md 里写 @" + name + "，再跑 vd build");
    if (!(segId in this.seg)) throw new Error("没有段 " + segId);
    const s = this.seg[segId], t = this.cues[name] - s.start, r2 = (x) => Math.round(x * 100) / 100;
    // 允许超出段边界 1 秒以内：用相邻段的词给本段做入场、退场是常见写法；再远就是锚错了地方
    if (t < -1 || t > s.duration + 1)
      throw new Error("「" + name + "」在全片 " + r2(this.cues[name]) + "s，不在段 " + segId + "（" + r2(s.start) + "–" + r2(s.start + s.duration) + "s）里：同一个词出现多次时写 @" + name + "#2");
    return Math.round(t * 1000) / 1000;
  },
};
`;
}

const host = (id, src, start, duration, track, extra = "", hostId = id, style = "") =>
  `    <div id="host-${hostId}" class="clip" data-composition-id="${id}" data-composition-src="${src}" data-start="${start}" data-duration="${duration}" data-track-index="${track}" data-width="1080" data-height="1920" ${extra}style="position:absolute;inset:0${style ? ";" + style : ""}"></div>\n`;

const FONT_VAR = { serif: "var(--vd-serif)", sans: "var(--vd-sans)" };
// dykit 组件内容的底边（--hf-safe-bottom）：停在字幕带上方 30px；组件库默认 1520 会压到 vd 的字幕
const SAFE_BOTTOM = `--hf-safe-bottom:${CAPTION.top - 30}px`;
const INK = "#1C1A17", WHITE = "#FFFFFF";

function luminance(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
/** 色块上的文字：深色墨水和白色里对比度高的那个 */
const onColor = (hex) => (contrast(hex, INK) >= contrast(hex, WHITE) ? INK : WHITE);

const READABLE = 3; // 组件会把强调色当文字、描边色用：和底色的对比度至少 3:1（WCAG 大字）
const readable = (bg, ...colors) => colors.find((c) => contrast(c, bg) >= READABLE);

/**
 * 这条视频的配色和字体 → dykit custom 主题的 --hf-custom-* 变量。
 * 荧光笔底色（highlight）固定用 palette.accent；组件强调色依次取 accent、alert、ink 里第一个在底色上看得清的。
 */
export function customVars(p, fonts = {}) {
  if (contrast(p.ink, p.bg) < READABLE) throw new Error(`palette.ink（${p.ink}）和 palette.bg（${p.bg}）对比度只有 ${contrast(p.ink, p.bg).toFixed(2)}:1，组件里的字看不清：至少要 ${READABLE}:1`);
  // 强调色看不清时退回正文色，不退到 alert：alert 是「错的」，拿来强调会误导
  const accent = readable(p.bg, p.accent, p.ink);
  const alert = readable(p.bg, p.alert, p.ink);
  return `--hf-custom-bg:${p.bg};--hf-custom-text:${p.ink};--hf-custom-muted:${p.muted};--hf-custom-accent:${accent};--hf-custom-alert:${alert};--hf-custom-highlight:${p.accent};` +
    `--hf-custom-font-title:${FONT_VAR[fonts.title ?? "serif"]};--hf-custom-font-body:${FONT_VAR[fonts.body ?? "sans"]};` +
    `--hf-custom-on-accent:${onColor(accent)};--hf-custom-on-alert:${onColor(alert)};--hf-custom-on-highlight:${onColor(p.accent)}`;
}

/** 动作库：段里调 VDACT.pushIn / stamp / highlight 等（每个工程都注入） */
export function actionsBlock() {
  return `\n    <script>${ACTIONS_JS}</script>\n    `;
}

/** 有组件段落时在 <head> 引入 dykit 的样式和工具脚本 */
export function headBlock(hasComponents) {
  return hasComponents ? `\n    <link rel="stylesheet" href="assets/dykit/dykit.css" />\n    <script src="assets/dykit/hf-kit.js"></script>\n    ` : "";
}

/** 全片底色：各段下面铺 palette.bg（叠加类组件自己不带底色，没有这层会露白底） */
export const rootBgBlock = (bg) => (bg ? `<style>#root { background: ${bg}; }</style>\n    ` : "");

/** 写 vd:head 块；旧工程没有这个标记、也没用组件时原样返回 */
export function applyHead(html, hasComponents, bg = null) {
  if (!hasComponents && !html.includes("<!-- vd:head -->")) return html;
  return replaceBlock(html, "head", headBlock(hasComponents) + rootBgBlock(bg) + actionsBlock());
}

const motion = (s) => ({ ...(s.enter ? { enter: s.enter } : {}), ...(s.exit ? { exit: s.exit } : {}) });
const motionAttrs = (s) => (s.enter ? `data-vd-enter="${s.enter}" ` : "") + (s.exit ? `data-vd-exit="${s.exit}" ` : "");

/** 段宿主（组件段用 custom 主题；enter/exit 来自 transitionPlan）+ 段里的 overlay 宿主（track 30 起） */
export function segmentHosts(segments, only = null, palette = null, fonts = {}) {
  const used = segments.filter((s) => !only || only.includes(s.id));
  const theme = () => `${customVars(palette, fonts)};${SAFE_BOTTOM}`;
  const segs = used.map((s, i) => s.component
    ? host(s.component, `compositions/${s.component}.html`, s.start, s.duration, 2 + i, `data-theme="custom" ${vars({ ...(s.vars ?? {}), ...motion(s) })} `, s.id, theme())
    : host(s.id, `compositions/frames/${s.id}.html`, s.start, s.duration, 2 + i, motionAttrs(s)));
  let track = 30;
  const overlays = used.flatMap((s) => (s.overlays ?? []).map((o, j) =>
    host(o.component, `compositions/${o.component}.html`, o.start, o.duration, track++, `data-theme="custom" ${vars(o.vars ?? {})} `, `${s.id}-ov${j}`, theme())));
  return "\n" + [...segs, ...overlays].join("");
}

export function brandHosts({ vd, groups, lines, duration }) {
  const pal = vd.palette;
  const last = lines.at(-1);
  const caps = groups.map((g) => ({ start: r3(g.start), end: r3(g.end), text: g.text }));
  return "\n" +
    host("brand-kicker", "compositions/frames/brand-kicker.html", 0, duration, 40, vars({ text: vd.kicker, ...pal }) + " ") +
    host("brand-captions", "compositions/frames/brand-captions.html", 0, duration, 41, vars({ groups: JSON.stringify(caps), ...pal }) + " ") +
    // 样片总长不到最后一句时不放结尾
    (last.start >= duration ? "" : host("brand-ending", "compositions/frames/brand-ending.html", last.start, r3(duration - last.start), 42,
      vars({ next: vd.ending.next ?? "", question: vd.ending.question, cta: vd.ending.cta, holdAt: r3(last.end - last.start), ...pal }) + " "));
}

export function audioHosts({ duration, music }) {
  let a = `\n    <audio id="vo" src="assets/audio/vo.wav" data-start="0" data-duration="${duration}" data-track-index="90"></audio>\n`;
  if (music) a += `    <audio id="music" src="${music.src}" data-start="0" data-duration="${duration}" data-media-start="${music.mediaStart}" data-volume="${music.volume}" data-track-index="91"></audio>\n`;
  return a + "    ";
}

export function assemble(dir, built, config, { only = null, duration, music = null }) {
  const idx = join(dir, "index.html");
  if (!existsSync(idx)) throw new Error(`没有 ${idx}：先从 video-director 的 templates/index.html 复制`);
  writeFileSync(join(dir, "cues.js"), cuesJs(built));
  for (const f of ["brand-kicker", "brand-captions", "brand-ending"]) cpSync(join(config.brandDir, `${f}.html`), join(dir, "compositions/frames", `${f}.html`));
  if (!existsSync(join(dir, "assets/fonts/fonts.css"))) {
    if (config.fontsDir) cpSync(config.fontsDir, join(dir, "assets/fonts"), { recursive: true });
    else writeFonts(join(dir, "assets/fonts"));
  }
  const groups = JSON.parse(readFileSync(join(dir, "caption_groups.json"), "utf8")).groups.filter((g) => g.start < duration);
  let html = readFileSync(idx, "utf8");
  const used = built.segments.filter((s) => !only || only.includes(s.id));
  html = applyHead(html, used.some((s) => s.component), built.vd.palette?.bg);
  html = replaceBlock(html, "audio", audioHosts({ duration, music }));
  const plan = new Map(transitionPlan(built.segments).map((p) => [p.id, p]));
  const timed = built.segments.map((s) => ({ ...s, ...plan.get(s.id) }));
  html = replaceBlock(html, "segments", segmentHosts(timed, only, built.vd.palette, built.vd.fonts) + "    ");
  html = replaceBlock(html, "brand", brandHosts({ vd: built.vd, groups, lines: built.lines, duration }) + "    ");
  writeFileSync(idx, setRootDuration(html, duration));
}
