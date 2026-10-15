// 配音缓存放哪。缓存键里有台词、导演稿和 TTS 设置（speech.mjs），和哪一期无关，
// 所以在作品项目里时放项目根，各期共用：别期用过的台词不用再付费配一次。
import { copyFileSync, existsSync, linkSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** 在项目里（找到了 narrated-video.config.json）→ <项目根>/.media/voice-cache；否则 <工程>/.media/voice-cache */
export function voiceCacheDir(workDir, { root, configPath }) {
  if (!configPath) return join(workDir, ".media", "voice-cache");
  const media = join(root, ".media");
  const dir = join(media, "voice-cache");
  mkdirSync(dir, { recursive: true });
  // 项目的 .gitignore 不一定忽略根目录的 .media/（老项目只忽略 04-作品/*），在这里自己挡住
  if (!existsSync(join(media, ".gitignore"))) writeFileSync(join(media, ".gitignore"), "*\n");
  return dir;
}

/** 工程里以前的缓存搬进共用目录（硬链接，不行就复制；已有的不覆盖），返回搬了几个 */
export function adoptLegacyCache(legacyDir, sharedDir) {
  if (!existsSync(legacyDir) || resolve(legacyDir) === resolve(sharedDir)) return 0;
  let n = 0;
  for (const f of readdirSync(legacyDir)) {
    const to = join(sharedDir, f);
    if (existsSync(to)) continue;
    try { linkSync(join(legacyDir, f), to); } catch { copyFileSync(join(legacyDir, f), to); }
    n++;
  }
  return n;
}
