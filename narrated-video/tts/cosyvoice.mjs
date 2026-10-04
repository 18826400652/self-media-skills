// 阿里云百炼 CosyVoice 语音合成（官方付费接口，中文口语自然，支持声音复刻）。
// 配置：tts.provider = "cosyvoice"，tts.voice = 音色 ID（系统音色或复刻得到的 ID），
//      tts.model = 模型（默认 cosyvoice-v3-flash；复刻音色要与复刻时的模型一致）。
// 密钥：环境变量 DASHSCOPE_API_KEY，可写在项目根目录 .env（nv voice 会自动读取，.env 不入 git）。
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { SKILL_DIR } from "../scripts/lib/config.mjs";

const PYTHON = join(SKILL_DIR, ".venv", "bin", "python");
const SCRIPT = join(SKILL_DIR, "tts", "cosyvoice_synth.py");
const DEFAULT_MODEL = "cosyvoice-v3-flash";

export async function synthesize({ text, voice, speed, outFile, model }) {
  if (!process.env.DASHSCOPE_API_KEY) {
    throw new Error("cosyvoice 需要 DASHSCOPE_API_KEY：在百炼控制台创建 API Key，写进项目根目录 .env");
  }
  try {
    execFileSync(PYTHON, [SCRIPT, model || DEFAULT_MODEL, voice, String(speed), outFile], {
      input: text,
      stdio: ["pipe", "ignore", "pipe"],
      timeout: 120_000,
    });
  } catch (err) {
    const detail = err.stderr ? err.stderr.toString().trim().split("\n").pop() : err.message;
    throw new Error(`cosyvoice 生成失败：「${text}」：${detail}`);
  }
}
