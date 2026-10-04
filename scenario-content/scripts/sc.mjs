#!/usr/bin/env node
// 用法：sc check <作品目录>
// 检查一期内容：场景卡、实测记录、母稿结构、占位符、AI 腔用语、各平台长度。有 ✗ 时退出码为 1。
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const CONFIG_NAME = "scenario-content.config.json";
const DEFAULTS = {
  voiceGuide: null,
  bannedPhrases: [],
  requiredSections: ["场景", "痛点", "实测", "解法", "可复制"],
  platformFiles: {},
};
const BANNED = [
  "在这个快速发展的时代", "随着AI技术的", "随着 AI 技术的", "飞速发展", "赋能", "助力", "全方位",
  "深度解析", "干货满满", "硬核", "总而言之", "综上所述", "让我们一起", "值得一提的是",
  "彻底改变", "颠覆", "一键搞定", "效率提升10倍", "效率提升 10 倍", "进行了一个", "未来已来",
  "拥抱变化", "被时代抛弃", "不可或缺", "至关重要", "毋庸置疑",
];
const LIMITS = { wechatTitle: 30, xhsTitle: 20, douyinLine: 28 };
// 口播（配音原文）检查：TTS 照字读，书面腔会让配音像播报
const EMOTIONS = ["平静", "开心", "惊讶", "难过", "生气", "害怕", "厌恶",
  "neutral", "happy", "surprised", "sad", "angry", "fearful", "disgusted"];
const WRITTEN_WORDS = ["因此", "然而", "此外", "首先", "其次", "从而", "以及", "即可", "便于", "进行", "此时", "该方法"];
const SPOKEN_MARKERS = /[吧呢啊嘛呀？?]|你猜|其实|结果/;
const SKIP_SCAN = new Set(["实测记录.md"]);

const chars = (s) => [...s.trim()].length;

function findUp(start, name) {
  for (let dir = resolve(start); ; dir = dirname(dir)) {
    if (existsSync(join(dir, name))) return join(dir, name);
    if (dirname(dir) === dir) return null;
  }
}

function loadConfig(start) {
  const path = findUp(start, CONFIG_NAME);
  if (!path) return { ...DEFAULTS, root: resolve(start) };
  const user = JSON.parse(readFileSync(path, "utf8"));
  return { ...DEFAULTS, ...user, root: dirname(path) };
}

function mdFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      return ["node_modules", "out", "renders", "snapshots", "audio", "实测"].includes(name) ? [] : mdFiles(p);
    }
    return name.endsWith(".md") && !SKIP_SCAN.has(name) ? [p] : [];
  });
}

/** 结果收集：level 为 ✗ 或 ⚠ */
function makeReport() {
  const items = [];
  return {
    fail: (msg) => items.push({ level: "✗", msg }),
    warn: (msg) => items.push({ level: "⚠", msg }),
    pass: (msg) => items.push({ level: "✓", msg }),
    items,
  };
}

function checkScenario(ep, r) {
  const p = join(ep, "场景卡.md");
  if (!existsSync(p)) return r.fail("缺少 场景卡.md");
  const empty = readFileSync(p, "utf8")
    .split("\n")
    .map((l) => l.match(/^- ([^：:]+)[：:]\s*(.*)$/))
    .filter(Boolean)
    .filter(([, , v]) => !v.trim() || v.trim().startsWith("（"))
    .map(([, k]) => k);
  return empty.length ? r.fail(`场景卡未填写：${empty.join("、")}`) : r.pass("场景卡已填写");
}

function checkTest(ep, r) {
  const p = join(ep, "实测记录.md");
  if (!existsSync(p)) return r.fail("缺少 实测记录.md");
  const md = readFileSync(p, "utf8");
  const status = md.match(/^- 状态[：:]\s*(.*)$/m)?.[1]?.trim();
  if (status !== "已实测") return r.fail(`实测记录状态为「${status || "空"}」，需要真实实测后改为「已实测」`);
  const answers = [...md.matchAll(/### 原始回答\s*\n```[^\n]*\n([\s\S]*?)```/g)]
    .map((m) => m[1].trim())
    .filter((t) => t && !t.startsWith("（"));
  return answers.length ? r.pass(`实测记录：${answers.length} 段原始回答`) : r.fail("实测记录里没有原始回答");
}

function checkDraft(ep, config, r) {
  const p = join(ep, "母稿.md");
  if (!existsSync(p)) return r.fail("缺少 母稿.md");
  const headings = [...readFileSync(p, "utf8").matchAll(/^##\s+(.+)$/gm)].map((m) => m[1]);
  const missing = config.requiredSections.filter((k) => !headings.some((h) => h.includes(k)));
  return missing.length ? r.fail(`母稿缺少小节：${missing.join("、")}`) : r.pass("母稿结构完整");
}

function checkTextAll(ep, config, r) {
  const banned = [...BANNED, ...config.bannedPhrases];
  let hits = 0;
  for (const file of mdFiles(ep)) {
    const rel = relative(ep, file);
    readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      if (line.includes("{{")) r.fail(`${rel}:${i + 1} 残留占位符：${line.trim().slice(0, 40)}`);
      for (const w of banned.filter((w) => line.includes(w))) {
        hits++;
        r.warn(`${rel}:${i + 1} AI 腔用语「${w}」`);
      }
    });
  }
  if (!hits) r.pass("没有 AI 腔用语");
}

function checkPlatforms(ep, config, r) {
  const f = config.platformFiles;
  const read = (key) => (f[key] && existsSync(join(ep, f[key])) ? readFileSync(join(ep, f[key]), "utf8") : null);

  const wechat = read("wechat");
  const title = wechat?.match(/^title:\s*(.+)$/m)?.[1];
  if (title && chars(title) > LIMITS.wechatTitle) r.warn(`公众号标题 ${chars(title)} 字，建议 ≤ ${LIMITS.wechatTitle}：${title}`);

  const xhs = read("xiaohongshuCopy");
  const xhsTitle = xhs?.match(/## 标题[^\n]*\n+([^\n#]+)/)?.[1];
  if (xhsTitle && chars(xhsTitle) > LIMITS.xhsTitle) r.warn(`小红书标题 ${chars(xhsTitle)} 字，平台上限 ${LIMITS.xhsTitle}：${xhsTitle.trim()}`);

  const douyin = read("douyinScript");
  if (douyin) {
    const lines = douyinLines(douyin);
    for (const { n, text, emo } of lines) {
      if (chars(text) > LIMITS.douyinLine) r.warn(`抖音第 ${n} 句 ${chars(text)} 字，建议 ≤ ${LIMITS.douyinLine}：${text}`);
      if (emo && !EMOTIONS.includes(emo)) r.fail(`抖音第 ${n} 句情感「${emo}」无效，可选：${EMOTIONS.slice(0, 7).join(" ")}`);
      const written = WRITTEN_WORDS.filter((w) => text.includes(w));
      if (written.length) r.warn(`抖音第 ${n} 句有书面词「${written.join("、")}」，配音会像播报：${text}`);
      if (/\d/.test(text)) r.warn(`抖音第 ${n} 句有阿拉伯数字，TTS 可能读错，建议写汉字：${text}`);
    }
    if (lines.length && !lines.some((l) => SPOKEN_MARKERS.test(l.text))) {
      r.warn("抖音口播整段没有语气词或反问（吧、呢、其实、结果……），听起来可能像念稿");
    }
  }
}

/**
 * 抖音口播 → [{ n, text, emo }]。支持两种写法：
 *   - 分镜表：表头含「口播…」「情感…」列，第一列是行号（narrated-video 旧流程的 脚本.md）
 *   - HyperFrames SCRIPT.md：`## … (Frame N)` 开一句，`**Emotion:**`/`**情感:**`，缩进块是口播原文
 */
function douyinLines(md) {
  if (/\(Frame \d+\)/.test(md)) {
    return md.split(/^## /m).slice(1).flatMap((block) => {
      const n = block.match(/\(Frame (\d+)\)/)?.[1];
      const text = block.split("\n").filter((l) => /^ {4}\S/.test(l)).map((l) => l.trim()).join("");
      const emo = block.match(/\*\*(?:Emotion|情感)[:：]\*\*\s*(\S+)/i)?.[1] ?? "";
      return n && text ? [{ n, text, emo }] : [];
    });
  }
  const rows = md.split("\n").filter((l) => l.trim().startsWith("|"));
  const header = rows[0]?.split("|").map((c) => c.trim()) ?? [];
  const col = header.findIndex((h) => h.startsWith("口播"));
  const emoCol = header.findIndex((h) => h.startsWith("情感"));
  return rows
    .slice(2)
    .map((row) => row.split("|").map((c) => c.trim()))
    .filter((cells) => /^\d+$/.test(cells[1]) && cells[col])
    .map((cells) => ({ n: cells[1], text: cells[col], emo: emoCol >= 0 ? cells[emoCol] : "" }));
}

function main() {
  const [cmd, dir] = process.argv.slice(2);
  if (cmd !== "check" || !dir) {
    console.error("用法：sc check <作品目录>");
    process.exit(1);
  }
  const ep = resolve(dir);
  if (!existsSync(ep)) throw new Error(`目录不存在：${ep}`);
  const config = loadConfig(ep);
  const r = makeReport();

  checkScenario(ep, r);
  checkTest(ep, r);
  checkDraft(ep, config, r);
  checkTextAll(ep, config, r);
  checkPlatforms(ep, config, r);

  for (const { level, msg } of r.items) console.log(`${level} ${msg}`);
  const fails = r.items.filter((i) => i.level === "✗").length;
  const warns = r.items.filter((i) => i.level === "⚠").length;
  console.log(`\n${fails} 项必须修改，${warns} 项需要判断${config.voiceGuide ? `；语气指南：${config.voiceGuide}` : ""}`);
  process.exitCode = fails ? 1 : 0;
}

try {
  main();
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exit(1);
}
