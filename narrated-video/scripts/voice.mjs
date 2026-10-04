#!/usr/bin/env node
// 用法：nv voice <视频目录> [--voice <音色>] [--speed <倍速>] [--provider <服务商>] [--model <模型>] [--gap <秒>]
// 按 脚本.md 逐句生成配音 → 切掉首尾静音、按 gap 拼接成 audio/voice.wav → 写 timeline.json → 同步到 index.html。
// 已生成且文本未变的句子会复用缓存，只改一句时很快。
// 默认的服务商、音色、语速来自项目配置 narrated-video.config.json 的 tts 字段。
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadConfig } from "./lib/config.mjs";
import { parseScript } from "./lib/script-md.mjs";
import { loadDotEnv, synthesizeClean } from "./lib/speech.mjs";
import { syncEpisode } from "./sync.mjs";

const DEFAULT_GAP = 0.15; // 句间停顿（配置 tts.gap 可改）；短视频要紧凑，TTS 自带的首尾静音会先切掉
const TAIL_SECONDS = 0.8; // 结尾留白
const SAMPLE_RATE = 24000;
const OPTION_KEYS = ["voice", "speed", "provider", "model", "gap"];

function parseArgs(argv) {
  const [dir, ...rest] = argv;
  if (!dir) {
    console.error("用法：nv voice <视频目录> [--voice <音色>] [--speed <倍速>] [--provider <服务商>] [--model <模型>] [--gap <秒>]");
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

async function synthesizeLine(line, tts, linesDir) {
  const clip = await synthesizeClean(line, tts, linesDir, String(line.n).padStart(2, "0"));
  return { ...line, ...clip };
}

function concatWithGaps(clips, gap, outFile) {
  const pads = clips.map((c, i) => {
    const pad = i === clips.length - 1 ? TAIL_SECONDS : gap;
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

function buildTimeline(clips, tts, gap) {
  const round = (x) => Math.round(x * 1000) / 1000;
  const lines = clips.reduce((acc, c) => {
    const start = acc.length ? acc[acc.length - 1].end + gap : 0;
    return [...acc, {
      n: c.n, text: c.text, highlights: c.highlights, emotion: c.emotion, sfx: c.sfx,
      start: round(start), end: round(start + c.speechDuration),
      // 逐字时间（整条配音的绝对时间）；TTS 不提供时为空，关键词时间退回按字数估算
      words: c.words.map((w) => ({ text: w.text, start: round(start + w.start), end: round(start + w.end) })),
    }];
  }, []);
  const duration = round(lines[lines.length - 1].end + TAIL_SECONDS);
  return { tts, duration, lines };
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
  for (const line of lines) {
    // 脚本里写了情感就覆盖默认情感；逐句串行，避免本地模型抢资源
    const lineTts = line.emotion ? { ...tts, emotion: line.emotion } : tts;
    clips.push(await synthesizeLine(line, lineTts, linesDir));
  }

  const gap = Number(tts.gap ?? DEFAULT_GAP);
  concatWithGaps(clips, gap, join(dir, "audio", "voice.wav"));
  const timeline = buildTimeline(clips, tts, gap);
  writeFileSync(join(dir, "timeline.json"), `${JSON.stringify(timeline, null, 2)}\n`);
  console.log(`配音完成：${lines.length} 句，共 ${timeline.duration} 秒`);

  syncEpisode(dir);
}

main().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
