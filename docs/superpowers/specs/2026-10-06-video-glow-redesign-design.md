# 抖音视频视觉重设计：「职场现场 + 荧光笔」

- 日期：2026-10-06
- 范围：`skills/narrated-video`（hf-kit 组件库、帧模板生成）+ 项目品牌文件（字幕样式、视觉规范）
- 样稿：`2026-10-06-video-glow-redesign/`（3 帧 HTML 和新旧对比图 `compare.jpg`，内容取自第 4 课实测）

## 1. 背景和目标

用户反馈：现在做出来的抖音视频「达不到抖音博主那么漂亮、美观」。

**旧版的问题**（看第 4 课 `snapshots/sheet.jpg` 得出）：
1. 画面头重脚轻：内容挤在上面三分之一，下面大片空着
2. DeepSeek 录屏、截图缩得太小，手机上看不清
3. 每帧长得一样：纯黑底 + 小号白字 + 黄框，没有节奏
4. 大段小字，像在念 PPT
5. 没有图标、图形，显得素

**参考视频**（清华姗姗不迟《HyperFrames 正确使用流程》、小但同学《用 AI 把字幕直接生成成视频画面》，都是横屏长视频）好看的原因：背景有氛围（渐变光晕、粒子、压暗）、玻璃发光卡片、到处有图标、每屏一张结构图、HUD 装饰、字幕单独一层。不学的地方：画面长时间不动、字小而密。

**选定的方向：D「职场现场 + 荧光笔」**
- 保留品牌「荧光笔学习笔记」（墨黑 + 荧光黄），三平台视觉一致
- 质感照搬参考视频的手法：光晕、颗粒、玻璃卡片、HUD
- 画面内容换成上班族熟悉的界面：痛点用**聊天界面**演，实测用**重建的 AI 回答界面**（矢量文字，可推近到某一行），重点用**荧光笔划过**

**成功标准**
- 第 4 课按新样式重新生成，总览图里每帧都有：氛围背景、HUD、玻璃质感的主体，没有「看不清的截图」
- 旧的 STORYBOARD 不改一个字就能用新样式重新生成
- `nv hf-build --snap` 的 `check` 0 错误，铺开度警告不比旧版多
- 用户看总览图认可

**不做**：横屏版式；旧视频重新渲染和重新发布（第 4 课只用来验证，要不要重发由用户决定）；音效和 BGM。

## 2. 安全区（不变）

样稿为了看效果，内容画到了 y≈1390，**实现时以现有安全区为准**：
- 内容区：x 60–1020，y 230–1150
- 字幕带：y 1180–1440（`caption-skin.html` 的 `--cap-douyin-top/height`）
- 右侧 150px 和底部 480px 是抖音按钮、文案遮挡区，不放内容

## 3. 设计

### 3.1 全局质感层 `look: "glow"`

**配置**：项目配置 `narrated-video.config.json` 的 `hfKit.look`，取值 `"glow"`（新）或 `"flat"`（旧，纯色底）。不填时默认 `"flat"`，旧项目行为不变；本项目配置写 `"glow"`。

**`frame-build.mjs` 生成每帧时，`glow` 模式下：**
- **底色层**（替换现在的纯色 `ground` div）：
  - 底色 `bg`
  - 三处径向光晕：右上（accent，13% 透明度）、左下（accent 偏暖，8%）、底部中间（accent，6%）
  - 点阵（48px 网格，纸白 7%）+ SVG 噪点颗粒（`feTurbulence`，soft-light 混合）
  - 四周压暗（径向渐变到 65% 黑）
  - 光晕颜色由 `tokens.accent` 用 `color-mix` 算出，**不写死黄色**，换项目品牌色也能用
- **HUD 层**（`kicker: false` 的帧同样隐藏 HUD 文字，只留四角）：
  - 四角括号框住内容区（左上、右上在 y≈200，左下、右下在 y≈1160，不进字幕带），上面两角 accent 55%，下面两角更淡
  - 角标行 y 250：左边「栏目 · 课号」（沿用现在的 kicker 文字，栏目名用 accent 色），右边进度条：共 `min(总帧数, 8)` 段，按「当前帧 / 总帧数」点亮，亮的那段发光
  - `frame-build` 需要知道总帧数：由 `hf-frames.mjs` 传入 `f.total`
- **`ground: "accent"`（整屏黄底的冲击帧）**：保留，加颗粒和压暗，不加光晕
- **`camera: "push"`**：不变

**样式放在 `hf-kit/kit-glow.js`**（类名 `.kit-atmo`、`.kit-hud` 等），glow 帧自动引用，手写帧加一行 `<script>` 即可；flat 帧完全不加载它。`frame-build` 只负责插入对应元素和类名。

### 3.2 现有组件换皮（参数不变）

`glow` 模式下（`kit.js` 读 `TOKENS.look`，由 `nv hf-kit` 写入），这些组件的表面改成**玻璃卡片**：

> 玻璃卡片 = 上下渐变的半透明白底（7% → 2.5%）+ 1.5px 细描边（白 9%）+ 圆角 28–36px + 顶部 1px 内高光 + 大投影；需要强调的卡片换成 accent 描边并带外发光。

| 组件 | 改动 |
|---|---|
| `compare` | 两张卡改玻璃；「好」的那张用 accent 描边发光（「坏」卡不划线不变红：它常放「会上原话」，不一定是错的） |
| `prompt` | 玻璃卡；顶部加图标和「给 AI 的提问」小标签；光标发光 |
| `template` / `checklist` / `steps` / `chain` | 底板改玻璃；编号、勾、箭头用 accent 并带微发光 |
| `shot` | 截图窗口加圆角、玻璃边框和投影 |
| `stream` | 引用块加玻璃底和来源小标签 |
| `marker` | `highlight` 样式的色块改成荧光笔笔触：轻微倾斜、两头圆角不对称、渐变黄、外发光；涂抹动画（从左往右）不变 |
| `annotate` / `arrow` / `number` / `strike` / `receipt` | 只调颜色和发光，结构不变 |

**新增 token**：`danger`（默认 `#FF5A5F`，出错、翻车用）。`frame-build` 里的 `.P-chip`、`.P-panel`、标题、标签也一起改成玻璃或发光样式。

**约束**：所有组件的**参数、默认值、尺寸不变**，只改外观。现有单元测试应全部通过。

### 3.3 新组件 `Kit.chat`：聊天界面

用途：开头演出真实工作场景（领导 @你、同事回消息），前 3 秒建立代入感。

```js
Kit.chat(tl, "#f01-chat", {
  title: "双十一筹备群", count: 5,
  staged: true,                       // 默认 true：角上显示「情景演绎」小标签
  at: 0, stagger: 0.5,                // 不写每条 at 时，按 stagger 依次弹出
  messages: [
    { from: "刘总", text: "@你 十分钟后把会议纪要发群里", at: "@十分钟" },
    { from: "我", me: true, doc: { title: "双十一筹备会纪要", tag: "AI 整理",
        head: ["事项", "负责人", "截止"],
        rows: [["活动页上线", "小林", "周五"], ["提货点海报重做", "阿杰", "未明确"]],
        mark: { row: 1, col: 1, at: "@派给了" } }, at: "@AI" },
    { from: "阿杰", text: "？？海报我啥时候认领的", tone: "bad", at: "@同事" }
  ]
});
```

- 头像：取名字第一个字，颜色按人名固定分配（「我」用 accent 渐变）
- 文字里的 `@xxx` 自动用 accent 色
- `tone: "bad"`：气泡变成 danger 浅底和描边
- `doc`：文档卡（accent 浅底），表格行；`mark` 到点时在指定单元格画手绘红圈（复用 `annotate` 的画圈）
- 动画：每条消息从下方弹入（y 24 → 0，透明度 0 → 1，0.35 秒）；列表超出高度时整体上推
- `staged: false` 时不显示「情景演绎」标签（内容全部来自真实记录时用）

### 3.4 新组件 `Kit.answer`：重建 AI 回答

用途：用实测记录里的原文，重建一个清楚的 AI 回答界面，替代缩小的截图或录屏；可以推近到某一行。

```js
Kit.answer(tl, "#f04-ans", {
  app: "DeepSeek",                    // 头部 logo 色和名字；目前内置 DeepSeek
  source: "DeepSeek 原话 · 实测第 1 轮",
  blocks: [
    { h: "二、待办事项" },
    { table: { head: ["事项", "负责人", "截止时间"], rows: [ /* 实测原文 */ ] } },
    // 也支持 { p: "一段正文" }
  ],
  at: 0,
  focus: { row: 2, col: 1, at: "@人名", note: "其实是「王姐」", noteAt: "@王姐" }
});
```

- 先整体出现（玻璃面板，轻微 3D 倾斜）
- `focus` 到点：面板虚化变暗（blur 1.6px、亮度 0.6），被选中的那一行复制成放大卡片浮出（accent 描边 + 外发光），卡片顶部显示 `source`
- 指定 `col` 时在那个单元格画红圈；有 `note` 时贴一个 danger 色便签
- 不写 `focus` 就是静态的完整回答（代替 `stream` 用于表格类回答）
- **只能用实测记录原文**：文档和选用表里写明；`source` 必填，缺了报错

### 3.5 字幕

改 `06-品牌资产/hyperframes/caption-skin.html`：
- 去掉黑底字幕板（`.caption-pill` 不要底色和描边）
- 字：纸白、900 字重、60px 左右，`text-shadow` 加深色阴影保证在任何背景上可读
- 还没说到的词：纸白 45%；说到的词：纸白；重点词说到时变荧光黄并带外发光（不再用黄色块）
- 字幕带位置不变（y 1180–1440）

`new-episode.sh` 新建作品时会复制这个文件，所以只改品牌源文件；已有作品不动，第 4 课验证时手动复制一份。

### 3.6 守住「不编造」

- `Kit.chat`：默认显示「情景演绎」标签
- `Kit.answer`：`source` 必填；`references/hf-kit.md` 的使用规则里写明内容必须来自实测记录
- `douyin-recipe.md` 里写清楚：钩子帧用 `chat` 演场景，实测结果用 `answer`，不用 `chat` 伪造 AI 的回答

## 4. 改动清单

| 文件 | 改动 |
|---|---|
| `skills/narrated-video/hf-kit/kit.js` | 质感层和 HUD 样式、玻璃皮肤、`look` 和 `danger` token、`Kit.chat`、`Kit.answer`。文件约 700 行，加完会超过 800 行：把两个新组件拆到 `hf-kit/kit-scenes.js`，`nv hf-kit` 一起复制 |
| `skills/narrated-video/scripts/lib/frame-build.mjs` | `glow` 时插入底色层和 HUD；接收 `f.total`、`f.look`；`.P-*` 样式改玻璃 |
| `skills/narrated-video/scripts/hf-frames.mjs` | 传 `total` 和 `look` |
| `skills/narrated-video/scripts/hf-kit.mjs` | 写入 `look` 和 `danger`；复制 `kit-scenes.js` |
| `skills/narrated-video/scripts/lib/config.mjs` | 读取 `hfKit.look`，校验只能是 `glow`/`flat` |
| `skills/narrated-video/tests/hf.test.mjs` | 新测试（见第 5 节） |
| `skills/narrated-video/references/hf-kit.md` | 选用表加 `chat`、`answer` 两行，参数表、使用规则 |
| `skills/narrated-video/references/douyin-recipe.md` | `build` 示例加 `chat`、`answer`；钩子帧推荐用 `chat` |
| `narrated-video.config.json` | `hfKit.look: "glow"`，`tokens.danger` |
| `06-品牌资产/hyperframes/caption-skin.html` | 新字幕样式 |
| `06-品牌资产/视觉规范.md` | 加「视频质感层」一节：光晕、颗粒、玻璃卡片、HUD、字幕 |

## 5. 测试和验证

**单元测试**（`node --test`，和现有测试同一个文件或新文件）：
- `frame-build`：`look: "glow"` 生成的 HTML 含底色层和 HUD，进度条点亮的段数正确；`look: "flat"` 的输出和改动前一致（快照对比）；`kicker: false` 时 HUD 不含文字
- `config`：`hfKit.look` 非法值报错
- `Kit.chat` / `Kit.answer`：用 skill 里已有的 `puppeteer-core` 起无头 Chrome（找 Chrome 的方式同 image-cards 的 `findChrome`），加载 GSAP + kit，建一个最小时间轴并 seek 到 focus 之后，断言元素数量、`staged` 标签、放大卡片存在；`answer` 缺 `source` 报错。找不到 Chrome 时这组测试跳过并打印原因，不算失败

**画面验证**：
1. 演示工程截图：每个组件在 `glow` 下各截一张，看字号、出界、缺字
2. 第 4 课复制一份工程，换新字幕样式，钩子帧改用 `chat`、翻车帧改用 `answer`（内容来自实测记录），其余帧不改 STORYBOARD；`nv hf-build . --snap`，看 `snapshots/sheet.jpg`
3. `check` 0 错误；铺开度警告数不多于旧版
4. 把新旧总览图对比发给用户确认

## 6. 风险

| 风险 | 应对 |
|---|---|
| 黄色发光显得廉价 | 荧光黄只用来点（重点词、关键数字、一条描边），光晕透明度 ≤ 13%；验证时看总览图 |
| `backdrop-filter`、`blur` 拖慢渲染 | 玻璃卡片不用 `backdrop-filter`（背景是静态的，半透明渐变效果一样）；`answer` 的虚化只在 `focus` 后作用于一个元素。验证时记录第 4 课渲染耗时，和旧版对比 |
| 颗粒噪点在视频压缩后变成色块 | 噪点透明度低、soft-light 混合；渲染后看一帧原图，不行就降低或去掉颗粒 |
| 旧作品重新生成时样子变了 | `look` 默认 `flat`，只有配置写了 `glow` 才变 |
