# 手机发草稿（phone-draft）设计

日期：2026-10-13

## 目标

把抖音、小红书、公众号的「自动存草稿」从浏览器改成**通过 adb 操作安卓手机上的 App**。脚本把内容填好、存成草稿；正式发布由用户在手机上检查后手动点。

成功标准：跑一条命令（`wa draft` / `ic draft` / `nv draft`），手机上对应 App 的草稿箱里出现填好的内容，用户检查后可以直接发布。

## 已验证的前提（2026-10-12 实测）

- 手机：魅族 20，Flyme 12.6，Android 16，1080×2400。WSL 里的 adb（34.0.5）通过**无线调试**连接：`adb pair` 配对一次，之后 `adb connect IP:端口`（手机重启或换网络后端口会变，只需重新 connect）。
- 已装 App：抖音 `com.ss.android.ugc.aweme`、小红书 `com.xingin.xhs`、公众号助手 `com.tencent.mp`（登录账号「小白个人成长」= AI 主号）、Edge。
- `screencap`、`uiautomator dump`、`input` 都可用。
- 公众号助手的文章编辑器是 WebView，未开放调试；但**粘贴富文本能保留样式**：手机 Edge 打开 `wa preview` 的 预览.html → 「复制到公众号」→ 编辑器里粘贴，小节标题、引用框、高亮、粗体、分隔线全部保留。
- 图片地址是电脑本地地址时，公众号助手报「N 处图片上传失败」，并且**不允许带着失败图片离开编辑器**（只能删掉内容或放弃编辑）。
- 手机 Edge 开放 `chrome_devtools_remote`（localabstract socket），可以 `adb forward` 后用 CDP 驱动它写剪贴板。

## 决定

| 问题 | 决定 |
|---|---|
| 连接方式 | 无线调试 |
| 浏览器方案 | 保留，作为后备；默认走手机，`--via browser` 切回浏览器 |
| 操作手机的方式 | uiautomator2（Python），手机上会自动装 ATX 辅助 App |
| 公众号 | 也走手机（公众号助手），正文用「手机 Edge 复制 → 粘贴」带样式 |
| 手机不可用时 | 报错并提示 `pd connect` 或 `--via browser`，**不悄悄回落**到浏览器 |

## 架构

### 新 Skill：`skills/phone-draft`（命令 `pd`）

与项目无关，和 `browser-draft` 并列。软链接到 `~/.claude/skills/`，`bin/pd` 放到 PATH。

```
pd devices                     # 检查手机：型号、电量、是否亮屏
pd connect [IP:端口]           # 无线重连；不带参数用上次记住的地址
pd run <步骤.py> [载荷.json]   # 执行一个平台的手机发草稿步骤
```

`pd run` 把 `lib/pd.py` 拼在步骤脚本前面，用 skill 自己的 `.venv`（uiautomator2）执行，载荷路径经环境变量传入。

`lib/pd.py` 公共函数（命名尽量和 `bd.py` 对齐）：

| 函数 | 作用 |
|---|---|
| `PAYLOAD` | 载荷 JSON |
| `open_app(包名)` | 冷启动 App 到首页 |
| `tap_text(文字)` | 按文字点击；文字属于「发表 / 发布 / 群发 / 立即发布 / 定时发布」时拒绝 |
| `wait_text(文字, timeout)` | 等文字出现，超时 `fail` |
| `text_exists(文字)` | 当前界面有没有这段文字（判断弹窗、报错、成功提示） |
| `dismiss([文字…])` | 关掉功能介绍类弹窗，只点「我知道了」「稍后」一类 |
| `set_text(选择器, 文字)` | 给输入框填中文，读回校验 |
| `paste_html(html)` | 手机 Edge 载入 HTML 并复制到剪贴板 → 切回原 App → 粘贴 |
| `push_media(路径列表)` | 推到 `DCIM/phone-draft/`，触发媒体扫描，返回手机路径 |
| `clean_media()` | 删掉 `DCIM/phone-draft/` 里的文件并刷新相册 |
| `read_copy(路径)` | 读发布文案；复用 browser-draft 的解析（抽成共享模块，不复制代码） |
| `shot(名字)` / `log()` / `fail()` | 截图、进度、出错退出（附截图 + 界面文字） |

### 平台步骤脚本（放在各平台 skill 里，和浏览器脚本并列）

- `wechat-article/scripts/phone_wechat.py`
- `image-cards/scripts/phone_xiaohongshu.py`
- `narrated-video/scripts/phone_douyin.py`

### 入口改动

`wa draft`、`ic draft`、`nv draft` 加 `--via phone|browser`（默认 `phone`）。载荷格式不变，按 `--via` 选择 `pd run phone_*.py` 或 `bd run draft_*.py`。公众号的账号名写进 `wechat-article.config.json` 的 `account`。

## 各平台流程

具体按钮、页面在实现时逐个探明；每一步都要核对结果。

**公众号（公众号助手）**
1. 打开 App，读首页账号名，和配置 `account` 不一致就停。
2. 文章 → 写新文章 → 填标题（读回）。
3. `wa render` 的 HTML 把本地图片转成 data URI → `paste_html` → 检查没有「图片上传失败」、字数合理。若 data URI 也失败，后备：图片推进相册，用编辑器的插图按钮在对应位置补上。
4. 「下一步」里设置封面、作者（能做多少实测确认）。
5. 保存 → 草稿列表里出现该标题。

**小红书**
1. `push_media` 按文件名顺序推卡片图片。
2. 打开 App → 「+」→ 相册按顺序选图 → 下一步。
3. 填标题、正文、话题（读回）。
4. 点「存草稿」→ 看到保存成功提示。

**抖音**
1. `push_media` 推成片。
2. 打开 App → 「+」→ 相册 → 选视频 → 下一步。
3. 填作品描述（标题 + 正文 + #话题，读回）。
4. 点「存草稿」→ 看到保存成功提示。确认 App 草稿箱是否有「只能一份」的限制；有的话先检查，已有就停。

## 规则

- 只存草稿，永远不点发布（`tap_text` 层面拒绝）。
- 登录、扫码、验证、开通功能：停下交给用户。相册权限这类必要授权可以点允许。
- 失败时停在原地，不自动后退或放弃；输出卡在哪一步、截图和界面文字存到 `$TMPDIR/phone-draft/`。
- 相册文件：草稿保存成功后清理；如果实测发现 App 存草稿后仍引用原文件，改为下次运行时清理上一次的文件。

## 测试

- 单元测试（不需要手机）：拒绝发布类按钮、发布文案解析、HTML 图片转 data URI、`--via` 分支和「手机不可用时报错不回落」。
- 真机验收：用现有作品（如 `04-作品/普通人的AI课/05-一条消息`）三个平台各跑一遍，关键节点截图检查，最后用户在手机上确认草稿。测试草稿是否删除由用户决定。

## 不做

- 自动点发布、定时发布。
- 多台手机、多账号切换。
- iOS。
