import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { findProjectRoot, loadConfig } from "../scripts/lib/config.mjs";
import { project } from "./helpers.mjs";

const CFG = { fontsDir: "06-品牌资产/hyperframes/fonts", gsap: "06-品牌资产/hyperframes/gsap.min.js", brandDir: "06-品牌资产/hyperframes", sfxDir: "/s", hfVersion: "0.8.143" };

test("findProjectRoot：从作品子目录向上找到配置", () => {
  const dir = project({ "video-director.config.json": CFG, "04-作品/a/抖音-director/x.txt": "" });
  assert.equal(findProjectRoot(join(dir, "04-作品/a/抖音-director")), dir);
});

test("loadConfig：brandDir 转绝对路径，读 narrated-video 配置里的强调色", () => {
  const dir = project({ "video-director.config.json": CFG, "narrated-video.config.json": { hfKit: { tokens: { accent: "#FFD84D" } } } });
  const c = loadConfig(dir);
  assert.equal(c.brandDir, join(dir, "06-品牌资产/hyperframes"));
  assert.equal(c.accent, "#FFD84D");
  assert.equal(c.hfVersion, "0.8.143");
});

test("loadConfig：缺配置或缺字段给中文错误", () => {
  assert.throws(() => loadConfig(project({})), /找不到 video-director.config.json/);
  assert.throws(() => loadConfig(project({ "video-director.config.json": { fontsDir: "/f", gsap: "/g.js" } })), /缺少字段 brandDir/);
});

test("findProjectRoot：一路找不到时报错", () => {
  assert.throws(() => findProjectRoot(project({ "a/b.txt": "" })), /找不到 video-director.config.json/);
});

test("loadConfig：字体包和 GSAP 用项目内的相对路径（不依赖别的项目）", () => {
  const dir = project({ "video-director.config.json": CFG });
  const c = loadConfig(dir);
  assert.equal(c.fontsDir, join(dir, "06-品牌资产/hyperframes/fonts"));
  assert.equal(c.gsap, join(dir, "06-品牌资产/hyperframes/gsap.min.js"));
  assert.throws(() => loadConfig(project({ "video-director.config.json": { ...CFG, gsap: undefined } })), /缺少字段 gsap/);
});
