# 一期内容的完整制作流程

> 适用于实用类系列（`type: practical`）。概念科普系列（`type: concept`）的流程见文末附录。
> 规则的来源：各 skill 的 SKILL.md、`kv` 的判定代码（`knowledge-video/scripts/lib/practical*.mjs`、`video.mjs`）。两者和这份文档冲突时以代码为准，再回来改这份文档。
> 文中的目录名（`00-规划/`、`04-作品/`、`06-品牌资产/` 等）是 `st init` 建出来的默认约定，项目可以在 `studio.json` 里改。项目自己的设置（账号、设备、发布规则）写在项目的 `00-规划/本项目设置.md`。

---

## 一、总览

### 1.1 一句话

**一个选题 → 真实实测 → 一份母稿 → 一条视频（抖音 + 小红书共用）+ 一篇公众号长文 → 三个网页草稿（带封面） → 人工发布 → 复盘。**

### 1.2 流程图

```
                      ┌──────────── 内容阶段（scenario-content / sc）────────────┐
st new ──▶ 1 场景卡 ─▶ 2 选题关 ① ─▶ 3 实测（手机录屏）─▶ 4 母稿 ─▶ 5 费曼检查 ─▶ 6 sc check
                      ┌──────────── 视频阶段 ─────────────────────────────────────┐
               ─▶ 7 抖音 SCRIPT + VOICE ②
                    ├─ template（默认，narrated-video / nv）：
                    │     8 配音 + 分镜 ③ ─▶ 9 渲染 + QA ④
                    └─ director（video-director / vd）：
                          8 配音 + 导演脚本 ③a ─▶ 9 风格样片 ③b ─▶ 10 渲染 + QA ④
                      ┌──────────── 分发阶段（content-repurpose → 网页存草稿 browser-draft）──┐
               ─▶ 公众号（wa draft）─▶ 小红书（nv draft --to xiaohongshu）─▶ 抖音（nv draft）
                      ┌──────────── 收尾 ────────────┐
               ─▶ 发布记录 ─▶ 复盘（经验库）
```

### 1.3 步骤总表

「#」列是 template 做法的编号；director 做法从第 8 步起多一步，编号整体加一（括号里）。`kv status` 会按这期的做法显示正确的编号。

| # | 步骤 | 主要 skill | 关键命令 | 产出 | 确认 |
|---|---|---|---|---|---|
| 1 | 场景卡 | scenario-content | — | `场景卡.md` | |
| 2 | 选题关 | scenario-content | `sc bench` | `选题关.md`、`实测/对标-*.json` | **①** |
| 3 | 实测 | scenario-content → narrated-video → phone-draft | `nv rec --app` | `实测记录.md`、`实测/*.mp4` | |
| 4 | 母稿 | scenario-content | — | `母稿.md` | |
| 5 | 费曼检查 | scenario-content | — | `费曼检查.md`（补回母稿） | |
| 6 | 自检 | scenario-content | `sc check` | 无 ✗ | |
| 7 | 抖音脚本 + 配音稿 | content-repurpose + narrated-video | `nv hf-audio --check` | `抖音/SCRIPT.md`、`抖音/VOICE.md` | **②** |
| 8 | 配音 + 分镜（template） | narrated-video | `nv hf-audio`、`nv hf-build --snap` | 配音、`抖音/STORYBOARD.md`、`snapshots/sheet.jpg` | **③** |
| (8) | 配音 + 导演脚本（director） | narrated-video + video-director | `nv hf-audio`、`vd cues --check` | 配音、`抖音-director/DIRECTOR.md` | **③a** |
| (9) | 风格样片（director） | video-director | `vd build --sample`、`vd qa` | `抖音-director/renders/sample.mp4` | **③b** |
| 9 (10) | 渲染 + QA | narrated-video（+ video-director）+ knowledge-video | `nv render`（director 加 `vd build`、`vd qa`） | 成片 mp4、`qa.json` | **④** |
| 10 (11) | 公众号 | content-repurpose + wechat-article → browser-draft | `ic render`、`wa preview`、`wa draft` | `公众号/文章.md`、封面、草稿 | |
| 11 (12) | 小红书 | content-repurpose + narrated-video → browser-draft | `nv draft --cover --to xiaohongshu` | `小红书/文案.md`、草稿 | |
| 12 (13) | 抖音草稿 | image-cards + narrated-video → browser-draft | `ic render`、`nv draft --cover` | `抖音/发布文案.md`、`抖音/out/01.png`、草稿 | |
| 13 (14) | 发布记录 | — | — | `发布记录.md`（置顶评论原文） | |
| 14 (15) | 复盘 | knowledge-video | — | `00-规划/经验库/YYYY-MM-DD-<简称>.md` | |

### 1.4 谁做什么

| 角色 | 负责 |
|---|---|
| **用户** | 确认节点拍板（template 4 个，director 5 个）；必要时亲手实测；保持自动化浏览器登录、窗口在前台；在三个网页后台检查草稿、勾 AI 声明、点发布；回填数据 |
| **Claude Code** | 按 `kv status` 一步步做：起草所有文字、抓对标、代为操作手机实测、配音、分镜或导演脚本、渲染、QA、出封面、存三个网页草稿、写复盘 |
| **工具** | `st` 管项目（体检、新建一期）；`kv` 判断进度和关卡；`sc` 检查内容；`nv` 做视频（template）；`vd` 导演工程（director）；`wa` / `ic` 出成品；`bd` 操作浏览器存草稿；`pd` 操作手机录实测 |

### 1.5 三条铁律

1. **每一步开始前先跑 `kv status <作品目录>`，只做它说的那一步。** 不跳步，不凭记忆判断做到哪了。
2. **实测绝不编造。** 没在真实产品里跑过的结果一律不算，母稿里只能标「待实测」，不能发布。
3. **确认节点只认用户明确的「通过」。** 用户说通过后才跑 `kv gate`；提修改意见用 `--edit` 记下来。确认之后又改了相关文件，这个节点会自动失效，要重新确认。

另外：**只存草稿，永远不点发布**；登录、扫码、验证由用户来做。

---

## 二、开工前的准备

### 2.1 环境（第一次或换机器）

先在作品项目里跑 **`st doctor`**：项目目录、各 skill 配置引用的文件、命令和软链接、依赖、外部程序逐项打勾；加 `--online` 再查浏览器能不能连上。缺什么按它的提示补。它查不到的几样：

| 东西 | 用途 | 怎么检查 |
|---|---|---|
| HyperFrames、Chrome headless | 视频渲染 | `nv doctor`；搭建见 `narrated-video/references/setup.md` |
| `.env` 里的 `DASHSCOPE_API_KEY` | 千问配音（qwenaudio）+ fun-asr 识别对齐 | `nv hf-audio . --check` 不花钱，可先跑 |
| 自动化浏览器（固定调试端口，项目配置 `browser-draft.config.json` 的 `cdpPort`） | **三个平台存草稿**、`sc bench` 抓对标 | `bd tabs` 能列出标签页（`st doctor --online`） |
| 自动化浏览器里登录：公众号后台 mp.weixin.qq.com、抖音创作者中心 creator.douyin.com、小红书创作服务平台 creator.xiaohongshu.com | 存草稿（登录、扫码由用户来做） | 各打开一次看是不是已登录 |
| 手机 adb（无线调试） | 实测录屏（存草稿的 `--via phone` 备用） | `pd devices`；地址变了 `pd connect IP:端口` |
| **director 做法另外要**：heygen CLI 授权（配乐）、`NODE_USE_ENV_PROXY=1` | 配乐 | 见 `video-director/SKILL.md`「安装」 |

### 2.2 每期开工前读

- `00-规划/账号定位.md`：观众、人设、主感受、变现路径
- `00-规划/语气指南.md`：**写任何内容前必读**
- `00-规划/系列/<系列>.md`：选题硬标准、候选选题（没有时 `st new` 用 `系列说明模板.md` 建一份，先填好再过选题关）
- `00-规划/经验库/规律.md`：反复出现的修改
- `00-规划/本项目设置.md`（如果有）：账号、设备、发布规则

### 2.3 新建一期

```bash
st new <系列> <简称>                    # 编号自动递增；--编号 N 指定；--video director 用导演做法（默认 template）
kv status 04-作品/<系列>/NN-<简称>
```

`st new` 做的事：

1. 查系列登记表（`00-规划/系列/系列.json`）：系列没登记、已暂停（`paused`）、`type` 不对都会直接报错
2. 填出这些文件。模板先找项目的 `05-模板/`（项目自己改过的），没有就用工具包 `studio/templates/` 里默认的；占位符 `{{标题}}` `{{角标}}` `{{系列}}` `{{编号}}`（角标形如「某系列 · 第 3 期」），`{{账号}}` `{{观众}}` `{{账号定位}}` 来自 `studio.json`，`{{系列说明}}` 是登记表同目录下的 `<系列>.md`：

   ```
   场景卡.md  选题关.md  实测记录.md  实测/  母稿.md  费曼检查.md  发布记录.md
   公众号/文章.md（frontmatter 已写 cover: ./封面/out/01.png）  公众号/封面/封面.md
   小红书/文案.md                              ← 小红书只有文案，发和抖音同一个视频
   抖音/  ← nv init 建的 HyperFrames 工程（blank 示例），外加：
       frame.md（品牌）  .hyperframes/caption-skin.html（中文字幕样式）
       BRIEF.md  SCRIPT.md（成品教程模板）  STORYBOARD.md  封面.md  发布文案.md
       画面组件库（nv hf-kit）
   ```
   `抖音-director/` 不在这里建，到 director 做法的第 8 步再建
3. 跑 `kv init <作品> --fresh [--video …]`：生成 `run.json`，记下每个空模板的哈希，之后 `kv status` 才分得清「还没写」和「写过了」

**选哪种视频做法**：

| | template（默认） | director |
|---|---|---|
| 画面怎么来 | STORYBOARD 每帧一行 `- build:`，帧模板自动生成，统一的 glow 风格 | 先写导演脚本 DIRECTOR.md（视觉方案、分段、每个动作锚定到 @词），每段手写 HTML 或用 dykit 组件，**风格按内容设计** |
| 配乐 | 发布时在抖音曲库选 | `vd build` 自动取曲、重拍对位、人声避让 |
| 确认 | ③ 看分镜总览图 | ③a 审导演脚本 → ③b 看风格样片 |
| 检查 | `nv hf-build` 的越框、字幕带检查 | 另加 `vd qa` 抖音专用检查（@词时刻截图、安全区、栏目标签、2 秒不动） |
| 适合 | 快、稳，每周一期的常规节奏 | 想要更有设计感的一期，花的时间多 |

中途换做法：手改 `run.json` 的 `video`；已通过的节点按新做法重新算。

---

## 三、逐步详解

每一步都按这几块写：**做什么 → 调用哪个 skill、哪条命令 → 产出 → kv 认为做完的条件 → 注意事项**。「kv 判定」照抄 `practical-facts.mjs` 的逻辑，`kv status` 显示的「现在：…」就是这里没满足的那一条。

### 第 1 步：场景卡

- **skill**：scenario-content（第 1 步）
- **做什么**：Claude 起草，用户确认。写出一个具体的人：谁、什么时候、遇到什么（带数字）、他现在怎么做（卡在哪）、痛点句、AI 怎么解决（新手版）、可复制的东西（这期送什么）、边界提醒
- **好场景的标准**：具体（时间、人物、数字、动作）；观众一看就觉得「这不就是我」；痛点句能直接当钩子
- **产出**：`场景卡.md`
- **kv 判定**：`sc check` 对 `场景卡.md` 没有 ✗（字段都填了、没有 `{{…}}` 占位符）
- **注意**：写不出具体内容，说明选题不成立，换题

### 第 2 步：选题关 ①

- **skill**：scenario-content（第 2 步），命令 `sc bench`
- **做什么**：
  1. 抓对标（连自动化浏览器，要已登录抖音、小红书；关键词之间放慢，连着搜太快抖音会出验证码）：
     ```bash
     sc bench <关键词…> --platform all --out 实测/对标-选题关.json --top 10
     ```
     每个关键词输出点赞最高的几条和点赞中位数。抖音只抓搜索结果页，页面上没有收藏数，抖音行的「收藏」是空的（填「—」，看点赞）；结果按点赞排、不按相关度，儿歌合集、无关工具这类跑题的要人工挑掉
  2. 挑和这期最像的 **≥ 5 条**填进对标表：平台、标题、点赞、收藏、角度（结果 / 合集 / 实测对比 / 情绪 / 教程）、**评论区在要什么**（求模板、求教程、问工具名）
  3. 写 3 个标题候选、封面大字（≤ 12 字）、开头三秒口播原话（先给结果、反差或情绪，不先讲方法）
  4. 回答四条硬标准：看完能拿走什么、新手当天能用吗、开头三秒亮什么成品、能领的东西 + 在哪领；再写我亲手跑过的证据、和对标比多什么
  5. 自问「我自己会点开吗」，说不出来就换角度
- **确认 ①**：把标题、封面、开头三秒给用户看。用户说通过后：
  ```bash
  kv gate <作品> topic "用户原话"          # 同时写进 选题关.md 的「用户确认」
  kv gate <作品> topic --edit "用户原话"   # 用户提修改意见时
  ```
- **产出**：`选题关.md`、`实测/对标-选题关.json`
- **kv 判定**：`sc check` 对 `选题关.md` 没有 ✗（字段都填了、对标 ≥ `minBenchmarks` 条）；确认 ① 已通过，而且确认后 `选题关.md` 没改过（指纹比对）
- **常见的坑**：用「AI 的一个方法」开头；人物和风险都是编的小事；选了刷到过一百遍的通用技巧；标题里用「一稿多发」（对标调研发现这个词没人搜）

### 第 3 步：实测（手机录屏）

- **skill**：scenario-content（第 3 步）→ narrated-video 的 `nv rec` → phone-draft 的 `pd rec`
- **做什么**：
  1. Claude 先写好提问，存成 `实测/提问.txt`
  2. 录之前确认：手机已解锁、**开了勿扰**（没开会拒绝录）、App 已登录、`pd devices` 连得上
  3. 录屏，**同一个提问至少跑两轮**：
     ```bash
     nv rec 实测/录屏-第1轮.mp4 --prompt 实测/提问.txt --app deepseek   # 或 --app doubao
     nv rec 实测/录屏-第2轮.mp4 --prompt 实测/提问.txt --app deepseek
     # DeepSeek 默认关深度思考、智能搜索；要开加 --think / --search；回答很长加 --timeout 600
     # 没有手机时：--url <AI 网址> 走浏览器
     ```
  4. 每一轮写进 `实测记录.md`：提问原文、**原始回答原样粘贴**（DeepSeek 用 `.txt` 里「## 复制的完整回答」那段）、用时（`.json`）、文件路径、结果要点。状态改为「已实测」，实测人写「Claude Code 代为操作」或用户本人
  5. 新手版做法也要真跑一遍；和我平时用代码的做法结果不一样，就直说
- **`pd rec` 内部每一轮做什么**：隐私检查（勿扰、能进空白新对话）→ 读回并设好模型开关 → scrcpy 开始录 → 分段打字，读回比对 → 点发送，5 秒内输入框要清空 → 每秒读界面文字，连续 3 次不变才算回答完 → 多录 2 秒 → 裁掉状态栏、转成 1080×1920 → DeepSeek 点「复制」拿完整回答 → **恢复剪贴板和原来的开关**
- **产出**：`实测记录.md`、`实测/录屏-第N轮.mp4` + `.json` + `.txt`、截图
- **kv 判定**：`sc check` 对 `实测记录.md` 没有 ✗（状态是「已实测」、有原始回答）；而且 `实测/` 里**至少有一个 mp4**
- **重点记录**：第一次就成功的地方、**翻车的地方**（最有说服力）、真实用时
- **注意**：手机 IP 和端口常变，连不上就请用户看「无线调试」页的新地址，`pd connect IP:端口`；回答很长时 App 不会自己往下滚，录屏里只有开头，完整内容看 `.txt`

### 第 4 步：母稿

- **skill**：scenario-content（第 4 步），写法见 `references/writing-rules.md` + `00-规划/语气指南.md`
- **做什么**：基于场景卡和实测记录，按 `母稿模板.md` 写。**必须有这 5 个小节**（配置 `requiredSections`，标题里包含这个词就算）：

  | 小节 | 写什么 |
  |---|---|
  | **成品** | 做出了什么、用了多久、花了多少钱（数据来自实测记录） |
  | **场景** | 新手卡在哪（来自场景卡） |
  | **（新手版）步骤** | 三步左右，每步：做什么 → 点哪里 / 复制什么 → 出来是什么样 |
  | **（我踩的）坑** | 实测里真遇到的问题、后果、怎么避开，再加边界提醒 |
  | **领（什么）** | 这期送的模板、提示词包、清单的全文；入口是粉丝群 |

- **产出**：`母稿.md`（**唯一事实来源**，各平台版本只改形式，不新增事实）
- **kv 判定**：`sc check` 对 `母稿.md` 没有 ✗

### 第 5 步：费曼检查

- **skill**：scenario-content（第 5 步），方法见 `references/feynman-check.md`
- **做什么**（按 `费曼检查模板.md`）：
  1. ① 这一期想让观众知道什么（3 条以内，大白话）
  2. ② 零基础但较真的同事会追问什么（**≥ 3 个**），每个问题写出母稿里那句大白话回答，没有就先去母稿补
  3. ③ 术语 → 改成什么说法
  4. ④ 一个类比：要传达的属性（只要一个）+ 检验（人人见过吗？会带偏吗？边界在哪？）
  5. 补上的内容写回母稿
- **产出**：`费曼检查.md`、补过的 `母稿.md`
- **kv 判定**：`sc check` 对 `费曼检查.md` 没有 ✗（追问都答了，有类比和类比检验）
- **注意**：最常见的问题是只给结论、不讲道理。成品教程类可以没有「为什么」，但新手追问时要能一句话带过

### 第 6 步：自检

- **命令**：`sc check <作品目录>`
- **检查项**：

  | 检查项 | 级别 |
  |---|---|
  | 场景卡、选题关有没填的字段；对标 < 5 条；选题关没确认 | ✗ |
  | 实测记录不是「已实测」，或没有原始回答 | ✗ |
  | 母稿缺必需小节 | ✗ |
  | 没做费曼检查、追问没答完、缺类比或类比检验 | ✗ |
  | 残留 `{{…}}` 占位符 | ✗ |
  | 抖音口播情感写错 | ✗ |
  | 费曼检查列的术语还留在母稿里 | ⚠ |
  | AI 腔用语（通用词表 + 项目补充） | ⚠ |
  | 标题、口播超长（公众号标题 ≤ 30 字、小红书标题 ≤ 20 字、抖音标题 ≤ 30 字、抖音口播每句 ≤ 28 字） | ⚠ |
  | 抖音口播有书面词、阿拉伯数字，或整段没有语气词 | ⚠ |

- **kv 判定**：内容阶段的文件（场景卡、选题关、实测记录、母稿、费曼检查）和全局项在 `sc check` 里没有 ✗（「选题关没确认」这一条不算，它由确认 ① 单独管）。平台文件（抖音 SCRIPT、公众号、小红书、抖音发布文案）的 ✗ 不挡这一步，到各自那一步再拦。⚠ 要逐条判断，确实要保留的说明理由
- **注意**：第 7 步和三个平台版本写完后，再跑一次 `sc check`

### 第 7 步：抖音脚本 + 配音稿 ②（两种做法相同）

- **skill**：content-repurpose（`references/douyin.md`）+ narrated-video（`references/douyin-recipe.md`「成品教程」、`references/voice-direction.md`）
- **做什么**：
  1. 写 `抖音/SCRIPT.md`（模板已按「成品教程」放好，**约 14 帧，90–120 秒**）：

     | 帧 | 段落 | 口播 |
     |---|---|---|
     | 1 | 钩子：成品亮相 | 成品 + 代价，一两句 |
     | 2 | 你能拿到什么 | 「今天教你，新手照着做就行」 |
     | 3 | 准备 | 工具 / 花费 / 用时 |
     | 4–9 | 三步 | 每步两帧：先说做什么，再看真实操作和结果 |
     | 10 | 一个坑 | 我第一次踩的坑，说后果 |
     | 11 | 怎么避开 | 一句话 |
     | 12 | 回到成品 | 「就这三步，你也能做出来」 |
     | 13 | 领模板 | 领什么、去哪领（粉丝群） |
     | 14 | 下一期 | 一句预告 |

     格式：`## 段名 (Frame N)` + `**重点词:**` + `**Emotion:**`（平静 / 开心 / 惊讶 / 难过 / 生气 / 害怕 / 厌恶）+ 缩进的口播行。**每句 ≤ 28 字、数字写汉字**、聊天口吻、不自我介绍、口播里不出现观众不认识的人名、每句都要和实测原文对得上。发布文案另写在 `抖音/发布文案.md`（抖音草稿那一步）
  2. 写 `抖音/VOICE.md`（配音导演稿）：`## 段名 (Frame 首-末)`，一段覆盖连续几帧；每段一个 ```` ```text ```` 代码块 = 开头一句整段语气 + 引号里的整段台词 + 结尾一句说话状态。台词里放毛边：一段 150–250 字里放 5–8 处「…」，语气词和半个词的重复合计 2–4 处（写成 `{呃，}`、`{却…}却`）。**钩子第一句和重点词不加语气词；不要逐句写表演说明**
  3. 核对（只检查，不花钱）：
     ```bash
     nv hf-audio 抖音 --check     # 引号里的台词连起来必须等于口播原文（{} 里的不算）
     ```
  4. 跑 `sc check`，抖音口播那几项 ⚠ 逐条看
- **确认 ②**：SCRIPT 和 VOICE **一起**给用户看。通过后 `kv gate <作品> script "用户原话"`
- **产出**：`抖音/SCRIPT.md`、`抖音/VOICE.md`
- **kv 判定**：SCRIPT.md 不是空模板、口播已经填了；`nv hf-audio --check` 通过；确认 ② 通过，而且确认后 SCRIPT、VOICE 都没改过
- **注意**：② 之前不配音、不渲染

### 第 8 步（template）：配音 + 分镜 ③

- **skill**：narrated-video（`references/douyin-recipe.md`、`references/hf-kit.md`）
- **做什么**：
  1. 配音：
     ```bash
     nv hf-audio 抖音 --pause 0.3
     ```
     qwenaudio（千问 qwen-audio-3.1-tts-next）+ 参考音色（配置 `tts.reference`） + 配置里的 `tts.style` 人设，按 VOICE.md **整段生成**，再用 fun-asr 识别拿到时间、按字对齐回原文，最后切回每帧。生成 `audio_meta.json` 和字幕分组 `caption_groups.json`，每帧时长自动写回 STORYBOARD。换一种演法：改 `tts.seed`；换回豆包：`tts.provider` 改成 `seedaudio`
  2. 写 `抖音/STORYBOARD.md`：每帧一行 `- build: {…}`（帧模板 JSON），时间写 `"@词"`（说到这个词时），不手写秒数。可以组合的部分：
     - `rec`：录屏（`mediaStart`、`rate` 倍速、`dim`、`chip` 标签）
     - `timer`：计时
     - `kit`：组件，如 `compare`、`shot`、`prompt`、`steps`、`checklist`、`template`、`chat`、`answer`、`stream`、`number`、`strike`、`marker`、`receipt`、`attach`、`pick`
     - `lead`：说明
     - `title`：标题
     - `ground: "accent"`：整屏强调色，整片最多一帧，留给「一个坑」

     画面规则（每帧都要过）：
     - 画面是口播的延伸，不是把字幕再写一遍
     - 纯文字帧最多连着两帧
     - 不加口播和实测里没有的信息
     - 内容待在四角框里（y 330–1160）
     - 主体要铺开（纵向 ≥ 55%）
     - 落定后静止，不做退场
     - 一帧只有一个亮点动作，和口播的词对齐
     - 不剧透
     - 动画别挂在句尾的词上
     - 标题一行 ≤ 9 字

     最需要「看懂」的一两帧可以删掉 build 行，手写 `compositions/frames/NN-*.html`，整片最多 2 帧
  3. 一键组装并截图：
     ```bash
     nv hf-build 抖音 --snap
     ```
     依次做：组件库 + 逐字时间 → 帧时长 → 按 build 生成画面 → 音效（`- sfx: error @词`）→ 素材 → 中文字体 → 字幕 → index → 转场 → lint/check（`--caption-zone` 字幕带检查 + 越框检查 `bounds.py`）→ 每帧截图拼成 `snapshots/sheet.jpg`。**报错必须修**
  4. **看 `snapshots/sheet.jpg`**，自查断行、遮挡、越框、节奏
- **确认 ③**：把 `sheet.jpg` 给用户看。通过后 `kv gate <作品> storyboard "用户原话"`
- **产出**：`抖音/audio_meta.json` + 配音、`抖音/STORYBOARD.md`、`抖音/snapshots/sheet.jpg`
- **kv 判定**：有 `audio_meta.json`；STORYBOARD 不是空模板；有 `sheet.jpg`，而且比 STORYBOARD 和配音都新（改过 STORYBOARD 或重新配音，都要重跑 `--snap`）；确认 ③ 通过，而且确认后 STORYBOARD、`audio_meta.json` 没改过
- **注意**：改了口播 → 回第 7 步（② 会失效）→ 重跑 `nv hf-audio` 和 `nv hf-build`

### 第 9 步（template）：渲染 + QA ④

- **skill**：narrated-video（`nv render`）+ knowledge-video（`references/qa.md`）
- **做什么**：
  1. 渲染：
     ```bash
     nv render 抖音        # 输出 抖音/renders/<作品名>.mp4，自动跑 nv verify（帧数、时长、声音、尺寸、黑屏）
     ```
  2. 看过程，而不只看结尾那一张：
     ```bash
     nv hf-build 抖音 --motion   # 每帧截入场 / 中段 / 落定前 / 落定四张（snapshots/motion-sheet.jpg），落定后完全静止会警告
     ffmpeg -ss <秒> -i 抖音/renders/<成片>.mp4 -frames:v 1 x.png   # 成片抽帧
     ```
  3. 写作品目录下的 `qa.json`，`checked` 必须写全这 7 项：

     | 检查项 | 看什么 |
     |---|---|
     | `safe-area` | 内容在 x 60–1020、y 230–1150；不进字幕带（y 1180–1440）和右侧 150px |
     | `text-size` | 手机上要读的字 ≥ 37px |
     | `density` | 一屏一个主体；表格最多 2～3 行 |
     | `typo` | 错别字、标点、术语前后一致 |
     | `fact-on-screen` | 画面上的数字、说法和实测记录一致；说到「点哪里、在哪个位置」的，对照实测录屏或截图核对 |
     | `rhythm` | 画面跟着口播出现；不连续三帧同一种画面、同一边构图 |
     | `motion` | 每帧落定后都还在动 |

     问题分 `high`（必须修，修好前不给用户看）、`medium`、`low`。全部修好后写 `"passed": true`
- **确认 ④**：成片给用户看。通过后 `kv gate <作品> final "用户原话"`。项目有自己的发布规则（比如「前几期过了 ④ 就发」）写在本项目设置里
- **产出**：`抖音/renders/*.mp4`（**成片**）、`qa.json`
- **kv 判定**：`renders/` 里有正式成片（文件名以「预览」「sample」「compare」开头的不算）；成片比 `sheet.jpg` 新；有 `qa.json`，比成片新，`passed: true`；确认 ④ 通过，而且之后成片没变
- **注意**：视频不进 git，成品另存网盘

### 第 8–10 步（director）：导演脚本 ③a → 风格样片 ③b → 渲染 + QA ④

`run.json` 写了 `"video": "director"` 时走这三步，代替上面的 template 第 8、9 步。详细写法见 `video-director/SKILL.md` 和 `references/director-rules.md`。

#### 第 8 步：配音 + 导演脚本 ③a

- **skill**：narrated-video（配音）→ video-director（导演脚本）
- **做什么**：
  1. 配音（同 template）：`nv hf-audio 抖音 --pause 0.3`（同时生成下面要复制的 `caption_groups.json`）
  2. 新建导演工程：
     ```bash
     cd 04-作品/<系列>/NN-<简称>
     mkdir -p 抖音-director/{compositions/frames,assets}
     cp 抖音/{SCRIPT.md,audio_meta.json,caption_groups.json,package.json,hyperframes.json,meta.json} 抖音-director/
     cp -r 抖音/assets/voice 抖音-director/assets/
     cp ~/.claude/skills/video-director/templates/{index.html,DIRECTOR.md} 抖音-director/
     ```
  3. 写 `抖音-director/DIRECTOR.md`（口播原文和事实一字不改）：
     - 1 视觉方案：一句话概念（视觉世界从内容哪里来）、贯穿元素、配色（每个颜色写含义）、字体（只用 Noto Sans SC / Noto Serif SC / JetBrains Mono）、情绪曲线
     - 2 分段：按意思分段（不是一句一帧），每段写包含哪几句、画面、每个动作的 `@词`、和下一段怎么连；功能性画面先查 dykit 组件库，有就写 `component` 和 `vars`
     - 3 导演规则自检、4 音乐、5 账号固定元素（栏目标签、字幕、结尾）、6 新增内容、7 样片范围、8 组件候选
     - 末尾的 ```` ```json vd ```` 机器块
  4. 校验 @词都找得到：
     ```bash
     vd cues 抖音-director --check
     ```
- **确认 ③a**：把 DIRECTOR.md 给用户审。通过后 `kv gate <作品> director "用户原话"`
- **kv 判定**：`抖音/audio_meta.json` 存在；有 `DIRECTOR.md`；配音已复制进 `抖音-director/`（`audio_meta.json` 比 `抖音/` 里的新）；`vd cues --check` 通过；确认 ③a 通过，而且之后 DIRECTOR.md（只补第 8 节组件候选不算）和配音没改过
- **注意**：重新配音后要把 `audio_meta.json`、`caption_groups.json`、`assets/voice/` 重新复制到 `抖音-director/`，③a 会失效

#### 第 9 步：风格样片 ③b

- **skill**：video-director
- **做什么**：
  1. 写样片范围内的几段：从 `templates/segment.html` 复制到 `compositions/frames/<段id>.html`，时间只用 `at("词")`；贯穿元素写进 `index.html` 手写区
  2. 组装、检查、出样片：
     ```bash
     vd build 抖音-director --sample      # 只装样片的段，到 sample.end 为止
     vd qa 抖音-director                  # 抖音专用检查，结果 qa-douyin-sample.json，总览 snapshots/cues-sheet.jpg
     nv render 抖音-director --sample      # 出 抖音-director/renders/sample.mp4
     ```
     `vd qa` 在每个 @词 落定时刻（@词后 0.8 秒）和每段结尾截图，查：安全区（顶 200 / 右 160（y 760 往下）/ 底 480）、字幕带 y 1180–1440、栏目标签被挡、`data-vd-cue` 元素看不见（✗）；2 秒不动（⚠）
- **确认 ③b**：样片给用户看。通过后 `kv gate <作品> sample "用户原话"`
- **kv 判定**：有 `抖音-director/renders/sample.mp4`；`qa-douyin-sample.json` 存在且 `passed: true`；确认 ③b 通过，而且之后样片没换

#### 第 10 步：渲染 + QA ④

- **skill**：video-director + narrated-video + knowledge-video（`references/qa.md`）
- **做什么**：
  1. 写其余各段，每写一段 `vd build 抖音-director --no-music` + 截图；全部写完 `vd build 抖音-director`（配乐取曲、重拍对位、人声避让）
  2. `vd qa 抖音-director` 无 ✗（结果 `qa-douyin.json`），按总览图逐条对照 DIRECTOR.md
  3. `nv render 抖音-director` 出成片（`抖音-director/renders/<作品名>.mp4`）；和旧版做对比视频 `renders/compare.mp4`（可选）
  4. 按 `references/qa.md` 写作品目录下的 `qa.json`（同 template 的 7 项）
  5. `vd check 抖音-director` 列出组件候选
- **确认 ④**：成片 + 组件候选一起给用户看。通过后 `kv gate <作品> final "用户原话"`；组件候选由用户决定哪些提交到 hyperframes 仓库
- **产出**：`抖音-director/renders/*.mp4`（**成片**）、`qa-douyin.json`、`qa.json`
- **kv 判定**：`抖音-director/renders/` 里有正式成片（不算 `sample`、`compare`、`预览`）；成片比工程里最新的 HTML 新；`qa-douyin.json` 存在、`passed: true`、比最新 HTML 新；`qa.json` 比成片新、`passed: true`；确认 ④ 通过

### 公众号（template 第 10 步 / director 第 11 步）

- **skill**：content-repurpose（`references/wechat.md`）→ wechat-article（`wa`）→ browser-draft
- **做什么**：
  1. 从母稿改编 `公众号/文章.md`：1500–3000 字，3–5 个二级小节，开头 100 字内说清读完能得到什么；**模板全文放这里**（公众号也是领模板的地方）；文末写领模板的方式（回复关键词）
     - frontmatter：`title`（必填）、`author`（≤ 8 字，模板写的是 `studio.json` 的 account）、`cover: ./封面/out/01.png`（模板已写好）
     - 不写 `# 一级标题`；表格不超过 4 列；`**` 不要紧贴中文标点
  2. 出封面：
     ```bash
     ic render 公众号/封面/封面.md       # wechat-cover 预设，2.35:1，输出 公众号/封面/out/01.png；看图确认
     ```
  3. 预览：`wa preview 公众号/文章.md`，生成 `预览.html`（手机宽度，grace 主题）
  4. 存草稿：
     ```bash
     wa draft 公众号/文章.md              # 默认浏览器（公众号后台）；--via phone 用手机公众号助手（备用）
     ```
     浏览器会做这些：在公众号后台新建图文 → 填标题和作者 → 粘贴正文（本地图片内联后自动转存到微信图床）→ **用 frontmatter 的 `cover` 上传封面** → 保存草稿。粘贴时公众号「内容结构检测」的提示会打印出来，只是建议，脚本照常继续
  5. 在后台草稿箱点「预览」发到手机，看一遍
  6. 成功后：`kv done <作品> wechat`
- **kv 判定**：`公众号/文章.md` 不是空模板，而且已经 `kv done wechat`
- **注意**：个人主体没有接口，`wa publish` 用不了；粘贴正文会用到系统剪贴板，会覆盖你剪贴板里原来的内容；封面图不存在时 `wa draft` 直接报错

### 小红书（template 第 11 步 / director 第 12 步）

- **skill**：content-repurpose（`references/xiaohongshu.md`「视频笔记」）→ narrated-video（`nv draft`）→ browser-draft
- **做什么**：
  1. 写 `小红书/文案.md`（格式：`## 标题` / `## 正文` / `## 话题`，解析器认段名开头）：
     - 标题 ≤ 20 字，口语化，带搜索关键词
     - 正文 300–600 字：第一句直接给结论 → **把视频里的三步写成能照着做的清单** → 结尾「模板在群聊，进群领」+ 一个互动问题
     - 话题 5–10 个，大词和细分词混搭，参考 `sc bench` 抓到的对标
  2. 存草稿（和抖音同一个成片、同一张封面；成片路径按做法：template 是 `抖音/renders/`，director 是 `抖音-director/renders/`）：
     ```bash
     nv draft <成片.mp4> --copy 小红书/文案.md --cover 抖音/out/01.png --to xiaohongshu
     ```
     浏览器会做这些：打开创作服务平台「上传视频」→ 上传成片，等传完（以出现「重新上传」「设置封面」、没有进度为准）→ 上传封面（真实鼠标悬停缩略图出「编辑封面」→ 弹窗里上传 → 完成，以缩略图换掉为准）→ 填标题（读回校验）→ 粘贴正文 → 逐个从联想里选话题 → 点「暂存离开」（按钮在 shadow DOM 里，按文字点）→ 看「草稿箱（N）」有没有加一
  3. 成功后：`kv done <作品> xiaohongshu`
- **kv 判定**：`小红书/文案.md` 不是空模板，而且已经 `kv done xiaohongshu`
- **注意**：
  - **网页草稿只存在这台电脑的浏览器里**，不同步到手机 App，清浏览器数据会丢；在创作服务平台「草稿箱」里预览，在电脑上发布
  - 网页按 3:4 裁封面，9:16 的封面只留上面一截，**封面大字要放在上半部分**
  - 抖音封面要先出好（抖音草稿那一步的 `ic render 抖音/封面.md`），没有就先出图再跑
  - 脚本中途失败时可能留下一份半成品草稿，删掉即可

### 抖音草稿（template 第 12 步 / director 第 13 步）

- **skill**：image-cards（`ic`）+ narrated-video（`nv draft`）→ browser-draft
- **做什么**：
  1. 出封面：
     ```bash
     ic render 抖音/封面.md          # douyin-cover 预设，9:16；≤ 12 字，<br> 断行，加粗一个关键词，大字放上半部分
     ```
     看 `抖音/out/01.png` 确认
  2. 写 `抖音/发布文案.md`（新建一期时已放好模板；格式同小红书：`## 标题`（≤ 30 字，`sc check` 会查）/ `## 正文` / `## 话题`）：一句话说清价值，结尾写领取方式，再加 2–4 个话题
  3. 存草稿：
     ```bash
     nv draft <成片.mp4> --copy 抖音/发布文案.md --cover 抖音/out/01.png
     # 默认浏览器（创作者中心）；--via phone 用手机（备用，不支持 --cover）
     ```
     浏览器会做这些：先检查有没有上次未发布的作品（有就停下，不覆盖）→ 上传视频，等「上传成功」→ 填标题（读回校验）→ 简介 → 逐个从联想里选话题 → 「选择封面」弹窗里**横封面（4:3）、竖封面（3:4）都上传** `--cover` 的图 → 等「封面检测」结束 → 点「暂存离开」
  4. 成功后：`kv done <作品> douyin`
- **kv 判定**：`抖音/发布文案.md` 不是空模板；`抖音/out/` 里最新的 `NN.png` 比 `抖音/封面.md` 新；而且已经 `kv done douyin`
- **注意**：**抖音网页端只保留一条未发布的作品**：已有一条时脚本会停下，先在创作者中心把它发布或「放弃」。预览在创作者中心「发布视频」页点「继续编辑」，右侧有手机预览。不传 `--cover` 时用视频画面做封面，弹窗有时加载不出来，会提示「封面没设上」

### 发布记录（template 第 13 步 / director 第 14 步）

- **做什么**：照 `发布记录.md` 的清单逐条过：
  - **抖音**：完整看一遍成片；横竖封面；背景音乐（template 在曲库里选，轻快、无人声、调低；director 已自带配乐）；发布文案；置顶评论（「模板在粉丝群，点头像进群领」）；粉丝群里已经发好模板；**勾选「内容由 AI 生成」**；全程没有微信号、二维码、「加微信」；数字都能在实测记录里找到出处
  - **公众号**：草稿箱「预览」看过；文末写清领模板的方式，关键词自动回复已经设好
  - **小红书**：封面没被裁坏；勾选 AI 声明；正文结尾写领取方式；没有站外导流
  - 用户在三个网页后台点发布后（小红书网页草稿只在电脑上，也要在电脑上发），回填发布时间、链接；24 小时、7 天的数据回头再填
- **kv 判定**：`发布记录.md` 里「置顶评论（原文）」代码块已经换成真实原文（不是模板里的占位文字）
- **发布时间**：按本项目设置；没有就先用晚上 19–21 点，发几期后按后台数据调

### 复盘（template 第 14 步 / director 第 15 步）

- **skill**：knowledge-video（经验库）
- **做什么**：在 `00-规划/经验库/` 写 `YYYY-MM-DD-<简称>.md`：
  - 各确认节点用户改了什么（原稿 → 改后，来自 `run.json` 的 `edits`）
  - QA 发现的问题、缺了哪些组件、渲染等环节的问题；director 做法还要记组件候选的去向
  - 发布后的数据和评论区的问题（下一期的选题来源）
  - 同一类修改出现 2 次以上，写进 `规律.md`，注明该改哪个文件（先问用户）
- **kv 判定**：经验库里有文件名带这期简称的文件

---

## 四、各 skill 详解

所有 skill 都在工具包仓库里（`<工具包>/<名字>/`），`st install` 软链到 `~/.claude/skills/`、命令放进 `~/.local/bin/`，都和作品项目无关。项目专属的部分写在作品项目根目录的 `<skill>.config.json` 和 `studio.json`。依赖装在各 skill 自己的 `node_modules/`、`.venv/` 里。

### 4.0 studio（`st`）：工具包总入口

| 命令 | 用途 |
|---|---|
| `st doctor [--online]` | 检查作品项目和工具包：`studio.json`、系列登记表、模板覆盖、品牌文件、各 skill 配置引用的路径、命令和软链接指向、依赖、外部程序；`--online` 再查浏览器 |
| `st new <系列> <简称> [--编号 N] [--video director\|template]` | 新建一期（见 2.3）；`st new 单篇 <简称> [--栏目 名称] [--日期 YYYY-MM-DD]`；`--只建抖音` 给已有作品补建抖音工程 |
| `st init <目录> [--account 账号名] [--audience 目标观众]` | 建一个新的作品项目（目录骨架、各 skill 默认配置、起步品牌样式） |
| `st install [--deps]` | 把工具包里的 skill 注册给 Claude Code、命令放进 `~/.local/bin`；`--deps` 顺便装 Node / Python 依赖 |

- 作品项目的标记是根目录的 `studio.json`：`works`、`templates`、`brand`、`registry`、`positioning` 是目录约定，`account`、`audience` 填进模板，`toolkit` 是项目要求的工具包版本
- 模板覆盖：默认模板在 `studio/templates/`；项目只把自己改过的放进 `05-模板/`（相同的相对路径和文件名）

### 4.1 knowledge-video（`kv`）：总调度

| 命令 | 用途 |
|---|---|
| `kv status <作品>` | 按这期的视频做法列出 14 / 15 步 ✓/·、确认节点状态、**下一步做什么 + 为什么没过** |
| `kv gate <作品> topic\|script\|storyboard\|director\|sample\|final "原话"` | 记下用户的确认（template 用 storyboard，director 用 director、sample）；前面的步骤没做完会被拒绝 |
| `kv gate <作品> <节点> --edit "原话"` | 记下修改意见（不算通过） |
| `kv done <作品> wechat\|xiaohongshu\|douyin` | 记下草稿已存；内容文件没写好会被拒绝 |
| `kv init <作品> [--fresh] [--video director\|template]` | 生成 `run.json`；`--fresh` 记下空模板的哈希；`--video` 定视频做法 |
| `kv check` / `kv brief` | 概念科普用：研究来源、脚本依据检查、研究简报 |

**内部机制**：

- **进度从文件推出来，不靠手记**：`practical-facts.mjs` 读作品目录，判断每一步满足没有；`practical.mjs` 按 `run.json` 的 `video` 选步骤表（`stepsFor`），从第 1 步往下找第一个没满足的，就是「下一步」
- 第 1–6 步调 `sc check --json`，按出问题的文件归到对应的步骤；第 7 步调 `nv hf-audio --check`；director 第 8 步调 `vd cues --check`。命令名可以用 `KV_SC_CMD`、`KV_NV_CMD`、`KV_VD_CMD` 换
- **确认的指纹**：`kv gate` 把相关文件的 sha256 存进 `run.json`。之后文件一变，这个节点就算 stale，要重新确认：

  | 节点 | 管哪些文件 |
  |---|---|
  | ① topic | `选题关.md` |
  | ② script | `抖音/SCRIPT.md`、`抖音/VOICE.md` |
  | ③ storyboard（template） | `抖音/STORYBOARD.md`、`抖音/audio_meta.json` |
  | ③a director | `抖音-director/DIRECTOR.md`（不算第 8 节组件候选）、`抖音/audio_meta.json` |
  | ③b sample | `抖音-director/renders/sample.mp4` |
  | ④ final | 最新的正式成片 mp4（template 在 `抖音/renders/`，director 在 `抖音-director/renders/`） |

- **新旧检查**：sheet 比 STORYBOARD 或配音旧、成片比 sheet（director：比最新 HTML）旧、`qa.json` 比成片旧、`qa-douyin.json` 比最新 HTML 旧、封面 PNG 比 `封面.md` 旧，都算没做完
- **正式成片**：文件名以「预览」「sample」「compare」开头的 mp4 都不算
- 配置 `knowledge-video.config.json`：`series`、`audience`、`voiceGuide`、`experienceDir`

### 4.2 scenario-content（`sc`）：内容这几步怎么做

| 命令 | 用途 |
|---|---|
| `sc bench <关键词…> [--platform 抖音\|小红书\|all] [--out 文件.json] [--top 10]` | 在已登录的浏览器里搜关键词，抓点赞最高的几条和中位数 |
| `sc check <作品> [--json]` | 检查场景卡、选题关、实测、母稿、费曼检查、AI 腔、各平台长度 |

- 七步方法论：场景卡 → 选题关 → 实测 → 母稿 → 费曼检查 → 自检 → 改编（交给 content-repurpose）
- 参考：`references/writing-rules.md`（写作规则 + AI 腔词表）、`references/feynman-check.md`
- 配置 `scenario-content.config.json`：
  - `voiceGuide`
  - `requiredSections`：成品、场景、步骤、坑、领
  - `platformFiles`：公众号/文章.md、小红书/文案.md、抖音/发布文案.md、抖音/SCRIPT.md
  - 默认值：`minBenchmarks` 5、`benchCdpPort` 9333

### 4.3 content-repurpose：母稿 → 各平台（方法，没有命令）

- **原则**：母稿是唯一事实来源；按平台场景重写，而不是压缩；每个版本只留一个核心信息；**「为什么、类比、怎么做」每个平台都保留**
- 改编顺序：母稿 → 公众号 → 小红书 → 抖音（越往后删得越多）
- 平台对照：

  | | 公众号 | 小红书（发视频笔记） | 抖音 |
  |---|---|---|---|
  | 形式 | 长文 | 同抖音成片 + 文案 | 竖屏视频（成品教程 90–120 秒） |
  | 篇幅 | 1500–3000 字 | 文案 ≤ 1000 字（建议 300–600） | 口播每句 ≤ 28 字 |
  | 标题 | ≤ 30 字 | ≤ 20 字 | 封面字 ≤ 12 字，文案标题 ≤ 30 字 |
  | 封面 | 2.35:1（`公众号/封面/`） | 用抖音封面，网页裁 3:4 | 9:16（`抖音/封面.md`），网页再裁 4:3 / 3:4 |
  | 留存点 | 结尾行动清单、模板全文 | 正文步骤清单（收藏） | 完播 + 评论 |

- 参考：`references/wechat.md`、`references/xiaohongshu.md`、`references/douyin.md`（每份都有自检清单）
- 写之前还要读：`00-规划/平台策略/<平台>.md`、`00-规划/系列/<系列>.md`

### 4.4 narrated-video（`nv`）：视频（template 做法的主力；两种做法都用它配音、渲染、存草稿）

| 命令 | 用途 | 在哪一步 |
|---|---|---|
| `nv rec <out.mp4> --prompt <提问.txt> --app deepseek\|doubao [--think] [--search] [--timeout N]` | 手机 AI App 实测录屏（调 `pd rec`）；`--url` / `--via browser` 走浏览器 | 实测 |
| `nv rec-flow <out.mp4> --steps 步骤.py --url <网址>` | 录电脑横屏的网页操作（多步向导） | 实测（需要时） |
| `nv hf-audio <工程> [--check] [--pause 0.3]` | 配音 + 逐字时间；`--check` 只核对导演稿 | 脚本、配音 |
| `nv hf-kit <工程>` | 装入画面组件库（新建时已装） | — |
| `nv hf-build <工程> --snap` | 一键组装 + 检查 + 总览图 | template 分镜 |
| `nv hf-build <工程> --motion` | 每帧四张过程截图 + 静止检测 | template QA |
| `nv render <工程>` | 渲染 + `nv verify`（director 也用它渲染 `抖音-director`） | 渲染 |
| `nv draft <mp4> --copy <文案.md> [--cover <图>] [--to douyin\|xiaohongshu] [--via browser\|phone]` | 存草稿（默认浏览器；`--cover` 只支持浏览器） | 小红书、抖音草稿 |
| `nv snapshot`、`nv preview`、`nv doctor`、`nv lint` | 其他子命令原样透传给 hyperframes | 随时 |

- **核心原则：先配音，再做动画。** 画面时间从配音时间轴取，不手写秒数
- 视觉：glow 风格（`hfKit.look: "glow"`）：深色底、荧光黄是唯一强调色、四角 HUD 框、玻璃卡片。品牌文件在项目的品牌目录（`studio.json` 的 `brand`，默认 `06-品牌资产/hyperframes/`：frame.md、caption-skin、账号固定元素）；GSAP 由 nv 自带
- 分镜配方 `references/douyin-recipe.md`：
  - 成品教程（实用类默认，约 14 帧）
  - 翻车讲方法（聊天版，17–18 帧，模板在 `SCRIPT模板-翻车.md`）
  - 画面规则 7 条、节奏规则 10 条
- 组件选用表 `references/hf-kit.md`（写帧之前读）；配音导演稿 `references/voice-direction.md`；环境 `references/setup.md`
- 网页存草稿脚本：`scripts/draft_douyin.py`、`scripts/draft_xiaohongshu.py`；手机备用：`scripts/phone_douyin.py`、`scripts/phone_xiaohongshu.py`
- 配置 `narrated-video.config.json`：`tts`（qwenaudio + 参考音色 + style）、`theme`、`hfKit`（glow + 颜色 token）、`rec`（9333 端口、深色、隐藏沉浸式翻译）

### 4.5 video-director（`vd`）：导演工程（director 做法）

| 命令 | 用途 |
|---|---|
| `vd cues <工程> [--check]` | 校验 DIRECTOR.md，把所有 @词换算成秒数写进 `cues.js`；`--check` 只校验不写文件（kv 用它判定 ③a） |
| `vd build <工程> [--sample] [--no-music] [--update-components]` | 拼配音 + 混音效 → 安装用到的 dykit 组件 → 写 `index.html` 的 `vd:head` / `vd:audio` / `vd:segments` / `vd:brand` 四块 → 配乐取曲、重拍对位、人声避让 → `hyperframes check`。`--sample` 只装样片的段 |
| `vd qa <工程>` | 抖音专用检查（@词时刻截图 + 安全区 + 字幕带 + 栏目标签 + 2 秒不动），结果 `qa-douyin.json`（样片是 `qa-douyin-sample.json`），总览 `snapshots/cues-sheet.jpg` |
| `vd check <工程>` | 校验 DIRECTOR.md + 列出组件候选 + `hyperframes check` |

- **原则**：风格从内容里长出来；每个动作锚定到口播里的词；账号只固定栏目标签、字幕、结尾三处
- 每段画面：`templates/segment.html` → `compositions/frames/<段id>.html`，时间只用 `at("词")`，元素 id 加段前缀，不自己画栏目标签和字幕
- dykit 组件库：GitHub `18826400652/hyperframes`（`catalog/catalog.json`）；`components.lock.json` 锁版本，`--update-components` 才换新版；配色套这条视频的 `palette`
- 组件候选：DIRECTOR.md 第 8 节记录「换文字就能复用」的画面，④ 时交给用户决定是否提交到组件库
- 重新配音：在 `抖音/` 里 `nv hf-audio`，再把 `audio_meta.json`、`caption_groups.json`、`assets/voice/` 复制到 `抖音-director/`，`vd build`
- 导演规则：`references/director-rules.md`（视觉方案、节奏、版面、HyperFrames 的坑、组件）
- 配置 `video-director.config.json`：`brandDir`、`sfxDir`（`hfVersion` 不用写，hyperframes 统一用 narrated-video 那一份）；选填 `fontsDir`、`gsap`（默认用 vd 自带的 fontsource 字体包和 GSAP，`npm ci` 装好）

### 4.6 wechat-article（`wa`）：公众号

| 命令 | 用途 |
|---|---|
| `wa preview <文章.md>` | 生成 `预览.html`（手机宽度 + 「复制到公众号」按钮） |
| `wa render <文章.md>` | 公众号 HTML 输出到标准输出 |
| `wa draft <文章.md> [--via phone]` | 存草稿（默认浏览器，自动上传 frontmatter 的 `cover`；`--via phone` 用手机公众号助手） |
| `wa publish` | 接口发布（个人号**不可用**） |

- 底座是文颜 `@wenyan-md/cli`；主题 `grace`（移植自 doocs/md，品牌适配在 `themes/src/grace.extra.css`）
- 网页存草稿脚本：`scripts/draft_wechat.py`；手机备用：`scripts/phone_wechat.py`
- 配置 `wechat-article.config.json`：`theme: grace`、`highlight`、`account`（公众号名称，手机备用发草稿时核对）

### 4.7 image-cards（`ic`）：封面

| 命令 | 用途 |
|---|---|
| `ic render <卡片.md> [--preset …] [--out 目录]` | Markdown → PNG（`01.png` …），内容溢出时退出码是 2 |
| `ic preview <卡片.md>` | 只生成预览 HTML |
| `ic draft <文案.md>` | 小红书**图文**笔记存草稿（只有浏览器；默认流程不用） |

- 默认流程用它出两种封面：
  - `抖音/封面.md`：`douyin-cover`，9:16 → `抖音/out/01.png`（抖音、小红书共用）
  - `公众号/封面/封面.md`：`wechat-cover`，2.35:1 → `公众号/封面/out/01.png`
- 版式：`cover`、`content`、`list2`、`quote`、`end`、`image`；主题、页脚在 `image-cards.config.json`（`theme`、`footer`）
- **出图后一定要看图**

### 4.8 browser-draft（`bd`）：浏览器存草稿（三个平台默认）

| 命令 | 用途 |
|---|---|
| `bd tabs` | 检查能不能连上浏览器，列出标签页 |
| `bd run <步骤.py> [载荷.json]` | 执行一个平台的步骤（一般由 `wa draft` / `nv draft` / `ic draft` 间接调用） |

- 三个平台的网页脚本：
  - 公众号 `wechat-article/scripts/draft_wechat.py`
  - 抖音 `narrated-video/scripts/draft_douyin.py`
  - 小红书视频 `narrated-video/scripts/draft_xiaohongshu.py`
  - 另外还有小红书图文 `image-cards/scripts/draft_xiaohongshu.py`，默认流程不用
- **连哪个浏览器**，按顺序找：`BU_CDP_WS` → `BD_CDP_PORT` → 项目配置 `browser-draft.config.json` 的 `cdpPort`（用固定端口启动的自动化浏览器，连接时不弹「允许」）→ 最近启动的 Edge / Chrome
- 用单独的 browser-harness daemon（`BU_NAME=browser-draft`），不和 `nv rec`、`sc bench` 抢标签页；**浏览器窗口要在前台**
- **安全规则**：
  - 永远不点「发表 / 发布 / 群发」，只点「保存 / 暂存离开」；按钮按文字找，不按坐标点（封面「编辑封面」这类只认真实点击的入口例外，点的是缩略图）
  - 登录、扫码、验证由人完成
  - 关键步骤读回校验，`shot()` 截图留证（`/tmp/browser-draft/`）
  - 平台只保留一份未发布内容时（抖音），先检查，有就停下，不替人「放弃」
- 发布文案解析器 `lib/copy_format.py` 和 phone-draft 共用
- 在 worktree 里改脚本测试时，要把 worktree 的 `browser-draft/bin` 放到 PATH 最前面，否则 `wa` / `nv` 调的是已安装的 `bd`

### 4.9 phone-draft（`pd`）：手机（实测录屏；存草稿备用）

| 命令 | 用途 |
|---|---|
| `pd devices` | 看手机型号、电量、屏幕；断线会用上次的地址自动重连 |
| `pd connect [IP:端口]` | 无线重连并记住地址（手机重启、换网络后端口会变） |
| `pd ui [名字]` | 截图 + 列出界面上的文字、描述、id（写脚本时用） |
| `pd rec deepseek\|doubao <提问.txt> <out.mp4> […]` | 录 AI 实测（一般由 `nv rec --app` 调用），**实测那一步的主力** |
| `pd run <步骤.py> [载荷.json]` | 执行一个平台的手机存草稿步骤（`--via phone` 时由 `wa` / `nv draft` 调用） |

- **安全规则**：永远不点「发表 / 发布 / 群发 / 发作品 / 日常」；登录、扫码、验证由人完成；失败时停在原地，现场存到 `/tmp/phone-draft/`；每一步读回核对；选相册前用 `check_newest` 核对；运行时把自动熄屏临时调到 30 分钟，结束改回
- 依赖：uiautomator2（`.venv`）、scrcpy（`vendor/`）；手机存公众号草稿还要手机 Edge + USB 调试（富文本粘贴）

---

## 五、现在流程里的缺口（待处理）

| # | 缺口 | 影响 | 建议 |
|---|---|---|---|
| 1 | director 的导演工程要手动 `mkdir` + `cp` 建 | 步骤多、容易漏复制配音文件（kv 会提示） | 做成一条命令（如 `vd init <作品>`） |
| 2 | 公众号封面 `ic render` 没有被 kv 检查 | 封面没出图时 `wa draft` 会报错，提前发现不了 | 公众号那一步加检查 `公众号/封面/out/` 比 `封面.md` 新 |
| 3 | 小红书封面裁成 3:4 只留上半截 | 9:16 封面下半部分的字会丢 | 封面模板约定大字放上半部分；需要时加一个 3:4 预设单独出图 |
| 4 | 抖音横封面 4:3 是从 9:16 中间裁的 | 横封面构图可能不好看 | 需要时加一个 4:3 预设单独出横封面 |

已修：抖音发布文案单独成文件（2026-10-14）；三平台网页草稿 + 自动上传封面（2026-10-15）；新建一期能选视频做法（`st new --video director`，2026-10-15）。

---

## 附录：概念科普系列

`系列.json` 里 `type: concept` 的系列走 knowledge-video 的导演手册：

0. 理解任务（`brief.md`、`run.json`）
1. 求真：查资料写 `research.json`，见 `references/research.md`
2. 脚本：每句标依据，`kv check` 无 ✗，见 `references/script.md`
3. 分镜（新作品默认 director 做法：②a 导演脚本 → ②b 风格样片；老做法是 `nv hf-build` 总览图 ②）
4. 渲染 + QA
5. 复盘

确认点：① `kv brief` 研究简报 + 脚本 + 配音稿，② 分镜（director 是 ②a / ②b），③ 成片。概念科普的确认按 knowledge-video「确认节点怎么记」手改 `run.json`。新建时只放发布记录和抖音工程（17 句概念模板）。
