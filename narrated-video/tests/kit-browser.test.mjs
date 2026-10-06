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

const CHAT = {
  title: "双十一筹备群", count: 5, at: 0, stagger: 0.5,
  messages: [
    { from: "刘总", text: "@你 十分钟后把会议纪要发群里" },
    { from: "我", me: true, doc: { title: "双十一筹备会纪要", tag: "AI 整理", head: ["事项", "负责人", "截止"], rows: [["活动页上线", "小林", "周五"], ["提货点海报重做", "阿杰", "未明确"]], mark: { row: 1, col: 1, at: 1.6 } } },
    { from: "阿杰", text: "？？<b>海报</b> & 我啥时候认领的", tone: "bad" },
  ],
};

test("Kit.chat：消息依次出现，@人高亮，文档卡画红圈，默认标「情景演绎」", opt, async () => {
  const k = await openKitPage({ files: ["kit.js", "kit-scenes.js"] });
  try {
    const r = await k.page.evaluate((o) => {
      const tl = gsap.timeline({ paused: true });
      Kit.chat(tl, "#host", o);
      const vis = () => [...document.querySelectorAll(".kit-chat .msg")].map((m) => Number(getComputedStyle(m).opacity) > 0.5);
      tl.seek(0.3);
      const early = vis();
      tl.seek(4);
      return {
        early, late: vis(),
        staged: document.querySelector(".kit-chat-staged")?.textContent,
        mention: document.querySelector(".kit-chat .bub .kit-acc")?.textContent,
        ring: Number(getComputedStyle(document.querySelector(".kit-chat .doc td .kit-ring path")).opacity),
        bad: document.querySelector(".kit-chat .msg.bad .bub").textContent,
        badHtml: document.querySelector(".kit-chat .msg.bad .bub b") === null,
      };
    }, CHAT);
    assert.deepEqual(r.early, [true, false, false]);
    assert.deepEqual(r.late, [true, true, true]);
    assert.equal(r.staged, "情景演绎");
    assert.equal(r.mention, "@你");
    assert.equal(r.ring, 1);
    assert.equal(r.bad, "？？<b>海报</b> & 我啥时候认领的");
    assert.equal(r.badHtml, true, "消息文字不当成 HTML");
  } finally {
    await k.close();
  }
});

test("Kit.chat：staged false 不显示标签；消息超出高度时整体上推，最后一条在面板里", opt, async () => {
  const k = await openKitPage({ files: ["kit.js", "kit-scenes.js"] });
  try {
    const r = await k.page.evaluate(() => {
      const tl = gsap.timeline({ paused: true });
      const messages = Array.from({ length: 12 }, (_, i) => ({ from: i % 2 ? "小林" : "刘总", text: "第 " + (i + 1) + " 条消息，内容稍微长一点占两行也没关系" }));
      Kit.chat(tl, "#host", { title: "群", staged: false, height: 600, stagger: 0.4, messages });
      tl.seek(10);
      const view = document.querySelector(".kit-chat .view").getBoundingClientRect();
      const last = [...document.querySelectorAll(".kit-chat .msg")].pop().getBoundingClientRect();
      return { staged: !!document.querySelector(".kit-chat-staged"), inside: last.bottom <= view.bottom + 1 && last.top >= view.top };
    });
    assert.deepEqual(r, { staged: false, inside: true });
  } finally {
    await k.close();
  }
});

const ANSWER = {
  source: "DeepSeek 原话 · 实测第 1 轮",
  blocks: [
    { h: "二、待办事项" },
    { table: { head: ["事项", "负责人", "截止时间"], rows: [["活动页出图", "阿杰", "周四下午（最晚）"], ["活动页上线", "小林", "周五"], ["向供应商确认猪肉能否保证量", "王杰", "尽快（未明确具体时间）"]] } },
  ],
  at: 0,
  focus: { row: 2, col: 1, at: 1, note: "其实是「王姐」" },
};

test("Kit.answer：focus 之后面板虚化、那一行放大浮出、圈出单元格、贴便签", opt, async () => {
  const k = await openKitPage({ files: ["kit.js", "kit-scenes.js"] });
  try {
    const r = await k.page.evaluate((o) => {
      const tl = gsap.timeline({ paused: true });
      Kit.answer(tl, "#host", o);
      const lensOp = () => Number(getComputedStyle(document.querySelector(".kit-ans-lens")).opacity);
      tl.seek(0.6);
      const before = { lens: lensOp(), filter: getComputedStyle(document.querySelector(".kit-ans")).filter };
      tl.seek(4);
      return {
        before,
        lens: lensOp(),
        filter: getComputedStyle(document.querySelector(".kit-ans")).filter,
        lensText: document.querySelector(".kit-ans-lens .line").textContent,
        source: document.querySelector(".kit-ans-lens .src").textContent,
        ring: Number(getComputedStyle(document.querySelector(".kit-ans-lens .kit-ring path")).opacity),
        note: document.querySelector(".kit-ans-note").textContent,
        allowOverlap: [...document.querySelectorAll(".kit-ans td, .kit-ans th, .kit-ans h4")].every((n) => n.hasAttribute("data-layout-allow-overlap")),
      };
    }, ANSWER);
    assert.equal(r.before.lens, 0);
    assert.doesNotMatch(r.before.filter, /blur\(1\.6px\)/); // fromTo 会先把 filter 设成起点值 blur(0px)
    assert.equal(r.lens, 1);
    assert.match(r.filter, /blur\(1\.6px\)/);
    assert.equal(r.lensText, "向供应商确认猪肉能否保证量王杰尽快（未明确具体时间）");
    assert.match(r.source, /DeepSeek 原话 · 实测第 1 轮/);
    assert.equal(r.ring, 1);
    assert.equal(r.note, "其实是「王姐」");
    assert.equal(r.allowOverlap, true, "放大卡片故意盖在表格上：被盖住的文字要逐个标记（hyperframes check 不继承父元素的标记）");
  } finally {
    await k.close();
  }
});

test("Kit.answer：缺 source、focus 行超出、focus 但没有表格，都报中文错误", opt, async () => {
  const k = await openKitPage({ files: ["kit.js", "kit-scenes.js"] });
  try {
    const errs = await k.page.evaluate((o) => {
      const run = (opts) => { try { Kit.answer(gsap.timeline({ paused: true }), "#host", opts); return "ok"; } catch (e) { return e.message; } };
      return [
        run({ ...o, source: undefined }),
        run({ ...o, focus: { row: 3, at: 1 } }),
        run({ source: "x", blocks: [{ p: "一段话" }], focus: { row: 0, at: 1 } }),
        run({ source: "x", blocks: [{ p: "没有 focus 也可以" }] }),
      ];
    }, ANSWER);
    assert.match(errs[0], /缺少 source/);
    assert.match(errs[1], /focus\.row 超出表格行数（共 3 行，从 0 数）/);
    assert.match(errs[2], /focus 需要 blocks 里有表格/);
    assert.equal(errs[3], "ok");
  } finally {
    await k.close();
  }
});
