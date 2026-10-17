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

/** 向上找 studio.json（作品项目的标志）；没有返回 null */
function findStudioJson(startDir) {
  for (let dir = resolve(startDir); ; dir = dirname(dir)) {
    if (existsSync(join(dir, "studio.json"))) return join(dir, "studio.json");
    if (dirname(dir) === dir) return null;
  }
}

/** 骨架里的括号说明「（…）」：还没改成真内容 */
const PLACEHOLDER_RE = /^（.*）$/;

/**
 * 配置能不能用。tts.style 还是骨架占位 = 拒绝（会拿占位文字去付费生成）。
 * 没找到 voiceover.config.json 时怎么办：在作品项目里 = 还没迁移配置，拒绝（不能悄悄换成默认音色）；
 * 不在作品项目里 = 单独用，提醒一句用的是默认值。
 * @returns {{ refuse: string | null, warn: string | null }}
 */
export function configGate(config, startDir) {
  if (config.configPath) {
    const style = config.tts?.style;
    if (typeof style === "string" && PLACEHOLDER_RE.test(style.trim())) {
      return { refuse: `${config.configPath} 的 tts.style 还是模板占位：${style}。先写配音人设（嗓音、说话场合），不然会拿这段占位文字去付费生成`, warn: null };
    }
    return { refuse: null, warn: null };
  }
  const studio = findStudioJson(startDir);
  if (studio) {
    return { refuse: `这是作品项目（找到 ${studio}），但没有 ${CONFIG_NAME}：把旧配音配置里的 tts 搬过来（见 voiceover/README.md）`, warn: null };
  }
  return { refuse: null, warn: `⚠ 没找到 ${CONFIG_NAME}，用默认配音设置（${DEFAULT_TTS.provider}，${DEFAULT_TTS.speed}x）` };
}
