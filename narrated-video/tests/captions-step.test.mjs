// 配音后生成字幕分组（同步帧时长 + 字幕）：nv hf-audio 和 nv hf-build 共用
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildCaptions } from "../scripts/lib/captions-step.mjs";

/** 假的 faceless-explainer：每个脚本把收到的参数追加到 calls.log */
function fakeFe() {
  const fe = mkdtempSync(join(tmpdir(), "nv-fe-"));
  const log = join(fe, "calls.log");
  for (const name of ["audio.mjs", "captions.mjs"]) {
    writeFileSync(join(fe, name), `import { appendFileSync } from "node:fs";\nappendFileSync(${JSON.stringify(log)}, ${JSON.stringify(name)} + " " + process.argv.slice(2).join(" ") + "\\n");\n`);
  }
  return { fe, calls: () => readFileSync(log, "utf8").trim().split("\n") };
}

function project({ storyboard = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "nv-proj-"));
  mkdirSync(join(dir, "compositions"));
  writeFileSync(join(dir, "audio_meta.json"), "{}");
  if (storyboard) writeFileSync(join(dir, "STORYBOARD.md"), "## Frame 1\n\n- duration: 1s\n");
  return dir;
}

test("buildCaptions 依次同步帧时长、生成 caption_groups.json", () => {
  const { fe, calls } = fakeFe();
  const out = buildCaptions(project(), { fe, log: () => {} });
  assert.deepEqual(out, { built: true });
  assert.deepEqual(calls(), [
    "audio.mjs sync-durations --audio-meta ./audio_meta.json --storyboard ./STORYBOARD.md",
    "captions.mjs build --storyboard ./STORYBOARD.md --audio-meta ./audio_meta.json --hyperframes . --out ./caption_groups.json",
  ]);
});

test("buildCaptions 工程里没有 STORYBOARD.md 时跳过", () => {
  const { fe } = fakeFe();
  assert.deepEqual(buildCaptions(project({ storyboard: false }), { fe, log: () => {} }), { skipped: "no-storyboard" });
});

test("buildCaptions 找不到 faceless-explainer 时跳过并说明", () => {
  const msgs = [];
  const out = buildCaptions(project(), { fe: join(tmpdir(), "no-such-fe"), log: (m) => msgs.push(m) });
  assert.deepEqual(out, { skipped: "no-faceless" });
  assert.match(msgs.join("\n"), /faceless-explainer/);
});
