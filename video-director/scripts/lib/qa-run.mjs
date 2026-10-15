// vd qa 的编排：按落定时刻取数 + 截图，按 0.5 秒网格取签名，交给 douyin-qa 判定
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { checkCues, checkFrame, qaTimes, stillWindows, summarize } from "./douyin-qa.mjs";

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
