// 从作品目录读出实用类 14 步的事实，交给 practical.mjs 判断。
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { isScriptFilled } from "./status.mjs";
import { DIRECTOR_DIR, FINAL_RE, videoMode } from "./video.mjs";

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
const GATE_FILES = {
  template: {
    topic: () => ["选题关.md"],
    script: () => ["抖音/SCRIPT.md", "抖音/VOICE.md"],
    storyboard: () => ["抖音/STORYBOARD.md", "抖音/audio_meta.json"],
    final: (dir) => finalMp4(dir, "抖音/renders"),
  },
  director: {
    topic: () => ["选题关.md"],
    script: () => ["抖音/SCRIPT.md", "抖音/VOICE.md"],
    director: () => [`${DIRECTOR_DIR}/DIRECTOR.md`, "抖音/audio_meta.json"],
    sample: () => [`${DIRECTOR_DIR}/renders/sample.mp4`],
    final: (dir) => finalMp4(dir, `${DIRECTOR_DIR}/renders`),
  },
};

// DIRECTOR.md 第 8 节「组件候选」是交成片时才补的，改它不算改导演脚本
const CANDIDATES_RE = /^## 8\. 组件候选[\s\S]*?(?=^## |^```json vd|(?![\s\S]))/m;
const content = (rel, p) => (rel.endsWith("DIRECTOR.md") ? readFileSync(p, "utf8").replace(CANDIDATES_RE, "") : readFileSync(p));

export function fingerprint(dir, gate, video = "template") {
  const h = createHash("sha256");
  for (const rel of GATE_FILES[video][gate](dir)) {
    const p = join(dir, rel);
    if (existsSync(p)) h.update(rel).update(content(rel, p));
  }
  return h.digest("hex");
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
  if (out.test.ok && !latest(dir, "实测", /\.mp4$/)) out.test = no("实测/ 里没有录屏 mp4（nv rec）");
  out.selfcheck = fails.length ? no(`sc check 还有 ${fails.length} 项 ✗`) : ok();
  return out;
}

function videoSteps(dir, run, runVoiceCheck) {
  const script = join(dir, "抖音/SCRIPT.md");
  let s = written(dir, "抖音/SCRIPT.md", run.templates) && isScriptFilled(readFileSync(script, "utf8")) ? ok() : no("抖音/SCRIPT.md 还是空模板");
  if (s.ok) {
    const v = runVoiceCheck(join(dir, "抖音"));
    if (!v.ok) s = no(v.msg);
  }
  const sb = join(dir, "抖音/STORYBOARD.md");
  const sheet = join(dir, "抖音/snapshots/sheet.jpg");
  const board = !existsSync(join(dir, "抖音/audio_meta.json")) ? no("还没配音（nv hf-audio）")
    : !written(dir, "抖音/STORYBOARD.md", run.templates) ? no("STORYBOARD.md 还是空模板")
    : !existsSync(sheet) ? no("还没有 snapshots/sheet.jpg")
    : mtime(sheet) < Math.max(mtime(sb), mtime(join(dir, "抖音/audio_meta.json"))) ? no("STORYBOARD 或配音改过，要重新 nv hf-build --snap") : ok();
  const mp4 = latest(dir, "抖音/renders", FINAL_RE);
  let qa = null;
  try { qa = JSON.parse(readFileSync(join(dir, "qa.json"), "utf8")); } catch { qa = null; }
  const render = !mp4 ? no("还没渲染") : mtime(mp4) < mtime(sheet) ? no("分镜改过，要重新 nv render")
    : !qa ? no("还没写 qa.json") : mtime(join(dir, "qa.json")) < mtime(mp4) ? no("渲染后还没重新 QA（重写 qa.json）")
      : qa.passed !== true ? no("qa.json 有没修的问题") : ok();
  return { script: s, storyboard: board, render };
}

/** 工程里最新的 HTML（index.html + compositions/ 下所有 .html）的修改时间 */
function newestHtml(root) {
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

function directorSteps(dir, runVdCues) {
  const root = join(dir, DIRECTOR_DIR);
  const md = join(root, "DIRECTOR.md");
  const voice = join(dir, "抖音/audio_meta.json");
  let director = !existsSync(voice) ? no("还没配音（nv hf-audio 抖音）")
    : !existsSync(md) ? no(`还没有 ${DIRECTOR_DIR}/DIRECTOR.md`)
    : mtime(join(root, "audio_meta.json")) < mtime(voice) ? no(`抖音/ 重新配过音，把 audio_meta.json、caption_groups.json、assets/voice/ 复制到 ${DIRECTOR_DIR}/`)
    : ok();
  if (director.ok) {
    const v = runVdCues(root);
    if (!v.ok) director = no(v.msg);
  }
  const sampleMp4 = join(root, "renders/sample.mp4");
  // 样片不跟 DIRECTOR.md 比时间：导演脚本改了 ③a 会失效，重新确认时再决定要不要重出样片
  const sample = existsSync(sampleMp4) ? ok() : no(`还没有 ${DIRECTOR_DIR}/renders/sample.mp4`);
  const mp4 = latest(dir, `${DIRECTOR_DIR}/renders`, FINAL_RE);
  const vdQaPath = join(root, "qa-douyin.json");
  const vdQa = readJsonOrNull(vdQaPath);
  const qaPath = join(dir, "qa.json");
  const qa = readJsonOrNull(qaPath);
  const render = !mp4 ? no(`还没渲染（nv render ${DIRECTOR_DIR}）`)
    : mtime(mp4) < newestHtml(root) ? no("画面改过，要重新渲染")
    : !vdQa ? no("还没跑 vd qa")
    : vdQa.passed !== true ? no("vd qa 还有 ✗")
    : mtime(vdQaPath) < newestHtml(root) ? no("画面改过，要重跑 vd qa")
    : !qa ? no("还没写 qa.json") : mtime(qaPath) < mtime(mp4) ? no("渲染后还没重新 QA（重写 qa.json）")
      : qa.passed !== true ? no("qa.json 有没修的问题") : ok();
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

function retroStep(dir, experienceDir) {
  const name = basename(dir).replace(/^\d+-/, "");
  const hit = existsSync(experienceDir) && readdirSync(experienceDir).some((f) => f.includes(name));
  return hit ? ok() : no(`经验库里还没有文件名带「${name}」的记录`);
}

function gateFacts(dir, run, video) {
  return Object.fromEntries(Object.keys(GATE_FILES[video]).map((g) => {
    const r = run.gates?.[g] ?? {};
    const passed = r.passed === true;
    return [g, { passed, at: r.at ?? null, quote: r.quote ?? null, stale: passed && r.fingerprint !== fingerprint(dir, g, video) }];
  }));
}

export function collectPracticalFacts(dir, run, { runSc, runVoiceCheck, runVdCues, experienceDir }) {
  const video = videoMode(run);
  const v = videoSteps(dir, run, runVoiceCheck);
  return {
    video,
    steps: {
      ...scSteps(dir, runSc),
      ...(video === "director" ? { script: v.script, ...directorSteps(dir, runVdCues) } : v),
      ...draftSteps(dir, run),
      record: recordStep(dir),
      retro: retroStep(dir, experienceDir),
    },
    gates: gateFacts(dir, run, video),
  };
}

function runCmd(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (r.error) return { error: r.error.code === "ENOENT" ? `找不到 ${cmd} 命令` : r.error.message };
  return { status: r.status, out: r.stdout, err: r.stderr };
}

export function defaultRunners() {
  const sc = process.env.KV_SC_CMD || "sc";
  const nv = process.env.KV_NV_CMD || "nv";
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
      const r = runCmd(nv, ["hf-audio", douyinDir, "--check"]);
      if (r.error) return { ok: false, msg: r.error };
      return r.status === 0 ? { ok: true, msg: "" } : { ok: false, msg: (r.err || r.out).trim().slice(-300) };
    },
    runVdCues: (directorDir) => {
      const r = runCmd(vd, ["cues", directorDir, "--check"]);
      if (r.error) return { ok: false, msg: r.error };
      return r.status === 0 ? { ok: true, msg: "" } : { ok: false, msg: (r.err || r.out).trim().slice(-300) };
    },
  };
}
