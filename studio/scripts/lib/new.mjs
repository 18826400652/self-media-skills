// st new：新建一期作品（原 scripts/new-episode.sh）。按系列登记表的 type 放模板：
//   practical（默认，实用技巧）：场景卡 + 选题关 + 实测记录 + 母稿 + 费曼检查 + 发布记录 + 公众号 + 小红书文案 + 抖音
//   concept（概念科普，走 knowledge-video）：发布记录 + 抖音（SCRIPT 用概念科普模板）
// 模板先找项目 templates 目录，没有用工具包默认的；占位符：{{标题}} {{角标}} {{系列}} {{编号}} {{账号}} {{观众}} {{账号定位}} {{系列说明}}
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { loadProject, templatePath } from "./project.mjs";

export const USAGE = `用法：
  st new <系列> <简称> [--编号 N] [--video director|template]
      → <works>/<系列>/NN-<简称>/，编号默认自动递增；系列须登记在系列登记表
  st new 单篇 <简称> [--栏目 名称] [--日期 YYYY-MM-DD]
      → <works>/单篇/YYYY-MM-DD-<简称>/
  加 --只建抖音：作品已存在时只补建 抖音/ 工程`;

const PRACTICAL_FILES = [
  ["场景卡模板.md", "场景卡.md"],
  ["选题关模板.md", "选题关.md"],
  ["实测记录模板.md", "实测记录.md"],
  ["母稿模板.md", "母稿.md"],
  ["费曼检查模板.md", "费曼检查.md"],
  ["发布记录模板.md", "发布记录.md"],
  ["公众号文章模板.md", "公众号/文章.md"],
  ["公众号封面模板.md", "公众号/封面/封面.md"],
  ["小红书文案模板.md", "小红书/文案.md"],
];

const today = () => new Date().toLocaleDateString("sv-SE");
const has = (cmd) => spawnSync("bash", ["-c", `command -v ${cmd}`], { stdio: "ignore" }).status === 0;

export function parseArgs(argv) {
  const [series, name, ...rest] = argv;
  if (!series || !name) throw new Error(USAGE);
  const opts = { series, name, num: "", column: "", date: today(), douyinOnly: false, video: null };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    const val = () => {
      if (!rest[i + 1]) throw new Error(`${a} 后面要写值`);
      return rest[++i];
    };
    if (a === "--编号") opts.num = val();
    else if (a === "--栏目") opts.column = val();
    else if (a === "--日期") opts.date = val();
    else if (a === "--只建抖音") opts.douyinOnly = true;
    else if (a === "--video") opts.video = val();
    else throw new Error(`未知参数：${a}`);
  }
  if (name.includes("/") || name.includes("&")) throw new Error(`简称里不能有 / 或 &：${name}`);
  if (opts.video && !["director", "template"].includes(opts.video)) throw new Error(`--video 只能是 director 或 template：${opts.video}`);
  return opts;
}

function readRegistry(p) {
  if (!existsSync(p)) throw new Error(`找不到系列登记表：${p}`);
  return JSON.parse(readFileSync(p, "utf8"));
}

function nextNumber(seriesDir) {
  if (!existsSync(seriesDir)) return 1;
  const nums = readdirSync(seriesDir).map((n) => n.match(/^\d+/)?.[0]).filter(Boolean).map(Number);
  return (nums.length ? Math.max(...nums) : 0) + 1;
}

/** 算出作品目录、角标、系列类型 */
export function planEpisode(project, opts) {
  if (opts.series === "单篇") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.date)) throw new Error(`日期格式应为 YYYY-MM-DD：${opts.date}`);
    return { ep: join(project.abs.works, "单篇", `${opts.date}-${opts.name}`), label: "单篇", badge: opts.column, type: "practical", num: "" };
  }
  const registry = readRegistry(project.abs.registry);
  const r = registry[opts.series];
  if (!r) throw new Error(`系列「${opts.series}」未登记，可选：${Object.keys(registry).join("、")}`);
  const type = r.type || "practical";
  if (r.paused && !opts.douyinOnly) throw new Error(`系列「${opts.series}」已暂停：${r.paused}（见 ${project.abs.registry}）`);
  if (!["practical", "concept"].includes(type)) throw new Error(`系列「${opts.series}」的 type 应为 practical 或 concept：${type}（见 ${project.abs.registry}）`);
  if (opts.num !== "" && !/^\d+$/.test(opts.num)) throw new Error(`编号应为数字：${opts.num}`);
  const num = opts.num === "" ? nextNumber(join(project.abs.works, opts.series)) : Number(opts.num);
  const nn = String(num).padStart(2, "0");
  return { ep: join(project.abs.works, opts.series, `${nn}-${opts.name}`), label: r.label, badge: `${r.label} · 第 ${num} ${r.unit}`, type, num: String(num) };
}

/** 替换占位符；角标为空时去掉行尾留下的「 · 」 */
export function substitute(text, vars) {
  let out = text;
  for (const [k, v] of Object.entries(vars)) out = out.split(`{{${k}}}`).join(v);
  return out.replace(/ · $/gm, "");
}

function run(cmd, args, env = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", env: { ...process.env, ...env } });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} 失败：${(r.stderr || r.stdout || "").trim()}`);
}

export function createEpisode(opts, cwd = process.cwd()) {
  const project = loadProject(cwd);
  if (!has("nv")) throw new Error("找不到 nv 命令：先在工具包里跑 st install");
  const plan = planEpisode(project, opts);
  const { ep, type } = plan;
  if (opts.douyinOnly) {
    if (!existsSync(ep)) throw new Error(`作品不存在：${ep}`);
    if (existsSync(join(ep, "抖音"))) throw new Error(`已存在：${join(ep, "抖音")}（先改名或删除旧的）`);
  } else if (existsSync(ep)) throw new Error(`已存在：${ep}`);

  const vars = {
    标题: opts.name, 角标: plan.badge, 系列: plan.label, 编号: plan.num,
    账号: project.account, 观众: project.audience, 账号定位: project.positioning,
    // 系列说明和登记表放在同一个目录：<registry 目录>/<系列>.md；单篇没有系列，指向账号定位
    系列说明: opts.series === "单篇" ? project.positioning : relative(project.root, join(dirname(project.abs.registry), `${opts.series}.md`)),
  };
  const fill = (tpl, out) => {
    const dest = join(ep, out);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, substitute(readFileSync(templatePath(project, tpl), "utf8"), vars));
  };

  if (!opts.douyinOnly && type === "concept") fill("发布记录模板.md", "发布记录.md");
  else if (!opts.douyinOnly) {
    for (const [tpl, out] of PRACTICAL_FILES) fill(tpl, out);
    mkdirSync(join(ep, "实测"), { recursive: true });
  }

  // 抖音：HyperFrames 工程 + 品牌 frame.md + 中文字幕样式 + 画面组件库（流程见 narrated-video）
  const dy = join(ep, "抖音");
  run("nv", ["init", dy, "--non-interactive", "--example=blank", "--skill=faceless-explainer"], { HYPERFRAMES_SKIP_SKILLS: "1" });
  for (const d of [".hyperframes", "capture/assets", "assets", "compositions/frames"]) mkdirSync(join(dy, d), { recursive: true });
  copyFileSync(join(project.abs.brand, "frame.md"), join(dy, "frame.md"));
  copyFileSync(join(project.abs.brand, "caption-skin.html"), join(dy, ".hyperframes/caption-skin.html"));
  fill("抖音/BRIEF模板.md", "抖音/BRIEF.md");
  // 实用类默认「成品教程」结构；概念科普沿用聊天版分镜（翻车讲方法那一版另存为 *-翻车.md，需要时手动换）
  const concept = type === "concept";
  fill(concept ? "抖音/SCRIPT模板-概念.md" : "抖音/SCRIPT模板.md", "抖音/SCRIPT.md");
  fill(concept ? "抖音/STORYBOARD模板-翻车.md" : "抖音/STORYBOARD模板.md", "抖音/STORYBOARD.md");
  fill("抖音/封面模板.md", "抖音/封面.md");
  fill("抖音/发布文案模板.md", "抖音/发布文案.md");
  run("nv", ["hf-kit", dy]);
  if (!opts.douyinOnly && type === "practical") {
    if (!has("kv")) throw new Error("找不到 kv 命令：先在工具包里跑 st install");
    run("kv", ["init", ep, "--fresh", ...(opts.video ? ["--video", opts.video] : [])]); // 记下空模板，kv status 才分得清「还没写」
  }

  const rel = relative(project.root, ep);
  const lines = [`已创建：${rel}（${plan.badge || "无角标"}）`];
  if (concept) lines.push("顺序：按 knowledge-video 导演手册：brief.md → research.json → 抖音/SCRIPT.md → kv check → 确认节点 ①（见 knowledge-video 的 SKILL.md）");
  else lines.push(`下一步：kv status ${rel}（每一步开始前都先跑它，只做它说的那一步）`);
  return { ep, lines };
}
