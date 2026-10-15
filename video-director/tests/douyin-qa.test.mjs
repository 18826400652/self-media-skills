import assert from "node:assert/strict";
import { test } from "node:test";
import { checkCues, checkFrame, qaTimes, stillWindows, summarize } from "../scripts/lib/douyin-qa.mjs";

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
    [1.8, "@钩子"], [4.7, "s1 结尾"], [6.3, "@小票"], [9.7, "s2 结尾"], [9.8, "@小票#2"],
  ].sort((a, b) => a[0] - b[0]));
  assert.equal(inspect.find((x) => x.label === "@小票#2").cue, "小票#2");
});

test("qaTimes：@词 在本段最后 0.8 秒内时，截在段结尾前 0.05 秒", () => {
  const { inspect } = qaTimes({ ...built, cues: { 末尾: 4.6 } }, 12);
  assert.equal(inspect.find((x) => x.cue === "末尾").t, 4.95);
});

test("qaTimes：样片时长之外的 @词 和段不查；grid 每 0.5 秒，只到口播结束", () => {
  const r = qaTimes(built, 6);
  assert.deepEqual(r.inspect.map((x) => x.label), ["@钩子", "s1 结尾"]);
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
