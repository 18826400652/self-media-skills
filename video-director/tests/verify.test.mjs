import assert from "node:assert/strict";
import { test } from "node:test";

test("verify.evaluate：帧数、时长、声音、尺寸逐项判断", async () => {
  const { evaluate } = await import("../scripts/verify.mjs");
  const streams = [{ codec_type: "video", codec_name: "h264", width: 1080, height: 1920, avg_frame_rate: "30/1" }, { codec_type: "audio", duration: "34.6" }];
  const good = evaluate({ streams, packets: 1038, duration: 34.6, volume: { mean: -22, max: -1.6 }, expected: { width: 1080, height: 1920, duration: 34.6 }, blackSpans: [] });
  assert.equal(good.filter((i) => i.level !== "✓").length, 0);
  const bad = evaluate({ streams: [streams[0]], packets: 900, duration: 34.6, volume: { mean: -91, max: -91 }, expected: { width: 1080, height: 1920, duration: 30 }, blackSpans: [[3, 4.2]] });
  const msgs = bad.map((i) => i.level + i.msg).join("\n");
  assert.match(msgs, /✗帧数 900/);
  assert.match(msgs, /✗时长 34.60 秒，工程是 30 秒/);
  assert.match(msgs, /✗没有声音流/);
  assert.match(msgs, /⚠有 1 段纯黑画面/);
});

test("verify.evaluate：响度离 -14 太远或真峰值过高 → ⚠", async () => {
  const { evaluate } = await import("../scripts/verify.mjs");
  const streams = [{ codec_type: "video", codec_name: "h264", width: 1080, height: 1920, avg_frame_rate: "30/1" }, { codec_type: "audio", duration: "10" }];
  const items = evaluate({ streams, packets: 300, duration: 10, volume: { mean: -20, max: -3 }, expected: {}, blackSpans: [], loudness: { integrated: -21.8, truePeak: -3.4 } });
  assert.match(items.map((i) => i.level + i.msg).join("\n"), /⚠响度 -21\.8 LUFS/);
});
