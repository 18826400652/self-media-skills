#!/usr/bin/env node
// 用法：nv voice <视频目录> [--voice <音色>] [--speed <倍速>] [--provider <服务商>] [--model <模型>]
// 按 脚本.md 逐句生成配音 → 拼接成 audio/voice.wav → 写 timeline.json → 同步到 index.html。
// 已生成且文本未变的句子会复用缓存，只改一句时很快。
// 默认的服务商、音色、语速来自项目配置 narrated-video.config.json 的 tts 字段。
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { getProvider } from "../tts/index.mjs";
import { loadConfig } from "./lib/config.mjs";
import { parseScript } from "./lib/script-md.mjs";
import { syncEpisode } from "./sync.mjs";

const GAP_SECONDS = 0.35; // 句间停顿
const TAIL_SECONDS = 1.0; // 结尾留白
const SAMPLE_RATE = 24000;
const OPTION_KEYS = ["voice", "speed", "provider", "model"];

function parseArgs(argv) {
  const [dir, ...rest] = argv;
  if (!dir) {
    console.error("用法：nv voice <视频目录> [--voice <音色>] [--speed <倍速>] [--provider <服务商>] [--model <模型>]");
    process.exit(1);
  }
  const overrides = {};
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i].replace(/^--/, "");
    if (!OPTION_KEYS.includes(key) || rest[i + 1] === undefined) {
      throw new Error(`参数错误：${rest[i]}（可用：${OPTION_KEYS.map((k) => `--${k}`).join(" ")}）`);
    }
    overrides[key] = rest[i + 1];
  }
  return { dir: resolve(dir), overrides };
}

function probeDuration(file) {
  const out = execFileSync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file,
  ]);
  return Number(out.toString().trim());
}

async function synthesizeLine(line, tts, linesDir) {
  const key = `${tts.provider}|${tts.model ?? ""}|${tts.voice}|${tts.speed}|${line.text}`;
  const hash = createHash("sha1").update(key).digest("hex").slice(0, 8);
  const file = join(linesDir, `${String(line.n).padStart(2, "0")}-${hash}.wav`);
  if (existsSync(file)) {
    console.log(`  ✓  第 ${line.n} 句（缓存）`);
  } else {
    console.log(`  🎙  第 ${line.n} 句：${line.text}`);
    await getProvider(tts.provider).synthesize({ ...tts, text: line.text, outFile: file });
  }
  return { ...line, file, speechDuration: probeDuration(file) };
}

function concatWithGaps(clips, outFile) {
  const pads = clips.map((c, i) => {
    const pad = i === clips.length - 1 ? TAIL_SECONDS : GAP_SECONDS;
    return `[${i}:a]aresample=${SAMPLE_RATE},aformat=channel_layouts=mono,apad=pad_dur=${pad}[a${i}]`;
  });
  const joined = clips.map((_, i) => `[a${i}]`).join("");
  const filter = `${pads.join(";")};${joined}concat=n=${clips.length}:v=0:a=1[out]`;
  execFileSync("ffmpeg", [
    "-y", "-v", "error",
    ...clips.flatMap((c) => ["-i", c.file]),
    "-filter_complex", filter, "-map", "[out]", outFile,
  ]);
}

function buildTimeline(clips, tts) {
  const round = (x) => Math.round(x * 1000) / 1000;
  const lines = clips.reduce((acc, c) => {
    const start = acc.length ? acc[acc.length - 1].end + GAP_SECONDS : 0;
    return [...acc, {
      n: c.n, text: c.text, highlights: c.highlights,
      start: round(start), end: round(start + c.speechDuration),
    }];
  }, []);
  const duration = round(lines[lines.length - 1].end + TAIL_SECONDS);
  return { tts, duration, lines };
}

/** 读取项目根目录 .env（KEY=VALUE），已存在的环境变量不覆盖。密钥类配置放这里，不要写进配置文件 */
function loadDotEnv(root) {
  const file = join(root, ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

async function main() {
  const { dir, overrides } = parseArgs(process.argv.slice(2));
  const config = loadConfig(dir);
  loadDotEnv(config.root);
  const tts = { ...config.tts, ...overrides };
  const scriptPath = join(dir, "脚本.md");
  const linesDir = join(dir, "audio", "lines");
  mkdirSync(linesDir, { recursive: true });

  console.log(`读取 ${scriptPath}（${tts.provider} · ${tts.voice} · ${tts.speed}x）`);
  const lines = parseScript(scriptPath);
  const clips = [];
  for (const line of lines) clips.push(await synthesizeLine(line, tts, linesDir)); // 逐句串行，避免本地模型抢资源

  concatWithGaps(clips, join(dir, "audio", "voice.wav"));
  const timeline = buildTimeline(clips, tts);
  writeFileSync(join(dir, "timeline.json"), `${JSON.stringify(timeline, null, 2)}\n`);
  console.log(`配音完成：${lines.length} 句，共 ${timeline.duration} 秒`);

  syncEpisode(dir);
}

main().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
