---
name: wechat-article
description: >
  公众号文章排版与发布：Markdown → 公众号兼容的内联样式 HTML，生成手机宽度预览页（一键复制到公众号编辑器），
  或自动上传图片并发布到公众号草稿箱。底座为开源工具文颜（@wenyan-md/cli），支持自定义主题 CSS。
  当用户要写公众号文章、公众号排版、把 Markdown 发到公众号、预览公众号效果，或项目里有 wechat-article.config.json 时使用。
---

# wechat-article：Markdown → 公众号

```bash
wa preview <文章.md>   # 生成同目录的 预览.html（手机宽度预览 + 「复制到公众号」按钮）和整篇截图 预览.png（找不到 Chrome 时只出 html）
wa render  <文章.md>   # 公众号 HTML 输出到标准输出
wa draft   <文章.md>   # 存进公众号草稿箱：默认用已登录的浏览器（browser-draft），--via phone 用手机上的公众号助手
wa publish <文章.md>   # 用接口上传图片 + 创建草稿（需要凭据和接口权限，见 references/publish.md）
```

## 发布方式

| 方式 | 步骤 | 适合 |
|---|---|---|
| **浏览器发草稿（默认）** | `wa draft` → 到后台草稿箱「预览」发到手机 → 确认后发表 | 任何账号，包括没有草稿接口的个人号。需要 browser-draft（`bd`），浏览器已登录公众号后台 |
| **手机发草稿（备用）** | `wa draft --via phone` → 在手机公众号助手的草稿里检查、设封面 → 确认后发表 | 任何账号。需要 phone-draft（`pd`），手机已连 adb、公众号助手已登录 `account`（配置或 studio.json）的账号 |
| **复制粘贴** | `wa preview` → 浏览器打开 预览.html → 点「复制到公众号」→ 在编辑器粘贴 | 不想自动操作浏览器时；本地图片要手动上传 |
| **草稿箱 API** | `wa publish` → 到后台草稿箱检查并发表 | 已认证账号，配置了 AppID、AppSecret、IP 白名单 |

这几种方式都只进草稿或编辑器，**最终发表由人在公众号后台确认**。

`wa draft`（浏览器，默认）会：填标题和作者（作者最多 8 个字）→ 粘贴正文（本地图片内联后自动转存到微信图床）→ 用 frontmatter 的 `cover` 设置封面 → 保存草稿。粘贴时公众号的「内容结构检测」提示会打印出来，它们只是建议，脚本会继续插入（已知规律见 references/publish.md）。

`wa draft --via phone`（手机，备用）会：核对公众号助手登录的账号是配置里的 `account` → 写新文章 → 正文按图片切开，文字段带格式粘贴、图片推进相册后用编辑器「插入图片」逐张插入 → 填标题 → 保存，并在首页「草稿」一行核对标题。封面、作者在手机上「下一步」里手动设。

## 文章格式

```markdown
---
title: 文章标题（必填，publish 时作为公众号标题）
cover: ./cover.png        # 封面；不填时用正文第一张图
author: 作者名
source_url: https://…     # 可选，「阅读原文」链接
---

开头两三句直接给出读者能得到什么。

## 小节标题（二级标题是文章的主要层级）

正文……**加粗是重点**。

### 更细的层级
```

- 不要在正文里再写 `# 一级标题`：标题在公众号后台单独显示
- 外部链接会自动转成文末脚注，因为公众号正文不能点外链
- 图片用相对路径，`publish` 会自动上传；复制粘贴方式需要在编辑器里另外上传图片
- 代码块、表格、引用都支持
- **中文加粗的坑**：`**` 紧挨着中文标点（如 `」**交给`、`**「整理」**`）时可能不生效，把标点挪到加粗外面或加个逗号
- **表格不超过 4 列**：公众号正文宽度很窄，5 列以上会把表头挤成竖排

## 写作要点（公众号）

- 篇幅 1500-3000 字，3-5 个二级小节，每节有小结论
- 段落短：手机上每段不超过 4 行，多用列表和加粗
- 每 300-500 字放一个视觉元素（图、代码块、表格、引用），避免大段纯文字
- 开头 100 字内说清「读完能得到什么」，结尾给可执行的总结或行动清单
- 封面可以用 image-cards 的 `wechat-cover` 预设生成

## 主题

`wechat-article.config.json` 的 `theme` 有三种写法（按这个顺序查找）：
- 自定义主题 `.css` 文件路径（相对配置文件）
- 本 skill 自带主题名（`themes/<名字>.css`）：
  - `grace`：移植自 [doocs/md](https://github.com/doocs/md)（13k★，WTFPL）的 grace 主题，墨色主色；二级标题是墨色圆角色块配荧光黄字，加粗是荧光笔效果；代码块自动换行、表格适配手机宽度
  - `highlighter`：自写的「荧光笔学习笔记」，更素：二级标题是荧光笔划线，没有色块
- 文颜内置主题 ID：`default`、`orangeheart`、`rainbow`、`lapis`、`pie`、`maize`、`purple`、`phycat`

### 从 doocs/md 导入主题

doocs/md 是国内用得最多的公众号 Markdown 编辑器，主题有 `default`、`grace`、`simple`。它的 CSS 不是给文颜写的，用脚本转换：

```bash
python3 scripts/doocs-theme.py grace --primary '#1f2024' --extra themes/src/grace.extra.css > themes/grace.css
```

- `--primary` 是主色（二级标题色块、引用竖线等）；`--extra` 是追加在最后的适配 CSS，品牌色和手机阅读的修正写在这里（`themes/src/grace.extra.css`），不要直接改生成的 `themes/grace.css`
- 脚本会把 `var()`、`calc()`、`color-mix()` 算成具体值（公众号编辑器不认），并恢复列表符号（doocs 靠它的渲染器插入，文颜没有）
- 引用的 doocs 版本固定在脚本的 `REF`，升级时改它再重新生成，截图检查

自定义主题的写法：
- 选择器都以 `#wenyan` 开头（如 `#wenyan h2 span`、`#wenyan strong`）。
- 可以用 CSS 变量，文颜渲染时会解析成具体值。
- 公众号不支持外部 CSS、`position`、动画；伪元素的支持也不稳定。装饰效果尽量用 `background`、`border` 实现。
- 代码块（`pre` / `code.hljs`）的底色、字色、`code` 内边距会被代码高亮主题（`highlight`）覆盖：文颜最后应用它，主题里写的不生效。代码块的留白写在 `pre` 的 `padding` 上。
- 写完后用 `wa preview`，直接看 `预览.png` 检查排版（不用自己起服务器、开浏览器）。

## 项目配置 wechat-article.config.json（可选，向上查找）

```json
{ "theme": "grace", "highlight": "solarized-light", "envFile": ".env", "macStyle": false }
```

- `account`：公众号名称（`--via phone` 时核对）。不写就用作品项目 `studio.json` 的 `account`
- `highlight`：代码高亮主题
- `envFile`：凭据文件（不入 git）
- `macStyle`：代码块是否加 Mac 窗口样式

## 环境

`npm install`（国内可加 `--registry=https://registry.npmmirror.com`）。文颜版本锁定在 `package.json`。
