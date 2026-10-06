#!/usr/bin/env node
// 用法：nv hf-frames <HyperFrames 工程目录>
//
// 按 STORYBOARD.md 里每帧的 `- build: {…}` 生成画面 compositions/frames/NN-*.html（帧模板，见 references/douyin-recipe.md）。
// 没写 build 的帧不动（可以手写）。帧时长取 STORYBOARD 的 duration（nv hf-build 会先同步成配音时长）。
// nv hf-build 会自动调用本命令。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { SKILL_DIR, loadConfig, resolveLook } from "./lib/config.mjs";
import { buildFrame, parseStoryboardFrames } from "./lib/frame-build.mjs";
import { isMain } from "./lib/is-main.mjs";
import { mergeTokens } from "./hf-kit.mjs";

function main() {
  const dir = resolve(process.argv[2] || "");
  const sbPath = join(dir, "STORYBOARD.md");
  if (!process.argv[2] || !existsSync(sbPath)) {
    console.error("用法：nv hf-frames <HyperFrames 工程目录>（需要 STORYBOARD.md）");
    process.exit(1);
  }
  const { kicker, frames } = parseStoryboardFrames(readFileSync(sbPath, "utf8"));
  const config = loadConfig(dir);
  const tokens = mergeTokens(readFileSync(join(SKILL_DIR, "hf-kit", "kit.js"), "utf8"), config.hfKit?.tokens ?? {});
  const look = resolveLook(config);
  mkdirSync(join(dir, "compositions", "frames"), { recursive: true });
  let built = 0;
  for (const f of frames) {
    if (!f.build) continue;
    if (!f.id) throw new Error(`第 ${f.n} 帧缺少 src（如 compositions/frames/0${f.n}-hook.html）`);
    if (!(f.duration > 0)) throw new Error(`第 ${f.n} 帧缺少 duration（先运行 nv hf-audio，再由 nv hf-build 同步时长）`);
    writeFileSync(join(dir, f.src), buildFrame({ ...f, kicker, tokens, look, total: frames.length }));
    built++;
  }
  const manual = frames.filter((f) => !f.build).map((f) => f.n);
  console.log(`✓ 按 build 生成 ${built} 帧（${look}）${manual.length ? `；手写的帧：${manual.join("、")}` : ""}`);
}

if (isMain(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  }
}
