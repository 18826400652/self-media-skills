// 配音（vo 的每句 wav）首尾拼接 + 音效 → assets/audio/vo.wav
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "./run.mjs";

export const voiceListFile = (paths) => paths.map((p) => `file '${p.replaceAll("'", "'\\''")}'\n`).join("");

const cueKey = (at) => at.replace(/^@/, "");

export function resolveSfx(list, cues, sfxDir, exists = existsSync) {
  return list.map((s) => {
    const file = join(sfxDir, `${s.name}.mp3`);
    if (!exists(file)) throw new Error(`音效 ${s.name} 不存在：${file}（可用的见 ${sfxDir}）`);
    const at = cues[cueKey(s.at)];
    if (at === undefined) throw new Error(`sfx 的 ${s.at} 没有算出时间（先确认这个词在口播里）`);
    return { file, at, volume: s.volume ?? 1 };
  });
}

export function mixArgs({ voice, sfx, duration, out }) {
  const inputs = ["-i", voice, ...sfx.flatMap((s) => ["-i", s.file])];
  let chains = "", labels = "[0:a]";
  sfx.forEach((s, i) => {
    const n = i + 1, ms = Math.round(s.at * 1000);
    chains += `[${n}:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=${s.volume},adelay=${ms}|${ms}[s${n}];`;
    labels += `[s${n}]`;
  });
  const fc = `${chains}${labels}amix=inputs=${sfx.length + 1}:normalize=0,atrim=0:${duration},apad=whole_dur=${duration},alimiter=limit=0.95[out]`;
  return ["-v", "error", "-y", ...inputs, "-filter_complex", fc, "-map", "[out]", "-ar", "44100", out];
}

export function buildAudio(dir, { vd, cues, lines, total }, config) {
  const voices = lines.map((l) => join(dir, "assets/voice", `${String(l.line).padStart(2, "0")}.wav`));
  const missing = voices.filter((p) => !existsSync(p));
  if (missing.length) throw new Error(`缺少配音文件：${missing.join("、")}（先跑 vo <工程>）`);
  const tmp = mkdtempSync(join(tmpdir(), "vd-audio-"));
  try {
    writeFileSync(join(tmp, "list.txt"), voiceListFile(voices));
    const cat = run("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", join(tmp, "list.txt"), "-ar", "44100", "-ac", "2", join(tmp, "vo.wav")]);
    if (cat.status !== 0) throw new Error(`拼接配音失败：${cat.stderr}`);
    mkdirSync(join(dir, "assets/audio"), { recursive: true });
    const duration = Math.round((total + vd.ending.hold) * 1000) / 1000;
    const sfx = resolveSfx(vd.sfx ?? [], cues, config.sfxDir);
    const mix = run("ffmpeg", mixArgs({ voice: join(tmp, "vo.wav"), sfx, duration, out: join(dir, "assets/audio/vo.wav") }));
    if (mix.status !== 0) throw new Error(`混音失败：${mix.stderr}`);
    return { out: "assets/audio/vo.wav", duration };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
