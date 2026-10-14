---
name: image-cards
description: >
  用 Markdown 写图文卡片，按平台尺寸截图成 PNG：小红书图文（3:4 / 1:1）、公众号封面（2.35:1 / 1:1）、
  抖音视频封面（9:16）等。卡片之间用分隔线隔开，支持封面、内容、金句、结尾、图片等版式，会自动检查内容是否溢出。
  当用户要做小红书图文、知识卡片、轮播图、信息图、封面图、公众号头图，或项目里有 image-cards.config.json 时使用。
---

# image-cards：Markdown → 图文卡片 PNG

```bash
ic render  <卡片.md> [--preset xiaohongshu] [--out 目录]   # 输出 01.png、02.png……（默认在 <卡片.md 目录>/out/）
ic preview <卡片.md>                                        # 只生成 卡片预览.html，在浏览器里看
ic draft   <文案.md> [--images 目录]                         # 图片 + 文案存进小红书草稿箱（浏览器自动化；手机端发视频用 nv draft --to xiaohongshu）
```

渲染时如果有卡片内容溢出，会提示第几张，并以退出码 2 结束。**渲染后一定要看图**（拼成总览图更快）：

```bash
ffmpeg -v error -y -i out/%02d.png -vf "scale=360:-1,tile=9x1:padding=8" -frames:v 1 总览.png
```

## 卡片文件格式

```markdown
---
preset: xiaohongshu        # 可选，覆盖项目配置
footer: "@账号名"           # 可选，页脚文字
---

# 封面大标题<br>手动断行      ← 以 # 开头的卡片自动用 cover 版式

副标题

---

## 内容卡片的标题

正文、列表、引用、代码块、表格都行。**加粗**会显示为荧光笔高亮。

---

<!-- layout: quote -->
一句金句

---

<!-- layout: end -->
## 关注引导
```

| 版式 | 用途 | 默认规则 |
|---|---|---|
| `cover` | 封面：大标题 + 副标题，不显示页码 | 以 `# ` 开头的卡片 |
| `content` | 内容：标题 + 正文、列表、代码 | 其余卡片 |
| `list2` | 双栏清单：条目多、每条很短（≤ 6 字） | 需要显式指定 |
| `quote` | 金句：大字居中 | 需要显式指定 |
| `end` | 结尾：关注引导 | 需要显式指定 |
| `image` | 整张放一张图 | 需要显式指定 |

图片路径相对于卡片文件。

## 平台预设（presets/）

| 预设 | 尺寸 | 用途 |
|---|---|---|
| `xiaohongshu` | 1080×1440 | 小红书图文（3:4，推荐） |
| `xiaohongshu-square` | 1080×1080 | 小红书图文（1:1） |
| `wechat-cover` | 900×383 | 公众号头条封面（2.35:1） |
| `wechat-cover-square` | 383×383 | 公众号次条、转发卡片封面（1:1） |
| `douyin-cover` | 1080×1920 | 抖音视频封面 |

新增预设：在 `presets/` 加一个 JSON，字段包括 `width`、`height`、`fontSize`（基准字号，其余字号按 em 缩放）、`padding`（上右下左）、`footer`（是否显示页脚）。

## 内容规则（小红书图文）

- **6-9 张**为宜：1 张封面 + 4-7 张内容 + 1 张结尾
- **封面决定点击率**：标题 ≤ 15 字，大字，用 `<br>` 手动断行（3:4 封面一行约 6 字），**加粗**一个关键词
- **小标题 ≤ 10 字**，超过会折行并可能单字落行
- **一张卡片只讲一件事**：标题 + 3-5 条要点，单张不超过约 120 字
- 内容溢出时，先删字，删不了就拆成两张；不要靠缩小字号
- 公众号头条封面会在部分场景被裁成 1:1，重要文字放在中间

## 主题

颜色和字体由主题 CSS 提供，变量约定：`--bg --fg --fg-muted --highlight --accent --surface --font-body --font-mono`。这套变量与 narrated-video 相同，项目可以共用一份品牌主题。主题里还可以给 `.card` 加背景纹理等装饰。不配置时使用 `themes/default.css`。

## 项目配置 image-cards.config.json（可选，向上查找）

```json
{ "preset": "xiaohongshu", "theme": "品牌/theme.css", "footer": "@账号名" }
```

路径相对配置文件。优先级：命令行参数 > 卡片 frontmatter > 项目配置 > 默认值。

## 存进小红书草稿箱（ic draft）

小红书**手机端发的是视频**（和抖音同一个成片）：`nv draft <成片.mp4> --copy 小红书/文案.md --to xiaohongshu`，见 narrated-video。`ic draft` 是图文笔记，只有浏览器方案（`--via phone` 会报错提示）。

用已登录小红书创作服务平台的浏览器（依赖 browser-draft 的 `bd`）：上传图片 → 填标题 → 粘贴正文 → 逐个从联想里选话题（选中才是可点的话题）→ 点「暂存离开」。**不点发布。**

- 图片默认取 `<文案.md 目录>/out/` 下按文件名排序的图片，最多 18 张。
- **小红书网页端的草稿只存在这台电脑的浏览器本地**，不同步到手机 App，清浏览器数据会丢。预览在电脑上：创作服务平台 →「发布笔记」→ 右上角「草稿箱」→ 编辑，右侧有手机预览，确认后由人点发布。
- 脚本中途失败时，小红书可能已自动存了一份半成品草稿，到草稿箱删掉即可。

文案.md 的格式（二级标题以「标题」「正文」「话题」开头即可）：

```markdown
## 标题（≤ 20 字）

同事半小时干完的活，我干了一下午😭

## 正文

第一段……

第二段……（空行保留为空行）

## 话题标签

#AI学习 #DeepSeek #职场干货
```

## 环境

`npm install`（国内可加 `--registry=https://registry.npmmirror.com`）。Chrome 查找顺序：`CHROME_PATH` → HyperFrames 或 Puppeteer 已下载的 chrome-headless-shell → 系统 Chrome。都找不到时运行 `npx @puppeteer/browsers install chrome-headless-shell@stable --path ~/.cache/puppeteer`。缺系统库或中文字体的处理办法见 narrated-video 的 `references/setup.md`。
