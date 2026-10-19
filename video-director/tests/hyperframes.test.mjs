import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { SKILL_DIR, coreEntry, coreRoot, requireCore, requireHf } from "../scripts/lib/hyperframes.mjs";

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

test("coreEntry：用 vd 自己装的那份 @hyperframes/core 打包（工程里不再装）", () => {
  assert.equal(coreEntry(), join(SKILL_DIR, "node_modules/@hyperframes/core/dist/compiler/index.js"));
});

test("requireCore：装了返回目录，没装就报错写明在哪个 skill 目录里怎么装", () => {
  assert.equal(requireCore(), coreRoot());
  assert.throws(
    () => requireCore({ root: "/nowhere/core", skillDir: "/x/video-director" }),
    /video-director 还没装 @hyperframes\/core：cd \/x\/video-director && npm ci（或 st install --deps）/,
  );
});

test("package.json 里 @hyperframes/core 和 hyperframes 钉同一版本（打包器和 CLI 必须同步升级）", () => {
  const pkg = JSON.parse(readFileSync(join(SKILL_DIR, "package.json"), "utf8"));
  assert.equal(pkg.dependencies["@hyperframes/core"], pkg.dependencies.hyperframes);
});

test("装好的 @hyperframes/core 和 hyperframes 版本一致（错版本打包出来的页面和渲染器对不上）", () => {
  const version = (dir) => JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version;
  assert.equal(version(coreRoot()), version(join(SKILL_DIR, "node_modules/hyperframes")));
});
