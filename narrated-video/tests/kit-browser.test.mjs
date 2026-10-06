import assert from "node:assert/strict";
import { test } from "node:test";
import { CHROME_SKIP, openKitPage } from "./helpers/kit-page.mjs";

const opt = { skip: CHROME_SKIP, timeout: 30000 };

test("kit-glow：Kit.look 变成 glow，玻璃卡片和质感层样式生效", opt, async () => {
  const k = await openKitPage({ files: ["kit.js", "kit-glow.js"] });
  try {
    const r = await k.page.evaluate(() => {
      const tl = gsap.timeline({ paused: true });
      Kit.compare(tl, "#host", { bad: { tag: "a", text: "x" }, good: { tag: "b", text: "y" }, at: [0, 0] });
      tl.seek(2);
      const atmo = document.createElement("div");
      atmo.className = "kit-atmo";
      document.body.appendChild(atmo);
      const card = getComputedStyle(document.querySelector(".kit-card.good"));
      const bad = getComputedStyle(document.querySelector(".kit-card.bad"));
      return {
        look: Kit.look,
        radius: card.borderTopLeftRadius,
        glow: card.boxShadow !== bad.boxShadow && card.boxShadow.split("px").length > bad.boxShadow.split("px").length, // 好卡多一层外发光
        atmoBefore: getComputedStyle(atmo, "::before").backgroundImage.startsWith("radial-gradient"),
        atmoAfter: getComputedStyle(atmo, "::after").backgroundImage.includes("data:image/svg+xml"),
      };
    });
    assert.deepEqual(r, { look: "glow", radius: "32px", glow: true, atmoBefore: true, atmoAfter: true });
  } finally {
    await k.close();
  }
});

test("kit-glow：没加载时 Kit.look 是 flat，卡片不变", opt, async () => {
  const k = await openKitPage({ files: ["kit.js"] });
  try {
    const r = await k.page.evaluate(() => {
      const tl = gsap.timeline({ paused: true });
      Kit.compare(tl, "#host", { bad: { tag: "a", text: "x" }, good: { tag: "b", text: "y" }, at: [0, 0] });
      return { look: Kit.look, radius: getComputedStyle(document.querySelector(".kit-card")).borderTopLeftRadius };
    });
    assert.deepEqual(r, { look: "flat", radius: "0px" });
  } finally {
    await k.close();
  }
});

test("marker：glow 下是不透明笔触，涂完关键词变深色字", opt, async () => {
  const k = await openKitPage({ files: ["kit.js", "kit-glow.js"] });
  try {
    const r = await k.page.evaluate(() => {
      const tl = gsap.timeline({ paused: true });
      Kit.marker(tl, "#host", { text: "写未明确", key: "未明确", at: 0.2 });
      tl.seek(3);
      const key = document.querySelector(".kit-key");
      return { opacity: getComputedStyle(key.querySelector("path")).opacity, color: getComputedStyle(key).color };
    });
    assert.equal(r.opacity, "0.92");
    assert.equal(r.color, "rgb(17, 17, 17)"); // 默认 token bg #111111
  } finally {
    await k.close();
  }
});
