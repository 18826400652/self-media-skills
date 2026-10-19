// dykit 组件：按锁定的提交号从 GitHub 下载 hyperframes 仓库，按 registry 清单把组件装进工程
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { run } from "./run.mjs";

export const REPO = "18826400652/hyperframes";
const LOCK = "components.lock.json";
const SHA_RE = /^[0-9a-f]{40}$/;

function parseSha(stdout) {
  try {
    return JSON.parse(stdout).sha;
  } catch {
    return null;
  }
}

/** GitHub main 分支的最新提交号（走 curl，自动用系统代理） */
export function latestSha(runFn = run) {
  const url = `https://api.github.com/repos/${REPO}/commits/main`;
  const r = runFn("curl", ["-fsSL", "--max-time", "30", url]);
  const sha = r.status === 0 ? parseSha(r.stdout) : null;
  if (!SHA_RE.test(sha ?? "")) throw new Error(`取不到 ${REPO} 的最新提交号（${url}）：检查网络和代理。${(r.stderr || "").trim()}`);
  return sha;
}

export function readLock(dir) {
  const p = join(dir, LOCK);
  if (!existsSync(p)) return null;
  let lock;
  try {
    lock = JSON.parse(readFileSync(p, "utf8"));
  } catch (err) {
    throw new Error(`${LOCK} 不是合法的 JSON（${err.message}）：删掉这个文件重新构建会锁定到最新版`);
  }
  if (!SHA_RE.test(lock.sha ?? "")) throw new Error(`${LOCK} 里的 sha 不是 40 位提交号：${lock.sha}。删掉这个文件重新构建会锁定到最新版`);
  return lock;
}

export function writeLock(dir, sha) {
  writeFileSync(join(dir, LOCK), JSON.stringify({ repo: REPO, sha }, null, 2) + "\n");
}

/**
 * 这个工程要用的提交号：有锁文件就用它（不联网）；没有或 update 时取最新。
 * 不写文件——下载、安装都成功后由调用方 writeLock，失败时旧锁和旧缓存照常能用。
 */
export function ensureLock(dir, { update = false } = {}, runFn = run) {
  const lock = readLock(dir);
  if (lock && !update) return { sha: lock.sha, changed: false };
  const sha = latestSha(runFn);
  return { sha, changed: sha !== lock?.sha };
}

/** 本地组件库（磨组件时用）：校验目录里有 registry/registry.json，原样返回 */
export function localArchive(dir) {
  if (!existsSync(join(dir, "registry/registry.json"))) throw new Error(`本地组件库 ${dir} 里没有 registry/registry.json：VD_DYKIT_DIR 或配置 dykitDir 要指向 hyperframes 仓库根目录`);
  return dir;
}

/** 下载并解包到 cacheRoot/<sha>；先解到临时目录，成功后再改名，失败不留半截 */
export function fetchArchive(sha, cacheRoot, runFn = run) {
  const dest = join(cacheRoot, sha);
  if (existsSync(join(dest, "registry/registry.json"))) return dest;
  mkdirSync(cacheRoot, { recursive: true });
  const tmp = mkdtempSync(join(cacheRoot, ".tmp-"));
  const url = `https://codeload.github.com/${REPO}/tar.gz/${sha}`;
  try {
    const tgz = join(tmp, "repo.tgz");
    const dl = runFn("curl", ["-fsSL", "--max-time", "300", "-o", tgz, url]);
    if (dl.status !== 0) throw new Error(`下载组件库失败（${url}）：检查网络和代理。${(dl.stderr || "").trim()}`);
    mkdirSync(join(tmp, "repo"));
    const x = runFn("tar", ["-xzf", tgz, "-C", join(tmp, "repo"), "--strip-components=1"]);
    if (x.status !== 0) throw new Error(`解包组件库失败（${url}）：${(x.stderr || "").trim()}`);
    if (!existsSync(join(tmp, "repo/registry/registry.json"))) throw new Error(`下载的组件库里没有 registry/registry.json（${url}）`);
    try {
      renameSync(join(tmp, "repo"), dest);
    } catch (err) {
      // 另一个进程同时下载并先放好了：用它的，不删（它可能正在被读）
      if (!existsSync(join(dest, "registry/registry.json"))) throw err;
    }
    return dest;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

function readItem(archiveDir, name) {
  const p = join(archiveDir, "registry/blocks", name, "registry-item.json");
  if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8"));
  const all = JSON.parse(readFileSync(join(archiveDir, "registry/registry.json"), "utf8")).items.map((i) => i.name);
  const near = all.map((n) => [distance(n, name), n]).sort((a, b) => a[0] - b[0]).slice(0, 3).map((x) => x[1]);
  throw new Error(`组件库里没有 ${name}。相近的：${near.join("、")}（全部组件见仓库的 catalog/catalog.json）`);
}

/** 把组件（连同 registryDependencies，如 dykit 资源包）复制进工程；返回写入的相对路径 */
export function installComponent(archiveDir, name, projectDir, seen = new Set()) {
  if (seen.has(name)) return [];
  seen.add(name);
  const item = readItem(archiveDir, name);
  const deps = (item.registryDependencies ?? []).flatMap((dep) => installComponent(archiveDir, dep, projectDir, seen));
  const own = item.files.map((f) => {
    // 有 url 的文件引用仓库里的原路径（dykit 资源包），没有的放在 registry/blocks/<name>/ 下
    const src = f.url ? join(archiveDir, f.path) : join(archiveDir, "registry/blocks", name, f.path);
    if (!existsSync(src)) throw new Error(`组件 ${name} 缺文件 ${f.path}（缓存可能不完整：删掉 ${archiveDir} 重新构建）`);
    const dst = resolve(projectDir, f.target);
    if (!dst.startsWith(resolve(projectDir) + sep)) throw new Error(`组件 ${name} 的目标路径不在工程里：${f.target}`);
    mkdirSync(dirname(dst), { recursive: true });
    cpSync(src, dst);
    return f.target;
  });
  return [...deps, ...own];
}

/** 段比组件建议时长长出这么多秒以上，时间写死的组件就会演完退场、剩下空屏 */
export const FIT_SLACK = 2;

/** 组件撑不撑得满这一段：组件按宿主时长（HF.duration）排时间的总能撑满；时间写死的只演 minDuration 秒左右 */
export function fitProblem({ name, html, minDuration, segId, segDuration }) {
  if (/HF\.duration\(/.test(html)) return null;
  if (!(segDuration > minDuration + FIT_SLACK)) return null;
  return `${segId} 用了 ${name}：这个组件的动画时间是写死的，只演约 ${minDuration} 秒就退场，这段有 ${segDuration} 秒，后面会空屏。把这段拆短（只放一两句），或改成手画`;
}

/** 录屏比段短多少秒以内不提醒（录屏结尾和段尾差一点看不出来） */
export const REC_SLACK = 0.5;

/** dy-rec-phone 的录屏比这一段短：新版组件放完停在最后一帧，旧版后面是空手机 */
export function recordingProblem({ segId, src, recLen, segDuration, html }) {
  if (!(recLen > 0)) return `${segId} 的录屏 ${src} 读不到时长：路径对不对（相对视频工程目录）？`;
  if (!(segDuration - recLen > REC_SLACK)) return null;
  const gap = (segDuration - recLen).toFixed(1);
  const head = `${segId} 的录屏 ${src} 只有 ${recLen.toFixed(1)} 秒，这段有 ${segDuration.toFixed(1)} 秒`;
  if (!/\["data-duration"/.test(html)) return `${head}：组件库是旧版，后 ${gap} 秒手机里是空的。vd build . --update-components 换新版（放完停在最后一帧），或换长一点的录屏、把这段拆短`;
  return `${head}：后 ${gap} 秒停在录屏最后一帧。要画面一直在动，就换长一点的录屏或把这段拆短`;
}

/** 读组件的 HTML 和组件库目录里的建议时长 */
export function componentInfo(archiveDir, name, projectDir) {
  const html = readFileSync(join(projectDir, "compositions", `${name}.html`), "utf8");
  const catalog = JSON.parse(readFileSync(join(archiveDir, "catalog/catalog.json"), "utf8"));
  const minDuration = catalog.components.find((c) => c.id === name)?.minDuration ?? 0;
  return { html, minDuration };
}

/** 组件库目录里某个组件的条目；没有这个组件或还没生成 catalog（本地磨组件时）返回 null */
export function catalogEntry(archiveDir, name) {
  const p = join(archiveDir, "catalog/catalog.json");
  if (!existsSync(p)) return null;
  const catalog = JSON.parse(readFileSync(p, "utf8"));
  return catalog.components.find((c) => c.id === name) ?? null;
}

/** 组件目录（catalog/catalog.json）→ 给人和 Claude 看的列表；query 按名字、用途、适合场景筛 */
export function catalogText(catalog, query = "") {
  const q = query.trim().toLowerCase();
  const hit = (c) => !q || [c.id, c.purpose, c.suitableFor].some((s) => String(s ?? "").toLowerCase().includes(q));
  const list = (catalog.components ?? []).filter(hit);
  if (!list.length) return `没有和「${query}」相关的组件（不带关键词看全部）`;
  return list.map((c) => {
    const meta = [c.suitableFor && `适合：${c.suitableFor}`, c.minDuration && `至少 ${c.minDuration} 秒`, c.beats?.length && `节拍：${c.beats.join("；")}`].filter(Boolean).join("；");
    const vars = (c.variables ?? []).map((v) => `    ${v.id} ${v.label ?? ""} = ${JSON.stringify(v.default ?? "")}`);
    return [`${c.id}（${c.kind ?? "?"}）：${c.purpose ?? ""}`, ...(meta ? [`  ${meta}`] : []), ...(vars.length ? ["  变量：", ...vars] : [])].join("\n");
  }).join("\n\n");
}

/** 文本变量超过镜头声明的 maxChars：去掉 HTML 后按字算，| 隔开的每项分别算 */
export function textProblems({ segId, vars = {}, catalogEntry }) {
  const out = [];
  for (const v of catalogEntry?.variables ?? []) {
    if (!(v.maxChars > 0) || typeof vars[v.id] !== "string") continue;
    const longest = Math.max(...vars[v.id].split("|").map((x) => [...x.replace(/<[^>]*>/g, "").trim()].length));
    if (longest > v.maxChars) out.push(`${segId} 的 ${v.id} 有 ${longest} 字，这个镜头最多 ${v.maxChars} 字：删字或拆段`);
  }
  return out;
}
