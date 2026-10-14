// 导演工程里的配音数据是从同级 抖音/ 复制来的；那边重新配音后，这里的副本就过期了
import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

export const COPIED = ["audio_meta.json", "caption_groups.json"];

/** 返回比 ../抖音/ 里同名文件旧的副本文件名 */
export function staleCopies(dir) {
  const src = join(dirname(dir), "抖音");
  return COPIED.filter((f) => existsSync(join(src, f)) && existsSync(join(dir, f)) && statSync(join(src, f)).mtimeMs > statSync(join(dir, f)).mtimeMs);
}
