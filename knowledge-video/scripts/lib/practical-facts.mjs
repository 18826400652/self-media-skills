// 从作品目录读出实用类 14 步的事实，交给 practical.mjs 判断。
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { isScriptFilled } from "./status.mjs";

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

// 正式成片：renders/ 里的 mp4，不算「预览-…」之类的压缩预览
const RENDER_RE = /^(?!预览).*\.mp4$/;

export const GATE_FILES = {
  topic: () => ["选题关.md"],
  script: () => ["抖音/SCRIPT.md", "抖音/VOICE.md"],
  storyboard: () => ["抖音/STORYBOARD.md", "抖音/audio_meta.json"],
  final: (dir) => {
    const mp4 = latest(dir, "抖音/renders", RENDER_RE);
    return mp4 ? [mp4.slice(dir.length + 1)] : [];
  },
};

export function fingerprint(dir, gate) {
  const h = createHash("sha256");
  for (const rel of GATE_FILES[gate](dir)) {
    const p = join(dir, rel);
    if (existsSync(p)) h.update(rel).update(readFileSync(p));
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
  const mp4 = latest(dir, "抖音/renders", RENDER_RE);
  let qa = null;
  try { qa = JSON.parse(readFileSync(join(dir, "qa.json"), "utf8")); } catch { qa = null; }
  const render = !mp4 ? no("还没渲染") : mtime(mp4) < mtime(sheet) ? no("分镜改过，要重新 nv render")
    : !qa ? no("还没写 qa.json") : mtime(join(dir, "qa.json")) < mtime(mp4) ? no("渲染后还没重新 QA（重写 qa.json）")
      : qa.passed !== true ? no("qa.json 有没修的问题") : ok();
  return { script: s, storyboard: board, render };
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

function gateFacts(dir, run) {
  return Object.fromEntries(Object.keys(GATE_FILES).map((g) => {
    const r = run.gates?.[g] ?? {};
    const passed = r.passed === true;
    return [g, { passed, at: r.at ?? null, quote: r.quote ?? null, stale: passed && r.fingerprint !== fingerprint(dir, g) }];
  }));
}

export function collectPracticalFacts(dir, run, { runSc, runVoiceCheck, experienceDir }) {
  return {
    steps: {
      ...scSteps(dir, runSc),
      ...videoSteps(dir, run, runVoiceCheck),
      ...draftSteps(dir, run),
      record: recordStep(dir),
      retro: retroStep(dir, experienceDir),
    },
    gates: gateFacts(dir, run),
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
  };
}
