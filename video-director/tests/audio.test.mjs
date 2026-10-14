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
