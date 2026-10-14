import assert from "node:assert/strict";
import { utimesSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { staleCopies } from "../scripts/lib/stale.mjs";
import { project } from "./helpers.mjs";

const old = new Date("2026-10-01T00:00:00Z"), fresh = new Date("2026-10-14T00:00:00Z");

test("staleCopies：抖音/ 里重新配音后，导演工程里的副本比它旧就列出来", () => {
  const dir = project({ "抖音/audio_meta.json": "{}", "抖音/caption_groups.json": "{}", "抖音-director/audio_meta.json": "{}", "抖音-director/caption_groups.json": "{}" });
  for (const f of ["audio_meta.json", "caption_groups.json"]) utimesSync(join(dir, "抖音-director", f), old, old);
  utimesSync(join(dir, "抖音/audio_meta.json"), fresh, fresh);
  utimesSync(join(dir, "抖音/caption_groups.json"), old, old);
  assert.deepEqual(staleCopies(join(dir, "抖音-director")), ["audio_meta.json"]);
});

test("staleCopies：没有 抖音/ 目录或副本更新时返回空", () => {
  assert.deepEqual(staleCopies(project({ "x/audio_meta.json": "{}" }) + "/x"), []);
});
