// 项目配置：从给定目录向上查找 narrated-video.config.json。找不到时使用默认值。
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const CONFIG_NAME = "narrated-video.config.json";

const DEFAULTS = {
  preset: "douyin",
  tts: { provider: "kokoro", voice: "zf_xiaobei", speed: 1.0 },
  template: null, // 项目自定义模板目录；为空用 skill 自带的 templates/base
  theme: null, // 项目品牌主题 CSS；为空用模板自带的 theme.css
  episodes: null, // { root, dirPattern, videoSubdir, scaffold: [{ from, to }] }
};

function findUp(startDir) {
  let dir = resolve(startDir);
  for (;;) {
    const candidate = join(dir, CONFIG_NAME);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** @returns {typeof DEFAULTS & { root: string, configPath: string | null }} */
export function loadConfig(startDir = process.cwd()) {
  const configPath = findUp(startDir);
  if (!configPath) return { ...DEFAULTS, root: resolve(startDir), configPath: null };

  let user;
  try {
    user = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (err) {
    throw new Error(`${configPath} 不是合法的 JSON：${err.message}`);
  }
  return {
    ...DEFAULTS,
    ...user,
    tts: {
      // 默认音色是 kokoro 的；换了服务商只继承倍速，免得把 zf_xiaobei 带给别家
      ...(!user.tts?.provider || user.tts.provider === DEFAULTS.tts.provider ? DEFAULTS.tts : { speed: DEFAULTS.tts.speed }),
      ...user.tts,
      // 参考音频（seedaudio、qwenaudio）按项目根目录解析，在哪个目录跑命令都一样
      ...(user.tts?.reference ? { reference: resolve(dirname(configPath), user.tts.reference) } : {}),
    },
    root: dirname(configPath),
    configPath,
  };
}

/** 项目内相对路径 → 绝对路径 */
export const fromRoot = (config, p) => (p ? resolve(config.root, p) : null);

export function loadPreset(name) {
  const file = join(SKILL_DIR, "presets", `${name}.json`);
  if (!existsSync(file)) throw new Error(`未知的平台预设：${name}（见 ${join(SKILL_DIR, "presets")}）`);
  return JSON.parse(readFileSync(file, "utf8"));
}

const LOOKS = ["glow", "flat"];

/** 帧的视觉风格：hfKit.look，不填是 flat（纯色底，旧样式） */
export function resolveLook(config) {
  const look = config.hfKit?.look ?? "flat";
  if (!LOOKS.includes(look)) throw new Error(`hfKit.look 只能是 "glow" 或 "flat"，收到 ${JSON.stringify(look)}`);
  return look;
}
