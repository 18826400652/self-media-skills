import assert from "node:assert/strict";
import { test } from "node:test";
import { findChrome } from "../scripts/lib/shared/chrome.mjs";
import { openPage } from "../scripts/lib/inspect-page.mjs";
import { project } from "./helpers.mjs";

let chrome = null;
try { chrome = findChrome(); } catch { chrome = null; }

// 假的 HyperFrames 页面：renderSeek(t) 按时间改样式
const HTML = `<!doctype html><html><body style="margin:0;width:1080px;height:1920px;position:relative;background:#111">
<div id="host-brand-kicker" style="position:absolute;inset:0"><div id="bk-label" style="position:absolute;left:64px;top:228px;width:400px;height:40px;color:#fff">栏目</div></div>
<div id="wrap" style="position:absolute;inset:0;pointer-events:none">
  <div id="a" data-vd-cue="钩子" style="position:absolute;left:100px;top:400px;width:300px;height:60px;opacity:0">钩子</div>
  <div id="b" style="position:absolute;left:100px;top:600px;width:300px;height:60px">文字</div>
  <div id="shape" data-vd-key style="position:absolute;left:600px;top:800px;width:100px;height:100px;background:#f00"></div>
  <div id="proof" data-vd-proof style="position:absolute;left:200px;top:1200px;width:200px;height:80px;background:#0f0"></div>
  <div id="clipper" style="position:absolute;left:100px;top:300px;width:300px;height:100px;overflow:hidden"><div id="paper" style="position:absolute;left:0;top:-150px;width:300px;height:200px">纸</div></div>
  <div id="cover" style="position:absolute;left:0;top:200px;width:1080px;height:100px;background:#00f;display:none"></div>
</div>
<div id="host-brand-captions" style="position:absolute;inset:0"><div id="cap" style="position:absolute;left:60px;top:1250px">字幕</div></div>
<script>
window.__player = { getDuration: () => 4, renderSeek: async (t) => {
  document.getElementById("a").style.opacity = t >= 1 ? "1" : "0";
  document.getElementById("b").style.top = (t >= 2 ? 1500 : 600) + "px";
  document.getElementById("cover").style.display = t >= 3 ? "block" : "none";
} };
</script></body></html>`;

test("openPage：读时长；按时间读元素框、@词 可见、栏目标签遮挡；字幕不算", { skip: !chrome && "没有 Chrome" }, async () => {
  const page = await openPage({ html: HTML, root: project({}) });
  try {
    assert.equal(page.duration, 4);
    const f0 = await page.frame(0.5);
    assert.deepEqual(f0.cueMarks, [{ cue: "钩子", sel: "#a", visible: false }]);
    assert.ok(!f0.elements.some((e) => e.sel === "#a"), "透明元素不算可见");
    assert.ok(!f0.elements.some((e) => e.sel === "#cap"), "字幕在 host-brand-* 里，不查");
    assert.deepEqual(f0.elements.find((e) => e.sel === "#shape"), { sel: "#shape", text: false, key: true, allowSafe: false, box: [600, 800, 700, 900], opacity: 1 });
    assert.deepEqual(f0.elements.find((e) => e.sel === "#proof"), { sel: "#proof", text: false, key: false, allowSafe: false, proof: true, box: [200, 1200, 400, 1280], opacity: 1 }, "只有 data-vd-proof 也要收进来");
    assert.deepEqual(f0.kicker, { visible: true, occludedBy: null });
    assert.deepEqual(f0.elements.find((e) => e.sel === "#paper").box, [100, 300, 400, 350], "被 overflow:hidden 裁掉的部分不算");
    const f1 = await page.frame(1.5);
    assert.equal(f1.cueMarks[0].visible, true);
    assert.notEqual(f1.sig, f0.sig, "元素变了签名就变");
    assert.deepEqual((await page.frame(2.5)).elements.find((e) => e.sel === "#b").box, [100, 1500, 400, 1560]);
    assert.deepEqual((await page.frame(3.5)).kicker, { visible: true, occludedBy: "#cover" });
  } finally {
    await page.close();
  }
});

test("openPage：CHROME_PATH 指向不存在的文件 → 中文错误", async () => {
  const old = process.env.CHROME_PATH;
  process.env.CHROME_PATH = "/nope/chrome";
  try {
    await assert.rejects(openPage({ html: "<html></html>", root: project({}) }), /找不到 Chrome：CHROME_PATH=\/nope\/chrome/);
  } finally {
    if (old === undefined) delete process.env.CHROME_PATH; else process.env.CHROME_PATH = old;
  }
});

test("openPage：blocks 带绘制信息；texts 带字号 / 字重 / 颜色；材质标记和段豁免可读", { skip: !chrome && "没有 Chrome" }, async () => {
  const html = HTML.replace('<div id="host-brand-captions"', `
  <div id="subj" style="position:absolute;left:200px;top:500px;width:400px;height:700px;background:#fff;box-shadow:0 1px 0 #fff inset, 0 0 0 2px #000, 24px 40px 60px rgba(0,0,0,.2)"></div>
  <div id="seg-01" data-vd-aesthetic-ok style="position:absolute;inset:0"></div>
  <div id="deco" data-layout-ignore data-vd-material="grain" style="position:absolute;inset:0;background:rgba(0,0,0,.1)"></div>
  <div id="host-brand-captions"`);
  const page = await openPage({ html, root: project({}) });
  try {
    const f = await page.frame(1.5);
    const subj = f.blocks.find((b) => b.sel === "#subj");
    assert.ok(subj, "绘制块要进 blocks");
    assert.match(subj.shadow, /rgba|rgb/);
    assert.equal(subj.rot, 0);
    assert.equal(subj.material, null);
    const deco = f.blocks.find((b) => b.sel === "#deco");
    assert.equal(deco.material, "grain");
    const t = f.texts.find((x) => x.sel === "#b");
    assert.ok(t, "文字要进 texts");
    assert.ok(t.fontSize > 0);
    assert.deepEqual(f.materials, ["grain"]);
    assert.deepEqual(f.aestheticOk, ["seg-01"]);
  } finally { await page.close(); }
});

test("openPage：data-layout-ignore 装饰不挡栏目标签；不带的照报", { skip: !chrome && "没有 Chrome" }, async () => {
  const deco = (attr) => '<div id="deco" ' + attr + ' style="position:absolute;inset:0;background:rgba(0,0,0,.1)"></div>';
  const okPage = await openPage({ html: HTML.replace('<div id="host-brand-captions"', deco("data-layout-ignore") + '<div id="host-brand-captions"'), root: project({}) });
  try { assert.equal((await okPage.frame(1.5)).kicker.occludedBy, null); } finally { await okPage.close(); }
  const badPage = await openPage({ html: HTML.replace('<div id="host-brand-captions"', deco("") + '<div id="host-brand-captions"'), root: project({}) });
  try { assert.equal((await badPage.frame(1.5)).kicker.occludedBy, "#deco"); } finally { await badPage.close(); }
});

test("openPage：shot64 返回 base64，pixels 返回色度 / 暗部比例", { skip: !chrome && "没有 Chrome" }, async () => {
  const page = await openPage({ html: HTML, root: project({}) });
  try {
    const b64 = await page.shot64();
    assert.ok(b64.length > 100);
    const px = await page.pixels(b64);
    assert.ok(px.vivid >= 0 && px.vivid <= 100);
    assert.ok(px.dark >= 0 && px.dark <= 100);
    assert.ok(px.meanL >= 0 && px.meanL <= 100);
    assert.ok(px.stdL >= 0);
  } finally { await page.close(); }
});

const ZOOM_HTML = `<!doctype html><html><head><style>body{margin:0;width:1080px;height:1920px;position:relative}</style></head><body>
<div data-composition-id="main" data-duration="2" style="position:absolute;inset:0">
  <div style="position:absolute;left:100px;top:400px;transform:scale(2);transform-origin:0 0">
    <div id="line" data-vd-zoom="@本周重点" style="font-size:20px;height:50px;width:200px">本周重点</div>
    <div id="region" data-vd-zoom="@四块" data-vd-zoom-text="15" style="position:absolute;left:0;top:100px;width:300px;height:80px"></div>
  </div>
</div>
<script>window.__player = { getDuration: () => 2, renderSeek: async () => {} };</script></body></html>`;

test("openPage：data-vd-zoom 元素带上框和推近后的字号（缩放算进去；data-vd-zoom-text 代替 font-size）", { skip: !chrome && "没有 Chrome" }, async () => {
  const page = await openPage({ html: ZOOM_HTML, root: project({}) });
  try {
    const f = await page.frame(0.5);
    assert.deepEqual(f.zooms, [
      { cue: "本周重点", sel: "#line", box: [100, 400, 500, 500], fontPx: 40 },
      { cue: "四块", sel: "#region", box: [100, 600, 700, 760], fontPx: 30 },
    ]);
  } finally {
    await page.close();
  }
});
