# hf-kit 画面组件库（HyperFrames 工作流用）

讲解类竖屏视频的固定画面组件。目的是**少而固定**：观众看几期就能认出每种画面代表什么，AI 写分镜时也只在这张表里选。

- 组件源码：`hf-kit/kit.js`（14 个基础组件）、`hf-kit/kit-scenes.js`（场景组件 `chat`、`answer`）、`hf-kit/kit-glow.js`（glow 质感层和玻璃皮肤）
- 视觉风格：项目配置 `hfKit.look`：`"flat"`（默认，纯色底）或 `"glow"`（光晕颗粒底色、HUD 四角和进度条、玻璃卡片、荧光笔笔触）。帧模板会按配置自动引用 `kit-glow.js`；**手写的帧要自己加** `<script src="compositions/kit/kit-glow.js"></script>`（放在 kit.js 之后），并给底色元素加 `class="kit-atmo"`
- 装进工程：`nv hf-kit <工程>`（`nv hf-build` 会自动做）→ `compositions/kit/kit.js`（写入项目品牌色）和 `cues.js`（逐字时间）
- 品牌色：项目配置 `narrated-video.config.json` 的 `hfKit.tokens`（`accent ink muted bg surface line font mono`）。单帧要换色时，在该帧根元素上覆盖 `--kit-accent` 等 CSS 变量

## 缓动：按角色分

同一帧里的元素别全用同一种动法，画面才不呆板（官方 Claude Design 指南：每个场景至少三种缓动）。组件和帧模板已经按下表分好；手写帧也照这个分：

| 角色 | 缓动 | 用在哪 |
|---|---|---|
| 一般入场 | `power3.out`（`Kit._u.EASE`） | 说明文字、卡片、聊天消息 |
| 主角 | `expo.out`（`Kit._u.HERO`） | 大数字、划掉后换上的新词、帧模板大标题 |
| 弹出的小元素 | `back.out(1.6)`（`Kit._u.POP`） | 勾、标签、注释、箭头、放大镜卡片 |
| 背景和镜头 | `sine.inOut` | 缓推、光晕呼吸 |
| 画线、涂色 | `power2.inOut` / `none` | 荧光笔、圈、划线、颜色变化 |

## 选用表：这句话在讲什么 → 用哪个组件

写 STORYBOARD 时，先判断每一帧口播在讲什么，再查这张表。**表里没有的就用纯文字排版，不要硬套组件。**

| 口播在讲什么 | 组件 | 例子 |
|---|---|---|
| 以前 vs 现在、慢 vs 快、旧说法 vs 新说法 | `Kit.strike` 划掉换新 | 「一下午」划掉 →「8 秒」 |
| 一个关键数字（用时、条数、倍数、比例） | `Kit.number` 大数字 | 「8 秒」从 0 数上来 |
| 结论、要观众记住的一句话 | `Kit.marker` 荧光笔 | 「一定让它**列编号**」 |
| AI 出错了、要指出问题在哪 | `Kit.annotate` 圈词加注释 | 圈住「数错了」，注「第 5 条算了两次」 |
| 开头的工作场景（领导 @你、同事回消息） | `Kit.chat` 聊天界面 | 群里刘总 @你要纪要 → 你发出 AI 写的纪要 → 阿杰「？？」（默认标「情景演绎」） |
| AI 的回答（尤其是表格），要指出其中某一行 | `Kit.answer` 重建 AI 回答 | DeepSeek 待办表，推近到「王杰」那一行，圈出并贴「其实是王姐」 |
| 「先把文件 / 资料发给它，再问」 | `Kit.attach` 文件飞进输入框 | 问题打进输入框 → 「报销制度.pdf」飞进附件栏、亮「✓ 已附上」（默认标「示例」） |
| 「别整本扔，挑相关的几页」、从一大堆里挑出几条 | `Kit.pick` 挑页 | 「员工手册 186 页」落下、打叉 → 三页飞出排开（默认标「示例」） |
| 真实截图里的证据 | `Kit.shot` 截图证据 | 截图推近，手绘圈圈住两个「5」 |
| 引用 AI 的原话 | `Kit.stream` 逐段出现 | DeepSeek 回答原文 |
| 演示怎么问（提示词） | `Kit.prompt` 打字 | 实测用的提示词原文 |
| 指向画面里的某一处 | `Kit.arrow` 手绘箭头 | 「这里」→ 某一行 |
| 错误问法 vs 正确问法 | `Kit.compare` 对比卡 | × 随口问 / ✓ 说清三件事 |
| 结尾给可照抄的模板 | `Kit.template` 模板卡 | 【】里是要替换的部分 |
| 「有明细才能核对」类比、清单 | `Kit.receipt` 打印小票 | 带编号的小票吐出来，标出重复的两行「扫了两次」 |
| 拿到结果检查哪几件事、注意事项 | `Kit.checklist` 清单核对 | 「编号有没有重复」「加起来对不对」逐条勾上 |
| 具体怎么做（2–4 步） | `Kit.steps` 步骤流程 | 01 说清你是谁 → 02 每行一条带编号 → 03 写出编号和条数 |
| 为什么会这样（原因 → 过程 → 结果） | `Kit.chain` 因果链 | 不是一条条数的 → 一个字一个字往下写 → 第五条写了两遍 |
| AI 真实操作过程（发送、输出） | 录屏片段（`<video>`，见下方「录屏」） | `nv rec` 录的 DeepSeek 对话，输出段落加速播放 + `Kit.number` 计时 |

## 使用规则

1. **一帧一个主组件**。主组件就是这一帧的「亮点动作」，旁边最多配一行普通文字。
2. **出现时间跟着配音**：`at` 等时间是相对这一帧开头的秒数，**用 `Kit.cue(帧号, "词")` 取说到这个词的时刻**，不要手写秒数。这样改了口播或语速、重新配音后，画面会自动对齐。同一个词说了两次用 `Kit.cue(5, "整理", 2)`。找不到词会直接报错。
3. **放在内容区**：宿主元素放在安全区内（抖音竖屏：x 60–1020，y 230–1150），宽度用 `width:960px`。字幕区和平台遮挡区不放组件。
4. **截图只用实测的真实截图**，坐标用**原图像素**（截图工具量出来的位置），不用换算。
5. **文字必须是真实内容**：AI 的原话、提示词、结果都来自实测记录，不编。
5b. `Kit.attach`、`Kit.pick` 画面里的文件名、页码是演示用的，默认标「示例」；写成真实文件（实测里真的发过的）时才写 `tag: false`。
5a. `Kit.chat` 是**演示场景**，默认显示「情景演绎」；只有对话全部来自真实记录时才写 `staged: false`。**不要用 chat 伪造 AI 的回答**，AI 的回答用 `Kit.answer` 放实测原文，`source` 写清是第几轮实测。
6. 字体里没有的符号会显示成方块：用 `×` `✓`，不要用 `✗` `✘` `✔`。`nv hf-fonts` 会列出缺字。
7. 同一组件在一帧里、一个视频里都可以用多次。

## 在帧里怎么写

```html
<div id="f03-shot" style="position:absolute;left:60px;top:540px;width:960px"></div>

<script src="compositions/kit/gsap.min.js"></script>
<script src="compositions/kit/cues.js"></script>
<script src="compositions/kit/kit.js"></script>
<script>
  (function () {
    var tl = gsap.timeline({ paused: true });
    var C = function (w, n) { return Kit.cue(3, w, n) - 0.05; }; // 第 3 帧：说到这个词（提前一点点）
    Kit.shot(tl, "#f03-shot", { src: "assets/dup.png", size: [1610, 800], zoom: { x: 1000, y: 190, scale: 2.2, at: C("第五") },
      marks: [{ x: 1045, y: 91, at: C("这里") }, { x: 1045, y: 283, at: C("那里"), label: "又算了一次" }] });
    window.__timelines = window.__timelines || {};
    window.__timelines["03-evidence"] = tl;
  })();
</script>
```

宿主元素的 id 要带帧前缀（如 `f03-`），避免和别的帧重名。

GSAP 用本地文件 `compositions/kit/gsap.min.js`（`nv hf-kit` 复制进工程），不要写 CDN 地址：国内访问 jsdelivr 常常十几秒，会让截图、检查、渲染超时。写错了也没关系，`nv hf-build` 组装时会把 CDN 地址统一换成本地。

## 录屏（`nv rec` 录的视频）

录屏不是 Kit 组件，直接在帧里放 `<video>`（HyperFrames 原生支持截取和倍速）。`rec.json` 里的 `sentAt` / `doneAt` 是视频里发送和回答结束的时刻：

```html
<video id="f03-v" class="clip" src="assets/rec.mp4" data-start="0" data-duration="3.4"
  data-media-start="3.3" data-playback-rate="2.4" data-track-index="1" muted playsinline
  style="position:absolute;left:95px;top:340px;width:890px;height:1582px;object-fit:cover"></video>
```

- 放在角标下方（top≈340），不要铺满整帧，否则角标和叠加文字压在录屏文字上看不清
- 倍速播放时要在画面上注明（如「视频 2.4 倍速」），计时器显示真实用时
- 帧里其他元素加 `z-index` 放在视频上面；叠加文字用实色底（`Kit.compare` 卡片、深色面板）

## 组件参数

时间单位都是秒（相对这一帧开头）。`inAt` 是组件整体出现的时间，默认 0。字号单位是 px，大字组件会在放不下时自动缩小，保证不折行。

| 组件 | 参数 |
|---|---|
| `Kit.strike` | `from` 旧的、`to` 新的、`at` 开始划线、`size`=140 |
| `Kit.number` | `value` 数值、`unit` 单位、`label` 下方说明、`at`、`countFrom` 从几开始数（不填就直接出现）、`size`=300 |
| `Kit.marker` | `text` 整行、`key` 关键词、`at` 开始涂、`style`=`highlight`（底色）\|`underline`（下划线）、`size`=110（是上限：按字数自动缩；glow 下关键词贴着行首或行尾时，会把笔触伸出的部分也算进去） |
| `Kit.annotate` | `text` 整行、`key` 圈的词、`note` 说明、`at` 开始圈、`size`=96 |
| `Kit.shot` | `src`、`size`=[原图宽,原图高]、`caption` 截图上方的小字、`width`/`height` 显示窗口（默认宿主宽、按比例）、`zoom`={`x`,`y`,`scale`=2,`at`,`dur`=0.9}、`marks`=[{`x`,`y`,`r`=20,`at`,`label`,`side`=`below`\|`above`\|`left`\|`right`}] |
| `Kit.stream` | `text` 原话、`at`、`source` 上方小字（如「DeepSeek 原话」）、`size`=52、`rate`=1（越小越快） |
| `Kit.prompt` | `text`（可含 `\n`）、`at` 开始打字、`cps`=14 每秒字数、`label`=「提问」、`size`=44 |
| `Kit.arrow` | `from`=[x,y]、`to`=[x,y]（宿主内坐标，宿主一般铺满整帧）、`at`、`bend`=0.25 弯曲程度、`label` 起点文字 |
| `Kit.compare` | `bad`={`tag`,`text`}、`good`={`tag`,`text`}、`at`=[上卡时间, 下卡时间]、`size`=44 |
| `Kit.template` | `title`、`lines`=[每行，【】内高亮]、`footer`、`at`、`stagger`=0.25 行间隔、`size`=40 |
| `Kit.receipt` | `rows`=[每行文字，自动编 01 02…]、`total` 合计、`title`=「小票」、`at` 开始打印、`dur`=1.1、`highlight`=[要标出的行号]、`highlightAt`、`tag` 标签文字、`tagAt`、`size`=46、`width`=640。宿主放在内容区左侧，给标签留位置 |
| `Kit.checklist` | `title`、`items`=[字符串或 {`text`,`at`,`checkAt`}]、`at`、`stagger`=0.4、`size`=68。每条说到时出现并打勾；两条时内容偏少，宿主往下放或加大 `size` |
| `Kit.steps` | `steps`=[{`title`,`desc`,`at`}]、`at`、`stagger`=0.6、`size`=76（说明文字 0.58 倍；序号块和步骤间距跟着缩放，76 时 110px / 80px）。竖线随口播长到当前一步。5 步要放进内容框，size ≤ 56 |
| `Kit.chain` | `cards`=[{`tag`,`text`,`at`}]、`at`、`stagger`=0.7、`size`=60。箭头往下长，最后一张（结果）描强调色边；只写真实的因果，不凑三段 |
| `Kit.chat` | `title` 群名、`count` 人数、`staged`=true、`at`=0、`stagger`=0.5、`height`=760（面板总高，消息超出时自动上推）、`size`=34、`messages`=[{`from`,`text`,`me`,`tone`:`"bad"`,`doc`:{`title`,`tag`,`head`,`rows`,`mark`:{`row`,`col`,`at`}},`at`}]。`text` 里的 `@某人` 自动高亮；`mark` 的行列从 0 数 |
| `Kit.attach` | `question` 打进输入框的问题、`file`={`name`,`meta`,`type`=`"PDF"`}、`at`=0（输入框出现）、`askAt`=at+0.4（开始打字）、`fileAt`=askAt+0.9（文件卡飞进来）、`done`=`"✓ 已附上"`（`false` 不显示）、`tag`=`"示例"`（`false` 不标）。组件高 400 |
| `Kit.pick` | `title` 资料名、`total` 总页数（从 0 数上来）、`unit`=`"页"`、`picks`=[{`page`,`text`}]（1–4 页）、`at`=0（整摞落下）、`rejectAt`（红叉；不写就不打叉）、`pickAt`=at+1.2（几页飞出）、`tag`=`"示例"`。组件高约 490（4 页时 660） |
| `Kit.answer` | `source`（必填，出处）、`app`=`"DeepSeek"`、`blocks`=[{`h`}\|{`p`}\|{`table`:{`head`,`rows`}}]、`at`=0、`size`=27、`focus`={`row`（第一个表格的数据行，从 0 数）,`col`,`at`,`note`,`noteAt`}。`focus` 时面板虚化、那一行放大浮出 |

`Kit.shot` 的圈按推近后的画面计算位置，所以圈要安排在推近结束之后。手绘圈和圈词注释画完后会有轻微的手绘抖动（固定节奏，渲染结果可复现），持续到 `until`（默认画完后 6 秒）。

## 加新组件的标准

同一种画面在两期里都需要、而且表里没有，才加新组件。加的时候：

1. 在 `kit.js` 里加 `Kit.xxx(tl, 宿主, 选项)`：只用 `fromTo` / `set`，颜色读 `T`（`--kit-*`），不写死品牌色
2. 在上面的选用表和参数表各加一行
3. 用演示工程截图检查：中文字号、安全区、出界、缺字
