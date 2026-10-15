// 抖音分镜模板的默认值要能过 nv hf-build 的检查（全流程检查报告 P-23、P-24）
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const board = readFileSync(new URL("../templates/抖音/STORYBOARD模板.md", import.meta.url), "utf8");
const frames = board.split(/^## Frame /m).slice(1).map((b) => ({
  n: Number(b.match(/^(\d+)/)[1]),
  build: JSON.parse(b.match(/^- build:\s*(.+)$/m)[1]),
}));

// 字幕带从 y 1160 开始（narrated-video/scripts/hf-build.mjs CAPTION_BAND）；一行 lead 大字连行高要约 120px；
// shot 截图下沿和 lead 之间留 60px，不然 hyperframes check 报 text_occluded
const CAPTION_TOP = 1160;
const LEAD_HEIGHT = 120;
const GAP_BELOW_SHOT = 60;

test("截图帧（shot）下面的 lead：不压截图，也不进字幕带", () => {
  const withLead = frames.filter((f) => f.build.kit?.name === "shot" && f.build.lead);
  assert.ok(withLead.length >= 2);
  for (const { n, build } of withLead) {
    const shotBottom = build.kit.top + build.kit.opts.height;
    assert.ok(build.lead.top - shotBottom >= GAP_BELOW_SHOT, `第 ${n} 帧 lead 离截图下沿太近`);
    assert.ok(CAPTION_TOP - build.lead.top >= LEAD_HEIGHT, `第 ${n} 帧 lead 会压到字幕带`);
  }
});
