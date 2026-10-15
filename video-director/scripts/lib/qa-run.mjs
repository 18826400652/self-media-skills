// vd qa 的编排：按落定时刻取数 + 截图，按 0.5 秒网格取签名，交给 douyin-qa 判定
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cuesJs } from "./assemble.mjs";
import { checkCues, checkFrame, qaTimes, stillWindows, summarize } from "./douyin-qa.mjs";

/** 这次构建装了哪些段：index.html 里有 host-<段id> 的（样片只装几段） */
export function presentSegments(html, segments) {
  const found = segments.filter((s) => html.includes(`id="host-${s.id}"`));
  if (!found.length) throw new Error("index.html 里没有分段：先 vd build");
  return found;
}

/** cues.js 是上次 vd build 写的；和现在 DIRECTOR.md 算出来的不一样，说明改了 @词或分段还没重新构建 */
export function staleBuild(dir, built) {
  const p = join(dir, "cues.js");
  if (!existsSync(p)) return "还没有 cues.js：先 vd build";
  return readFileSync(p, "utf8") === cuesJs(built) ? null : "DIRECTOR.md 在上次 vd build 之后改过（@词时间或分段变了），画面和导演脚本对不上：先 vd build（样片用 --sample）";
}

const BUILD_STATUS = ".vd/build.json";

/** vd build 结束时记下检查有没有通过；vd qa 靠它判断能不能跑 */
export function writeBuildStatus(dir, ok) {
  mkdirSync(join(dir, ".vd"), { recursive: true });
  writeFileSync(join(dir, BUILD_STATUS), JSON.stringify({ ok, at: Date.now() }) + "\n");
}

/** 画面文件：index.html + compositions/ 下所有 .html */
function htmlFiles(dir) {
  const out = existsSync(join(dir, "index.html")) ? ["index.html"] : [];
  const walk = (rel) => {
    for (const e of readdirSync(join(dir, rel), { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(rel, e.name));
      else if (e.name.endsWith(".html")) out.push(join(rel, e.name));
    }
  };
  if (existsSync(join(dir, "compositions"))) walk("compositions");
  return out;
}

/** 上次 vd build 没跑、检查没过、或之后又改了画面：vd qa 的结果不可信，返回原因 */
export function buildProblem(dir) {
  const p = join(dir, BUILD_STATUS);
  if (!existsSync(p)) return "还没有 vd build 的记录：先 vd build（样片用 --sample）";
  const { ok } = JSON.parse(readFileSync(p, "utf8"));
  if (!ok) return "上次 vd build 的检查没过：先把 vd build 报的错修好，再跑 vd qa";
  const builtAt = statSync(p).mtimeMs;
  const changed = htmlFiles(dir).filter((f) => statSync(join(dir, f)).mtimeMs > builtAt);
  return changed.length ? `${changed.join("、")} 在上次 vd build 之后改过：先重新 vd build` : null;
}

export async function douyinQa(built, page, shotDir) {
  const { inspect, grid } = qaTimes(built, page.duration);
  rmSync(shotDir, { recursive: true, force: true });
  mkdirSync(shotDir, { recursive: true });
  const frames = [];
  const shots = [];
  for (const [i, x] of inspect.entries()) {
    const data = await page.frame(x.t);
    const name = `${String(i + 1).padStart(2, "0")}.png`;
    await page.shot(join(shotDir, name));
    frames.push({ ...x, data });
    shots.push({ t: x.t, label: x.label, file: `snapshots/cues/${name}` });
  }
  const sigs = [];
  for (const t of grid) sigs.push({ t, sig: (await page.frame(t)).sig });
  const errors = summarize([...frames.flatMap(checkFrame), ...checkCues(frames, built.cues)]);
  const warns = stillWindows(sigs).map((w) => ({ level: "warn", kind: "still", sel: "", t: w.from, msg: `${w.from}–${w.to} 秒画面没有变化（任意 2 秒内要有东西在动）` }));
  return { passed: errors.length === 0, issues: [...errors, ...warns], shots };
}
