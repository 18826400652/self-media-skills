// 逐字时间 → compositions/kit/cues.js，供画面用 Kit.cue(帧号, "词") 取「说到这个词」的时间。
// 改了口播、语速或音色后重新配音，画面里的出现时间会自动跟着变，不用手改秒数。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const round3 = (x) => Math.round(x * 1000) / 1000;

/** audio_meta.json 存在时写 cues.js，返回写入的帧数；没有配音时返回 0 */
export function writeCues(dir) {
  const metaPath = join(dir, "audio_meta.json");
  if (!existsSync(metaPath)) return 0;
  const meta = JSON.parse(readFileSync(metaPath, "utf8"));
  const cues = {};
  for (const v of meta.voices ?? []) {
    if (!v.chars?.length) continue;
    cues[v.frame] = v.chars.map((c) => [c.text, round3(c.start)]);
  }
  const outDir = join(dir, "compositions", "kit");
  mkdirSync(outDir, { recursive: true });
  const body = `// 由 nv hf-audio / nv hf-kit 根据 audio_meta.json 生成，不要手改\nwindow.KIT_CUES = ${JSON.stringify(cues)};\n`;
  writeFileSync(join(outDir, "cues.js"), body);
  return Object.keys(cues).length;
}
