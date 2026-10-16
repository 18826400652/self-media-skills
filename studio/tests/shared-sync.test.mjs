// st sync-shared：shared/ 正本 → 各 skill 的拷贝（一行说明 + 正本全文）
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { copyHeader, syncShared } from "../scripts/lib/shared-sync.mjs";
import { TOOLKIT_DIR } from "../scripts/lib/project.mjs";

/** 临时工具包：shared/ 正本 + manifest + 两个 skill 目录 */
function toolkit(manifest, files = {}) {
  const tk = mkdtempSync(join(tmpdir(), "st-shared-"));
  for (const d of ["shared/node", "shared/python", "a/scripts/lib", "b/lib"]) mkdirSync(join(tk, d), { recursive: true });
  writeFileSync(join(tk, "shared/manifest.json"), JSON.stringify(manifest));
  for (const [p, body] of Object.entries(files)) writeFileSync(join(tk, p), body);
  return tk;
}

test("copyHeader：.mjs 用 //，.py 用 #，写明正本位置和怎么改", () => {
  assert.equal(copyHeader("node/x.mjs"), "// 由 shared/node/x.mjs 同步而来，不要在这里改：改正本后跑 st sync-shared\n");
  assert.equal(copyHeader("python/y.py"), "# 由 shared/python/y.py 同步而来，不要在这里改：改正本后跑 st sync-shared\n");
});

test("syncShared：按 manifest 写拷贝（自动建目录），拷贝 = 说明行 + 正本全文", () => {
  const tk = toolkit({ "node/x.mjs": ["a/scripts/lib/shared/x.mjs"], "python/y.py": ["b/lib/y.py"] },
    { "shared/node/x.mjs": "export const x = 1;\n", "shared/python/y.py": "Y = 1\n" });
  const r = syncShared({ toolkit: tk });
  assert.deepEqual(r.changed.sort(), ["a/scripts/lib/shared/x.mjs", "b/lib/y.py"]);
  assert.deepEqual(r.problems, []);
  assert.equal(readFileSync(join(tk, "a/scripts/lib/shared/x.mjs"), "utf8"), copyHeader("node/x.mjs") + "export const x = 1;\n");
  assert.equal(readFileSync(join(tk, "b/lib/y.py"), "utf8"), copyHeader("python/y.py") + "Y = 1\n");
});

test("syncShared：内容已经一致就不重写（不动修改时间）", () => {
  const tk = toolkit({ "node/x.mjs": ["a/scripts/lib/shared/x.mjs"] }, { "shared/node/x.mjs": "export const x = 1;\n" });
  syncShared({ toolkit: tk });
  const p = join(tk, "a/scripts/lib/shared/x.mjs");
  utimesSync(p, 1000, 1000);
  assert.deepEqual(syncShared({ toolkit: tk }).changed, []);
  assert.equal(statSync(p).mtimeMs, 1000 * 1000);
});

test("syncShared --check：拷贝被手改、缺拷贝都列出来，不写文件", () => {
  const tk = toolkit({ "node/x.mjs": ["a/scripts/lib/shared/x.mjs", "b/lib/x.mjs"] }, { "shared/node/x.mjs": "export const x = 1;\n" });
  syncShared({ toolkit: tk });
  writeFileSync(join(tk, "a/scripts/lib/shared/x.mjs"), "被手改了\n");
  writeFileSync(join(tk, "shared/manifest.json"), JSON.stringify({ "node/x.mjs": ["a/scripts/lib/shared/x.mjs", "b/lib/x.mjs", "b/lib/missing.mjs"] }));
  const r = syncShared({ toolkit: tk, check: true });
  assert.deepEqual(r.changed, []);
  assert.equal(r.problems.length, 2);
  assert.match(r.problems.join("\n"), /a\/scripts\/lib\/shared\/x\.mjs 和正本 shared\/node\/x\.mjs 不一致/);
  assert.match(r.problems.join("\n"), /b\/lib\/missing\.mjs 不存在/);
  assert.equal(readFileSync(join(tk, "a/scripts/lib/shared/x.mjs"), "utf8"), "被手改了\n");
  assert.equal(existsSync(join(tk, "b/lib/missing.mjs")), false);
});

test("syncShared：manifest 里有正本不存在 → 报错，一个文件都不写", () => {
  const tk = toolkit({ "node/x.mjs": ["a/scripts/lib/shared/x.mjs"], "node/gone.mjs": ["b/lib/gone.mjs"] }, { "shared/node/x.mjs": "export const x = 1;\n" });
  assert.throws(() => syncShared({ toolkit: tk }), /正本不存在：shared\/node\/gone\.mjs/);
  assert.equal(existsSync(join(tk, "a/scripts/lib/shared/x.mjs")), false);
});

test("syncShared：拷贝所在的 skill 目录不存在 → 报错，不凭空建 skill", () => {
  const tk = toolkit({ "node/x.mjs": ["nope/scripts/x.mjs"] }, { "shared/node/x.mjs": "export const x = 1;\n" });
  assert.throws(() => syncShared({ toolkit: tk }), /skill 目录不存在：nope/);
  assert.equal(existsSync(join(tk, "nope")), false);
});

test("仓库里所有拷贝都和 shared/ 正本一致（改了拷贝没改正本会在这里失败）", () => {
  const { problems } = syncShared({ toolkit: TOOLKIT_DIR, check: true });
  assert.deepEqual(problems, [], "改 shared/ 里的正本，再跑 st sync-shared");
});

test("syncShared：工具包里没有 shared/manifest.json（如 studio 单独拷走）→ 说清楚，不报原始 ENOENT", () => {
  const tk = mkdtempSync(join(tmpdir(), "st-shared-none-"));
  assert.throws(() => syncShared({ toolkit: tk }), (e) => /没找到 shared\/manifest\.json/.test(e.message) && !/ENOENT/.test(e.message));
});
