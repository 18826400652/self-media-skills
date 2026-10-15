// hyperframes 只用一份：narrated-video 装的那个（版本钉在 narrated-video/package.json）。
// nv render、vd build 的检查和配乐、样片渲染都走它，避免一条流程里混用几个版本。
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const NV_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../narrated-video");

export const hfBin = () => join(NV_DIR, "node_modules/.bin/hyperframes");

/** narrated-video 装的 hyperframes 版本；没装时报错说怎么装 */
export function nvHfVersion() {
  const p = join(NV_DIR, "node_modules/hyperframes/package.json");
  if (!existsSync(p)) throw new Error(`narrated-video 还没装 hyperframes：cd ${NV_DIR} && npm ci`);
  return JSON.parse(readFileSync(p, "utf8")).version;
}
