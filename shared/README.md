# shared：工具包内部的共用代码（正本）

这里的文件是正本，各 skill 目录里存的是逐字相同的拷贝（第一行多一句「由 shared/… 同步而来」）。
skill 之间不互相引用，每个 skill 单独拷走就能用。

- 改共用代码：只改这里的正本，然后在工具包根目录跑 `node studio/scripts/st.mjs sync-shared`（装好后 `st sync-shared`）。
- 检查：`st sync-shared --check`；`st doctor` 和 studio 的测试也会检查，拷贝被手改会报出来。
- 拷贝放在哪：`manifest.json`（键：相对本目录的正本路径；值：相对仓库根的拷贝路径）。
- 测试：`node --test shared/tests/*.test.mjs`

## 模块

（每加一个模块，在这里写一节：用途、接口、谁在用、来源。）

### node/chrome.mjs

- 用途：找一个可用的 Chrome / headless shell（截图、页面检查用）
- 接口：`findChrome()`，顺序：环境变量 `CHROME_PATH` → HyperFrames / Puppeteer 已下载的 headless shell → 系统 Chrome
- 谁在用：image-cards（`ic render`）、video-director（`vd qa`）
- 来源：原 image-cards、video-director 各一份（代码相同）

### python/copy_format.py

- 用途：读发布文案 Markdown（`## 标题` / `## 正文` / `## 话题`）
- 接口：`parse_copy(path) → {"title", "paragraphs", "topics"}`；格式不对抛 `CopyFormatError`
- 谁在用：browser-draft（`bd run` 把它拼在步骤脚本前面）、phone-draft（`pd run`，从自己的 `lib/` 导入）
- 来源：原 browser-draft/lib，phone-draft 以前用相对路径借

### node/script-md.mjs

- 用途：读抖音 SCRIPT.md 的口播（sc 检查口播、kv 检查依据、vo 配音，三家同一套规则）
- 接口：`parseScript(md) → [{ frame, text, sentences, emotion, keywords, basis }]`
- 规则：`##` / `###` 标题带 `(Frame N)`（大小写不限）开一帧；4 个以上空格或 Tab 开头的行是口播，一行一句（`sentences`），`text` 是连起来；`**Emotion:**` / `**情感:**`、`**重点词:**` / `**Highlight:**`、`**依据:**` 是元数据（中英文冒号都行）；没有口播的帧不输出
- 谁在用：scenario-content（`sc check`）、knowledge-video（`kv check`、`kv status`）、voiceover（`vo`）
- 来源：原 vo `parseHfScript`、kv `parseScriptBasis`、sc `douyinLines` 三份，规则以 vo 为准（配音吃的是它）；sc 旧的「分镜表」写法删了
- 注意：vo 的配音缓存键含口播 `text`，改这里的规则可能让已有配音缓存失效（`shared/tests/script-md.test.mjs` 里有一条用 flow-check 02 真实稿子锁住）

### node/draft-run.mjs

- 用途：存草稿的公共部分——`--via` 选浏览器（bd）还是手机（pd），写载荷 JSON，调 `bd run` / `pd run`
- 接口：`takeVia(argv) → [via, rest]`（默认 browser）；`runDraft(via, steps, payload, { tmpPrefix })`，`steps` 是 `{ browser?, phone? }` 步骤脚本路径
- 报错：命令找不到说装哪个 skill；手机不可用（退出码 3）提示去掉 `--via phone`；其他失败「发草稿失败，看上面的输出」；没有该方式的步骤直接报错、不调命令
- 谁在用：wechat-article（`wa draft`）、image-cards（`ic draft`）、video-draft（`vdraft`）
- 来源：原三家各一份，报错文字已统一

### node/studio-info.mjs

- 用途：读作品项目 studio.json 的账号信息，账号名、目标观众、模板怎么领只在 studio.json 写一处
- 接口：`studioInfo(start) → { account, audience, lead }`，从 `start` 往上找；没写、括号占位、找不到都返回 `""`；JSON 坏了报错
- 谁在用：wechat-article（`wa` 的 account 默认值）、image-cards（`ic` 的角标默认 `@账号名`）
- 来源：新写（2026-10-17 全新走一次 B1：账号名要改 4 个文件）
