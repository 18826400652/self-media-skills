// 浏览器测试：开一个无头页面，装上 GSAP 和 hf-kit 的文件，宿主元素 #host（宽 960，放在内容区）。
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { findChrome } from "../../scripts/lib/chrome.mjs";

const SKILL = fileURLToPath(new URL("../../", import.meta.url));
const GSAP = join(SKILL, "node_modules", "gsap", "dist", "gsap.min.js");
const CHROME_DEPS = join(homedir(), ".local", "lib", "chrome-deps"); // 无 sudo 时手动解压的 Chrome 运行库（同 bin/nv）

let chrome = null;
try {
  chrome = findChrome();
} catch {
  chrome = null;
}
export const CHROME_SKIP = chrome ? false : "找不到 Chrome，跳过浏览器测试（设置 CHROME_PATH 或安装 chrome-headless-shell）";

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;width:1080px;height:1920px;background:#101114}</style></head>
<body><div id="host" style="position:absolute;left:60px;top:300px;width:960px"></div></body></html>`;

/** @param {{ files: string[] }} o hf-kit/ 下的文件名，按顺序加载 */
export async function openKitPage({ files }) {
  if (!chrome) return null;
  const env = { ...process.env };
  if (existsSync(CHROME_DEPS)) env.LD_LIBRARY_PATH = CHROME_DEPS + (env.LD_LIBRARY_PATH ? `:${env.LD_LIBRARY_PATH}` : "");
  const browser = await puppeteer.launch({ executablePath: chrome, args: ["--no-sandbox"], env });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920 });
    await page.setContent(PAGE);
    await page.addScriptTag({ path: GSAP });
    for (const f of files) await page.addScriptTag({ path: join(SKILL, "hf-kit", f) });
    return { page, close: () => browser.close() };
  } catch (err) {
    await browser.close(); // 装载失败也要关浏览器，否则测试进程挂着不退出
    throw err;
  }
}
