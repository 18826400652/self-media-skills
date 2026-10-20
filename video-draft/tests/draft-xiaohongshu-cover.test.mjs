// 小红书视频草稿脚本：封面设不上（发布页改版找不到「编辑封面」）时不中断，先存草稿、提醒手动换封面
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const HERE = new URL(".", import.meta.url).pathname;
const run = (scenario) => spawnSync("python3", [`${HERE}fixtures/run_step.py`, `${HERE}../scripts/draft_xiaohongshu.py`, JSON.stringify(scenario)], { encoding: "utf8" });
const COPY = { title: "AI 写会议纪要", paragraphs: ["第一段正文内容足够长一些"], topics: [] };

test("找不到「编辑封面」：不报错退出，照样暂存草稿，结尾提醒手动换封面", () => {
  const r = run({ payload: { video: "a.mp4", copy: "c.md", cover: "/x/01.png" }, copy: COPY, missing: [".cover-edit-entry"] });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /⚠ 封面没设上：找不到「编辑封面」/);
  assert.match(r.stdout, /已暂存到草稿箱/);
  assert.match(r.stdout, /✓ 小红书视频草稿已暂存.*⚠ 封面还是视频第一帧.*01\.png/s);
});

test("封面正常设上：结尾不提醒", () => {
  const r = run({ payload: { video: "a.mp4", copy: "c.md", cover: "/x/01.png" }, copy: COPY });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /封面：01\.png（已上传）/);
  assert.doesNotMatch(r.stdout, /封面还是视频第一帧/);
});
