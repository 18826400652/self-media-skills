// 配乐：HeyGen 曲库取曲 → 节拍对位（重拍落在指定的词上）→ 人声避让
import { requireHf } from "./hyperframes.mjs";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { run } from "./run.mjs";

/** 配乐是锦上添花：hyperframes 没装时只警告（带安装办法），不挡出片 */
function hfOrWarn(requireBin, warn, fallback) {
  try {
    return requireBin();
  } catch (err) {
    warn(`⚠ ${err.message}，${fallback}`);
    return null;
  }
}

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

const SEAM = 2; // 循环接缝处淡入淡出的秒数：硬接一遍从头开始，听得出重复

/** 把 len 秒的配乐循环铺满 duration 秒的 ffmpeg 参数：接缝处交叉淡化；太短的直接循环 */
export function loopArgs(src, out, len, duration, fade = SEAM) {
  const total = String(Math.ceil(duration));
  if (!(len > 2 * fade)) return ["-y", "-v", "error", "-stream_loop", "-1", "-i", src, "-t", total, out];
  const n = Math.max(2, Math.ceil((duration - fade) / (len - fade)));
  const inputs = Array.from({ length: n }, () => ["-i", src]).flat();
  const chain = Array.from({ length: n - 1 }, (_, i) => `${i ? `[a${i}]` : "[0:a]"}[${i + 1}:a]acrossfade=d=${fade}:c1=tri:c2=tri[a${i + 1}]`).join(";");
  return ["-y", "-v", "error", ...inputs, "-filter_complex", chain, "-map", `[a${n - 1}]`, "-t", total, out];
}

/** 循环补到 duration 秒，写成 out（相对工程）；失败抛错 */
function loopTo(dir, src, out, duration, runFn, len) {
  const tmp = join(dir, "assets/audio/.loop-tmp.wav");
  const r = runFn("ffmpeg", loopArgs(join(dir, src), tmp, len, duration), { cwd: dir });
  if (r.status !== 0) throw new Error(`配乐循环补齐失败：${(r.stderr || "").trim()}`);
  if (existsSync(tmp)) renameSync(tmp, join(dir, out));
  return out;
}

const LOOP_HINT = "接缝处淡入淡出；不想听出重复，自己放一首够长的 assets/audio/bgm.mp3（vd 不会替换）";

/**
 * 取配乐，保证不比视频短：
 * - 用户自己放的 assets/audio/bgm.mp3|m4a 不替换；vd 以前取的 bgm.wav 比视频短就重新取
 * - 取曲时说法里带上视频时长（曲库生成会参考）；取到的还是短就循环补齐并提醒
 * opts：duration 视频秒数（不给就不查长短）；probe(绝对路径) → 秒；warn
 */
export function resolveMusic(dir, intent, runFn = run, { duration = 0, probe = probeLen, warn = console.warn, requireBin = requireHf } = {}) {
  const audioDir = join(dir, "assets/audio");
  const short = (rel) => duration > 0 && probe(join(dir, rel)) < duration;
  const own = existsSync(audioDir) ? readdirSync(audioDir).find((f) => /^bgm\.(wav|mp3|m4a)$/.test(f)) : null;
  if (own && own !== "bgm.wav") {
    const src = `assets/audio/${own}`;
    if (!short(src)) return src;
    warn(`⚠ 自己放的配乐 ${own} 比视频（${Math.ceil(duration)} 秒）短，循环补齐成 assets/audio/bgm-loop.wav（接缝处淡入淡出）`);
    return loopTo(dir, src, "assets/audio/bgm-loop.wav", duration, runFn, probe(join(dir, src)));
  }
  if (own && !short("assets/audio/bgm.wav")) return "assets/audio/bgm.wav";
  const ask = duration > 0 ? `${intent}, around ${Math.ceil(duration)} seconds` : intent;
  const bin = hfOrWarn(requireBin, warn, "本次不加配乐");
  if (!bin) return null;
  const r = runFn(bin, ["media-use", "resolve", "--type", "bgm", "--intent", ask, "--project", "."], { cwd: dir });
  const got = r.status === 0 ? parseResolved(r.stdout) : null;
  if (!got) {
    warn(`⚠ 没有取到配乐，本次不加配乐：${(r.stderr || r.stdout).trim().split("\n").at(-1)}`);
    warn("  （HeyGen 需要：heygen CLI + `HEYGEN_NO_BROWSER=1 heygen auth login --oauth`；也可以自己放 assets/audio/bgm.mp3）");
    return null;
  }
  mkdirSync(audioDir, { recursive: true });
  copyFileSync(join(dir, got), join(audioDir, "bgm.wav"));
  if (!short("assets/audio/bgm.wav")) return "assets/audio/bgm.wav";
  const len = probe(join(dir, "assets/audio/bgm.wav"));
  warn(`⚠ 取到的配乐只有 ${Math.round(len)} 秒，比视频（${Math.ceil(duration)} 秒）短，循环补齐：${LOOP_HINT}`);
  return loopTo(dir, "assets/audio/bgm.wav", "assets/audio/bgm.wav", duration, runFn, len);
}

export function alignMusic(dir, { src, drop, duration }, runFn = run, { warn = console.warn, requireBin = requireHf } = {}) {
  const bin = hfOrWarn(requireBin, warn, "配乐从头播放");
  if (!bin) return 0;
  const r = runFn(bin, ["beats", ".", "--json"], { cwd: dir });
  if (r.status !== 0) { warn(`⚠ 节拍分析失败，配乐从头播放：${r.stderr.trim()}`); return 0; }
  let beats;
  try {
    beats = JSON.parse(readFileSync(join(dir, "beats", `${src}.json`), "utf8")).beats;
    if (!Array.isArray(beats)) throw new Error("节拍文件里没有 beats 数组");
  } catch (err) {
    warn(`⚠ 读不到节拍结果，配乐从头播放：${err.message}`);
    return 0;
  }
  const trackLen = Number(runFn("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", join(dir, src)]).stdout);
  const pick = pickBeat(beats, drop, duration, trackLen);
  if (!pick) { warn(`⚠ 配乐 ${trackLen.toFixed(1)} 秒，找不到能让重拍落在 ${drop} 秒的节拍，配乐从头播放`); return 0; }
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
