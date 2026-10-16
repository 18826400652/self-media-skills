// vd init <目录>：建一个空的导演工程 = hyperframes 的 blank 工程 + vd 的 index.html、DIRECTOR.md 模板。
// 目录已存在且不为空时拒绝，不覆盖做了一半的工程。
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TEMPLATES = join(dirname(fileURLToPath(import.meta.url)), "../../templates");

export function initProject(dir, { runHf }) {
  if (existsSync(dir) && readdirSync(dir).length) throw new Error(`${dir} 已存在且不是空目录，不覆盖（要重建就先改名备份）`);
  const r = runHf(["init", dir, "--non-interactive", "--example=blank"]);
  if (r.status !== 0) {
    const detail = `${r.error?.message ?? ""}${r.stderr ?? ""}${r.stdout ?? ""}`.trim().slice(-300);
    throw new Error(`hyperframes init 失败：${detail}`);
  }
  for (const f of ["index.html", "DIRECTOR.md"]) cpSync(join(TEMPLATES, f), join(dir, f));
  for (const d of ["compositions/frames", "assets"]) mkdirSync(join(dir, d), { recursive: true });
}
