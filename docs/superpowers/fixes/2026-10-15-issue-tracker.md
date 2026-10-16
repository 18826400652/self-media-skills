# 问题修复进度

> 来源：`docs/superpowers/reports/2026-10-15-workflow-check.md`（40 个问题，详情看报告）
> 计划：`docs/superpowers/plans/2026-10-15-fix-batch-1.md`（第 1 批：用户点名的 1–7 组，17 个问题）；`docs/superpowers/plans/2026-10-15-fix-batch-2.md`（第 2 批：其余 23 个）
> 分支：`fix/workflow-check`；每个问题修好、测试通过后单独提交一次，提交信息带问题编号
> 用户决定（2026-10-15）：两种视频做法都保留；P-36 本仓库兜底 + 另去组件库改；hyperframes 统一 0.8.143 单一来源；全部 40 个最终都修

状态：待修 → 修复中 → 已修（写提交号和验证方式）/ 不修（写理由，须用户同意）

| 编号 | 问题 | 批次 | 状态 | 提交 | 验证 |
|---|---|---|---|---|---|
| P-01 | 从零安装时依赖下载极慢（环境问题，非工具包） | 第 2 批 | 已修（工具包侧） | `fix(P-01)` | install.test.mjs 1 例 RED→GREEN（注入假的命令执行）；studio 35/35。没实跑 st install --deps（npm ci 会删掉重装所有 node_modules，网络慢）。代理慢本身是环境问题，不归工具包 |
| P-02 | `st doctor` 的「依赖」小节全通过时什么都不打印 | 后续 | 已修 | `fix(P-14)` | 随 P-14 一起修：依赖全过时打印「✓ 依赖都装好了」 |
| P-03 | `kv.mjs` 文件头注释的节点列表过时 | 第 2 批 | 已修 | `docs(P-03)` | kv.mjs 第 7 行按代码改：实用类 gatesFor(template/director) 实际输出 + 概念科普 CONCEPT_GATES；kv 86/86 |
| P-04 | director 第 8 步只检查 audio_meta.json 复制了，没检查 caption_groups.json 和 assets/voice/ | 第 2 批 | 已修 | `fix(P-04)` | practical-facts.test 1 例 RED→GREEN（旧夹具补 caption_groups.json）；kv 86/86；flow-check 02、01-RAG 的 kv status 前后一致 |
| P-05 | sc 内置的 requiredSections 默认值和文档不一致 | 第 2 批 | 已修 | `fix(P-05)` | sc.test 2 例（无配置时填好的 studio 母稿模板通过 RED→GREEN；skill 自带模板和默认一致为守护）；sc 15/15。Ruling：比报告更大——sc 自带 templates/母稿.md、SKILL.md 示例也是旧结构（场景/痛点/实测/解法/可复制），SKILL.md 还让照它写；统一成 studio 和真实项目用的「成品/场景/步骤/坑/领」 |
| P-06 | `nv help` 少了最后两行 | 第 2 批 | 已修 | `fix(P-06)` | 新增 bin.test.mjs 1 例 RED→GREEN；nv 118/118；nv help 末行是「nv <其他> 透传给 hyperframes」 |
| P-07 | 一条流程里用了两个版本的 hyperframes | 第 7 组 | 已修 | `fix(P-07)` | config.test 3 例 + render.test 3 例 RED→GREEN；nv 114/114、vd 113/113、kv 85/85、studio 34/34；实跑（副本）：01 hf-build --snap + nv render、02 vd build --sample + nv render --sample 都在 0.8.143 下成功；断网 vd build --no-music 能跑。顺带：导演工程不用再手改 package.json 版本（缺口 1 少一步） |
| P-08 | 抖音封面字数上限三处写法不一 | 第 2 批 | 已修 | `docs(P-08)` | Ruling：抖音封面大字统一 ≤ 12 字（多数处已是 12）；改 workflow.md 第 12 步、4.3 表格、抖音封面模板；grep 抖音封面各处都是 12，小红书 3:4 封面的 ≤ 15 不动；代码里没有这个上限 |
| P-09 | `st doctor` 不检查配置里残留的占位文字 | 第 5 组 | 已修 | `fix(P-09)` | doctor.test.mjs 1 例 RED→GREEN + 1 例反向（夹具补 audience）；project.test 旧用例按新规则放宽允许的 ✗；studio 31/31；真实项目、flow-check 的 st doctor 不报 |
| P-10 | 参考音色怎么准备没有文档 | 第 2 批 | 已修 | `docs(P-10)` | setup.md 新增「参考音色」一节（录什么、≤30 秒 ≤10MB 按 tts 代码、wav/mp3、放哪、换文件要清缓存）；st doctor 报 tts.reference 不存在时指向这一节（doctor.test 1 例 RED→GREEN，studio 37/37） |
| P-11 | 默认音效目录是空的，doctor 不提醒 | 第 5 组 | 已修 | `fix(P-11)` | doctor.test.mjs 2 例 RED→GREEN（+1 例反向）；studio 29/29；真实项目、flow-check 的 st doctor 不报（Review Focus 3） |
| P-12 | `st new --只建抖音` 成功时提示「已创建：<作品>」 | 第 2 批 | 已修 | `fix(P-12)` | new.test 断言 RED→GREEN；studio 34/34 |
| P-13 | narrated-video/SKILL.md 说整段配音只在 seedaudio 时生效 | 第 2 批 | 已修 | `docs(P-13)` | 代码核对：tts/qwenaudio.mjs 和 seedaudio.mjs 都导出 direction=true（01/02 就是 qwenaudio + VOICE.md 整段生成）；改 SKILL.md、4 个抖音模板的 Voice 行、hf-audio/speech/voice-direction/config 的注释和报错；grep 不再有「只有 seedaudio」；nv 124/124、studio 36/36 |
| P-14 | `st doctor` 只看依赖目录在不在，装到一半失败也报全过 | 第 5 组 | 已修 | `fix(P-14)` | doctor.test.mjs 2 例 RED→GREEN；studio 33/33；实跑：临时挪走 video-director 的 noto-serif-sc，doctor ✗「缺 Node 依赖」，还原后 ✓ |
| P-15 | `sc bench` 抓到的结果噪声大，抖音收藏数为空 | 第 2 批 | 已修（文档） | `docs(P-15)` | Ruling：代码核对 bench_harness.py 抖音只抓搜索页文字，搜索卡片本来没有收藏数，抓不到不是 bug；workflow 第 2 步、选题关模板、sc SKILL.md 写明抖音收藏填「—」、结果按点赞排要人工挑掉跑题的。没实跑 sc bench |
| P-16 | 空模板的母稿 `sc check` 报「✓ 母稿结构完整」，kv 第 4 步直接判通过 | 第 3 组 | 已修 | `fix(P-16)` | sc.test.mjs 3 例（用真实母稿模板）RED→GREEN；sc 13/13；真实项目 01-不想看 / 02-不露脸 kv status 和修前一致，flow-check 两期母稿仍 ✓ |
| P-17 | 选题关要填「评论区在要什么」，但没有工具支持 | 第 2 批 | 已修（文档） | `docs(P-17)` | Ruling：不做抓评论功能（小红书帖子页要登录、抓评论超出 bench 范围）；workflow 第 2 步、选题关模板、sc SKILL.md 写明挑 2–3 条打开帖子看评论，小红书没登录就停下请用户登录，没看写「未看」不编 |
| P-18 | 在作品项目外跑 `bd` 会悄悄连到日常浏览器 | 第 2 批 | 已修 | `fix(P-18)` | test_bd_connect.py 1 例 RED→GREEN；browser-draft pytest 8/8；实跑：/tmp 下 bd tabs 先打印「不在作品项目里…改连 9222 端口…」。Ruling：不拒绝连接（非项目场景本来就支持），只说清楚 |
| P-19 | DeepSeek「复制完整回答」失败时 `nv rec` 不提示 | 第 6 组 | 已修 | `fix(P-19)` | test_rec_flow.py 3 例 RED→GREEN；phone-draft 112/112。真机实跑（2026-10-15，MEIZU 20）：DeepSeek 一轮，复制成功，txt 有「## 复制的完整回答」、json copied:true。复制失败的 ⚠ 分支这次没触发（要等复制恰好失败），由单元测试覆盖 |
| P-20 | 豆包录屏走不通 | 第 6 组 | 已修 | `fix(P-20)` | test_apps.py 4 例；phone-draft 112/112。真机实跑：豆包一轮走通到发送、没被「AI 创作 / AI 播客」挡住（这次没弹升级窗，update_dialog 分支没触发）。但录到的内容不能用，另记 P-43 |
| P-21 | 文档没写 WSL 下怎么用 USB 调试 | 第 2 批 | 已修 | `docs(P-21)` | phone-draft/SKILL.md「前提」加 WSL 一条：只写检查中实际遇到的（WSL adb 看不到 USB、adb.exe failed to start daemon、usbipd 要管理员、USB 网络共享时转进 WSL 会断网） |
| P-22 | 第 6 步「自检」会被第 10 步才写的公众号模板挡住 | 第 4 组 | 已修 | `fix(P-22)` | practical-facts.test.mjs 3 例 RED→GREEN + 1 例补充（写了但残留占位，直接通过：覆盖前一例碰巧通过的分支）；kv 85/85；真实项目 3 期 kv status 不变 |
| P-23 | STORYBOARD 模板第 1、12 帧的 lead 默认位置会压到字幕带 | 第 2 批 | 已修 | `fix(P-23)` | 新增 studio/tests/templates.test.mjs 1 例 RED→GREEN；studio 36/36。新默认值（shot height 600、lead top 1020）就是 01 实际用的、今天 01 副本 hf-build --motion 检查通过（exit 0）的配置 |
| P-24 | 模板第 7 帧「录屏 + 计时」在浅色录屏上对比度不够 | 第 2 批 | 已修 | `fix(P-24)` | hf.test 1 例 RED→GREEN（旧 glow 钩子断言按新规则更新：夹具有录屏）；nv 122/122；实跑 01 副本第 7 帧改回模板的录屏 + timer：修前 Contrast 2 处 1.32:1，修后 23/23 通过。Ruling：原因是 glow 的玻璃面板几乎透明，叠在白色录屏上；改组件（叠录屏时 kit-on-rec 不透明底），模板和 douyin-recipe 的 rec + timer 写法保留。报告里「check 报 ✗」在 0.8.143 下是 warning 级 |
| P-25 | shot 盖住下方文字时，第 1 帧没被检查出来，第 12 帧被检查出来了 | 第 3 组 | 已修 | `fix(P-25)` | hf.test.mjs 1 例 RED→GREEN；nv 109/109；实跑：01 副本第 1 帧改回 height 720/top 1000 → hf-build ✗；现在的 01 → 通过。Ruling：原因是 hyperframes 单个采样点的遮挡只给 ℹ，改为 hf-build 把 text_occluded 一律当错误（没按计划写 bounds.py 遮挡检查） |
| P-26 | marker 组件的高亮会盖住前一个字；steps 组件第一步时只显示两步 | 第 2 批 | 已修 | `fix(P-26)` ×2 | steps：hf.test 1 例 lateItems RED→GREEN，原因是没写 at 的步骤接着第 1 步（挂在句尾）顺延到帧外——组件没错，改成 hf-frames 提醒（01 副本实跑报出第 4 帧第 3 项）；marker：kit-browser.test 1 例 RED→GREEN（修前伸进前一个字 58px），原因是 glow 笔触按关键词宽度的 20% 往两边伸，改成固定 0.15 个字；01 副本 hf-build --snap 看第 11 帧「己」完整可见。nv 124/124（含浏览器 17 例） |
| P-27 | 帧时长写回 STORYBOARD 的是 `nv hf-build`，不是 `nv hf-audio` | 第 2 批 | 已修 | `docs(P-27)` | 每帧时长：P-31 后 nv hf-audio 已写回（workflow 第 8 步、模板说明本来就这么写，现在属实）。总时长：frontmatter duration 是 faceless 组装用的预计总长（assemble-index.mjs，偏差 >10% 提醒），不该自动改；模板的 0s 在 01 副本 hf-build 日志里触发「not parseable」，改成 100s（成品教程）/ 60s（概念）并在模板说明里写明。没重跑 hf-build 验证新值（按代码核对能解析） |
| P-28 | 渲染后跑 `--motion` 会让 kv 要求重新渲染 | 第 4 组 | 已修 | `fix(P-28)` | hf.test.mjs、captions-step.test.mjs 各 1 例 RED→GREEN；nv 111/111；实跑 01：--motion 后 sheet.jpg、STORYBOARD、audio_meta 的修改时间都不变，kv 判定保持「qa.json 有没修的问题」。另外发现 hf-build 每次重写 STORYBOARD（同步帧时长）和 audio_meta（音效），一并改成内容不变就保留原时间。01 被旧代码改过的两个文件时间已手工恢复 |
| P-29 | kv 不检查 qa.json 的 checked 和 high 级问题 | 第 3 组 | 已修 | `fix(P-29)` | practical-facts.test.mjs 4 例 RED→GREEN（旧夹具 qa.json 补全 checked）；kv 81/81；真实项目 3 期 kv status 不变 |
| P-30 | 「落定后完全静止」的修改提示不对题 | 第 2 批 | 已修 | `fix(P-30)` | hf.test 1 例 RED→GREEN（新增 stillHint 纯函数）；nv 115/115；实跑 01 副本 hf-build --motion：第 1、9、12 帧（截图）提示写 camera push，第 7 帧（录屏）提示换有操作的录屏段，和报告里的 4 帧一致 |
| P-31 | 导演做法要的 caption_groups.json 在导演路径上不会生成 | 第 1 组 | 已修 | `fix(P-31)` | captions-step.test.mjs 3 例 RED→GREEN；nv 108/108；实跑 02 删 caption_groups 后 nv hf-audio（缓存）重新生成，帧时长写回 STORYBOARD（顺带改善 P-27） |
| P-32 | 导演脚本模板写死了真实项目的系列名 | 第 7 组 | 已修 | `fix(P-32)` | templates.test 2 例 + studio project.test 1 例 RED→GREEN（旧模板测试按新规则更新预期）；vd 110/110、studio 34/34；02 的 DIRECTOR 仍通过。同类：骨架 brand-kicker.html 默认值也写死了，一并改 |
| P-33 | DIRECTOR.md 模板说明文字里的「@词」被当成 cue | 第 2 批 | 已修 | `fix(P-33)` | templates.test 1 例 RED→GREEN（说明文字去掉机器块和（待填）行后解析不出 @词）；vd 118/118。除报告里的第 5 行，第 4、17 行也有同样问题，一并放进反引号 |
| P-34 | 配音缓存不跨作品，director 做法要重新付费配一次 | 第 2 批 | 已修 | `fix(P-34)` | voice-cache.test.mjs 3 例 RED→GREEN；nv 121/121；实跑（不付费）：flow-check 里临时建 A（带 01 旧缓存）、B（不带缓存）两期，A 跑 hf-audio 把旧缓存收进项目根 .media/voice-cache，B 4 段全部「缓存」命中，总时长 80.01 和 01 一致；临时作品已删，~/flow-check/.media/ 保留（自带 .gitignore *）。Ruling：缓存放项目根、旧缓存硬链接收进来、.media 里自放 .gitignore（老项目只忽略 04-作品/*）。发现 P-42 |
| P-35 | 配乐取到的曲子比样片还短，重拍对位找不到时只是从头播 | 第 7 组 | 已修 | `fix(P-35)` | music.test 3 例 RED→GREEN（+1 反向）；vd 117/117；实跑（02 副本，带 16 秒旧曲）：重新取曲得 30 秒（时长提示不可靠）→ 循环补到 92 秒，重拍对上 64.26s @四条。Ruling：取曲带时长提示 + 太短重取 + 循环兜底 |
| P-36 | dykit 组件的动画是固定时长的，不跟 @词，也不撑满整段 | 第 2 组 | 已修（本仓库兜底） | `fix(P-36)` | components/vd 测试 4 例 RED→GREEN；vd 105/105；实跑：02 副本第 2 段改回 dy-checklist，vd build 在组装前 ✗ 拦下。Ruling：本仓库不改组件文件，只在撑不满时报错；真正撑满 + 跟 @词 见 P-36b |
| P-37 | `vd qa` 不报「整段没内容」 | 第 3 组 | 已修 | `fix(P-37)` | douyin-qa.test.mjs 2 例 RED→GREEN（qa-run 旧夹具补一个内容元素）；vd 108/108；实跑：副本第 5 段末尾清空 → ✗「58–60.5 秒只有背景」；02 原版副本完整构建 0 ✗（无误报） |
| P-38 | `vd build` 的检查失败时，`vd qa` 照样跑、照样报通过 | 第 3 组 | 已修 | `fix(P-38)` | qa-run.test.mjs 1 例 RED→GREEN；vd 106/106；实跑：02 副本让 build 检查失败后 vd qa 拒绝「上次 vd build 的检查没过」 |
| P-39 | 口播里的操作说明和真实界面不符，没有任何一步查得出来（内容错误，我写的） | 第 2 批 | 工具侧已修 | `docs(P-39)` | qa.md、workflow.md 第 9 步的 fact-on-screen 写明界面位置要对照录屏/截图核对（grep 两处一致）。01/02 口播内容按用户之前的决定（B）不修 |
| P-40 | vd 自动加的账号结尾条会和最后一段画面重复 | 第 2 批 | 已修 | `docs(P-40)` | DIRECTOR.md 模板第 5 节、director-rules 第 10 条写明 ending 会自动加结尾条，最后一段别再画；vd 118/118（模板测试仍过） |
| P-41 | nv hf-audio 生成字幕时打印「字体找不到会回退」警告（此时还没打包字体，director 做法用不到这份字幕 HTML，属误导） | 第 2 批 | 已修 | `fix(P-41)` | captions-step.test 2 例（过滤 RED→GREEN；失败照样抛错为守护用例）；nv 117/117；实跑 01 副本（挪走 assets/fonts）用真实 faceless captions.mjs：不过滤时出现字体回退警告，hf-audio 用的过滤模式下不出现，字幕照常 49 组。Ruling：只在 hf-audio 过滤，hf-build 时字体已打包、警告是真的，保留 |
| P-36b | 组件库（18826400652/hyperframes）28 个组件时间写死：改成按宿主时长撑满、项目可按 vars 给的 @词 时间出现 | 后续（另一个仓库） | 已修 | `fix(P-36b)` + 组件库 PR #4（23c9649，合并提交 0dde9f4） | 组件库：hf-kit.test 单元 RED→GREEN；新增 tests/fill.mjs（15 秒长镜头实拍），原版 14 个组件段尾已空，改后 37/37 撑满（dy-rec-phone 跳过，原因见 P-44），12 个组件的 cues 实拍生效；catalog/theme/storyboard/registry 测试通过；完整检查 tests/run.mjs（41 个用例 × 5 主题，hyperframes check --strict）205/205 通过。vd：director/cues 测试 4 例 RED→GREEN + 1 例守护，vd 122/122。端到端：02 副本第 2 段（17.8 秒）改用 dy-checklist + cues「@DeepSeek|@你写好的稿子|@深度思考」，vd build 换算成段内 9.34/11.02/16.31 秒，截图三项正好跟字幕出现、段尾还在。2026-10-16 已合并进组件库 main；在 flow-check 02 的副本上跑 vd build --update-components，components.lock.json 从 d234ad4 换成 0dde9f4，cues 换算成 9.34/11.02/16.31 秒，hyperframes check 通过。已有项目跑一次 vd build . --update-components 才换成新版 |

| P-42 | 配音缓存键里是参考音色的绝对路径（config.mjs 展开），项目挪位置或复制后缓存全部失效、要重新付费配音（修 P-34 时发现） | 第 2 批（用户定：按内容哈希，不管旧缓存） | 已修 | `fix(P-42)` | speech-cache-key.test.mjs 4 例 RED→GREEN；nv 128/128。实跑核对：flow-check 原目录和 scratchpad 副本（不同绝对路径）里同一份参考音色算出的键相同（ref:9ddd8a81…），修前分别是 bf3fca32 / e2c92413。按用户决定不兼容旧键：现有配音缓存全部失效一次，下次配音会重新付费。setup.md 删掉「换文件要清缓存」 |
| P-43 | 豆包提问太长时回答在屏幕外，nv rec 发送后 9 秒就判「回答完」，录屏和 txt 都只有提问（P-20 实跑发现） | 待定 | 已修 | `fix(P-43)` | test_apps / test_rec_flow 新增 11 例，均 RED→GREEN；phone-draft 126/126。原因三层：①豆包没有完成标记，标题从「新对话」变成对话名（12 字）就被当成回答；②回答在屏幕外，录不到；③完成按钮在屏幕下沿外。改：DONE_ID=msg_action_regenerate（平常界面只有 id，没有描述）；等回答时每轮 follow_answer 点 ↓（无描述 ImageView，按位置认）或「转至底部」；文字稳定但看不到标记时 reveal_done 往上推一小段。真机实跑（同一 1230 字节提问）：修前 9 秒误判、只录到提问；修中三轮 300 秒超时（逐层排查）；修后发送后 22.6 秒回答完，视频里回答边出边跟、结尾有按钮行，txt 有回答结尾；DeepSeek 回归一轮正常（有复制的完整回答） |
| P-44 | dy-rec-phone 的录屏比段短时，后半段手机里是空的（修 P-36b 时发现：测试录屏 8 秒、挂 15 秒） | 待定 | 待修 | | |

## 第 1 批收尾（2026-10-15）

- 17 个问题全部提交（`git log --grep "fix(P-"`），其中 P-19、P-20 代码已修、真机实跑待用户连手机；顺带修好 P-02，P-27 部分改善（hf-audio 也会写回帧时长）
- 全部测试：studio 34、knowledge-video 85、scenario-content 13、video-director 117、wechat-article 5、image-cards 4、narrated-video 114（node --test，0 失败）；phone-draft 112、browser-draft 7（pytest，0 失败）。修前基线 26/77/10/101/5/4/105/105/7
- 修复中新发现：P-36b（组件库仓库）、P-41（hf-audio 字体回退警告）
- 整条分支自查：改动的 .mjs 全部 `node --check` 通过，没有调试输出、没有未使用的导入（自查，未派独立 reviewer）

## 第 2 批收尾（2026-10-15）

- 23 个问题全部提交（`git log 6178d8e..HEAD --grep "(P-"`）。P-26 两个现象分两个提交；P-15、P-17 各一个提交
- 全部测试：studio 37、knowledge-video 86、scenario-content 15、video-director 118、wechat-article 5、image-cards 4、narrated-video 124（node --test，0 失败）；phone-draft 112、browser-draft 8（pytest，0 失败）
- 只部分处理、需要用户知道的：P-01 环境慢本身不归工具包，只改了提示，没实跑 st install --deps；P-15 / P-17 按文档处理，没做抓收藏、抓评论的功能，没实跑 sc bench；P-39 只改了检查规则，01/02 口播按用户决定不修；P-27 新的预计时长按代码核对，没重跑 hf-build
- 实跑留下的东西：`~/flow-check/.media/voice-cache/`（P-34 共用缓存，自带 .gitignore）；scratchpad 的 01 副本被改动过，不影响 flow-check
- 修复中新发现：P-42（配音缓存键用参考音色的绝对路径，项目挪位置后要重新付费配音），改法要用户定
- 整条分支自查：改动的 .mjs / .js 都过了 `node --check`，bash 入口过了 `bash -n`；没有调试输出、没有未使用的导入（自查，没有派独立 reviewer）
- 还没做：P-36b（组件库仓库）、P-42、P-19 / P-20 真机实跑
