#!/usr/bin/env node
// 用法：vd build|cues|check <视频工程目录>
//   cues   DIRECTOR.md 的 @词 → cues.js（只算时间，不改别的文件）
//   build  cues → 音轨 → index.html 标记块 → 配乐对位与避让 → hyperframes check
//   check  校验 DIRECTOR.md + hyperframes check
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { assemble, cuesJs } from "./lib/assemble.mjs";
import { buildAudio } from "./lib/audio.mjs";
import { findProjectRoot, loadConfig } from "./lib/config.mjs";
import { buildCues } from "./lib/cues.mjs";
import { parseDirector, validateDirector } from "./lib/director.mjs";
import { addMusic, alignMusic, carve, resolveMusic } from "./lib/music.mjs";
import { run } from "./lib/run.mjs";
import { staleCopies } from "./lib/stale.mjs";

const USAGE = "用法：vd build|cues|check <视频工程目录>";
const GSAP = "/home/power/hyperframes/assets/gsap.min.js";

function load(dir) {
  for (const f of ["DIRECTOR.md", "audio_meta.json"]) if (!existsSync(join(dir, f))) throw new Error(`${dir} 里没有 ${f}`);
  const stale = staleCopies(dir);
  if (stale.length) console.warn(`⚠ ../抖音/ 里重新配过音，这里的 ${stale.join("、")} 还是旧的：把 audio_meta.json、caption_groups.json、assets/voice/ 重新复制过来再 vd build`);
  const meta = JSON.parse(readFileSync(join(dir, "audio_meta.json"), "utf8"));
  const parsed = parseDirector(readFileSync(join(dir, "DIRECTOR.md"), "utf8"));
  const errors = validateDirector(parsed, meta.voices.length);
  if (errors.length) throw new Error(`DIRECTOR.md 有 ${errors.length} 处问题：\n  - ${errors.join("\n  - ")}`);
  const built = { ...buildCues(parsed, meta), vd: parsed.vd };
  for (const w of built.warnings) console.warn(`⚠ ${w}`);
  return { meta, parsed, built };
}

const COMMANDS = {
  cues(dir) {
    const { built } = load(dir);
    writeFileSync(join(dir, "cues.js"), cuesJs(built));
    for (const [k, v] of Object.entries(built.cues)) console.log(`  @${k} → ${v}s`);
    console.log(`✓ cues.js（${Object.keys(built.cues).length} 个词，${built.segments.length} 段，口播 ${built.total}s）`);
  },
  build(dir, rest = []) {
    const config = loadConfig(findProjectRoot(dir));
    const { built } = load(dir);
    const vd = built.vd;
    const sample = rest.includes("--sample");
    const full = Math.round((built.total + vd.ending.hold) * 1000) / 1000;
    const duration = sample ? Math.round((built.cues[vd.sample.end.slice(1)] + vd.sample.tail) * 1000) / 1000 : full;
    const only = sample ? vd.sample.segments : null;
    buildAudio(dir, built, config);
    if (!existsSync(join(dir, "assets/gsap.min.js"))) cpSync(GSAP, join(dir, "assets/gsap.min.js"));
    assemble(dir, built, config, { only, duration, music: null });
    if (vd.music && !rest.includes("--no-music")) {
      addMusic(vd.music, {
        resolveMusic: () => resolveMusic(dir, vd.music.intent, config.hfVersion),
        alignMusic: (src) => alignMusic(dir, { src, drop: built.cues[vd.music.drop.slice(1)], duration }, config.hfVersion),
        carve: () => carve(dir, config.hfVersion),
        assemble: (music) => assemble(dir, built, config, { only, duration, music }),
      });
    }
    console.log(`✓ 总装完成：${sample ? `样片 ${only.join("、")}` : "整片"}，${duration}s`);
    return COMMANDS.check(dir, [], config);
  },
  check(dir, _rest, config = loadConfig(findProjectRoot(dir))) {
    load(dir);
    const r = run("npx", ["--yes", `hyperframes@${config.hfVersion}`, "check", "."], { cwd: dir });
    process.stdout.write(r.stdout);
    if (r.status !== 0) { console.error(r.stderr); return 1; }
    return 0;
  },
};

export async function main(argv) {
  const [cmd, dir, ...rest] = argv;
  if (!COMMANDS[cmd] || !dir) { console.error(USAGE); return 2; }
  try { return (await COMMANDS[cmd](resolve(dir), rest)) ?? 0; }
  catch (err) { console.error(`✗ ${err.message}`); return 1; }
}

export { COMMANDS };
if (import.meta.url === `file://${process.argv[1]}`) process.exit(await main(process.argv.slice(2)));
