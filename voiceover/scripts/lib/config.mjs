// 项目配置：从给定目录向上查找 voiceover.config.json（只有 tts 字段）。找不到时用默认值。
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const CONFIG_NAME = "voiceover.config.json";

const DEFAULT_TTS = { provider: "qwenaudio", speed: 1.0 };

function findUp(startDir) {
  for (let dir = resolve(startDir); ; dir = dirname(dir)) {
    if (existsSync(join(dir, CONFIG_NAME))) return join(dir, CONFIG_NAME);
    if (dirname(dir) === dir) return null;
  }
}

/** @returns {{ tts: object, root: string, configPath: string | null }} */
export function loadConfig(startDir = process.cwd()) {
  const configPath = findUp(startDir);
  if (!configPath) return { tts: { ...DEFAULT_TTS }, root: resolve(startDir), configPath: null };
  let user;
  try {
    user = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (err) {
    throw new Error(`${configPath} 不是合法的 JSON：${err.message}`);
  }
  return {
    tts: {
      ...DEFAULT_TTS,
      ...user.tts,
      // 参考音频（seedaudio、qwenaudio）按项目根目录解析，在哪个目录跑命令都一样
      ...(user.tts?.reference ? { reference: resolve(dirname(configPath), user.tts.reference) } : {}),
    },
    root: dirname(configPath),
    configPath,
  };
}
