/*
 * hf-kit「glow」质感层：光晕 + 点阵颗粒底色、HUD 四角和进度条、玻璃卡片皮肤。
 * 在 kit.js 之后引用（帧模板在 hfKit.look 为 "glow" 时自动引用）。只读 --kit-* 变量，不写死品牌色。
 * 类名约定见 scripts/lib/frame-build.mjs：kit-atmo（is-accent）、kit-hud、kit-progress、kit-kicker、kit-chip、kit-glass-panel、kit-label。
 * 帧模板里的同名元素也有自己的类样式，所以这些钩子用双类名（.kit-chip.kit-chip）提高优先级。
 */
(function () {
  "use strict";
  if (!window.Kit) throw new Error("kit-glow.js 要在 kit.js 之后引用");
  if (window.Kit.look === "glow") return;
  window.Kit.look = "glow";

  var A = function (pct) { return "color-mix(in srgb,var(--kit-accent) " + pct + "%,transparent)"; };
  var WARM = "color-mix(in srgb,color-mix(in srgb,var(--kit-accent) 60%,#ff7a1a) 8%,transparent)";
  var VIGNETTE = "radial-gradient(1300px 1700px at 50% 42%,transparent 55%,rgb(0 0 0/.65))";
  var GRAIN = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";
  var GLASS = "background:linear-gradient(180deg,rgb(255 255 255/.07),rgb(255 255 255/.025));border:1.5px solid rgb(255 255 255/.09);border-radius:32px;box-shadow:inset 0 1px 0 rgb(255 255 255/.10),0 40px 100px rgb(0 0 0/.55)";
  var GLOW_EDGE = "border-color:" + A(50) + ";box-shadow:inset 0 1px 0 rgb(255 255 255/.10),0 0 60px " + A(14) + ",0 40px 100px rgb(0 0 0/.55)";

  var css = [
    /* 底色层：光晕在 ::before（压暗叠在最上面），点阵和颗粒在 ::after */
    ".kit-atmo{overflow:hidden}",
    ".kit-atmo::before,.kit-atmo::after{content:'';position:absolute;inset:0;pointer-events:none}",
    ".kit-atmo::before{background:" + VIGNETTE + ",radial-gradient(900px 700px at 88% 8%," + A(13) + ",transparent 60%),radial-gradient(800px 900px at 0% 78%," + WARM + ",transparent 60%),radial-gradient(1200px 800px at 50% 115%," + A(6) + ",transparent 60%)}",
    ".kit-atmo.is-accent::before{background:radial-gradient(1300px 1700px at 50% 42%,transparent 60%,rgb(0 0 0/.28))}",
    ".kit-atmo::after{background-image:radial-gradient(color-mix(in srgb,var(--kit-ink) 7%,transparent) 1.6px,transparent 1.8px)," + GRAIN + ";background-size:48px 48px,300px 300px;opacity:.55;mix-blend-mode:soft-light}",
    ".kit-atmo.is-accent::after{background-image:" + GRAIN + ";background-size:300px 300px;opacity:.35}",
    /* HUD：四角框住内容区（y 200–1160），进度条在角标那一行右边 */
    ".kit-hud{position:absolute;inset:0;pointer-events:none;z-index:4}",
    ".kit-hud .c{position:absolute;width:56px;height:56px;border:0 solid " + A(55) + "}",
    ".kit-hud .tl{left:40px;top:200px;border-width:3px 0 0 3px}",
    ".kit-hud .tr{right:40px;top:200px;border-width:3px 3px 0 0}",
    ".kit-hud .bl{left:40px;top:1104px;border-width:0 0 3px 3px;opacity:.5}",
    ".kit-hud .br{right:40px;top:1104px;border-width:0 3px 3px 0;opacity:.5}",
    ".kit-progress{position:absolute;right:60px;top:264px;display:flex;gap:10px}",
    ".kit-progress i{width:34px;height:6px;border-radius:3px;background:color-mix(in srgb,var(--kit-ink) 16%,transparent)}",
    ".kit-progress i.on{background:var(--kit-accent);box-shadow:0 0 12px " + A(70) + "}",
    ".kit-kicker.kit-kicker{display:flex;align-items:center;gap:14px}",
    ".kit-kicker.kit-kicker::before{content:'';width:36px;height:4px;border-radius:2px;background:currentColor;box-shadow:0 0 10px currentColor}",
    /* 帧模板的标签、录屏标签、计时面板 */
    ".kit-chip.kit-chip{border-radius:99px;padding:8px 22px;box-shadow:0 0 30px " + A(45) + "}",
    ".kit-label.kit-label{border-radius:14px;box-shadow:0 0 30px " + A(40) + "}",
    ".kit-glass-panel.kit-glass-panel{" + GLASS + ";border-left:1.5px solid " + A(55) + "}",
    /* 组件玻璃皮肤 */
    ".kit-card,.kit-prompt,.kit-tpl,.kit-panel,.kit-chain .cd{" + GLASS + "}",
    ".kit-stream{" + GLASS + ";padding:36px 40px}",
    ".kit-tpl,.kit-panel{border-top:1.5px solid " + A(55) + "}",
    ".kit-card.good,.kit-chain .cd:last-child{" + GLOW_EDGE + "}",
    ".kit-shot-win{border-radius:28px;border:1.5px solid rgb(255 255 255/.12);box-shadow:0 40px 100px rgb(0 0 0/.55)}",
    ".kit-prompt .c{box-shadow:0 0 12px var(--kit-accent)}",
    ".kit-steps .ix{border-radius:28px;box-shadow:0 0 30px " + A(45) + "}",
    ".kit-steps .rail i,.kit-chain .ar{box-shadow:0 0 12px " + A(60) + "}",
    ".kit-chk .bx i{box-shadow:0 0 14px " + A(60) + "}",
    ".kit-num,.kit-acc{text-shadow:0 0 40px " + A(35) + "}",
  ].join("\n");

  var style = document.createElement("style");
  style.setAttribute("data-kit-glow", "");
  style.textContent = css;
  document.head.appendChild(style);
})();
