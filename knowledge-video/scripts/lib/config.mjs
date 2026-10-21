// 项目配置：从作品目录向上找 knowledge-video.config.json。找不到用默认值。
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { DRAFT_KEYS } from "./practical.mjs";

export const CONFIG_NAME = "knowledge-video.config.json";
const DEFAULTS = { series: null, audience: null, voiceGuide: null, experienceDir: "经验库", topicList: "03-选题池/选题清单.md", skipPlatforms: {}, douyinCover: null, xiaohongshuCover: null };

function findUp(start) {
  for (let dir = resolve(start); ; dir = dirname(dir)) {
    const p = join(dir, CONFIG_NAME);
    if (existsSync(p)) return p;
    if (dirname(dir) === dir) return null;
  }
}

export function loadConfig(start) {
  const path = findUp(start);
  if (!path) return { ...DEFAULTS, root: resolve(start) };
  try {
    return { ...DEFAULTS, ...JSON.parse(readFileSync(path, "utf8")), root: dirname(path) };
  } catch (err) {
    throw new Error(`${path} 不是合法 JSON：${err.message}`);
  }
}

/**
 * 这一期不做的平台：skipPlatforms = { "*": [...全项目], "<系列目录名>": [...只这个系列] }，两者合并。
 * 系列目录名取作品目录的上一级（04-作品/<系列>/<编号-简称>）。
 */
export function skippedPlatforms(cfg, episodeDir) {
  const skip = cfg.skipPlatforms ?? {};
  if (typeof skip !== "object" || Array.isArray(skip)) throw new Error(`${CONFIG_NAME} 的 skipPlatforms 要写成对象：{ "*": ["wechat"] } 或 { "<系列>": ["wechat"] }`);
  const series = basename(dirname(resolve(episodeDir)));
  const keys = [...(skip["*"] ?? []), ...(skip[series] ?? [])];
  const bad = keys.filter((k) => !DRAFT_KEYS.includes(k));
  if (bad.length) throw new Error(`${CONFIG_NAME} 的 skipPlatforms 里有不认识的平台：${bad.join("、")}（只能是 ${DRAFT_KEYS.join("、")}）`);
  return [...new Set(keys)];
}

/** 视频里承诺了领取方式：从项目根目录往上找 studio.json，lead 不为空 */
export function promisesLead(root) {
  for (let dir = resolve(root); ; dir = dirname(dir)) {
    const p = join(dir, "studio.json");
    if (existsSync(p)) {
      try { return !!String(JSON.parse(readFileSync(p, "utf8")).lead ?? "").trim(); } catch { return false; }
    }
    if (dirname(dir) === dir) return false;
  }
}
