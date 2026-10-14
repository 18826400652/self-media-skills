#!/usr/bin/env node
// 用法：vd build|cues|check <视频工程目录>
//   cues   DIRECTOR.md 的 @词 → cues.js（只算时间，不改别的文件）
//   build  cues → 音轨 → index.html 标记块 → 配乐对位与避让 → hyperframes check
//   check  校验 DIRECTOR.md + hyperframes check
import { resolve } from "node:path";

const USAGE = "用法：vd build|cues|check <视频工程目录>";
const COMMANDS = {};

export async function main(argv) {
  const [cmd, dir, ...rest] = argv;
  if (!COMMANDS[cmd] || !dir) { console.error(USAGE); return 2; }
  try { return (await COMMANDS[cmd](resolve(dir), rest)) ?? 0; }
  catch (err) { console.error(`✗ ${err.message}`); return 1; }
}

export { COMMANDS };
if (import.meta.url === `file://${process.argv[1]}`) process.exit(await main(process.argv.slice(2)));
