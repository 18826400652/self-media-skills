import assert from "node:assert/strict";
import { test } from "node:test";
import { main } from "../scripts/vd.mjs";
import { project } from "./helpers.mjs";

test("vd cues：DIRECTOR.md 有错时全部列出并返回 1，不写 cues.js", async () => {
  const dir = project({
    "video-director.config.json": { fontsDir: "/f", brandDir: "b", sfxDir: "/s", hfVersion: "0.8.143" },
    "ep/DIRECTOR.md": "# 导演脚本\n没有机器块",
    "ep/audio_meta.json": { voices: [{ frame: 1, duration_s: 1, words: [{ text: "你好", start: 0, end: 1 }] }] },
  });
  const errs = [];
  const orig = console.error;
  console.error = (m) => errs.push(m);
  try { assert.equal(await main(["cues", `${dir}/ep`]), 1); } finally { console.error = orig; }
  assert.match(errs.join("\n"), /缺少 ```json vd 机器块/);
  assert.match(errs.join("\n"), /缺少章节「## 1. 视觉方案」/);
});

test("vd：未知子命令打印用法并返回 2", async () => {
  assert.equal(await main(["nope", "x"]), 2);
});
