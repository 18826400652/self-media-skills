---
name: wechat-article
description: >
  公众号文章排版与发布：Markdown → 公众号兼容的内联样式 HTML，生成手机宽度预览页（一键复制到公众号编辑器），
  或自动上传图片并发布到公众号草稿箱。底座为开源工具文颜（@wenyan-md/cli），支持自定义主题 CSS。
  当用户要写公众号文章、公众号排版、把 Markdown 发到公众号、预览公众号效果，或项目里有 wechat-article.config.json 时使用。
---

# wechat-article：Markdown → 公众号

```bash
wa preview <文章.md>   # 生成同目录的 预览.html：手机宽度预览 + 「复制到公众号」按钮
wa render  <文章.md>   # 公众号 HTML 输出到标准输出
wa publish <文章.md>   # 上传图片 + 创建草稿（需要凭据，见 references/publish.md）
```

## 两种发布方式

| 方式 | 步骤 | 适合 |
|---|---|---|
| **复制粘贴** | `wa preview` → 浏览器打开 预览.html → 点「复制到公众号」→ 在公众号编辑器粘贴 | 没配 API；文章没有本地图片，或图片手动上传 |
| **草稿箱 API** | `wa publish` → 到公众号后台草稿箱检查并发布 | 已配置 AppID、AppSecret 和 IP 白名单；本地图片自动上传 |

两种方式都只进草稿或编辑器，**最终发布由人在公众号后台确认**。

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

## 写作要点（公众号）

- 篇幅 1500-3000 字，3-5 个二级小节，每节有小结论
- 段落短：手机上每段不超过 4 行，多用列表和加粗
- 每 300-500 字放一个视觉元素（图、代码块、表格、引用），避免大段纯文字
- 开头 100 字内说清「读完能得到什么」，结尾给可执行的总结或行动清单
- 封面可以用 image-cards 的 `wechat-cover` 预设生成

## 主题

`wechat-article.config.json` 的 `theme` 有两种写法：
- 文颜内置主题 ID：`default`、`orangeheart`、`rainbow`、`lapis`、`pie`、`maize`、`purple`、`phycat`
- 自定义主题 `.css` 文件路径（相对配置文件）

自定义主题的写法：
- 选择器都以 `#wenyan` 开头（如 `#wenyan h2 span`、`#wenyan strong`）。
- 可以用 CSS 变量，文颜渲染时会解析成具体值。
- 公众号不支持外部 CSS、`position`、动画；伪元素的支持也不稳定。装饰效果尽量用 `background`、`border` 实现。
- 写完后用 `wa preview` 截图检查。

## 项目配置 wechat-article.config.json（可选，向上查找）

```json
{ "theme": "品牌/wechat-theme.css", "highlight": "solarized-light", "envFile": ".env", "macStyle": false }
```

- `highlight`：代码高亮主题
- `envFile`：凭据文件（不入 git）
- `macStyle`：代码块是否加 Mac 窗口样式

## 环境

`npm install`（国内可加 `--registry=https://registry.npmmirror.com`）。文颜版本锁定在 `package.json`。
