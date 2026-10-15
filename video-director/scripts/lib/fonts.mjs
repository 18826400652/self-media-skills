// 字体包：从 vd 自己的 npm 依赖（fontsource，SIL OFL 1.1）生成 assets/fonts/（fonts.css + 字体文件）。
// 导演规则只用这三种字体：Noto Sans SC、Noto Serif SC、JetBrains Mono。中文字体按 unicode-range 拆分，渲染时只加载用到的字。
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const NODE_MODULES = resolve(dirname(fileURLToPath(import.meta.url)), "../../node_modules");
export const GSAP_FILE = join(NODE_MODULES, "gsap/dist/gsap.min.js");

const VARIABLE = [
  { dir: "noto-sans-sc", pkg: "@fontsource-variable/noto-sans-sc", note: "Noto Sans SC Variable (SIL OFL 1.1) — 按 unicode-range 拆分,渲染时只加载用到的字" },
  { dir: "noto-serif-sc", pkg: "@fontsource-variable/noto-serif-sc", note: "Noto Serif SC Variable (SIL OFL 1.1) — editorial 主题标题用" },
];
const MONO = { dir: "jetbrains-mono", pkg: "@fontsource/jetbrains-mono", weights: [400, 700] };

function pkgDir(pkg) {
  const d = join(NODE_MODULES, pkg);
  if (!existsSync(d)) throw new Error(`video-director 没装字体依赖 ${pkg}：cd ${resolve(NODE_MODULES, "..")} && npm ci`);
  return d;
}

const monoFace = (w) => `@font-face { font-family: 'JetBrains Mono'; font-style: normal; font-display: swap; font-weight: ${w}; src: url(${MONO.dir}/${MONO.dir}-latin-${w}-normal.woff2) format('woff2'); }`;

/** fonts.css 全文（字体文件路径相对 fonts.css 所在目录） */
export function fontsCss() {
  const css = (f) => readFileSync(join(pkgDir(f.pkg), "index.css"), "utf8").trimEnd().replaceAll("url(./files/", `url(${f.dir}/`);
  const [sans, serif] = VARIABLE;
  return [
    `/* ${sans.note} */`, css(sans),
    "/* JetBrains Mono (SIL OFL 1.1) — 代码块用 */", ...MONO.weights.map(monoFace), "",
    `/* ${serif.note} */`, css(serif),
  ].join("\n");
}

/** 生成 outDir/fonts.css 和三个字体目录（各带 LICENSE.txt） */
export function writeFonts(outDir) {
  for (const f of VARIABLE) {
    const src = pkgDir(f.pkg);
    mkdirSync(join(outDir, f.dir), { recursive: true });
    for (const n of readdirSync(join(src, "files")).filter((n) => n.endsWith("-wght-normal.woff2"))) copyFileSync(join(src, "files", n), join(outDir, f.dir, n));
    copyFileSync(join(src, "LICENSE"), join(outDir, f.dir, "LICENSE.txt"));
  }
  const mono = pkgDir(MONO.pkg);
  mkdirSync(join(outDir, MONO.dir), { recursive: true });
  for (const w of MONO.weights) copyFileSync(join(mono, "files", `${MONO.dir}-latin-${w}-normal.woff2`), join(outDir, MONO.dir, `${MONO.dir}-latin-${w}-normal.woff2`));
  copyFileSync(join(mono, "LICENSE"), join(outDir, MONO.dir, "LICENSE.txt"));
  writeFileSync(join(outDir, "fonts.css"), fontsCss());
}
