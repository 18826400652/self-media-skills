// wa preview 的截图：用 Chrome 把 预览.html 里的「手机」那一栏整篇截成 PNG（2 倍清晰度）
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
import { findChrome } from "./shared/chrome.mjs";

const PHONE_W = 420; // 和 templates/preview.html 的 .phone 宽度一致

/** 截好返回 true；找不到 Chrome 返回 false（调用方提醒），其他错误照常抛出 */
export async function shootPreview(htmlPath, pngPath) {
  let executablePath;
  try { executablePath = findChrome(); } catch { return false; }
  if (!existsSync(executablePath)) return false;
  const browser = await puppeteer.launch({ executablePath, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: PHONE_W + 48, height: 900, deviceScaleFactor: 2 });
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
    await page.addStyleTag({ content: ".bar { display: none !important; }" }); // 顶部「复制到公众号」条会压住标题
    await page.evaluate(() => document.fonts.ready);
    const phone = await page.$(".phone");
    await phone.screenshot({ path: pngPath });
    return true;
  } finally {
    await browser.close();
  }
}
