import assert from "node:assert/strict";
import { test } from "node:test";
import { mixArgs, resolveSfx, voiceListFile } from "../scripts/lib/audio.mjs";

test("voiceListFile：每行一个 file，单引号转义", () => {
  assert.equal(voiceListFile(["/a/01.wav", "/a/it's.wav"]), "file '/a/01.wav'\nfile '/a/it'\\''s.wav'\n");
});

test("mixArgs：每个音效延迟到对应秒数、音量正确，amix 输入数 = 音效 + 1，截到总长", () => {
  const args = mixArgs({ voice: "v.wav", sfx: [{ file: "/s/pop.mp3", at: 2.82, volume: 0.6 }, { file: "/s/a.mp3", at: 13.55, volume: 0.35 }], duration: 63.6, out: "o.wav" });
  const fc = args[args.indexOf("-filter_complex") + 1];
  assert.match(fc, /\[1:a\][^;]*volume=0\.6,adelay=2820\|2820\[s1\]/);
  assert.match(fc, /adelay=13550\|13550\[s2\]/);
  assert.match(fc, /amix=inputs=3:normalize=0,atrim=0:63\.6/);
  assert.equal(args.at(-1), "o.wav");
});

test("mixArgs：没有音效时只截长度", () => {
  const fc = mixArgs({ voice: "v.wav", sfx: [], duration: 10, out: "o.wav" });
  assert.match(fc[fc.indexOf("-filter_complex") + 1], /amix=inputs=1/);
});

test("resolveSfx：@词换成秒数；音效文件不存在、@词没算出来都报错", () => {
  const sfxDir = new URL("./fixtures/", import.meta.url).pathname;
  const exists = (p) => p.endsWith("pop.mp3");
  const r = resolveSfx([{ name: "pop", at: "@编一套", volume: 0.6 }], { "编一套": 2.82 }, sfxDir, exists);
  assert.equal(r[0].at, 2.82);
  assert.match(r[0].file, /pop\.mp3$/);
  assert.throws(() => resolveSfx([{ name: "nope", at: "@编一套", volume: 1 }], { "编一套": 1 }, sfxDir, exists), /音效 nope 不存在/);
  assert.throws(() => resolveSfx([{ name: "pop", at: "@别的", volume: 1 }], {}, sfxDir, exists), /sfx 的 @别的 没有算出时间/);
});

import { mergeSfx, shotSfx } from "../scripts/lib/audio.mjs";

const CATALOG = { components: [
  { id: "dy-shot-stamp", sfx: [{ beat: 2, name: "error", volume: 0.6 }, { beat: 3, name: "chime", volume: 0.5 }] },
  { id: "dy-shot-proof", sfx: [{ at: 0.4, name: "tick" }] },
] };

test("shotSfx：beat 是 cues 的第几拍，换成全片秒数；cues 不够的拍不出声", () => {
  const segs = [{ id: "a", start: 10, duration: 6, component: "dy-shot-stamp", vars: { cues: "1.2|3.4" }, overlays: [] }];
  assert.deepEqual(shotSfx(segs, CATALOG), [{ name: "error", at: 13.4, volume: 0.6 }]);
});

test("shotSfx：没有 cues 的镜头用 at（相对段首）；音量缺省 1；overlay 从自己的 start 算", () => {
  const segs = [{ id: "a", start: 5, duration: 6, component: "dy-shot-proof", vars: {}, overlays: [{ component: "dy-shot-stamp", start: 7, duration: 4, vars: { cues: "0.2|0.5|1" } }] }];
  assert.deepEqual(shotSfx(segs, CATALOG), [{ name: "tick", at: 5.4, volume: 1 }, { name: "error", at: 7.5, volume: 0.6 }, { name: "chime", at: 8, volume: 0.5 }]);
});

test("shotSfx：catalog 里没写 sfx 的组件、手写段都不出声", () => {
  assert.deepEqual(shotSfx([{ id: "a", start: 0, duration: 3, overlays: [] }, { id: "b", start: 3, duration: 3, component: "dy-stamp", vars: {}, overlays: [] }], CATALOG), []);
});

test("mergeSfx：同名音效相差 0.15 秒以内保留导演写的那条；名字不同都保留", () => {
  const director = [{ name: "error", file: "/s/error.mp3", at: 13.5, volume: 0.9 }];
  const shot = [{ name: "error", file: "/s/error.mp3", at: 13.4, volume: 0.6 }, { name: "chime", file: "/s/chime.mp3", at: 13.45, volume: 0.5 }];
  assert.deepEqual(mergeSfx(director, shot), [director[0], shot[1]]);
});

test("resolveSfx：at 已经是秒数（镜头音效）时原样用", () => {
  const exists = (p) => p.endsWith("tick.mp3");
  const r = resolveSfx([{ name: "tick", at: 5.4, volume: 1 }], {}, "/s", exists);
  assert.deepEqual(r, [{ name: "tick", file: "/s/tick.mp3", at: 5.4, volume: 1 }]);
});
