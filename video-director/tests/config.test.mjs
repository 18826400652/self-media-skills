import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { findProjectRoot, loadConfig } from "../scripts/lib/config.mjs";
import { GSAP_FILE } from "../scripts/lib/fonts.mjs";
import { project } from "./helpers.mjs";

const V = { hfVersion: "0.8.143" };
const CFG = { fontsDir: "06-品牌资产/hyperframes/fonts", gsap: "06-品牌资产/hyperframes/gsap.min.js", brandDir: "06-品牌资产/hyperframes", sfxDir: "/s", hfVersion: "0.8.143" };

test("findProjectRoot：从作品子目录向上找到配置", () => {
  const dir = project({ "video-director.config.json": CFG, "04-作品/a/抖音/x.txt": "" });
  assert.equal(findProjectRoot(join(dir, "04-作品/a/抖音")), dir);
});

test("loadConfig：brandDir 转绝对路径；不读别的 skill 的配置，没有 accent", () => {
  const dir = project({ "video-director.config.json": CFG, "other.config.json": { hfKit: { tokens: { accent: "#FFD84D" } } } });
  const c = loadConfig(dir, { hfVersion: "0.8.143" });
  assert.equal(c.brandDir, join(dir, "06-品牌资产/hyperframes"));
  assert.equal("accent" in c, false);
  assert.equal(c.hfVersion, "0.8.143");
});

test("loadConfig：缺配置或缺字段给中文错误", () => {
  assert.throws(() => loadConfig(project({}), V), /找不到 video-director.config.json/);
  assert.throws(() => loadConfig(project({ "video-director.config.json": { fontsDir: "/f", gsap: "/g.js" } }), V), /缺少字段 brandDir/);
});

test("findProjectRoot：一路找不到时报错", () => {
  assert.throws(() => findProjectRoot(project({ "a/b.txt": "" })), /找不到 video-director.config.json/);
});

test("loadConfig：写了 fontsDir、gsap 就用项目里的（相对路径转绝对）", () => {
  const dir = project({ "video-director.config.json": CFG });
  const c = loadConfig(dir, V);
  assert.equal(c.fontsDir, join(dir, "06-品牌资产/hyperframes/fonts"));
  assert.equal(c.gsap, join(dir, "06-品牌资产/hyperframes/gsap.min.js"));
});

test("loadConfig：没写 fontsDir、gsap 时用 vd 自带的（字体由 vd 生成，GSAP 来自 npm 依赖）", () => {
  const { fontsDir, gsap, ...rest } = CFG;
  const c = loadConfig(project({ "video-director.config.json": rest }), V);
  assert.equal(c.fontsDir, null);
  assert.equal(c.gsap, GSAP_FILE);
  assert.ok(existsSync(c.gsap), "GSAP 要随 npm ci 装好");
});

test("loadConfig：没写 hfVersion 就用 vd 自己装的 hyperframes 版本", () => {
  const { hfVersion, ...rest } = CFG;
  const c = loadConfig(project({ "video-director.config.json": rest }), V);
  assert.equal(c.hfVersion, "0.8.143");
});

test("loadConfig：hfVersion 和 vd 装的不一致 → 报错", () => {
  const dir = project({ "video-director.config.json": { ...CFG, hfVersion: "0.8.119" } });
  assert.throws(() => loadConfig(dir, V), /0\.8\.119.*0\.8\.143/);
});

test("hfBin：指向 video-director 自己装的 hyperframes", async () => {
  const { hfBin } = await import("../scripts/lib/hyperframes.mjs");
  assert.match(hfBin(), /video-director\/node_modules\/\.bin\/hyperframes$/);
});

test("loadConfig：craft 阈值有默认值，可以只覆盖一项", () => {
  const c = loadConfig(project({ "video-director.config.json": CFG }), V);
  assert.equal(c.craft.typeFloor, 64);
  assert.equal(c.craft.gapMax, 250);
  const d = loadConfig(project({ "video-director.config.json": { ...CFG, craft: { typeFloor: 100 } } }), V);
  assert.equal(d.craft.typeFloor, 100);
  assert.equal(d.craft.typeRatio, 1.6);
});

test("loadConfig：craft 非法值给中文错误", () => {
  assert.throws(() => loadConfig(project({ "video-director.config.json": { ...CFG, craft: { typeFloor: "big" } } }), V), /craft\.typeFloor 必须是正数/);
  assert.throws(() => loadConfig(project({ "video-director.config.json": { ...CFG, craft: { nope: 1 } } }), V), /craft\.nope 不认识/);
  assert.throws(() => loadConfig(project({ "video-director.config.json": { ...CFG, craft: { hookCluster: 150 } } }), V), /不能超过 100/);
});

test("localDykitDir：环境变量 VD_DYKIT_DIR 优先，其次配置 dykitDir（相对项目根），都没有是 null", async () => {
  const { localDykitDir } = await import("../scripts/lib/config.mjs");
  const dir = project({ "video-director.config.json": { ...CFG, dykitDir: "../hf" } });
  const config = loadConfig(dir, V);
  assert.equal(localDykitDir(config, { VD_DYKIT_DIR: "/env/hf" }), "/env/hf");
  assert.equal(localDykitDir(config, {}), join(dir, "../hf"));
  assert.equal(localDykitDir(loadConfig(project({ "video-director.config.json": CFG }), V), {}), null);
});
