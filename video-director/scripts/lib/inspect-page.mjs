// 在 headless Chrome 里打开打包好的工程，跳到任意时间读元素位置（给 vd qa 用）
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import puppeteer from "puppeteer-core";
import { findChrome } from "./chrome.mjs";

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
  const selOf = (e) => {
    if (e.id) return `#${e.id}`;
    const host = e.parentElement?.closest("[id]");
    return `${host ? `#${host.id} ` : ""}${e.tagName.toLowerCase()}`;
  };
  const all = [...document.body.querySelectorAll("*")].filter((e) => !["SCRIPT", "STYLE", "LINK", "META"].includes(e.tagName));
  const elements = [];
  const sig = [];
  for (const e of all) {
    if (inBrand(e)) continue;
    const box = boxOf(e);
    const op = opacityOf(e);
    if (op <= 0.05 || !area(box) || !onScreen(box)) continue;
    const text = ownText(e);
    sig.push(`${selOf(e)}:${box.map((v) => Math.round(v / 2)).join(",")}:${Math.round(op * 20)}${text ? `:${e.textContent.trim()}` : ""}`);
    if (text || e.hasAttribute("data-vd-key")) elements.push({ sel: selOf(e), text, key: e.hasAttribute("data-vd-key"), allowSafe: !!e.closest("[data-vd-allow-safe]"), box, opacity: Math.round(op * 100) / 100 });
  }
  const cueMarks = [...document.querySelectorAll("[data-vd-cue]")].map((e) => {
    const box = boxOf(e);
    return { cue: e.getAttribute("data-vd-cue"), sel: selOf(e), visible: opacityOf(e) >= 0.5 && area(box) > 0 && onScreen(box) };
  });
  const kick = document.getElementById("bk-label");
  let kicker = { visible: false, occludedBy: null };
  if (kick && opacityOf(kick) > 0.05 && area(boxOf(kick))) {
    const paints = (e) => {
      if (e instanceof SVGElement) return true;
      if (["IMG", "CANVAS", "VIDEO"].includes(e.tagName) || ownText(e)) return true;
      const cs = getComputedStyle(e);
      const bg = cs.backgroundColor;
      return (bg !== "transparent" && !/rgba\(.*,\s*0\)$/.test(bg)) || cs.backgroundImage !== "none" || parseFloat(cs.borderTopWidth) > 0;
    };
    const r = kick.getBoundingClientRect();
    const pts = [[r.left + 4, r.top + 4], [r.right - 4, r.top + 4], [r.left + 4, r.bottom - 4], [r.right - 4, r.bottom - 4], [(r.left + r.right) / 2, (r.top + r.bottom) / 2]];
    let by = null;
    for (const [x, y] of pts) {
      const top = document.elementsFromPoint(x, y).find((e) => kick.contains(e) || (paints(e) && opacityOf(e) > 0.05));
      if (top && !kick.contains(top)) { by = selOf(top); break; }
    }
    kicker = { visible: true, occludedBy: by };
  }
  return { elements, cueMarks, kicker, sig: sig.join("|") };
}

export async function openPage({ html, root }) {
  const server = await serve(html, root);
  const browser = await puppeteer.launch({ executablePath: findChrome(), args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] });
  const close = async () => { await browser.close(); server.close(); };
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920 });
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`, { waitUntil: "load" });
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
      close,
    };
  } catch (err) {
    await close();
    throw err;
  }
}
