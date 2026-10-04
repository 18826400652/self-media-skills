// 音效库：按名字找音效文件。先找项目自己的音效目录，再找内置库。
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SKILL_DIR } from "./config.mjs";

// 内置音效库（Pixabay 授权，可商用、免署名），随 hyperframes 依赖安装
export const BUILTIN_SFX_DIR = join(SKILL_DIR, "node_modules/hyperframes/dist/skills/media-use/audio/assets/sfx");
const SFX_EXTS = [".mp3", ".wav", ".m4a"];

export const probe = (file) =>
  Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim());

/** 名字 → 文件路径；dirs 按顺序查找，最后查内置库。找不到时列出内置可用的名字 */
export function findSfxFile(name, dirs = []) {
  const names = SFX_EXTS.some((e) => name.endsWith(e)) ? [name] : SFX_EXTS.map((e) => name + e);
  for (const dir of [...dirs, BUILTIN_SFX_DIR]) {
    const hit = names.map((n) => join(dir, n)).find((f) => existsSync(f));
    if (hit) return hit;
  }
  const manifest = join(BUILTIN_SFX_DIR, "manifest.json");
  const builtin = existsSync(manifest)
    ? Object.keys(JSON.parse(readFileSync(manifest, "utf8"))).join(" ")
    : "（内置音效库不存在，请在 skill 目录 npm install）";
  throw new Error(`找不到音效「${name}」。内置可用：${builtin}；也可以把文件放进配置 sfx.dir 指定的目录`);
}
