// 阿里云百炼 CosyVoice 语音合成（官方付费接口，中文口语自然，支持声音复刻）。
// 配置（tts 字段）：
//   provider = "cosyvoice"
//   voice    = 音色 ID（系统音色或复刻得到的 ID）
//   model    = 模型（默认 cosyvoice-v3-flash；复刻音色要与复刻时的模型一致）
//   scene    = 场景（可选，仅支持指令的音色，如 longanyang 的「闲聊互动」、longanhuan 的「闲聊对话」）
//   emotion  = 默认情感（可选）；脚本「情感」列可逐句覆盖。可写中文：平静 开心 惊讶 难过 生气 害怕 厌恶
//   instruction = 完整的语气指令（可选，写了就不再用 scene / emotion 拼接）
//   pronounce = 读音表（可选），如 { "AI": "<say-as interpret-as=\"characters\">AI</say-as>" }，见 scripts/lib/pronounce.mjs
// 每句同时输出逐字时间戳 <音频名>.words.json（单位秒）。
// 音色支持哪些场景，以官方音色列表为准：https://help.aliyun.com/zh/model-studio/cosyvoice-voice-list
// 密钥：环境变量 DASHSCOPE_API_KEY，可写在项目根目录 .env（.env 不入 git）。
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { SKILL_DIR } from "../scripts/lib/config.mjs";

const PYTHON = join(SKILL_DIR, ".venv", "bin", "python");
const SCRIPT = join(SKILL_DIR, "tts", "cosyvoice_synth.py");
const DEFAULT_MODEL = "cosyvoice-v3-flash";

/** 每句同时输出逐字时间戳 */
export const wordTimestamps = true;

/** 支持 SSML（cosyvoice-v2 / v3 系列 + 标了支持 SSML 的音色，如 longanyang）：读音表 tts.pronounce 会生效 */
export const ssml = true;

export const EMOTIONS = {
  平静: "neutral",
  开心: "happy",
  惊讶: "surprised",
  难过: "sad",
  生气: "angry",
  害怕: "fearful",
  厌恶: "disgusted",
};
const EMOTION_VALUES = new Set(Object.values(EMOTIONS));

/** 中文或英文情感名 → 官方取值；空值返回 null；写错直接报错，避免悄悄退回默认语气 */
export function normalizeEmotion(value) {
  if (!value) return null;
  const v = String(value).trim();
  const mapped = EMOTIONS[v] ?? v.toLowerCase();
  if (!EMOTION_VALUES.has(mapped)) {
    throw new Error(`未知的情感「${value}」，可选：${Object.keys(EMOTIONS).join(" ")}（或对应英文）`);
  }
  return mapped;
}

/** 按官方模板拼语气指令（标点必须与模板一致） */
export function buildInstruction({ instruction, scene, emotion }) {
  if (instruction) return instruction;
  const e = normalizeEmotion(emotion);
  if (scene) return `你正在进行${scene}，你说话的情感是${e ?? "neutral"}。`;
  return e ? `你说话的情感是${e}。` : "";
}

export async function synthesize(opts) {
  const { text, voice, speed, outFile, model } = opts;
  if (!process.env.DASHSCOPE_API_KEY) {
    throw new Error("cosyvoice 需要 DASHSCOPE_API_KEY：在百炼控制台创建 API Key，写进项目根目录 .env");
  }
  const instruction = buildInstruction(opts);
  try {
    // 逐字时间戳写在音频旁边：xx.wav → xx.words.json（speech.mjs 用它精确切静音、对齐关键词）
    const wordsFile = outFile.replace(/\.wav$/, ".words.json");
    execFileSync(PYTHON, [SCRIPT, model || DEFAULT_MODEL, voice, String(speed), outFile, instruction, wordsFile], {
      input: text,
      stdio: ["pipe", "ignore", "pipe"],
      timeout: 120_000,
    });
  } catch (err) {
    const detail = err.stderr ? err.stderr.toString().trim().split("\n").pop() : err.message;
    const hint = instruction ? `（语气指令：${instruction}。该音色可能不支持此场景，见官方音色列表）` : "";
    throw new Error(`cosyvoice 生成失败：「${text}」：${detail}${hint}`);
  }
}
