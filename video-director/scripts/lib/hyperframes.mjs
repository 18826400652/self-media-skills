// hyperframes 和 @hyperframes/core 只用一份：video-director 自己装的（版本钉在 package.json）。
// build 的检查、配乐、渲染、透传走 hyperframes；vd qa 打包页面、人声避让从 vd 这份 core 拿——工程里不再各装一份。
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const SKILL_DIR = join(dirname(fileURLToPath(import.meta.url)), "../..");

export const hfBin = () => join(SKILL_DIR, "node_modules/.bin/hyperframes");

/** 装的 hyperframes 版本；没装时报错说怎么装 */
export function hfVersion() {
  const p = join(SKILL_DIR, "node_modules/hyperframes/package.json");
  if (!existsSync(p)) throw new Error(`video-director 还没装 hyperframes：cd ${SKILL_DIR} && npm ci`);
  return JSON.parse(readFileSync(p, "utf8")).version;
}

/** 取 hyperframes 可执行文件；没装就抛带安装办法的错（spawnSync 找不到文件时只会返回空的 status，不会自己说话） */
export function requireHf({ bin = hfBin(), skillDir = SKILL_DIR } = {}) {
  if (!existsSync(bin)) throw new Error(`video-director 还没装 hyperframes：cd ${skillDir} && npm ci（或 st install --deps）`);
  return bin;
}

/** vd 自己那份 @hyperframes/core（和 hyperframes 同版本）：打包页面、人声避让都用它 */
export const coreRoot = () => join(SKILL_DIR, "node_modules/@hyperframes/core");

/** 打包器入口：把工程 index.html 合成单文件，交给 vd qa 的浏览器读 */
export const coreEntry = () => join(coreRoot(), "dist/compiler/index.js");

export function requireCore({ root = coreRoot(), skillDir = SKILL_DIR } = {}) {
  if (!existsSync(join(root, "package.json"))) throw new Error(`video-director 还没装 @hyperframes/core：cd ${skillDir} && npm ci（或 st install --deps）`);
  return root;
}
