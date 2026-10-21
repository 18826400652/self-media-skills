import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDirector, validateDirector } from "../scripts/lib/director.mjs";

const VD = {
  kicker: "AI 概念一分钟 · 第 1 期",
  palette: { bg: "#F1ECE2", ink: "#1C1A17", muted: "#6E675C", accent: "#FFD84D", alert: "#D2372A" },
  segments: [{ id: "seg-01-hook", lines: [1, 2] }, { id: "seg-02-why", lines: [3, 3] }],
  sfx: [{ name: "pop", at: "@编一套", volume: 0.6 }],
  music: null,
  ending: { next: "下一期", question: "你被编过什么？", cta: "评论区说说 ↓", hold: 2 },
  sample: { segments: ["seg-01-hook"], end: "@根本没这条", tail: 0.9 },
};
const SECTIONS = ["## 1. 视觉方案", "## 2. 分段", "## 3. 导演规则自检", "## 4. 音乐", "## 5. 账号固定元素", "## 6. 新增内容", "## 7. 样片范围", "## 8. 组件候选"];
const doc = (vd = VD, extra = "说到 @编一套 时盖章；第二次说到 @资料#2，再到「@根本没这条」。") =>
  ["# 导演脚本", ...SECTIONS.flatMap((s) => [s, extra]), "```json vd", JSON.stringify(vd, null, 2), "```"].join("\n\n");

test("parseDirector：读机器块、@词（含 #序号、全角引号边界），按出现顺序去重", () => {
  const p = parseDirector(doc());
  assert.deepEqual(p.errors, []);
  assert.equal(p.vd.kicker, "AI 概念一分钟 · 第 1 期");
  assert.deepEqual(p.tokens.map((t) => [t.text, t.nth]), [["编一套", 1], ["资料", 2], ["根本没这条", 1]]);
});

test("parseDirector：没有机器块、多个机器块、JSON 坏了都报错", () => {
  assert.match(parseDirector("# x").errors.join(), /缺少 ```json vd 机器块/);
  assert.match(parseDirector(doc() + "\n```json vd\n{}\n```").errors.join(), /只能有一个/);
  assert.match(parseDirector("```json vd\n{bad\n```").errors.join(), /JSON 格式错误/);
});

test("parseDirector：缺章节、自检表留着（待填）都报错", () => {
  const md = doc().replace("## 4. 音乐", "## 4. 配乐");
  assert.match(parseDirector(md).errors.join(), /缺少章节「## 4. 音乐」/);
  assert.match(parseDirector(doc(VD, "（待填）")).errors.join(), /还有（待填）/);
});

test("parseDirector：配色不是 #RRGGBB、sfx 的 at 不是 @词 都报错", () => {
  const bad = { ...VD, palette: { ...VD.palette, ink: "black" }, sfx: [{ name: "pop", at: "2.8", volume: 1 }] };
  const e = parseDirector(doc(bad)).errors.join("\n");
  assert.match(e, /palette.ink 必须是 #RRGGBB/);
  assert.match(e, /sfx\[0\].at 必须写成 @词/);
});

test("parseDirector：ending.next 可以不写或写空（不预告下一期），question、cta 照样必填", () => {
  const { next, ...rest } = VD.ending;
  assert.deepEqual(parseDirector(doc({ ...VD, ending: rest })).errors, []);
  assert.deepEqual(parseDirector(doc({ ...VD, ending: { ...VD.ending, next: "" } })).errors, []);
  assert.match(parseDirector(doc({ ...VD, ending: { ...VD.ending, question: "" } })).errors.join(), /ending\.question 不能为空/);
});

test("validateDirector：分段必须从第 1 句连续覆盖到最后一句", () => {
  const p = parseDirector(doc());
  assert.deepEqual(validateDirector(p, 3), []);
  assert.match(validateDirector(p, 4).join(), /第 4 句没有分到任何段/);
  const gap = parseDirector(doc({ ...VD, segments: [{ id: "a", lines: [1, 1] }, { id: "b", lines: [3, 3] }] }));
  assert.match(validateDirector(gap, 3).join(), /第 2 句没有分到任何段/);
  const dup = parseDirector(doc({ ...VD, segments: [{ id: "a", lines: [1, 2] }, { id: "a", lines: [3, 3] }] }));
  assert.match(validateDirector(dup, 3).join(), /段 id 重复：a/);
});

test("validateDirector：sample.segments 必须是已有的段", () => {
  const p = parseDirector(doc({ ...VD, sample: { segments: ["seg-09"], end: "@编一套", tail: 1 } }));
  assert.match(validateDirector(p, 3).join(), /sample.segments 里的 seg-09 不是已定义的段/);
});

test("parseDirector：反引号里的 @词 是说明文字，不算锚点", () => {
  const p = parseDirector(doc(VD, "写法：动作写成 `@词`，多次出现写 `@词#2`；本段 @编一套。"));
  assert.deepEqual(p.tokens.map((t) => t.text), ["编一套", "根本没这条"]);
});

test("parseDirector：正文里带反引号的 `@词`（不是写法说明里的 `@词`）照样算锚点", () => {
  const p = parseDirector(doc(VD, "说到 `@一百八十多条` 时数字定住，`@一张表#2` 展开；写法说明 `@词`。"));
  assert.deepEqual(p.tokens.map((t) => [t.text, t.nth]), [["一百八十多条", 1], ["一张表", 2], ["编一套", 1], ["根本没这条", 1]]);
});

test("parseDirector：\\@ 是屏幕上的普通 @（如群聊「王总：\\@小林」），不算锚点", () => {
  const p = parseDirector(doc(VD, "气泡写「王总：\\@小林 周三前确认」，说到 @编一套 时盖章。"));
  assert.deepEqual(p.tokens.map((t) => t.text), ["编一套", "根本没这条"]);
});

test("分段可以直接用 dykit 组件：component 名必须是 dy-…，vars 必须是对象", () => {
  const ok = parseDirector(doc({ ...VD, segments: [{ id: "seg-01-hook", lines: [1, 2], component: "dy-scene-title", vars: { title: "x" } }, { id: "seg-02-why", lines: [3, 3] }] }));
  assert.deepEqual(ok.errors, []);
  const bad = parseDirector(doc({ ...VD, segments: [{ id: "a", lines: [1, 3], component: "scene-title", vars: "x" }, { id: "b", lines: [4, 4], vars: ["x"] }] }));
  const e = bad.errors.join("\n");
  assert.match(e, /segments\[0\]\.component 必须是 dykit 组件名（dy-开头）/);
  assert.match(e, /segments\[0\]\.vars 必须是对象/);
  assert.match(e, /segments\[1\]\.vars 必须是对象/);
});

test("组件候选：读第 8 节的表格，跳过表头、分隔行和「无」", () => {
  const table = ["| 画面 | 建议组件名 | 变量 | 来源段 |", "|---|---|---|---|", "| 文件被盖红章 | dy-stamp | text, color | seg-01-hook |", "| 无 | | | |"].join("\n");
  const md = doc().replace("## 8. 组件候选\n\n", `## 8. 组件候选\n\n${table}\n\n`);
  assert.deepEqual(parseDirector(md).candidates, [{ scene: "文件被盖红章", name: "dy-stamp", vars: "text, color", from: "seg-01-hook" }]);
  assert.deepEqual(parseDirector(doc()).candidates, []);
});

test("组件候选：没有第 8 节时报缺章节，候选为空", () => {
  const p = parseDirector(doc().replace("## 8. 组件候选", "## 8. 其他"));
  assert.match(p.errors.join(), /缺少章节「## 8. 组件候选」/);
  assert.deepEqual(p.candidates, []);
});

test("fonts：title、body 只能是 serif 或 sans", () => {
  assert.deepEqual(parseDirector(doc({ ...VD, fonts: { title: "serif", body: "sans" } })).errors, []);
  assert.match(parseDirector(doc({ ...VD, fonts: { title: "宋体" } })).errors.join(), /fonts\.title 只能是 serif 或 sans/);
});

test("组件候选：单元格里的 \\| 是转义的竖线，不分列", () => {
  const table = ["| 画面 | 建议组件名 | 变量 | 来源段 |", "|---|---|---|---|", "| 小票 | dy-receipt | rows（a \\| b）, total | seg-01 |"].join("\n");
  const md = doc().replace("## 8. 组件候选\n\n", `## 8. 组件候选\n\n${table}\n\n`);
  assert.deepEqual(parseDirector(md).candidates, [{ scene: "小票", name: "dy-receipt", vars: "rows（a | b）, total", from: "seg-01" }]);
});

test("parseDirector：组件 vars 的 cues 用「|」隔开几个 @词，每个都是一个锚点（P-36b）", () => {
  const vd = { ...VD, segments: [{ id: "seg-01-hook", lines: [1, 2] }, { id: "seg-02-why", lines: [3, 3], component: "dy-checklist", vars: { items: "a|b", cues: "@编一套|@资料#2" } }] };
  const p = parseDirector(doc(vd, "说到 @根本没这条。"));
  assert.deepEqual(p.tokens.map((t) => [t.text, t.nth]), [["根本没这条", 1], ["编一套", 1], ["资料", 2]]);
});

test("beats：at 必须是 @词，action 在枚举里，el 不能为空", () => {
  const ok = { ...VD, segments: [{ id: "seg-01-hook", lines: [1, 2], beats: [{ at: "@编一套", action: "stamp", el: "#s1-stamp" }] }] };
  assert.deepEqual(parseDirector(doc(ok)).errors, []);
  const bad = { ...VD, segments: [{ id: "seg-01-hook", lines: [1, 2], beats: [{ at: "2.8", action: "闪", el: "" }] }] };
  const e = parseDirector(doc(bad)).errors.join("\n");
  assert.match(e, /beats\[0\]\.at 必须写成 @词/);
  assert.match(e, /beats\[0\]\.action 只能是/);
  assert.match(e, /beats\[0\]\.el 不能为空/);
});

test("beats：不是数组 / 元素不是对象 → 报错", () => {
  const bad = { ...VD, segments: [{ id: "seg-01-hook", lines: [1, 2], beats: "x" }] };
  assert.match(parseDirector(doc(bad)).errors.join("\n"), /beats 必须是数组/);
});

const withSegs = (segments) => parseDirector(doc({ ...VD, segments })).errors.join("\n");

test("checkVd：shot 是 custom 时 reason、need、candidate 都要写", () => {
  const e = withSegs([{ id: "a", lines: [1, 2], shot: "custom" }, { id: "b", lines: [3, 3] }]);
  assert.match(e, /segments\[0\]\.reason/);
  assert.match(e, /segments\[0\]\.need/);
  assert.match(e, /segments\[0\]\.candidate/);
});

test("checkVd：shot 和 component 不能同时写；shot 只能是 dy-shot- 开头或 custom", () => {
  assert.match(withSegs([{ id: "a", lines: [1, 3], shot: "dy-shot-proof", component: "dy-stamp" }]), /shot 和 component 只能写一个/);
  assert.match(withSegs([{ id: "a", lines: [1, 3], shot: "dy-stamp" }]), /segments\[0\]\.shot 必须是 dy-shot- 开头的镜头名或 custom/);
  assert.equal(withSegs([{ id: "a", lines: [1, 3], shot: "dy-shot-proof", vars: {} }]), "");
});

test("checkVd：overlays 每项 shot 是 dy- 开头的镜头或组件（花字 dy-sticker-pop、盖章 dy-stamp 也能叠）、at 写成 @词", () => {
  assert.equal(withSegs([{ id: "a", lines: [1, 3], shot: "dy-shot-proof", overlays: [{ shot: "dy-sticker-pop", at: "@编一套" }, { shot: "dy-stamp", at: "@编一套" }] }]), "");
  const e = withSegs([{ id: "a", lines: [1, 3], shot: "dy-shot-proof", overlays: [{ shot: "sticker", at: "编一套" }] }]);
  assert.match(e, /segments\[0\]\.overlays\[0\]\.shot 必须是 dy- 开头的镜头或组件名/);
  assert.match(e, /segments\[0\]\.overlays\[0\]\.at 必须写成 @词/);
});

test("checkVd：drift 只能是 true / false", () => {
  assert.match(withSegs([{ id: "a", lines: [1, 3], component: "dy-stamp", drift: "yes" }]), /segments\[0\]\.drift 只能是 true 或 false/);
  assert.equal(withSegs([{ id: "a", lines: [1, 3], component: "dy-stamp", drift: false }]), "");
});

test("checkVd：transition 只能是 auto、none 或 pan-left/right/up/down", () => {
  assert.match(withSegs([{ id: "a", lines: [1, 3], transition: "fade" }]), /segments\[0\]\.transition 只能是 auto\|none\|pan-left\|pan-right\|pan-up\|pan-down/);
  assert.equal(withSegs([{ id: "a", lines: [1, 3], transition: "pan-up" }]), "");
});
