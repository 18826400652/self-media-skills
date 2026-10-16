# 公共零件收拢（子项目 2）

> 视频流水线重组的子项目 2。子项目 1 见 `2026-10-16-video-pipeline-restructure-design.md`（已合并）。

## 1. 背景和目标

几个 skill 各自存了一份做同一件事的代码，已经开始走样：

| 零件 | 现在 | 问题 |
|---|---|---|
| SCRIPT.md 解析 | vo `parseHfScript`、kv `parseScriptBasis`、sc `douyinLines` 各一份 | 规则不一样：sc 只认大写 `(Frame N)`、正好 4 个空格缩进；vo、kv 不分大小写、4 个以上空格或 Tab。同一份 SCRIPT.md 可能 vo 能配音、sc 说没有口播 |
| 按 `--via` 调 bd/pd 存草稿 | wa、ic、vdraft 各一份 `takeVia` + `runDraft` | 三份几乎一样，报错文字已经不一样 |
| 找 Chrome | image-cards、video-director 各一份 `chrome.mjs` | 代码一样，只差第一行注释；靠人记得同步 |
| 发布文案解析 `copy_format.py` | 只在 browser-draft | phone-draft 用相对路径 `../browser-draft/lib` 借（`bin/pd` 的 PYTHONPATH、`tests/conftest.py`），phone-draft 单独拷走就坏 |

**决定**（用户已确认）：

- 每个 skill 保持「单独拷走就能用」，共用代码不能靠相对路径引用兄弟目录（A）。
- 做法：拷贝 + 一致性检查（A1）。正本放仓库根目录 `shared/`，各 skill 存一份逐字相同的拷贝，用同步命令和测试保证一致。

**成功标准**：

- 四个零件各只有一份正本，所有拷贝和正本逐字一致，测试和 `st doctor` 能发现不一致。
- phone-draft 不再引用 `../browser-draft`。
- SCRIPT.md 在 sc、kv、vo 里按同一套规则读。
- 全部测试通过，flow-check 02 的 `vo --check` 照常通过。

## 2. `shared/` 和同步机制

```
shared/
  README.md               每个模块：用途、接口、谁在用、来源
  manifest.json           正本 → 拷贝位置
  node/script-md.mjs
  node/draft-run.mjs
  node/chrome.mjs
  python/copy_format.py
  tests/*.test.mjs        正本的测试（node --test shared/tests/*.test.mjs）
```

`manifest.json`：

```json
{
  "node/script-md.mjs": [
    "scenario-content/scripts/lib/shared/script-md.mjs",
    "knowledge-video/scripts/lib/shared/script-md.mjs",
    "voiceover/scripts/lib/shared/script-md.mjs"
  ],
  "node/draft-run.mjs": [
    "wechat-article/scripts/lib/shared/draft-run.mjs",
    "image-cards/scripts/lib/shared/draft-run.mjs",
    "video-draft/scripts/lib/shared/draft-run.mjs"
  ],
  "node/chrome.mjs": [
    "image-cards/scripts/lib/shared/chrome.mjs",
    "video-director/scripts/lib/shared/chrome.mjs"
  ],
  "python/copy_format.py": [
    "browser-draft/lib/copy_format.py",
    "phone-draft/lib/copy_format.py"
  ]
}
```

拷贝 = 一行固定的说明 + 正本全文：

- `.mjs`：`// 由 shared/<正本路径> 同步而来，不要在这里改：改正本后跑 st sync-shared`
- `.py`：同一句，前缀换成 `#`

`browser-draft/lib/copy_format.py` 保持原路径（`bd run` 拼接脚本时按这个路径读），只是变成拷贝。

命令（studio）：

- `st sync-shared`：按 manifest 把正本写到各拷贝位置（建好目录），打印更新了哪些文件；内容没变的不写。
- `st sync-shared --check`：只比对，不写；有不一致或缺文件时逐个列出，退出码 1。
- `st doctor`：工具包检查里跑一次 `--check`，不一致报 ✗，提示「改正本后跑 st sync-shared」。

`shared/` 不是 skill（没有 `SKILL.md`），`st install` 不注册它。`shared/` 只给本工具包用；`chrome.mjs` 是否沉淀到公共仓库 `/home/power/shared-repo` 在完成报告里另提，用户确认后再做（CLAUDE.md 第 7 节）。

## 3. 四个模块

### 3.1 `node/script-md.mjs`

接口：`parseScript(md) → [{ frame, text, sentences, emotion, keywords, basis }]`

规则（以 vo 现在的读法为准，配音吃的是它）：

- 标题行：`##` 或 `###` 开头，里面有 `(frame N)`，大小写不限 → 开一帧，`frame = N`（数字）
- 口播行：以 4 个以上空格或一个 Tab 开头 → `sentences` 加一句（去首尾空白），`text` 是 `sentences` 直接连接
- 元数据行（以 `**` 开头，不算口播）：
  - `**Emotion:**` / `**情感:**`（冒号中英文都行）→ `emotion`（第一个非空白词），没有是 `""`
  - `**重点词:**` / `**Highlight:**` → `keywords`（按 `、` `,` `，` 空白切开，去空），没有是 `[]`
  - `**依据:**` → `basis`（去首尾空白的原文），没有是 `null`
- 第一个标题之前的内容忽略；没有口播的帧不输出
- 兼容 `\r\n`

使用方改成调它：

- vo：`parseHfScript` 删掉，用 `parseScript`（取 `frame`、`text`、`emotion`、`keywords`）
- kv：`parseScriptBasis` 删掉，用 `parseScript`（取 `frame`、`text`、`basis`）；`isScriptFilled` 等调用方跟着改
- sc：`douyinLines` 删掉，用 `parseScript`（取 `frame`、`text`、`emotion`、`sentences`；原来的 `n` 字段改用 `frame`）。**删掉旧的「分镜表」写法**（表头含「口播…」「情感…」列的 `脚本.md`）：template 做法已删、self-media 已删，没有使用者
- sc 的行为会变：小写 `frame`、`###`、Tab 缩进、5 个以上空格缩进的口播现在也能读到

### 3.2 `node/draft-run.mjs`

接口：

- `takeVia(argv) → [via, rest]`：取出 `--via browser|phone`，默认 `browser`；值不对报 `--via 只能是 browser 或 phone，收到：<值>`
- `runDraft(via, steps, payload, { tmpPrefix })`：
  - `steps` 是 `{ browser?: 步骤脚本路径, phone?: 步骤脚本路径 }`；没有 `steps[via]` 时报 `这个平台没有 --via <via> 的步骤（可用：<有的方式>）`，不调命令
  - 把 `payload` 写进临时目录的 `payload.json`（目录前缀 `tmpPrefix`，如 `wa-draft-`）
  - 调 `bd run <步骤> <payload.json>`（browser）或 `pd run …`（phone），输出直接给终端
  - 报错统一：
    - 命令找不到：`需要 bd 命令（skills/browser-draft，软链接到 PATH）`（phone 时是 pd / phone-draft）
    - phone 且退出码 3：`手机不可用（见上面的提示）；去掉 --via phone 改用浏览器`
    - 其他非 0：`发草稿失败，看上面的输出`

使用方：wa、ic、vdraft 删掉各自的 `VIA`、`VIA_SKILL`、`EXIT_NO_DEVICE`、`takeVia`、`runDraft`、写载荷文件的代码，改调共用模块。各自的参数（vdraft 的 `--to`、`--cover`，ic 的 `--images`）、步骤脚本表、载荷内容不变。

行为变化：wa、ic、vdraft 的手机不可用提示文字统一。ic 在 `main()` 里先拒绝 `--via phone`（提示小红书手机端改用 `vdraft`），这个 ic 自己的提示保留。

### 3.3 `node/chrome.mjs`

内容就是现在两份里相同的代码，第一行注释统一为「查找可用的 Chrome：优先 CHROME_PATH，其次复用 HyperFrames / Puppeteer 已下载的 headless shell，最后找系统 Chrome。」。image-cards 的 `ic.mjs`、video-director 的 `inspect-page.mjs` 改从 `./shared/chrome.mjs`（或对应相对位置）导入；原来的 `scripts/lib/chrome.mjs` 删掉。

### 3.4 `python/copy_format.py`

内容不变（正本从 `browser-draft/lib/copy_format.py` 搬来）。

- browser-draft：`lib/copy_format.py` 变成拷贝，`bd run` 不变
- phone-draft：新增 `lib/copy_format.py` 拷贝；`bin/pd` 的 PYTHONPATH 去掉 `$SKILL_DIR/../browser-draft/lib`；`tests/conftest.py` 去掉把 `browser-draft/lib` 加进 `sys.path` 的那行

## 4. 出错时怎么办

- `st sync-shared`：manifest 里的正本不存在 → 报错退出，一个文件都不写；拷贝所在的 skill 目录不存在 → 报错（不凭空建 skill）
- `st sync-shared --check`：列出每个不一致的拷贝（「内容不同」或「缺文件」），退出码 1
- 拷贝被手改：studio 的一致性测试失败，提示改正本后跑 `st sync-shared`

## 5. 测试

先写失败的测试。

- `shared/tests/script-md.test.mjs`：标题大小写、`##` / `###`、4 个以上空格和 Tab 缩进、多行口播（`sentences` 和 `text`）、三种元数据（中英文冒号）、第一个标题前的内容、没有口播的帧、`\r\n`；用 flow-check 02 的真实 SCRIPT.md 当夹具（拷进 `shared/tests/fixtures/`），结果的 `frame`、`text`、`emotion`、`keywords` 和 vo 现在的 `parseHfScript` 逐帧一致
- `shared/tests/draft-run.test.mjs`：用假的 bd / pd（写进 PATH 的临时脚本）测 `takeVia` 默认值和非法值、`runDraft` 写出的载荷、调用参数、三种报错、没有该方式的步骤时不调命令
- 各 skill 现有测试继续通过；sc 改两处：删「分镜表」用例，加「小写 frame、Tab 缩进也能读」用例
- browser-draft、phone-draft 的 pytest 继续通过；phone-draft 加一条：`sys.path` 里没有 `browser-draft/lib` 也能 `import copy_format`
- studio：`st sync-shared` 写拷贝（带说明行）、内容没变不重写、`--check` 发现内容不同和缺文件、正本不存在时一个都不写；`st doctor` 不一致时报 ✗；一致性测试：仓库里所有拷贝和正本一致
- 守护：`phone-draft/` 下的代码不再出现 `browser-draft/lib`

## 6. 验收

- 全部测试通过：各 skill（node --test、pytest）、`node --test shared/tests/*.test.mjs`
- `st sync-shared --check` 退出码 0；`st doctor` 无 ✗
- `pd devices`、`bd tabs` 能起来（有没有设备、浏览器都行，看到的是正常结果或正常的「没有设备 / 连不上」，不是 import 报错）
- flow-check 02：`vo 04-作品/流程测试/02-导演做法/抖音 --check` 通过；`sc check 04-作品/流程测试/02-导演做法` 结果和改之前一致或只多出因规则放宽而读到的口播
- CLAUDE.md 第 1 节：目录结构加 `shared/`（正本 + 同步），测试命令加 `node --test shared/tests/*.test.mjs`，说明改共用代码要改正本再 `st sync-shared`

## 7. 不在范围内

- sc 检查标题长度时取发布文案「## 标题」的小正则（JS，只用到标题一个字段）
- 把 `chrome.mjs` 写进公共仓库（只在完成报告里提议）
- 其他没发现重复的代码
