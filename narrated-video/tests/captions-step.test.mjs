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

test("keepMtimeIfUnchanged：内容没变就恢复原来的修改时间；变了就保留新时间", async () => {
  const { utimesSync, statSync } = await import("node:fs");
  const { keepMtimeIfUnchanged } = await import("../scripts/lib/captions-step.mjs");
  const dir = project();
  const f = join(dir, "STORYBOARD.md");
  utimesSync(f, 1000, 1000);
  keepMtimeIfUnchanged(f, () => writeFileSync(f, readFileSync(f, "utf8")));
  assert.equal(Math.round(statSync(f).mtimeMs / 1000), 1000);
  keepMtimeIfUnchanged(f, () => writeFileSync(f, "## Frame 1\n\n- duration: 2.5s\n"));
  assert.notEqual(Math.round(statSync(f).mtimeMs / 1000), 1000);
});

test("buildCaptions quietFontFallback：只滤掉字幕生成的字体回退警告（hf-audio 时字体还没打包），其他输出照常", () => {
  const fe = mkdtempSync(join(tmpdir(), "nv-fe-"));
  writeFileSync(join(fe, "audio.mjs"), "");
  writeFileSync(join(fe, "captions.mjs"), [
    'console.warn("  ⚠ captions: frame.md names font \\"Noto Sans SC\\" but no matching .woff2/.woff/.ttf/.otf was found in assets/fonts — captions will fall back (text may render in the wrong font).");',
    'console.warn("另一条真的警告");',
  ].join("\n"));
  const warned = [];
  assert.deepEqual(buildCaptions(project(), { fe, log: () => {}, quietFontFallback: true, warn: (m) => warned.push(m) }), { built: true });
  assert.deepEqual(warned, ["另一条真的警告"]);
});

test("buildCaptions quietFontFallback：字幕脚本失败时照样报错", () => {
  const fe = mkdtempSync(join(tmpdir(), "nv-fe-"));
  writeFileSync(join(fe, "audio.mjs"), "");
  writeFileSync(join(fe, "captions.mjs"), 'console.error("坏了"); process.exit(2);');
  assert.throws(() => buildCaptions(project(), { fe, log: () => {}, quietFontFallback: true, warn: () => {} }), /captions\.mjs/);
});
