#!/usr/bin/env node
// 用法：vd init|cues|build|check|qa|render|verify <视频工程目录>；其他子命令透传给 hyperframes
//   init   建空的导演工程（hyperframes blank + vd 模板）；目录不为空时拒绝
//   render 渲染到 <工程>/renders/（--sample 出 sample.mp4），完成后自动 verify
//   verify <成片.mp4> [--project <工程>]：帧数、时长、声音、尺寸、黑屏
//   measure <成片.mp4> [--json]：时长、内容区静态率 / 变化率 / 最长静止、响度
//   components  列出 dykit 组件（用途、适合、时长、节拍、变量和默认值）；可跟关键词筛，如 vd components 抖音 对比
//   cues   DIRECTOR.md 的 @词 → cues.js（只算时间，不改别的文件）；--check 只校验不写文件；段里 at() 用了没写的词报错
//   build  cues → 音轨 → dykit 组件 → index.html 标记块 → 配乐对位与避让 → hyperframes check
//          [--sample] [--no-music] [--update-components]（组件库换成 GitHub 上的最新提交）
//   check  校验 DIRECTOR.md + 列出组件候选 + hyperframes check
//   qa     抖音专用检查：@词 落定时刻查安全区、字幕带、栏目标签、@词元素可见，2 秒不动；写 qa-douyin.json（样片 qa-douyin-sample.json）和 snapshots/cues-sheet.jpg
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assemble, cuesJs } from "./lib/assemble.mjs";
import { REPO, projectCatalog, catalogEntry, catalogText, componentInfo, ensureLock, fetchArchive, fitProblem, installComponent, localArchive, recordingProblem, textProblems, writeLock } from "./lib/components.mjs";
import { buildAudio, shotSfx } from "./lib/audio.mjs";
import { recordLedger } from "./lib/ledger.mjs";
import { parseArgs, reviewPack } from "./lib/review-pack.mjs";
import { findProjectRoot, loadConfig, localDykitDir } from "./lib/config.mjs";
import { buildCues } from "./lib/cues.mjs";
import { missingAts } from "./lib/frame-ats.mjs";
import { parseDirector, validateDirector } from "./lib/director.mjs";
import { addMusic, alignMusic, carve, probeLen, resolveMusic } from "./lib/music.mjs";
import { craftSummary } from "./lib/craft.mjs";
import { buildProblem, douyinQa, presentSegments, staleBuild, writeBuildStatus } from "./lib/qa-run.mjs";
import { coreEntry, requireCore, requireHf } from "./lib/hyperframes.mjs";
import { initProject } from "./lib/init.mjs";
import { run } from "./lib/run.mjs";

const USAGE = "用法：vd init|cues|build|check|qa|render|verify|measure|review-pack|components <视频工程目录> [--sample] [--no-music] [--update-components] [--check]；其他子命令透传给 hyperframes";
const SCRIPTS = fileURLToPath(new URL(".", import.meta.url));
const CACHE = join(homedir(), ".cache/video-director/hyperframes");

/** 把要构建的段用到的 dykit 组件装进工程（按 components.lock.json 的提交号）；没用组件时不联网 */
export function installAll(dir, built, { update = false, only = null, local = null } = {}, overrides = {}) {
  const deps = { ensureLock, fetchArchive, installComponent, writeLock, componentInfo, catalogEntry, probeLen, ...overrides };
  const wanted = built.segments.filter((s) => !only || only.includes(s.id));
  const segs = wanted.filter((s) => s.component);
  const names = [...new Set([...segs.map((s) => s.component), ...wanted.flatMap((s) => (s.overlays ?? []).map((o) => o.component))])];
  if (!names.length) {
    if (update) console.log("◇ 本次构建没有用到组件，--update-components 没有效果");
    return [];
  }
  if (local) console.log(`◇ 组件来自本地 ${local}（不锁版本，只用于磨组件）`);
  const { sha, changed } = local ? { sha: "local", changed: false } : deps.ensureLock(dir, { update });
  const repo = local ? localArchive(local) : deps.fetchArchive(sha, CACHE);
  const files = [...new Set(names.flatMap((n) => deps.installComponent(repo, n, dir)))];
  const unfit = segs.filter((s) => typeof s.duration === "number").map((s) => fitProblem({ name: s.component, segId: s.id, segDuration: s.duration, ...deps.componentInfo(repo, s.component, dir) })).filter(Boolean);
  if (unfit.length) throw new Error(`有 ${unfit.length} 个组件段撑不满：\n  - ${unfit.join("\n  - ")}`);
  for (const s of segs.filter((x) => x.component === "dy-rec-phone" && x.vars?.src && typeof x.duration === "number")) {
    const w = recordingProblem({ segId: s.id, src: s.vars.src, recLen: deps.probeLen(join(dir, s.vars.src)), segDuration: s.duration, html: deps.componentInfo(repo, s.component, dir).html });
    if (w) console.warn(`⚠ ${w}`);
  }
  const texts = [...segs, ...wanted.flatMap((s) => (s.overlays ?? []).map((o) => ({ ...o, id: s.id })))]
    .flatMap((x) => textProblems({ segId: x.id, vars: x.vars, catalogEntry: deps.catalogEntry(repo, x.component) }));
  for (const w of texts) console.warn(`⚠ ${w}`);
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
  for (const f of ["DIRECTOR.md", "audio_meta.json"]) if (!existsSync(join(dir, f))) throw new Error(`${dir} 里没有 ${f}${f === "audio_meta.json" ? `：先跑 vo ${dir}` : ""}`);
  const meta = JSON.parse(readFileSync(join(dir, "audio_meta.json"), "utf8"));
  const parsed = parseDirector(readFileSync(join(dir, "DIRECTOR.md"), "utf8"));
  const errors = validateDirector(parsed, meta.voices.length);
  if (errors.length) throw new Error(`DIRECTOR.md 有 ${errors.length} 处问题：\n  - ${errors.join("\n  - ")}`);
  const built = { ...buildCues(parsed, meta), vd: parsed.vd };
  for (const w of built.warnings) console.warn(`⚠ ${w}`);
  const missing = missingAts(dir, built.cues);
  if (missing.length) throw new Error(`段里用了 ${missing.length} 个 DIRECTOR.md 没写的 @词（在正文里写成 @词 再跑）：\n  - ${missing.map((m) => `${m.file}：at("${m.name}")`).join("\n  - ")}`);
  return { meta, parsed, built };
}

const COMMANDS = {
  init(dir) {
    initProject(dir, { runHf: (args) => spawnSync(requireHf(), args, { stdio: ["ignore", "inherit", "pipe"], encoding: "utf8", env: { ...process.env, HYPERFRAMES_SKIP_SKILLS: "1" } }) });
    console.log(`✓ 导演工程：${dir}（写 SCRIPT.md、VOICE.md → vo 配音 → 写 DIRECTOR.md）`);
  },
  render(dir, rest = []) {
    return spawnSync(process.execPath, [join(SCRIPTS, "render.mjs"), dir, ...rest], { stdio: "inherit" }).status ?? 1;
  },
  verify(file, rest = []) {
    return spawnSync(process.execPath, [join(SCRIPTS, "verify.mjs"), file, ...rest], { stdio: "inherit" }).status ?? 1;
  },
  "review-pack"(file, rest = [], { reviewPack: pack = reviewPack } = {}) {
    const out = pack(parseArgs([file, ...rest]));
    console.log(`✓ 评审素材包：${out}（contact.jpg 总览、full/ 原尺寸帧、strip-*.jpg 连拍、spec.json 规格）`);
    return 0;
  },
  measure(file, rest = [], { run = spawnSync } = {}) {
    return run(process.execPath, [join(SCRIPTS, "measure.mjs"), file, ...rest], { stdio: "inherit" }).status ?? 1;
  },
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
    if (!existsSync(join(dir, "caption_groups.json"))) throw new Error(`${dir} 里没有 caption_groups.json：先跑 vo ${dir}（配音时一起生成）`);
    const config = loadConfig(findProjectRoot(dir));
    const { built } = load(dir);
    const vd = built.vd;
    const sample = rest.includes("--sample");
    const full = Math.round((built.total + vd.ending.hold) * 1000) / 1000;
    const duration = sample ? Math.round((built.cues[vd.sample.end.slice(1)] + vd.sample.tail) * 1000) / 1000 : full;
    const only = sample ? vd.sample.segments : null;
    const local = localDykitDir(config);
    installAll(dir, built, { update: rest.includes("--update-components"), only, local });
    const used = built.segments.filter((s) => !only || only.includes(s.id));
    buildAudio(dir, built, config, shotSfx(used, projectCatalog(dir, local, CACHE)));
    if (!existsSync(join(dir, "assets/gsap.min.js"))) cpSync(config.gsap, join(dir, "assets/gsap.min.js"));
    assemble(dir, built, config, { only, duration, music: null });
    if (vd.music && !rest.includes("--no-music")) {
      addMusic(vd.music, {
        resolveMusic: () => resolveMusic(dir, vd.music.intent, undefined, { duration }),
        alignMusic: (src) => alignMusic(dir, { src, drop: built.cues[vd.music.drop.slice(1)], duration }),
        carve: () => carve(dir),
        assemble: (music) => assemble(dir, built, config, { only, duration, music }),
      });
    }
    console.log(`✓ 总装完成：${sample ? `样片 ${only.join("、")}` : "整片"}，${duration}s`);
    const status = COMMANDS.check(dir, [], config);
    writeBuildStatus(dir, status === 0);
    return status;
  },
  async qa(dir) {
    // 动态 import：没装 puppeteer-core 时其他子命令照常能用
    const { chromePath, openPage } = await import("./lib/inspect-page.mjs").catch((err) => {
      throw new Error(`vd qa 需要 puppeteer-core：在 video-director 技能目录跑 npm i（${err.message}）`);
    });
    chromePath(); // 先确认有 Chrome，再读工程
    const config = loadConfig(findProjectRoot(dir)); // craft 阈值从项目配置来
    const { built } = load(dir);
    const stale = staleBuild(dir, built) ?? buildProblem(dir);
    if (stale) throw new Error(stale);
    const segments = presentSegments(readFileSync(join(dir, "index.html"), "utf8"), built.segments);
    const sample = segments.length < built.segments.length;
    const out = sample ? "qa-douyin-sample.json" : "qa-douyin.json";
    requireCore(); // 打包器在 vd 自己那份 @hyperframes/core 里
    const { bundleToSingleHtml } = await import(pathToFileURL(coreEntry()).href);
    const page = await openPage({ html: await bundleToSingleHtml(dir), root: dir });
    let r;
    try { r = await douyinQa({ ...built, segments }, page, join(dir, "snapshots/cues"), { craft: config.craft }); } finally { await page.close(); }
    writeFileSync(join(dir, out), JSON.stringify({ passed: r.passed, issues: r.issues.map(({ level, msg }) => ({ level, msg })), shots: r.shots, craft: r.craft }, null, 2) + "\n");
    const sheet = run("ffmpeg", ["-v", "error", "-y", "-pattern_type", "glob", "-i", "snapshots/cues/*.png", "-vf", `scale=270:-1,tile=6x${Math.ceil(r.shots.length / 6)}:padding=6:color=0x444444`, "-frames:v", "1", "snapshots/cues-sheet.jpg"], { cwd: dir });
    if (sheet.status !== 0) console.warn(`⚠ 总览图没拼成：${sheet.stderr.trim()}`);
    const summary = craftSummary(r.craft);
    if (summary) {
      console.log(summary.metrics);
      console.log("视觉工艺告警：" + summary.counts);
    }
    for (const i of r.issues) console.log(`${i.level === "error" ? "✗" : "⚠"} ${i.msg}`);
    console.log(`${r.passed ? "✓" : "✗"} 抖音专用检查（${sample ? `样片 ${segments.map((s) => s.id).join("、")}` : "整片"}，结果 ${out}）：${r.shots.length} 个时间点，${r.issues.filter((i) => i.level === "error").length} 个 ✗（截图总览 snapshots/cues-sheet.jpg，按 DIRECTOR.md 逐条看）`);
    return r.passed ? 0 : 1;
  },
  // 列出 dykit 组件（工程锁着哪个版本就看哪个，没锁看最新）；不写锁文件
  components(dir, rest = [], deps = { ensureLock, fetchArchive }) {
    const { sha } = deps.ensureLock(dir);
    const repo = deps.fetchArchive(sha, CACHE);
    const catalog = JSON.parse(readFileSync(join(repo, "catalog/catalog.json"), "utf8"));
    console.log(`dykit 组件库 ${REPO}@${sha.slice(0, 7)}（在 DIRECTOR.md 机器块的段里写 "component" 和 "vars"）\n`);
    console.log(catalogText(catalog, rest.join(" ")));
  },
  check(dir, _rest, config = loadConfig(findProjectRoot(dir)), { requireBin = requireHf } = {}) {
    const bin = requireBin();
    const { parsed, built } = load(dir);
    console.log(candidatesText(parsed.candidates));
    for (const c of recordLedger({ root: findProjectRoot(dir), projectDir: dir, segments: built.segments, ...(config.shotLedger ? { ledgerRel: config.shotLedger } : {}) })) console.log(`◇ 镜头候选台账：${c}`);
    const r = run(bin, ["check", "."], { cwd: dir });
    process.stdout.write(r.stdout);
    if (r.status !== 0) { console.error(r.stderr); return 1; }
    return 0;
  },
};

export function runHyperframes(args, { requireBin = requireHf } = {}) {
  try { return spawnSync(requireBin(), args, { stdio: "inherit" }).status ?? 1; }
  catch (err) { console.error(`✗ ${err.message}`); return 1; }
}

export async function main(argv, { passthrough = runHyperframes } = {}) {
  const [cmd, dir, ...rest] = argv;
  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") { console.error(USAGE); return 2; }
  if (!COMMANDS[cmd]) return passthrough(argv);
  if (!dir) { console.error(USAGE); return 2; }
  try { return (await COMMANDS[cmd](resolve(dir), rest)) ?? 0; }
  catch (err) { console.error(`✗ ${err.message}`); return 1; }
}

export { COMMANDS };
// 用 pathToFileURL 比较：路径里有中文、空格时 import.meta.url 是百分号编码的
if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(await main(process.argv.slice(2)));
