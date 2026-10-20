// 从作品目录读出实用类 16 步的事实，交给 practical.mjs 判断。
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { isScriptFilled } from "./status.mjs";
import { FINAL_RE } from "./video.mjs";

const DY = "抖音";

const SC_STEPS = { scenario: "场景卡.md", topic: "选题关.md", test: "实测记录.md", draft: "母稿.md", feynman: "费曼检查.md" };
const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const mtime = (p) => (existsSync(p) ? statSync(p).mtimeMs : 0);
const ok = () => ({ ok: true, why: "" });
const no = (why, extra = {}) => ({ ok: false, why, ...extra });

function latest(dir, sub, re) {
  const p = join(dir, sub);
  if (!existsSync(p)) return null;
  const files = readdirSync(p).filter((f) => re.test(f)).map((f) => join(p, f));
  return files.sort((a, b) => mtime(b) - mtime(a))[0] ?? null;
}

// 正式成片：renders/ 里最新的 mp4（FINAL_RE 不算压缩预览、风格样片、新旧对比）
const finalMp4 = (dir, sub) => {
  const mp4 = latest(dir, sub, FINAL_RE);
  return mp4 ? [mp4.slice(dir.length + 1)] : [];
};

// 每个确认节点看哪些文件：确认后这些文件变了，节点失效
// ① 和场景卡一起确认（谁、什么时候、遇到什么，和标题、开头三秒是一回事）
const GATE_FILES = {
  topic: () => ["场景卡.md", "选题关.md"],
  script: () => [`${DY}/SCRIPT.md`, `${DY}/VOICE.md`],
  director: () => [`${DY}/DIRECTOR.md`, `${DY}/audio_meta.json`],
  sample: () => [`${DY}/renders/sample.mp4`],
  final: (dir) => finalMp4(dir, `${DY}/renders`),
};

// DIRECTOR.md 第 8 节「组件候选」是交成片时才补的，改它不算改导演脚本
const CANDIDATES_RE = /^## 8\. 组件候选[\s\S]*?(?=^## |^```json vd|(?![\s\S]))/m;
const BLOCK_RE = /```json vd\s*\n([\s\S]*?)\n```/;

/**
 * DIRECTOR.md 去掉排版差别后的内容：③a 只在导演脚本的内容变了才失效。
 * 不算内容的：反引号、加粗 *、行内多余空白、空行、表格分隔行和对齐、机器块 JSON 的缩进
 */
export function normalizeDirector(md) {
  const block = md.match(BLOCK_RE);
  let json = "";
  if (block) {
    try { json = JSON.stringify(JSON.parse(block[1])); } catch { json = block[1].replace(/\s+/g, ""); }
  }
  const prose = md.replace(BLOCK_RE, "").replace(CANDIDATES_RE, "").split("\n")
    .map((l) => l.replace(/[`*]/g, "").replace(/\s*\|\s*/g, "|").replace(/\s+/g, " ").trim())
    .filter((l) => l && !/^\|?[\s:|-]+\|?$/.test(l));
  return `${prose.join("\n")}\n${json}`;
}

const content = (rel, p) => (rel.endsWith("DIRECTOR.md") ? normalizeDirector(readFileSync(p, "utf8")) : readFileSync(p));
// 旧版指纹（按原文算）：老 run.json 里记的是这个，照样认
const rawContent = (rel, p) => (rel.endsWith("DIRECTOR.md") ? readFileSync(p, "utf8").replace(CANDIDATES_RE, "") : readFileSync(p));

// 场景卡并进 ① 之前记的指纹只算选题关：老记录照样认
const LEGACY_GATE_FILES = { topic: () => ["选题关.md"] };

function hashFiles(dir, gate, read, files = GATE_FILES) {
  const h = createHash("sha256");
  for (const rel of files[gate](dir)) {
    const p = join(dir, rel);
    if (existsSync(p)) h.update(rel).update(read(rel, p));
  }
  return h.digest("hex");
}

export const fingerprint = (dir, gate) => hashFiles(dir, gate, content);
export const legacyFingerprint = (dir, gate) => hashFiles(dir, gate, rawContent);
/** 老版本记过的指纹：按原文算的（DIRECTOR.md 归一化之前）、① 只算选题关的 */
const legacyFingerprints = (dir, gate) => [
  legacyFingerprint(dir, gate),
  ...(LEGACY_GATE_FILES[gate] ? [hashFiles(dir, gate, content, LEGACY_GATE_FILES)] : []),
];

/** 每个文件单独的指纹（kv gate 时记下，失效时说出改了哪个文件） */
export function gateFileHashes(dir, gate) {
  return Object.fromEntries(GATE_FILES[gate](dir).filter((rel) => existsSync(join(dir, rel))).map((rel) => [rel, sha(content(rel, join(dir, rel)))]));
}

export function templateHashes(dir, files) {
  return Object.fromEntries(files.filter((f) => existsSync(join(dir, f))).map((f) => [f, sha(readFileSync(join(dir, f)))]));
}

/** 文件存在且不是新建作品时的空模板 */
function written(dir, rel, templates) {
  const p = join(dir, rel);
  if (!existsSync(p)) return false;
  return templates?.[rel] ? sha(readFileSync(p)) !== templates[rel] : true;
}

/** out/ 里最新的 NN.png 比源文件新 */
function rendered(dir, srcRel, outSub) {
  const png = latest(dir, outSub, /^\d{2}\.png$/);
  return !!png && mtime(png) >= mtime(join(dir, srcRel));
}

function scSteps(dir, runSc) {
  const res = runSc(dir);
  if (res.error) return Object.fromEntries([...Object.keys(SC_STEPS), "selfcheck"].map((k) => [k, no(`sc check 跑不起来：${res.error}`)]));
  const fails = res.items.filter((i) => i.level === "✗" && i.code !== "topic-unconfirmed");
  const out = {};
  for (const [key, file] of Object.entries(SC_STEPS)) {
    const mine = fails.filter((i) => i.file === file);
    out[key] = mine.length ? no(mine.map((i) => i.msg).join("；")) : ok();
  }
  if (out.test.ok && !latest(dir, "实测", /\.mp4$/)) out.test = no("实测/ 里没有录屏 mp4（sc rec）");
  // 第 6 步只管内容阶段（第 1–5 步的文件和全局项）；平台文件的 ✗ 到各自那一步再拦
  const own = fails.filter((i) => !platformStep(i.file));
  out.selfcheck = own.length ? no(`sc check 还有 ${own.length} 项 ✗：${own.map((i) => i.msg).join("；")}`) : ok();
  out.platform = {};
  for (const i of fails) {
    const k = platformStep(i.file);
    if (k) out.platform[k] = [...(out.platform[k] ?? []), i.msg];
  }
  return out;
}

/** 平台文件归到哪一步：抖音脚本 → 第 7 步，公众号 / 小红书 / 抖音发布文案和封面 → 各自存草稿那一步 */
export function platformStep(file) {
  if (!file) return null;
  if (file === "抖音/SCRIPT.md" || file === "抖音/VOICE.md") return "script";
  if (file.startsWith("公众号/")) return "wechat";
  if (file.startsWith("小红书/")) return "xiaohongshu";
  if (file.startsWith("抖音/")) return "douyin";
  return null;
}

// knowledge-video/references/qa.md 规定的检查项：checked 必须全部写上
export const QA_CHECKS = ["safe-area", "text-size", "density", "typo", "fact-on-screen", "rhythm", "motion"];

/** qa.json 不合格的原因；合格返回 null */
export function qaProblem(qa) {
  const missing = QA_CHECKS.filter((c) => !(qa.checked ?? []).includes(c));
  if (missing.length) return `qa.json 的 checked 少了：${missing.join("、")}（见 knowledge-video references/qa.md）`;
  if (qa.passed !== true) return "qa.json 有没修的问题";
  if ((qa.issues ?? []).some((i) => i.severity === "high")) return "qa.json 写了通过，但还有 high 级问题（high 必须修好才能通过）";
  return null;
}

function scriptStep(dir, run, runVoiceCheck) {
  const script = join(dir, `${DY}/SCRIPT.md`);
  if (!written(dir, `${DY}/SCRIPT.md`, run.templates) || !isScriptFilled(readFileSync(script, "utf8"))) return no(`${DY}/SCRIPT.md 还是空模板`);
  const v = runVoiceCheck(join(dir, DY));
  return v.ok ? ok() : no(v.msg);
}

/** 工程里最新的 HTML（index.html + compositions/ 下所有 .html）的修改时间 */
export function newestHtml(root) {
  let t = mtime(join(root, "index.html"));
  const walk = (d) => {
    if (!existsSync(d)) return;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(d, e.name));
      else if (e.name.endsWith(".html")) t = Math.max(t, mtime(join(d, e.name)));
    }
  };
  walk(join(root, "compositions"));
  return t;
}

function readJsonOrNull(p) {
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; }
}

/** vd build 要读的配音产物：caption_groups.json 和 audio_meta.json 引用的每个音频 */
function missingVoiceFiles(root) {
  if (!existsSync(join(root, "caption_groups.json"))) return no(`${DY}/ 里没有 caption_groups.json（vo ${DY} 会一起生成）`);
  const voices = readJsonOrNull(join(root, "audio_meta.json"))?.voices ?? [];
  const missing = voices.map((v) => v.path).filter((p) => p && !existsSync(join(root, p)));
  return missing.length ? no(`${DY}/ 里缺配音文件：${missing.join("、")}（重跑 vo ${DY}）`) : ok();
}

function directorSteps(dir, runVdCues) {
  const root = join(dir, DY);
  const md = join(root, "DIRECTOR.md");
  let director = !existsSync(join(root, "audio_meta.json")) ? no(`还没配音（vo ${DY}）`)
    : !existsSync(md) ? no(`还没有 ${DY}/DIRECTOR.md（vd init 会放模板）`)
    : missingVoiceFiles(root);
  if (director.ok) {
    const v = runVdCues(root);
    if (!v.ok) director = no(v.msg);
  }
  const sampleMp4 = join(root, "renders/sample.mp4");
  // 样片不跟 DIRECTOR.md 比时间：导演脚本改了 ③a 会失效，重新确认时再决定要不要重出样片
  const sampleQa = readJsonOrNull(join(root, "qa-douyin-sample.json"));
  const sample = !existsSync(sampleMp4) ? no(`还没有 ${DY}/renders/sample.mp4`)
    : !sampleQa ? no("样片还没跑 vd qa（vd build --sample 之后 vd qa）")
    : sampleQa.passed !== true ? no("样片 vd qa 还有 ✗") : ok();
  const mp4 = latest(dir, `${DY}/renders`, FINAL_RE);
  const vdQaPath = join(root, "qa-douyin.json");
  const vdQa = readJsonOrNull(vdQaPath);
  const qaPath = join(dir, "qa.json");
  const qa = readJsonOrNull(qaPath);
  const render = !mp4 ? no(`还没渲染（vd render ${DY}）`)
    : mtime(mp4) < newestHtml(root) ? no("画面改过，要重新渲染")
    : !vdQa ? no("还没跑 vd qa")
    : vdQa.passed !== true ? no("vd qa 还有 ✗")
    : mtime(vdQaPath) < newestHtml(root) ? no("画面改过，要重跑 vd qa")
    : !qa ? no("还没写 qa.json") : mtime(qaPath) < mtime(mp4) ? no("渲染后还没重新 QA：qa.json 比成片旧（成片是写 qa.json 之后渲染的），看过新成片再更新 qa.json")
      : qaProblem(qa) ? no(qaProblem(qa)) : ok();
  return { director, sample, render };
}

function draftSteps(dir, run) {
  const t = run.templates;
  const step = (key, contentWhy) => contentWhy ? no(contentWhy, { content: false }) : run.done?.[key] ? ok() : no("还没存草稿", { content: true });
  return {
    wechat: step("wechat", !written(dir, "公众号/文章.md", t) && "公众号/文章.md 还是空模板"),
    xiaohongshu: step("xiaohongshu", !written(dir, "小红书/文案.md", t) && "小红书/文案.md 还是空模板"),
    douyin: step("douyin",
      !written(dir, "抖音/发布文案.md", t) ? "抖音/发布文案.md 还是空模板"
        : !rendered(dir, "抖音/封面.md", "抖音/out") && "抖音封面还没出图（ic render 抖音/封面.md）"),
  };
}

function recordStep(dir) {
  const p = join(dir, "发布记录.md");
  if (!existsSync(p)) return no("没有 发布记录.md");
  const body = readFileSync(p, "utf8").match(/### 置顶评论[^\n]*\n+```[^\n]*\n([\s\S]*?)```/)?.[1]?.trim() ?? "";
  return body && !body.startsWith("（") ? ok() : no("置顶评论原文还没填");
}

/** 镜头候选台账（video-director 写的）里 queued、且出现过这期的候选名；台账路径可在 video-director.config.json 的 shotLedger 里改 */
export function shotQueue(root, dir) {
  const cfg = join(root, "video-director.config.json");
  const rel = (existsSync(cfg) && JSON.parse(readFileSync(cfg, "utf8")).shotLedger) || "00-规划/镜头候选.json";
  const p = join(root, rel);
  if (!existsSync(p)) return [];
  const work = relative(root, dir);
  return (JSON.parse(readFileSync(p, "utf8")).items ?? []).filter((x) => x.status === "queued" && x.episodes?.some((e) => e.work === work)).map((x) => x.name);
}

const shortName = (dir) => basename(dir).replace(/^\d+-/, "");
const squash = (t) => t.replace(/\s+/g, "");

/** 选题清单「已做」一节（没有这个标题就看全文）里出现了这期简称，空格不算 */
function topicsStep(dir, topicList) {
  if (!existsSync(topicList)) return no(`没有 ${topicList}（路径在 knowledge-video.config.json 的 topicList 里改）`);
  const md = readFileSync(topicList, "utf8");
  const done = md.match(/^##\s*已做[^\n]*\n([\s\S]*?)(?=^##\s|(?![\s\S]))/m)?.[1] ?? md;
  const name = shortName(dir);
  return squash(done).includes(squash(name)) ? ok() : no(`选题清单「已做」里还没有「${name}」`);
}

function retroStep(dir, experienceDir) {
  const name = shortName(dir);
  const hit = existsSync(experienceDir) && readdirSync(experienceDir).some((f) => f.includes(name));
  return hit ? ok() : no(`经验库里还没有文件名带「${name}」的记录`);
}

function gateFacts(dir, run) {
  return Object.fromEntries(Object.keys(GATE_FILES).map((g) => {
    const r = run.gates?.[g] ?? {};
    const passed = r.passed === true;
    const stale = passed && r.fingerprint !== fingerprint(dir, g) && !legacyFingerprints(dir, g).includes(r.fingerprint);
    const now = stale && r.files ? gateFileHashes(dir, g) : null;
    const changed = now ? [...new Set([...Object.keys(r.files), ...Object.keys(now)])].filter((f) => r.files[f] !== now[f]) : [];
    return [g, { passed, at: r.at ?? null, quote: r.quote ?? null, stale, changed }];
  }));
}

export function collectPracticalFacts(dir, run, { runSc, runVoiceCheck, runVdCues, experienceDir, topicList }) {
  const { platform, ...sc } = scSteps(dir, runSc);
  const steps = {
    ...sc,
    script: scriptStep(dir, run, runVoiceCheck),
    ...directorSteps(dir, runVdCues),
    ...draftSteps(dir, run),
    topics: topicsStep(dir, topicList),
    record: recordStep(dir),
    retro: retroStep(dir, experienceDir),
  };
  for (const [k, msgs] of Object.entries(platform ?? {})) {
    if (steps[k]?.ok || steps[k]?.content === true) steps[k] = no(`sc check：${msgs.join("；")}`, k === "script" ? {} : { content: false });
  }
  return { steps, gates: gateFacts(dir, run) };
}

function runCmd(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (r.error) return { error: r.error.code === "ENOENT" ? `找不到 ${cmd} 命令` : r.error.message };
  return { status: r.status, out: r.stdout, err: r.stderr };
}

export function defaultRunners() {
  const sc = process.env.KV_SC_CMD || "sc";
  const vo = process.env.KV_VO_CMD || "vo";
  const vd = process.env.KV_VD_CMD || "vd";
  return {
    runSc: (dir) => {
      const r = runCmd(sc, ["check", dir, "--json"]);
      if (r.error) return r;
      try {
        return { items: JSON.parse(r.out).items };
      } catch {
        return { error: (r.err || r.out).trim().slice(-300) || "输出不是 JSON" };
      }
    },
    runVoiceCheck: (douyinDir) => {
      const r = runCmd(vo, [douyinDir, "--check"]);
      if (r.error) return { ok: false, msg: r.error };
      return r.status === 0 ? { ok: true, msg: "" } : { ok: false, msg: (r.err || r.out).trim().slice(-300) };
    },
    runVdCues: (douyinDir) => {
      const r = runCmd(vd, ["cues", douyinDir, "--check"]);
      if (r.error) return { ok: false, msg: r.error };
      return r.status === 0 ? { ok: true, msg: "" } : { ok: false, msg: (r.err || r.out).trim().slice(-300) };
    },
  };
}
