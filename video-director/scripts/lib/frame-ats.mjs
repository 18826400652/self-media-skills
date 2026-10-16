// 段 HTML 里 at("词") 用到的词，和 cues 对一遍：DIRECTOR.md 没写的 @词 在 build、渲染时才报错，提前查出来
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const AT = /\bat\(\s*(["'])([^"'\n]+)\1/g;

/** 一段 HTML 里 at("…") / VD.at("…") 用到的词，去重保序 */
export function atsInHtml(html) {
  return [...new Set([...html.matchAll(AT)].map((m) => m[2]))];
}

/** compositions/frames/*.html 和 index.html 里用了、cues 里却没有的词：[{ file, name }] */
export function missingAts(dir, cues) {
  const frames = join(dir, "compositions", "frames");
  const files = [
    ...(existsSync(frames) ? readdirSync(frames).filter((f) => f.endsWith(".html")).sort().map((f) => join("compositions", "frames", f)) : []),
    ...(existsSync(join(dir, "index.html")) ? ["index.html"] : []),
  ];
  return files.flatMap((file) => atsInHtml(readFileSync(join(dir, file), "utf8")).filter((name) => !(name in cues)).map((name) => ({ file, name })));
}
