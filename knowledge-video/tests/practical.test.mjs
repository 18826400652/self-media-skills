import assert from "node:assert/strict";
import { test } from "node:test";
import { GATES, STEPS, doneBlocker, gateBlocker, practicalStatus } from "../scripts/lib/practical.mjs";

const allOk = () => Object.fromEntries(STEPS.map((s) => [s.key, { ok: true, why: "" }]));
const gatesPassed = () => Object.fromEntries(GATES.map((g) => [g, { passed: true, at: "2026-10-12", quote: "通过", stale: false }]));
const facts = (o = {}) => ({ steps: { ...allOk(), ...(o.steps ?? {}) }, gates: { ...gatesPassed(), ...(o.gates ?? {}) } });
const notOk = (why = "没做") => ({ ok: false, why });
const unpassed = { passed: false, at: null, quote: null, stale: false };

test("16 步，五个确认节点挂在 2、7、8、9、10", () => {
  assert.equal(STEPS.length, 16);
  assert.deepEqual(STEPS.filter((s) => s.gate).map((s) => [s.n, s.gate]), [[2, "topic"], [7, "script"], [8, "director"], [9, "sample"], [10, "final"]]);
  assert.deepEqual(GATES, ["topic", "script", "director", "sample", "final"]);
  assert.deepEqual(STEPS.map((s) => s.key), ["scenario", "topic", "test", "draft", "feynman", "selfcheck", "script", "director", "sample", "render", "wechat", "xiaohongshu", "douyin", "topics", "record", "retro"]);
});

test("第一个没做完的步骤是下一步；后面的都不显示 ✓", () => {
  const s = practicalStatus(facts({ steps: { test: notOk("实测记录状态不是「已实测」") } }));
  assert.match(s.next, /实测/);
  assert.match(s.next, /已实测/);
  assert.deepEqual(s.rows.filter((r) => r.done).map((r) => r.n), [1, 2]);
});

test("步骤做完但节点没确认 → 等用户确认，后面不算 ✓", () => {
  const s = practicalStatus(facts({ gates: { script: unpassed } }));
  assert.equal(s.waitingFor, "script");
  assert.match(s.next, /等用户确认.*② 脚本/);
  assert.equal(s.rows.find((r) => r.n === 7).gateState, "waiting");
  assert.equal(s.rows.find((r) => r.n === 7).done, false);
  assert.ok(s.rows.filter((r) => r.n > 7).every((r) => !r.done));
});

test("指纹不一致：节点算没通过，显示「确认后改过」", () => {
  const s = practicalStatus(facts({ gates: { script: { passed: true, at: "2026-10-12", quote: "确认", stale: true } } }));
  assert.equal(s.waitingFor, "script");
  assert.equal(s.rows.find((r) => r.n === 7).gateState, "stale");
  assert.match(s.next, /确认后改过/);
});

test("确认后改过：下一步说出改了哪个文件，用户知道要重新看什么", () => {
  const s = practicalStatus(facts({ gates: { director: { passed: true, at: "2026-10-12", quote: "通过", stale: true, changed: ["抖音/DIRECTOR.md"] } } }));
  assert.match(s.next, /确认后改过（抖音\/DIRECTOR\.md）/);
});

test("全部做完 → 下一步「这期做完了」、waitingFor null", () => {
  const s = practicalStatus(facts());
  assert.ok(s.rows.every((r) => r.done));
  assert.equal(s.waitingFor, null);
  assert.equal(s.next, "这期做完了");
});

test("④ 通过后，草稿、发布记录、复盘各算各的：内容写好没存草稿显示「待存草稿」，发布记录写好就 ✓", () => {
  const saved = (key) => ({ ok: false, why: "还没存草稿", content: true });
  const s = practicalStatus(facts({ steps: { wechat: saved(), xiaohongshu: saved(), douyin: saved() } }));
  const row = (n) => s.rows.find((r) => r.n === n);
  assert.equal(row(15).done, true, "发布记录写好了");
  assert.equal(row(16).done, true);
  for (const n of [11, 12, 13]) { assert.equal(row(n).done, false); assert.equal(row(n).note, "内容已写好，待存草稿"); }
  assert.match(s.next, /^11 公众号：内容已写好，只差存草稿：wa draft 公众号\/文章\.md/);
  assert.match(s.next, /用户自己存的.*kv done <作品> wechat/);
  assert.doesNotMatch(s.next, /写 公众号\/文章\.md/);
});

test("④ 通过后内容还没写：下一步照旧是写内容", () => {
  const s = practicalStatus(facts({ steps: { wechat: { ok: false, why: "公众号/文章.md 还是空模板", content: false } } }));
  assert.match(s.next, /^11 公众号：写 公众号\/文章\.md/);
});

test("④ 没通过：后面的步骤都不显示 ✓（草稿要等成片确认）", () => {
  const s = practicalStatus(facts({ gates: { final: unpassed } }));
  assert.ok(s.rows.filter((r) => r.n > 10).every((r) => !r.done));
});

test("第 10 步的做法写清顺序：先渲染、看成片，再写 qa.json", () => {
  const s = practicalStatus(facts({ steps: { render: notOk("x") } }));
  assert.match(s.next, /vd render 抖音 → 看成片 → .*写 qa\.json（qa\.json 要比成片新/);
});

test("gateBlocker：前置步骤和前一个节点", () => {
  assert.equal(gateBlocker(facts({ gates: { topic: unpassed } }), "topic"), null);
  assert.match(gateBlocker(facts({ steps: { topic: notOk("对标只有 2 条") }, gates: { topic: unpassed } }), "topic"), /第 2 步 选题关.*对标只有 2 条/);
  assert.match(gateBlocker(facts({ gates: { topic: unpassed, script: unpassed } }), "script"), /① 选题关/);
  assert.match(gateBlocker(facts({ steps: { selfcheck: notOk("sc check 有 ✗") }, gates: { script: unpassed } }), "script"), /第 6 步 自检/);
  assert.match(gateBlocker(facts({ gates: { script: { passed: true, at: "x", quote: "y", stale: true }, director: unpassed } }), "director"), /② 脚本.*确认后改过/);
  assert.match(gateBlocker(facts(), "nope"), /没有这个确认节点/);
});

test("doneBlocker：只接受三个草稿键；内容没写好或前面没走完时拒绝", () => {
  assert.equal(doneBlocker(facts({ steps: { wechat: notOk("还没存草稿") } }), "wechat"), null);
  assert.match(doneBlocker(facts(), "blog"), /只能记 wechat、xiaohongshu、douyin/);
  assert.match(doneBlocker(facts({ steps: { wechat: { ok: false, why: "公众号/文章.md 还是空模板", content: false } } }), "wechat"), /空模板/);
  assert.match(doneBlocker(facts({ gates: { final: unpassed }, steps: { wechat: notOk("还没存草稿") } }), "wechat"), /④ 成片/);
});

test("doneBlocker：三个平台互不依赖，公众号没存也能记抖音、小红书", () => {
  const f = facts({ steps: { wechat: { ok: false, why: "还没存草稿", content: true }, douyin: notOk("还没存草稿"), xiaohongshu: notOk("还没存草稿") } });
  assert.equal(doneBlocker(f, "douyin"), null);
  assert.equal(doneBlocker(f, "xiaohongshu"), null);
});

test("跳过的平台：显示「不做」、不当下一步、kv done 拒绝，其余照常", () => {
  const f = { ...facts({ steps: { wechat: { ok: false, why: "公众号/文章.md 还是空模板", content: false }, douyin: { ok: false, why: "还没存草稿", content: true } } }), skip: ["wechat"] };
  const s = practicalStatus(f);
  const row = s.rows.find((r) => r.key === "wechat");
  assert.equal(row.skipped, true);
  assert.match(row.note, /不做/);
  assert.match(s.next, /^13 抖音草稿：内容已写好/);
  assert.match(doneBlocker(f, "wechat"), /不做公众号.*skipPlatforms/);
  assert.equal(doneBlocker(f, "douyin"), null);
  const all = practicalStatus({ ...facts({ steps: { wechat: notOk() } }), skip: ["wechat"] });
  assert.equal(all.next, "这期做完了");
});

test("第 14 步更新选题清单：草稿都存完后提示，说清挪到「已做」、补新题", () => {
  const s = practicalStatus(facts({ steps: { topics: notOk("选题清单「已做」里还没有「AI写周报」") } }));
  assert.match(s.next, /^14 更新选题清单：.*已做.*待做.*（现在：选题清单「已做」里还没有「AI写周报」）/);
  assert.equal(s.rows.find((r) => r.n === 14).done, false);
});

const dirFacts = (o = {}) => {
  const steps = Object.fromEntries(STEPS.map((s) => [s.key, { ok: true, why: "" }]));
  const gates = Object.fromEntries(GATES.map((g) => [g, { passed: true, at: "2026-10-15", quote: "通过", stale: false }]));
  return { steps: { ...steps, ...(o.steps ?? {}) }, gates: { ...gates, ...(o.gates ?? {}) } };
};

test("director 做法：等 ③a、样片过期、按 director 做法拦 kv gate", () => {
  const unp = { passed: false, at: null, quote: null, stale: false };
  const w = practicalStatus(dirFacts({ gates: { director: unp, sample: unp, final: unp } }));
  assert.equal(w.waitingFor, "director");
  assert.match(w.next, /③a 导演脚本.*kv gate <作品> director/);
  const s = practicalStatus(dirFacts({ gates: { sample: { ...unp, passed: true, stale: true } } }));
  assert.equal(s.waitingFor, "sample");
  assert.match(s.next, /确认后改过/);
  assert.match(gateBlocker(dirFacts({ gates: { director: unp, sample: unp } }), "sample"), /③a 导演脚本 还没确认/);
  assert.match(gateBlocker(dirFacts(), "storyboard"), /没有这个确认节点：storyboard（可选：topic、script、director、sample、final）/);
  assert.match(doneBlocker(dirFacts({ gates: { final: unp }, steps: { wechat: { ok: false, why: "还没存草稿" } } }), "wechat"), /④ 成片/);
});

test("下一步提示用新命令：第 8 步 vo + vd cues，第 10 步 vd render，不再提 nv", () => {
  const f = dirFacts({ steps: { director: { ok: false, why: "还没配音（vo 抖音）" } } });
  const s = practicalStatus(f);
  assert.match(s.next, /^8 配音 \+ 导演脚本：vo 抖音.*vd cues 抖音 --check/);
  assert.doesNotMatch(JSON.stringify(s), /nv |抖音-director|STORYBOARD/);
  const r = practicalStatus(dirFacts({ steps: { render: { ok: false, why: "还没渲染" } } }));
  assert.match(r.next, /^10 渲染 \+ QA：.*vd render 抖音/);
});

test("复盘没做、④ 已通过、台账里有这期该磨的镜头 → remind 列出名字；没有就不提醒", () => {
  const f = { ...facts({ steps: { retro: notOk() } }), shotQueue: ["dy-shot-diff"] };
  assert.match(practicalStatus(f).remind, /镜头候选该磨了：dy-shot-diff（第 2 次出现）.*dropped/);
  assert.equal(practicalStatus({ ...f, shotQueue: [] }).remind, undefined);
  assert.equal(practicalStatus({ ...facts({ steps: { retro: notOk() }, gates: { final: unpassed } }), shotQueue: ["dy-shot-diff"] }).remind, undefined);
});
