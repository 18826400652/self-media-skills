import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { skippedPlatforms } from "../scripts/lib/config.mjs";

const works = join("/p", "04-作品");

test("skipPlatforms：* 对全项目，系列目录名只对这个系列，两者合并", () => {
  const cfg = { skipPlatforms: { "*": ["wechat"], 我做了个: ["xiaohongshu"] } };
  assert.deepEqual(skippedPlatforms(cfg, join(works, "AI替我干活", "01-周报")), ["wechat"]);
  assert.deepEqual(skippedPlatforms(cfg, join(works, "我做了个", "01-记账")), ["wechat", "xiaohongshu"]);
  assert.deepEqual(skippedPlatforms({}, join(works, "x", "01-y")), []);
});

test("skipPlatforms：写错平台名或格式报中文错误", () => {
  assert.throws(() => skippedPlatforms({ skipPlatforms: { "*": ["blog"] } }, "/p/a/b"), /skipPlatforms.*blog.*wechat、xiaohongshu、douyin/);
  assert.throws(() => skippedPlatforms({ skipPlatforms: ["wechat"] }, "/p/a/b"), /skipPlatforms 要写成对象/);
});
