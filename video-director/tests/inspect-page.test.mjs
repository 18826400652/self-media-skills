import assert from "node:assert/strict";
import { test } from "node:test";
import { findChrome } from "../scripts/lib/chrome.mjs";
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
