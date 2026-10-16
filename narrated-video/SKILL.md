---
name: narrated-video
description: >
  制作「AI 配音 + 动画 + 字幕」的讲解类短视频（不出镜、知识科普、教程、产品讲解），
  输出抖音 / 小红书 / 视频号竖屏或 B 站 / YouTube 横屏 MP4。流程：分镜脚本 → 逐句 TTS 配音 →
  自动生成时间轴与字幕 → HyperFrames（HTML + GSAP）编排动画 → 渲染。
  当用户要做讲解视频、口播动画、知识短视频、给脚本配音配字幕、新建一期视频，
  或项目里有 narrated-video.config.json 时使用。
---

# narrated-video：配音讲解视频

核心原则：**先配音，再做动画。**画面时间从配音时间轴里取，不要手写秒数。改了台词，重新配音后动画会自动对齐。

所有命令都通过 `bin/nv` 调用（若已链接到 `~/.local/bin/nv`，直接用 `nv`）。

## 流程

```bash
nv new <名称> [--date YYYY-MM-DD]     # 按项目配置新建一期（无配置时用 nv new --dir <目录>）
# 1. 写 脚本.md 的分镜表
nv voice <视频目录>                   # 2. 逐句配音 → audio/voice.wav + timeline.json → 自动 sync
# 3. 编排 index.html 的场景和动画（见下方约定）
nv check <视频目录>                   # 4. lint + 运行时检查
nv snapshot <视频目录> --at 1.5,8,15  # 5. 截关键帧，务必看图确认
nv render <视频目录>                  # 6. 输出 <视频目录>/renders/<作品名>.mp4
```

其他子命令会原样透传给 `hyperframes`，如 `nv preview`、`nv doctor`、`nv lint`。

## 另一条路：HyperFrames 官方 faceless-explainer 工作流（抖音竖屏推荐）

画面质量更高，分镜、动效规范按官方 `/faceless-explainer` 来；本 skill 补上中文配音、音效、字体和固定画面组件。

**AI 实测类视频先读 `references/douyin-recipe.md`（分镜配方）**：8 帧左右、冲突放开头、真实录屏、证据可追溯，每帧用帧模板（STORYBOARD 的 `- build:`）生成画面。

| 步骤 | 做什么 |
|---|---|
| `nv rec <工程>/capture/assets/rec.mp4 --prompt 提问.txt --app deepseek\|doubao` | （可选，强烈推荐）在真手机的 AI App 里录真实操作：打字 → 发送 → 回答完，输出 1080×1920（裁掉状态栏，左右补 App 背景色）；同时输出用时（.json）和界面文字（.txt，DeepSeek 另附复制按钮拿到的完整回答，写进实测记录）。DeepSeek 默认关深度思考 / 智能搜索，要开加 `--think` / `--search`，录完恢复成原来的开关；回答特别长时加 `--timeout 秒`（默认 300）。录前手机解锁、开勿扰（没开会拒绝录）。调用 phone-draft 的 `pd rec`。没有手机时用 `--url <AI 网址>`（或 `--via browser` 录当前标签页）走浏览器：录前确认已登录、新对话、模型开关与实测一致、侧边栏收起 |
| `nv rec-flow <输出.mp4> --steps 步骤.py --url <网址>` | 录「按步骤操作网页」的电脑横屏录屏（软件演示、多步向导），16:9，1920×1080。步骤脚本是 Python，可用 `click_text` / `click_css` / `type_into` / `wait_until` / `mark` / `shot`（见 `scripts/rec/flow.py` 开头）；等待时持续录帧，最高 15 帧/秒。输出 `.json` 里有每个 `mark` 在视频里的秒数，剪辑时用来快进等待段。在单独的浏览器窗口、单独的连接里录，不受同时在用这个浏览器的其他会话影响 |
| `/faceless-explainer` | 建工程、写 BRIEF.md / STORYBOARD.md / frame.md、SCRIPT.md |
| `nv hf-audio <工程>` | 用项目配置的 TTS 配音，带逐字时间（替代官方 TTS）。SCRIPT.md 每帧可写 `**情感:**`、`**重点词:**`。工程里有 `VOICE.md`（配音导演稿，写法见 `references/voice-direction.md`）且服务商支持导演稿（seedaudio、qwenaudio）时，按段整段生成再切回每帧；`--check` 只核对导演稿和口播是否一致，不生成 |
| `nv hf-kit <工程>` | 装入画面组件库，**写帧之前读 `references/hf-kit.md` 的选用表**，帧里用 `Kit.xxx(...)` 拼画面 |
| STORYBOARD 每帧 `- build: {…}` | 帧模板：录屏、计时、组件、说明、标题自由组合，时间写 `"@词"`；`nv hf-build` 自动生成画面（见 douyin-recipe.md）。放不下的画面才手写 `compositions/frames/NN-*.html`（`Kit.xxx(...)` + `Kit.cue`） |
| `nv hf-build <工程> --snap` | 一键组装：组件库和逐字时间 → 帧时长 → 按 build 生成画面 → 音效（STORYBOARD `- sfx: error @数错了`）→ 素材 → 中文字体 → 字幕 → index → 转场 → lint/check（竖屏另查字幕带 `--caption-zone` 和越框：内容不能伸出四角框、不能占角标那一行）→ 每帧截图拼成 `snapshots/sheet.jpg` |
| `nv hf-build <工程> --motion` | 每帧截「入场 / 中段 / 落定前 / 落定」四张（存 `snapshots/motion-sheet.jpg`，不覆盖 `sheet.jpg`），检查元素是否按时出现、字幕折行、过程中有没有穿帮（只看结尾截图会漏掉这类问题）；并自动比较落定前后两张，落定后完全静止的帧给出警告 |
| 看 `snapshots/sheet.jpg` → `nv render <工程>` | 看图确认后渲染；渲染完自动做成片检查（`nv verify`：帧数、时长、声音、尺寸、黑屏） |

改了口播或语速：重跑 `nv hf-audio` 和 `nv hf-build`，画面时间会跟着 `Kit.cue` 自动对齐。单独的 `nv hf-sfx`、`nv hf-fonts`、`nv hf-kit` 一般不用手动跑。

## 视频工程的组成

| 文件 | 作用 | 谁来改 |
|---|---|---|
| `脚本.md` | 分镜表：一行 = 一句口播 = 一个画面 | 人 / AI |
| `index.html` | 场景和 GSAP 动画 | 人 / AI |
| `preset.css` | 平台尺寸、安全区、字号 | `nv new` 生成，不手改 |
| `base.css` | 通用布局（场景、列表、字幕、高亮） | skill 提供 |
| `theme.css` | 配色、字体、装饰（项目品牌） | 项目提供 |
| `timeline.json` | 每句的起止时间 | `nv voice` 生成 |
| `audio/`、`renders/`、`snapshots/` | 配音、成品、截图 | 生成物，不入 git |

## 分镜表格式（脚本.md）

必须有 `## 分镜` 小节。表格需包含 `#`（行号）、`口播…`、`重点词…` 三列，其他列随意。

- **每句口播不超过 28 字**（字幕最多两行，竖屏一行约 14 字）。超过 13 字时，`sync` 会在靠近中间的标点后自动换行，所以长句中间要有逗号
- **重点词**用顿号分隔，会在字幕里自动高亮
- **情感**（可选列）：平静 开心 惊讶 难过 生气 害怕 厌恶，逐句覆盖配置里的默认情感（需要 TTS 支持，目前是 cosyvoice）
- 英文缩写容易被 TTS 读错，必要时写成读音友好的形式

## 时间轴约定（编排 index.html 时必须遵守）

| 写法 | 含义 |
|---|---|
| `<section id="s2" class="clip scene" data-lines="2-4">` | 场景绑定第 2-4 句口播，`sync` 会写入 `data-start` / `data-duration` |
| `data-at="3"` / `nvLine(3)` | 第 3 句口播的开始时间（读取字幕元素 `#cap-3`） |
| `data-at="s2"` / `nvAt("s2")` | 场景 s2 的开始时间 |
| `<!-- captions:start -->…<!-- captions:end -->` | 字幕区，由 `sync` 生成，不要手改 |

改了口播文字就重跑 `nv voice`（未改的句子走缓存）；只改了场景绑定就跑 `nv sync`。

## 场景组件（components.css + components.js）

画面优先用组件拼，**不写 CSS、不写动画 JS**。脚本.md 的「画面类型」直接写组件名。

| 组件 | 用途 | 结构 |
|---|---|---|
| `hero` / `point` / `note` | 标题卡、正文、说明（base.css） | `<h1 class="hero">…<mark>重点</mark></h1>` |
| `nv-duel` | 对比大字：A vs B | `.row > .label + .value`，突出的那行加 `.is-key` |
| `nv-bubble` | 消息气泡（领导、同事、客户发来的话） | `.from` 写发送人和时间 |
| `nv-stats` | 并排状态卡（时间、进度、数字） | `.nv-stat > .label + .value + .note`，可放 `.nv-progress > i`，突出的加 `.is-key` |
| `nv-funnel` | 一堆东西汇入一个框（「丢给 AI」） | `.items > *` + `.target`，配合 `data-fx="flyin"` |
| `nv-tiles` | 2-4 个并排大字概念，可聚焦其一 | `.nv-tile > .big + .sub`，配合 `dim` / `focus` |
| `nv-feed` | 带编号的条目流（原始数据、清单） | `<span><b>01</b>内容</span>` |
| `nv-prompt` | 提示词卡，逐行出现 | `.tag` + 多个 `.line` |
| `nv-table` | 结果表：标签 + 数值 | `.row.head` + 多个 `.row > span + b` |
| `nv-stamp` | 徽章（「用时 < 1 分钟」） | 单个元素 |
| `nv-notes` | 编号要点卡（注意事项、步骤） | `.nv-note > .no + .title > small` |
| `list` | 编号要点列表（base.css） | `ol.list > li > .num + span` |

### 声明式动画

| 属性 | 含义 |
|---|---|
| `data-enter="up\|left\|right\|pop\|fade\|mark"` | 入场方式；`mark` 用在 `<mark>` 上，表示荧光笔划线 |
| `data-at="3"` | 第 3 句口播开始时；`"3+0.5"` 晚 0.5 秒；`"s2"` 场景 s2 开始；`"+0.3"` 所在场景开始后 0.3 秒；省略 = 所在场景开始 |
| `data-stagger="0.3"` | 改为让子元素依次入场 |
| `data-fx="dim\|focus\|fill\|flyin\|pulse"` + `data-fx-at` | 效果：变暗 / 聚焦高亮 / 进度条涨到 `data-fill`% / 汇入 / 跳动 |

页面脚本固定为 `const tl = nvAnimate(gsap.timeline({ paused: true }));`。组件之外的特殊动画接着往 `tl` 里加，用 `nvAt("s2")`、`nvLine(3)` 取时间。**同一种画面在第二期再出现时，就把它抽成新组件**加进 components.css / components.js。

示例：第 3 句时状态卡上来，第 4 句时变暗：

```html
<div class="nv-stat" data-enter="up" data-at="3" data-fx="dim" data-fx-at="4+0.6">…</div>
```



- 根元素 `#root` 带 `data-composition-id="main"`；时间轴是 `gsap.timeline({ paused: true })`，注册到 `window.__timelines["main"]`
- 有时间的元素需要 `class="clip"` 和 `data-start` / `data-duration`
- 只写确定性逻辑：不用 `Date.now()`、`Math.random()`、`setTimeout` / `setInterval`、网络请求；循环动画不写 `repeat: -1`，按帧长算出次数（如 `repeat: Math.max(0, Math.floor(帧长 / 周期) - 1)`）；`stagger` 不用 `from: "random"`；时间线在页面加载时同步建好
- `querySelector` 里不能用模板字符串（打包器会崩溃），要用字符串拼接或 `getElementById`
- 高亮的划线动画：`tl.from("mark", { "--mark": "0%" })`
- `nested_structure_needs_subcomposition` 警告只影响 Studio 时间轴显示，可以忽略
- 详细文档：`node_modules/hyperframes/dist/docs/`，或运行 `nv docs <主题>`

## 画面设计要点

- 前 3 秒是钩子：结果前置、反常识或痛点，不做自我介绍
- 每 3-5 秒画面要有变化；一屏只讲一件事
- 中文大标题用 `<br />` 手动断行，避免把一个词拆到两行
- 颜色和字号只用 CSS 变量（`--highlight`、`--text-hero` 等），不写死
- 渲染前用 `nv snapshot` 截图，**看图**检查断行、遮挡、安全区

## 存草稿到抖音 / 小红书（nv draft）

```bash
nv draft <成片.mp4> --copy <抖音/发布文案.md> [--cover <封面图>]                     # 抖音，默认用浏览器（browser-draft）
nv draft <成片.mp4> --copy <小红书/文案.md> [--cover <封面图>] --to xiaohongshu      # 小红书发同一个视频，默认用浏览器
nv draft <成片.mp4> --copy <发布文案.md> [--to xiaohongshu] --via phone   # 备用：用手机 App（phone-draft）
```

`--cover`：上传这张图（png / jpg）做封面，只有浏览器端支持。不传时抖音用视频画面、小红书用第一帧。

文案格式（两个平台相同）：`## 标题`（抖音 ≤ 30 字、小红书 ≤ 20 字）、`## 正文`、`## 话题`。

**浏览器（默认）**：用已登录的浏览器（依赖 browser-draft 的 `bd`，连接方式见它的 SKILL.md：项目配置 `browser-draft.config.json` 的 `cdpPort`）。**不点发布。**

- 抖音（创作者中心）：上传视频，等「上传成功」→ 填标题 → 简介 → 逐个从联想里选话题 → 封面 → 点「暂存离开」
  - **抖音网页端只保留一条未发布的作品**，不是草稿列表。已有一条时脚本会停下，不覆盖：先在创作者中心把它发布或「放弃」
  - 预览在电脑上：创作者中心「发布视频」页点「继续编辑」，右侧有手机预览，确认后由人发布
  - 封面是必填项。传了 `--cover`：打开「选择封面」弹窗，在「设置横封面」和「设置竖封面」两栏都把图塞进「上传封面」的文件框，再点「完成」（抖音按 4:3 / 3:4 从中间裁）；之后等「封面检测中」结束，缩略图才刷新成上传的图。没传：尽力用视频画面做封面，但弹窗有时加载不出视频画面，这时会提示「封面没设上」，预览时手动选
- 小红书（创作服务平台）：「上传视频」→ 上传成片（传完不提示「上传成功」，以出现「重新上传」「设置封面」、没有进度为准）→ 封面 → 填标题 → 粘贴正文 → 逐个从联想里选话题 → 点「暂存离开」（按钮在 shadow DOM 里，按文字点，不按坐标点）
  - 封面：传了 `--cover` 时，缩略图上的「编辑封面」要**真实鼠标悬停**才出现（CSS `:hover`），也只认真实点击，脚本先用坐标点一下缩略图再点它；弹窗打开后才有图片上传框，传完点「完成」，以缩略图背景图换掉为准。网页按 3:4 裁封面（9:16 的图只留上面一截），封面大字要放在上半部分
  - **网页端的草稿只存在这台电脑的浏览器里**，不同步到手机 App，清浏览器数据会丢。预览在电脑上：创作服务平台 →「发布笔记」→ 右上角「草稿箱」→ 编辑，选好封面，确认后由人发布
  - 脚本中途失败时，小红书可能已自动存了一份半成品草稿，到草稿箱删掉即可

**手机（`--via phone`，备用）**：推视频进相册 → 打开 App → 相册选片 → 填标题和描述 + 话题（读回核对）→ 存草稿 → 看「我」页草稿箱数量有没有加一 → 清理相册临时文件。抖音发布页没有存草稿按钮，脚本退回剪辑页点「返回 → 存草稿」；封面用视频首帧，需要的话在 App 里改。**不点「发作品」「发布笔记」。**

## 项目配置 narrated-video.config.json（可选，放在项目根目录）

```json
{
  "preset": "douyin",
  "tts": { "provider": "kokoro", "voice": "zf_xiaobei", "speed": 1.0 },
  "template": "path/to/project-template",
  "theme": "path/to/theme.css",
  "episodes": {
    "root": "作品目录",
    "dirPattern": "{{DATE}}-{{NAME}}",
    "videoSubdir": "抖音",
    "scaffold": [{ "from": "模板/母稿.md", "to": "母稿.md" }]
  }
}
```

- `preset`：`presets/` 下的平台预设，目前有 `douyin`（9:16）、`xiaohongshu`（3:4）、`bilibili`（16:9）
- `template`：项目模板目录，叠加在 `templates/base/` 之上，同名文件覆盖
- `theme`：项目品牌主题，替换 `theme.css`。需要定义的变量见 `templates/base/theme.css`
- `scaffold`：新建一期时额外生成的文件，支持占位符 `{{TITLE}}` / `{{标题}}` / `{{DATE}}`
- 所有路径都相对于配置文件所在目录

## 扩展

- **新平台**：在 `presets/` 加一个 JSON，字段参照 `douyin.json`
- **TTS 服务商**（配置 `tts.provider`）：
  - `cosyvoice`：阿里云百炼 CosyVoice，官方付费接口，中文自然，**支持声音复刻**。需要 `DASHSCOPE_API_KEY`，放在项目根目录 `.env`（`nv voice` 自动读取）。`tts.model` 指定模型；`tts.scene` + `tts.emotion` 控制语气（仅部分音色支持，场景名因音色而异，如 longanyang 用「闲聊互动」、longanhuan 用「闲聊对话」，以[官方音色列表](https://help.aliyun.com/zh/model-studio/cosyvoice-voice-list)为准）
  - `volcengine`：火山引擎豆包语音合成，官方付费接口，带逐字时间戳。需要 `VOLC_TTS_API_KEY`（新版控制台的 API Key），放在项目根目录 `.env`。`tts.voice` 写音色 ID（如 `zh_female_vv_uranus_bigtts`，见[音色列表](https://www.volcengine.com/docs/6561/1257544)），`tts.model` 写资源 ID（默认 `seed-tts-2.0`，要和音色版本对应），`tts.instruction` 可写一句语音指令调语气（仅 2.0 音色）。不支持读音表，`scene` / `emotion` 不生效
  - `seedaudio`（推荐，最像真人）：火山引擎豆包音频生成模型 Seed-Audio 1.0（音频创作），按描述「演」出口播，带逐字时间戳。和 `volcengine` 共用 `VOLC_TTS_API_KEY`，账号要另外开通「音频生成」。`tts.style` 写人设和场景（每期一样的部分）；`tts.reference`（参考音频，相对项目根目录，≤30 秒）或 `tts.voice`（2.0 / 复刻音色 ID）二选一绑定音色。每期按内容写 `VOICE.md` 导演稿（`references/voice-direction.md`），整段生成，前后语气连贯；没有导演稿时逐帧生成。每段要 20–40 秒，账号并发有限，遇到 429 会自动重试
  - `qwenaudio`：千问音频生成 qwen-audio-3.1-tts-next（阿里云），写法和 `seedaudio` 一样（导演稿、`tts.style`、`tts.reference`，参考音频用 `@voice1` 引用，不支持音色 ID），价格更低。它不返回时间戳：生成后自动用录音文件识别（fun-asr）拿时间，再按字对齐回原文（`scripts/lib/align.mjs`），识别错的字按前后时间插值。用 `DASHSCOPE_API_KEY`（和 cosyvoice 共用）。每段约 1 分钟；`tts.seed` 改随机种子可以换一种演法
  - `edge`：微软神经网络音色，音质好、免费，需要联网。属于非官方接口，商业化前要评估风险，见 `tts/edge.mjs` 的说明。
  - `kokoro`：本地离线，中文只有一个音色。
  - **读音表**（配置 `tts.pronounce`，仅支持 SSML 的服务商生效，目前是 `cosyvoice`）：TTS 读不对的词，键写原文、值写 SSML 片段，如 `{ "AI": "<say-as interpret-as=\"characters\">AI</say-as>" }`（逐个字母读）。只改送给 TTS 的文字，口播原文、字幕、`@词` 时间点都不变；TTS 返回的逐字时间会合并回原文的词（`scripts/lib/pronounce.mjs`）。英文单词内部不替换（`OpenAI` 里的 AI 不动）。SSML 用法见[官方文档](https://help.aliyun.com/zh/model-studio/introduction-to-cosyvoice-ssml-markup-language)
  - 新增服务商：写 `tts/<名字>.mjs` 导出 `synthesize({ text, voice, speed, outFile })`，再到 `tts/index.mjs` 登记。密钥用环境变量。
- **环境搭建与排坑**：见 `references/setup.md`
- **改了脚本或组件库后**：在 skill 目录运行 `npm test`（`tests/` 里是口播解析、字幕分段、音效定位、按词取时间等纯逻辑测试）
