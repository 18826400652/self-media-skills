// 配音后的两步：把每帧时长写回 STORYBOARD、生成字幕分组 caption_groups.json。
// 调 faceless-explainer 的 audio.mjs / captions.mjs；nv hf-audio 和 nv hf-build 共用，
// 这样 director 做法（不跑 hf-build）也有 caption_groups.json。
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const FACELESS_SCRIPTS = join(process.env.FACELESS_DIR || join(homedir(), ".claude", "skills", "faceless-explainer"), "scripts");

const SB = ["--storyboard", "./STORYBOARD.md"];
export const SYNC_ARGS = ["sync-durations", "--audio-meta", "./audio_meta.json", ...SB];
export const CAPTION_ARGS = ["build", ...SB, "--audio-meta", "./audio_meta.json", "--hyperframes", ".", "--out", "./caption_groups.json"];

/** 返回 { built: true } 或 { skipped: "no-storyboard" | "no-faceless" } */
export function buildCaptions(dir, { fe = FACELESS_SCRIPTS, log = console.log } = {}) {
  if (!existsSync(join(dir, "STORYBOARD.md"))) return { skipped: "no-storyboard" };
  if (!existsSync(join(fe, "captions.mjs"))) {
    log(`⚠ 找不到 faceless-explainer 的脚本（${fe}），没有生成 caption_groups.json：安装 HyperFrames skills 或设置 FACELESS_DIR`);
    return { skipped: "no-faceless" };
  }
  const opts = { cwd: dir, stdio: ["ignore", "inherit", "inherit"] };
  execFileSync(process.execPath, [join(fe, "audio.mjs"), ...SYNC_ARGS], opts);
  execFileSync(process.execPath, [join(fe, "captions.mjs"), ...CAPTION_ARGS], opts);
  return { built: true };
}
