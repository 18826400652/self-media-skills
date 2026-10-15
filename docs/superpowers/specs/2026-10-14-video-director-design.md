# 视频导演（video-director）设计

日期：2026-10-14

## 目标

把抖音视频的画面从「组件模板拼装」改成「**先写导演脚本，再按脚本生成**」：每条视频的视觉风格由内容决定，不再固定一套。账号只保留三个固定元素（栏目标签、字幕、结尾），保证辨识度。

成功标准：同一份口播稿和配音，用新流程做出的视频明显比现有 `nv hf-build` 成品更吸引人（画面演出口播的意思，而不是重复字幕），并且能稳定地一期一期做下去。

## 已验证的前提（2026-10-14 实测）

实验目录：`hyperframes/experiments/`（不入库）。

- **纯音乐样片**（`agent-spike/`，14.4s「什么是 AI Agent」）：贯穿元素（一个光点）、话说一半、重拍对位、结尾提问都能用 HyperFrames 实现，`hyperframes check` 通过。
- **口播样片**（`rag-director/sample/`）：拿 `04-作品/AI概念一分钟/01-RAG/抖音/` 的口播稿、`nv hf-audio` 生成的配音和逐字时间轴，做了前 4 句（14.5s）。印章、搜索、荧光笔等动作卡在 `audio_meta.json` 的字级时间上。与旧成品 `01-RAG.mp4` 前 14.5s 并排对比（`rag-director/compare.mp4`），用户确认「方向对了」。
- **成本**：样片第一版之后又靠截图修了 3 轮（标签被遮挡、元素出画、撞击点不准）。这是第二层自动检查要解决的问题。
- **配乐**（HeyGen 曲库，免费额度）：`heygen` CLI v0.10.0 + `heygen auth login --oauth`（账户 plan: free）后，`hyperframes media-use resolve --type bgm` 能按描述取到配乐；`hyperframes beats` 输出带强度的节拍；按最强节拍算 `data-media-start`，让重拍落在指定的词上；`hyperframes-audio/scripts/carve.mjs` 在人声下压低配乐。整条链路渲染通过（`sample/renders/sample-bgm.mp4`）。
- **环境依赖**（实测发现）：
  - 网络走代理 `127.0.0.1:10808`，Node 的 `fetch` 默认不读代理变量，需要 `NODE_USE_ENV_PROXY=1`（Node 22）。
  - HeyGen：OAuth 登录走免费额度；API Key 登录按点数扣钱包。WSL 里用 `HEYGEN_NO_BROWSER=1 heygen auth login --oauth`，手动打开打印出来的链接。
  - `carve.mjs` 需要工程里装 `@hyperframes/core`（与 CLI 同版本，现为 0.8.143）。

## 决定

| 问题 | 决定 |
|---|---|
| 输入 | 已写好的口播稿（`SCRIPT.md`）+ `nv hf-audio` 生成的配音和逐字时间轴 |
| 输出 | 直接出成片（配音、字幕、配乐都在里面） |
| 风格 | 每条视频按内容设计，不固定 |
| 账号固定元素 | 栏目标签、字幕样式、结尾版式（位置和结构固定，颜色字体随风格变） |
| 用户关卡 | ③a 审导演脚本 → ③b 看约 15 秒风格样片 → 整片（④ 看成片不变） |
| 配乐 | HeyGen 曲库（OAuth 免费额度）；备选：用户自己放配乐文件；都没有就不加 |
| 旧流程 | 保留。`brief.md` 加 `video: director \| template`，概念科普默认 director，实用技巧可继续用 template（`nv hf-build`） |

## 架构

新技能 `video-director`，放在 `skills/video-director/`，与 `kv`、`nv` 并列，软链接到 `~/.claude/skills/`。

它只负责：**口播稿 + 配音 → 导演脚本 → 视频工程**。配音（`nv hf-audio`）、渲染和成片检查（`nv render` / `nv verify`）不变。

### 一期抖音部分的流程

| 步骤 | 谁做 | 产物 | 关卡 |
|---|---|---|---|
| 口播稿 + 配音稿 | 不变 | `SCRIPT.md`、`VOICE.md` | ② 不变 |
| 配音 | `nv hf-audio`，不变 | `assets/voice/*.wav`、`audio_meta.json`、`caption_groups.json` | — |
| 写导演脚本 | video-director | `DIRECTOR.md` | **③a** |
| 风格样片 | video-director | `sample/` 下约 15s 的 mp4 + 关键帧总览图 | **③b** |
| 整片 | video-director | 完整视频工程 + `@词` 时间点总览图 | — |
| 渲染 + QA | `nv render`，不变 | 成片、`qa.json` | ④ 不变 |

`kv` 的改动：原来的 `storyboard` 节点拆成 `director`（③a）和 `sample`（③b）；`kv status` 按 `brief.md` 的 `video:` 字段决定显示哪一套步骤；改了 `DIRECTOR.md` 或样片后，对应节点自动失效（沿用现有的失效机制）。

## 导演脚本（`DIRECTOR.md`）

给两类读者看：用户（几分钟看懂会拍成什么样）和制作环节（照着能做出来）。参照样本：`hyperframes/experiments/rag-director/DIRECTOR.md`。

1. **视觉方案**（全片一份）
   - 一句话概念：视觉世界从内容哪里来（RAG = 先翻资料 → 文件桌）
   - 贯穿元素：从头跟到尾的一个东西
   - 配色：每个颜色写明含义，不允许纯装饰色；账号强调色（`narrated-video.config.json` 的 `hfKit.tokens.accent`）必须保留，用途固定为「重点 / 找到的东西」
   - 字体：只用已打包的字体（思源黑体、思源宋体、JetBrains Mono）
   - 情绪曲线：转折点、最高点
2. **分段**：按意思分段（不再一句一帧）。每段写包含哪几句、起止时间（来自真实配音）、画面；每个动作锚定到词，写成 `@编一套`；段与段之间写转场，并写明由哪个元素连起来。
3. **导演规则自检表**（必填，每项写出具体在哪里实现）：第一秒的视觉落点；第一句是否跟观众有关；重拍几个、落在哪些词；哪里话说一半；有没有硬切及理由；结尾问题。
4. **音乐**：情绪描述（用于搜曲库）、能量曲线、配乐重拍落在哪个词；或写 `none`。
5. **账号固定元素**：栏目标签、字幕、结尾的具体文字。
6. **新增内容清单**：原稿里没有、导演加上的屏幕文字，全部列出等用户确认。画面上的数字和事实必须能在 `research.json` 里找到（沿用 kv 的「不编事实」）。
7. **样片范围**：做哪几句，为什么（要包含第一个重拍和至少一次转场）。

## 视频工程

放在现有的 `作品/抖音/` 工程里，与 `nv` 的配音文件同目录。

```
抖音/
  SCRIPT.md, VOICE.md, audio_meta.json, caption_groups.json   ← nv 已有，不动
  DIRECTOR.md                     ← 导演脚本
  cues.json                       ← @词 → 秒数（脚本生成）
  index.html                      ← 总装：配音、配乐、字幕、栏目标签、贯穿元素、各段
  compositions/seg-NN-*.html      ← 每段一个子画面
  sample/                         ← 风格样片工程（只装前几段）
```

- **每段一个子画面**：改一段不影响别的段；样片只装前几段；符合 HyperFrames「3 个以上场景拆子画面」的规范。
- **贯穿元素放在总装层**：它跨段移动，由 `index.html` 的时间轴控制，镜头才连续。
- **时间来自配音**：`cues.mjs` 读 `audio_meta.json`，把 `DIRECTOR.md` 里所有 `@词` 换算成全片秒数写进 `cues.json`；各段只引用 cue 名字，不写死数字。重新配音后重跑即可对齐。
- **账号固定元素**：三个可复用子画面放在 `06-品牌资产/hyperframes/`：
  - `brand-kicker`：栏目标签，文字来自项目配置
  - `brand-captions`：读 `caption_groups.json`，`*` 标记的重点词高亮
  - `brand-ending`：下一期预告 + 问题 + 评论引导

  位置和结构固定；颜色和字体由每条视频的配色方案传入（HyperFrames 变量）。
- **音效**：用 media-use 自带的音效库，`DIRECTOR.md` 里写 `音效名 @词`，自动混入。
- **配乐**：按 `DIRECTOR.md` 的情绪描述 `media-use resolve --type bgm`（HeyGen 曲库）→ 没有则找 `assets/bgm.*`（用户提供）→ 都没有则不加。有配乐时：`hyperframes beats` 取节拍，挑指定词之后可用范围内最强的节拍，计算 `data-media-start` 对位；`carve.mjs --bed music --voice vo` 做人声避让。

## 质量检查

1. **HyperFrames 自带**：`hyperframes check` 0 错误才往下走。故意的遮挡、重叠用 `data-layout-allow-*` 标注（注意：`allow-overlap` 标在具体文字上、不继承；`allow-occlusion` 标在被遮挡的文字上），并在 `DIRECTOR.md` 写明理由。
2. **抖音专用检查**（新脚本，在每个 `@词` 时间点截图检测）：
   - 关键元素（`DIRECTOR.md` 标记）任何时刻不出 1080×1920
   - 安全区：顶部 200、右侧 160、底部 480 像素内无关键内容；字幕带只放字幕
   - 栏目标签不被遮挡
   - 每个 `@词` 对应的元素在该时间点可见
   - 任意 2 秒内画面有变化（思路同 `nv hf-build --motion`）
3. **人眼检查**：自动生成 `@词` 时间点截图总览，按 `DIRECTOR.md` 逐条看（隐喻看不看得懂、贯穿元素是否连续、重拍是否有冲击力），问题记进 `qa.json`（沿用 kv 格式）。

同类问题出现两次以上，写进第 2 层检查或导演规则（沿用 kv 经验库 → `规律.md` 的机制）。

## 环境准备（写进技能的安装说明）

- `NODE_USE_ENV_PROXY=1`（有代理时；建议写进 `~/.bashrc`）
- `heygen` CLI（官方安装脚本）+ `HEYGEN_NO_BROWSER=1 heygen auth login --oauth`
- 每个视频工程：`npm i -D @hyperframes/core@<CLI 同版本>`（人声避让用）

## 分阶段交付

| 阶段 | 内容 | 验收 |
|---|---|---|
| 1. 跑通一期 | `video-director` 技能（导演规则、`DIRECTOR.md` 模板、`cues.mjs`、配乐对位与避让）+ 三个账号固定元素。用它把 RAG 这期完整做完（约 63s） | 成片通过第 1 层检查；用户认可；与旧成品对比确实更好 |
| 2. 接入 kv、加自动检查 | kv 增加 ③a / ③b，`brief.md` 加 `video:`；第 2 层检查脚本 | 用新流程从头做一期新主题（验证风格随内容变化），全程 `kv status` 指引正确 |
| 3. 固化经验 | 根据前两期的问题补导演规则和自动检查 | 第三期人工修改轮数明显减少 |

## 测试

- `cues.mjs`、抖音专用检查脚本、配乐对位计算写单元测试，测试数据用 RAG 这期真实的 `audio_meta.json` 和节拍文件；覆盖重复词（同一个词在全片出现多次时写 `@资料#2` 表示第 2 次，不写序号默认第 1 次）、词跨越 Line 边界、词不存在（报错并列出最接近的词）。
- kv 的改动在 `scripts/tests/` 补测试。
- 视觉效果靠第 2 层自动检查 + 用户关卡确认，不做像素级快照测试。

## 不做的事

- 不改配音流程（`nv hf-audio` 照常）。
- 不删旧的 template 流程。
- 不动 hyperframes 仓库里的 dykit 组件，两者互不依赖。

## 风险

- **每条成本高**：样片修了 3 轮。第 2 层检查用来降低；第二期仍然很费时，就回来调整导演规则的颗粒度（比如给常见画面写参考做法）。
- **风格每期都变，质量可能忽高忽低**：③b 样片关卡兜底。
- **HeyGen 依赖**：OAuth 授权会过期（自动刷新）；免费额度若用完或服务不可用，退回用户提供配乐或不加配乐，不阻塞出片。
