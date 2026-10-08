// TTS 适配器注册表。新增服务商：写一个 tts/<名字>.mjs，导出 synthesize()，再在这里登记。
//
// 适配器约定：
//   export async function synthesize({ text, voice, speed, outFile, model }) → 在 outFile 写出 WAV
//   （model 等其余字段来自配置 tts，适配器按需使用）
//   - 失败时抛出带服务商名字的错误
//   - 密钥从环境变量读取，不要写进配置文件
//   - 能给逐字时间戳的适配器导出 wordTimestamps = true，并把时间戳写到 <outFile 去掉 .wav>.words.json
//   - 能读 SSML 的适配器导出 ssml = true，读音表 tts.pronounce 才会生效（scripts/lib/pronounce.mjs）
import * as cosyvoice from "./cosyvoice.mjs";
import * as edge from "./edge.mjs";
import * as kokoro from "./kokoro.mjs";

const PROVIDERS = { cosyvoice, edge, kokoro };

export function getProvider(name) {
  const provider = PROVIDERS[name];
  if (!provider) {
    throw new Error(`未知的 TTS 服务商：${name}（可选：${Object.keys(PROVIDERS).join("、")}）`);
  }
  return provider;
}
