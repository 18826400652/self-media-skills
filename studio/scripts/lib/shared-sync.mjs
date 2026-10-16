// st sync-shared：shared/ 里的正本 → 各 skill 目录里的拷贝（manifest 列出位置）。
// 拷贝 = 一行说明 + 正本全文。skill 之间不互相引用，每个 skill 单独拷走就能用；正本只在 shared/ 改。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";

const NOTE = (src) => `由 shared/${src} 同步而来，不要在这里改：改正本后跑 st sync-shared`;

export function copyHeader(src) {
  return `${extname(src) === ".py" ? "#" : "//"} ${NOTE(src)}\n`;
}

/** 读 manifest，先把所有正本读进来、检查 skill 目录都在：有问题直接抛错，一个文件都不写 */
function plan(toolkit) {
  const manifest = JSON.parse(readFileSync(join(toolkit, "shared/manifest.json"), "utf8"));
  const items = [];
  for (const [src, copies] of Object.entries(manifest)) {
    const srcPath = join(toolkit, "shared", src);
    if (!existsSync(srcPath)) throw new Error(`正本不存在：shared/${src}（manifest 里写了它）`);
    const body = copyHeader(src) + readFileSync(srcPath, "utf8");
    for (const copy of copies) {
      const skill = copy.split("/")[0];
      if (!existsSync(join(toolkit, skill))) throw new Error(`skill 目录不存在：${skill}（manifest 里 ${copy}）`);
      items.push({ src, copy, body });
    }
  }
  return items;
}

export function syncShared({ toolkit, check = false, log = () => {} }) {
  const changed = [];
  const problems = [];
  for (const { src, copy, body } of plan(toolkit)) {
    const path = join(toolkit, copy);
    const current = existsSync(path) ? readFileSync(path, "utf8") : null;
    if (current === body) continue;
    if (check) {
      problems.push(current === null ? `${copy} 不存在（正本 shared/${src}）` : `${copy} 和正本 shared/${src} 不一致`);
      continue;
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, body);
    changed.push(copy);
    log(`  ✓ ${copy} ← shared/${src}`);
  }
  return { changed, problems };
}
