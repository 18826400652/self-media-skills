#!/usr/bin/env node
// 用法：nv hf-fonts <HyperFrames 工程目录>
//
// 让 HyperFrames 工程「自带字体」——渲染机没有装中文字体，不打包就会回退成别的字体。
//   1. 扫描 compositions/ 里用到的 font-family 和 font-weight，以及画面、字幕、SCRIPT.md 里的全部文字；
//   2. 从 HyperFrames 的字体缓存（~/.cache/hyperframes/fonts/<字体>/，跑过一次 nv check 就有）
//      为每个「字体 × 字重」合并出只含这些字的 woff2：assets/fonts/<Family_Name>_<字重>.woff2；
//   3. 在每个 compositions/frames/*.html 的 <template> 里注入（或更新）<style data-fonts> 的 @font-face。
// 字幕（captions.mjs）按文件名前缀自己找字体，生成后重跑一次 captions build 即可。
// 改了画面文字后要重跑（只含用到的字）。
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { SKILL_DIR } from "./lib/config.mjs";

const PYTHON = join(SKILL_DIR, ".venv", "bin", "python");
const SUBSET = join(SKILL_DIR, "scripts", "font_subset.py");
const CACHE = join(homedir(), ".cache", "hyperframes", "fonts");
const FONTS_BLOCK_RE = /\n?\s*<style data-fonts>[\s\S]*?<\/style>/;

const slug = (family) => family.toLowerCase().replace(/\s+/g, "-");
const fileBase = (family) => family.replace(/\s+/g, "_");

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

function usedFonts(htmls) {
  const css = htmls.join("\n");
  const families = new Set(
    [...css.matchAll(/font-family:\s*["']([^"']+)["']/g)].map((m) => m[1]).filter((f) => existsSync(join(CACHE, slug(f)))),
  );
  const weights = new Set(["400", ...[...css.matchAll(/font-weight:\s*(\d{3})/g)].map((m) => m[1])]);
  return { families: [...families], weights: [...weights].sort() };
}

function buildFonts(dir, families, weights, textFile) {
  const outDir = join(dir, "assets", "fonts");
  mkdirSync(outDir, { recursive: true });
  const faces = [];
  for (const family of families) {
    for (const weight of weights) {
      const file = `${fileBase(family)}_${weight}.woff2`;
      let note = "";
      try {
        execFileSync(PYTHON, [SUBSET, join(CACHE, slug(family)), weight, textFile, join(outDir, file)], { stdio: ["ignore", "ignore", "pipe"] });
      } catch (err) {
        const msg = err.stderr?.toString().trim() ?? err.message;
        if (err.status === 2 && /没有字重/.test(msg)) continue; // 这个字体没有该字重
        if (err.status !== 3) throw new Error(`${family} ${weight}：${msg}`);
        // 缺字：西文字体不含中文是正常的，那些字由 font-family 里的下一个字体显示
        note = `（缺 ${[...msg.replace(/^.*：/, "")].length} 个字，由后备字体显示）`;
      }
      faces.push(`@font-face { font-family: "${family}"; font-weight: ${weight}; font-style: normal; font-display: block; src: url("assets/fonts/${file}") format("woff2"); }`);
      console.log(`  ✓ assets/fonts/${file}${note}`);
    }
  }
  return faces;
}

function injectFaces(file, faces) {
  const html = readFileSync(file, "utf8");
  const block = `\n    <style data-fonts>\n      ${faces.join("\n      ")}\n    </style>`;
  const stripped = html.replace(FONTS_BLOCK_RE, "");
  const at = stripped.indexOf("<style>");
  if (at < 0) throw new Error(`${file}：找不到 <style>，无法注入字体`);
  const lineStart = stripped.lastIndexOf("\n", at);
  writeFileSync(file, stripped.slice(0, lineStart) + block + stripped.slice(lineStart));
}

function main() {
  const dir = resolve(process.argv[2] || "");
  if (!process.argv[2] || !existsSync(join(dir, "compositions"))) {
    console.error("用法：nv hf-fonts <HyperFrames 工程目录>（需要 compositions/ 目录）");
    process.exit(1);
  }
  const htmlFiles = walk(join(dir, "compositions")).filter((f) => f.endsWith(".html"));
  const htmls = htmlFiles.map((f) => readFileSync(f, "utf8"));
  const { families, weights } = usedFonts(htmls);
  if (!families.length) {
    throw new Error(`没找到可打包的字体：画面用到的字体不在 ${CACHE}。先运行一次 nv check ${dir}，让 HyperFrames 下载字体缓存`);
  }

  const extra = ["SCRIPT.md", "caption_groups.json"].map((f) => join(dir, f)).filter(existsSync).map((f) => readFileSync(f, "utf8"));
  const textFile = join(dir, ".hyperframes", "font-text.txt");
  mkdirSync(join(dir, ".hyperframes"), { recursive: true });
  writeFileSync(textFile, [...htmls, ...extra].join("\n"));

  console.log(`打包字体：${families.join("、")} · 字重 ${weights.join(" ")}`);
  const faces = buildFonts(dir, families, weights, textFile);
  const frames = htmlFiles.filter((f) => f.includes(`${"compositions"}/frames/`));
  frames.forEach((f) => injectFaces(f, faces));
  console.log(`✓ 已注入 ${frames.length} 个画面。字幕请重跑 captions build`);
}

try {
  main();
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exit(1);
}
