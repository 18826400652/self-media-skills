// 在 headless Chrome 里打开打包好的工程，跳到任意时间读元素位置（给 vd qa 用）
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import puppeteer from "puppeteer-core";
import { findChrome } from "./shared/chrome.mjs";

const MIME = { ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".woff": "font/woff", ".otf": "font/otf", ".ttf": "font/ttf", ".wav": "audio/wav", ".mp3": "audio/mpeg", ".mp4": "video/mp4" };

function serve(html, root) {
  const base = resolve(root);
  const server = createServer((req, res) => {
    const p = decodeURIComponent((req.url ?? "/").split("?")[0]);
    if (p === "/" || p === "/index.html") { res.setHeader("content-type", "text/html; charset=utf-8"); return res.end(html); }
    const f = resolve(base, "." + p);
    if (!f.startsWith(base + sep) || !existsSync(f)) { res.statusCode = 404; return res.end(); }
    res.setHeader("content-type", MIME[extname(f).toLowerCase()] ?? "application/octet-stream");
    res.end(readFileSync(f));
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

/* 在页面里执行：收集可见元素、@词 标记、栏目标签遮挡、画面签名。必须自包含（会被序列化进页面） */
function collect() {
  const inBrand = (e) => !!e.closest('[id^="host-brand-"]');
  const opacityOf = (e) => {
    let o = 1;
    for (let x = e; x && x.nodeType === 1; x = x.parentElement) {
      const cs = getComputedStyle(x);
      if (cs.display === "none" || cs.visibility === "hidden") return 0;
      o *= Number(cs.opacity);
    }
    return o;
  };
  // 看得见的范围：元素框和所有裁切祖先（overflow 不是 visible）的框取交集
  const boxOf = (e) => {
    const r = e.getBoundingClientRect();
    let [x1, y1, x2, y2] = [r.left, r.top, r.right, r.bottom];
    for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.overflowX === "visible" && cs.overflowY === "visible") continue;
      const c = a.getBoundingClientRect();
      if (cs.overflowX !== "visible") { x1 = Math.max(x1, c.left); x2 = Math.min(x2, c.right); }
      if (cs.overflowY !== "visible") { y1 = Math.max(y1, c.top); y2 = Math.min(y2, c.bottom); }
    }
    return [Math.round(x1), Math.round(y1), Math.round(Math.max(x1, x2)), Math.round(Math.max(y1, y2))];
  };
  const area = (b) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
  const onScreen = (b) => b[2] > 0 && b[3] > 0 && b[0] < innerWidth && b[1] < innerHeight;
  const ownText = (e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  const alphaOf = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return 1;
    const p = m[1].split(",");
    return p.length > 3 ? Number(p[3]) : 1;
  };
  // 这个元素自己画东西（背景、边框、图片、SVG、直接文字）；不算子元素
  const paints = (e, cs = getComputedStyle(e)) => {
    if (e instanceof SVGElement) return true;
    if (["IMG", "CANVAS", "VIDEO"].includes(e.tagName) || ownText(e)) return true;
    return (cs.backgroundColor !== "transparent" && alphaOf(cs.backgroundColor) > 0.05) || cs.backgroundImage !== "none" || parseFloat(cs.borderTopWidth) > 0;
  };
  // 计算后的 transform 是 matrix(a,b,c,d,e,f)；只处理 2D 旋转，matrix3d 当 0
  const rotOf = (t) => {
    if (!t || t === "none") return 0;
    const m = t.match(/^matrix\(([^,]+),\s*([^,]+)/);
    return m ? Math.round((Math.atan2(Number(m[2]), Number(m[1])) * 180) / Math.PI) : 0;
  };
  const selOf = (e) => {
    if (e.id) return `#${e.id}`;
    const host = e.parentElement?.closest("[id]");
    return `${host ? `#${host.id} ` : ""}${e.tagName.toLowerCase()}`;
  };
  const all = [...document.body.querySelectorAll("*")].filter((e) => !["SCRIPT", "STYLE", "LINK", "META"].includes(e.tagName));
  const elements = [];
  const blocks = [];
  const texts = [];
  const sig = [];
  for (const e of all) {
    if (inBrand(e)) continue;
    const box = boxOf(e);
    const op = opacityOf(e);
    if (op <= 0.05 || !area(box) || !onScreen(box)) continue;
    const text = ownText(e);
    const cs = getComputedStyle(e);
    const sel = selOf(e);
    sig.push(`${sel}:${box.map((v) => Math.round(v / 2)).join(",")}:${Math.round(op * 20)}${text ? `:${e.textContent.trim()}` : ""}`);
    if (paints(e, cs) && !text) blocks.push({ sel, box, opacity: Math.round(op * 100) / 100, shadow: cs.boxShadow, rot: rotOf(cs.transform), bg: cs.backgroundColor, bgImage: cs.backgroundImage !== "none", material: e.closest("[data-vd-material]")?.getAttribute("data-vd-material") ?? null });
    if (text) texts.push({ sel, box, opacity: Math.round(op * 100) / 100, fontSize: parseFloat(cs.fontSize), fontWeight: Number(cs.fontWeight) || 400, color: cs.color, text: e.textContent.trim().slice(0, 40) });
    if (text || e.hasAttribute("data-vd-key")) {
      const item = { sel, text, key: e.hasAttribute("data-vd-key"), allowSafe: !!e.closest("[data-vd-allow-safe]"), box, opacity: Math.round(op * 100) / 100 };
      // 只有标了才加这个字段：旧 fixture 的 deepEqual 不受影响
      if (e.hasAttribute("data-vd-proof")) item.proof = true;
      elements.push(item);
    }
  }
  const materials = [...new Set([...document.querySelectorAll("[data-vd-material]")].filter((e) => !inBrand(e)).map((e) => e.getAttribute("data-vd-material")).filter(Boolean))];
  const aestheticOk = [...new Set([...document.querySelectorAll("[data-vd-aesthetic-ok]")].map((e) => e.id || e.closest("[data-composition-id]")?.id).filter(Boolean))];
  const cueMarks = [...document.querySelectorAll("[data-vd-cue]")].map((e) => {
    const box = boxOf(e);
    return { cue: e.getAttribute("data-vd-cue"), sel: selOf(e), visible: opacityOf(e) >= 0.5 && area(box) > 0 && onScreen(box) };
  });
  const kick = document.getElementById("bk-label");
  let kicker = { visible: false, occludedBy: null };
  if (kick && opacityOf(kick) > 0.05 && area(boxOf(kick))) {
    const decorative = (e) => !!e.closest("[data-layout-ignore]");
    const r = kick.getBoundingClientRect();
    const pts = [[r.left + 4, r.top + 4], [r.right - 4, r.top + 4], [r.left + 4, r.bottom - 4], [r.right - 4, r.bottom - 4], [(r.left + r.right) / 2, (r.top + r.bottom) / 2]];
    let by = null;
    for (const [x, y] of pts) {
      const top = document.elementsFromPoint(x, y).find((e) => kick.contains(e) || (!decorative(e) && paints(e) && opacityOf(e) > 0.05));
      if (top && !kick.contains(top)) { by = selOf(top); break; }
    }
    kicker = { visible: true, occludedBy: by };
  }
  return { elements, blocks, texts, materials, aestheticOk, cueMarks, kicker, sig: sig.join("|") };
}

/* 在页面里执行：把截图缩到 1/4，统计鲜艳 / 暗部像素和亮度分布。和 collect 一样必须自包含 */
function pixels(b64) {
  return (async () => {
    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = 270;
    c.height = 480;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0, 270, 480);
    const d = ctx.getImageData(0, 0, 270, 480).data;
    let vivid = 0, dark = 0, n = 0, sum = 0, sum2 = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
      n++;
      if (mx - mn > 0.35 && l > 0.15 && l < 0.92) vivid++;
      if (l < 0.25) dark++;
      sum += l;
      sum2 += l * l;
    }
    const mean = sum / n;
    const pct = (x) => Math.round((x / n) * 10000) / 100;
    return { vivid: pct(vivid), dark: pct(dark), meanL: Math.round(mean * 10000) / 100, stdL: Math.round(Math.sqrt(sum2 / n - mean * mean) * 10000) / 100 };
  })();
}

/** 找 Chrome：CHROME_PATH 写错时给中文错误（puppeteer 自己报的是英文） */
export function chromePath() {
  const exe = findChrome();
  if (!existsSync(exe)) throw new Error(`找不到 Chrome：CHROME_PATH=${exe} 这个文件不存在`);
  return exe;
}

export async function openPage({ html, root }) {
  const exe = chromePath(); // 先找 Chrome，找不到就不起本地服务
  const server = await serve(html, root);
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: exe, args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] });
  } catch (err) {
    server.close();
    throw new Error(`Chrome 启动失败（${exe}）：${err.message}`);
  }
  const close = async () => { await browser.close(); server.close(); };
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920 });
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready); // 字体没加载完时量出来的文字框是后备字体的大小
    // elementsFromPoint 会跳过 pointer-events:none 的元素，查遮挡前全部打开
    await page.addStyleTag({ content: "*{pointer-events:auto !important}" });
    await page.waitForFunction(() => window.__player && typeof window.__player.renderSeek === "function" && window.__player.getDuration() > 0, { timeout: 30000 })
      .catch(() => { throw new Error("页面 30 秒内没准备好（没有 window.__player）：先 vd build，确认 npx hyperframes check 通过"); });
    const duration = await page.evaluate(() => window.__player.getDuration());
    const seek = (t) => page.evaluate(async (t) => {
      await window.__player.renderSeek(t);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }, t);
    return {
      duration,
      frame: async (t) => { await seek(t); return page.evaluate(collect); },
      shot: (path) => page.screenshot({ path, type: "png" }),
      shot64: () => page.screenshot({ type: "png", encoding: "base64" }),
      pixels: (b64) => page.evaluate(pixels, b64),
      close,
    };
  } catch (err) {
    await close();
    throw err;
  }
}
