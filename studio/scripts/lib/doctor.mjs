// st doctor：检查作品项目和工具包是否配好。每一项给 ✓ / ⚠ / ✗，有 ✗ 退出码为 1。
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve } from "node:path";
import { DEFAULT_TEMPLATES, loadProject, MARKER, satisfies, TOOLKIT_DIR, toolkitVersion } from "./project.mjs";

/** 各 skill 的项目配置里，哪些字段是要存在的路径（点号表示嵌套） */
export const CONFIG_PATHS = {
  "narrated-video.config.json": ["tts.reference", "theme"],
  "video-director.config.json": ["fontsDir", "gsap", "brandDir", "sfxDir"],
  "knowledge-video.config.json": ["voiceGuide", "experienceDir"],
  "scenario-content.config.json": ["voiceGuide"],
  "image-cards.config.json": ["theme"],
  "wechat-article.config.json": [],
  "browser-draft.config.json": [],
};

/** 命令 → 所在 skill */
export const COMMANDS = { st: "studio", kv: "knowledge-video", sc: "scenario-content", nv: "narrated-video", vd: "video-director", wa: "wechat-article", ic: "image-cards", bd: "browser-draft", pd: "phone-draft" };

/** 外部程序：[命令, 用途, 必需?] */
const EXTERNAL = [
  ["node", "所有 skill", true],
  ["ffmpeg", "配音、渲染", true],
  ["ffprobe", "配音、渲染", true],
  ["uv", "装 Python 依赖", false],
  ["browser-harness", "网页存草稿（bd）、抓对标（sc bench）", true],
  ["adb", "手机录实测（pd、nv rec --app）", false],
];

const GENERATED = new Set(["卡片预览.html", "预览.html", "README.md"]);

const get = (obj, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
const which = (cmd) => {
  const r = spawnSync("bash", ["-c", `command -v ${cmd}`], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
};
const real = (p) => { try { return realpathSync(p); } catch { return null; } };
const inside = (p, dir) => !!p && !relative(dir, p).startsWith("..");

function listFiles(dir, base = dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name.startsWith(".")) return [];
    const p = join(dir, e.name);
    return e.isDirectory() ? listFiles(p, base) : [relative(base, p)];
  });
}

export function toolkitSkills(toolkit = TOOLKIT_DIR) {
  return readdirSync(toolkit, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(toolkit, e.name, "SKILL.md")))
    .map((e) => e.name)
    .sort();
}

function checkProject(p, out) {
  out.ok(`项目根：${p.root}`);
  const v = toolkitVersion();
  if (satisfies(v, p.toolkit)) out.ok(`工具包版本 ${v}${p.toolkit ? `（项目要求 ${p.toolkit}）` : ""}`);
  else out.fail(`工具包版本 ${v}，项目要求 ${p.toolkit}：先更新工具包`);
  for (const k of ["works", "registry"]) {
    if (existsSync(p.abs[k])) out.ok(`${k}：${p[k]}`);
    else out.fail(`${k} 不存在：${p[k]}（在 ${MARKER} 里改，或建出来）`);
  }
  if (!existsSync(p.abs.positioning)) out.warn(`账号定位文档不存在：${p.positioning}（模板里的 {{账号定位}} 会指向它）`);
  for (const k of ["account", "audience"]) if (!p[k]) out.warn(`${MARKER} 没写 ${k}：模板里的 {{${k === "account" ? "账号" : "观众"}}} 会是空的`);
  if (!existsSync(p.abs.registry)) return;
  let reg;
  try { reg = JSON.parse(readFileSync(p.abs.registry, "utf8")); } catch (e) { return out.fail(`系列登记表不是合法 JSON：${e.message}`); }
  const bad = Object.entries(reg).filter(([, r]) => !r.label || !r.unit || (r.type && !["practical", "concept"].includes(r.type)));
  if (bad.length) out.fail(`系列登记表有问题（要有 label、unit，type 只能是 practical / concept）：${bad.map(([k]) => k).join("、")}`);
  else {
    const active = Object.keys(reg).filter((k) => !reg[k].paused);
    out.ok(`系列 ${Object.keys(reg).length} 个，在做的：${active.join("、") || "（无）"}`);
  }
}

function checkTemplates(p, out) {
  const defaults = new Set(listFiles(DEFAULT_TEMPLATES));
  const own = listFiles(p.abs.templates).filter((f) => !GENERATED.has(f.split("/").pop()));
  if (!own.length) return out.ok(`模板：全部用工具包默认的（${defaults.size} 个）`);
  for (const f of own) {
    if (!defaults.has(f)) out.warn(`模板 ${p.templates}/${f} 不对应任何默认模板，st new 用不到（文件名要和工具包 templates/ 里的一致）`);
    else if (readFileSync(join(p.abs.templates, f), "utf8") === readFileSync(join(DEFAULT_TEMPLATES, f), "utf8")) out.warn(`模板 ${p.templates}/${f} 和默认的一模一样，可以删掉`);
    else out.ok(`模板 ${p.templates}/${f}：项目自己改过，覆盖默认`);
  }
}

function checkBrand(p, out) {
  const dir = p.abs.brand;
  if (!existsSync(dir)) return out.fail(`品牌目录不存在：${p.brand}`);
  for (const f of ["frame.md", "caption-skin.html"]) {
    if (existsSync(join(dir, f))) out.ok(`品牌 ${f}`);
    else out.fail(`品牌目录缺 ${f}（st new 要复制它）`);
  }
  // 账号固定元素只用 var(--vd-*) 字体变量（hyperframes lint 看不到跨文件的 @font-face）
  for (const f of readdirSync(dir).filter((n) => /^brand-.*\.html$/.test(n))) {
    const html = readFileSync(join(dir, f), "utf8");
    const literal = [...html.matchAll(/font-family:\s*([^;"]*"[^"]+"[^;]*);/g)].map((m) => m[1]);
    if (literal.length) out.fail(`品牌 ${f} 写死了字体名（要用 var(--vd-*)）：${literal.join("；")}`);
  }
}

function checkConfigs(p, out) {
  for (const [file, paths] of Object.entries(CONFIG_PATHS)) {
    const f = join(p.root, file);
    if (!existsSync(f)) { out.warn(`没有 ${file}（这个 skill 会用默认值）`); continue; }
    let cfg;
    try { cfg = JSON.parse(readFileSync(f, "utf8")); } catch (e) { out.fail(`${file} 不是合法 JSON：${e.message}`); continue; }
    const missing = paths.filter((k) => get(cfg, k) && !existsSync(resolve(p.root, get(cfg, k)))).map((k) => `${k}=${get(cfg, k)}`);
    if (missing.length) out.fail(`${file} 里的路径不存在：${missing.join("；")}`);
    else out.ok(file);
  }
  // 只看在不在，不读内容（里面是密钥）
  if (existsSync(join(p.root, ".env"))) out.ok(".env");
  else out.warn("没有 .env：配音（nv voice / hf-audio）要用 DASHSCOPE_API_KEY 等密钥，复制 .env.example 为 .env 再填");
  const bd = join(p.root, "browser-draft.config.json");
  if (existsSync(bd)) {
    try {
      const port = JSON.parse(readFileSync(bd, "utf8")).cdpPort;
      if (port !== undefined && !Number.isInteger(port)) out.fail(`browser-draft.config.json 的 cdpPort 要是数字：${port}`);
    } catch { /* 上面已报 */ }
  }
}

function checkToolkit(out, home = homedir()) {
  out.ok(`工具包：${TOOLKIT_DIR}`);
  const skills = toolkitSkills();
  const missing = [], elsewhere = [];
  for (const [cmd, skill] of Object.entries(COMMANDS)) {
    const at = which(cmd);
    if (!at) missing.push(cmd);
    else if (!inside(real(at), join(TOOLKIT_DIR, skill))) elsewhere.push(`${cmd} → ${real(at)}`);
  }
  if (missing.length) out.fail(`命令不在 PATH 上：${missing.join("、")}（在工具包里跑 st install）`);
  if (elsewhere.length) out.warn(`命令指向别的工具包（st install 改回这个）：\n      ${elsewhere.join("\n      ")}`);
  const unregistered = [], linkedElsewhere = [];
  for (const s of skills) {
    const link = join(home, ".claude/skills", s);
    let isLink = false;
    try { isLink = lstatSync(link).isSymbolicLink(); } catch { /* 不存在 */ }
    if (!isLink && !existsSync(link)) unregistered.push(s);
    else if (!isLink || real(link) !== real(join(TOOLKIT_DIR, s))) linkedElsewhere.push(`${s} → ${isLink ? readlinkSync(link) : "（不是软链接）"}`);
  }
  if (unregistered.length) out.warn(`Claude 还没注册的 skill：${unregistered.join("、")}（st install）`);
  if (linkedElsewhere.length) out.warn(`~/.claude/skills 里指向别处的：\n      ${linkedElsewhere.join("\n      ")}`);
  if (!missing.length && !elsewhere.length && !unregistered.length && !linkedElsewhere.length) out.ok(`${skills.length} 个 skill 和命令都指向这个工具包`);
}

function checkDeps(out) {
  for (const s of toolkitSkills()) {
    const dir = join(TOOLKIT_DIR, s);
    const pkg = join(dir, "package.json");
    if (existsSync(pkg)) {
      const j = JSON.parse(readFileSync(pkg, "utf8"));
      const n = Object.keys({ ...j.dependencies, ...j.devDependencies }).length;
      if (n && !existsSync(join(dir, "node_modules"))) out.fail(`${s} 没装 Node 依赖：cd ${dir} && npm ci`);
    }
    if (existsSync(join(dir, "requirements.txt")) && !existsSync(join(dir, ".venv"))) out.fail(`${s} 没装 Python 依赖：见 ${s}/SKILL.md`);
  }
  if (!existsSync(join(TOOLKIT_DIR, "narrated-video/.venv"))) out.warn("narrated-video 没有 .venv（TTS、字体子集要用）：见 narrated-video/references/setup.md");
  const vendor = join(TOOLKIT_DIR, "phone-draft/vendor");
  if (!existsSync(vendor) || !readdirSync(vendor).some((n) => n.startsWith("scrcpy"))) out.warn("phone-draft 没有 scrcpy（只影响手机录实测）：phone-draft/scripts/setup-scrcpy.sh");
  for (const [cmd, use, required] of EXTERNAL) {
    if (which(cmd)) continue;
    (required ? out.fail : out.warn)(`缺外部程序 ${cmd}（${use}）`);
  }
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 22) out.fail(`Node ${process.versions.node}，要 22 以上`);
}

function checkOnline(p, out) {
  const r = spawnSync("bd", ["tabs"], { cwd: p.root, encoding: "utf8", timeout: 30000 });
  if (r.status === 0) out.ok(`浏览器连得上（bd tabs 列出 ${r.stdout.trim().split("\n").filter(Boolean).length} 个标签页）`);
  else out.fail(`浏览器连不上：${(r.stderr || r.stdout).trim().split("\n").pop()}`);
}

export function doctor({ cwd = process.cwd(), online = false, log = console.log } = {}) {
  let fails = 0, warns = 0;
  const out = {
    ok: (m) => log(`  ✓ ${m}`),
    warn: (m) => { warns++; log(`  ⚠ ${m}`); },
    fail: (m) => { fails++; log(`  ✗ ${m}`); },
  };
  const section = (title, fn) => { log(`\n${title}`); fn(); };
  let project = null;
  section("作品项目", () => {
    try { project = loadProject(cwd); } catch (e) { return out.fail(e.message); }
    checkProject(project, out);
  });
  if (project) {
    section("模板", () => checkTemplates(project, out));
    section("品牌", () => checkBrand(project, out));
    section("skill 配置", () => checkConfigs(project, out));
  }
  section("工具包", () => checkToolkit(out));
  section("依赖", () => checkDeps(out));
  if (online && project) section("联网检查", () => checkOnline(project, out));
  log(`\n${fails ? `✗ ${fails} 项要修` : "✓ 没有要修的"}${warns ? `，⚠ ${warns} 项提醒` : ""}${online ? "" : "（加 --online 再查浏览器能不能连上）"}`);
  return fails ? 1 : 0;
}
