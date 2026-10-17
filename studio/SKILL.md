---
name: studio
description: >
  自媒体工具包的总入口：一个选题做成抖音视频 + 小红书视频笔记 + 公众号长文，三个平台存草稿。
  提供 st 命令：st doctor（检查作品项目和工具包）、st new（新建一期）、st init（建新的作品项目）、st install（注册 skill、装依赖）、st review（汇总工具问题和偏好候选）。
  在作品项目里（根目录有 studio.json）做任何事之前先读这一份；用户说「做一期 XX」「新建一期」「检查环境」「初始化项目」时使用。
  各步骤具体交给 knowledge-video（kv，进度和确认节点）、scenario-content（sc）、content-repurpose、voiceover（vo）、
  video-director（vd）、video-draft（vdraft）、wechat-article（wa）、image-cards（ic）、browser-draft（bd）、phone-draft（pd）。
---

# studio：工具包总入口

工具包（各 skill 的代码、默认模板、通用流程）和作品项目（选题、母稿、成片、品牌、账号配置）分开放：

```
<工具包>/                 ← 这个仓库：studio/ + 各 skill，st install 注册到 ~/.claude/skills、~/.local/bin
<作品项目>/
  studio.json            ← 项目标记 + 目录约定 + 账号信息
  <skill>.config.json    ← 各 skill 的项目配置（品牌色、参考音色、语气指南、浏览器端口…）
  00-规划/  04-作品/  05-模板/（只放改过的模板）  06-品牌资产/   ← 工具会读
  01-灵感收集/  02-学习笔记/  03-选题池/  07-复盘/             ← 只给人用，工具不读
```

skill 里不写死任何作品目录名：目录约定读 `studio.json`，其余读各自的 `<skill>.config.json`（都从当前目录往上找）。

## 第一次用

```bash
cd <工具包>/studio && bin/st install --deps   # 注册 skill、命令放进 ~/.local/bin、装 Node / Python 依赖
cd <工具包>/video-director && npx hyperframes skills update hyperframes-audio   # HyperFrames 官方 skill，配乐要用
st init ~/my-media --account 账号名 --audience "目标观众" --lead "点头像进粉丝群领"   # 没有作品项目时：建一个
cd <作品项目> && st doctor                     # 逐项打勾，按提示补齐；--online 再查浏览器
```

## 定方向（第一期之前、开新系列时）

账号方向和每个系列的说明要和用户一项一项聊定，用户明确通过后 `st confirm`；没填完、没确认、确认后改过，`st new` 都会拦下。怎么聊（一次问一项、每项给候选、只有用户知道的不编）、聊哪几项：**`references/direction.md`**。

```bash
st doctor                                     # 看账号方向、各系列哪项还没填
st confirm account "用户原话"                  # 账号方向聊完、用户通过后
st series add <系列名> --label 显示名           # 登记新系列，用模板建系列说明
st confirm series <系列名> "用户原话"           # 系列说明聊完、用户通过后
```

## 做一期内容

1. **先读**项目的 `CLAUDE.md`、`00-规划/本项目设置.md`（如果有）、`00-规划/语气指南.md`、`00-规划/经验库/规律.md`
2. 先和用户挑题：从系列说明的候选选题、`03-选题池/` 挑 2–3 个，按系列的选题硬标准打分，用户选定后 `st new <系列> <简称>`（会用 `vd init 抖音` 建好抖音的导演工程；方向没定会拦下，见上一节）
3. **每一步开始前先跑 `kv status <作品目录>`，只做它说的那一步**
4. 确认节点：用户明确说通过后才 `kv gate <作品> <节点> "用户原话"`；提修改意见用 `--edit`
5. 三个草稿（`wa draft`、`vdraft --to xiaohongshu`、`vdraft`）成功后 `kv done <作品> wechat|xiaohongshu|douyin`

完整流程（15 步、5 个确认节点，每步调哪个 skill、哪条命令、kv 怎么判定）：**`references/workflow.md`**。

铁律：**实测绝不编造；只存草稿，永远不点发布；登录、扫码、验证由用户做。**

## 命令

| 命令 | 用途 |
|---|---|
| `st doctor [--online]` | 检查作品项目和工具包，✗ 要修、⚠ 提醒；有 ✗ 退出码 1 |
| `st new <系列> <简称> [--编号 N]` | 新建一期；`st new 单篇 <简称> [--栏目 名称] [--日期 YYYY-MM-DD]`；`--只建抖音` 给已有作品补建抖音工程。账号方向、这个系列（单篇只看账号）没确认就拦下；用户明说先试做才加 `--先不定` |
| `st confirm account "原话"` | 账号方向（`账号定位.md`、`语气指南.md`、studio.json 的 account、audience、lead）聊完、用户通过后记下原话和指纹，记在 studio.json 的 `confirmed.account`；没填完拒绝 |
| `st series add <系列名> [--label 显示名] [--unit 期] [--type practical\|concept]` | 登记新系列（账号方向要先确认），用模板建 `<系列>.md` |
| `st confirm series <系列名> "原话"` | 系列说明聊完、用户通过后记下，记在登记表这个系列的 `confirmed`；没填完拒绝 |
| `st init <目录> [--account …] [--audience …] [--lead …]` | 建新的作品项目；已有的文件不覆盖。老项目补新版骨架里的东西：`st init . --update`（只补缺的文件、CLAUDE.md 缺的节、.gitignore 缺的行） |
| `st review [--since 天数] [--out 文件]` | 汇总最近的工具问题（命令报错、翻了工具包源码的地方、`07-复盘/工具问题.md`）和偏好候选（各期确认节点说过的话），默认 7 天 |
| `st install [--deps]` | 软链 skill 和命令到这个工具包；同名的真实目录不动 |
| `st version` | 工具包版本（项目 `studio.json` 的 `toolkit` 可以写 `">=1.0.0"`） |

## studio.json

```json
{
  "works": "04-作品",
  "templates": "05-模板",
  "brand": "06-品牌资产/hyperframes",
  "registry": "00-规划/系列/系列.json",
  "positioning": "00-规划/账号定位.md",
  "account": "账号名",
  "audience": "目标观众",
  "lead": "模板怎么领，如：点头像进粉丝群领",
  "toolkit": ">=1.0.0"
}
```

- `account`、`audience`、`lead` 只写在这里：`st new` 填进各期模板（`{{账号}}`、`{{观众}}`、`{{领取方式}}`），`wa` 用 `account` 核对公众号，`ic` 角标默认 `@account`。各 skill 的配置不用再写一遍（写了以 skill 配置为准）

- `registry` 系列登记表：`{"系列名": {"label": "显示名", "unit": "期", "type": "practical|concept", "paused": "暂停原因"}}`
- `brand` 目录放账号固定元素 `brand-captions.html`、`brand-ending.html`、`brand-kicker.html`（video-director 用）；`brand-*.html` 只能用 `var(--vd-*)` 字体变量（`st doctor` 会查）

## 模板

默认模板在 `templates/`。项目想改哪个，就复制到项目的 `05-模板/` 同样的相对路径再改，`st new` 先用项目的；和默认一模一样的覆盖 `st doctor` 会提醒删掉。占位符：`{{标题}}` `{{角标}}` `{{系列}}` `{{编号}}` `{{账号}}` `{{观众}}` `{{账号定位}}` `{{系列说明}}`（登记表同目录下的 `<系列>.md`）、`{{领取方式}}`（studio.json 的 `lead`）。

## 改工具包

- 新工具或方法做成和项目无关的 skill，放在工具包根目录 `<名字>/`，有命令就放 `bin/`，再 `st install`
- 项目专属的东西只进项目配置，不进 skill
- 在 worktree 里改时，测试前把 worktree 里相关 skill 的 `bin/` 放到 PATH 最前面，否则调用的是已安装的那份
- 测试：每个 skill 目录里 `node --test tests/*.test.mjs`（Python 的用各自 `.venv`）

## 监控和偏好

- **工具问题**：作品项目的 `.claude/settings.json` 配了钩子（`st init` 自带），Claude 每跑一次工具包命令（st kv sc vo vd vdraft wa ic bd pd），`st log-hook` 记下成败、退出码、输出里的 ✗ / ⚠ 行和用时，写到 `.studio/log/<日期>.jsonl`（不进 git）。钩子看不出的（翻源码、手工绕过、文档和行为不一致）由 Claude 按项目 CLAUDE.md 记进 `07-复盘/工具问题.md`。`st review` 一起汇总，再扫 Claude Code 会话记录里翻工具包源码的地方。
- **偏好**：用户说的「以后都这样」记进 `00-规划/偏好.md`（选题 / 语气文案 / 画面 / 配音 / 流程），写东西前读它；什么时候直接记、什么时候先问，见项目 CLAUDE.md「偏好」一节，评估用例在 `evals/project-rules.md`。`st review` 列出各期确认节点里说过的话，方便挑出漏记的。
