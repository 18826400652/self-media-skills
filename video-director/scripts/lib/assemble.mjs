// 写 cues.js、复制品牌子画面和字体、替换 index.html 的 vd 标记块
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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
    return Math.round((this.cues[name] - this.seg[segId].start) * 1000) / 1000;
  },
};
`;
}

const host = (id, src, start, duration, track, extra = "") =>
  `    <div id="host-${id}" class="clip" data-composition-id="${id}" data-composition-src="${src}" data-start="${start}" data-duration="${duration}" data-track-index="${track}" data-width="1080" data-height="1920" ${extra}style="position:absolute;inset:0"></div>\n`;

export function segmentHosts(segments, only = null) {
  return "\n" + segments.filter((s) => !only || only.includes(s.id)).map((s, i) => host(s.id, `compositions/frames/${s.id}.html`, s.start, s.duration, 2 + i)).join("");
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
      vars({ next: vd.ending.next, question: vd.ending.question, cta: vd.ending.cta, holdAt: r3(last.end - last.start), ...pal }) + " "));
}

export function audioHosts({ duration, music }) {
  let a = `\n    <audio id="vo" src="assets/audio/vo.wav" data-start="0" data-duration="${duration}" data-track-index="90"></audio>\n`;
  if (music) a += `    <audio id="music" src="${music.src}" data-start="0" data-duration="${duration}" data-media-start="${music.mediaStart}" data-volume="${music.volume}" data-track-index="91"></audio>\n`;
  return a + "    ";
}

export function assemble(dir, built, config, { only = null, duration, music = null }) {
  const idx = join(dir, "index.html");
  if (!existsSync(idx)) throw new Error(`没有 ${idx}：先从 skills/video-director/templates/index.html 复制`);
  writeFileSync(join(dir, "cues.js"), cuesJs(built));
  for (const f of ["brand-kicker", "brand-captions", "brand-ending"]) cpSync(join(config.brandDir, `${f}.html`), join(dir, "compositions/frames", `${f}.html`));
  if (!existsSync(join(dir, "assets/fonts/fonts.css"))) cpSync(config.fontsDir, join(dir, "assets/fonts"), { recursive: true });
  const groups = JSON.parse(readFileSync(join(dir, "caption_groups.json"), "utf8")).groups.filter((g) => g.start < duration);
  let html = readFileSync(idx, "utf8");
  html = replaceBlock(html, "audio", audioHosts({ duration, music }));
  html = replaceBlock(html, "segments", segmentHosts(built.segments, only) + "    ");
  html = replaceBlock(html, "brand", brandHosts({ vd: built.vd, groups, lines: built.lines, duration }) + "    ");
  writeFileSync(idx, setRootDuration(html, duration));
}
