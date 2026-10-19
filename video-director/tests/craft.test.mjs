import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeCraft, checkCraft, craftCounts, craftSummary } from "../scripts/lib/craft.mjs";
import { qaTimes } from "../scripts/lib/douyin-qa.mjs";

const built = { cues: { 钩子: 1, 小票: 5.5, "小票#2": 9 }, segments: [{ id: "s1", start: 0, duration: 5 }, { id: "s2", start: 5, duration: 5 }], total: 10 };

const block = (o) => ({ sel: "#b", box: [100, 300, 500, 800], opacity: 1, shadow: "none", rot: 0, bgImage: false, ...o });
const text = (o) => ({ sel: "#t", box: [100, 1400, 900, 1460], opacity: 1, fontSize: 32, fontWeight: 400, color: "rgb(0,0,0)", text: "字", ...o });
const shot = (seg, t, data = {}) => ({ t, seg, label: "@x", data: { blocks: [], texts: [], materials: [], aestheticOk: [], px: null, ...data } });
const kinds = (frames) => checkCraft(frames).map((i) => i.kind);

test("checkCraft：首帧 46px / 簇约 34% → craft-hook", () => {
  const f = shot("seg-01", 0.8, {
    blocks: [block({ box: [60, 300, 390, 1140] }), block({ box: [450, 300, 910, 1140] })],
    texts: [text({ fontSize: 46 })],
  });
  assert.ok(kinds([f]).includes("craft-hook"));
  assert.ok(!kinds([f]).includes("craft-subject"), "34.4% ≥ 30%，不报主体过小");
});

test("checkCraft：首帧 104px / 簇 49% → 不报 craft-hook", () => {
  const f = shot("seg-01", 0.8, {
    blocks: [block({ box: [100, 200, 1000, 1300] })],
    texts: [text({ fontSize: 104 }), text({ fontSize: 34 }), text({ fontSize: 34 })],
  });
  assert.ok(!kinds([f]).includes("craft-hook"));
});

test("checkCraft：60px 内的块合并成簇；拉远后按单块算", () => {
  const near = shot("seg-01", 1.2, {
    blocks: [block({ box: [60, 300, 390, 1140] }), block({ box: [450, 300, 910, 1140] })],
    texts: [text({ fontSize: 64 })],
  });
  assert.ok(!kinds([near]).includes("craft-subject"));

  const far = shot("seg-01", 1.2, {
    blocks: [block({ box: [60, 300, 390, 1140] }), block({ box: [900, 300, 1040, 1140] })],
    texts: [text({ fontSize: 64 })],
  });
  assert.ok(kinds([far]).includes("craft-subject"));
});

test("checkCraft：全屏背景块不计入主体；只剩背景时不报", () => {
  const onlyBg = shot("seg-01", 1.2, {
    blocks: [block({ box: [0, 0, 1080, 1920] })],
    texts: [text({ fontSize: 64 })],
  });
  assert.ok(!kinds([onlyBg]).includes("craft-subject"));

  const small = shot("seg-01", 1.2, {
    blocks: [block({ box: [0, 0, 1080, 1920] }), block({ box: [100, 300, 500, 800] })],
    texts: [text({ fontSize: 64 })],
  });
  assert.ok(kinds([small]).includes("craft-subject"));
});

test("checkCraft：段内最大字号 76 但中位 42 → craft-type；max/median 1.31 → craft-hierarchy", () => {
  const frames = [
    shot("seg-06", 0.8, { blocks: [block({ box: [100, 230, 900, 1150] })], texts: [text({ fontSize: 76 }), text({ fontSize: 40 }), text({ fontSize: 40 })] }),
    shot("seg-06", 2, { blocks: [block({ box: [100, 230, 900, 1150] })], texts: [text({ fontSize: 42 }), text({ fontSize: 32 }), text({ fontSize: 32 })] }),
    shot("seg-06", 4, { blocks: [block({ box: [100, 230, 900, 1150] })], texts: [text({ fontSize: 42 }), text({ fontSize: 32 }), text({ fontSize: 32 })] }),
    shot("seg-06", 6, { blocks: [block({ box: [100, 230, 900, 1150] })], texts: [text({ fontSize: 42 }), text({ fontSize: 32 }), text({ fontSize: 32 })] }),
  ];
  const ks = kinds(frames);
  assert.ok(ks.includes("craft-type"), "中位 42 < 64");
  assert.ok(ks.includes("craft-hierarchy"), "中位 1.31 < 1.6");
});

test("checkCraft：首帧 104px、max/median 3.06 → 不报 craft-type / craft-hierarchy", () => {
  const f = shot("seg-01", 0.8, {
    blocks: [block({ box: [100, 200, 1000, 1300] })],
    texts: [text({ fontSize: 104 }), text({ fontSize: 34 }), text({ fontSize: 34 })],
  });
  const ks = kinds([f]);
  assert.ok(!ks.includes("craft-type"));
  assert.ok(!ks.includes("craft-hierarchy"));
});

test("checkCraft：内容区空白带 415px → craft-gap；240px 不报", () => {
  const big = shot("seg-01", 1.2, {
    blocks: [block({ box: [100, 300, 900, 700] }), block({ box: [100, 1115, 900, 1150] })],
    texts: [text({ fontSize: 64 })],
  });
  assert.ok(kinds([big]).includes("craft-gap"));

  const ok = shot("seg-01", 1.2, {
    blocks: [block({ box: [100, 300, 900, 700] }), block({ box: [100, 940, 900, 1150] })],
    texts: [text({ fontSize: 64 })],
  });
  assert.ok(!kinds([ok]).includes("craft-gap"));
});

test("checkCraft：9 段里 7 段中心在 ±5% 宽内 → craft-variety；只有 5 段不报", () => {
  const sizes = [200, 300, 400];
  const one = (id, x, w) => shot(id, 1, { blocks: [block({ box: [x - w / 2, 300, x + w / 2, 1100] })], texts: [text({ fontSize: 64 })] });
  const seven = [540, 540, 540, 540, 540, 540, 540, 200, 900].map((x, i) => one("s" + i, x, sizes[i % 3]));
  assert.ok(kinds(seven).includes("craft-variety"));
  const five = [540, 540, 540, 540, 540, 200, 300, 900, 950].map((x, i) => one("s" + i, x, sizes[i % 3]));
  assert.ok(!kinds(five).includes("craft-variety"));
});

test("checkCraft：材质 0/4 报；只有 rotate(-4deg) 1/4 仍报；4/4 不报", () => {
  const flat = shot("s1", 1, { blocks: [block({ box: [100, 300, 500, 800], shadow: "0 0 10px rgba(0,0,0,.2)" })], texts: [text({ fontSize: 64 })] });
  assert.ok(kinds([flat]).includes("craft-material"));

  const rotated = shot("s1", 1, { blocks: [block({ box: [100, 300, 500, 800], shadow: "0 0 10px rgba(0,0,0,.2)", rot: -4 })], texts: [text({ fontSize: 64 })] });
  assert.ok(kinds([rotated]).includes("craft-material"));

  const full = shot("s1", 1, {
    blocks: [block({ box: [100, 300, 500, 800], rot: -4, shadow: "0 1px 0 rgba(255,255,255,.9) inset, 0 0 0 2px rgba(0,0,0,.9), 24px 40px 60px rgba(0,0,0,.2)" })],
    texts: [text({ fontSize: 64 })],
    materials: ["grain", "vignette"],
  });
  assert.ok(!kinds([full]).includes("craft-material"));
});

test("checkCraft：旧工程只有 elements → []，不抛错", () => {
  assert.deepEqual(checkCraft([{ t: 1, seg: "s1", data: { elements: [] } }]), []);
  assert.deepEqual(analyzeCraft([{ t: 1, seg: "s1", data: { elements: [] } }]).segments, []);
});

test("checkCraft：data-vd-aesthetic-ok 的段全部豁免", () => {
  const f1 = shot("seg-01", 0.8, { aestheticOk: ["seg-01"], texts: [text({ fontSize: 46 })] });
  const f2 = shot("seg-02", 0.8, { texts: [text({ fontSize: 46 })] });
  const out = checkCraft([f1, f2]);
  assert.ok(!out.some((i) => i.sel === "seg-01"));
  assert.ok(out.some((i) => i.sel === "seg-02"));
});

test("checkCraft：所有 issue 都是 warn", () => {
  const f = shot("seg-01", 0.8, { blocks: [block({ box: [100, 300, 500, 800] })], texts: [text({ fontSize: 46 })] });
  assert.ok(checkCraft([f]).length > 0);
  assert.ok(checkCraft([f]).every((i) => i.level === "warn"));
});

test("qaTimes：首帧 0.8 秒排在最前；0.8 秒没有构建的段就不加", () => {
  assert.deepEqual(qaTimes(built, 12).inspect[0], { t: 0.05, label: "开场", seg: "s1" });
  assert.deepEqual(qaTimes(built, 12).inspect[1], { t: 0.8, label: "首帧", seg: "s1" });
  const late = qaTimes({ cues: {}, segments: [{ id: "s3", start: 10, duration: 5 }], total: 15 }, 15);
  assert.ok(!late.inspect.some((x) => x.label === "首帧"));
});

test("craftCounts：只数 craft-*，按类汇总", () => {
  const issues = [
    { kind: "craft-type" }, { kind: "craft-type" }, { kind: "craft-subject" }, { kind: "still" },
  ];
  assert.deepEqual(craftCounts(issues), { type: 2, hierarchy: 0, hook: 0, subject: 1, gap: 0, material: 0, variety: 0 });
});

test("craftSummary：有指标时返回两行；空 craft 返回 null", () => {
  const craft = {
    first: { maxFont: 46, cluster: 35.2 },
    segments: [{ maxFont: 46, cluster: 35.2, gap: 70, id: "s1" }],
    material: { score: 1 },
    variety: { centered: 8, total: 9 },
    counts: { type: 2, hierarchy: 0, hook: 0, subject: 0, gap: 0, material: 1, variety: 1 },
  };
  const s = craftSummary(craft);
  assert.match(s.metrics, /首帧 46px/);
  assert.match(s.counts, /字阶 2/);
  assert.equal(craftSummary({ segments: [] }), null);
});

test("checkCraft：20px 的小元素填不掉 415px 的空白带；200px 才算", () => {
  const hole = (w) => shot("s1", 1, {
    blocks: [
      block({ box: [100, 300, 900, 700] }),
      block({ box: [100, 1115, 900, 1150] }),
      block({ box: [500, 900, 500 + w, 910] }),
    ],
    texts: [text({ fontSize: 64 })],
  });
  assert.ok(kinds([hole(20)]).includes("craft-gap"));
  assert.ok(!kinds([hole(200)]).includes("craft-gap"));
});

test("checkCraft：2.2% 的旋转块不给材质分；10% 的给", () => {
  const small = shot("s1", 1, { blocks: [block({ box: [100, 300, 200, 500], rot: -4 })], texts: [text({ fontSize: 64 })] });
  const big = shot("s1", 1, { blocks: [block({ box: [100, 300, 400, 900], rot: -4 })], texts: [text({ fontSize: 64 })] });
  assert.equal(analyzeCraft([small]).material.rotation, false);
  assert.equal(analyzeCraft([big]).material.rotation, true);
});

test("checkCraft：2.2% 的多层投影不给材质分；10% 的给", () => {
  const shadow = "0 1px 0 rgba(255,255,255,.9) inset, 0 0 0 2px rgba(0,0,0,.9), 24px 40px 60px rgba(0,0,0,.2)";
  const small = shot("s1", 1, { blocks: [block({ box: [100, 300, 200, 500], shadow })], texts: [text({ fontSize: 64 })] });
  const big = shot("s1", 1, { blocks: [block({ box: [100, 300, 400, 900], shadow })], texts: [text({ fontSize: 64 })] });
  assert.equal(analyzeCraft([small]).material.shadow, false);
  assert.equal(analyzeCraft([big]).material.shadow, true);
});

test("checkCraft：阈值可以从第二个参数覆盖", () => {
  const f = shot("s1", 1, {
    blocks: [block({ box: [100, 300, 900, 700] }), block({ box: [100, 850, 900, 1150] })],
    texts: [text({ fontSize: 96 })],
  });
  assert.ok(!checkCraft([f]).some((i) => i.kind === "craft-type"));
  assert.ok(checkCraft([f], { typeFloor: 100 }).some((i) => i.kind === "craft-type"));
  assert.ok(!checkCraft([f]).some((i) => i.kind === "craft-gap"));
  assert.ok(checkCraft([f], { gapMax: 100 }).some((i) => i.kind === "craft-gap"));
});

test("checkCraft：9 段主体大小都一样 → craft-variety 报\"大小\"", () => {
  const frames = [100, 200, 300, 400, 500, 600, 700, 800, 900].map((x, i) => shot("s" + i, 1, { blocks: [block({ box: [x - 260, 300, x + 260, 1100] })], texts: [text({ fontSize: 64 })] }));
  const msg = checkCraft(frames).find((i) => i.kind === "craft-variety")?.msg ?? "";
  assert.match(msg, /大小/);
});

test("checkCraft：9 段中心都在 540、大小有变化 → 只报\"中心\"", () => {
  const sizes = [200, 300, 400];
  const frames = Array.from({ length: 9 }, (_, i) => shot("s" + i, 1, { blocks: [block({ box: [540 - sizes[i % 3] / 2, 300, 540 + sizes[i % 3] / 2, 1100] })], texts: [text({ fontSize: 64 })] }));
  const msg = checkCraft(frames).find((i) => i.kind === "craft-variety")?.msg ?? "";
  assert.match(msg, /中心/);
  assert.doesNotMatch(msg, /大小/);
});

test("checkCraft：中心分开 + 大小分开 → 不报 craft-variety", () => {
  const sizes = [200, 300, 400];
  const xs = [100, 200, 300, 400, 500, 600, 700, 800, 900];
  const frames = xs.map((x, i) => shot("s" + i, 1, { blocks: [block({ box: [x - sizes[i % 3] / 2, 300, x + sizes[i % 3] / 2, 1100] })], texts: [text({ fontSize: 64 })] }));
  assert.ok(!checkCraft(frames).some((i) => i.kind === "craft-variety"));
});

test("checkCraft：104px 大标题 + 3 行 34px 正文 + 10 个 12px 标签 → 层级不报", () => {
  const texts = [
    text({ fontSize: 104, box: [100, 900, 900, 1000] }),
    ...[0, 1, 2].map((i) => text({ fontSize: 34, box: [100, 300 + i * 60, 900, 360 + i * 60] })),
    ...Array.from({ length: 10 }, (_, i) => text({ fontSize: 12, box: [100, 1100 + i * 12, 300, 1112 + i * 12] })),
  ];
  const f = shot("s1", 1, { blocks: [block({ box: [100, 300, 900, 700] })], texts });
  assert.ok(!checkCraft([f]).some((i) => i.kind === "craft-hierarchy"));
});

test("checkCraft：42px 标题 + 32px 正文 → 层级报", () => {
  const f = shot("s1", 1, { texts: [text({ fontSize: 42, box: [100, 300, 900, 360] }), text({ fontSize: 32, box: [100, 400, 900, 460] })] });
  assert.ok(checkCraft([f]).some((i) => i.kind === "craft-hierarchy"));
});

test("checkCraft：只有一种字号 → 层级报（没有层级）", () => {
  const f = shot("s1", 1, { texts: [text({ fontSize: 64 })] });
  assert.ok(checkCraft([f]).some((i) => i.kind === "craft-hierarchy"));
});

test("frameCraft：返回这一帧的最大字号和主体簇占比", async () => {
  const { frameCraft } = await import("../scripts/lib/craft.mjs");
  const f = { data: { texts: [{ box: [80, 300, 900, 460], fontSize: 104, opacity: 1 }], blocks: [{ box: [100, 280, 980, 1180], opacity: 1 }] } };
  const r = frameCraft(f);
  assert.equal(r.maxFont, 104);
  assert.ok(r.cluster > 30 && r.cluster < 60);
});
