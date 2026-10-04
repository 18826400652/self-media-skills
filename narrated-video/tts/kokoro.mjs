// Kokoro-82M 本地 TTS（通过 hyperframes tts 调用）。免费、离线；中文只有 zf_xiaobei 一个音色。
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { SKILL_DIR } from "../scripts/lib/config.mjs";

const HF_BIN = join(SKILL_DIR, "node_modules", ".bin", "hyperframes");
const VENV_BIN = join(SKILL_DIR, ".venv", "bin");

export async function synthesize({ text, voice, speed, outFile }) {
  try {
    execFileSync(HF_BIN, ["tts", text, "-v", voice, "-s", String(speed), "-o", outFile], {
      env: { ...process.env, PATH: `${VENV_BIN}:${process.env.PATH}` },
      stdio: ["ignore", "ignore", "inherit"],
    });
  } catch (err) {
    throw new Error(`kokoro 生成失败：「${text}」。先运行 nv doctor 检查环境（${err.message}）`);
  }
}
