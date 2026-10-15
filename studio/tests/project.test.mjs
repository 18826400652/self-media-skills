// st init / st doctor / st install / 项目约定
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { doctor } from "../scripts/lib/doctor.mjs";
import { initProject } from "../scripts/lib/init.mjs";
import { install } from "../scripts/lib/install.mjs";
import { DEFAULT_TEMPLATES, findRoot, loadProject, satisfies, TOOLKIT_DIR } from "../scripts/lib/project.mjs";
import { substitute } from "../scripts/lib/new.mjs";

const tmp = (p) => mkdtempSync(join(tmpdir(), p));
const quiet = () => {};
const capture = () => {
  const lines = [];
  return { lines, log: (l) => lines.push(l), text: () => lines.join("\n") };
};

test("findRoot 向上找 studio.json；loadProject 给出绝对路径并带默认值", () => {
  const root = tmp("st-proj-");
  writeFileSync(join(root, "studio.json"), JSON.stringify({ works: "作品" }));
  mkdirSync(join(root, "a/b"), { recursive: true });
  assert.equal(findRoot(join(root, "a/b")), root);
  const p = loadProject(join(root, "a/b"));
  assert.equal(p.abs.works, join(root, "作品"));
  assert.equal(p.abs.templates, join(root, "05-模板"));
  assert.equal(findRoot(tmp("st-none-")), null);
});

test("satisfies：>= 比较三段版本号", () => {
  assert.ok(satisfies("1.2.0", ">=1.0.0"));
  assert.ok(satisfies("1.0.0", ">=1.0.0"));
  assert.ok(!satisfies("1.0.0", ">=1.1.0"));
  assert.ok(satisfies("2.0.0", "1.9.9"));
  assert.ok(satisfies("1.0.0", ""));
});

test("substitute：只换认识的占位符，去掉行尾的「 · 」", () => {
  assert.equal(substitute("{{标题}} · {{角标}}\n回复「{{关键词}}」", { 标题: "A", 角标: "" }), "A\n回复「{{关键词}}」");
});

test("st init：建出骨架，账号填进去，gitignore 改名；再跑一次报错；已有文件不覆盖", () => {
  const dir = join(tmp("st-init-"), "proj");
  mkdirSync(join(dir, "00-规划"), { recursive: true });
  writeFileSync(join(dir, "00-规划/语气指南.md"), "我自己的");
  initProject({ dir, account: "小号", audience: "新手" }, quiet);
  const studio = JSON.parse(readFileSync(join(dir, "studio.json"), "utf8"));
  assert.equal(studio.account, "小号");
  assert.match(studio.toolkit, /^>=\d+\.\d+\.\d+$/);
  assert.ok(existsSync(join(dir, ".gitignore")));
  for (const d of ["00-规划", "01-灵感收集", "02-学习笔记", "03-选题池", "04-作品", "05-模板", "06-品牌资产", "07-复盘"])
    assert.ok(existsSync(join(dir, d)), `缺目录 ${d}`);
  assert.match(readFileSync(join(dir, "00-规划/账号定位.md"), "utf8"), /账号名：小号/);
  assert.equal(JSON.parse(readFileSync(join(dir, "image-cards.config.json"), "utf8")).footer, "@小号");
  assert.equal(readFileSync(join(dir, "00-规划/语气指南.md"), "utf8"), "我自己的");
  assert.match(readFileSync(join(dir, "README.md"), "utf8"), /小号/);
  assert.match(readFileSync(join(dir, ".env.example"), "utf8"), /^DASHSCOPE_API_KEY=$/m);
  assert.doesNotMatch(readFileSync(join(dir, ".env.example"), "utf8"), /WECHAT_APP/, "个人号没有草稿接口，不列公众号密钥");
  for (const f of ["00-规划/平台策略/抖音.md", "00-规划/平台策略/公众号.md", "00-规划/平台策略/小红书.md", "06-品牌资产/视觉规范.md"])
    assert.ok(existsSync(join(dir, f)), `缺 ${f}`);
  assert.ok(!existsSync(join(dir, ".env")), "不替用户建 .env");
  assert.throws(() => initProject({ dir }, quiet), /已经是作品项目/);
});

test("st doctor：新建的项目里，项目、模板、品牌、配置几节没有 ✗（只有参考音色要自备）", () => {
  const dir = join(tmp("st-doc-"), "proj");
  initProject({ dir, account: "小号", audience: "新手" }, quiet);
  const out = capture();
  doctor({ cwd: dir, log: out.log });
  const text = out.text();
  const head = text.slice(0, text.indexOf("\n工具包"));
  assert.match(head, /✓ 模板：全部用工具包默认的/);
  assert.match(head, /✓ 品牌 frame\.md/);
  const fails = head.split("\n").filter((l) => l.includes("✗"));
  // 起步骨架不带参考音色，只允许这一处报 ✗
  for (const l of fails) assert.match(l, /tts\.reference/, l);
});

test("st doctor：没有 .env 给 ⚠ 提示复制 .env.example；有了只报存在，不显示内容", () => {
  const dir = join(tmp("st-doc-"), "proj");
  initProject({ dir }, quiet);
  let out = capture();
  doctor({ cwd: dir, log: out.log });
  assert.match(out.text(), /⚠ 没有 \.env.*\.env\.example/);
  writeFileSync(join(dir, ".env"), "DASHSCOPE_API_KEY=sk-secret\n");
  out = capture();
  doctor({ cwd: dir, log: out.log });
  assert.match(out.text(), /✓ \.env/);
  assert.doesNotMatch(out.text(), /sk-secret/);
});

test("st doctor：登记了系列却没有系列说明，给 ⚠", () => {
  const dir = join(tmp("st-doc-"), "proj");
  initProject({ dir }, quiet);
  writeFileSync(join(dir, "00-规划/系列/系列.json"), JSON.stringify({ 有说明: { label: "有", unit: "期" }, 没说明: { label: "没", unit: "期" } }));
  writeFileSync(join(dir, "00-规划/系列/有说明.md"), "x");
  const out = capture();
  doctor({ cwd: dir, log: out.log });
  assert.match(out.text(), /⚠ 系列没有说明文件.*00-规划\/系列\/没说明\.md/);
  assert.doesNotMatch(out.text(), /有说明\.md/);
});

test("st doctor：缺 faceless-explainer、hyperframes-audio 这两个外部 skill，给 ⚠ 和安装命令", () => {
  const dir = join(tmp("st-doc-"), "proj");
  initProject({ dir }, quiet);
  const out = capture();
  doctor({ cwd: dir, log: out.log, home: tmp("st-home-") });
  assert.match(out.text(), /⚠ 缺外部 skill faceless-explainer.*hyperframes skills update/);
  assert.match(out.text(), /⚠ 缺外部 skill hyperframes-audio/);
});

test("st doctor：项目模板覆盖——改过的认、一样的提醒删、对不上的提醒", () => {
  const dir = join(tmp("st-doc-"), "proj");
  initProject({ dir }, quiet);
  writeFileSync(join(dir, "05-模板/母稿模板.md"), readFileSync(join(DEFAULT_TEMPLATES, "母稿模板.md")));
  writeFileSync(join(dir, "05-模板/场景卡模板.md"), "# 改过\n");
  writeFileSync(join(dir, "05-模板/拼错模板.md"), "x");
  const out = capture();
  doctor({ cwd: dir, log: out.log });
  const text = out.text();
  assert.match(text, /⚠ 模板 05-模板\/母稿模板\.md 和默认的一模一样/);
  assert.match(text, /✓ 模板 05-模板\/场景卡模板\.md：项目自己改过/);
  assert.match(text, /⚠ 模板 05-模板\/拼错模板\.md 不对应任何默认模板/);
  assert.doesNotMatch(text, /README\.md/);
});

test("st doctor：品牌片段写死字体名、配置路径不存在、登记表坏了，都报 ✗ 并返回 1", () => {
  const dir = join(tmp("st-doc-"), "proj");
  initProject({ dir }, quiet);
  writeFileSync(join(dir, "06-品牌资产/hyperframes/brand-x.html"), '<style>.a{font-family: "Noto Sans SC";}</style>');
  writeFileSync(join(dir, "scenario-content.config.json"), JSON.stringify({ voiceGuide: "没有.md" }));
  writeFileSync(join(dir, "00-规划/系列/系列.json"), JSON.stringify({ 坏: { label: "坏" } }));
  const out = capture();
  assert.equal(doctor({ cwd: dir, log: out.log }), 1);
  const text = out.text();
  assert.match(text, /✗ 品牌 brand-x\.html 写死了字体名/);
  assert.match(text, /✗ scenario-content\.config\.json 里的路径不存在：voiceGuide=没有\.md/);
  assert.match(text, /✗ 系列登记表有问题.*坏/);
});

test("st doctor：不在作品项目里，报找不到 studio.json，但仍检查工具包", () => {
  const out = capture();
  assert.equal(doctor({ cwd: tmp("st-none-"), log: out.log }), 1);
  assert.match(out.text(), /✗ 找不到 studio\.json/);
  assert.match(out.text(), /工具包/);
});

test("st install：软链 skill 和命令；旧软链改指向；真实目录不动", () => {
  const home = tmp("st-home-");
  mkdirSync(join(home, ".claude/skills"), { recursive: true });
  symlinkSync("/nowhere", join(home, ".claude/skills/narrated-video"));
  mkdirSync(join(home, ".claude/skills/image-cards"));
  const out = capture();
  const code = install({ home, log: out.log });
  assert.equal(code, 1, "image-cards 是真实目录，应报出来");
  assert.equal(readlinkSync(join(home, ".claude/skills/narrated-video")), join(TOOLKIT_DIR, "narrated-video"));
  assert.equal(readlinkSync(join(home, ".claude/skills/studio")), join(TOOLKIT_DIR, "studio"));
  assert.ok(!lstatSync(join(home, ".claude/skills/image-cards")).isSymbolicLink());
  assert.equal(realpathSync(join(home, ".local/bin/st")), join(TOOLKIT_DIR, "studio/bin/st"));
  assert.equal(realpathSync(join(home, ".local/bin/kv")), join(TOOLKIT_DIR, "knowledge-video/bin/kv"));
  assert.doesNotMatch(out.text(), /依赖没装/, "不加 --deps 时不该断言依赖没装");
});

test("st install：不加 --deps 时提示的是「没检查依赖」，并指向 st doctor", () => {
  const out = capture();
  assert.equal(install({ home: tmp("st-home-"), log: out.log }), 0);
  assert.match(out.text(), /没检查依赖.*st doctor/);
});
