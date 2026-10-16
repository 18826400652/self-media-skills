// hyperframes 只用一份：video-director 自己装的（版本钉在 package.json）。vd build 的检查和配乐、渲染、透传都走它。
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_DIR = join(dirname(fileURLToPath(import.meta.url)), "../..");

export const hfBin = () => join(SKILL_DIR, "node_modules/.bin/hyperframes");

/** 装的 hyperframes 版本；没装时报错说怎么装 */
export function hfVersion() {
  const p = join(SKILL_DIR, "node_modules/hyperframes/package.json");
  if (!existsSync(p)) throw new Error(`video-director 还没装 hyperframes：cd ${SKILL_DIR} && npm ci`);
  return JSON.parse(readFileSync(p, "utf8")).version;
}
