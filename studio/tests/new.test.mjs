// st new：按系列类型放模板。在临时项目里跑，vd、kv 用假命令代替（不真的初始化 HyperFrames 工程）。
// 运行：node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ST = resolve(dirname(fileURLToPath(import.meta.url)), "../scripts/st.mjs");
const REGISTRY = {
  普通人的AI课: { label: "普通人的 AI 课", unit: "课" },
  AI概念一分钟: { label: "AI 概念一分钟", unit: "期", type: "concept" },
  坏类型: { label: "坏类型", unit: "期", type: "news" },
};

function write(root, rel, content) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), typeof content === "string" ? content : JSON.stringify(content));
}

function sandbox(studio = {}) {
  const root = mkdtempSync(join(tmpdir(), "st-new-"));
  write(root, "studio.json", { account: "测试账号", audience: "测试观众", ...studio });
  write(root, "00-规划/系列/系列.json", REGISTRY);
  // 假 vd：init 建目录并放 DIRECTOR.md（真的 vd init 会放模板），记下参数；假 kv：记下参数
  const bin = join(root, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "vd"), `#!/usr/bin/env bash\nif [[ "$1" == init ]]; then mkdir -p "$2" && echo 模板 > "$2/DIRECTOR.md"; fi\necho "$@" >> "${join(root, "vd.log")}"\n`);
  writeFileSync(join(bin, "kv"), `#!/usr/bin/env bash\necho "$@" >> "${join(root, "kv.log")}"\n`);
  for (const f of ["vd", "kv"]) chmodSync(join(bin, f), 0o755);
  return { root, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } };
}

const run = (sb, ...args) => spawnSync(process.execPath, [ST, "new", ...args], { cwd: join(sb.root, "00-规划"), env: sb.env, encoding: "utf8" });

test("实用技巧系列（没写 type）放场景卡、实测记录、母稿、费曼检查和三平台，并 kv init --fresh", () => {
  const sb = sandbox();
  const r = run(sb, "普通人的AI课", "周报");
  assert.equal(r.status, 0, r.stderr);
  const ep = join(sb.root, "04-作品/普通人的AI课/01-周报");
  for (const f of ["场景卡.md", "实测记录.md", "实测", "母稿.md", "费曼检查.md", "发布记录.md", "公众号/文章.md", "公众号/封面/封面.md", "小红书/文案.md", "抖音/SCRIPT.md", "抖音/发布文案.md"]) {
    assert.ok(existsSync(join(ep, f)), `缺 ${f}`);
  }
  assert.equal(readFileSync(join(sb.root, "vd.log"), "utf8").trim(), `init ${join(ep, "抖音")}`);
  for (const f of ["抖音/SCRIPT.md", "抖音/封面.md", "抖音/发布文案.md", "抖音/DIRECTOR.md"]) assert.ok(existsSync(join(ep, f)), f);
  for (const f of ["抖音/STORYBOARD.md", "抖音/BRIEF.md", "抖音/frame.md", "抖音/.hyperframes/caption-skin.html"]) assert.equal(existsSync(join(ep, f)), false, f);
  assert.ok(!existsSync(join(ep, "小红书/卡片.md")), "小红书发视频，不该再放卡片");
  assert.match(readFileSync(join(ep, "抖音/SCRIPT.md"), "utf8"), /实测记录\.md/);
  assert.equal(readFileSync(join(sb.root, "kv.log"), "utf8").trim(), `init ${ep} --fresh`);
  assert.match(r.stdout, /下一步：kv status 04-作品\/普通人的AI课\/01-周报/);
});

test("账号、观众、账号定位从 studio.json 填进模板；角标带系列和编号", () => {
  const sb = sandbox();
  run(sb, "普通人的AI课", "周报", "--编号", "3");
  const ep = join(sb.root, "04-作品/普通人的AI课/03-周报");
  assert.match(readFileSync(join(ep, "公众号/文章.md"), "utf8"), /author: 测试账号/);
  assert.match(readFileSync(join(ep, "母稿.md"), "utf8"), /测试观众（见 00-规划\/账号定位\.md）/);
  assert.match(readFileSync(join(ep, "抖音/SCRIPT.md"), "utf8"), /普通人的 AI 课 · 第 3 课/);
  assert.match(readFileSync(join(ep, "选题关.md"), "utf8"), /`00-规划\/系列\/普通人的AI课\.md` 里写的/);
  for (const f of ["母稿.md", "选题关.md", "公众号/文章.md", "抖音/SCRIPT.md"]) {
    assert.doesNotMatch(readFileSync(join(ep, f), "utf8"), /\{\{(账号|观众|账号定位|系列说明|标题|角标|系列|编号)\}\}/, f);
  }
});

test("领取方式从 studio.json 的 lead 填进模板，不再写死「粉丝群」", () => {
  const sb = sandbox({ lead: "公众号回复「待办」领" });
  run(sb, "普通人的AI课", "周报");
  const ep = join(sb.root, "04-作品/普通人的AI课/01-周报");
  const files = ["场景卡.md", "母稿.md", "发布记录.md", "小红书/文案.md", "抖音/SCRIPT.md", "抖音/发布文案.md"];
  for (const f of files) {
    const t = readFileSync(join(ep, f), "utf8");
    assert.doesNotMatch(t, /粉丝群|进群|\{\{领取方式\}\}/, f);
  }
  for (const f of ["母稿.md", "发布记录.md", "抖音/SCRIPT.md", "抖音/发布文案.md"]) assert.match(readFileSync(join(ep, f), "utf8"), /公众号回复「待办」领/, f);
});

test("studio.json 没写 lead：模板里提示去 studio.json 填，不替用户编一个入口", () => {
  const sb = sandbox();
  run(sb, "普通人的AI课", "周报");
  const t = readFileSync(join(sb.root, "04-作品/普通人的AI课/01-周报/发布记录.md"), "utf8");
  assert.match(t, /studio\.json 的 lead/);
  assert.doesNotMatch(t, /粉丝群/);
});

test("系列说明不存在时用模板建一份并提醒去填；已有的不动", () => {
  const sb = sandbox();
  const r = run(sb, "普通人的AI课", "周报");
  assert.equal(r.status, 0, r.stderr);
  const doc = join(sb.root, "00-规划/系列/普通人的AI课.md");
  const text = readFileSync(doc, "utf8");
  assert.match(text, /普通人的 AI 课/);
  assert.match(text, /选题硬标准/);
  assert.doesNotMatch(text, /\{\{(账号|观众|账号定位|系列)\}\}/);
  assert.match(r.stdout, /系列说明.*00-规划\/系列\/普通人的AI课\.md/);
  writeFileSync(doc, "我写好的");
  const r2 = run(sb, "普通人的AI课", "第二期");
  assert.equal(readFileSync(doc, "utf8"), "我写好的");
  assert.doesNotMatch(r2.stdout, /系列说明/);
});

test("编号自动递增；kv init 只带 --fresh", () => {
  const sb = sandbox();
  run(sb, "普通人的AI课", "旧的");
  const r = run(sb, "普通人的AI课", "新的");
  assert.equal(r.status, 0, r.stderr);
  const ep = join(sb.root, "04-作品/普通人的AI课/02-新的");
  assert.ok(existsSync(ep));
  assert.equal(readFileSync(join(sb.root, "kv.log"), "utf8").trim().split("\n").pop(), `init ${ep} --fresh`);
});

test("项目 05-模板 里有同名模板就用项目的，其余用默认的", () => {
  const sb = sandbox();
  write(sb.root, "05-模板/场景卡模板.md", "# 我的场景卡：{{标题}}\n");
  run(sb, "普通人的AI课", "周报");
  const ep = join(sb.root, "04-作品/普通人的AI课/01-周报");
  assert.equal(readFileSync(join(ep, "场景卡.md"), "utf8"), "# 我的场景卡：周报\n");
  assert.notEqual(readFileSync(join(ep, "母稿.md"), "utf8").length, 0);
});

test("studio.json 改了目录约定，按新约定建", () => {
  const sb = sandbox({ works: "作品" });
  const r = run(sb, "普通人的AI课", "周报");
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(sb.root, "作品/普通人的AI课/01-周报/场景卡.md")));
});

test("概念科普系列不放实测类文件，SCRIPT 用概念科普模板（17 句、每句有依据行），不跑 kv init", () => {
  const sb = sandbox();
  const r = run(sb, "AI概念一分钟", "MCP");
  assert.equal(r.status, 0, r.stderr);
  const ep = join(sb.root, "04-作品/AI概念一分钟/01-MCP");
  for (const f of ["场景卡.md", "实测记录.md", "实测", "母稿.md", "费曼检查.md", "公众号", "小红书"]) {
    assert.ok(!existsSync(join(ep, f)), `不该有 ${f}`);
  }
  assert.ok(existsSync(join(ep, "发布记录.md")));
  const script = readFileSync(join(ep, "抖音/SCRIPT.md"), "utf8");
  assert.equal((script.match(/^## Line \d+/gm) || []).length, 17);
  assert.equal((script.match(/^\*\*依据:\*\*/gm) || []).length, 17);
  assert.match(script, /AI 概念一分钟 · 第 1 期/);
  assert.match(script, /research\.json/);
  assert.doesNotMatch(script, /实测记录|费曼检查\.md|sc check/);
  assert.match(r.stdout, /knowledge-video/);
  assert.ok(!existsSync(join(sb.root, "kv.log")));
});

test("单篇：按日期建目录，角标是栏目，没有栏目时去掉行尾的「 · 」", () => {
  const sb = sandbox();
  const r = run(sb, "单篇", "测试", "--日期", "2026-10-15");
  assert.equal(r.status, 0, r.stderr);
  const ep = join(sb.root, "04-作品/单篇/2026-10-15-测试");
  assert.ok(existsSync(join(ep, "场景卡.md")));
  assert.doesNotMatch(readFileSync(join(ep, "抖音/SCRIPT.md"), "utf8"), / · $/m);
});

test("--只建抖音：作品已存在时只补抖音工程；已有抖音时报错", () => {
  const sb = sandbox();
  const ep = join(sb.root, "04-作品/普通人的AI课/01-周报");
  mkdirSync(ep, { recursive: true });
  const r = run(sb, "普通人的AI课", "周报", "--编号", "1", "--只建抖音");
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(ep, "抖音/SCRIPT.md")));
  assert.ok(!existsSync(join(ep, "场景卡.md")));
  assert.match(r.stdout, /已补建：04-作品\/普通人的AI课\/01-周报\/抖音\/（作品里的其他文件没动）/);
  assert.doesNotMatch(r.stdout, /已创建/);
  const again = run(sb, "普通人的AI课", "周报", "--编号", "1", "--只建抖音");
  assert.notEqual(again.status, 0);
  assert.match(again.stderr, /已存在/);
});

test("登记表里 type 写错时报错，不建目录", () => {
  const sb = sandbox();
  const r = run(sb, "坏类型", "X");
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /type/);
  assert.ok(!existsSync(join(sb.root, "04-作品/坏类型")));
});

test("暂停的系列不能新建一期", () => {
  const sb = sandbox();
  write(sb.root, "00-规划/系列/系列.json", { 旧系列: { label: "旧", unit: "课", paused: "已暂停" } });
  const r = run(sb, "旧系列", "测试");
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /已暂停/);
});

test("没登记的系列、简称带 /、编号不是数字、用已删除的 --video，都报错", () => {
  const sb = sandbox();
  assert.match(run(sb, "没这个", "X").stderr, /未登记.*普通人的AI课/);
  assert.match(run(sb, "普通人的AI课", "a/b").stderr, /不能有 \//);
  assert.match(run(sb, "普通人的AI课", "X", "--编号", "abc").stderr, /编号应为数字/);
  assert.match(run(sb, "普通人的AI课", "X", "--video", "director").stderr, /未知参数：--video/);
});

test("不在作品项目里时提示先 st init", () => {
  const dir = mkdtempSync(join(tmpdir(), "st-none-"));
  const r = spawnSync(process.execPath, [ST, "new", "a", "b"], { cwd: dir, encoding: "utf8" });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /studio\.json.*st init/);
});
