import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { studioInfo } from "../node/studio-info.mjs";

test("studioInfo：从子目录往上找 studio.json，读 account、audience、lead", () => {
  const root = mkdtempSync(join(tmpdir(), "studio-info-"));
  writeFileSync(join(root, "studio.json"), JSON.stringify({ account: "小林", audience: "上班族", lead: "公众号回复领" }));
  mkdirSync(join(root, "04-作品/a/公众号"), { recursive: true });
  assert.deepEqual(studioInfo(join(root, "04-作品/a/公众号")), { account: "小林", audience: "上班族", lead: "公众号回复领" });
});

test("studioInfo：没有 studio.json、字段没写或还是括号占位 → 空字符串", () => {
  assert.deepEqual(studioInfo(mkdtempSync(join(tmpdir(), "studio-info-"))), { account: "", audience: "", lead: "" });
  const root = mkdtempSync(join(tmpdir(), "studio-info-"));
  writeFileSync(join(root, "studio.json"), JSON.stringify({ account: "（账号名）", audience: "  " }));
  assert.deepEqual(studioInfo(root), { account: "", audience: "", lead: "" });
});

test("studioInfo：studio.json 坏了 → 报错说清是哪个文件", () => {
  const root = mkdtempSync(join(tmpdir(), "studio-info-"));
  writeFileSync(join(root, "studio.json"), "{bad");
  assert.throws(() => studioInfo(root), /studio\.json 不是合法 JSON/);
});
