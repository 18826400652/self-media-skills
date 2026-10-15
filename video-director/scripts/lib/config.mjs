// 项目配置 video-director.config.json + narrated-video 配置里的账号强调色。
// fontsDir、gsap 选填：没写就用 vd 自己 npm 依赖里的字体包和 GSAP（见 lib/fonts.mjs）
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { GSAP_FILE } from "./fonts.mjs";

const FILE = "video-director.config.json";
const REQUIRED = ["brandDir", "sfxDir", "hfVersion"];

/** 从 startDir 向上找项目根（含 video-director.config.json 的目录） */
export function findProjectRoot(startDir) {
  let dir = resolve(startDir);
  for (;;) {
    if (existsSync(join(dir, FILE))) return dir;
    const up = dirname(dir);
    if (up === dir) throw new Error(`找不到 ${FILE}：从 ${startDir} 向上都没有。请在项目根目录建这个文件（见 skills/video-director/SKILL.md）`);
    dir = up;
  }
}

export function loadConfig(root) {
  const p = join(root, FILE);
  if (!existsSync(p)) throw new Error(`找不到 video-director.config.json：${p}`);
  const c = JSON.parse(readFileSync(p, "utf8"));
  for (const k of REQUIRED) if (!c[k]) throw new Error(`${p} 缺少字段 ${k}`);
  const abs = (x) => (isAbsolute(x) ? x : join(root, x));
  const nvp = join(root, "narrated-video.config.json");
  const accent = existsSync(nvp) ? JSON.parse(readFileSync(nvp, "utf8"))?.hfKit?.tokens?.accent ?? null : null;
  return { fontsDir: c.fontsDir ? abs(c.fontsDir) : null, gsap: c.gsap ? abs(c.gsap) : GSAP_FILE, brandDir: abs(c.brandDir), sfxDir: abs(c.sfxDir), hfVersion: c.hfVersion, accent };
}
