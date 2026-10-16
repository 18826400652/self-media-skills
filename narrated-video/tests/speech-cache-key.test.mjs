// 配音缓存键里的参考音色按文件内容算，不按路径（全流程检查报告 P-42）
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { voiceKeyParts } from "../scripts/lib/speech.mjs";

const tmp = () => mkdtempSync(join(tmpdir(), "nv-ref-"));

test("voiceKeyParts：同一份参考音频换了位置（项目挪目录、复制一份），键不变", () => {
  const a = join(tmp(), "参考音色.wav");
  const b = join(tmp(), "别处", "参考音色.wav");
  writeFileSync(a, "声音A");
  mkdirSync(join(b, ".."), { recursive: true });
  copyFileSync(a, b);
  assert.deepEqual(voiceKeyParts({ style: "s", reference: a }), voiceKeyParts({ style: "s", reference: b }));
});

test("voiceKeyParts：同名文件换了内容，键变", () => {
  const a = join(tmp(), "参考音色.wav");
  writeFileSync(a, "声音A");
  const before = voiceKeyParts({ reference: a });
  writeFileSync(a, "声音B");
  assert.notDeepEqual(voiceKeyParts({ reference: a }), before);
});

test("voiceKeyParts：没填的不进键；style、seed 照旧", () => {
  assert.deepEqual(voiceKeyParts({}), []);
  assert.deepEqual(voiceKeyParts({ style: "s", seed: 3 }), ["s", 3]);
});

test("voiceKeyParts：参考音频不存在时直接报错", () => {
  assert.throws(() => voiceKeyParts({ reference: join(tmp(), "没有.wav") }), /找不到参考音频/);
});
