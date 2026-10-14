#!/usr/bin/env node
// 用法：sc check <作品目录> [--json]
//       sc bench <关键词…> [--platform 抖音|小红书|all] [--out 文件.json]
// check：检查一期内容：场景卡、选题关、实测记录、母稿结构、占位符、AI 腔用语、各平台长度。有 ✗ 时退出码为 1。
// bench：在已登录的浏览器里搜关键词，抓对标内容的标题和点赞，给选题关用。
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CONFIG_NAME = "scenario-content.config.json";
const DEFAULTS = {
  voiceGuide: null,
  bannedPhrases: [],
  requiredSections: ["场景", "痛点", "实测", "解法", "可复制"],
  feynmanCheck: "费曼检查.md", // 母稿后的「讲没讲明白」检查；设为 null 关闭
  topicGate: "选题关.md", // 实测前的「有没有人想看」检查；设为 null 关闭
  minBenchmarks: 5, // 选题关里至少几条对标
  benchCdpPort: 9333, // sc bench 连接的浏览器调试端口（要已登录抖音、小红书）
  platformFiles: {},
};
const BANNED = [
  "在这个快速发展的时代", "随着AI技术的", "随着 AI 技术的", "飞速发展", "赋能", "助力", "全方位",
  "深度解析", "干货满满", "硬核", "总而言之", "综上所述", "让我们一起", "值得一提的是",
  "彻底改变", "颠覆", "一键搞定", "效率提升10倍", "效率提升 10 倍", "进行了一个", "未来已来",
  "拥抱变化", "被时代抛弃", "不可或缺", "至关重要", "毋庸置疑",
];
const LIMITS = { wechatTitle: 30, xhsTitle: 20, douyinTitle: 30, douyinLine: 28 };
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

export function loadConfig(start) {
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
  const add = (level) => (msg, file = null, code) => items.push({ level, msg, file, ...(code ? { code } : {}) });
  return { fail: add("✗"), warn: add("⚠"), pass: add("✓"), items };
}

/** 「- 字段：值」列表里没填的字段（空或还是「（…）」占位） */
function emptyFields(md) {
  return md
    .split("\n")
    .map((l) => l.match(/^- ([^：:]+)[：:]\s*(.*)$/))
    .filter(Boolean)
    .filter(([, , v]) => !v.trim() || v.trim().startsWith("（"))
    .map(([, k]) => k);
}

function checkScenario(ep, r) {
  const p = join(ep, "场景卡.md");
  const file = "场景卡.md";
  if (!existsSync(p)) return r.fail("缺少 场景卡.md", file);
  const empty = emptyFields(readFileSync(p, "utf8"));
  return empty.length ? r.fail(`场景卡未填写：${empty.join("、")}`, file) : r.pass("场景卡已填写", file);
}

/** 选题关：没填的字段、对标表的有效行数、用户是否确认 */
export function parseGate(md) {
  const benchRows = tableRows(md, "标题").filter((cells) => cells.slice(1, 3).every((c) => !isPlaceholder(c))).length;
  const confirm = md.match(/^- 用户确认[：:][ \t]*(.*)$/m)?.[1]?.trim() ?? "";
  return { empty: emptyFields(md), benchRows, confirmed: !isPlaceholder(confirm) };
}

function checkGate(ep, config, r) {
  if (!config.topicGate) return;
  const file = config.topicGate;
  const p = join(ep, file);
  if (!existsSync(p)) return r.fail(`缺少 ${file}（实测前先过选题关：标题、封面、开头三秒、对标）`, file);
  const g = parseGate(readFileSync(p, "utf8"));
  const empty = g.empty.filter((k) => k !== "用户确认");
  if (empty.length) r.fail(`选题关未填写：${empty.join("、")}`, file);
  if (g.benchRows < config.minBenchmarks) r.fail(`选题关对标只有 ${g.benchRows} 条，至少 ${config.minBenchmarks} 条（可用 sc bench 抓）`, file);
  if (!empty.length && g.benchRows >= config.minBenchmarks) r.pass(`选题关已填写，对标 ${g.benchRows} 条`, file);
  if (!g.confirmed) r.fail("选题关用户还没确认（kv gate <作品> topic \"用户原话\"）", file, "topic-unconfirmed");
}

function checkTest(ep, r) {
  const p = join(ep, "实测记录.md");
  const file = "实测记录.md";
  if (!existsSync(p)) return r.fail("缺少 实测记录.md", file);
  const md = readFileSync(p, "utf8");
  const status = md.match(/^- 状态[：:]\s*(.*)$/m)?.[1]?.trim();
  if (status !== "已实测") return r.fail(`实测记录状态为「${status || "空"}」，需要真实实测后改为「已实测」`, file);
  const answers = [...md.matchAll(/### 原始回答\s*\n```[^\n]*\n([\s\S]*?)```/g)]
    .map((m) => m[1].trim())
    .filter((t) => t && !t.startsWith("（"));
  return answers.length ? r.pass(`实测记录：${answers.length} 段原始回答`, file) : r.fail("实测记录里没有原始回答", file);
}

function checkDraft(ep, config, r) {
  const p = join(ep, "母稿.md");
  const file = "母稿.md";
  if (!existsSync(p)) return r.fail("缺少 母稿.md", file);
  const headings = [...readFileSync(p, "utf8").matchAll(/^##\s+(.+)$/gm)].map((m) => m[1]);
  const missing = config.requiredSections.filter((k) => !headings.some((h) => h.includes(k)));
  return missing.length ? r.fail(`母稿缺少小节：${missing.join("、")}`, file) : r.pass("母稿结构完整", file);
}

const isPlaceholder = (cell) => !cell || cell.startsWith("（") || cell.startsWith("(");

/** 读 `| a | b |` 表格：从表头含 headerWord 的那行起，返回数据行的单元格 */
function tableRows(md, headerWord) {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => l.trim().startsWith("|") && l.includes(headerWord));
  if (start < 0) return [];
  const rows = [];
  for (const line of lines.slice(start + 2)) {
    if (!line.trim().startsWith("|")) break;
    rows.push(line.split("|").slice(1, -1).map((c) => c.trim()));
  }
  return rows;
}

/** 费曼检查.md → { questions: [{ q, answer }], terms: [], analogy, verified } */
export function parseFeynman(md) {
  const questions = tableRows(md, "他会问")
    .filter(([q]) => !isPlaceholder(q))
    .map(([q, answer = ""]) => ({ q, answer: isPlaceholder(answer) || /^没有/.test(answer.replace(/\*/g, "")) ? "" : answer }));
  const terms = tableRows(md, "术语").map(([t]) => t).filter((t) => !isPlaceholder(t));
  const field = (k) => md.match(new RegExp(`^- ${k}[：:]\\s*(.*)$`, "m"))?.[1]?.trim() ?? "";
  const clean = (v) => (isPlaceholder(v) ? "" : v);
  return { questions, terms, analogy: clean(field("类比")), verified: clean(field("检验")) };
}

function checkFeynman(ep, config, r) {
  if (!config.feynmanCheck) return;
  const file = config.feynmanCheck;
  const p = join(ep, file);
  if (!existsSync(p)) return r.fail(`缺少 ${file}（母稿写完后做费曼检查，见 references/feynman-check.md）`, file);
  const f = parseFeynman(readFileSync(p, "utf8"));
  const unanswered = f.questions.filter((x) => !x.answer).map((x) => x.q);
  if (f.questions.length < 3) r.fail(`费曼检查：零基础的人会追问的问题只列了 ${f.questions.length} 个，至少 3 个`, file);
  else if (unanswered.length) r.fail(`费曼检查：这些问题母稿里还没有大白话回答：${unanswered.join("；")}`, file);
  else r.pass(`费曼检查：${f.questions.length} 个追问都有回答`, file);
  if (!f.analogy || !f.verified) r.fail("费曼检查：缺少类比，或没写类比检验", file);
  const draftPath = join(ep, "母稿.md");
  if (existsSync(draftPath)) {
    const draft = readFileSync(draftPath, "utf8");
    const left = f.terms.filter((t) => draft.includes(t));
    if (left.length) r.warn(`费曼检查：母稿里还有要换掉的术语：${left.join("、")}`, file);
  }
}

function checkTextAll(ep, config, r) {
  const banned = [...BANNED, ...config.bannedPhrases];
  let hits = 0;
  for (const file of mdFiles(ep)) {
    const rel = relative(ep, file);
    readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      if (line.includes("{{")) r.fail(`${rel}:${i + 1} 残留占位符：${line.trim().slice(0, 40)}`, rel);
      for (const w of banned.filter((w) => line.includes(w))) {
        hits++;
        r.warn(`${rel}:${i + 1} AI 腔用语「${w}」`, rel);
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
  if (title && chars(title) > LIMITS.wechatTitle) r.warn(`公众号标题 ${chars(title)} 字，建议 ≤ ${LIMITS.wechatTitle}：${title}`, f.wechat);

  const xhs = read("xiaohongshuCopy");
  const xhsTitle = xhs?.match(/## 标题[^\n]*\n+([^\n#]+)/)?.[1];
  if (xhsTitle && chars(xhsTitle) > LIMITS.xhsTitle) r.warn(`小红书标题 ${chars(xhsTitle)} 字，平台上限 ${LIMITS.xhsTitle}：${xhsTitle.trim()}`, f.xiaohongshuCopy);

  const dyCopy = read("douyinCopy");
  const dyTitle = dyCopy?.match(/## 标题[^\n]*\n+([^\n#]+)/)?.[1];
  if (dyTitle && chars(dyTitle) > LIMITS.douyinTitle) r.warn(`抖音标题 ${chars(dyTitle)} 字，平台上限 ${LIMITS.douyinTitle}：${dyTitle.trim()}`, f.douyinCopy);

  const douyin = read("douyinScript");
  if (douyin) {
    const lines = douyinLines(douyin);
    for (const { n, text, emo, sentences = [text] } of lines) {
      for (const s of sentences) {
        if (chars(s) > LIMITS.douyinLine) r.warn(`抖音第 ${n} 帧有一句 ${chars(s)} 字，建议 ≤ ${LIMITS.douyinLine}：${s}`, f.douyinScript);
      }
      if (emo && !EMOTIONS.includes(emo)) r.fail(`抖音第 ${n} 句情感「${emo}」无效，可选：${EMOTIONS.slice(0, 7).join(" ")}`, f.douyinScript);
      const written = WRITTEN_WORDS.filter((w) => text.includes(w));
      if (written.length) r.warn(`抖音第 ${n} 句有书面词「${written.join("、")}」，配音会像播报：${text}`, f.douyinScript);
      if (/\d/.test(text)) r.warn(`抖音第 ${n} 句有阿拉伯数字，TTS 可能读错，建议写汉字：${text}`, f.douyinScript);
    }
    if (lines.length && !lines.some((l) => SPOKEN_MARKERS.test(l.text))) {
      r.warn("抖音口播整段没有语气词或反问（吧、呢、其实、结果……），听起来可能像念稿", f.douyinScript);
    }
  }
}

/**
 * 抖音口播 → [{ n, text, emo }]。支持两种写法：
 *   - 分镜表：表头含「口播…」「情感…」列，第一列是行号（narrated-video 旧流程的 脚本.md）
 *   - HyperFrames SCRIPT.md：`## … (Frame N)` 开一帧，`**Emotion:**`/`**情感:**`，缩进块是口播原文；
 *     缩进块可以有好几行，每行一句（同一个画面接着说），字数按句检查
 */
export function douyinLines(md) {
  if (/\(Frame \d+\)/.test(md)) {
    return md.split(/^## /m).slice(1).flatMap((block) => {
      const n = block.match(/\(Frame (\d+)\)/)?.[1];
      const sentences = block.split("\n").filter((l) => /^ {4}\S/.test(l)).map((l) => l.trim());
      const text = sentences.join("");
      const emo = block.match(/\*\*(?:Emotion|情感)[:：]\*\*\s*(\S+)/i)?.[1] ?? "";
      return n && text ? [{ n, text, emo, sentences }] : [];
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

/** 平台上的计数：「1.2万」「10万+」「5276」→ 数字；读不出来算 0 */
export function parseCount(s) {
  const m = String(s ?? "").trim().match(/^([\d.]+)(万)?\+?$/);
  if (!m) return 0;
  return Math.round(Number(m[1]) * (m[2] ? 10000 : 1));
}

/** 抖音搜索页的 innerText：每条视频是「时长 / 点赞 / 标题 / @作者」连续四行 */
export function parseDouyinText(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const items = [];
  lines.forEach((line, i) => {
    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(line)) return;
    const [likes, title, author] = lines.slice(i + 1, i + 4);
    if (!/^[\d.]+万?$/.test(likes ?? "") || !author?.startsWith("@")) return;
    items.push({ duration: line, likes: parseCount(likes), title, author: author.slice(1) });
  });
  return items;
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};

async function bench(args, config) {
  const kws = [];
  const opts = { platform: "all", out: null, top: 10 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--platform") opts.platform = args[++i];
    else if (args[i] === "--out") opts.out = args[++i];
    else if (args[i] === "--top") opts.top = Number(args[++i]);
    else kws.push(args[i]);
  }
  if (!kws.length) throw new Error("用法：sc bench <关键词…> [--platform 抖音|小红书|all] [--out 文件.json] [--top 10]");
  const platforms = opts.platform === "all" ? ["小红书", "抖音"] : [opts.platform];
  const port = config.benchCdpPort;
  let ws;
  try {
    ws = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl;
  } catch {
    throw new Error(`连不上 ${port} 端口的浏览器：先打开带远程调试的浏览器，并登录抖音、小红书`);
  }
  const script = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "bench_harness.py"), "utf8");
  const res = spawnSync("browser-harness", ["-c", script], {
    env: { ...process.env, BU_CDP_WS: ws, BU_NAME: "sc-bench", BENCH_KWS: JSON.stringify(kws), BENCH_PLATFORMS: JSON.stringify(platforms) },
    encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 15 * 60 * 1000,
  });
  if (res.status !== 0) throw new Error(`browser-harness 出错：${(res.stderr || res.error?.message || "").slice(-800)}`);
  const results = res.stdout.split("\n").filter((l) => l.startsWith("{")).map((l) => JSON.parse(l)).map((r) => ({
    ...r,
    items: r.platform === "抖音" ? parseDouyinText(r.text ?? "")
      : r.items.map(([title, author, likes, collects]) => ({ title, author, likes: parseCount(likes), collects: parseCount(collects) })),
    text: undefined,
  }));
  for (const r of results) {
    console.log(`\n## ${r.platform} · ${r.keyword}（${r.items.length} 条，点赞中位数 ${median(r.items.map((i) => i.likes))}）\n`);
    console.log("| 平台 | 标题 | 点赞 | 收藏 | 作者 |\n|---|---|---|---|---|");
    for (const i of [...r.items].sort((a, b) => b.likes - a.likes).slice(0, opts.top)) {
      console.log(`| ${r.platform} | ${(i.title ?? "").replace(/\|/g, "/").slice(0, 60)} | ${i.likes} | ${i.collects ?? ""} | ${i.author ?? ""} |`);
    }
  }
  if (opts.out) writeFileSync(opts.out, JSON.stringify({ at: new Date().toISOString(), results }, null, 1));
}

/** 跑全部检查，返回 [{ level, msg, file, code? }]；file 是问题所在的文件（相对作品目录），全局性的为 null */
export function runChecks(ep, config) {
  const r = makeReport();
  checkScenario(ep, r);
  checkGate(ep, config, r);
  checkTest(ep, r);
  checkDraft(ep, config, r);
  checkFeynman(ep, config, r);
  checkTextAll(ep, config, r);
  checkPlatforms(ep, config, r);
  return r.items;
}

async function main() {
  const [cmd, dir, ...rest] = process.argv.slice(2);
  if (cmd === "bench") return bench([dir, ...rest].filter(Boolean), loadConfig(process.cwd()));
  if (cmd !== "check" || !dir) {
    console.error("用法：sc check <作品目录> [--json]\n      sc bench <关键词…> [--platform 抖音|小红书|all] [--out 文件.json]");
    process.exit(1);
  }
  const ep = resolve(dir);
  if (!existsSync(ep)) throw new Error(`目录不存在：${ep}`);
  const config = loadConfig(ep);
  const items = runChecks(ep, config);
  const fails = items.filter((i) => i.level === "✗").length;
  process.exitCode = fails ? 1 : 0;
  if (rest.includes("--json")) return console.log(JSON.stringify({ items }));
  for (const { level, msg } of items) console.log(`${level} ${msg}`);
  const warns = items.filter((i) => i.level === "⚠").length;
  console.log(`\n${fails} 项必须修改，${warns} 项需要判断${config.voiceGuide ? `；语气指南：${config.voiceGuide}` : ""}`);
}

// 直接运行时才执行（被测试导入时不执行）；按真实路径比较，skill 常通过软链接调用
const isMain = (() => {
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
})();

if (isMain) {
  main().catch((err) => {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  });
}
