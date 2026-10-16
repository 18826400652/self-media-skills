---
name: studio
description: >
  自媒体工具包的总入口：一个选题做成抖音视频 + 小红书视频笔记 + 公众号长文，三个平台存草稿。
  提供 st 命令：st doctor（检查作品项目和工具包）、st new（新建一期）、st init（建新的作品项目）、st install（注册 skill、装依赖）。
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
st init ~/my-media --account 账号名 --audience "目标观众"   # 没有作品项目时：建一个
cd <作品项目> && st doctor                     # 逐项打勾，按提示补齐；--online 再查浏览器
```

## 做一期内容

1. **先读**项目的 `CLAUDE.md`、`00-规划/本项目设置.md`（如果有）、`00-规划/语气指南.md`、`00-规划/经验库/规律.md`
2. `st new <系列> <简称>`（会用 `vd init 抖音` 建好抖音的导演工程）
3. **每一步开始前先跑 `kv status <作品目录>`，只做它说的那一步**
4. 确认节点：用户明确说通过后才 `kv gate <作品> <节点> "用户原话"`；提修改意见用 `--edit`
5. 三个草稿（`wa draft`、`vdraft --to xiaohongshu`、`vdraft`）成功后 `kv done <作品> wechat|xiaohongshu|douyin`

完整流程（15 步、5 个确认节点，每步调哪个 skill、哪条命令、kv 怎么判定）：**`references/workflow.md`**。

铁律：**实测绝不编造；只存草稿，永远不点发布；登录、扫码、验证由用户做。**

## 命令

| 命令 | 用途 |
|---|---|
| `st doctor [--online]` | 检查作品项目和工具包，✗ 要修、⚠ 提醒；有 ✗ 退出码 1 |
| `st new <系列> <简称> [--编号 N]` | 新建一期；`st new 单篇 <简称> [--栏目 名称] [--日期 YYYY-MM-DD]`；`--只建抖音` 给已有作品补建抖音工程 |
| `st init <目录> [--account …] [--audience …]` | 建新的作品项目；已有的文件不覆盖 |
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
  "toolkit": ">=1.0.0"
}
```

- `registry` 系列登记表：`{"系列名": {"label": "显示名", "unit": "期", "type": "practical|concept", "paused": "暂停原因"}}`
- `brand` 目录放账号固定元素 `brand-captions.html`、`brand-ending.html`、`brand-kicker.html`（video-director 用）；`brand-*.html` 只能用 `var(--vd-*)` 字体变量（`st doctor` 会查）

## 模板

默认模板在 `templates/`。项目想改哪个，就复制到项目的 `05-模板/` 同样的相对路径再改，`st new` 先用项目的；和默认一模一样的覆盖 `st doctor` 会提醒删掉。占位符：`{{标题}}` `{{角标}}` `{{系列}}` `{{编号}}` `{{账号}}` `{{观众}}` `{{账号定位}}` `{{系列说明}}`（登记表同目录下的 `<系列>.md`）。

## 改工具包

- 新工具或方法做成和项目无关的 skill，放在工具包根目录 `<名字>/`，有命令就放 `bin/`，再 `st install`
- 项目专属的东西只进项目配置，不进 skill
- 在 worktree 里改时，测试前把 worktree 里相关 skill 的 `bin/` 放到 PATH 最前面，否则调用的是已安装的那份
- 测试：每个 skill 目录里 `node --test tests/*.test.mjs`（Python 的用各自 `.venv`）
