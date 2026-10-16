import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { initProject } from "../scripts/lib/init.mjs";
import { hfBin } from "../scripts/lib/hyperframes.mjs";

const TEMPLATES = new URL("../templates/", import.meta.url).pathname;
/** 假 hyperframes init：建目录，放一个 blank 示例的 index.html */
const fakeHf = (calls) => (args) => {
  calls.push(args);
  mkdirSync(args[1], { recursive: true });
  writeFileSync(join(args[1], "index.html"), "<blank/>");
  writeFileSync(join(args[1], "hyperframes.json"), "{}");
  return { status: 0 };
};

test("initProject：跑 hyperframes init blank（不带 faceless），放 vd 的 index.html、DIRECTOR.md，建 compositions/frames、assets", () => {
  const dir = join(mkdtempSync(join(tmpdir(), "vd-init-")), "抖音");
  const calls = [];
  initProject(dir, { runHf: fakeHf(calls) });
  assert.deepEqual(calls, [["init", dir, "--non-interactive", "--example=blank"]]);
  assert.equal(readFileSync(join(dir, "index.html"), "utf8"), readFileSync(join(TEMPLATES, "index.html"), "utf8"));
  assert.equal(readFileSync(join(dir, "DIRECTOR.md"), "utf8"), readFileSync(join(TEMPLATES, "DIRECTOR.md"), "utf8"));
  assert.ok(existsSync(join(dir, "compositions/frames")));
  assert.ok(existsSync(join(dir, "assets")));
});

test("initProject：目录已存在且不为空 → 报错，不调 hyperframes，原有文件不动", () => {
  const dir = mkdtempSync(join(tmpdir(), "vd-init-"));
  writeFileSync(join(dir, "SCRIPT.md"), "旧的");
  const calls = [];
  assert.throws(() => initProject(dir, { runHf: fakeHf(calls) }), /已存在且不是空目录/);
  assert.equal(calls.length, 0);
  assert.deepEqual(readdirSync(dir), ["SCRIPT.md"]);
  assert.equal(readFileSync(join(dir, "SCRIPT.md"), "utf8"), "旧的");
});

test("initProject：目录存在但是空的 → 照常建", () => {
  const dir = mkdtempSync(join(tmpdir(), "vd-init-"));
  initProject(dir, { runHf: fakeHf([]) });
  assert.ok(existsSync(join(dir, "DIRECTOR.md")));
});

test("initProject：hyperframes init 失败 → 报错带输出", () => {
  const dir = join(mkdtempSync(join(tmpdir(), "vd-init-")), "抖音");
  assert.throws(() => initProject(dir, { runHf: () => ({ status: 1, stderr: "boom" }) }), /hyperframes init 失败：boom/);
});

test("真跑 hyperframes init：产出完整骨架（hyperframes.json、package.json、vd 模板、compositions/frames、assets）", { skip: !existsSync(hfBin()) && "没装 hyperframes" }, async () => {
  const { spawnSync } = await import("node:child_process");
  const dir = join(mkdtempSync(join(tmpdir(), "vd-init-")), "抖音");
  initProject(dir, { runHf: (args) => spawnSync(hfBin(), args, { encoding: "utf8", env: { ...process.env, HYPERFRAMES_SKIP_SKILLS: "1" } }) });
  for (const f of ["hyperframes.json", "package.json"]) assert.ok(existsSync(join(dir, f)), `缺少 ${f}`);
  for (const f of ["index.html", "DIRECTOR.md"]) assert.deepEqual(readFileSync(join(dir, f)), readFileSync(join(TEMPLATES, f)));
  assert.ok(existsSync(join(dir, "compositions/frames")));
  assert.ok(existsSync(join(dir, "assets")));
});
