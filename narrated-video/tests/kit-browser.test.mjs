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

test("kit-glow：底色光晕亮度跟着 --kit-atmo-glow（帧模板用它做慢呼吸）", opt, async () => {
  const k = await openKitPage({ files: ["kit.js", "kit-glow.js"] });
  try {
    const r = await k.page.evaluate(() => {
      const atmo = document.createElement("div");
      atmo.className = "kit-atmo";
      document.body.appendChild(atmo);
      const before = getComputedStyle(atmo, "::before").opacity;
      gsap.timeline({ paused: true }).fromTo(atmo, { "--kit-atmo-glow": 1 }, { "--kit-atmo-glow": 0.7, duration: 1 }, 0).seek(1);
      return { before, after: getComputedStyle(atmo, "::before").opacity };
    });
    assert.deepEqual(r, { before: "1", after: "0.7" });
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

// glow 笔触的左右边界：svg 盒子 + 路径端点 + 圆头笔帽（stroke-width/2），按 viewBox 换算成像素；再加发光
function glowStrokeExtent() {
  const svg = document.querySelector(".kit-key svg");
  const path = svg.querySelector("path");
  const r = svg.getBoundingClientRect();
  const sx = r.width / svg.viewBox.baseVal.width;
  const cap = Number(path.getAttribute("stroke-width")) / 2;
  const xs = path.getAttribute("d").match(/-?[\d.]+/g).map(Number).filter((_, i) => i % 2 === 0);
  const blur = Number(path.style.filter.match(/0px 0px ([\d.]+)px/)?.[1] || 0);
  const host = document.querySelector("#host").getBoundingClientRect();
  return {
    left: r.left + (Math.min(...xs) - cap) * sx - blur - host.left,
    right: host.right - (r.left + (Math.max(...xs) + cap) * sx + blur),
    size: parseFloat(document.querySelector(".kit-line").style.fontSize),
  };
}

for (const [where, key] of [["句尾", "挑三页"], ["句首", "资料太长"]]) {
  test(`marker：glow 关键词在${where}时，笔触和发光不超出宿主`, opt, async () => {
    const k = await openKitPage({ files: ["kit.js", "kit-glow.js"] });
    try {
      const r = await k.page.evaluate(`(() => {
        const tl = gsap.timeline({ paused: true });
        Kit.marker(tl, "#host", { text: "资料太长别整本扔挑三页", key: ${JSON.stringify(key)}, size: 96, at: 0.2 });
        tl.seek(3);
        return (${glowStrokeExtent})();
      })()`);
      assert.ok(r.left >= 0, `左边超出 ${-r.left}px`);
      assert.ok(r.right >= 0, `右边超出 ${-r.right}px`);
    } finally {
      await k.close();
    }
  });
}

test("marker：关键词在句中时字号不额外缩小（只按字数）", opt, async () => {
  const k = await openKitPage({ files: ["kit.js", "kit-glow.js"] });
  try {
    const r = await k.page.evaluate(`(() => {
      const tl = gsap.timeline({ paused: true });
      Kit.marker(tl, "#host", { text: "资料太长别整本扔挑三页", key: "整本", size: 96, at: 0.2 });
      return (${glowStrokeExtent})();
    })()`);
    assert.equal(r.size, Math.floor(960 / 11.3));
  } finally {
    await k.close();
  }
});

test("缓动分角色：主角（数字、换上的新词）expo.out，弹出的小元素（勾、注释）back.out", opt, async () => {
  const k = await openKitPage({ files: ["kit.js"] });
  try {
    const r = await k.page.evaluate(() => {
      const tl = gsap.timeline({ paused: true });
      const easeOf = (el) => tl.getTweensOf(el)[0]?.vars.ease;
      Kit.number(tl, "#host", { value: 8, at: 0 });
      const num = easeOf(document.querySelector(".kit-num"));
      document.querySelector("#host").innerHTML = "";
      Kit.strike(tl, "#host", { from: "旧", to: "新", at: 0 });
      const neu = easeOf(document.querySelector(".kit-strike .kit-acc"));
      document.querySelector("#host").innerHTML = "";
      Kit.annotate(tl, "#host", { text: "列编号", key: "编号", note: "关键", at: 0 });
      const note = easeOf(document.querySelector(".kit-note"));
      return { num, neu, note };
    });
    assert.deepEqual(r, { num: "expo.out", neu: "expo.out", note: "back.out(1.6)" });
  } finally {
    await k.close();
  }
});

test("Kit.attach：问题打进输入框，文件卡飞进附件栏，默认标「示例」", opt, async () => {
  const k = await openKitPage({ files: ["kit.js", "kit-scenes.js"] });
  try {
    const r = await k.page.evaluate(() => {
      const tl = gsap.timeline({ paused: true });
      Kit.attach(tl, "#host", { question: "差旅住宿标准是多少？", file: { name: "报销制度.pdf", meta: "12 页" }, at: 0, askAt: 0.5, fileAt: 1.5 });
      const file = document.querySelector(".kit-att .file");
      const q = document.querySelector(".kit-att .q");
      tl.seek(1.4, false); // false：不压住 onUpdate（打字、数数靠它写字）
      const before = { file: getComputedStyle(file).opacity, q: q.textContent };
      tl.seek(4, false);
      return {
        before,
        after: { file: getComputedStyle(file).opacity, x: gsap.getProperty(file, "x"), q: q.textContent, chip: getComputedStyle(document.querySelector(".kit-att .done")).opacity },
        name: file.textContent.includes("报销制度.pdf"),
        tag: document.querySelector(".kit-att .kit-tag-demo")?.textContent,
      };
    });
    assert.deepEqual(r.before, { file: "0", q: "差旅住宿标准是多少？" });
    assert.deepEqual(r.after, { file: "1", x: 0, q: "差旅住宿标准是多少？", chip: "1" });
    assert.equal(r.name, true);
    assert.equal(r.tag, "示例");
  } finally {
    await k.close();
  }
});

test("Kit.pick：一摞资料落下、页数数上来、打叉，挑出的几页依次飞出排开", opt, async () => {
  const k = await openKitPage({ files: ["kit.js", "kit-scenes.js"] });
  try {
    const r = await k.page.evaluate(() => {
      const tl = gsap.timeline({ paused: true });
      Kit.pick(tl, "#host", { title: "员工手册", total: 186, picks: [{ page: "第 12 页", text: "差旅标准" }, { page: "第 13 页", text: "住宿上限" }], at: 0, rejectAt: 0.8, pickAt: 1.5, tag: false });
      const pages = [...document.querySelectorAll(".kit-pick .pg")];
      tl.seek(1.4, false); // false：不压住 onUpdate（打字、数数靠它写字）
      const before = { pages: pages.map((p) => getComputedStyle(p).opacity), cross: getComputedStyle(document.querySelector(".kit-pick .x path")).opacity };
      tl.seek(4, false);
      return {
        before,
        pages: pages.map((p) => getComputedStyle(p).opacity),
        texts: pages.map((p) => p.querySelector(".tx").textContent),
        count: document.querySelector(".kit-pick .n").textContent,
        stack: getComputedStyle(document.querySelector(".kit-pick .stack")).opacity,
        tag: document.querySelector(".kit-pick .kit-tag-demo"),
      };
    });
    assert.deepEqual(r.before, { pages: ["0", "0"], cross: "1" });
    assert.deepEqual(r.pages, ["1", "1"]);
    assert.deepEqual(r.texts, ["差旅标准", "住宿上限"]);
    assert.equal(r.count, "186");
    assert.ok(Number(r.stack) < 0.6, "挑出后整摞变暗");
    assert.equal(r.tag, null, "tag false 不标「示例」");
  } finally {
    await k.close();
  }
});

test("Kit.pick：不写 rejectAt 就不打叉", opt, async () => {
  const k = await openKitPage({ files: ["kit.js", "kit-scenes.js"] });
  try {
    const n = await k.page.evaluate(() => {
      Kit.pick(gsap.timeline({ paused: true }), "#host", { title: "手册", total: 20, picks: [{ page: "P1", text: "a" }] });
      return document.querySelectorAll(".kit-pick .x").length;
    });
    assert.equal(n, 0);
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
      const view0 = document.querySelector(".kit-chat .view").getBoundingClientRect();
      tl.seek(0.5); // 第一次上推之前：列表应在原位，已出现的消息在面板里
      const first = document.querySelector(".kit-chat .msg").getBoundingClientRect();
      const early = first.top >= view0.top && first.bottom <= view0.bottom;
      tl.seek(10);
      const view = document.querySelector(".kit-chat .view").getBoundingClientRect();
      const last = [...document.querySelectorAll(".kit-chat .msg")].pop().getBoundingClientRect();
      return { staged: !!document.querySelector(".kit-chat-staged"), early, inside: last.bottom <= view.bottom + 1 && last.top >= view.top };
    });
    assert.deepEqual(r, { staged: false, early: true, inside: true });
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
        colWidths: [...document.querySelectorAll(".kit-ans-lens .line > span")].map((n) => n.getBoundingClientRect().width),
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
    assert.ok(r.colWidths[0] > r.colWidths[2], `第一列（事项）要比最后一列宽，实际 ${r.colWidths.map(Math.round).join(" / ")}`);
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

test("Kit.steps：序号块和步骤间距跟着 size 缩放（默认 76 时 110px / 80px 不变；5 步小字号能放进内容区）", opt, async () => {
  const k = await openKitPage({ files: ["kit.js"] });
  try {
    const r = await k.page.evaluate(() => {
      const measure = (size) => {
        const host = document.createElement("div");
        document.body.appendChild(host);
        host.id = "h" + size;
        const tl = gsap.timeline({ paused: true });
        Kit.steps(tl, "#" + host.id, { steps: [1, 2, 3, 4, 5].map((n) => ({ title: "第" + n + "步" })), ...(size ? { size } : {}) });
        tl.seek(10);
        const ix = host.querySelector(".ix");
        const st = getComputedStyle(host.querySelector(".st"));
        return { ix: ix.getBoundingClientRect().height, gap: parseFloat(st.paddingBottom), total: host.querySelector(".kit-steps").getBoundingClientRect().height };
      };
      return { def: measure(0), small: measure(52) };
    });
    assert.equal(r.def.ix, 110);
    assert.equal(r.def.gap, 80);
    assert.equal(r.small.ix, 75);
    assert.equal(r.small.gap, 55);
    assert.ok(r.small.total <= 620, `5 步总高 ${r.small.total}`);
  } finally {
    await k.close();
  }
});
