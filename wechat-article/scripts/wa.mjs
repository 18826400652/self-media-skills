#!/usr/bin/env node
// 用法：
//   wa preview <文章.md>     生成 预览.html（手机宽度 + 「复制到公众号」按钮），路径打印出来
//   wa render  <文章.md>     输出公众号 HTML 到标准输出
//   wa draft   <文章.md> [--via browser|phone]  存进公众号草稿箱：默认用 browser-draft 的 bd 操作已登录的浏览器，phone 用 phone-draft 的 pd 操作手机上的公众号助手
//   wa publish <文章.md>     用接口上传图片并存草稿（需要 AppID/AppSecret、IP 白名单和草稿接口权限，个人号没有）
// 主题、凭据文件等来自项目配置 wechat-article.config.json（向上查找）。
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runDraft, takeVia } from "./lib/shared/draft-run.mjs";

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

/** theme 可以是：.css 文件路径（相对配置文件）、本 skill themes/ 下的主题名、文颜内置主题 ID */
function themeArgs(config) {
  const args = ["-h", config.highlight, config.macStyle ? "--mac-style" : "--no-mac-style"];
  if (config.theme.endsWith(".css")) {
    const css = resolve(config.root, config.theme);
    if (!existsSync(css)) throw new Error(`主题文件不存在：${css}`);
    return [...args, "-c", css];
  }
  const bundled = join(SKILL_DIR, "themes", `${config.theme}.css`);
  if (existsSync(bundled)) return [...args, "-c", bundled];
  return [...args, "-t", config.theme];
}

function wenyan(args, opts = {}) {
  if (!existsSync(WENYAN)) throw new Error(`未安装依赖，请先运行：cd ${SKILL_DIR} && npm install`);
  return execFileSync(WENYAN, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts });
}

function render(file, config) {
  return wenyan(["render", "-f", file, ...themeArgs(config)]);
}

function frontmatterField(file, field) {
  const m = readFileSync(file, "utf8").match(new RegExp(`^---\\n[\\s\\S]*?^${field}:\\s*(.+)$`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
}

const frontmatterTitle = (file) => frontmatterField(file, "title") || basename(file, ".md");

const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp" };

/** 本地图片转成 data: 内联：粘贴进公众号编辑器后会自动转存到微信图床 */
function inlineLocalImages(html, baseDir) {
  let count = 0;
  const out = html.replace(/src="([^"]+)"/g, (whole, src) => {
    if (/^(https?:|data:)/.test(src)) return whole;
    const path = resolve(baseDir, decodeURIComponent(src));
    const mime = MIME[extname(path).toLowerCase()];
    if (!mime || !existsSync(path)) throw new Error(`正文图片不存在或格式不支持：${path}`);
    count += 1;
    return `src="data:${mime};base64,${readFileSync(path).toString("base64")}"`;
  });
  return { html: out, count };
}

function draft(file, config, via = "browser") {
  const { html, count } = inlineLocalImages(render(file, config), dirname(file));
  const coverField = frontmatterField(file, "cover");
  const cover = coverField ? resolve(dirname(file), coverField) : "";
  if (cover && !existsSync(cover)) throw new Error(`封面不存在：${cover}`);
  const payload = { title: frontmatterTitle(file), author: frontmatterField(file, "author"), html, cover, images: count, account: config.account ?? "" };
  runDraft(via, { phone: join(SKILL_DIR, "scripts", "phone_wechat.py"), browser: join(SKILL_DIR, "scripts", "draft_wechat.py") }, payload, { tmpPrefix: "wa-draft-" });
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
  const [via, rest] = takeVia(process.argv.slice(2));
  const [cmd, file] = rest;
  const commands = { preview, draft, publish, render: (f, c) => process.stdout.write(render(f, c)) };
  if (!commands[cmd] || !file) {
    console.error("用法：wa preview|render|draft|publish <文章.md>（draft 可加 --via browser|phone，默认 browser）");
    process.exit(1);
  }
  const path = resolve(file);
  if (!existsSync(path)) throw new Error(`文件不存在：${path}`);
  commands[cmd](path, loadConfig(dirname(path)), via);
}

try {
  main();
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exit(1);
}
