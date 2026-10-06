// 项目配置：从作品目录向上找 knowledge-video.config.json。找不到用默认值。
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const CONFIG_NAME = "knowledge-video.config.json";
const DEFAULTS = { series: null, audience: null, voiceGuide: null, experienceDir: "经验库" };

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
