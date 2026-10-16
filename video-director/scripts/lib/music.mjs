// 配乐：HeyGen 曲库取曲 → 节拍对位（重拍落在指定的词上）→ 人声避让
import { hfBin } from "./hyperframes.mjs";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { run } from "./run.mjs";

const CARVE = join(homedir(), ".claude/skills/hyperframes-audio/scripts/carve.mjs");

export function pickBeat(beats, drop, renderLen, trackLen) {
  const cand = beats.filter((b) => b.time >= drop && b.time - drop + renderLen <= trackLen);
  if (!cand.length) return null;
  const best = cand.reduce((a, b) => (b.strength > a.strength ? b : a));
  return { beat: best, mediaStart: Math.round((best.time - drop) * 1000) / 1000 };
}

export function parseResolved(stdout) {
  return stdout.match(/→\s*(\S+)/)?.[1] ?? null;
}

/** 音频时长（秒）；读不到当 0 */
export const probeLen = (p) => Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p]).stdout) || 0;

/** 循环补到 duration 秒，写成 out（相对工程）；失败抛错 */
function loopTo(dir, src, out, duration, runFn) {
  const tmp = join(dir, "assets/audio/.loop-tmp.wav");
  const r = runFn("ffmpeg", ["-y", "-v", "error", "-stream_loop", "-1", "-i", join(dir, src), "-t", String(Math.ceil(duration)), tmp], { cwd: dir });
  if (r.status !== 0) throw new Error(`配乐循环补齐失败：${(r.stderr || "").trim()}`);
  if (existsSync(tmp)) renameSync(tmp, join(dir, out));
  return out;
}

/**
 * 取配乐，保证不比视频短：
 * - 用户自己放的 assets/audio/bgm.mp3|m4a 不替换；vd 以前取的 bgm.wav 比视频短就重新取
 * - 取曲时说法里带上视频时长（曲库生成会参考）；取到的还是短就循环补齐并提醒
 * opts：duration 视频秒数（不给就不查长短）；probe(绝对路径) → 秒；warn
 */
export function resolveMusic(dir, intent, runFn = run, { duration = 0, probe = probeLen, warn = console.warn } = {}) {
  const audioDir = join(dir, "assets/audio");
  const short = (rel) => duration > 0 && probe(join(dir, rel)) < duration;
  const own = existsSync(audioDir) ? readdirSync(audioDir).find((f) => /^bgm\.(wav|mp3|m4a)$/.test(f)) : null;
  if (own && own !== "bgm.wav") {
    const src = `assets/audio/${own}`;
    if (!short(src)) return src;
    warn(`⚠ 自己放的配乐 ${own} 比视频（${Math.ceil(duration)} 秒）短，循环补齐成 assets/audio/bgm-loop.wav`);
    return loopTo(dir, src, "assets/audio/bgm-loop.wav", duration, runFn);
  }
  if (own && !short("assets/audio/bgm.wav")) return "assets/audio/bgm.wav";
  const ask = duration > 0 ? `${intent}, around ${Math.ceil(duration)} seconds` : intent;
  const r = runFn(hfBin(), ["media-use", "resolve", "--type", "bgm", "--intent", ask, "--project", "."], { cwd: dir });
  const got = r.status === 0 ? parseResolved(r.stdout) : null;
  if (!got) {
    warn(`⚠ 没有取到配乐，本次不加配乐：${(r.stderr || r.stdout).trim().split("\n").at(-1)}`);
    warn("  （HeyGen 需要：heygen CLI + `HEYGEN_NO_BROWSER=1 heygen auth login --oauth`；也可以自己放 assets/audio/bgm.mp3）");
    return null;
  }
  mkdirSync(audioDir, { recursive: true });
  copyFileSync(join(dir, got), join(audioDir, "bgm.wav"));
  if (!short("assets/audio/bgm.wav")) return "assets/audio/bgm.wav";
  warn(`⚠ 取到的配乐只有 ${Math.round(probe(join(dir, "assets/audio/bgm.wav")))} 秒，比视频（${Math.ceil(duration)} 秒）短，循环补齐`);
  return loopTo(dir, "assets/audio/bgm.wav", "assets/audio/bgm.wav", duration, runFn);
}

export function alignMusic(dir, { src, drop, duration }, runFn = run) {
  const r = runFn(hfBin(), ["beats", ".", "--json"], { cwd: dir });
  if (r.status !== 0) { console.warn(`⚠ 节拍分析失败，配乐从头播放：${r.stderr.trim()}`); return 0; }
  let beats;
  try {
    beats = JSON.parse(readFileSync(join(dir, "beats", `${src}.json`), "utf8")).beats;
    if (!Array.isArray(beats)) throw new Error("节拍文件里没有 beats 数组");
  } catch (err) {
    console.warn(`⚠ 读不到节拍结果，配乐从头播放：${err.message}`);
    return 0;
  }
  const trackLen = Number(runFn("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", join(dir, src)]).stdout);
  const pick = pickBeat(beats, drop, duration, trackLen);
  if (!pick) { console.warn(`⚠ 配乐 ${trackLen.toFixed(1)} 秒，找不到能让重拍落在 ${drop} 秒的节拍，配乐从头播放`); return 0; }
  console.log(`✓ 配乐重拍：节拍 ${pick.beat.time}s（强度 ${pick.beat.strength}）→ 全片 ${drop}s，data-media-start=${pick.mediaStart}`);
  return pick.mediaStart;
}

/** 工程里没有 @hyperframes/core 就装上（人声避让、vd qa 打包都要用） */
export function ensureCore(dir, hfVersion, runFn = run) {
  if (existsSync(join(dir, "node_modules/@hyperframes/core"))) return;
  const i = runFn("npm", ["i", "-D", "--no-audit", "--no-fund", `@hyperframes/core@${hfVersion}`], { cwd: dir });
  if (i.status !== 0) throw new Error(`安装 @hyperframes/core 失败：${i.stderr}`);
}

export function carve(dir, hfVersion, runFn = run) {
  ensureCore(dir, hfVersion, runFn);
  const c = runFn("node", [CARVE, "--comp", "index.html", "--bed", "music", "--voice", "vo"], { cwd: dir });
  if (c.status !== 0) throw new Error(`人声避让失败：${c.stderr || c.stdout}`);
}

/**
 * 配乐整步：取曲 → 带配乐总装 → 对位 → 再总装 → 人声避让。任何一步失败都去掉配乐、警告、继续出片。
 * deps：resolveMusic() → src|null；alignMusic(src) → mediaStart；carve()；assemble(music|null)
 * 返回最终用上的配乐，或 null
 */
export function addMusic({ volume }, deps, warn = console.warn) {
  const src = deps.resolveMusic();
  if (!src) return null;
  const music = { src, mediaStart: 0, volume: volume ?? 0.4 };
  try {
    deps.assemble(music);
    music.mediaStart = deps.alignMusic(src);
    deps.assemble(music);
    deps.carve();
    return music;
  } catch (err) {
    warn(`⚠ 配乐处理失败，本次不加配乐：${err.message}`);
    deps.assemble(null);
    return null;
  }
}
