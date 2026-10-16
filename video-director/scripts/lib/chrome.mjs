// 查找可用的 Chrome（浏览器测试用）：优先 CHROME_PATH，其次复用 HyperFrames / Puppeteer 已下载的 headless shell，最后找系统 Chrome。与 image-cards 的同名文件保持一致。
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const HEADLESS_ROOTS = [
  join(homedir(), ".cache", "hyperframes", "chrome", "chrome-headless-shell"),
  join(homedir(), ".cache", "puppeteer", "chrome-headless-shell"),
];
const SYSTEM_CHROMES = ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium-browser"];

function headlessShellIn(root) {
  if (!existsSync(root)) return null;
  // 结构：<root>/<平台-版本>/chrome-headless-shell-<平台>/chrome-headless-shell，取版本最新的
  for (const version of readdirSync(root).sort().reverse()) {
    const versionDir = join(root, version);
    for (const sub of readdirSync(versionDir)) {
      const bin = join(versionDir, sub, "chrome-headless-shell");
      if (existsSync(bin)) return bin;
    }
  }
  return null;
}

export function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  for (const root of HEADLESS_ROOTS) {
    const bin = headlessShellIn(root);
    if (bin) return bin;
  }
  const system = SYSTEM_CHROMES.find((p) => existsSync(p));
  if (system) return system;
  throw new Error(
    "找不到 Chrome。安装一个：npx @puppeteer/browsers install chrome-headless-shell@stable --path ~/.cache/puppeteer，或设置 CHROME_PATH",
  );
}
