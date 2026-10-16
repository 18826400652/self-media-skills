// 配音脚本解析与输出文件的测试：node --test tests/*.test.mjs
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { configGate } from "../scripts/lib/config.mjs";
import { parseScript } from "../scripts/lib/shared/script-md.mjs";
import { restoreCase, toCaptionWords, writeOutputs } from "../scripts/vo.mjs";

const chars = (s, t0 = 0, step = 0.1) => [...s].map((ch, i) => ({ text: ch, start: t0 + i * step, end: t0 + (i + 1) * step }));

test("vo 用的 parseScript（shared/script-md）读出帧号、口播、情感和重点词", () => {
  const md = `## Line 1 — 钩子 (Frame 1)\n\n**重点词:** 八秒钟、一下午\n**Emotion:** 惊讶\n\n    AI八秒钟，干完了我一下午的活。\n\n## Line 2 (Frame 2)\n\n    第二句。\n`;
  const lines = parseScript(md);
  assert.equal(lines.length, 2);
  assert.deepEqual([lines[0].frame, lines[0].text, lines[0].emotion], [1, "AI八秒钟，干完了我一下午的活。", "惊讶"]);
  assert.deepEqual(lines[0].keywords, ["八秒钟", "一下午"]);
  assert.equal(lines[1].emotion, "");
});

test("toCaptionWords 按分句切开、重点词单独成段并加 *、中文标点换成英文", () => {
  const words = chars("说好不重复，结果数错了！");
  const out = toCaptionWords(words, ["数错了"]);
  assert.deepEqual(out.map((w) => w.text), ["说好不重复,", "结果", "*数错了!"]);
  assert.equal(out[2].start, words[8].start);
});

test("restoreCase 把 TTS 小写的英文恢复成口播原文写法", () => {
  const words = [{ text: "我", start: 0 }, { text: "让deepseek", start: 0.1 }, { text: "整", start: 0.5 }];
  assert.deepEqual(restoreCase(words, "我让DeepSeek整理").map((w) => w.text), ["我", "让DeepSeek", "整"]);
});

test("toCaptionWords：TTS 把标点和后面的字并成一个时间戳，也要在标点处断句", () => {
  const words = [{ text: "为", start: 0, end: 0.2 }, { text: "啥", start: 0.2, end: 0.4 }, { text: "？AI", start: 0.4, end: 0.8 }, { text: "不", start: 0.8, end: 1 }, { text: "是", start: 1, end: 1.2 }];
  assert.deepEqual(toCaptionWords(words, []).map((w) => w.text), ["为啥?", "AI不是"]);
  assert.deepEqual(toCaptionWords([{ text: "「A/B」", start: 0, end: 1 }], []).map((w) => w.text), ["「A/B」"]);
});

const v = (frame, duration_s) => ({ frame, path: `assets/voice/0${frame}.wav`, duration_s, words: [{ id: "w0", text: `第${frame}句.`, start: 0, end: 0.5 }], chars: [] });

test("writeOutputs：写 audio_meta.json 和 caption_groups.json，不再写 audio_engine_meta.json、cues.js、STORYBOARD", () => {
  const dir = mkdtempSync(join(tmpdir(), "vo-"));
  writeOutputs(dir, [v(1, 1.2), v(2, 0.8)]);
  const meta = JSON.parse(readFileSync(join(dir, "audio_meta.json"), "utf8"));
  assert.deepEqual(Object.keys(meta), ["bgm", "bgm_pending", "voices", "sfx"]);
  assert.deepEqual(meta.sfx, []);
  const caps = JSON.parse(readFileSync(join(dir, "caption_groups.json"), "utf8"));
  assert.deepEqual(caps.groups.map((g) => [g.frame, g.start]), [[1, 0], [2, 1.2]]);
  for (const f of ["audio_engine_meta.json", "compositions/kit/cues.js", "STORYBOARD.md"]) assert.equal(existsSync(join(dir, f)), false, f);
});

test("writeOutputs：重新配音时保留 audio_meta.json 里原有的 sfx（vd build 放的音效不丢）", () => {
  const dir = mkdtempSync(join(tmpdir(), "vo-"));
  const sfx = [{ id: "s1", path: "assets/sfx/ping.wav", start: 1.2 }];
  writeFileSync(join(dir, "audio_meta.json"), JSON.stringify({ bgm: null, bgm_pending: false, voices: [], sfx }));
  writeOutputs(dir, [v(1, 1)]);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, "audio_meta.json"), "utf8")).sfx, sfx);
});

test("configGate：有配置文件 → 放行，没有提示", () => {
  assert.deepEqual(configGate({ configPath: "/p/voiceover.config.json" }, "/p/ep"), { refuse: null, warn: null });
});

test("configGate：没配置、上层有 studio.json → 拒绝并指向 README", () => {
  const root = mkdtempSync(join(tmpdir(), "vo-gate-"));
  writeFileSync(join(root, "studio.json"), "{}");
  const { refuse, warn } = configGate({ configPath: null }, join(root, "ep"));
  assert.equal(warn, null);
  assert.match(refuse, new RegExp(`找到 ${join(root, "studio.json").replace(/[.]/g, "\\.")}`));
  assert.match(refuse, /voiceover\/README\.md/);
});

test("configGate：没配置、也不在作品项目里 → 不拒绝，警告用默认值", () => {
  const dir = mkdtempSync(join(tmpdir(), "vo-gate-"));
  const { refuse, warn } = configGate({ configPath: null }, dir);
  assert.equal(refuse, null);
  assert.match(warn, /^⚠ 没找到 voiceover\.config\.json，用默认配音设置/);
});
