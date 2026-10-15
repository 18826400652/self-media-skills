# 全流程打通检查报告

- 计划：docs/superpowers/plans/2026-10-15-workflow-e2e-check.md
- 检查日期：2026-10-15
- 工具包版本：1a558c0
- 测试项目：~/flow-check

## 结论（2026-10-15）

**范围**：按用户要求做到「渲染 + QA」为止——template（01）走完第 1–9 步，director（02）走完第 1–10 步；三平台草稿、发布记录、复盘、概念科普没做（未验证）。

**能不能走通**：两种做法都能从 `st init` 一路做到成片，但都不是「照着文档就能走通」：

| 做法 | 走到哪 | 中途必须绕过的阻断 / 错误 |
|---|---|---|
| template（01） | 第 9 步，成片 80 秒 | P-16 空母稿被判通过；P-22 第 6 步被第 10 步的模板挡住；P-23/P-24 照模板写分镜过不了检查；P-28 渲染后按文档跑 --motion 要重新渲染 |
| director（02） | 第 10 步，成片 91 秒 | P-31 缺 caption_groups.json（照文档 cp 直接失败）；P-11 默认音效目录为空，第一次 build 必失败；P-36 组件固定时长，用组件会大段空屏，只能全部手画；P-35 配乐只有 16 秒 |

两条成片都因 **P-39**（我写的口播「左上角」与真实界面不符，用户选择本次不修）在 qa.json 里记 high、`passed:false`，所以都停在 ④ 之前。

**最该先修的（按影响排）**
1. P-31 导演做法缺 caption_groups.json——阻断
2. P-36 组件不跟 @词、不撑满段——导演规则和组件库冲突
3. P-16 空母稿通过、P-29 qa.json 规则不落地、P-38 build 失败 qa 照过、P-37 空屏不报、P-25 遮挡漏检——kv / 检查放过了不该过的
4. P-28 --motion 和 kv 新旧检查冲突、P-22 第 6 步顺序冲突——文档顺序和判定打架
5. P-11 / P-09 / P-14 新项目配置和依赖：doctor 查不出
6. P-19 / P-20 实测录屏：DeepSeek 复制失败不提示、豆包走不通
7. P-35 配乐、P-07 三个 hyperframes 版本、P-32 模板写死真实系列名

**workflow.md 第五节四个缺口**：1（director 手动建工程）仍存在，且比写的更严重（P-31）；2（公众号封面没被 kv 检查）代码核对仍存在，未实跑；3、4（封面裁切）未验证。

**花费**：千问配音 2 次（01、02 各一次，P-34）；heygen 配乐取曲 1 次；没有发布、没有存任何草稿。

**测试产物**：`~/flow-check/`（删不删由用户定）；工具包仓库未改、未提交。

## 进度

- Task 0 基线：单元测试全过；本机 st doctor --online ✓、nv doctor 无必需项缺失、bd tabs ✓、pd devices ✗（手机没连上，Task 4 实测前要处理）
- Task 0 从零安装：跑完，exit 1——两处网络超时（phone-draft 的 uiautomator2、video-director 的 npm ci）；软链接全部正确；`npx hyperframes skills update` 那步因网络没跑（未验证）。暴露 P-14
- Task 1 文档 ↔ 代码对照：完成（10 个 skill）
- Task 2 建测试项目：完成
- Task 3 新建一期：完成
- Task 4 进行中：第 1 步场景卡已写（`01-模板做法/场景卡.md`，kv ✓，**待用户确认**）；第 2 步 `sc bench` 已跑，结果在 `01-模板做法/实测/对标-选题关.json`，**选题关.md 还没写**

### 断点（2026-10-15 晚，已完成，留作记录）
- 01-模板做法：第 9 步已渲染（`抖音/renders/01-模板做法.mp4`）；按用户选的方案 B，qa.json 补了 high 级问题（P-39「左上角」）并改为 `passed:false`，所以 01 停在第 9 步、过不了 ④（如实状态）
- 02-导演做法：①②③a③b 已确认；7 段全部手画完成；`vd build 抖音-director`（带配乐）✓、`vd qa` 35 个时间点 0 ✗；**还没渲染**
- 下一步：`cd ~/flow-check/04-作品/流程测试/02-导演做法 && nv render 抖音-director` → nv verify → 抽帧看 → 写 `qa.json`（7 项，P-39 在 02 里已按真实位置画右上角，但口播仍说「左上角」，同样记 high）→ `vd check 抖音-director` 列组件候选 → 01、02 成片一起请用户看 ④
- 重启后先查：`pd devices`（手机暂时不用）、`cd ~/flow-check && bd tabs`、网络
- 不做：三平台草稿、发布记录、复盘、概念科普（用户 2026-10-15 定）

### 断点（更早，已过时，留作记录）
- 重启后先：`pd devices`（手机地址可能又变了）、`bd tabs`、网络是否恢复（`curl -m 10 https://pypi.org`）
- （已完成）Task 4 第 2 步——从 `实测/对标-选题关.json` 挑 ≥5 条相关对标，写 `选题关.md`，把场景卡 + 选题关一起给用户确认 ①
- 选题：「一篇稿子，AI 帮我改成小红书、抖音、公众号三个版本」（用户 2026-10-15 确认）

### 用户调整范围（2026-10-15）
- 「做到第 9 步完成就可以了，后续发布到各平台先不做」：Task 8–11（三平台草稿、发布记录、复盘）、Task 12（概念科普）本次不做，记为未验证
- 用户追问后确认：02 导演做法也要跑，做到第 10 步（渲染 + QA）；01 的 ④ 等 02 做完一起看
- 用户意见：「后续估计要改流程，不能两个都同时做」（template / director 两种做法并存）——只记录，本次不改
- ③ 用用户原话「先继续吧」记录（用户在被问「按原顺序还是先做导演」时这样回答）

### 执行中的决定（Ruling）
- R-7：用户选方案 A：DIRECTOR.md 的 5 个组件段全部改手画（P-36），③a 因此失效，待用户重新确认
- R-6：`video-director.config.json` 的 sfxDir 改成真实项目用的 `~/.claude/skills/media-use/audio/assets/sfx`（P-11）
- R-4：02 的第 1–7 步文件从 01 原样复制（diff 一致），① ② 用用户在 01 对同一份文件说的「通过」记录
- R-5：导演做法缺 caption_groups.json，用户选方案 A：在 02/抖音/ 里直接跑 faceless-explainer 的 `audio.mjs sync-durations` 和 `captions.mjs build` 生成（P-31）
- R-3：为了让第 6 步能过，提前把 `公众号/文章.md` 的 `{{关键词}}` 填成「一稿三发」（只改这一处，正文第 10 步再写），见 P-22
- R-1：参考音色、.env、`tts.style`、公众号名称、`00-规划/` 下的账号定位 / 语气指南 / 平台策略 / 规律.md 取自 `~/self-media`——这些是用户本人的账号资料，不是作品，现编会让内容失真。作品文件一律现场从零写
- R-2：概念科普测试作品用 Task 3 里建出的 `04-作品/流程测试概念/01-x`，不再另建

## 逐步结果

| 步骤 | 命令 | 级别 | 结果 | 和文档一致 | 备注 / 问题编号 |
|---|---|---|---|---|---|
| 0.2 单元测试 | node --test / pytest | L0 | ✓ 26/77/10/101/5/4/105/105/7 全过 | — | — |
| 0.3 从零安装 | HOME=临时目录 st install --deps | L1 | ✗ 网络超时 2 处；软链接 ✓ | ⚠ | P-01、P-14 |
| 0.4 本机体检 | st doctor --online | L0 | ✓ | ⚠ | P-02 |
| 0.4 本机体检 | nv doctor | L0 | ✓（缺的都是可选项：whisper-cpp、MusicGen、Docker） | ✓ | — |
| 0.4 本机体检 | bd tabs | L3 | ✓ 连上 9333 | ✓ | — |
| 0.4 本机体检 | pd devices | L3 | ✗ 手机没连上（10.137.59.158:41267 连不通） | ✓ 提示清楚 | 实测前要用户重连 |
| 1 kv 判定 | practical-facts.mjs 对照第三节「kv 判定」 | L0 | ✓ 各步条件、指纹表、新旧检查、正式成片规则都一致 | ✓ | P-03、P-04 |
| 1 sc | sc.mjs 对照第 6 步检查项表 | L0 | ✓ 10 行都有对应判断，级别一致 | ✓ | P-05 |
| 1 nv | bin/nv、draft/rec/hf-audio/hf-build 参数 | L0 | ✓ 参数都有 | ⚠ | P-06、P-07 |
| 1 vd | vd.mjs、douyin-qa.mjs 阈值 | L0 | ✓ 200/160/760/480、1180–1440、0.8 秒都一致 | ✓ | P-07 |
| 1 wa | wa.mjs | L0 | ✓ 封面不存在直接报错（wa.mjs:106） | ✓ | — |
| 1 ic | bin/ic、ic.mjs、预设 | L0 | ✓ draft 由 bin/ic 分发；douyin-cover 1080×1920、wechat-cover 900×383 | ✓ | — |
| 1 studio | 模板数、st new 产物 | L0 | ✓ 18 个模板 | ✓ | — |
| 1 content-repurpose | 平台对照表数字 | L0 | ✓ | ⚠ | P-08 |
| 1 pd | 勿扰检查、剪贴板恢复、熄屏时间、vendor scrcpy、禁点词 | L0 | ✓ 代码里都有（rec.py:158、device.py:32-37、recorder.py:23、core.py:32） | ✓ | — |
| 2.1 st init | `st init ~/flow-check …` | L1 | ✓ 32 个文件 | ⚠ 比计划多报一项 ✗：缺参考音色（提示清楚） | — |
| 2.2 按 doctor 补配置 | .env、参考音色、tts.style | L1 | ✓ 补完 doctor 无 ✗ | ⚠ | P-09、P-10、P-11 |
| 3.1 st new 报错 | 没登记 / 已暂停 / type 无效 | L1 | ✓ 都报错退出码 1、不建目录；`type: concept` 正常走概念流程 | ✓ | — |
| 3.2 template 一期 | `st new 流程测试 模板做法` | L1 | ✓ 文件清单和 2.3 节一致；kv 14 步，下一步 1 场景卡 | ✓ | `公众号/文章.md:23` 留 `{{关键词}}` 给作者填，sc check 会拦 |
| 3.3 director 一期 | `--video director` | L1 | ✓ run.json video=director，15 步，无 抖音-director/ | ✓ | — |
| 3.4 其他选项 | --编号、单篇 --栏目 --日期、--只建抖音、05-模板 覆盖 | L1 | ✓ 都能用；覆盖和「和默认一样」提醒都对 | ⚠ | P-12 |
| 4.1 场景卡 | 写 场景卡.md → sc check、kv status | L1 | ✓ kv 进到第 2 步 | ✓ | 待用户确认 |
| 4.2 sc bench | `sc bench 公众号文章改成小红书 AI改写文案 一篇稿子发多个平台 --platform all …` | L3 | ✓ 跑通 2 分 30 秒，6 组结果 | ⚠ | P-15 |
| 4.2 选题关 | 写 选题关.md（7 条对标）→ sc check | L1 | ✓ 「已填写，对标 7 条」 | ✓ | P-17 |
| 4.2 对标不足 | 只留 4 条 → sc check | L1 | ✓ 报 ✗「只有 4 条，至少 5 条」 | ✓ | — |
| 4.2 跳步 gate | `kv gate . script` | L1 | ✓ 拒绝「① 选题关 还没确认」，退出码 1 | ✓ | — |
| 4.2 --edit | `kv gate . topic --edit …` | L1 | ✓ edits 记下，passed 仍为 false | ✓ | — |
| 重启后 bd | 在工具包目录跑 `bd tabs` | L3 | 连到 9222（日常 Edge）被拒 403；在作品项目里跑连 9333 ✓ | ✓ 符合文档的查找顺序 | 提示可改进，见 P-18 |
| 4.2 ① 确认 | `kv gate . topic "通过"` | L1 | ✓ 选题关.md 自动写入「用户确认」 | ✓ | — |
| 4.2 改后失效 | 改选题关一个字 → kv status；改回 | L1 | ✓ 显示「确认后改过」；改回后恢复 ✓ | ✓ | — |
| 4.3 USB 调试 | usbipd / Windows adb.exe | L3 | ✗ WSL 里用不了 USB 调试（adb.exe 起不来；手机同时做 USB 网络共享，usbipd 转进 WSL 会断 Windows 网络）；用户改回无线调试连上 | 文档没写 | P-21 |
| 4.3 勿扰关闭时拒录 | — | L3 | — 未实跑（手机已开勿扰；代码 rec.py:158 已核对） | — | — |
| 4.3 DeepSeek 第 1 轮 | `nv rec … --app deepseek --timeout 600` | L3 | ✓ 1080×1920、36.7 秒、完整回答已复制 | ✓ | — |
| 4.3 DeepSeek 第 2 轮 | 同上 | L3 | ⚠ 录屏 ✓，但「复制」没拿到完整回答，命令照样 ✓ | ✗ | P-19 |
| 4.3 豆包 | `nv rec … --app doubao` | L3 | ✗ 3 次都失败 | ✗ | P-20 |
| 4.3 实测记录 → kv | 写实测记录（已实测、原始回答） | L1 | ✓ kv 第 3 步 ✓ | ✓ | — |
| 4.4 空母稿 | 不写母稿 → kv status | L1 | ✗ **第 4 步「母稿」直接判 ✓**，kv 跳到第 5 步 | ✗ | P-16（已确认） |
| 4.4 母稿 | 写母稿；去掉「坑」小节 → sc check | L1 | ✓ 报「缺少小节：坑」，kv 退回第 4 步 | ✓ | — |
| 4.5 费曼检查 | 写费曼检查（4 个追问、类比、检验） | L1 | ✓ kv 第 5 步 ✓；术语留在母稿报 ⚠ | ✓ | 未测「追问只答 2 个」 |
| 4.6 自检 | sc check | L1 | ⚠ 被 公众号/文章.md 的 `{{关键词}}` 挡住 | ✗ | P-22 |
| 4.6 故意放错 | 母稿加 `{{x}}` 和「总而言之」 | L1 | ✓ ✗ + ⚠，kv 退回第 4 步并指出行号 | ✓ | — |
| 5 SCRIPT + VOICE | 写 14 帧 SCRIPT、4 段 VOICE → `nv hf-audio 抖音 --check` | L0 | ✓「4 段，覆盖 14 帧」；kv 第 7 步等 ② | ✓ | — |
| 5 台词不一致 | VOICE 改一个字 | L0 | ✓ 报 ✗ 并指出第 16 个字起不同，退出码 1 | ✓ | — |
| 5 口播超长 / 数字 | 加一句 31 字带「10」 | L0 | ✓ 两条 ⚠ | ✓ | — |
| 5 ② 确认 | `kv gate . script "通过"` | L1 | ✓ | ✓ | — |
| 6.1 配音 | `nv hf-audio 抖音 --pause 0.3` | L2 | ✓ qwenaudio 按导演稿 4 段整段生成，80.01 秒，用时 4 分钟 | ⚠ | P-13（确认是文档问题）；80 秒短于建议的 90–120 秒 |
| 6.2 分镜 | 写 14 帧 build 行 → `nv hf-build 抖音 --snap` | L1 | ✓ 第 5 次通过（前 4 次：1 次我写错圈注坐标被越框检查抓到；3 次是模板默认值 / 组件的问题） | ⚠ | P-23、P-24、P-25、P-26 |
| 6.2 帧时长写回 | 看 STORYBOARD 的 duration | L1 | ✓ 每帧由 hf-build「同步帧时长」写回；frontmatter 总时长仍是 0s | ⚠ 文档说是 hf-audio 写回 | P-27 |
| 6.3 新旧检查 | touch STORYBOARD → kv status | L1 | ✓「STORYBOARD 或配音改过，要重新 nv hf-build --snap」 | ✓ | — |
| 6.3 ③ 确认 | `kv gate . storyboard "先继续吧"` | L1 | ✓ | ✓ | — |
| 6.4 渲染 | `nv render 抖音` | L1 | ✓ 4 分钟，80 秒 1080×1920，nv verify 全过；文件名 `01-模板做法.mp4` | ✓ | — |
| 6.5 过程检查 | `nv hf-build 抖音 --motion` | L1 | ✓ 跑通；⚠ 第 1、7、9、12 帧落定后静止 | ⚠ 提示让「去掉 camera:false」，这几帧没写这个参数 | P-28、P-30 |
| 6.5 --motion 后 kv | kv status | L1 | ✗ sheet.jpg 被重写，kv 判「分镜改过，要重新 nv render」，只好重新渲染一次 | ✗ 和 qa.md「渲染后先跑 --motion」冲突 | P-28 |
| 6.6 QA | 写 qa.json（7 项，2 medium、3 low） | L1 | ✓ `passed:false` 被拦；成片比 qa.json 新被拦；`预览-*.mp4` 不算成片 | ✓ | — |
| 6.6 QA 漏项 | checked 只写 1 项 / passed:true 带 high | L1 | ✗ 两种都放行 | ✗ | P-29 |
| 7.0 02 复用 1–7 步 | 复制文件 + kv gate topic/script | L1 | ✓ kv 到第 8 步 | — | R-4 |
| 7.1 02 配音 | `nv hf-audio 抖音 --pause 0.3` | L2 | ✓ 89.24 秒；**没命中缓存，又付费一次** | ⚠ | P-34 |
| 7.1 建导演工程 | 照 workflow.md 第 8 步 mkdir + cp | L1 | ✗ `cp: 无法获取'抖音/caption_groups.json'` | ✗ | P-31 |
| 7.1 补字幕分组 | faceless-explainer sync-durations + captions build | L1 | ✓ 49 组 | 文档没写 | R-5 |
| 7.1 版本号 | 手改 package.json 0.8.119 → 0.8.143 | L1 | ✓ | ✓（缺口 1 仍存在） | — |
| 7.2 导演脚本 | 写 DIRECTOR.md（7 段，4 段用组件）→ `vd cues --check` | L1 | ✓ 10 个词、7 段；⚠ 模板说明里的「@词」被当成 cue | ⚠ | P-32、P-33 |
| 7.2 漏复制配音 | 拿走 抖音-director/assets/voice → kv status | L1 | ✗ kv 照样判第 8 步通过 | ✗ | P-04（已确认） |
| 7.2 ③a 确认 | `kv gate . director "通过"` | L1 | ✓ | ✓ | — |
| 7.3 样片组装 | `vd build 抖音-director --sample` | L2 | ✗ 第 1 次：「音效 pop 不存在」（默认 sfxDir 是空目录）；改 sfxDir 后 ✓ 28.7 秒，check 通过 | ✗ | P-11（已确认）、P-35 |
| 7.3 抖音检查 | `vd qa 抖音-director` | L1 | ✗ 1 处（我画的印章压字幕带，已改）；⚠ 17.5–28.5 秒不动 | ✓ | — |
| 7.3 看截图 | cues-sheet + 第 2 段抽帧 | L1 | ✗ 第 2 段清单组件 11.5 秒就出现、15 秒打完勾、17 秒消失，之后 11 秒空屏；口播 20–28 秒才说到这三项 | ✗ | P-36、P-37 |
| 7.3 改导演脚本 | 去掉 component，改手画；`vd cues --check` | L1 | ✓ 26 个词；kv 判 ③a「确认后改过」 | ✓ | R-7 |
| 7.3 第 2 段手画 | seg-02-prep.html → vd build --sample | L1 | ✗ 第 1 次：我用 `left` 做动画，check 报 gsap_non_transform_motion；改 `x` 后 ✓（28/28 对比度） | ✓ | P-38 |
| 7.3 抖音检查 | `vd qa 抖音-director` | L1 | ✓ 10 个时间点 0 个 ✗；截图里每个 @词 都对上 | ✓ | — |
| 7.3 渲染样片 | `npx hyperframes render -o renders/sample.mp4` | L1 | ✓ 28.7 秒，nv verify 通过；实际用了 hyperframes **0.8.155** | ⚠ | P-07 |
| 7.3 事实核对 | 第 4–5 句口播「就点左上角这里」对照录屏 | L0 | ✗ DeepSeek「开启新对话」在右上角；01 成片已带着这个错，01 的 qa.json fact-on-screen 也漏了 | — | P-39 |
| 7.4 ③a ③b 确认 | kv gate director / sample「通过」 | L1 | ✓ | ✓ | — |
| 7.4 01 补记 P-39 | 01 qa.json 加 high、passed:false | L1 | ✓ kv 01 退回第 9 步「qa.json 有没修的问题」 | ✓ | 用户选 B |
| 7.5 手画第 3–7 段 | 5 个 segment.html → `vd build --no-music` | L1 | ✓ check 通过；对比度 1 处（我的红叉）已改 | ✓ | — |
| 7.5 抖音检查（全片） | `vd qa 抖音-director` | L1 | ✗ 3 处（我画的：2 处进右侧 160px、1 处标签出画）已改 → ✓ 35 点 0 ✗；检查点含模板说明误成的「@词」 | ✓ | P-33 |
| 7.5 看总览图 | cues-sheet | L1 | ⚠ 第 7 段我画的「下一期」和 vd 账号结尾条重复叠在一起，已去掉 | — | P-40 |
| 7.6 带配乐组装 | `vd build 抖音-director` | L2 | ⚠ 整片 91 秒，配乐 16 秒（样片时取的，之后一直复用），重拍对不上，放完就没声；build 仍判通过 | ✗ | P-35（已确认） |
| 7.7 渲染全片 | `nv render 抖音-director` | L1 | — 未做（用户关机） | — | — |
| 7.7 渲染全片 | `nv render 抖音-director` | L1 | ✓ 91.27 秒，nv verify 全过（nv 自带 hyperframes 0.8.119） | ✓ | P-07 |
| 7.8 QA | 抽帧 + qa.json（1 high、2 medium、1 low） | L1 | ✓ 写完；high = P-39，`passed:false`，kv 停在第 10 步 | ✓ | P-39、P-40、P-35 |
| 7.8 组件候选 | 回填 DIRECTOR 第 8 节 → `vd check` | L1 | ✓ 列出 2 个；改第 8 节后 ③a 仍有效 | ✓ | — |
| 1 bd | 4 个网页草稿脚本 | L0 | ✓ 「发布 / 发表」只出现在注释和提示文字里，没有点击 | ✓ | — |

## 问题清单

### P-01 从零安装时依赖下载极慢（环境问题，非工具包）
- 现象：`st install --deps` 在 `uv pip install`（phone-draft 的 lxml、uiautomator2）卡住十几分钟；`curl https://pypi.org`、`https://registry.npmjs.org` 经代理 127.0.0.1:10808 15 秒超时，github 要 6 秒
- 严重度：环境；工具包本身未见问题。附带观察：`st install --deps` 下载慢时没有任何进度或超时提示

### P-02 `st doctor` 的「依赖」小节全通过时什么都不打印
- 位置：`studio/scripts/lib/doctor.mjs:155-175`（`checkDeps` 只输出 ✗/⚠，没有 ✓ 汇总）
- 现象：输出里「依赖」标题下面是空的，看不出是查过了还是没查
- 严重度：体验

### P-03 `kv.mjs` 文件头注释的节点列表过时
- 位置：`knowledge-video/scripts/kv.mjs:7`，写的是「实用类：topic script storyboard final」，少了 director 做法的 director、sample
- 严重度：文档（注释）

### P-04 director 第 8 步只检查 audio_meta.json 复制了，没检查 caption_groups.json 和 assets/voice/（已实跑确认）
- 位置：`knowledge-video/scripts/lib/practical-facts.mjs` `directorSteps()`
- 现象（代码推断，Task 7 实跑验证）：只复制 `audio_meta.json`、漏了 `assets/voice/` 时，kv 第 8 步也会判通过
- 实测：拿走 `抖音-director/assets/voice/` 后 `kv status` 仍显示「等用户确认 ③a」
- 严重度：错误

### P-05 sc 内置的 requiredSections 默认值和文档不一致
- 位置：`scenario-content/scripts/sc.mjs:11` 默认 `场景、痛点、实测、解法、可复制`；workflow.md 4.2 和 `studio/skeleton/scenario-content.config.json` 是 `成品、场景、步骤、坑、领`
- 影响：只在项目配置没写 requiredSections 时出现；`st init` 建的项目都写了
- 严重度：文档 / 低

### P-06 `nv help` 少了最后两行
- 位置：`narrated-video/bin/nv` 的 help 分支 `sed -n '2,16p'`，文件头注释到第 18 行
- 现象：`nv help` 不显示 `nv draft` 和「其他子命令透传给 hyperframes」两行
- 严重度：体验

### P-07 一条流程里用了两个版本的 hyperframes
- 位置：`narrated-video/package.json` 自带 hyperframes 0.8.119（`nv render`、`nv hf-build` 用）；`studio/skeleton/video-director.config.json` 的 `hfVersion` 是 0.8.143（`vd build` 配乐、`hyperframes check`、导演工程 package.json 用）
- 实测：一条 director 流程里出现三个版本——`vd build` 的检查和配乐用 0.8.143（hfVersion），样片按文档 `npx hyperframes render`（不带版本号）实际跑的是 0.8.155（最新版），全片 `nv render` 用 nv 自带的 0.8.119
- 影响：样片和成片用不同版本渲染，样片通过不保证成片一样
- 严重度：错误

### P-08 抖音封面字数上限三处写法不一
- 位置：`content-repurpose/references/douyin.md:34` 写「封面字不超过 12 字」；workflow.md 第 12 步写「≤ 15 字」；4.3 节写「≤ 12–15 字」；第 2 步选题关写「封面大字 ≤ 12 字」
- 严重度：文档

### P-09 `st doctor` 不检查配置里残留的占位文字
- 位置：`studio/skeleton/narrated-video.config.json` 的 `tts.style`「（描述配音人的嗓音…）」、`wechat-article.config.json` 的 `account`「（公众号名称…）」
- 现象：新项目不改这两项 `st doctor` 也全过；`tts.style` 原样送进配音会把占位话当人设
- 严重度：错误（会影响配音效果，配音那一步才会暴露）

### P-10 参考音色怎么准备没有文档
- 位置：`narrated-video/references/setup.md` 没提参考音色；只有 `SKILL.md:191` 一句「≤30 秒」
- 现象：新用户照 `st doctor` 的 ✗ 提示不知道要录什么、多长、什么格式、放哪
- 严重度：文档

### P-11 默认音效目录是空的，doctor 不提醒（已实跑确认）
- 位置：`studio/skeleton/video-director.config.json` 的 `sfxDir` = `06-品牌资产/音效`（只有 .gitkeep）
- 实测：DIRECTOR.md 机器块写了 `pop`、`error`、`click`，`vd build` 直接 ✗「音效 pop 不存在：…/06-品牌资产/音效/pop.mp3」；`st init` 出来的项目不改配置，导演做法第一次 build 必失败
- 严重度：错误

### P-12 `st new --只建抖音` 成功时提示「已创建：<作品>」
- 现象：只补建了 `抖音/`，其他文件没动（已核实），但提示读起来像整期重建
- 严重度：体验

### P-13 narrated-video/SKILL.md 说整段配音只在 seedaudio 时生效
- 位置：`narrated-video/SKILL.md:42`「工程里有 VOICE.md … 且服务商是 seedaudio 时，按段整段生成」；默认服务商已是 qwenaudio（`SKILL.md:192` 说 qwenaudio 写法一样）
- 同类：`studio/templates/抖音/SCRIPT模板.md` 的 Voice 行也写「seedaudio + 参考音色」
- 严重度：文档（待 Task 6 实跑确认 qwenaudio 也整段生成）

### P-14 `st doctor` 只看依赖目录在不在，装到一半失败也报全过
- 位置：`studio/scripts/lib/doctor.mjs:155-175` `checkDeps()`：Node 只看 `node_modules/` 存在，Python 只看 `.venv/` 存在
- 现象（从零安装实测）：phone-draft 的 `uv pip install` 超时失败，`.venv` 已建但 `import uiautomator2` 报 ModuleNotFoundError；video-director 的 `npm ci` 失败，`node_modules` 留了半套（缺 `@fontsource-variable/noto-serif-sc`）。两处 `st doctor` 都不报
- 影响：用户以为装好了，到录实测 / 渲染时才失败
- 严重度：错误

### P-15 `sc bench` 抓到的结果噪声大，抖音收藏数为空
- 现象：关键词「一篇稿子发多个平台」抖音前 10 条是儿歌合集、查手机号；抖音所有行「收藏」列为空（小红书有）
- 影响：选题关要求看「收藏高说明有人想照着做」，抖音这列没有数据；挑对标要人工筛
- 严重度：体验 / 文档（选题关模板强调收藏，但抖音抓不到）

### P-16 空模板的母稿 `sc check` 报「✓ 母稿结构完整」，kv 第 4 步直接判通过（已实跑确认）
- 现象：`st new` 之后什么都没写，`sc check` 输出「✓ 母稿结构完整」——模板里本来就有 5 个必需小节的标题
- 推测影响：kv 第 4 步「母稿」只看 sc check 对母稿没有 ✗，空母稿也会判通过
- 实测：第 3 步实测记录写好后，`kv status` 显示「✓ 4 母稿」，下一步直接跳到第 5 步费曼检查——母稿一个字没写
- 严重度：**错误**（流程会跳过母稿这一步，而母稿是各平台的唯一事实来源）

### P-17 选题关要填「评论区在要什么」，但没有工具支持
- 位置：`studio/templates/选题关模板.md` 的对标表最后一列；workflow.md 第 2 步第 2 条
- 现象：`sc bench` 只抓标题、点赞、收藏，不抓评论；Claude 要逐条打开帖子看评论，文档没说怎么做（小红书帖子页不登录看不了）
- 严重度：文档 / 缺功能

### P-18 在作品项目外跑 `bd` 会悄悄连到日常浏览器
- 现象：在没有 `browser-draft.config.json` 的目录跑 `bd tabs`，退回到 DevToolsActivePort（9222 的日常 Edge），报 browser-harness 的英文 403 堆栈，看不出是「不在作品项目里」
- 严重度：体验

### P-19 DeepSeek「复制完整回答」失败时 `nv rec` 不提示
- 位置：`phone-draft/lib/phone_draft/apps/deepseek.py:101-118` `copy_answer()` 出错一律返回 None；`rec.py:170` 之后照常输出 ✓
- 现象：第 2 轮 `.txt` 里没有「## 复制的完整回答」，只有屏幕上半段（抖音版整段缺失），终端输出和第 1 轮一模一样是 ✓
- 影响：workflow.md 第 3 步要求用「复制的完整回答」原样粘贴；用户 / Claude 不看 .txt 就不知道缺了，可能把半截回答当完整的
- 严重度：错误

### P-20 豆包录屏走不通
- 位置：`phone-draft/lib/phone_draft/apps/doubao.py:15` `EMPTY_LABELS`
- 现象 1（用户确认原因是豆包弹了「更新 App」小窗）：报 uiautomator2 英文堆栈 `UiObjectNotFoundError … ImageView clickable`，看不出是被弹窗挡住
- 现象 2（关掉弹窗后，连跑 2 次稳定复现）：「✗ 豆包新对话里有不认识的内容，为免录到私人对话已停下：AI 创作、AI 播客」——豆包新对话页现在有「打电话 / AI 创作 / 拍题答疑 / AI 播客」四个入口，白名单里没有后两个（截图 `~/flow-check/…/01-模板做法/实测/截图-豆包新对话页.png`）
- 严重度：**阻断**（豆包这条实测路径）；DeepSeek 不受影响

### P-21 文档没写 WSL 下怎么用 USB 调试
- 现象：无线调试不可用时，用户想改用 USB；WSL 里的 adb 看不到 USB 设备，Windows 的 `adb.exe` 从 WSL 调起会报 `failed to start daemon`；usbipd 要管理员权限，且手机在做 USB 网络共享时转进 WSL 会断网
- 严重度：文档

### P-22 第 6 步「自检」会被第 10 步才写的公众号模板挡住
- 位置：`studio/templates/公众号文章模板.md` 第 23 行自带 `{{关键词}}`；kv 第 6 步要求整期 `sc check` 没有 ✗
- 现象：母稿、费曼检查都写好后，第 6 步仍报「公众号/文章.md:23 残留占位符」，要提前去改第 10 步的文件才能往下走；`kv status` 只说「sc check 还有 1 项 ✗」，没说是哪个文件
- 同类：抖音 SCRIPT.md 模板的示例句也会在第 6 步报 ⚠「一句 39 字」
- 严重度：错误（流程顺序冲突）

### P-23 STORYBOARD 模板第 1、12 帧的 lead 默认位置会压到字幕带
- 位置：`studio/templates/抖音/STORYBOARD模板.md` 第 1、12 帧 `"lead": {"top": 1090}`
- 现象：照模板写，`nv hf-build` 的 hyperframes check 报 `caption_zone_collision`（字幕带从 y 1160 开始）；挪到 1000 又被上面的 shot（height 720）盖住，报 `text_occluded`。最后 shot `height` 改 600、lead `top` 改 1020 才过
- 严重度：错误（模板默认值本身过不了检查）

### P-24 模板第 7 帧「录屏 + 计时」在浅色录屏上对比度不够
- 位置：模板第 7 帧 `{"rec": …, "timer": {"value": 0, "note": "实际用时 · 原速"}}`
- 现象：DeepSeek 是白色界面，计时器的文字对比度 1.32:1（要求 3:1），check 报 ✗；去掉 timer 改用 rec 的 chip 才过
- 附带：最开始我以为是第 10 帧 `ground: "accent"` 引起的，去掉强调色后错误还在，所以「一个坑」用整屏强调色这条没有被验证到（被我去掉了）
- 严重度：错误（录浅色 App 时模板默认组合过不了检查）

### P-25 shot 盖住下方文字时，第 1 帧没被检查出来，第 12 帧被检查出来了
- 现象：第 1、12 帧配置一样（shot height 720 + lead top 1000），check 只报了第 12 帧 `text_occluded`；第 1 帧的「十秒 · 一分钱没花」在总览图里完全看不见，检查是通过的。第 1 帧带 `"kicker": false`，可能和这个有关
- 影响：只靠检查不够，必须看总览图（workflow.md 也要求看）
- 严重度：错误（漏检）

### P-26 marker 组件的高亮会盖住前一个字；steps 组件第一步时只显示两步
- 现象 1：第 11 帧 `marker`「发之前，自己读一遍」key=「读一遍」，size 110 和 92 都会让高亮盖住「己」字
- 现象 2：第 4 帧 `steps` 有 3 步，帧结尾只显示 01、02 两步；第 8 帧 3 步都显示
- 严重度：体验（待看渲染成片确认）

### P-27 帧时长写回 STORYBOARD 的是 `nv hf-build`，不是 `nv hf-audio`
- 位置：workflow.md 第 8 步「生成 audio_meta.json，每帧时长自动写回 STORYBOARD」写在 hf-audio 下；STORYBOARD 模板也写「nv hf-audio 后自动改成配音时长」
- 现象：配完音每帧还是 `duration: 1s`，跑 `nv hf-build` 后才更新；frontmatter 的总 `duration: 0s` 一直没更新
- 严重度：文档

### P-28 渲染后跑 `--motion` 会让 kv 要求重新渲染
- 位置：`knowledge-video/references/qa.md` 第一句「渲染后，先跑 nv hf-build 抖音 --motion」、workflow.md 第 9 步第 2 条；`practical-facts.mjs` `videoSteps()` 的「mtime(mp4) < mtime(sheet) → 分镜改过，要重新 nv render」
- 现象：`--motion` 重新生成 `snapshots/sheet.jpg`（改成每帧四张），成片立刻比 sheet 旧，kv 退回第 9 步；照做就是再渲染 4 分钟，再跑 --motion 又会循环
- 另外：`--motion` 把 sheet.jpg 换成了「每帧四张」，③ 确认时看的那张总览图被覆盖
- 严重度：**错误**（文档要求的顺序和 kv 判定冲突）

### P-29 kv 不检查 qa.json 的 checked 和 high 级问题
- 位置：`practical-facts.mjs` 只看 `qa.passed === true`
- 现象：`checked` 只写 `["typo"]`、或 `passed: true` 同时带 `severity: "high"` 的问题，kv 都判第 9 步做完；qa.md 写「checked 必须全部写上」「passed: true 时不能有 high 级问题」
- 严重度：错误（规则只写在文档里，没有落到判定）

### P-30 「落定后完全静止」的修改提示不对题
- 现象：第 1、7、9、12 帧（截图、录屏）报「去掉 "camera": false 用默认缓推」，这几帧 build 里都没有 `camera: false`；截图帧（shot）默认就不缓推
- 严重度：体验

### P-31 导演做法要的 caption_groups.json 在导演路径上不会生成
- 位置：workflow.md 第 8 步（director）和 `video-director/SKILL.md:47` 的 `cp 抖音/{…,caption_groups.json,…}`；`video-director/scripts/lib/assemble.mjs:114` 必读这个文件
- 现象：`caption_groups.json` 只由 template 做法的 `nv hf-build`（「字幕」那一步，还要先「同步帧时长」）生成；director 做法第 7 步之后直接 `nv hf-audio` → 建导演工程，照文档 `cp` 报「没有那个文件」。真实项目 `01-RAG` 能用是因为先走过 template 的分镜
- 绕过：在 `抖音/` 里跑 `node ~/.claude/skills/faceless-explainer/scripts/audio.mjs sync-durations --audio-meta ./audio_meta.json --storyboard ./STORYBOARD.md` 和 `captions.mjs build --storyboard ./STORYBOARD.md --audio-meta ./audio_meta.json --hyperframes . --out ./caption_groups.json`
- 严重度：**阻断**（照文档走导演做法到 vd build 必失败）

### P-32 导演脚本模板写死了真实项目的系列名
- 位置：`video-director/templates/DIRECTOR.md` 机器块 `"kicker": "AI 概念一分钟 · 第 1 期"`
- 违反「skill 里不写死任何作品目录名或账号信息」；新项目照抄会把别人的栏目名放进视频
- 严重度：错误

### P-33 DIRECTOR.md 模板说明文字里的「@词」被当成 cue
- 位置：`video-director/templates/DIRECTOR.md` 第 5 行「写成 `@词`」
- 现象：`vd cues` 每次都警告「@词 在口播里出现了 3 次」，还把它算进「10 个词」
- 严重度：体验

### P-34 配音缓存不跨作品，director 做法要重新付费配一次
- 现象：02 的 SCRIPT.md、VOICE.md 和 01 一字不差，`nv hf-audio` 仍重新生成（3 分 52 秒），时长也变了（80.01 → 89.24 秒）
- 影响：template 先做过再换 director（workflow 2.3「中途换做法」）时，配音不用重做；但新建 director 作品复用别期台词时要再付一次钱。只是观察，不一定要改
- 严重度：观察

### P-35 配乐取到的曲子比样片还短，重拍对位找不到时只是从头播
- 现象：`vd build --sample` 取到 16 秒的曲子，样片 28.7 秒；check 警告 music 只有 16 秒；「找不到能让重拍落在 64.26 秒的节拍，配乐从头播放」——样片只到 28 秒，drop 在 64 秒本来就不在样片里
- 全片实测：`resolveMusic()`（`video-director/scripts/lib/music.mjs:20-33`）只在 `assets/audio/` 没有 bgm 时取一次曲，取的时候不传视频时长；样片时取到 16 秒的曲子后，全片一直复用它。91 秒的全片只有前 16 秒有配乐，`vd build` 只给 ⚠（clip_media_fit）照样判通过
- `hyperframes media-use resolve` 没有时长参数（--help 里只有 --params、--candidates 等，文档没写怎么限长）
- 严重度：**错误**（导演做法的「配乐取曲、重拍对位」在这种情况下等于没有）

### P-36 dykit 组件的动画是固定时长的，不跟 @词，也不撑满整段
- 位置：组件库 `compositions/dy-checklist.html:42-49`（其他组件同类）：每项固定 1.2 秒间隔出现，`0.7 + 项数×1.2 + 0.8` 秒后整张卡淡出
- 现象：第 2 段 17.8 秒，清单 5 秒演完就消失，剩 11 秒空屏；而且三项在口播说到之前就打完勾了
- 和导演规则冲突：规则 6「话说一半」、规则 7「重拍」都要求动作锚定 @词；DIRECTOR.md 模板也鼓励「功能性画面先查组件库」
- 本片 5 个组件段长 9–18 秒，组件动画只有 4–6 秒
- 严重度：**错误**（照规则用组件，成片会有大段空屏）

### P-37 `vd qa` 不报「整段没内容」
- 现象：第 2 段后 11 秒只有背景和栏目标签，`vd qa` 只给 ⚠「17.5–28.5 秒画面没有变化」，没有 ✗；样片照样能判通过
- 严重度：错误（漏检）

### P-38 `vd build` 的检查失败时，`vd qa` 照样跑、照样报通过
- 现象：`vd build --sample` 退出码 1（gsap_non_transform_motion），接着跑 `vd qa` 输出「0 个 ✗」并写 `qa-douyin-sample.json` passed；kv 第 9 步只看 qa-douyin-sample.json 和 sample.mp4
- 影响：build 检查没过也能凑齐第 9 步的判定条件
- 严重度：错误

### P-39 口播里的操作说明和真实界面不符，没有任何一步查得出来（内容错误，我写的）
- 现象：SCRIPT 第 5 帧「就点左上角这里，出来一个空白的对话框」；实测录屏里 DeepSeek 的「开启新对话」按钮在右上角（左上角是「打开侧边栏」）
- 谁漏了：我写脚本时没对照录屏；② 用户确认时看的是文字；`sc check`、`nv hf-audio --check` 只查格式和一致性；01 的 qa.json `fact-on-screen` 我也打了通过
- 启示：`fact-on-screen` 只对照「实测记录」的文字，「点哪里」这类界面位置要对照录屏截图，qa.md 可以写明
- 严重度：错误（内容），01 成片需要改口播重配音才能修

### P-40 vd 自动加的账号结尾条会和最后一段画面重复
- 现象：DIRECTOR.md 机器块 `ending.next` 让 vd 在结尾加「下一期：…」黄条；第 7 段按口播画了「下一期」大字，两者同时出现、叠在一起。模板和规则都没提醒「最后一段别再画下期预告」
- 严重度：文档

### P-41 `nv hf-audio` 生成字幕时打印字体回退警告（修 P-31 时发现）
- 现象：P-31 修好后，`nv hf-audio` 末尾会跑 faceless-explainer 的字幕生成，此时工程里还没有 `assets/fonts`，它警告「frame.md names font "Noto Sans SC" but no matching .woff2 … captions will fall back」；template 做法下一步 `nv hf-build` 会打包字体，director 做法只用 caption_groups.json，不用这份字幕 HTML——警告对两种做法都是误导
- 严重度：体验

### P-42 配音缓存键里是参考音色的绝对路径（修 P-34 时发现）
- 位置：`narrated-video/scripts/lib/config.mjs:47` 把 `tts.reference` 展开成绝对路径；`speech.mjs` 的缓存键直接用它
- 现象：把 01 复制到别的目录后，缓存文件都在，`nv hf-audio` 仍判没命中、要重新生成（实测：同一份 SCRIPT/VOICE/配置，原目录键 bf3fca32，副本键 e2c92413）
- 影响：项目改目录名、搬家、复制一份试改，都会重新付费配音；同一项目内不受影响
- 修法要用户定：键改用参考音色的内容哈希（或相对项目根的路径），会让现有缓存全部失效一次，除非同时兼容旧键
- 严重度：错误（花钱）

### P-43 豆包提问太长时回答在屏幕外，录屏只录到提问（P-20 真机实跑发现）
- 现象：用检查时的提问（1230 字节）跑 `nv rec … --app doubao`，输出「发送后 9.06 秒回答完」；但视频最后一帧和 .txt 里都只有提问气泡——提问占满整屏，回答在下面（屏幕上有「往下滚」箭头）。事后在手机上往下滑，豆包的回答是完整的
- 推测：判断「回答完」靠屏幕文字不再变化；回答在屏幕外，屏幕文字从发送起就不变，所以很快判定结束。DeepSeek 同一提问正常（有「复制的完整回答」）
- 影响：豆包这条实测路径录不到回答，录屏不能用作视频素材
- 严重度：错误（豆包路径）
