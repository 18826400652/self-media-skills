#!/usr/bin/env node
// 用法：
//   wa preview <文章.md>     生成 预览.html（手机宽度 + 「复制到公众号」按钮），路径打印出来
//   wa render  <文章.md>     输出公众号 HTML 到标准输出
//   wa publish <文章.md>     上传图片并发布到公众号草稿箱（需要 AppID/AppSecret 与 IP 白名单）
// 主题、凭据文件等来自项目配置 wechat-article.config.json（向上查找）。
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WENYAN = join(SKILL_DIR, "node_modules", ".bin", "wenyan");
const CONFIG_NAME = "wechat-article.config.json";
const DEFAULTS = { theme: "default", highlight: "solarized-light", envFile: ".env", macStyle: false };

function findUp(start, name) {
  for (let dir = resolve(start); ; dir = dirname(dir)) {
    if (existsSync(join(dir, name))) return join(dir, name);
    if (dirname(dir) === dir) return null;
  }
}

function loadConfig(start) {
  const path = findUp(start, CONFIG_NAME);
  if (!path) return { ...DEFAULTS, root: resolve(start) };
  return { ...DEFAULTS, ...JSON.parse(readFileSync(path, "utf8")), root: dirname(path) };
}

/** theme 既可以是文颜内置主题 ID，也可以是 .css 文件路径（相对配置文件） */
function themeArgs(config) {
  const args = ["-h", config.highlight, config.macStyle ? "--mac-style" : "--no-mac-style"];
  if (config.theme.endsWith(".css")) {
    const css = resolve(config.root, config.theme);
    if (!existsSync(css)) throw new Error(`主题文件不存在：${css}`);
    return [...args, "-c", css];
  }
  return [...args, "-t", config.theme];
}

function wenyan(args, opts = {}) {
  if (!existsSync(WENYAN)) throw new Error(`未安装依赖，请先运行：cd ${SKILL_DIR} && npm install`);
  return execFileSync(WENYAN, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts });
}

function render(file, config) {
  return wenyan(["render", "-f", file, ...themeArgs(config)]);
}

function frontmatterTitle(file) {
  const m = readFileSync(file, "utf8").match(/^---\n[\s\S]*?^title:\s*(.+)$/m);
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : basename(file, ".md");
}

const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function preview(file, config) {
  const html = render(file, config);
  const template = readFileSync(join(SKILL_DIR, "templates", "preview.html"), "utf8");
  const page = template.replaceAll("{{TITLE}}", () => escapeHtml(frontmatterTitle(file))).replace("{{CONTENT}}", () => html);
  const out = join(dirname(file), "预览.html");
  writeFileSync(out, page);
  console.log(out);
}

function publish(file, config) {
  const envFile = resolve(config.root, config.envFile);
  const args = ["publish", "-f", file, ...themeArgs(config)];
  if (existsSync(envFile)) args.push("--env-file", envFile);
  else if (!process.env.WECHAT_APP_ID) {
    throw new Error(`缺少公众号凭据：在 ${envFile} 写入 WECHAT_APP_ID / WECHAT_APP_SECRET（详见 references/publish.md）`);
  }
  wenyan(args, { stdio: "inherit" });
}

function main() {
  const [cmd, file] = process.argv.slice(2);
  const commands = { preview, publish, render: (f, c) => process.stdout.write(render(f, c)) };
  if (!commands[cmd] || !file) {
    console.error("用法：wa preview|render|publish <文章.md>");
    process.exit(1);
  }
  const path = resolve(file);
  if (!existsSync(path)) throw new Error(`文件不存在：${path}`);
  commands[cmd](path, loadConfig(dirname(path)));
}

try {
  main();
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exit(1);
}
