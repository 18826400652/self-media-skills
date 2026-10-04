#!/usr/bin/env node
// 用法：nv hf-kit <HyperFrames 工程目录>
//
// 把画面组件库 hf-kit/kit.js 装进工程（compositions/kit/kit.js），
// 并把项目配置 hfKit.tokens 里的品牌色、字体写进去。组件的用法和选用表见 references/hf-kit.md。
// 改了品牌配置或升级了组件库后重跑即可（会覆盖工程里的 kit.js）。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { SKILL_DIR, loadConfig } from "./lib/config.mjs";
import { writeCues } from "./lib/cues.mjs";

const SRC = join(SKILL_DIR, "hf-kit", "kit.js");
const TOKENS_RE = /\/\*KIT_TOKENS\*\/([\s\S]*?)\/\*END_KIT_TOKENS\*\//;
const TOKEN_KEYS = ["accent", "ink", "muted", "bg", "surface", "line", "font", "mono"];

/** 默认 token（kit.js 里写的）+ 项目配置覆盖 */
function mergeTokens(source, overrides) {
  const m = source.match(TOKENS_RE);
  if (!m) throw new Error("kit.js 里找不到 /*KIT_TOKENS*/ 标记");
  const defaults = Function(`"use strict"; return (${m[1]});`)();
  const unknown = Object.keys(overrides).filter((k) => !TOKEN_KEYS.includes(k));
  if (unknown.length) throw new Error(`hfKit.tokens 里有不认识的键：${unknown.join("、")}（可用：${TOKEN_KEYS.join("、")}）`);
  return { ...defaults, ...overrides };
}

function main() {
  const dir = resolve(process.argv[2] || "");
  if (!process.argv[2] || !existsSync(join(dir, "compositions"))) {
    console.error("用法：nv hf-kit <HyperFrames 工程目录>（需要 compositions/ 目录）");
    process.exit(1);
  }
  const config = loadConfig(dir);
  const overrides = config.hfKit?.tokens ?? {};
  const source = readFileSync(SRC, "utf8");
  const tokens = mergeTokens(source, overrides);
  const outDir = join(dir, "compositions", "kit");
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, "kit.js");
  writeFileSync(out, source.replace(TOKENS_RE, `/*KIT_TOKENS*/ ${JSON.stringify(tokens)} /*END_KIT_TOKENS*/`));
  console.log(`✓ compositions/kit/kit.js（品牌色：${Object.keys(overrides).length ? "项目配置 hfKit.tokens" : "默认配色"}）`);
  const cueFrames = writeCues(dir);
  console.log(cueFrames ? `✓ compositions/kit/cues.js（${cueFrames} 帧的逐字时间）` : "  还没有配音（audio_meta.json），cues.js 等 nv hf-audio 之后生成");
  console.log("  在帧里引用：<script src=\"compositions/kit/kit.js\"></script>，用法见 references/hf-kit.md");
}

try {
  main();
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exit(1);
}
