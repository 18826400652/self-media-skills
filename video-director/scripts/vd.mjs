#!/usr/bin/env node
// 用法：vd build|cues|check|qa <视频工程目录>
//   cues   DIRECTOR.md 的 @词 → cues.js（只算时间，不改别的文件）；--check 只校验不写文件
//   build  cues → 音轨 → dykit 组件 → index.html 标记块 → 配乐对位与避让 → hyperframes check
//          [--sample] [--no-music] [--update-components]（组件库换成 GitHub 上的最新提交）
//   check  校验 DIRECTOR.md + 列出组件候选 + hyperframes check
//   qa     抖音专用检查：@词 落定时刻查安全区、字幕带、栏目标签、@词元素可见，2 秒不动；写 qa-douyin.json 和 snapshots/cues-sheet.jpg
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assemble, cuesJs } from "./lib/assemble.mjs";
import { REPO, ensureLock, fetchArchive, installComponent, writeLock } from "./lib/components.mjs";
import { buildAudio } from "./lib/audio.mjs";
import { findProjectRoot, loadConfig } from "./lib/config.mjs";
import { buildCues } from "./lib/cues.mjs";
import { parseDirector, validateDirector } from "./lib/director.mjs";
import { addMusic, alignMusic, carve, ensureCore, resolveMusic } from "./lib/music.mjs";
import { douyinQa } from "./lib/qa-run.mjs";
import { run } from "./lib/run.mjs";
import { staleCopies } from "./lib/stale.mjs";

const USAGE = "用法：vd build|cues|check|qa <视频工程目录> [--sample] [--no-music] [--update-components] [--check]";
const CACHE = join(homedir(), ".cache/video-director/hyperframes");

/** 把要构建的段用到的 dykit 组件装进工程（按 components.lock.json 的提交号）；没用组件时不联网 */
export function installAll(dir, built, { update = false, only = null } = {}, deps = { ensureLock, fetchArchive, installComponent, writeLock }) {
  const segs = built.segments.filter((s) => s.component && (!only || only.includes(s.id)));
  const names = [...new Set(segs.map((s) => s.component))];
  if (!names.length) {
    if (update) console.log("◇ 本次构建没有用到组件，--update-components 没有效果");
    return [];
  }
  const { sha, changed } = deps.ensureLock(dir, { update });
  const repo = deps.fetchArchive(sha, CACHE);
  const files = [...new Set(names.flatMap((n) => deps.installComponent(repo, n, dir)))];
  // 下载、安装都成功才写锁文件：失败时还停在旧版本
  if (changed) {
    deps.writeLock(dir, sha);
    console.log(`✓ 组件库锁定到 ${REPO}@${sha.slice(0, 7)}`);
  }
  console.log(`✓ 组件 ${names.join("、")}（${sha.slice(0, 7)}，${files.length} 个文件）`);
  return files;
}

export function candidatesText(c) {
  if (!c.length) return "◇ 组件候选：无";
  return `◇ 组件候选 ${c.length} 个（交成片时请用户决定要不要提交到 hyperframes）：\n${c.map((x) => `  - ${x.name}：${x.scene}（来自 ${x.from}）`).join("\n")}`;
}
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
  cues(dir, rest = []) {
    const { built } = load(dir);
    if (rest.includes("--check")) {
      console.log(`✓ DIRECTOR.md 通过（${Object.keys(built.cues).length} 个词，${built.segments.length} 段）`);
      return 0;
    }
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
    installAll(dir, built, { update: rest.includes("--update-components"), only });
    if (!existsSync(join(dir, "assets/gsap.min.js"))) cpSync(config.gsap, join(dir, "assets/gsap.min.js"));
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
  async qa(dir) {
    const config = loadConfig(findProjectRoot(dir));
    const { built } = load(dir);
    ensureCore(dir, config.hfVersion);
    const { bundleToSingleHtml } = await import(pathToFileURL(join(dir, "node_modules/@hyperframes/core/dist/compiler/index.js")).href);
    // 动态 import：没装 puppeteer-core 时其他子命令照常能用
    const { openPage } = await import("./lib/inspect-page.mjs").catch((err) => {
      throw new Error(`vd qa 需要 puppeteer-core：在 video-director 技能目录跑 npm i（${err.message}）`);
    });
    const page = await openPage({ html: await bundleToSingleHtml(dir), root: dir });
    let r;
    try { r = await douyinQa(built, page, join(dir, "snapshots/cues")); } finally { await page.close(); }
    writeFileSync(join(dir, "qa-douyin.json"), JSON.stringify({ passed: r.passed, issues: r.issues.map(({ level, msg }) => ({ level, msg })), shots: r.shots }, null, 2) + "\n");
    const sheet = run("ffmpeg", ["-v", "error", "-y", "-pattern_type", "glob", "-i", "snapshots/cues/*.png", "-vf", `scale=270:-1,tile=6x${Math.ceil(r.shots.length / 6)}:padding=6:color=0x444444`, "-frames:v", "1", "snapshots/cues-sheet.jpg"], { cwd: dir });
    if (sheet.status !== 0) console.warn(`⚠ 总览图没拼成：${sheet.stderr.trim()}`);
    for (const i of r.issues) console.log(`${i.level === "error" ? "✗" : "⚠"} ${i.msg}`);
    console.log(`${r.passed ? "✓" : "✗"} 抖音专用检查：${r.shots.length} 个时间点，${r.issues.filter((i) => i.level === "error").length} 个 ✗（截图总览 snapshots/cues-sheet.jpg，按 DIRECTOR.md 逐条看）`);
    return r.passed ? 0 : 1;
  },
  check(dir, _rest, config = loadConfig(findProjectRoot(dir))) {
    const { parsed } = load(dir);
    console.log(candidatesText(parsed.candidates));
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
// 用 pathToFileURL 比较：路径里有中文、空格时 import.meta.url 是百分号编码的
if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(await main(process.argv.slice(2)));
