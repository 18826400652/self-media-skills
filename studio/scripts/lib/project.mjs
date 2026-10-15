// 作品项目：从当前目录向上找 studio.json（项目根的标记），读出目录约定。
// 工具包（skills）和作品项目分开放：skill 只认这里的约定，不写死任何作品目录名。
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const MARKER = "studio.json";
export const STUDIO_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const TOOLKIT_DIR = resolve(STUDIO_DIR, "..");
export const DEFAULT_TEMPLATES = join(STUDIO_DIR, "templates");

export const DEFAULTS = Object.freeze({
  works: "04-作品",
  templates: "05-模板",
  brand: "06-品牌资产/hyperframes",
  registry: "00-规划/系列/系列.json",
  positioning: "00-规划/账号定位.md",
  account: "",
  audience: "",
  toolkit: "",
});

/** 工具包版本（studio 的 package.json） */
export function toolkitVersion() {
  return JSON.parse(readFileSync(join(STUDIO_DIR, "package.json"), "utf8")).version;
}

/** 从 startDir 向上找项目根；找不到返回 null */
export function findRoot(startDir = process.cwd()) {
  let dir = resolve(startDir);
  for (;;) {
    if (existsSync(join(dir, MARKER))) return dir;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/** 读项目约定，路径字段都转成绝对路径（abs.*），原样保留相对写法 */
export function loadProject(startDir = process.cwd()) {
  const root = findRoot(startDir);
  if (!root) throw new Error(`找不到 ${MARKER}：从 ${resolve(startDir)} 向上都没有。新项目先跑 st init <目录>`);
  const raw = JSON.parse(readFileSync(join(root, MARKER), "utf8"));
  const cfg = { ...DEFAULTS, ...raw };
  const abs = Object.fromEntries(["works", "templates", "brand", "registry", "positioning"].map((k) => [k, resolve(root, cfg[k])]));
  return { root, ...cfg, abs };
}

/** 模板查找：项目 templates 目录里有同名文件就用项目的，否则用工具包默认的 */
export function templatePath(project, rel) {
  const own = join(project.abs.templates, rel);
  return existsSync(own) ? own : join(DEFAULT_TEMPLATES, rel);
}

/** 简单的版本要求：">=1.2.0" 或 "1.2.0"（视为 >=）。满足返回 true */
export function satisfies(version, want) {
  if (!want) return true;
  const num = (v) => v.replace(/^>=\s*/, "").split(".").map((x) => Number(x) || 0);
  const [a, b] = [num(version), num(want)];
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return true;
}
