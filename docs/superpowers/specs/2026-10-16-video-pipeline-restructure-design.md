# 视频流水线重组：只留导演做法，拆掉 narrated-video

> 子项目 1（共 2 个）。子项目 2「公共零件收拢」（SCRIPT.md 解析器只留一份、`copy_format.py` 和 `chrome.mjs` 不复制、存草稿调用只写一份）等本项目完成后另开 spec。

## 1. 背景和目标

现在抖音视频有两种做法：template（narrated-video / `nv`）和 director（video-director / `vd`），两者耦合在一起：

1. 配音写在 template 工程 `抖音/` 里，director 要手动复制到 `抖音-director/`，`vd`（`stale.mjs`）和 `kv`（`practical-facts.mjs`）各写了一套「副本过期」检查。
2. `抖音/` 同时是口播稿目录、template 的 HyperFrames 工程和发布资产目录，director 那一期也要先建一整个 template 工程。
3. vd 用相对路径 `../../../narrated-video` 借 hyperframes，读 `narrated-video.config.json` 的 `hfKit.tokens.accent`，渲染要借 `nv render`。
4. nv 一个命令下面装了实测录屏、配音、template 分镜、渲染验片、抖音和小红书存草稿，这几件事各自因为不同的原因要改。
5. `caption_groups.json` 是调用 HyperFrames 官方 skill faceless-explainer 的 `captions.mjs` 生成的，要求工程里有 `STORYBOARD.md`（`captions-step.mjs:40`），所以 director 能拿到字幕，靠的是 `抖音/` 里放着一份 template 分镜。
6. kv 写死了两套步骤、两套目录名，还有「配音从哪里复制到哪里」这类细节。

**决定**（用户已确认）：

- 只保留 director 做法，template 做法连同 narrated-video 一起删掉。
- 拆分原则：一个 skill 只管一起变化、能单独拿出去用的东西。按这个原则拆，不按功能数量拆。
- 旧作品**不迁移，也不专门兼容**（run.json 里 `video: template`、有 `抖音-director/` 的作品，kv 怎么判就怎么判）。

**成功标准**：

- 仓库里的代码不再引用 `narrated-video`、`nv` 命令、`抖音-director`、`STORYBOARD`、`faceless-explainer`（`docs/` 下的历史文档除外）。
- 一期作品只有一个 `抖音/` 目录，不再复制配音；kv 只有一套步骤。
- 各 skill 之间只通过命令行或文件约定连接，不 import 对方的代码，不用相对路径去找对方的目录。
- 在 flow-check 端到端跑通（不付费），全部测试通过。

## 2. 拆分以后的 skill 和接口

| skill（命令） | 管什么 | 输入 → 输出 | 依赖 |
|---|---|---|---|
| **voiceover（`vo`）**，新建 | 按口播稿配音 | 工程里的 `SCRIPT.md` + `VOICE.md` → `assets/voice/NN.wav`、`audio_meta.json`、`caption_groups.json`。`vo <工程> [--pause 秒] [--check]` 等，参数沿用 `nv hf-audio` | TTS 服务商（`tts/`）、fun-asr 对齐、项目根目录的配音缓存。不依赖 HyperFrames，也不依赖其他 skill |
| **video-director（`vd`）**，扩充 | 导演脚本 → HyperFrames 工程 → QA → 渲染、验片 | 只读工程里的 `audio_meta.json`、`caption_groups.json`、`assets/voice/`。新增 `vd init`、`vd render [--sample]`、`vd verify`；不认识的子命令透传给 hyperframes（代替 `nv check/lint/preview/snapshot/doctor`） | hyperframes 只装在 vd 自己的 `node_modules`；强调色读 `video-director.config.json` 的 `accent` |
| **video-draft（`vdraft`）**，新建 | 把成片存进抖音、小红书草稿箱 | `vdraft <mp4> --copy <文案.md> [--cover <图>] [--to douyin\|xiaohongshu] [--via browser\|phone]`，行为和原来的 `nv draft` 一样 | 通过命令行调用 `bd` / `pd` |
| **scenario-content（`sc`）**，扩充 | 多出实测录屏 | `sc rec`、`sc rec-flow`，参数和原来的 `nv rec`、`nv rec-flow` 一样 | 手机录屏通过命令行调用 `pd rec`；浏览器录屏用 browser-harness |
| **narrated-video（`nv`）** | 删除 | — | — |

### 2.1 voiceover → video-director 的文件约定

vo 写进工程目录、vd 只读的三样东西就是两边的接口，格式写进 voiceover 的 README：

- `assets/voice/NN.wav`：每帧一段配音（NN 从 01 开始，两位数）
- `audio_meta.json`：`{ bgm, bgm_pending, voices: [{ frame, path, duration_s, words: [{ id, text, start, end }], chars: [{ text, start, end }] }], sfx }`，时间是**帧内**秒数；重点词的 `text` 以 `*` 开头。格式和现在一样，vd 的 `cues.mjs` 不用改
- `caption_groups.json`：`{ total_duration_s, width, height, groups: [{ id, frame, start, end, text, words: [{ id, text, start, end }] }] }`，时间是**全片**秒数

`caption_groups.json` 由 vo 自己生成，分组规则从 faceless-explainer 的 `scripts/captions.mjs`（hyperframes 包，Apache-2.0）移植过来，单独放一个文件 `lib/caption-groups.mjs`，文件头写明出处和许可证：

- 全片时间 = 帧内时间 + 这一帧在全片的开始时间（前面各帧 `duration_s` 之和；原来从 STORYBOARD 读的帧时长就是 hf-audio 用 `duration_s` 写回去的）
- 去掉空词和只有标点的词，按开始时间排序
- 遇到换帧、和上一个词之间静音超过 0.18 秒、或者达到字数上限（往后 1 秒内的词数 > 3.5 取 2，> 2.5 取 3，否则 4）时开新组；词以 `.?!,;:—` 结尾时收组
- 每组结束时间 = 最后一个词的结束时间 + 0.12 秒，但不超过下一组的开始时间；`text` 用空格连接各词（重点词的 `*` 保留，vd 的字幕组件靠它高亮）
- `total_duration_s` = 各帧 `duration_s` 之和；`width`/`height` 固定 1080×1920（vd 不读这两个字段）

不再需要 STORYBOARD、frame.md、faceless-explainer。faceless 的 `captions.mjs` 还会生成 `compositions/captions.html`，director 做法不用（vd 用品牌目录的 `brand-captions.html`），不移植。

## 3. 一期作品的目录和新建

只有一个 `抖音/`，它本身就是导演工程：

```
抖音/
  SCRIPT.md  VOICE.md                                   ← 第 7 步写
  audio_meta.json  caption_groups.json  assets/voice/   ← vo 写
  DIRECTOR.md  index.html  compositions/frames/  cues.js  components.lock.json …  ← vd
  renders/  qa-douyin.json  qa-douyin-sample.json  snapshots/
  封面.md  out/01.png  发布文案.md                       ← 发布用
```

三类文件互不干扰：vo 只写自己那几个文件，vd 只读配音、写工程，封面和发布文案谁都不碰。

**`vd init <目录>`**（新增）：用 vd 自己的 hyperframes 跑 `init <目录> --non-interactive --example=blank`（不带 `--skill=faceless-explainer`），放进 `templates/index.html`、`templates/DIRECTOR.md`，建好 `compositions/frames/`、`assets/`。目录已存在且不为空时报错，不覆盖。

**`st new`**：

- 先 `vd init 抖音`，再从模板填 `SCRIPT.md`（实用类用 `SCRIPT模板.md`，概念科普用 `SCRIPT模板-概念.md`）、`封面.md`、`发布文案.md`。
- 不再建 `BRIEF.md`、`STORYBOARD.md`、`frame.md`、`.hyperframes/caption-skin.html`，不再跑 `nv hf-kit`。
- 删掉 `--video` 参数；`--只建抖音` 保留（行为同上，只建 `抖音/`）。
- 检查的命令从 `nv` 改成 `vd`。

**删除的模板**：`studio/templates/抖音/BRIEF模板.md`、`STORYBOARD模板.md`、`STORYBOARD模板-翻车.md`、`SCRIPT模板-翻车.md`（翻车讲方法那一版是 template 分镜配套的，导演做法用不上）。

## 4. kv 的步骤

只有一套（实用类），确认节点 5 个：

| # | 步骤 | kv 判定用的命令 | 确认 |
|---|---|---|---|
| 1–6 | 场景卡、选题关、实测、母稿、费曼检查、自检（不变） | `sc check` | ① topic |
| 7 | 抖音脚本 + 配音稿 | `vo 抖音 --check` | ② script |
| 8 | 配音 + 导演脚本 | `vd cues 抖音 --check` | ③a director |
| 9 | 风格样片 | — | ③b sample |
| 10 | 渲染 + QA | — | ④ final |
| 11 | 公众号 | — | |
| 12 | 小红书 | — | |
| 13 | 抖音草稿 | — | |
| 14 | 发布记录 | — | |
| 15 | 复盘 | — | |

各步判定：

- **第 8 步**：有 `抖音/audio_meta.json`、`抖音/caption_groups.json`；`抖音/DIRECTOR.md` 不是模板原样；`vd cues --check` 通过；③a 通过，而且之后 `DIRECTOR.md`（第 8 节组件候选不算）和 `audio_meta.json` 没改过。删掉所有「复制过去没有」「复制的是不是旧的」检查。
- **第 9 步**：有 `抖音/renders/sample.mp4`；`抖音/qa-douyin-sample.json` 存在且 `passed: true`；③b 通过，而且之后样片没换。
- **第 10 步**：`抖音/renders/` 里有正式成片（不算 `sample`、`compare`、`预览` 开头的）；成片比工程里最新的 HTML 新；`qa-douyin.json` 存在、`passed: true`、比最新 HTML 新；`qa.json` 比成片新、`passed: true`；④ 通过。
- 确认指纹：② `抖音/SCRIPT.md`、`抖音/VOICE.md`；③a `抖音/DIRECTOR.md`（不算第 8 节）、`抖音/audio_meta.json`；③b `抖音/renders/sample.mp4`；④ 最新正式成片。

kv 代码改动：

- 删掉 `video.mjs` 的 `videoMode`、`DIRECTOR_DIR`，template 那套步骤和 `storyboard` 节点，`stepsFor` 不再按做法分。
- 删掉 `run.json` 的 `video` 字段和 `kv init --video`；读到旧 run.json 里的 `video` 字段直接忽略。
- 环境变量 `KV_NV_CMD` 改名 `KV_VO_CMD`。
- `references/qa.md` 的 `motion` 一项，原来要求 `nv hf-build --motion`，改成以 `vd qa` 的「2 秒不动」检查为准；其余 6 项不变。
- `kv status` 每一步提示的命令改成新命令（`vo`、`vd`、`vdraft`、`sc rec`）。
- 概念科普（`types/concept.md`）的分镜只剩导演做法：②a 导演脚本 → ②b 风格样片。

vd 代码改动：删掉 `lib/stale.mjs` 和 `vd build` 里的过期警告。

## 5. 代码怎么搬

用 `git mv` 搬，保留历史。

| 原来在 narrated-video | 搬到 | 备注 |
|---|---|---|
| `scripts/hf-audio.mjs` | voiceover `scripts/vo.mjs`（或拆成入口 + lib） | 删掉写 `cues.js`（`KIT_CUES`）和写回 STORYBOARD 的部分 |
| `scripts/lib/` 的 `speech`、`align`、`pronounce`、`voice-cache`、`voice-direction`、`is-main`、`config` | voiceover `scripts/lib/` | `config` 改读 `voiceover.config.json`，只留 `tts` |
| `scripts/lib/captions-step.mjs` | 删除，换成 voiceover 的 `lib/caption-groups.mjs` | 按 2.1 自己生成 `caption_groups.json`（移植 faceless `captions.mjs` 的分组规则，Apache-2.0，保留出处） |
| `scripts/lib/cues.mjs` | 删除 | 只有 hf-kit 用 |
| `tts/`、`.venv`（本地 TTS） | voiceover | |
| `references/voice-direction.md` | voiceover `references/` | |
| `scripts/render.mjs`、`scripts/verify.mjs`、`hyperframes` 依赖 | video-director | `lib/hyperframes.mjs` 改成用 vd 自己的 hyperframes；`config.mjs` 不再读 `narrated-video.config.json` |
| `scripts/rec.mjs`、`scripts/rec-flow.mjs`、`scripts/rec/`、`scripts/lib/rec-common.mjs` | scenario-content | 配置改读 `scenario-content.config.json` 的 `rec` |
| `scripts/draft.mjs`、`draft_douyin.py`、`draft_xiaohongshu.py`、`phone_douyin.py`、`phone_xiaohongshu.py` | video-draft | |
| `references/douyin-recipe.md` 里「成品教程」的帧结构 | content-repurpose `references/douyin.md` | 第 7 步写 SCRIPT 时要用；其余分镜、画面规则删掉 |
| `hf-build`、`hf-frames`、`hf-kit`、`hf-sfx`、`hf-fonts`、`sync`、`voice`、`new`、`bounds.py`、`occupancy.py`、`stillness.py`、`font_subset.py`、`lib/frame-build`、`lib/localize`、`lib/sfx`、`lib/script-md`、`lib/chrome`、`hf-kit/`、`templates/`、`presets/`、`examples/`、`references/` 其余文件 | 删除 | 删之前逐个确认没有被搬走的代码 import |

每个新 skill 目录按仓库约定：`SKILL.md` + `bin/<命令>`（bash 入口，用 `readlink -f` 定位 skill 目录）+ `scripts/` + `tests/` + README（CLAUDE.md 第 4 节）。

### 5.1 配置拆分

`narrated-video.config.json` 删除：

| 原字段 | 去处 |
|---|---|
| `tts` | `voiceover.config.json` 的 `tts` |
| `rec` | `scenario-content.config.json` 的 `rec` |
| `hfKit.tokens.accent` | `video-director.config.json` 的 `accent` |
| `preset`、`theme`、`hfKit` 其余字段、`template`、`episodes` | 删除。`06-品牌资产/theme.css` 还给 image-cards 用，文件保留 |

配音缓存（P-34）原来靠找 `narrated-video.config.json` 定项目根，改成找 `voiceover.config.json`；缓存目录仍是 `<项目根>/.media/voice-cache`，已经付费配过的音不用重来。

作品项目里的配置要手动改一次（工具包只改 `studio/skeleton/` 的默认配置）：实施完成后在 `/home/power/self-media` 和 `/home/power/flow-check` 里按上表拆分，`st doctor` 会报出缺了哪个配置文件或字段。

### 5.2 studio

- `install`：命令表去掉 `nv`，加 `vo`（voiceover）、`vdraft`（video-draft）；清掉指向本仓库、已经失效的软链接（`~/.local/bin/nv`、`~/.claude/skills/narrated-video`），其他软链接不动。
- `doctor`：检查的配置文件和字段按 5.1 改；`COMMANDS` 同上。
- `init`：骨架里的配置文件按 5.1 改。
- `skeleton/06-品牌资产/hyperframes/` 删掉 `frame.md`、`caption-skin.html`（template 才用）；`brand-captions.html`、`brand-ending.html`、`brand-kicker.html` 保留。`视觉规范.md` 里讲 template 的部分删掉。
- `new`：见第 3 节。

## 6. 出错时怎么办

- `vo`：`SCRIPT.md` 或 `VOICE.md` 缺失、对不上，沿用现在 `nv hf-audio --check` 的报错；找不到 `voiceover.config.json` 用默认值（和现在 nv 一样）。
- `vd init`：目标目录已存在且不为空时报错退出，不覆盖。
- `vd build`：工程里缺 `audio_meta.json` 或 `caption_groups.json` 时报错，提示「先跑 `vo <工程>`」（原来提示复制）。
- `vd render`：hyperframes 没装时提示 `cd <video-director 目录> && npm ci`。
- `vdraft`、`sc rec`：找不到 `bd` / `pd` 时的报错沿用原来的写法。

## 7. 测试

按 CLAUDE.md 第 2 节先写失败的测试。

- **voiceover**：nv 原有的配音测试（`align`、`pronounce`、`voice-cache`、`voice-direction`、`qwenaudio`、`seedaudio`、`volcengine`、`speech-cache-key`）跟着代码搬过来，全部通过。新增：
  - 用 flow-check 02 的真实 `audio_meta.json` 和它现在的 `caption_groups.json`（faceless 生成，63 个词 → 49 组）当夹具，vo 生成的逐组一致（组数、`frame`、`start`、`end`、`text`、`words`）
  - 分组规则的单元测试：换帧、静音超过 0.18 秒、字数上限、句末标点、结束时间不超过下一组开始
  - 工程里没有 `STORYBOARD.md` 也能生成
  - 找不到 faceless-explainer 不报错、不打警告
  - 配音缓存按 `voiceover.config.json` 定项目根
- **video-director**：`render`、`verify` 的测试搬过来；新增 `vd init`（建出来的工程过 `hyperframes check`；目录不为空时报错）、透传子命令、`accent` 从自己的配置读；删掉 `stale` 和 `config` 里读 nv 配置的测试。
- **video-draft**：`draft-via` 测试搬过来。
- **scenario-content**：`rec-via` 测试搬过来。
- **knowledge-video**：步骤只有一套；fixture 去掉 `抖音-director`；③a、③b、④ 的指纹和新旧判断针对 `抖音/`；`KV_VO_CMD`。
- **studio**：`st new` 建出来的 `抖音/` 是导演工程、没有 `STORYBOARD.md`；`--video` 参数不再接受；`doctor`、`install` 的命令表和配置检查；`install` 只清失效且指向本仓库的软链接。
- **守护用例**（放在 studio 的测试里）：扫描仓库里的代码文件（不含 `docs/`、`node_modules/`、`.venv/`），不应出现 `narrated-video`、`抖音-director`、`STORYBOARD`、`faceless-explainer`、`hf-build`，也不应调用 `nv` 命令。

## 8. 端到端验收

在 flow-check 里真跑，**不付费**：

1. 按 5.1 改好 flow-check 的配置，`st doctor` 全过，`nv` 命令已经不存在
2. `st new 流程测试 03-新流程`，`抖音/` 的结构和第 3 节一致
3. 把 02 的 `SCRIPT.md`、`VOICE.md`、`DIRECTOR.md`、`compositions/frames/` 拷进来，`vo 抖音`：配音缓存全部命中、不调 API；`caption_groups.json` 和 02 的一致
4. `vd cues 抖音 --check` → `vd build 抖音 --sample` → `vd qa 抖音` → `vd render 抖音 --sample` → `vd build 抖音` → `vd qa 抖音` → `vd render 抖音`，成片通过 `vd verify`
5. 每一步之后 `kv status`，提示的命令和第 4 节一致
6. `vdraft --help` 和参数检查；不真的存草稿（真存要用户登录、在场）
7. 验收完删掉 `03-新流程`

## 9. 文档

- `studio/references/workflow.md`：视频部分重写成一套步骤（1–15）；删掉 2.3 节「选哪种视频做法」和流程图里的分叉；第四节各 skill 详解：删 4.4 narrated-video，加 voiceover、video-draft，改 video-director、scenario-content；第五节缺口 #1 标为已修。
- 新写 voiceover、video-draft 的 `SKILL.md` 和 README；改 video-director、scenario-content、knowledge-video、studio、content-repurpose、browser-draft、phone-draft 的 `SKILL.md` 里涉及 nv 的地方。
- 项目 `CLAUDE.md` 第 1 节：命令表、「视频两条做法」那一段、测试命令（voiceover 的 Python venv）。
- `SKILL.md` 属于 skill 开发：按 CLAUDE.md 第 8 节先读 `/home/power/shared-repo/standards/prompt-engineering.md`，先写评估用例，再写 SKILL.md，最后逐条对照。

## 10. 不在本项目范围内

- 子项目 2 的公共零件收拢（SCRIPT.md 解析器在 sc 和 kv 里各有一份、`copy_format.py`、`chrome.mjs`、存草稿调用逻辑）。
- 旧作品的迁移或兼容。
- image-cards 的小红书图文草稿（`ic draft`）不动。
- workflow.md 第五节缺口 #2–#4（封面相关）。
