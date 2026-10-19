// ebur128 的统计写在 stderr；只取 Summary 里的整合响度和真峰值。
import { spawnSync } from "node:child_process";

export function ffmpegLoudnessArgs(file) {
  return ["-hide_banner", "-nostats", "-i", file, "-vn", "-af", "ebur128=peak=true", "-f", "null", "-"];
}

/** ebur128 每帧都会打一行 I:，只取最后一段 Summary 的值；读不到返回 null */
export function parseEbur128(log) {
  const s = String(log ?? "");
  const i = [...s.matchAll(/I:\s*(-?[\d.]+) LUFS/g)].at(-1);
  const p = [...s.matchAll(/Peak:\s*(-?[\d.]+) dBFS/g)].at(-1);
  if (!i || !p) return null;
  const integrated = Number(i[1]), truePeak = Number(p[1]);
  return Number.isFinite(integrated) && Number.isFinite(truePeak) ? { integrated, truePeak } : null;
}

export function probeLoudness(file, run = spawnSync) {
  const r = run("ffmpeg", ffmpegLoudnessArgs(file), { encoding: "utf8" });
  if (r.status !== 0) return null;
  return parseEbur128(r.stderr);
}
