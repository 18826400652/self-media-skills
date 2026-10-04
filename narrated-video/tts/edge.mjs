// 微软神经网络语音（通过 edge-tts 调用 Edge 浏览器「大声朗读」的服务）。音质好、免费、国内可直连。
// 注意：这是非官方接口，服务方随时可能变更或限制；商业化发布前建议评估，或改用官方 Azure 语音（同一批音色）。
// 常用中文音色：zh-CN-XiaoxiaoNeural（女，温和）、zh-CN-XiaoyiNeural（女，活泼）、
//              zh-CN-YunxiNeural（男，年轻）、zh-CN-YunjianNeural（男，有力）。完整列表：.venv/bin/edge-tts --list-voices
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { SKILL_DIR } from "../scripts/lib/config.mjs";

const EDGE_TTS = join(SKILL_DIR, ".venv", "bin", "edge-tts");
const ATTEMPTS = 3; // 网络偶尔会断，失败后重试

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 倍速 1.15 → edge-tts 的 "+15%" */
function rateArg(speed) {
  const pct = Math.round((Number(speed) - 1) * 100);
  return `${pct >= 0 ? "+" : ""}${pct}%`;
}

export async function synthesize({ text, voice, speed, outFile }) {
  const mp3 = `${outFile}.mp3`;
  const args = ["--voice", voice, `--rate=${rateArg(speed)}`, "--text", text, "--write-media", mp3];
  try {
    for (let attempt = 1; ; attempt++) {
      try {
        execFileSync(EDGE_TTS, args, { stdio: "ignore", timeout: 60_000 });
        break;
      } catch (err) {
        if (attempt >= ATTEMPTS) {
          throw new Error(`edge 生成失败（已重试 ${ATTEMPTS} 次）：「${text}」。检查网络，或确认已安装 edge-tts（${err.message}）`);
        }
        console.log(`     第 ${attempt} 次失败，${attempt * 2} 秒后重试`);
        await sleep(attempt * 2000);
      }
    }
    execFileSync("ffmpeg", ["-y", "-v", "error", "-i", mp3, "-ar", "24000", "-ac", "1", outFile]);
  } finally {
    rmSync(mp3, { force: true });
  }
}
