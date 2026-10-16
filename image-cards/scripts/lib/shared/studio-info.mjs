// 由 shared/node/studio-info.mjs 同步而来，不要在这里改：改正本后跑 st sync-shared
// 读作品项目 studio.json 里的账号信息（账号名、目标观众、模板怎么领）：只在这一处写，各 skill 从这里读。
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const FIELDS = ["account", "audience", "lead"];
const PLACEHOLDER = /^（.*）$/;

function findStudioJson(start) {
  for (let dir = resolve(start); ; dir = dirname(dir)) {
    const p = join(dir, "studio.json");
    if (existsSync(p)) return p;
    if (dirname(dir) === dir) return null;
  }
}

/** 从 start 往上找 studio.json；返回 { account, audience, lead }，没写、占位或找不到都是 "" */
export function studioInfo(start = process.cwd()) {
  const path = findStudioJson(start);
  let raw = {};
  if (path) {
    try { raw = JSON.parse(readFileSync(path, "utf8")); } catch (err) { throw new Error(`${path} 不是合法 JSON：${err.message}`); }
  }
  const clean = (v) => (typeof v === "string" && !PLACEHOLDER.test(v.trim()) ? v.trim() : "");
  return Object.fromEntries(FIELDS.map((k) => [k, clean(raw[k])]));
}
