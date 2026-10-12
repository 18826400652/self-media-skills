import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** 建一个作品目录：files = { 相对路径: 内容（对象自动转 JSON） } */
export function episode(files) {
  const dir = mkdtempSync(join(tmpdir(), "kv-"));
  for (const [p, v] of Object.entries(files)) {
    mkdirSync(join(dir, p, ".."), { recursive: true });
    writeFileSync(join(dir, p), typeof v === "string" ? v : JSON.stringify(v));
  }
  return dir;
}
