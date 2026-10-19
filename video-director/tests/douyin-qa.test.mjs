import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeCraft, checkComposition, checkCraft, checkCues, checkFrame, craftCounts, craftSummary, emptyWindows, qaTimes, stillWindows, summarize } from "../scripts/lib/douyin-qa.mjs";

const built = {
  cues: { 钩子: 1, 小票: 5.5, "小票#2": 9 },
  segments: [{ id: "s1", start: 0, duration: 5 }, { id: "s2", start: 5, duration: 5 }],
  total: 10,
};
const el = (o) => ({ sel: "#a", text: true, key: false, allowSafe: false, box: [100, 400, 500, 500], opacity: 1, ...o });
const frame = (data, t = 1.8, label = "@钩子") => ({ t, label, data: { elements: [], cueMarks: [], kicker: { visible: true, occludedBy: null }, sig: "", ...data } });

test("qaTimes：@词 后 0.8 秒（不超过本段结尾前 0.05 秒）+ 每段结尾前 0.3 秒，按时间排序", () => {
  const { inspect } = qaTimes(built, 12);
  assert.deepEqual(inspect.map((x) => [x.t, x.label]), [
    [0.8, "首帧"], [1.8, "@钩子"], [4.7, "s1 结尾"], [6.3, "@小票"], [9.7, "s2 结尾"], [9.8, "@小票#2"],
  ].sort((a, b) => a[0] - b[0]));
  assert.equal(inspect.find((x) => x.label === "@小票#2").cue, "小票#2");
});

test("qaTimes：@词 在本段最后 0.8 秒内时，截在段结尾前 0.05 秒", () => {
  const { inspect } = qaTimes({ ...built, cues: { 末尾: 4.6 } }, 12);
  assert.equal(inspect.find((x) => x.cue === "末尾").t, 4.95);
});

test("qaTimes：样片时长之外的 @词 和段不查；grid 每 0.5 秒，只到口播结束", () => {
  const r = qaTimes(built, 6);
  assert.deepEqual(r.inspect.map((x) => x.label), ["首帧", "@钩子", "s1 结尾"]);
  assert.deepEqual(r.grid, [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5]);
  assert.equal(qaTimes(built, 30).grid.at(-1), 9.5);
});

test("checkFrame：出画面、进顶部 / 右侧 / 底部安全区、压字幕带 → ✗", () => {
  const kinds = (e) => checkFrame(frame({ elements: [el(e)] })).map((i) => i.kind);
  assert.deepEqual(kinds({ box: [-40, 400, 300, 500] }), ["out"]);
  assert.deepEqual(kinds({ box: [100, 150, 500, 260] }), ["top"]);
  assert.deepEqual(kinds({ box: [600, 800, 950, 900] }), ["right"]);
  assert.deepEqual(kinds({ box: [600, 400, 950, 500] }), [], "右侧按钮只在 y 760 以下，上半屏可以用到 x 1020");
  assert.deepEqual(kinds({ box: [100, 1500, 500, 1560] }), ["bottom"]);
  assert.deepEqual(kinds({ box: [100, 1150, 500, 1200] }), ["caption"]);
  assert.deepEqual(kinds({}), []);
  assert.deepEqual(kinds({ box: [-1, 400, 900, 500] }), [], "2 像素以内的误差不算");
  const msg = checkFrame(frame({ elements: [el({ box: [100, 150, 500, 260] })] }))[0].msg;
  assert.match(msg, /t=1\.8s（@钩子）#a 进了顶部 200 像素/);
});

test("checkFrame：不是文字也没标 data-vd-key 的不查；data-vd-allow-safe 豁免", () => {
  assert.deepEqual(checkFrame(frame({ elements: [el({ text: false, box: [-40, 0, 300, 100] })] })), []);
  assert.equal(checkFrame(frame({ elements: [el({ text: false, key: true, box: [-40, 0, 300, 100] })] })).length, 1);
  assert.deepEqual(checkFrame(frame({ elements: [el({ allowSafe: true, box: [-40, 0, 300, 100] })] })), []);
});

test("checkFrame：栏目标签被挡 → ✗；看不见时不查", () => {
  const i = checkFrame(frame({ kicker: { visible: true, occludedBy: "#s01-card" } }));
  assert.equal(i[0].kind, "kicker");
  assert.match(i[0].msg, /栏目标签被 #s01-card 挡住/);
  assert.deepEqual(checkFrame(frame({ kicker: { visible: false, occludedBy: "#x" } })), []);
});

test("checkCues：@词 时元素看不见 → ✗；写了不存在的词 → ✗；超出时长的跳过", () => {
  const marks = [{ cue: "钩子", sel: "#a", visible: false }, { cue: "没这个", sel: "#b", visible: true }, { cue: "小票#2", sel: "#c", visible: false }];
  const frames = [frame({ cueMarks: marks }, 1.8, "@钩子")];
  frames[0].cue = "钩子";
  const issues = checkCues(frames, built.cues);
  assert.deepEqual(issues.map((i) => [i.kind, i.sel]), [["cue-hidden", "#a"], ["cue-unknown", "#b"]]);
  assert.match(issues[0].msg, /@钩子（t=1\.8s）时 #a 看不见/);
  assert.match(issues[1].msg, /data-vd-cue="没这个" 不是 DIRECTOR\.md 里的 @词/);
});

test("stillWindows：连续 2 秒签名不变 → 一个窗口；不到 2 秒不算", () => {
  const g = (sigs) => sigs.map((sig, i) => ({ t: i * 0.5, sig }));
  assert.deepEqual(stillWindows(g(["a", "b", "b", "b", "b", "b", "c"])), [{ from: 0.5, to: 2.5 }]);
  assert.deepEqual(stillWindows(g(["a", "b", "b", "b", "b", "c"])), []);
});

test("summarize：同一元素同类问题合并成一条，写次数和第一次的时间", () => {
  const issues = [1, 2, 3].map((t) => ({ level: "error", kind: "top", sel: "#a", t, msg: `t=${t}s #a 进了顶部` }));
  const s = summarize(issues);
  assert.equal(s.length, 1);
  assert.match(s[0].msg, /t=1s #a 进了顶部（共 3 处）/);
});

test("qaTimes：样片段不相邻时，只查构建了的段（中间没构建的段不截图、不进 grid）", () => {
  const b = { cues: { 甲: 1, 乙: 7, 丙: 11 }, segments: [{ id: "s1", start: 0, duration: 5 }, { id: "s3", start: 10, duration: 5 }], total: 15 };
  const r = qaTimes(b, 15);
  assert.deepEqual(r.inspect.map((x) => x.label), ["首帧", "@甲", "s1 结尾", "@丙", "s3 结尾"]);
  assert.ok(!r.grid.some((t) => t >= 5 && t < 10), "没构建的 5–10 秒不比画面");
  assert.ok(r.grid.includes(4.5) && r.grid.includes(10));
});

test("stillWindows：时间不连续（中间跳过没构建的段）就断开，不算 2 秒不动", () => {
  const g = [0, 0.5, 1, 10, 10.5, 11].map((t) => ({ t, sig: "a" }));
  assert.deepEqual(stillWindows(g), []);
});

test("checkCues：data-vd-cue 写成 constructor 这类词也报不存在", () => {
  const frames = [{ t: 1, label: "@x", cue: "x", data: { cueMarks: [{ cue: "constructor", sel: "#k", visible: true }] } }];
  assert.deepEqual(checkCues(frames, { x: 0.2 }).map((i) => i.kind), ["cue-unknown"]);
});

test("emptyWindows：连续 2 秒以上一个内容元素都没有 → 报出时间段", () => {
  const g = (t, n) => ({ t, sig: "", n });
  const grid = [g(11.5, 3), g(12, 0), g(12.5, 0), g(13, 0), g(13.5, 0), g(14, 0), g(14.5, 2)];
  assert.deepEqual(emptyWindows(grid), [{ from: 12, to: 14 }]);
});

test("emptyWindows：空不到 2 秒、或中间断开（没构建的段）→ 不报", () => {
  const g = (t, n) => ({ t, sig: "", n });
  assert.deepEqual(emptyWindows([g(1, 0), g(1.5, 0), g(2, 0), g(2.5, 1)]), []);
  assert.deepEqual(emptyWindows([g(1, 0), g(1.5, 0), g(5, 0), g(5.5, 0)]), []);
});

test("checkComposition：一段里所有截图（@词 时刻和结尾）的内容都在 y 770 以上 → ⚠；段里有一刻铺到下面就不报（结尾收起来是转场）", () => {
  const el = (y1, y2) => ({ sel: "#x", text: "字", key: false, allowSafe: false, box: [100, y1, 900, y2], opacity: 1 });
  const shot = (seg, label, boxes) => ({ t: 3, seg, label, data: { elements: boxes.map(([a, b]) => el(a, b)), cueMarks: [], kicker: { visible: false } } });
  const out = checkComposition([
    shot("seg-01", "@一百八十多条", [[300, 500], [520, 670]]),
    shot("seg-01", "seg-01 结尾", [[300, 420]]),
    shot("seg-02", "@一张表", [[300, 500], [600, 1100]]),
    shot("seg-02", "seg-02 结尾", [[300, 420]]),
    shot("seg-03", "seg-03 结尾", []),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].level, "warn");
  assert.match(out[0].msg, /seg-01 整段内容最低只到 y 670.*字幕带上方一直空着 480 像素/);
});

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
  assert.deepEqual(qaTimes(built, 12).inspect[0], { t: 0.8, label: "首帧", seg: "s1" });
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
