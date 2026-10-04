# hf-kit 画面组件库（HyperFrames 工作流用）

讲解类竖屏视频的固定画面组件。目的是**少而固定**：观众看几期就能认出每种画面代表什么，AI 写分镜时也只在这张表里选。

- 组件源码：`hf-kit/kit.js`（一个文件，10 个组件）
- 装进工程：`nv hf-kit <工程>`（`nv hf-build` 会自动做）→ `compositions/kit/kit.js`（写入项目品牌色）和 `cues.js`（逐字时间）
- 品牌色：项目配置 `narrated-video.config.json` 的 `hfKit.tokens`（`accent ink muted bg surface line font mono`）。单帧要换色时，在该帧根元素上覆盖 `--kit-accent` 等 CSS 变量

## 选用表：这句话在讲什么 → 用哪个组件

写 STORYBOARD 时，先判断每一帧口播在讲什么，再查这张表。**表里没有的就用纯文字排版，不要硬套组件。**

| 口播在讲什么 | 组件 | 例子 |
|---|---|---|
| 以前 vs 现在、慢 vs 快、旧说法 vs 新说法 | `Kit.strike` 划掉换新 | 「一下午」划掉 →「8 秒」 |
| 一个关键数字（用时、条数、倍数、比例） | `Kit.number` 大数字 | 「8 秒」从 0 数上来 |
| 结论、要观众记住的一句话 | `Kit.marker` 荧光笔 | 「一定让它**列编号**」 |
| AI 出错了、要指出问题在哪 | `Kit.annotate` 圈词加注释 | 圈住「数错了」，注「第 5 条算了两次」 |
| 真实截图里的证据 | `Kit.shot` 截图证据 | 截图推近，手绘圈圈住两个「5」 |
| 引用 AI 的原话 | `Kit.stream` 逐段出现 | DeepSeek 回答原文 |
| 演示怎么问（提示词） | `Kit.prompt` 打字 | 实测用的提示词原文 |
| 指向画面里的某一处 | `Kit.arrow` 手绘箭头 | 「这里」→ 某一行 |
| 错误问法 vs 正确问法 | `Kit.compare` 对比卡 | × 随口问 / ✓ 说清三件事 |
| 结尾给可照抄的模板 | `Kit.template` 模板卡 | 【】里是要替换的部分 |

## 使用规则

1. **一帧一个主组件**。主组件就是这一帧的「亮点动作」，旁边最多配一行普通文字。
2. **出现时间跟着配音**：`at` 等时间是相对这一帧开头的秒数，**用 `Kit.cue(帧号, "词")` 取说到这个词的时刻**，不要手写秒数。这样改了口播或语速、重新配音后，画面会自动对齐。同一个词说了两次用 `Kit.cue(5, "整理", 2)`。找不到词会直接报错。
3. **放在内容区**：宿主元素放在安全区内（抖音竖屏：x 60–1020，y 230–1150），宽度用 `width:960px`。字幕区和平台遮挡区不放组件。
4. **截图只用实测的真实截图**，坐标用**原图像素**（截图工具量出来的位置），不用换算。
5. **文字必须是真实内容**：AI 的原话、提示词、结果都来自实测记录，不编。
6. 字体里没有的符号会显示成方块：用 `×` `✓`，不要用 `✗` `✘` `✔`。`nv hf-fonts` 会列出缺字。
7. 同一组件在一帧里、一个视频里都可以用多次。

## 在帧里怎么写

```html
<div id="f03-shot" style="position:absolute;left:60px;top:540px;width:960px"></div>

<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
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

## 组件参数

时间单位都是秒（相对这一帧开头）。`inAt` 是组件整体出现的时间，默认 0。字号单位是 px，大字组件会在放不下时自动缩小，保证不折行。

| 组件 | 参数 |
|---|---|
| `Kit.strike` | `from` 旧的、`to` 新的、`at` 开始划线、`size`=140 |
| `Kit.number` | `value` 数值、`unit` 单位、`label` 下方说明、`at`、`countFrom` 从几开始数（不填就直接出现）、`size`=300 |
| `Kit.marker` | `text` 整行、`key` 关键词、`at` 开始涂、`style`=`highlight`（底色）\|`underline`（下划线）、`size`=110 |
| `Kit.annotate` | `text` 整行、`key` 圈的词、`note` 说明、`at` 开始圈、`size`=96 |
| `Kit.shot` | `src`、`size`=[原图宽,原图高]、`caption` 截图上方的小字、`width`/`height` 显示窗口（默认宿主宽、按比例）、`zoom`={`x`,`y`,`scale`=2,`at`,`dur`=0.9}、`marks`=[{`x`,`y`,`r`=20,`at`,`label`,`side`=`below`\|`above`\|`left`\|`right`}] |
| `Kit.stream` | `text` 原话、`at`、`source` 上方小字（如「DeepSeek 原话」）、`size`=52、`rate`=1（越小越快） |
| `Kit.prompt` | `text`（可含 `\n`）、`at` 开始打字、`cps`=14 每秒字数、`label`=「提问」、`size`=44 |
| `Kit.arrow` | `from`=[x,y]、`to`=[x,y]（宿主内坐标，宿主一般铺满整帧）、`at`、`bend`=0.25 弯曲程度、`label` 起点文字 |
| `Kit.compare` | `bad`={`tag`,`text`}、`good`={`tag`,`text`}、`at`=[上卡时间, 下卡时间]、`size`=44 |
| `Kit.template` | `title`、`lines`=[每行，【】内高亮]、`footer`、`at`、`stagger`=0.25 行间隔、`size`=40 |

`Kit.shot` 的圈按推近后的画面计算位置，所以圈要安排在推近结束之后。手绘圈和圈词注释画完后会有轻微的手绘抖动（固定节奏，渲染结果可复现），持续到 `until`（默认画完后 6 秒）。

## 加新组件的标准

同一种画面在两期里都需要、而且表里没有，才加新组件。加的时候：

1. 在 `kit.js` 里加 `Kit.xxx(tl, 宿主, 选项)`：只用 `fromTo` / `set`，颜色读 `T`（`--kit-*`），不写死品牌色
2. 在上面的选用表和参数表各加一行
3. 用演示工程截图检查：中文字号、安全区、出界、缺字
