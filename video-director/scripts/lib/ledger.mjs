// 缺镜头台账（作品项目的 00-规划/镜头候选.json）：custom 段记成候选，同一类需求第二次出现就排进磨镜头（spec 5.3a）
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

export const DEFAULT_LEDGER = "00-规划/镜头候选.json";

/** 读台账：没有文件是空台账；坏了报错带路径（不覆盖，让人去修） */
export function readLedger(path) {
  if (!existsSync(path)) return { version: 1, items: [] };
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(`镜头候选台账 ${path} 不是合法的 JSON（${err.message}）：先修好这个文件，vd check 不会覆盖它`);
  }
}

export function writeLedger(path, ledger) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(ledger, null, 2) + "\n");
}

/** 记一个 custom 段；返回新台账和一句变化说明（没变化时 null）。不改传进来的台账 */
export function recordCustom(ledger, { work, segment, need, candidate }) {
  const items = ledger.items ?? [];
  const i = items.findIndex((x) => x.name === candidate);
  const same = (ledger_) => ({ ledger: ledger_, change: null });
  if (i < 0) {
    const item = { name: candidate, need, status: "once", episodes: [{ work, segment }] };
    return { ledger: { ...ledger, items: [...items, item] }, change: `新候选 ${candidate}：${need}（${work} ${segment}，第 1 次出现）` };
  }
  const item = items[i];
  if (item.status === "done") return { ledger, change: `${candidate} 已入库为 ${item.shot}，这段可以直接用` };
  if (item.status === "dropped" || item.episodes.some((e) => e.work === work && e.segment === segment)) return same(ledger);
  const isNewWork = !item.episodes.some((e) => e.work === work);
  const next = { ...item, episodes: [...item.episodes, { work, segment }], status: item.status === "once" && isNewWork ? "queued" : item.status };
  const change = next.status === "queued" && item.status === "once" ? `${candidate} 第 2 次出现（${work} ${segment}）：该磨了，这期复盘时请用户确认` : `${candidate} 又出现在 ${work} ${segment}`;
  return { ledger: { ...ledger, items: items.map((x, j) => (j === i ? next : x)) }, change };
}

/** 把视频工程里的 custom 段记进项目台账（vd check 调）；返回每条变化，有变化才写文件 */
export function recordLedger({ root, projectDir, segments, ledgerRel = DEFAULT_LEDGER }) {
  const path = join(root, ledgerRel);
  const work = relative(root, dirname(resolve(projectDir)));
  let ledger = readLedger(path);
  const changes = [];
  let dirty = false;
  for (const s of segments.filter((x) => x.custom)) {
    const r = recordCustom(ledger, { work, segment: s.id, need: s.custom.need, candidate: s.custom.candidate });
    if (r.ledger !== ledger) dirty = true;
    ledger = r.ledger;
    if (r.change) changes.push(r.change);
  }
  if (dirty) writeLedger(path, ledger);
  return changes;
}
