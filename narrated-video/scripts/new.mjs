#!/usr/bin/env node
// 用法：
//   nv new <名称> [--date YYYY-MM-DD] [--preset douyin]   按项目配置的 episodes 规则新建一期
//   nv new --dir <目录> [--preset douyin]                 在任意目录新建视频工程
//
// 视频工程 = skill 基础模板 → 叠加项目模板（config.template）→ 替换主题（config.theme）
//          → 按平台预设生成 preset.css → 填充占位符。
// 项目还可以用 episodes.scaffold 在作品目录里额外生成文件（如 母稿.md）。
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { SKILL_DIR, fromRoot, loadConfig, loadPreset } from "./lib/config.mjs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FILLED_FILES = ["index.html", "脚本.md"];

function localDate() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseArgs(argv) {
  const opts = { name: null, dir: null, date: localDate(), preset: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dir") opts.dir = argv[++i];
    else if (a === "--date") opts.date = argv[++i];
    else if (a === "--preset") opts.preset = argv[++i];
    else if (!a.startsWith("--") && !opts.name) opts.name = a;
    else throw new Error(`未知参数：${a}`);
  }
  if (!opts.name && !opts.dir) throw new Error("用法：nv new <名称> [--date YYYY-MM-DD] 或 nv new --dir <目录>");
  if (!DATE_RE.test(opts.date)) throw new Error(`日期格式应为 YYYY-MM-DD：${opts.date}`);
  return opts;
}

function presetCss(preset, name) {
  const { width, height, safe, captionBottom, sizes } = preset;
  return `/* 平台预设：${name}（${preset.label}）。由 nv new 生成，换平台请重新生成，不要手改。
   ${preset.notes ?? ""} */
:root {
  --canvas-w: ${width}px;
  --canvas-h: ${height}px;
  --safe-top: ${safe.top}px;
  --safe-bottom: ${safe.bottom}px;
  --safe-left: ${safe.left}px;
  --safe-right: ${safe.right}px;
  --caption-bottom: ${captionBottom}px;
  --text-hero: ${sizes.hero}px;
  --text-point: ${sizes.point}px;
  --text-caption: ${sizes.caption}px;
  --text-note: ${sizes.note}px;
}
`;
}

function fill(text, vars) {
  return Object.entries(vars).reduce((out, [k, v]) => out.replaceAll(`{{${k}}}`, String(v)), text);
}

/** 决定作品目录和视频目录 */
function resolveTargets(opts, config) {
  if (opts.dir) {
    const videoDir = resolve(opts.dir);
    return { episodeDir: videoDir, videoDir, title: opts.name ?? videoDir.split("/").pop() };
  }
  const ep = config.episodes;
  if (!ep?.root) {
    throw new Error(`项目配置里没有 episodes.root，请改用 nv new --dir <目录>（配置：${config.configPath ?? "未找到"}）`);
  }
  const folder = fill(ep.dirPattern ?? "{{DATE}}-{{NAME}}", { DATE: opts.date, NAME: opts.name });
  const episodeDir = join(fromRoot(config, ep.root), folder);
  const videoDir = ep.videoSubdir ? join(episodeDir, ep.videoSubdir) : episodeDir;
  return { episodeDir, videoDir, title: opts.name };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const config = loadConfig(opts.dir ? dirname(resolve(opts.dir)) : process.cwd());
  const presetName = opts.preset ?? config.preset;
  const preset = loadPreset(presetName);
  const { episodeDir, videoDir, title } = resolveTargets(opts, config);

  if (existsSync(join(videoDir, "index.html"))) throw new Error(`已存在视频工程：${videoDir}`);
  mkdirSync(videoDir, { recursive: true });

  cpSync(join(SKILL_DIR, "templates", "base"), videoDir, { recursive: true });
  const projectTemplate = fromRoot(config, config.template);
  if (projectTemplate) cpSync(projectTemplate, videoDir, { recursive: true });
  const theme = fromRoot(config, config.theme);
  if (theme) cpSync(theme, join(videoDir, "theme.css"));
  writeFileSync(join(videoDir, "preset.css"), presetCss(preset, presetName));

  const vars = { WIDTH: preset.width, HEIGHT: preset.height, TITLE: title, 标题: title, DATE: opts.date };
  for (const f of FILLED_FILES) {
    const p = join(videoDir, f);
    if (existsSync(p)) writeFileSync(p, fill(readFileSync(p, "utf8"), vars));
  }

  for (const { from, to } of config.episodes?.scaffold ?? []) {
    const src = fromRoot(config, from);
    if (!existsSync(src)) throw new Error(`scaffold 源文件不存在：${src}`);
    const dest = join(episodeDir, to);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, fill(readFileSync(src, "utf8"), vars));
  }

  console.log(`已创建：${episodeDir}`);
  console.log(`视频工程：${videoDir}（${presetName} ${preset.width}×${preset.height}）`);
  console.log(`下一步：写好 脚本.md 后运行 nv voice "${videoDir}"`);
}

try {
  main();
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exit(1);
}
