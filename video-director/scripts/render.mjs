// vd render <视频目录> [--sample] [hyperframes render 的其他参数]
// 渲染到 <视频目录>/renders/，完成后自动做成片检查（verify.mjs）。
// 视频目录是作品下的平台子目录（如 02-导演做法/抖音-director）时用作品名命名；--sample 出 renders/sample.mp4（风格样片）。
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hfBin } from "./lib/hyperframes.mjs";
import { isMain } from "./lib/is-main.mjs";

const SKILL_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

export function renderTarget(dir, { sample = false } = {}) {
  if (sample) return join(dir, "renders", "sample.mp4");
  const parent = basename(dirname(dir));
  const name = /^[0-9]+-/.test(parent) ? parent : basename(dir);
  return join(dir, "renders", `${name}.mp4`);
}

function main(argv) {
  if (!argv[0] || argv[0].startsWith("--")) {
    console.error("用法：vd render <视频目录> [--sample] [参数]");
    return 2;
  }
  const dir = resolve(argv[0]);
  const rest = argv.slice(1);
  const sample = rest.includes("--sample");
  const out = renderTarget(dir, { sample });
  mkdirSync(join(dir, "renders"), { recursive: true });
  const r = spawnSync(hfBin(), ["render", dir, "-o", out, ...rest.filter((a) => a !== "--sample")], { stdio: "inherit" });
  if (r.status !== 0) return r.status ?? 1;
  return spawnSync(process.execPath, [join(SKILL_DIR, "scripts/verify.mjs"), out, "--project", dir], { stdio: "inherit" }).status ?? 1;
}

if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2));
