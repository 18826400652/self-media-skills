// st init / st doctor / st install / 项目约定
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { doctor } from "../scripts/lib/doctor.mjs";
import { initProject } from "../scripts/lib/init.mjs";
import { install } from "../scripts/lib/install.mjs";
import { DEFAULT_TEMPLATES, findRoot, loadProject, satisfies, TOOLKIT_DIR } from "../scripts/lib/project.mjs";
import { substitute } from "../scripts/lib/new.mjs";

const isLink = (p) => {
  try { return lstatSync(p).isSymbolicLink(); } catch { return false; }
};
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
  assert.equal("footer" in JSON.parse(readFileSync(join(dir, "image-cards.config.json"), "utf8")), false, "角标由 ic 从 studio.json 的 account 取");
  assert.equal(readFileSync(join(dir, "00-规划/语气指南.md"), "utf8"), "我自己的");
  assert.match(readFileSync(join(dir, "README.md"), "utf8"), /studio\.json/);
  assert.match(readFileSync(join(dir, ".env.example"), "utf8"), /^DASHSCOPE_API_KEY=$/m);
  assert.doesNotMatch(readFileSync(join(dir, ".env.example"), "utf8"), /WECHAT_APP/, "个人号没有草稿接口，不列公众号密钥");
  for (const f of ["00-规划/平台策略/抖音.md", "00-规划/平台策略/公众号.md", "00-规划/平台策略/小红书.md", "06-品牌资产/视觉规范.md"])
    assert.ok(existsSync(join(dir, f)), `缺 ${f}`);
  assert.ok(!existsSync(join(dir, ".env")), "不替用户建 .env");
  assert.throws(() => initProject({ dir }, quiet), /已经是作品项目/);
});

test("st doctor：新建的项目里，项目、模板、品牌、配置几节没有别的 ✗（只有参考音色、配音人设、公众号名称要自己填）", () => {
  // 假 HOME 里放好 media-use 的音效库，结果不随这台机器装了什么变
  const home = tmp("st-home-");
  mkdirSync(join(home, ".claude/skills/media-use/audio/assets/sfx"), { recursive: true });
  writeFileSync(join(home, ".claude/skills/media-use/audio/assets/sfx/pop.mp3"), "x");
  const dir = join(tmp("st-doc-"), "proj");
  initProject({ dir, account: "小号", audience: "新手", home }, quiet);
  const out = capture();
  doctor({ cwd: dir, log: out.log, home });
  const text = out.text();
  const head = text.slice(0, text.indexOf("\n工具包"));
  assert.match(head, /✓ 模板：全部用工具包默认的/);
  assert.doesNotMatch(head, /✗ 品牌/);
  const fails = head.split("\n").filter((l) => l.includes("✗"));
  // 起步骨架不带参考音色、配音人设和公众号名称还是占位，只允许这三处报 ✗
  for (const l of fails) assert.match(l, /tts\.reference|tts\.style 还是模板占位|account 还是模板占位/, l);
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

test("st doctor：缺外部 skill hyperframes-audio，给 ⚠ 和安装命令", () => {
  const dir = join(tmp("st-doc-"), "proj");
  initProject({ dir }, quiet);
  const out = capture();
  doctor({ cwd: dir, log: out.log, home: tmp("st-home-") });
  assert.match(out.text(), /⚠ 缺外部 skill hyperframes-audio.*hyperframes skills update/);
  assert.doesNotMatch(out.text(), /faceless-explainer/);
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
  symlinkSync("/nowhere", join(home, ".claude/skills/studio"));
  mkdirSync(join(home, ".claude/skills/image-cards"));
  const out = capture();
  const code = install({ home, log: out.log });
  assert.equal(code, 1, "image-cards 是真实目录，应报出来");
  assert.equal(readlinkSync(join(home, ".claude/skills/studio")), join(TOOLKIT_DIR, "studio"));
  assert.ok(!lstatSync(join(home, ".claude/skills/image-cards")).isSymbolicLink());
  assert.equal(realpathSync(join(home, ".local/bin/st")), join(TOOLKIT_DIR, "studio/bin/st"));
  assert.equal(realpathSync(join(home, ".local/bin/kv")), join(TOOLKIT_DIR, "knowledge-video/bin/kv"));
  assert.doesNotMatch(out.text(), /依赖没装/, "不加 --deps 时不该断言依赖没装");
});

test("install：清掉指向本工具包、已经失效的旧软链接（skill 和命令）；别处的链接不动", () => {
  const home = tmp("st-home-");
  const toolkit = tmp("st-toolkit-");
  for (const [skill, cmd] of [["voiceover", "vo"], ["video-draft", "vdraft"]]) {
    mkdirSync(join(toolkit, skill, "bin"), { recursive: true });
    writeFileSync(join(toolkit, skill, "SKILL.md"), "x");
    writeFileSync(join(toolkit, skill, "bin", cmd), "x");
  }
  mkdirSync(join(home, ".claude/skills"), { recursive: true });
  mkdirSync(join(home, ".local/bin"), { recursive: true });
  symlinkSync(join(toolkit, "narrated-video"), join(home, ".claude/skills/narrated-video"));
  symlinkSync(join(toolkit, "narrated-video/bin/nv"), join(home, ".local/bin/nv"));
  symlinkSync("/nowhere", join(home, ".local/bin/other"));
  symlinkSync(`${toolkit}-old/x`, join(home, ".local/bin/sibling"));
  symlinkSync("../nowhere/x", join(home, ".local/bin/relative"));
  install({ home, toolkit, log: () => {} });
  assert.equal(isLink(join(home, ".claude/skills/narrated-video")), false);
  assert.equal(isLink(join(home, ".local/bin/nv")), false);
  assert.equal(readlinkSync(join(home, ".local/bin/other")), "/nowhere");
  assert.equal(readlinkSync(join(home, ".local/bin/sibling")), `${toolkit}-old/x`, "只共享路径前缀的同级目录不算本工具包");
  assert.equal(readlinkSync(join(home, ".local/bin/relative")), "../nowhere/x", "相对路径的失效链接不动");
  assert.equal(readlinkSync(join(home, ".local/bin/vo")), join(toolkit, "voiceover/bin/vo"));
  assert.equal(readlinkSync(join(home, ".local/bin/vdraft")), join(toolkit, "video-draft/bin/vdraft"));
});

test("st install：不加 --deps 时提示的是「没检查依赖」，并指向 st doctor", () => {
  const out = capture();
  assert.equal(install({ home: tmp("st-home-"), log: out.log }), 0);
  assert.match(out.text(), /没检查依赖.*st doctor/);
});

test("作品项目骨架不写死任何真实系列名", () => {
  const html = readFileSync(join(TOOLKIT_DIR, "studio/skeleton/06-品牌资产/hyperframes/brand-kicker.html"), "utf8");
  assert.doesNotMatch(html, /AI 概念一分钟/);
});

test("st init：新项目带 Claude Code 钩子（记工具包命令）、偏好.md、工具问题.md；.gitignore 排除日志和预览图", () => {
  const dir = join(tmp("st-init-"), "proj");
  initProject({ dir }, quiet);
  const settings = JSON.parse(readFileSync(join(dir, ".claude/settings.json"), "utf8"));
  for (const ev of ["PostToolUse", "PostToolUseFailure"]) {
    const h = settings.hooks[ev][0];
    assert.equal(h.matcher, "Bash", ev);
    assert.equal(h.hooks[0].command, "st log-hook", ev);
  }
  assert.ok(existsSync(join(dir, "00-规划/偏好.md")));
  assert.ok(existsSync(join(dir, "07-复盘/工具问题.md")));
  const ignore = readFileSync(join(dir, ".gitignore"), "utf8");
  assert.match(ignore, /^\.studio\/$/m);
  assert.match(ignore, /^预览\.png$/m);
  const claude = readFileSync(join(dir, "CLAUDE.md"), "utf8");
  assert.match(claude, /00-规划\/偏好\.md/);
  assert.match(claude, /07-复盘\/工具问题\.md/);
});

test("st init --update：已有项目只补缺的文件、CLAUDE.md 缺的章节、.gitignore 缺的行；改过的内容不动", () => {
  const dir = join(tmp("st-init-"), "proj");
  initProject({ dir, account: "小号" }, quiet);
  // 模拟老项目：没有新文件，CLAUDE.md 是旧的且被用户改过
  for (const f of [".claude/settings.json", "00-规划/偏好.md", "07-复盘/工具问题.md"]) rmSync(join(dir, f));
  writeFileSync(join(dir, "CLAUDE.md"), "# 项目说明（给 AI 助手）\n\n## 规矩\n\n- 我自己加的规矩\n");
  writeFileSync(join(dir, ".gitignore"), "node_modules/\n*.mp4\n");
  writeFileSync(join(dir, "00-规划/语气指南.md"), "我改过的语气");
  const before = readFileSync(join(dir, "studio.json"), "utf8");
  const logs = [];
  initProject({ dir, update: true }, (m) => logs.push(m));
  assert.ok(existsSync(join(dir, ".claude/settings.json")));
  assert.ok(existsSync(join(dir, "00-规划/偏好.md")));
  assert.equal(readFileSync(join(dir, "00-规划/语气指南.md"), "utf8"), "我改过的语气");
  assert.equal(readFileSync(join(dir, "studio.json"), "utf8"), before);
  const claude = readFileSync(join(dir, "CLAUDE.md"), "utf8");
  assert.match(claude, /我自己加的规矩/);
  assert.match(claude, /## 偏好/);
  assert.equal(claude.match(/^## 规矩$/gm).length, 1, "已有的章节不重复加");
  const ignore = readFileSync(join(dir, ".gitignore"), "utf8");
  assert.match(ignore, /^node_modules\/$/m);
  assert.match(ignore, /^\.studio\/$/m);
  assert.equal(ignore.match(/^node_modules\/$/gm).length, 1);
  assert.match(logs.join("\n"), /补了/);
});

test("st init --update：不是作品项目时报错；已有 .claude/settings.json 不改，提醒手动加钩子", () => {
  assert.throws(() => initProject({ dir: tmp("st-init-"), update: true }, quiet), /不是作品项目/);
  const dir = join(tmp("st-init-"), "proj");
  initProject({ dir }, quiet);
  writeFileSync(join(dir, ".claude/settings.json"), JSON.stringify({ permissions: { allow: ["Bash"] } }));
  const logs = [];
  initProject({ dir, update: true }, (m) => logs.push(m));
  assert.deepEqual(JSON.parse(readFileSync(join(dir, ".claude/settings.json"), "utf8")), { permissions: { allow: ["Bash"] } });
  assert.match(logs.join("\n"), /\.claude\/settings\.json 已存在.*st log-hook/);
});

test("st doctor：没配 st log-hook 钩子 → ⚠ 提示 st init . --update", () => {
  const dir = join(tmp("st-doc-"), "proj");
  initProject({ dir }, quiet);
  let out = capture();
  doctor({ cwd: dir, log: out.log });
  assert.match(out.text(), /✓ 工具包命令会记到 \.studio\/log/);
  rmSync(join(dir, ".claude/settings.json"));
  out = capture();
  doctor({ cwd: dir, log: out.log });
  assert.match(out.text(), /⚠ .*没配钩子.*st init \. --update/);
});
