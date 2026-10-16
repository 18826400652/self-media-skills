// 配音缓存放哪：同一个作品项目里各期共用（全流程检查报告 P-34）
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { adoptLegacyCache, voiceCacheDir } from "../scripts/lib/voice-cache.mjs";

const tmp = () => mkdtempSync(join(tmpdir(), "vo-cache-"));

test("voiceCacheDir：在作品项目里（有 voiceover.config.json）→ 项目根的 .media/voice-cache，并放 .gitignore 不让缓存进库", () => {
  const root = tmp();
  const work = join(root, "04-作品/系列/01-x/抖音");
  mkdirSync(work, { recursive: true });
  const dir = voiceCacheDir(work, { root, configPath: join(root, "voiceover.config.json") });
  assert.equal(dir, join(root, ".media/voice-cache"));
  assert.ok(existsSync(dir));
  assert.equal(readFileSync(join(root, ".media/.gitignore"), "utf8").trim(), "*");
});

test("voiceCacheDir：不在项目里 → 工程自己的 .media/voice-cache", () => {
  const work = tmp();
  assert.equal(voiceCacheDir(work, { root: work, configPath: null }), join(work, ".media/voice-cache"));
});

test("adoptLegacyCache：工程里旧的缓存搬进共用目录（已有的不覆盖），旧缓存照样能命中", () => {
  const legacy = join(tmp(), "voice-cache");
  const shared = join(tmp(), "voice-cache");
  mkdirSync(legacy);
  mkdirSync(shared);
  writeFileSync(join(legacy, "seg-01-03-aaaa.wav"), "old");
  writeFileSync(join(legacy, "seg-01-03-aaaa.words.json"), "[]");
  writeFileSync(join(legacy, "seg-04-09-bbbb.wav"), "old");
  writeFileSync(join(shared, "seg-04-09-bbbb.wav"), "shared");
  assert.equal(adoptLegacyCache(legacy, shared), 2);
  assert.deepEqual(readdirSync(shared).sort(), ["seg-01-03-aaaa.wav", "seg-01-03-aaaa.words.json", "seg-04-09-bbbb.wav"]);
  assert.equal(readFileSync(join(shared, "seg-04-09-bbbb.wav"), "utf8"), "shared");
  assert.equal(adoptLegacyCache(join(tmp(), "没有"), shared), 0);
  assert.equal(adoptLegacyCache(shared, shared), 0);
});
