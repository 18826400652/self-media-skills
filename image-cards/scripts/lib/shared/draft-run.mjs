// 由 shared/node/draft-run.mjs 同步而来，不要在这里改：改正本后跑 st sync-shared
// 存草稿的公共部分：--via 选浏览器（browser-draft 的 bd）还是手机（phone-draft 的 pd），
// 把载荷写成临时 JSON，调 `bd run <步骤.py> <载荷.json>` / `pd run …`。手机不可用时报错，不回落到浏览器。
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BIN = { browser: "bd", phone: "pd" };
const SKILL = { browser: "browser-draft", phone: "phone-draft" };
const EXIT_NO_DEVICE = 3;

/** 取出 --via browser|phone（默认 browser），返回 [via, 其余参数] */
export function takeVia(argv) {
  const i = argv.indexOf("--via");
  if (i < 0) return ["browser", argv];
  const via = argv[i + 1];
  if (!BIN[via]) throw new Error(`--via 只能是 browser 或 phone，收到：${via}`);
  return [via, [...argv.slice(0, i), ...argv.slice(i + 2)]];
}

/** steps：{ browser?: 步骤脚本, phone?: 步骤脚本 }；payload：交给步骤脚本的数据 */
export function runDraft(via, steps, payload, { tmpPrefix = "draft-" } = {}) {
  if (!steps[via]) throw new Error(`这个平台没有 --via ${via} 的步骤（可用：${Object.keys(steps).join("、")}）`);
  const payloadFile = join(mkdtempSync(join(tmpdir(), tmpPrefix)), "payload.json");
  writeFileSync(payloadFile, JSON.stringify(payload));
  const bin = BIN[via];
  try {
    execFileSync(bin, ["run", steps[via], payloadFile], { stdio: "inherit" });
  } catch (err) {
    if (err.code === "ENOENT") throw new Error(`需要 ${bin} 命令（skills/${SKILL[via]}，软链接到 PATH）`);
    if (via === "phone" && err.status === EXIT_NO_DEVICE) throw new Error("手机不可用（见上面的提示）；去掉 --via phone 改用浏览器");
    throw new Error("发草稿失败，看上面的输出");
  }
}
