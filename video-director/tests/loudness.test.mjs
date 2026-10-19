import assert from "node:assert/strict";
import { test } from "node:test";
import { parseEbur128 } from "../scripts/lib/loudness.mjs";

const LOG = [
  "  Integrated loudness:",
  "    I:         -14.2 LUFS",
  "    Threshold: -24.7 LUFS",
  "",
  "  Loudness range:",
  "    LRA:         5.9 LU",
  "",
  "  True peak:",
  "    Peak:       -1.3 dBFS",
].join("\n");

test("parseEbur128：读整合响度和真峰值；没有数字时返回 null", () => {
  assert.deepEqual(parseEbur128(LOG), { integrated: -14.2, truePeak: -1.3 });
  assert.equal(parseEbur128("nope"), null);
});

test("parseEbur128：取最后一段 Summary，不吃开头的 -70 LUFS", () => {
  const log = "t: 0.1 I:         -70.0 LUFS\n" + LOG;
  assert.deepEqual(parseEbur128(log), { integrated: -14.2, truePeak: -1.3 });
});
