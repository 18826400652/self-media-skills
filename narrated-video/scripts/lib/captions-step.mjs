// 配音后的两步：把每帧时长写回 STORYBOARD、生成字幕分组 caption_groups.json。
// 调 faceless-explainer 的 audio.mjs / captions.mjs；nv hf-audio 和 nv hf-build 共用，
// 这样 director 做法（不跑 hf-build）也有 caption_groups.json。
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync, utimesSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const FACELESS_SCRIPTS = join(process.env.FACELESS_DIR || join(homedir(), ".claude", "skills", "faceless-explainer"), "scripts");

const SB = ["--storyboard", "./STORYBOARD.md"];
export const SYNC_ARGS = ["sync-durations", "--audio-meta", "./audio_meta.json", ...SB];
export const CAPTION_ARGS = ["build", ...SB, "--audio-meta", "./audio_meta.json", "--hyperframes", ".", "--out", "./caption_groups.json"];

/** 跑 fn；file 的内容没变就把修改时间改回去（同步帧时长每次都重写 STORYBOARD，kv 靠修改时间判断分镜改没改） */
export function keepMtimeIfUnchanged(file, fn) {
  if (!existsSync(file)) return fn();
  const before = readFileSync(file);
  const { atime, mtime } = statSync(file);
  const out = fn();
  if (existsSync(file) && readFileSync(file).equals(before)) utimesSync(file, atime, mtime);
  return out;
}

// faceless 的字幕脚本在工程里找不到字体文件时的警告。hf-audio 时还没打包字体（hf-build 才打包），
// director 做法也不用这份字幕 HTML，这时的警告是误导
const FONT_FALLBACK = /captions: frame\.md names font .* fall back/;

/** 跑字幕脚本，stderr 里滤掉字体回退警告，其余交给 warn；失败照样抛错 */
function runQuietFonts(args, cwd, warn) {
  const r = spawnSync(process.execPath, args, { cwd, stdio: ["ignore", "inherit", "pipe"], encoding: "utf8" });
  const lines = (r.stderr ?? "").split("\n").filter((l) => l.trim() && !FONT_FALLBACK.test(l));
  lines.forEach((l) => warn(l));
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`字幕生成失败（退出码 ${r.status}）：node ${args.join(" ")}`);
}

/** 返回 { built: true } 或 { skipped: "no-storyboard" | "no-faceless" }。quietFontFallback：滤掉字体回退警告（hf-audio 用） */
export function buildCaptions(dir, { fe = FACELESS_SCRIPTS, log = console.log, quietFontFallback = false, warn = console.error } = {}) {
  if (!existsSync(join(dir, "STORYBOARD.md"))) return { skipped: "no-storyboard" };
  if (!existsSync(join(fe, "captions.mjs"))) {
    log(`⚠ 找不到 faceless-explainer 的脚本（${fe}），没有生成 caption_groups.json：安装 HyperFrames skills 或设置 FACELESS_DIR`);
    return { skipped: "no-faceless" };
  }
  const opts = { cwd: dir, stdio: ["ignore", "inherit", "inherit"] };
  keepMtimeIfUnchanged(join(dir, "STORYBOARD.md"), () => execFileSync(process.execPath, [join(fe, "audio.mjs"), ...SYNC_ARGS], opts));
  const captionArgs = [join(fe, "captions.mjs"), ...CAPTION_ARGS];
  if (quietFontFallback) runQuietFonts(captionArgs, dir, warn);
  else execFileSync(process.execPath, captionArgs, opts);
  return { built: true };
}
