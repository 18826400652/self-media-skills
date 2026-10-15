// st init：建一个新的作品项目（目录骨架 + 各 skill 的默认配置 + 起步品牌样式）。已有的文件不覆盖。
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { DEFAULTS, MARKER, STUDIO_DIR, toolkitVersion } from "./project.mjs";
import { substitute } from "./new.mjs";

const SKELETON = join(STUDIO_DIR, "skeleton");
const RENAME = { gitignore: ".gitignore" }; // 工具包里不能直接放 .gitignore（会被当成工具包自己的）
const TEXT = new Set([".md", ".json", ".css", ".html", ""]);

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

export function parseInitArgs(argv) {
  const opts = { dir: null, account: "", audience: "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--account") opts.account = argv[++i] ?? "";
    else if (a === "--audience") opts.audience = argv[++i] ?? "";
    else if (a.startsWith("--")) throw new Error(`未知参数：${a}`);
    else opts.dir = a;
  }
  if (!opts.dir) throw new Error("用法：st init <目录> [--account 账号名] [--audience 目标观众]");
  return opts;
}

export function initProject({ dir, account = "", audience = "" }, log = console.log) {
  const root = resolve(dir);
  if (existsSync(join(root, MARKER))) throw new Error(`已经是作品项目了：${join(root, MARKER)}`);
  mkdirSync(root, { recursive: true });
  const vars = { 账号: account || "（账号名）", 观众: audience || "（目标观众）" };
  let created = 0, skipped = 0;
  for (const src of walk(SKELETON)) {
    const rel = relative(SKELETON, src);
    const name = rel.split("/").pop();
    const dest = join(root, rel.slice(0, rel.length - name.length), RENAME[name] ?? name);
    if (existsSync(dest)) { skipped++; log(`  · 已有，跳过：${relative(root, dest)}`); continue; }
    mkdirSync(join(dest, ".."), { recursive: true });
    if (TEXT.has(extname(name))) writeFileSync(dest, substitute(readFileSync(src, "utf8"), vars));
    else copyFileSync(src, dest);
    created++;
  }
  const studio = { ...DEFAULTS, account, audience, toolkit: `>=${toolkitVersion()}` };
  writeFileSync(join(root, MARKER), JSON.stringify(studio, null, 2) + "\n");

  log(`✓ 已建作品项目：${root}（新建 ${created} 个文件${skipped ? `，跳过 ${skipped} 个已有的` : ""}）`);
  log(`接下来：
  1. 填 00-规划/账号定位.md、00-规划/语气指南.md，在 00-规划/系列/系列.json 登记系列：{"系列名": {"label": "显示名", "unit": "期"}}
  2. 品牌：改 06-品牌资产/theme.css、hyperframes/frame.md 的颜色；参考音色放 06-品牌资产/参考音色.wav（字体和 GSAP 由 video-director、narrated-video 自带，不用准备）
  3. cd ${root} && st doctor，按提示补齐
  4. st new <系列> <简称> 开第一期`);
  return root;
}
