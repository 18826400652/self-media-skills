import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { requireHf } from "../scripts/lib/hyperframes.mjs";

test("requireHf：hyperframes 在就返回它的路径", () => {
  const bin = join(mkdtempSync(join(tmpdir(), "vd-hf-")), "hyperframes");
  writeFileSync(bin, "");
  assert.equal(requireHf({ bin }), bin);
});

test("requireHf：没装就报错，写明在哪个 skill 目录里怎么装", () => {
  assert.throws(
    () => requireHf({ bin: "/nowhere/hyperframes", skillDir: "/x/video-director" }),
    /video-director 还没装 hyperframes：cd \/x\/video-director && npm ci（或 st install --deps）/,
  );
});
