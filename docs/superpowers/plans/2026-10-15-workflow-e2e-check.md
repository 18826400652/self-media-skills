# 全流程打通检查 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 `studio/references/workflow.md` 从安装工具包开始，把一期新内容从 `st init`、`st new`、第 1 步场景卡一路从零做到复盘，template、director 两种视频做法和概念科普附录都走一遍；逐个 skill 核对文档写的命令、参数、kv 判定和代码是否一致，得出一份「哪一步通 / 不通 / 未验证」的检查报告。

**Architecture:** 只检查、不修。在一个新建的测试作品项目里跑真实命令，每一步记录：命令、实际输出、kv status 的变化、和文档是否一致。发现的问题只记进报告，检查结束后列给用户，用户确认后再另开任务修（CLAUDE.md 第 9 节）。按代价分四级执行，越往后越需要用户在场。

**Tech Stack:** 工具包现有命令 `st kv sc nv vd wa ic bd pd`；HyperFrames 0.8.x；browser-harness；adb + uiautomator2；DashScope（千问配音、fun-asr）；heygen CLI（director 配乐）。

**Spec:** `studio/references/workflow.md`（规则来源以代码为准：`knowledge-video/scripts/lib/practical*.mjs`、`video.mjs`）

## Global Constraints

- **只存草稿，永远不点发布**；登录、扫码、验证码由用户完成。
- **从头开始，每一步都从零真做**：从安装工具包开始，到复盘结束，按 workflow.md 的顺序一步不跳。每一步的产物都由这次检查现场产出（Claude 起草 + 用户确认 + 真实命令），**不从 `~/self-media` 复制任何作品文件**。某一步做不了（如手机不在），这一步记为「— 未验证」并写明原因，流程停在这里等条件具备，不拿复制的内容顶替往后走。
- **实测绝不编造**：实测内容只能来自这次真实录屏（手机 `nv rec --app`，或浏览器 `--url`）。
- **不动 `~/self-media` 里的任何作品**：真实项目只用来读、跑只读命令（`kv status`、`st doctor`）。
- **检查中不修代码、不改文档**：问题写进报告；工具包仓库全程不提交（用户要求）。
- 测试项目：`~/flow-check`（`st init` 新建，检查结束后由用户决定删不删）。
- 测试内容的标题一律带前缀 `【流程测试勿发】`，三平台草稿检查完由用户在后台删除。
- 代价分级（每级开始前跟用户确认一次）：
  - **L0 离线**：单元测试、文档 ↔ 代码对照、`--help`、`--check` 类命令，不花钱、不碰外部
  - **L1 本地真跑**：`st new`、`kv`、`sc check`、`nv hf-build`、`nv render`、`ic render`、`wa preview`，只用本机 CPU / Chrome
  - **L2 付费接口**：`nv hf-audio`（DashScope）、`vd build` 配乐（heygen）
  - **L3 外部平台**：浏览器存草稿、`sc bench` 搜索、手机 `nv rec` / `pd`，需要用户在场、浏览器登录、手机解锁

## Review Focus

1. **文件改过后确认节点失效（stale）**：确认后改 `选题关.md` / `SCRIPT.md` / `STORYBOARD.md` / `DIRECTOR.md` / 成片，`kv status` 应显示要重新确认，`kv gate` 下一节点应被拒绝 → Task 4（①）、5（②）、6（③）、7（③a）各有一步专门改文件再看。
2. **新旧顺序检查**：sheet 比 STORYBOARD 旧、成片比 sheet 旧、`qa.json` 比成片旧、封面 PNG 比 `封面.md` 旧，都应判为没做完 → Task 6、7、10 用 `touch` 制造时间差。
3. **前置没满足时命令应拒绝而不是半成品**：`kv gate` 跳步、`kv done` 内容没写、`wa draft` 封面不存在、`nv draft` 抖音已有未发布作品 → Task 4、8、10。
4. **director 手动建工程漏复制配音**：只复制一部分文件，kv 应给出明确提示 → Task 7。
5. **文档写的版本 / 路径和配置不一致**：`hfVersion`（项目配置 0.8.143）对比 `narrated-video` 自带 hyperframes 0.8.119；`sfxDir` 指向 media-use skill 的绝对路径 → Task 1、7。

---

## 文件

- Create: `docs/superpowers/reports/2026-10-15-workflow-check.md` —— 检查报告（逐步结果表 + 问题清单），不提交
- Create（仓库外）：`~/flow-check/` —— 测试作品项目
- 不修改任何工具包代码和文档

报告里每一行的格式：

```markdown
| 步骤 | 命令 | 级别 | 结果 | 和文档一致 | 备注 / 问题编号 |
|---|---|---|---|---|---|
| 2.3 st new | `st new 流程测试 选题` | L1 | ✓ 通 | ✓ | — |
```

问题清单格式：

```markdown
### P-01 <一句话>
- 位置：`文件:行`
- 现象：命令 + 实际输出（原样粘贴）
- 文档怎么写：workflow.md 第 X 节原文
- 严重度：阻断（流程走不下去）/ 错误（结果不对）/ 文档（只是文档和代码不一致）/ 体验
```

---

### Task 0: 准备报告和基线

**Files:**
- Create: `docs/superpowers/reports/2026-10-15-workflow-check.md`

- [ ] **Step 1: 建报告文件**，写好标题、检查日期、工具包 `git rev-parse HEAD`、上面两个表头。

- [ ] **Step 2: 全量单元测试（L0）**

```bash
cd ~/self-media-skills
for d in studio knowledge-video scenario-content video-director wechat-article image-cards narrated-video; do
  (cd $d && echo "$d: $(node --test tests/*.test.mjs 2>&1 | grep -E '^# (pass|fail)' | tr '\n' ' ')")
done
(cd phone-draft && .venv/bin/python -m pytest -q | tail -1)
(cd browser-draft && ../phone-draft/.venv/bin/python -m pytest -q | tail -1)
```

Expected: 全部 `fail 0`（2026-10-15 基线：26 / 77 / 10 / 101 / 5 / 4 / 105 / 105 / 7）。数字写进报告。

- [ ] **Step 3: 按 README「安装」从零装一遍（L1）**——不碰已装好的 `~/.claude/skills`、`~/.local/bin`，用一个临时 HOME 模拟新机器：

```bash
T=$(mktemp -d)          # 例如 /tmp/tmp.xxxx，记进报告
git clone ~/self-media-skills "$T/self-media-skills"
HOME="$T" "$T/self-media-skills/studio/bin/st" install --deps
ls -la "$T/.claude/skills" "$T/.local/bin"
(cd "$T/self-media-skills/narrated-video" && HOME="$T" npx hyperframes skills update faceless-explainer hyperframes-audio)
HOME="$T" PATH="$T/.local/bin:$PATH" st init "$T/my-media" --account 流程测试 --audience "想做自媒体的新手"
(cd "$T/my-media" && HOME="$T" PATH="$T/.local/bin:$PATH" st doctor)
```

Expected: 10 个 skill 和 9 个命令都软链到 `$T/self-media-skills`；`npm ci` 和 `uv` 都成功；`st doctor` 只提示该用户补的东西（参考音色、`.env`、浏览器登录），每条提示都说清怎么补。README 每一步有没有漏写的前置条件（比如 heygen、scrcpy、Chrome 运行库）写进报告。检查完 `rm -rf "$T"`。

- [ ] **Step 4: 本机环境体检（L0 + L3 只读）**

```bash
cd ~/self-media && st doctor && st doctor --online
nv doctor
bd tabs
pd devices
command -v scrcpy || ls ~/self-media-skills/phone-draft/vendor
```

Expected: 都没有 ✗。已知要核实的一点：`st doctor` 输出里「依赖」小节下面是空的，确认是没检查还是全过了，结果写进报告。

---

### Task 1: 文档 ↔ 代码对照（L0，每个 skill 都查）

不跑真实流程，只核对 workflow.md 第四节和各 `SKILL.md` 写的命令、参数、文件名和代码一不一致。每个 skill 一步，方法相同：

1. 读该 skill 的 `SKILL.md` 和 workflow.md 对应小节，列出所有命令和参数；
2. 跑命令的帮助（不带参数或 `--help`），看用法输出；
3. 对每个参数 `grep -n -- '<参数>' <scripts>` 确认代码里真的处理；
4. 不一致的写进问题清单。

- [ ] **Step 1: studio（`st`）** —— `st doctor [--online]`、`st new` 的 `--编号 --video --栏目 --日期 --只建抖音`、`st init --account --audience`、`st install --deps`、`st version`。代码：`studio/scripts/st.mjs`、`scripts/lib/*.mjs`。另查：`studio/templates/` 里的模板数量和 `st doctor` 报的「18 个」是否一致；`st new` 生成的文件清单和 workflow.md 2.3 节列的是否一致（Task 3 实测时再对照一次）。

- [ ] **Step 2: knowledge-video（`kv`）** —— `status / gate / done / init / check / brief`；`gate` 的节点名 `topic script storyboard director sample final` 和 `--edit`；`done` 的 `wechat xiaohongshu douyin`；`init --fresh --video`；环境变量 `KV_SC_CMD KV_NV_CMD KV_VD_CMD`。把 workflow.md 第三节每一步的「kv 判定」逐条和 `scripts/lib/practical-facts.mjs`、`practical.mjs`、`video.mjs` 对照，指纹表（4.1 节）和代码里每个节点管的文件对照。

```bash
cd ~/self-media-skills/knowledge-video
grep -n "topic\|script\|storyboard\|director\|sample\|final" scripts/lib/practical.mjs | head -60
grep -n "预览\|sample\|compare" scripts/lib/*.mjs
grep -n "KV_SC_CMD\|KV_NV_CMD\|KV_VD_CMD" scripts/lib/*.mjs
```

- [ ] **Step 3: scenario-content（`sc`）** —— `sc bench <关键词…> --platform --out --top`、`sc check [--json]`；第 6 步检查项表的 10 行，每行在 `scripts/sc.mjs` 找到对应的判断和级别（✗ / ⚠）；长度上限（公众号 30、小红书 20、抖音标题 30、口播每句 28）；配置默认值 `minBenchmarks 5`、`benchCdpPort 9333`。

- [ ] **Step 4: content-repurpose** —— 只有方法文档。核对 workflow.md 4.3 的平台对照表和 `references/{wechat,xiaohongshu,douyin}.md` 的数字一致（篇幅、标题字数、封面比例）；`sc check` 用到的上限和这里一致。

- [ ] **Step 5: narrated-video（`nv`）** —— `bin/nv` 的子命令列表对照 4.4 表；`rec` 的 `--prompt --app --think --search --timeout --url --via`；`hf-audio --check --pause`；`hf-build --snap --motion --caption-zone`；`draft --copy --cover --to --via`（含「`--cover` 只支持浏览器」）；`render` 输出路径命名规则（`bin/nv` 里 `parent =~ ^[0-9]+-` 时用作品名）对照文档写的 `抖音/renders/<作品名>.mp4`。另查 `package.json` 的 hyperframes 版本 0.8.119 和项目配置 `hfVersion` 0.8.143 的关系（Review Focus 5）。

- [ ] **Step 6: video-director（`vd`）** —— `cues [--check]`、`build [--sample] [--no-music] [--update-components]`、`qa`、`check`；`qa` 的阈值（顶 200 / 右 160（y 760 以下）/ 底 480、字幕带 1180–1440、@词后 0.8 秒、2 秒不动）在 `scripts/lib/douyin-qa.mjs` 里一致；结果文件名 `qa-douyin.json` / `qa-douyin-sample.json`；第 8 步手动 `cp` 的文件清单是否就是 kv 和 `vd build` 需要的全部文件；`sfxDir` 绝对路径是否存在。

- [ ] **Step 7: wechat-article（`wa`）** —— `preview / render / draft [--via phone] / publish`；`draft` 用 frontmatter `cover` 上传、封面不存在直接报错的代码位置；`预览.html` 输出位置；主题 `grace`。

- [ ] **Step 8: image-cards（`ic`）** —— `render [--preset] [--out]`（溢出退出码 2）、`preview`、`draft`（`bin/ic` 怎么分发到 `scripts/draft.mjs`）；预设 `douyin-cover`、`wechat-cover` 的尺寸和文档写的 9:16、2.35:1 一致；输出 `out/01.png` 的位置。

- [ ] **Step 9: browser-draft（`bd`）** —— `tabs`、`run`；连接顺序 `BU_CDP_WS → BD_CDP_PORT → cdpPort → DevToolsActivePort` 和 `bin/bd` 一致；三个平台步骤脚本路径存在；`shot()` 截图目录（文档写 `/tmp/browser-draft/`，代码是 `${TMPDIR:-/tmp}/browser-draft`）；各步骤脚本里没有点「发表 / 发布 / 群发」的代码：

```bash
cd ~/self-media-skills
grep -n "发表\|发布\|群发" wechat-article/scripts/draft_wechat.py narrated-video/scripts/draft_douyin.py narrated-video/scripts/draft_xiaohongshu.py image-cards/scripts/draft_xiaohongshu.py
```

Expected: 只出现在注释、读回校验或「禁止点击」的列表里，没有对它们的点击调用。

- [ ] **Step 10: phone-draft（`pd`）** —— `devices / connect / ui / rec / run`；`rec` 的隐私检查（勿扰）、恢复剪贴板和开关、自动熄屏改 30 分钟再改回，在 `lib/phone_draft/rec.py`、`device.py` 里能找到；scrcpy 用的是 `vendor/` 里的版本；同样 grep 禁点词：

```bash
grep -rn "发表\|发布\|群发\|发作品\|日常" phone-draft/lib wechat-article/scripts/phone_wechat.py narrated-video/scripts/phone_*.py
```

- [ ] **Step 11: 汇总**：每个 skill 一行写进报告「文档 ↔ 代码」表。

---

### Task 2: 建测试作品项目（L1）

- [ ] **Step 1: 新建项目**

```bash
st init ~/flow-check --account 流程测试 --audience "想做自媒体的新手"
cd ~/flow-check && st doctor
```

Expected: 目录骨架 00–07、8 个 `*.config.json`、`studio.json`、`README.md`、`.env.example`；`st doctor` 只提醒缺 `.env`。

- [ ] **Step 2: 按 `st doctor` 的提示逐项补齐配置**——不复制 `~/self-media` 的配置文件，照新用户的做法：读 doctor 每条 ✗ / ⚠ 的提示 → 按提示指向的文档（`narrated-video/references/setup.md`、`video-director/SKILL.md`「安装」、`browser-draft/SKILL.md`）配置 → 重跑 `st doctor`，直到没有 ✗。
  - `.env`：照 `.env.example` 建，密钥由用户提供（用户同意时可以从 `~/self-media/.env` 取同一个 key）
  - 参考音色 `tts.reference`、`hfVersion`、`cdpPort`、`sfxDir`：按文档说明填，不照抄真实项目
  - 每一条提示都记进报告：提示说没说清楚、照着文档能不能补好、补的过程中有没有文档没写的步骤

Expected: 没有 ✗。

- [ ] **Step 3: 登记系列**，编辑 `00-规划/系列/系列.json`：

```json
{
  "流程测试": { "label": "流程测试", "unit": "期", "type": "practical" },
  "流程测试概念": { "label": "流程测试概念", "unit": "期", "type": "concept" },
  "已暂停": { "label": "已暂停", "unit": "期", "paused": "测试用" }
}
```

---

### Task 3: 新建一期（`st new`，L1）

- [ ] **Step 1: 报错路径**

```bash
cd ~/flow-check
st new 没登记 x        # Expected: 报错「系列没登记」，不建任何目录
st new 已暂停 x        # Expected: 报错含暂停原因
st new 流程测试概念 x  # Expected: 按文档「type 不对」报错，或走概念流程——记录实际行为
```

- [ ] **Step 2: template 一期**

```bash
st new 流程测试 模板做法
find 04-作品/流程测试 -maxdepth 3 | sort
kv status 04-作品/流程测试/01-模板做法
```

Expected: 文件清单与 workflow.md 2.3 节一致（场景卡、选题关、实测记录、实测/、母稿、费曼检查、发布记录、公众号/文章.md 带 `cover: ./封面/out/01.png`、公众号/封面/封面.md、小红书/文案.md、抖音/ 下 frame.md、.hyperframes/caption-skin.html、BRIEF、SCRIPT、STORYBOARD、封面.md、发布文案.md、组件库）；`系列/流程测试.md` 自动建出；没有残留的 `{{…}}` 占位符（`grep -rn "{{" 04-作品/流程测试/01-模板做法 --include=*.md`）；`kv status` 显示 14 步、下一步「1 场景卡」。

- [ ] **Step 3: director 一期**

```bash
st new 流程测试 导演做法 --video director
kv status 04-作品/流程测试/02-导演做法
```

Expected: 15 步；没有 `抖音-director/`；`run.json` 里 `"video": "director"`。

- [ ] **Step 4: 其他选项**：`--编号 9`、`st new 单篇 x --栏目 测试 --日期 2026-10-15`、对已有作品 `--只建抖音`；模板覆盖：把 `studio/templates/场景卡模板.md` 原样复制到 `05-模板/` 后 `st doctor` 应提醒删除，改一个字后 `st new` 应用项目版本。

---

### Task 4: 内容阶段 第 1–6 步（L1；`sc bench` 为 L3）

在 `01-模板做法` 里从零做；`02-导演做法` 的第 1–7 步内容文件到 Task 7 前从 `01-模板做法` 复制过去（director 只检查第 8 步以后的分叉，前 7 步两种做法相同，复制这一点在报告里写明）。

测试选题现场定：Task 4 开始前，Claude 按 `00-规划/系列/流程测试.md` 和 scenario-content 第 1 步，提一个能在 DeepSeek / 豆包上真实实测的小选题（例如「用 AI 把一段会议录音整理成待办清单」），用户点头后开始。

- [ ] **Step 1: 第 1 步 场景卡**——先不填直接 `sc check` 和 `kv status`，应停在第 1 步并说清缺什么；再由 Claude 按 scenario-content 第 1 步起草、用户确认后填好（标题加测试前缀），`kv status` 应前进到第 2 步。记录：SKILL.md 的写法说明够不够 Claude 一次写对、`sc check` 的提示是否准确。

- [ ] **Step 2: 第 2 步 选题关**——
  - L3（用户在场、自动化浏览器已登录抖音和小红书）：用这期选题的关键词 `sc bench <关键词…> --platform all --out 实测/对标-选题关.json --top 10`，检查 json 结构和点赞中位数；从结果里挑 ≥ 5 条填对标表，写标题候选、封面大字、开头三秒；
  - 浏览器连不上或没登录时，这一步记「— 未验证」，停下等用户处理，不手填对标数据；
  - 对标只留 4 条时 `sc check` 应报 ✗（`minBenchmarks`）；
  - `kv gate <作品> script "测试"` 应被拒绝（跳步）；
  - `kv gate <作品> topic --edit "测试修改意见"` → `run.json` 记下 edits、节点不算通过；
  - `kv gate <作品> topic "测试通过"` → `选题关.md`「用户确认」被写入；
  - 再改 `选题关.md` 一个字 → `kv status` 显示 ① 失效（Review Focus 1）；恢复后重新 gate。

- [ ] **Step 3: 第 3 步 实测**——
  - Claude 先写 `实测/提问.txt`；
  - L3 手机（勿扰打开、DeepSeek 已登录）：`nv rec 实测/录屏-第1轮.mp4 --prompt 实测/提问.txt --app deepseek` 跑两轮；先在勿扰关闭时跑一次，确认拒绝录制；检查 `.mp4` 1080×1920、`.json` 用时、`.txt` 有「## 复制的完整回答」；录完剪贴板和 DeepSeek 开关已恢复；豆包 `--app doubao` 至少跑一轮；
  - 没有手机时：`--url https://chat.deepseek.com` 走浏览器，同样两轮，另记手机这条路径「— 未验证」；
  - 两条路都不通时，第 3 步记「✗ 不通」或「— 未验证」，流程停在这里，不往后走；
  - 按真实录屏结果写 `实测记录.md`（原始回答原样粘贴、用时、翻车的地方）；
  - 实测记录状态「待实测」时 `kv status` 应停在第 3 步；`实测/` 没有 mp4 时也应停住。

- [ ] **Step 4: 第 4、5 步 母稿、费曼检查**——按模板写（内容来自上一步的真实实测）。先少写「坑」小节，`sc check` 应报缺小节；费曼追问只答 2 个，应报 ✗；都补齐后 `kv status` 前进到第 6 步。

- [ ] **Step 5: 第 6 步 自检**——在母稿里故意放一个 AI 腔词、费曼检查列出的术语、一个 `{{x}}`，`sc check` 应分别给 ⚠ / ⚠ / ✗；去掉 ✗ 后 `kv status` 前进到第 7 步，⚠ 不阻断。逐行对照 workflow.md 第 6 步的检查项表，没触发到的行在报告里标「未验证」。

---

### Task 5: 第 7 步 抖音脚本 + 配音稿（L0）

- [ ] **Step 1**：按 `SCRIPT模板` 写 `抖音/SCRIPT.md`（约 14 帧）和 `抖音/VOICE.md`。
- [ ] **Step 2**：`nv hf-audio 抖音 --check` 通过；把 VOICE 里一句台词改掉一个字，应报不一致；口播写一句 30 字、一个阿拉伯数字，`sc check` 应给 ⚠。
- [ ] **Step 3**：`kv gate <作品> script "测试通过"`；之后改 `VOICE.md` → ② 失效；恢复后重新 gate。

---

### Task 6: 第 8–9 步 template 视频（L2 + L1）

- [ ] **Step 1: 配音（L2，先问用户）**：`nv hf-audio 抖音 --pause 0.3`。Expected: `audio_meta.json`、`caption_groups.json`、`assets/voice/`；STORYBOARD 每帧时长被写回。
- [ ] **Step 2: 分镜**：写 `STORYBOARD.md` 的 `- build:` 行，至少用到 `rec`、`kit`、`title`、`ground: "accent"`、一个 `- sfx:`；`nv hf-build 抖音 --snap`，Expected: 没有报错、生成 `snapshots/sheet.jpg`。故意让一帧越出四角框，确认 `bounds.py` 报出来。
- [ ] **Step 3: 新旧检查**：`touch 抖音/STORYBOARD.md` → `kv status` 应要求重跑 `--snap`（Review Focus 2）；重跑后 `kv gate <作品> storyboard "测试通过"`。
- [ ] **Step 4: 渲染**：`nv render 抖音`。Expected: `抖音/renders/01-模板做法.mp4`（核对实际文件名和文档写的「作品名」是否一致），`nv verify` 自动跑并通过。
- [ ] **Step 5: 过程检查**：`nv hf-build 抖音 --motion`，再 `ffmpeg -ss 5 -i 抖音/renders/<成片>.mp4 -frames:v 1 /tmp/x.png` 抽帧看。
- [ ] **Step 6: QA**：写 `qa.json`（7 项、`passed: true`）；先写 `passed: false` 看 kv 拒绝；`touch` 成片让 `qa.json` 变旧，kv 应判没做完；文件名以 `预览` 开头的 mp4 不应被当成片。然后 `kv gate <作品> final "测试通过"`。

---

### Task 7: 第 8–10 步 director 视频（L2 + L1）

在 `02-导演做法` 里做，内容文件和 `抖音/` 配音从 Task 5–6 复制（`audio_meta.json`、`caption_groups.json`、`assets/voice/` 都在 `抖音/` 里）。

- [ ] **Step 1: 手动建导演工程**——按 workflow.md 第 8 步原样执行 `mkdir` 和 `cp`。先**故意不复制** `assets/voice`，看 `kv status` / `vd build` 的提示是否说清楚（Review Focus 4）；再补齐。把 `package.json` 的 hyperframes 改成 `hfVersion`，记录这一步需要手改的地方（缺口 1 是否仍然存在）。
- [ ] **Step 2: 导演脚本**——按 `templates/DIRECTOR.md` 写（2–3 段即可，至少一段用 dykit 组件）；`vd cues 抖音-director --check` 通过；写一个找不到的 `@词`，应报错。`kv gate <作品> director "测试通过"`；只改第 8 节组件候选不应让 ③a 失效，改第 2 节应失效。
- [ ] **Step 3: 风格样片**——

```bash
vd build 抖音-director --sample
vd qa 抖音-director
cd 抖音-director && npx hyperframes render -o renders/sample.mp4
```

Expected: `qa-douyin-sample.json` `passed: true`、`snapshots/cues-sheet.jpg`；故意把一个元素放进字幕带，`vd qa` 应报 ✗。`kv gate <作品> sample "测试通过"`。核对文档写的 `npx hyperframes render` 用的是哪个版本的 hyperframes。
- [ ] **Step 4: 全片（配乐为 L2，先问用户）**——`vd build 抖音-director --no-music` → `vd build 抖音-director` → `vd qa 抖音-director` → `nv render 抖音-director` → 写 `qa.json` → `vd check 抖音-director`。Expected: 成片在 `抖音-director/renders/`；改任一段 HTML 后 `qa-douyin.json` 变旧，kv 应判没做完。`kv gate <作品> final "测试通过"`。
- [ ] **Step 5: 中途换做法**——在 `01-模板做法` 的 `run.json` 里把 `video` 改成 `director`，看 `kv status` 怎么重新算已通过的节点，再改回来。

---

### Task 8: 公众号（L1；存草稿 L3）

- [ ] **Step 1**：改编 `公众号/文章.md`（标题带 `【流程测试勿发】`）。
- [ ] **Step 2: 封面不存在时**：先不出封面跑 `wa draft 公众号/文章.md`，应直接报错、不打开后台；同时看 `kv status` 有没有提前提示（缺口 2）。
- [ ] **Step 3**：`ic render 公众号/封面/封面.md`（看图，2.35:1）；`wa preview 公众号/文章.md`（`预览.html` 在哪、手机宽度）；`wa render 公众号/文章.md | head`。
- [ ] **Step 4（L3，用户在场，自动化浏览器已登录公众号后台）**：`wa draft 公众号/文章.md`。Expected: 草稿箱里有一篇，标题、作者、正文图片、封面都对；**没有点发表**；截图在 `/tmp/browser-draft/`。`kv done <作品> wechat` 先在文章是空模板的作品上跑一次，应被拒绝。
- [ ] **Step 5（可选 L3）**：`wa draft 公众号/文章.md --via phone`。

---

### Task 9: 小红书（L3）

- [ ] **Step 1**：写 `小红书/文案.md`（`## 标题` / `## 正文` / `## 话题`，标题带测试前缀）；标题写 21 字时 `sc check` 应 ⚠。
- [ ] **Step 2**：先跑 Task 10 Step 1 出抖音封面；然后 `nv draft 抖音/renders/<成片>.mp4 --copy 小红书/文案.md --cover 抖音/out/01.png --to xiaohongshu`。Expected: 创作服务平台草稿箱数量加一，封面换成了我们的图，话题逐个选上；**没有点发布**。
- [ ] **Step 3**：`kv done <作品> xiaohongshu`；在报告里记录封面被裁成 3:4 后的实际效果（缺口 3）。

---

### Task 10: 抖音草稿（L1 + L3）

- [ ] **Step 1**：`ic render 抖音/封面.md`（9:16，看图）；`touch 抖音/封面.md` 后 kv 应判封面过期（Review Focus 2），重新出图。
- [ ] **Step 2**：写 `抖音/发布文案.md`（标题带测试前缀）。
- [ ] **Step 3（L3）**：`nv draft 抖音/renders/<成片>.mp4 --copy 抖音/发布文案.md --cover 抖音/out/01.png`。Expected: 横竖两个封面都上传、「暂存离开」；**没有点发布**。
- [ ] **Step 4: 已有未发布作品时**：再跑一次同样的命令，应检测到上一条未发布作品并停下、不覆盖、不点「放弃」（Review Focus 3）。
- [ ] **Step 5**：`kv done <作品> douyin`；记录横封面 4:3 裁切效果（缺口 4）。
- [ ] **Step 6（可选 L3）**：`nv draft … --via phone`，确认会提示不支持 `--cover`。

---

### Task 11: 发布记录、复盘（L1）

- [ ] **Step 1**：`发布记录.md` 的「置顶评论（原文）」代码块保持模板占位时 `kv status` 停在发布记录；换成真实文字后前进。
- [ ] **Step 2**：在 `00-规划/经验库/` 建 `2026-10-15-模板做法.md` 后 `kv status` 全 ✓；director 那期同样做一遍。
- [ ] **Step 3**：两期都显示 14 / 15 步全 ✓ 后，把最终的 `kv status` 输出贴进报告。

---

### Task 12: 概念科普附录（L1；配音 L2）

- [ ] **Step 1**：`st new 流程测试概念 概念测试`，核对文档说的「只放发布记录和抖音工程（17 句概念模板）」。
- [ ] **Step 2**：按 `knowledge-video/references/research.md` 写 `research.json`（来源用真实网页）、`kv check` 无 ✗、`kv brief` 生成研究简报；故意让一句脚本没有依据，`kv check` 应报 ✗。
- [ ] **Step 3**：按 knowledge-video「确认节点怎么记」手改 `run.json`，走到 director 的 ②a / ②b、成片；可参考真实项目 `~/self-media/04-作品/AI概念一分钟/01-RAG`（只读）对照产物是否齐全。
- [ ] **Step 4**：核对文档「概念科普的确认要手改 `run.json`」和 `kv gate` 对概念作品的实际行为（是拒绝还是支持）。

---

### Task 13: 汇总报告

- [ ] **Step 1**：逐步结果表补全，每行都是 ✓ 通 / ✗ 不通 / — 未验证（写原因：没有手机、用户没批准付费…）。
- [ ] **Step 2**：问题清单按严重度排序，每条有复现命令和实际输出。
- [ ] **Step 3**：workflow.md 第五节四个缺口逐条写「仍存在 / 已不存在」。
- [ ] **Step 4**：列出需要用户处理的事：后台删除三条测试草稿、删不删 `~/flow-check`、哪些问题要修（修复另开任务，不在本计划里做）。
- [ ] **Step 5**：确认工具包仓库没有改动：`git -C ~/self-media-skills status --short` 只多出报告文件（和之前就有的 `CLAUDE.md`）。
