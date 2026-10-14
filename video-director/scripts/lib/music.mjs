// 配乐：HeyGen 曲库取曲 → 节拍对位（重拍落在指定的词上）→ 人声避让
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
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

export function resolveMusic(dir, intent, hfVersion, runFn = run) {
  const audioDir = join(dir, "assets/audio");
  const own = existsSync(audioDir) ? readdirSync(audioDir).find((f) => /^bgm\.(wav|mp3|m4a)$/.test(f)) : null;
  if (own) return `assets/audio/${own}`;
  const r = runFn("npx", ["--yes", `hyperframes@${hfVersion}`, "media-use", "resolve", "--type", "bgm", "--intent", intent, "--project", "."], { cwd: dir });
  const got = r.status === 0 ? parseResolved(r.stdout) : null;
  if (!got) {
    console.warn(`⚠ 没有取到配乐，本次不加配乐：${(r.stderr || r.stdout).trim().split("\n").at(-1)}`);
    console.warn("  （HeyGen 需要：heygen CLI + `HEYGEN_NO_BROWSER=1 heygen auth login --oauth`；也可以自己放 assets/audio/bgm.mp3）");
    return null;
  }
  mkdirSync(audioDir, { recursive: true });
  copyFileSync(join(dir, got), join(audioDir, "bgm.wav"));
  return "assets/audio/bgm.wav";
}

export function alignMusic(dir, { src, drop, duration }, hfVersion, runFn = run) {
  const r = runFn("npx", ["--yes", `hyperframes@${hfVersion}`, "beats", ".", "--json"], { cwd: dir });
  if (r.status !== 0) { console.warn(`⚠ 节拍分析失败，配乐从头播放：${r.stderr.trim()}`); return 0; }
  const beats = JSON.parse(readFileSync(join(dir, "beats", `${src}.json`), "utf8")).beats;
  const trackLen = Number(runFn("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", join(dir, src)]).stdout);
  const pick = pickBeat(beats, drop, duration, trackLen);
  if (!pick) { console.warn(`⚠ 配乐 ${trackLen.toFixed(1)} 秒，找不到能让重拍落在 ${drop} 秒的节拍，配乐从头播放`); return 0; }
  console.log(`✓ 配乐重拍：节拍 ${pick.beat.time}s（强度 ${pick.beat.strength}）→ 全片 ${drop}s，data-media-start=${pick.mediaStart}`);
  return pick.mediaStart;
}

export function carve(dir, hfVersion, runFn = run) {
  if (!existsSync(join(dir, "node_modules/@hyperframes/core"))) {
    const i = runFn("npm", ["i", "-D", "--no-audit", "--no-fund", `@hyperframes/core@${hfVersion}`], { cwd: dir });
    if (i.status !== 0) throw new Error(`安装 @hyperframes/core 失败（人声避让需要）：${i.stderr}`);
  }
  const c = runFn("node", [CARVE, "--comp", "index.html", "--bed", "music", "--voice", "vo"], { cwd: dir });
  if (c.status !== 0) throw new Error(`人声避让失败：${c.stderr || c.stdout}`);
}
