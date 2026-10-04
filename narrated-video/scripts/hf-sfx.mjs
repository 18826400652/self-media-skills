#!/usr/bin/env node
// 用法：nv hf-sfx <HyperFrames 工程目录>
//
// 给 HyperFrames 工作流放音效，代替它的 fetch-sfx（那个只能把音效放在每帧开头）。
// 读 STORYBOARD.md 每帧的 `- sfx:`，逗号分隔，每个音效可以带时间：
//   - sfx: impact-bass-1 @八秒钟, whoosh-short, ping +1.2
//     @词   = 口播说到这个词时（用 nv hf-audio 记录的逐字时间）
//     +秒数 = 这一帧开始后多少秒；都不写 = 这一帧开头
// 音效文件从项目配置 sfx.dir 或内置库（Pixabay 授权，可商用）复制到 assets/sfx/，
// 结果写进 audio_meta.json 和 audio_engine_meta.json 的 sfx 段（assemble-index 会挂到时间轴上）。
// 先跑 nv hf-audio，再跑本命令，然后 assemble-index。
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fromRoot, loadConfig } from "./lib/config.mjs";
import { findSfxFile, probe } from "./lib/sfx.mjs";
import { isMain } from "./lib/is-main.mjs";

const DEFAULT_VOLUME = 0.35; // 音效压在人声下面
const NONE = new Set(["none", "no", "-", "—", "无"]);
const CUE_RE = /^([\w.-]+)\s*(?:@\s*(\S+)|\+\s*([\d.]+))?$/;
const pad2 = (n) => String(n).padStart(2, "0");
const round3 = (x) => Math.round(x * 1000) / 1000;

/** STORYBOARD.md → [{ frame, cues: [{ name, word, offset }] }] */
export function parseStoryboardSfx(md) {
  const frames = [];
  let cur = null;
  for (const line of md.split(/\r?\n/)) {
    const h = line.match(/^#{2,3}\s+(?:Frame|Beat|Scene)\s+(\d+)/i);
    if (h) {
      cur = { frame: Number(h[1]), cues: [] };
      frames.push(cur);
      continue;
    }
    const m = cur && line.match(/^\s*-\s*sfx:\s*(.+)$/i);
    if (!m) continue;
    cur.cues = m[1]
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter((s) => s && !NONE.has(s.toLowerCase()))
      .map((s) => {
        const c = s.match(CUE_RE);
        if (!c) throw new Error(`第 ${cur.frame} 帧的音效写法不对：「${s}」（例：whoosh、ping +1.2、error @数错了）`);
        return { name: c[1], word: c[2] ?? null, offset: c[3] ? Number(c[3]) : 0 };
      });
  }
  return frames;
}

/** 这一帧口播里说到 word 的时间（相对这一帧开头） */
function wordOffset(voice, word, frame) {
  const chars = voice?.chars ?? [];
  if (!chars.length) throw new Error(`第 ${frame} 帧没有逐字时间，先运行 nv hf-audio`);
  const text = chars.map((c) => c.text).join("");
  const idx = text.indexOf(word);
  if (idx < 0) throw new Error(`第 ${frame} 帧的口播里找不到「${word}」`);
  let pos = 0;
  for (const c of chars) {
    if (pos >= idx) return c.start;
    pos += c.text.length;
  }
  return chars[chars.length - 1].start;
}

function main() {
  const dir = resolve(process.argv[2] || "");
  const metaPath = join(dir, "audio_meta.json");
  const neutralPath = join(dir, "audio_engine_meta.json");
  if (!process.argv[2] || !existsSync(metaPath)) {
    console.error("用法：nv hf-sfx <HyperFrames 工程目录>（先运行 nv hf-audio 生成 audio_meta.json）");
    process.exit(1);
  }
  const config = loadConfig(dir);
  const dirs = [fromRoot(config, config.sfx?.dir)].filter(Boolean);
  const volume = Number(config.sfx?.volume ?? DEFAULT_VOLUME);
  const meta = JSON.parse(readFileSync(metaPath, "utf8"));
  const neutral = existsSync(neutralPath) ? JSON.parse(readFileSync(neutralPath, "utf8")) : null;
  const frames = parseStoryboardSfx(readFileSync(join(dir, "STORYBOARD.md"), "utf8"));
  mkdirSync(join(dir, "assets", "sfx"), { recursive: true });

  const sfx = frames.flatMap(({ frame, cues }) =>
    cues.map((cue) => {
      const src = findSfxFile(cue.name, dirs);
      const file = `assets/sfx/${basename(src)}`;
      if (!existsSync(join(dir, file))) copyFileSync(src, join(dir, file));
      const voice = meta.voices.find((v) => v.frame === frame);
      const at = (cue.word ? wordOffset(voice, cue.word, frame) : 0) + cue.offset;
      console.log(`  ♪ 第 ${frame} 帧 +${round3(at)}s  ${cue.name}${cue.word ? ` @${cue.word}` : ""}`);
      return { frame, name: cue.name, file, offset_s: round3(at), duration_s: round3(probe(src)), volume };
    }),
  );

  meta.sfx = sfx.map(({ name, ...s }) => s);
  writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
  if (neutral) {
    neutral.sfx = sfx.map(({ frame, ...s }) => ({ id: pad2(frame), source: "bundled", ...s }));
    writeFileSync(neutralPath, `${JSON.stringify(neutral, null, 2)}\n`);
  }
  console.log(`✓ ${sfx.length} 个音效 → audio_meta.json`);
}

if (isMain(import.meta.url)) try {
  main();
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exit(1);
}
