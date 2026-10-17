// sc rec 浏览器模式的录前准备：DeepSeek 网页默认关掉「深度思考」「智能搜索」（和手机 --app 的默认一致）
import { join } from "node:path";
import { SKILL_DIR } from "./rec-config.mjs";

export const DEEPSEEK_OFF = join(SKILL_DIR, "scripts", "rec", "setup", "deepseek-off.py");

const isDeepSeek = (url) => {
  try { return new URL(url).hostname === "chat.deepseek.com"; } catch { return false; }
};

/** 录之前执行的 Python 文件（空 = 不做准备）。--setup 指定的优先，--setup none 不做准备；浏览器模式打不开开关，要开就报错 */
export function browserSetup({ url = "", think = false, search = false, setup = "" }) {
  if (think || search) {
    const flags = [think && "--think", search && "--search"].filter(Boolean).join(" ");
    throw new Error(`浏览器模式只能关掉模型开关，打不开（${flags}）：要开就用手机 --app；或在网页里手动打开，再加 --setup none 跳过默认的关开关`);
  }
  if (setup === "none") return "";
  if (setup) return setup;
  return isDeepSeek(url) ? DEEPSEEK_OFF : "";
}
