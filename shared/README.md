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
