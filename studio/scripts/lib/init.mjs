// st init：建一个新的作品项目（目录骨架 + 各 skill 的默认配置 + 起步品牌样式）。已有的文件不覆盖。
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { extname, join, relative, resolve } from "node:path";
import { DEFAULTS, MARKER, STUDIO_DIR, toolkitVersion } from "./project.mjs";
import { substitute } from "./new.mjs";

const SKELETON = join(STUDIO_DIR, "skeleton");
// 工具包里不能直接放 .gitignore、.claude/（会被当成工具包自己的），骨架里换个名字，建项目时改回来
const RENAME = { gitignore: ".gitignore", "dot-claude": ".claude" };
const destRel = (rel) => rel.split("/").map((seg) => RENAME[seg] ?? seg).join("/");
const TEXT = new Set([".md", ".json", ".css", ".html", ""]);

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

export function parseInitArgs(argv) {
  const opts = { dir: null, account: "", audience: "", lead: "", update: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--account") opts.account = argv[++i] ?? "";
    else if (a === "--audience") opts.audience = argv[++i] ?? "";
    else if (a === "--lead") opts.lead = argv[++i] ?? "";
    else if (a === "--update") opts.update = true;
    else if (a.startsWith("--")) throw new Error(`未知参数：${a}`);
    else opts.dir = a;
  }
  if (!opts.dir) throw new Error("用法：st init <目录> [--account 账号名] [--audience 目标观众] [--lead 模板怎么领]；已有项目补新文件：st init <目录> --update");
  return opts;
}

/** media-use 自带的音效库（HyperFrames skills 装的）；有音频文件才算 */
export const mediaUseSfx = (home) => join(home, ".claude/skills/media-use/audio/assets/sfx");
export const hasAudio = (dir) => existsSync(dir) && readdirSync(dir).some((f) => /\.(mp3|wav|m4a|ogg)$/i.test(f));

/** CLAUDE.md 按「## 」标题切成节；返回 [{ head, text }]，第一节 head 为 null（标题前的部分） */
function sections(md) {
  return md.split(/^(?=## )/m).map((text) => ({ head: text.match(/^## (.+)$/m)?.[0] ?? null, text }));
}

/** 已有项目补骨架里新加的东西：缺的文件、CLAUDE.md 缺的节、.gitignore 缺的行；已有的一律不改 */
function updateProject(root, vars, log) {
  const added = [];
  for (const src of walk(SKELETON)) {
    const rel = destRel(relative(SKELETON, src));
    const dest = join(root, rel);
    const text = () => substitute(readFileSync(src, "utf8"), vars);
    if (!existsSync(dest)) {
      mkdirSync(join(dest, ".."), { recursive: true });
      if (TEXT.has(extname(src))) writeFileSync(dest, text()); else copyFileSync(src, dest);
      added.push(rel);
    } else if (rel === "CLAUDE.md") {
      const mine = readFileSync(dest, "utf8");
      const have = new Set(sections(mine).map((x) => x.head).filter(Boolean));
      const missing = sections(text()).filter((x) => x.head && !have.has(x.head));
      if (missing.length) {
        writeFileSync(dest, `${mine.trimEnd()}\n\n${missing.map((x) => x.text.trimEnd()).join("\n\n")}\n`);
        added.push(`CLAUDE.md 的 ${missing.map((x) => x.head.slice(3)).join("、")}`);
      }
    } else if (rel === ".gitignore") {
      const mine = readFileSync(dest, "utf8");
      const have = new Set(mine.split("\n").map((l) => l.trim()));
      const lines = text().split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && !have.has(l));
      if (lines.length) {
        writeFileSync(dest, `${mine.trimEnd()}\n\n# st init --update 补的\n${lines.join("\n")}\n`);
        added.push(`.gitignore 的 ${lines.join(" ")}`);
      }
    } else if (rel === ".claude/settings.json" && !readFileSync(dest, "utf8").includes("st log-hook")) {
      log(`  ⚠ .claude/settings.json 已存在，没有改：要自动记工具包命令，手动加上 PostToolUse / PostToolUseFailure 钩子 st log-hook（见工具包 studio/skeleton/dot-claude/settings.json）`);
    }
  }
  log(added.length ? `✓ 补了 ${added.length} 处：\n${added.map((a) => `  · ${a}`).join("\n")}` : "✓ 没有要补的，已经是最新骨架");
  return root;
}

export function initProject({ dir, account = "", audience = "", lead = "", update = false, home = homedir() }, log = console.log) {
  const root = resolve(dir);
  if (update) {
    if (!existsSync(join(root, MARKER))) throw new Error(`${root} 不是作品项目（没有 ${MARKER}）：新项目去掉 --update`);
    const p = JSON.parse(readFileSync(join(root, MARKER), "utf8"));
    return updateProject(root, { 账号: p.account || "（账号名）", 观众: p.audience || "（目标观众）" }, log);
  }
  if (existsSync(join(root, MARKER))) throw new Error(`已经是作品项目了：${join(root, MARKER)}（要补新版骨架里的文件用 --update）`);
  mkdirSync(root, { recursive: true });
  const vars = { 账号: account || "（账号名）", 观众: audience || "（目标观众）" };
  let created = 0, skipped = 0;
  for (const src of walk(SKELETON)) {
    const rel = relative(SKELETON, src);
    const name = rel.split("/").pop();
    const dest = join(root, destRel(rel));
    if (existsSync(dest)) { skipped++; log(`  · 已有，跳过：${relative(root, dest)}`); continue; }
    mkdirSync(join(dest, ".."), { recursive: true });
    if (TEXT.has(extname(name))) writeFileSync(dest, substitute(readFileSync(src, "utf8"), vars));
    else copyFileSync(src, dest);
    created++;
  }
  // 默认音效目录是项目里的空目录：找得到 media-use 的音效库就直接用它（vd build 的 sfx 要从这里找）
  const vdCfg = join(root, "video-director.config.json");
  if (existsSync(vdCfg) && hasAudio(mediaUseSfx(home))) {
    const cfg = JSON.parse(readFileSync(vdCfg, "utf8"));
    writeFileSync(vdCfg, JSON.stringify({ ...cfg, sfxDir: mediaUseSfx(home) }, null, 2) + "\n");
  }
  const studio = { ...DEFAULTS, account, audience, lead, toolkit: `>=${toolkitVersion()}` };
  writeFileSync(join(root, MARKER), JSON.stringify(studio, null, 2) + "\n");

  log(`✓ 已建作品项目：${root}（新建 ${created} 个文件${skipped ? `，跳过 ${skipped} 个已有的` : ""}）`);
  log(`接下来：
  1. 定方向：在项目里和 AI 说「帮我定方向」，一项一项聊完账号方向（观众、看完的感受、人设、变现、选题标准、语气、账号名和怎么领），
     你通过后 st confirm account；再用 st series add 开系列、聊系列说明、st confirm series。没定好 st new 会拦下
  2. 品牌：改 06-品牌资产/theme.css 的颜色；参考音色放 06-品牌资产/参考音色.wav；要配音时把 .env.example 复制成 .env 填密钥（字体和 GSAP 由 video-director 自带，不用准备）
  3. cd ${root} && st doctor，按提示补齐
  4. st new <系列> <简称> 开第一期`);
  return root;
}
