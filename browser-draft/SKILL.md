---
name: browser-draft
description: 在用户已登录的浏览器（Edge / Chrome）里，把做好的内容自动填进各平台的发布页并存成草稿，不点发布。 提供 bd 命令和一组公共函数（切标签页、等元素、按文字点击、粘贴富文本、上传文件、截图）， 各平台的具体步骤写成脚本放在各自的 skill 里（如 wechat-article 的 wa draft）。 当用户要「自动发草稿」「用浏览器帮我发到某平台草稿箱」，或要给某个平台新写一个发草稿脚本时使用。
---

# browser-draft：用浏览器自动存草稿

> 各平台命令默认改走手机（phone-draft 的 `pd`），本 skill 作为 `--via browser` 的后备；小红书图文笔记（`ic draft`）只有浏览器方案。发布文案解析在 `lib/copy_format.py`，phone-draft 也用它。

```bash
bd tabs                          # 检查能否连上浏览器，列出标签页
bd run <步骤.py> [载荷.json]      # 执行一个平台的发草稿步骤
```

一般不直接用 `bd`，而是用各平台 skill 的命令，它们生成载荷后调用 `bd run`：

| 平台 | 命令 | 步骤脚本 |
|---|---|---|
| 公众号 | `wa draft 文章.md --via browser` | `wechat-article/scripts/draft_wechat.py` |
| 小红书 | `ic draft 文案.md` | `image-cards/scripts/draft_xiaohongshu.py` |
| 抖音 | `nv draft 成片.mp4 --copy 发布文案.md --via browser` | `narrated-video/scripts/draft_douyin.py` |

## 规则

- **只存草稿，永远不点发布。** `click_text` 拒绝点「发表」「发布」「群发」等按钮；发布由人在预览确认后操作。
- **登录由人完成。** 页面要求登录、扫码或验证时，步骤脚本 `fail()` 退出并说明，不碰账号密码。
- 每个关键步骤都要能验证（等到元素出现、读回填进去的值），关键节点 `shot()` 截图。
- 平台的功能介绍弹窗只点「我知道了」「稍后再说」一类，不开通任何东西。
- `paste_html` 在编辑器不认合成粘贴时（如公众号）会改用系统剪贴板，覆盖用户剪贴板里原来的内容。

## 前提

- 已安装 [browser-harness](https://github.com/browser-use/browser-harness)（`browser-harness` 在 PATH 上）。
- 浏览器开启远程调试：Edge 打开 `edge://inspect/#remote-debugging`，Chrome 打开 `chrome://inspect/#remote-debugging`，勾选允许；第一次连接时浏览器会弹「Allow remote debugging?」，点允许。
- `bd` 自动找最近启动的浏览器（WSL 下也会找 Windows 上的 Edge / Chrome），也可以用 `BU_CDP_WS` 指定。

## 写一个新平台的步骤脚本

步骤脚本是普通 Python，`bd run` 会把 `lib/bd.py` 拼在前面，交给 browser-harness 执行，所以可以直接用 browser-harness 的 helpers 和下面这些函数：

| 函数 | 作用 |
|---|---|
| `PAYLOAD` | 载荷 JSON（标题、正文、文件路径等，由平台命令生成） |
| `open_tab(url, reuse)` | 切到 URL 含 `reuse` 的已有标签页，没有就新开。**每次都要先切**：browser-harness 每次连上的标签页不固定 |
| `find_tab(url_part)` | 找标签页 id |
| `wait_until(js表达式, timeout, what)` | 等到条件成立，超时就 `fail` |
| `click_text(文字, host=None)` | 点击文字完全匹配的可见按钮；按钮在自定义元素的 shadow DOM 里时传 `host` 选择器 |
| `visible_text_exists(文字)` | 页面上有没有这段可见文字（判断弹窗、报错、成功提示） |
| `dismiss([文字…])` | 依次关掉功能介绍弹窗 |
| `set_editable_text(选择器, 文字)` | 给 contenteditable 编辑器换成纯文本 |
| `paste_html(选择器, html)` | 富文本粘贴进编辑器（先合成粘贴，不行再用真实剪贴板 + Ctrl+V；大内容分块传） |
| `upload(选择器, 路径)` | 给文件输入框设置本地文件（WSL → Windows 浏览器时自动转路径） |
| `read_copy(路径)` | 读发布文案（`## 标题` / `## 正文` / `## 话题`），各平台共用这个格式 |
| `shot(名字)` / `log()` / `fail()` | 截图、输出进度、出错退出 |

踩过的坑（写新脚本时注意）：
- `paste_html` 先试合成的 `paste` 事件（tiptap 等认，不碰剪贴板），内容没变再走真实剪贴板（公众号编辑器只认这个）。
- 浏览器窗口不在前台时，`navigator.clipboard.write` 会一直挂起：要先 `Emulation.setFocusEmulationEnabled`（`paste_html` 已处理）。
- 按钮在闭合 shadow DOM 里时 DOM 查不到文字（小红书的「暂存离开 / 发布」在 `xhs-publish-btn` 里，shadow root 挂在 `_sr`）。用 `click_text(…, host=…)` 按文字点，**不要按坐标点**：保存和发布按钮挨在一起，点偏就发出去了。
- 普通输入框里逐字按键（browser-harness 的 `fill_input`）可能把中文打两遍；直接改 `value` 框架又不认。可靠做法：`el.select()` → `cdp("Input.insertText")` → 补一个 keyup → 失焦，再读回校验。
- CDP 的 `Input.dispatchMouseEvent` 悬停在有些页面会卡住，悬停菜单改用 JS 派发 `mouseover`。
- 判断「保存成功」「上传完成」要找页面明确的提示，并区分失败：抖音的「重新上传」在失败时也会出现，要看「上传成功 / 上传失败」。
- 平台只保留一份未发布内容时（抖音），脚本要先检查有没有，有就停下，不能替人「放弃」。
