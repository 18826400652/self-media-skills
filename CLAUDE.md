# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> 通用开发规范模板。第 1 节「项目信息」每个项目单独填写，其余各节为通用规则，拷贝后不做修改。

## 0. 公共仓库

- 仓库路径：`/home/power/shared-repo`
- 模块索引：`/home/power/shared-repo/CATALOG.md`
- 提示词方法论：`/home/power/shared-repo/standards/prompt-engineering.md`

若路径仍是占位符或无法访问：先告诉我，不要跳过复用检查，也不要凭经验替代方法论文档。

## 1. 项目信息

| 项目 | 内容 |
|------|------|
| 项目简介 | 自媒体工具包：一组 Claude Code skill，把一个选题做成抖音视频 + 小红书视频笔记 + 公众号长文，三个平台存草稿（只存草稿，永远不点发布）。和具体账号无关，账号、品牌、目录约定都放在**作品项目**里 |
| 语言 / 框架 | Node.js 22+（ESM `.mjs`，无构建步骤）为主；Python（uv 管理的各 skill 自带 `.venv`）用于浏览器 / 手机自动化和本地 TTS；视频用 HyperFrames（HTML + GSAP）渲染；浏览器操作走 browser-harness（CDP），手机走 adb + uiautomator2；外部依赖 FFmpeg |
| 测试框架与命令 | Node：`node:test`，在各 skill 目录里 `node --test tests/*.test.mjs`；单个文件 `node --test tests/cues.test.mjs`，单个用例加 `--test-name-pattern "用例名"`。Python：pytest，`cd phone-draft && .venv/bin/python -m pytest -q`；browser-draft 没有自己的 venv，借用 `cd browser-draft && ../phone-draft/.venv/bin/python -m pytest -q` |
| 格式化 / 静态检查命令 | 目前没有配置（无 eslint / prettier / ruff）。`vd check` 是 vd 自己的命令（校验 DIRECTOR.md、列组件候选、跑 hyperframes check），`vd lint`、`vd preview` 透传给 hyperframes；检查的都是视频工程而不是工具包代码 |
| 目录结构 | 根目录每个子目录是一个独立 skill：`SKILL.md`（给 Claude 的说明）+ `bin/<命令>`（bash 入口）+ `scripts/` 或 `lib/` + `tests/` + 可选 `references/`、`templates/`。`docs/superpowers/{specs,plans}/` 放每个功能的设计和实施计划（按日期命名） |

### 1.1 架构要点

**工具包 vs 作品项目**：本仓库只放与账号无关的代码和默认模板。作品项目是另一个目录（`st init` 从 `studio/skeleton/` 生成），根目录有 `studio.json`（目录约定、账号信息）和各 `<skill>.config.json`。所有命令都从当前目录**往上找**这些配置文件，所以命令要在作品项目里跑。skill 代码里不得写死作品目录名、账号或品牌信息。

**安装方式**：`st install [--deps]`（`studio/scripts/lib/install.mjs`）把每个 skill 目录软链到 `~/.claude/skills/<名字>`，把 `bin/*` 软链到 `~/.local/bin`。因此改的是仓库里的文件就立即生效；在 git worktree 里开发时，测试前要把 worktree 里相关 skill 的 `bin/` 放到 PATH 最前面，否则调用的是已安装的那份。各 skill 的 `node_modules/`、`.venv/` 装在 skill 目录自己里面，不入库。

**命令与 skill 对应**：`st`（studio，总入口：doctor/new/init/install）、`kv`（knowledge-video，一期的进度调度和确认节点）、`sc`（scenario-content，实测录屏 `sc rec`）、`vo`（voiceover，配音、字幕分组）、`vd`（video-director，导演工程、渲染验片，未知子命令透传给 `hyperframes`）、`vdraft`（video-draft，存抖音、小红书草稿）、`wa`（wechat-article，底座 `@wenyan-md/cli`）、`ic`（image-cards）、`bd`（browser-draft）、`pd`（phone-draft）。`bin/` 入口统一用 `readlink -f` 解析软链后定位 skill 目录。

**一期内容的流程**由 `kv status <作品目录>` 驱动：它根据作品目录里已有的产物判断现在该做哪一步；确认节点要用户明确同意后才 `kv gate`。完整步骤见 `studio/references/workflow.md`。

**发草稿的分层**：`browser-draft` 和 `phone-draft` 只提供连接和公共函数（`bd run <步骤.py>` / `pd run <步骤.py>`）；各平台的具体步骤脚本放在拥有该内容的 skill 里（如 `wechat-article/scripts/draft_wechat.py`、`video-draft/scripts/draft_douyin.py`、`phone_*.py`）。`bd run` 把 `browser-draft/lib/copy_format.py`、`lib/bd.py` 和步骤脚本拼接后交给 `browser-harness -c` 执行；`phone-draft` 的 Python 通过 `PYTHONPATH` 复用 `browser-draft/lib`。

**视频**：只有导演做法。`st new` 用 `vd init` 建 `抖音/` 工程；`vo 抖音` 配音（写 `audio_meta.json`、`caption_groups.json`），`vd` 写导演脚本、组装、QA、渲染；两者只靠这几个文件连接。

**铁律**（来自 studio/SKILL.md）：实测绝不编造；只存草稿，不点发布；登录、扫码、验证由用户完成。

**初始化规则**：只要本节还有 `{{待填写}}`，在任何开发开始之前：

1. 与我讨论技术选型（语言、框架、测试框架、格式化与静态检查工具），给出建议和理由；
2. 我确认后填写本节，并把格式化、静态检查、测试的配置写入项目配置文件；
3. 以上完成后才开始开发。

## 2. 任务工作流程

每个开发任务按顺序执行，不跳步：

1. **查复用**：按第 3 节的顺序查找可用代码，动手前告诉我结论（用了什么，或为什么没有现成的可用）。
2. **写失败的测试**：先写测试并运行，确认它因功能缺失而失败。
3. **写实现**：只写让测试通过所需的最少代码。
4. **重构**：在测试保持通过的前提下改善结构。
5. **全量验证**：运行全部测试和格式化、静态检查。
6. **完成报告**：按第 6 节格式汇报。

## 3. 复用优先

按以下顺序查找，前一级没有合适的才进入下一级：

1. **公共仓库**：先读 CATALOG.md，有合适模块直接使用。
2. **开源社区**：有成熟、维护活跃、许可证合适的库，直接引入。
3. **改造相关代码**：公共仓库或开源社区中有功能相近的，拿来改造。
4. **从头开发**。

规则：

- 引入第三方依赖前说明：选择理由、维护状况、许可证。
- 改造开源代码时保留原许可证和出处说明；GPL 等要求衍生作品开源的许可证，使用前先告诉我。
- 第 3、4 级产出的模块必须按第 4 节标准编写，并在任务结束时列入沉淀提议。

## 4. 模块化标准

能独立成模块的功能一律模块化。可复用模块必须满足：

- 不依赖本项目的业务逻辑、全局状态或特定目录结构；
- 对外接口明确，内部实现可以替换而不影响调用方；
- 路径、密钥、参数等配置通过参数或配置文件传入，不写死在代码里；
- 自带 README（用途、接口、使用示例、依赖、来源与许可证）和测试；
- 集中在一个独立目录内，整个目录拷走即可在其他项目中使用。

## 5. 代码风格

- 遵循所用语言的社区主流规范；格式交给格式化工具处理，不手工调整。
- 每个文件、每个函数只做一件事；文件过长或职责过多时拆分。
- 命名表达意图，避免无意义的名称和不通用的缩写。
- 配置与代码分离。
- 不留下注释掉的代码、未使用的导入和调试输出。

## 6. 完成标准

声称“完成”之前必须真实运行验证。完成报告包含：

1. **改动内容**：新增和修改了哪些文件，各自的作用；
2. **验证证据**：实际运行的测试命令及其输出（通过数、失败数）；
3. **复用情况**：用了哪些现有模块或库，新写了什么；
4. **沉淀提议**：见第 7 节，没有则写“无”。

禁止：

- 未运行就说“应该可以”“理论上没问题”；
- 测试失败时修改测试去迁就实现（除非测试本身有错，须说明错在哪里并经我同意）；
- 跳过失败的测试，或降低断言标准使其通过。

无法运行验证时（缺环境、缺权限等），明确列出哪些部分未经验证。

## 7. 公共仓库沉淀

- 任务结束时列出建议沉淀的模块：名称、用途、来源（新开发或改造自哪里）、许可证、建议存放位置。
- 只提议，不直接写入公共仓库。
- 我确认后再写入，并同步更新 CATALOG.md。

## 8. 提示词与 skill 开发

涉及编写提示词、skill、agent 时：

1. 先读取 `/home/power/shared-repo/standards/prompt-engineering.md`，按其中的方法论执行；
2. 读取不到时停下来告诉我，不要凭经验自行发挥；
3. 采用评估用例先行：先写评估用例，再写提示词，最后逐条对照检查。

## 9. 改动边界

- 只修改与当前任务相关的代码。发现其他问题时记录下来告诉我，不顺手修改。
- 需求不明确时先问，不自行假设。
