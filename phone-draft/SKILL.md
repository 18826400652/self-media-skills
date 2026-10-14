---
name: phone-draft
description: 通过 adb（uiautomator2）操作安卓手机上的 App，把做好的内容填进发布页并存成草稿，不点发布。
  提供 pd 命令和一组公共函数（打开 App、按文字 / 描述点击、等待、输入中文、富文本粘贴、推相册、截图），
  各平台的具体步骤写成脚本放在各自的 skill 里（如 wechat-article 的 phone_wechat.py）。
  当用户要「用手机发草稿」「自动存到 App 草稿箱」、手机连不上要重连，或要给某个 App 新写一个发草稿脚本时使用。
---

# phone-draft：用手机自动存草稿

```bash
pd devices                     # 检查手机：型号、电量、屏幕状态（断线会先用上次的地址自动重连）
pd connect [IP:端口]           # 无线重连并记住地址；不带参数用上次记住的
pd ui [名字]                   # 截图 + 列出界面上的文字 / 描述 / id（探索 App、写脚本时用）
pd run <步骤.py> [载荷.json]   # 执行一个平台的手机发草稿步骤
```

一般不直接用 `pd run`，而是用各平台命令，它们生成载荷后调用它（`--via browser` 改走 browser-draft 的浏览器方案）：

| 平台 | 命令 | 手机步骤脚本 |
|---|---|---|
| 公众号 | `wa draft 文章.md` | `wechat-article/scripts/phone_wechat.py`（公众号助手） |
| 抖音 | `nv draft 成片.mp4 --copy 发布文案.md` | `narrated-video/scripts/phone_douyin.py` |
| 小红书（视频） | `nv draft 成片.mp4 --copy 小红书/文案.md --to xiaohongshu` | `narrated-video/scripts/phone_xiaohongshu.py` |

小红书图文笔记（卡片图片）只有浏览器方案：`ic draft 文案.md`。

## 规则

- **只存草稿，永远不点发布。** `tap_text` / `tap_desc` / `tap_id` 拒绝点含「发表」「发布」「群发」「发作品」「日常」且不含「草稿」的按钮（抖音的发布键叫「发作品」，「限时日常」会直接发出）。唯一例外是 `tap_desc(…, allow_forbidden=True)`，只给描述叫「发布」的入口按钮（小红书底部「+」）用。
- **登录、扫码、验证由人完成**；锁屏时 `pd` 先唤醒，有锁屏密码就停下请人解锁。
- 失败时停在原地，不自动后退或放弃；截图和界面文字存到 `$TMPDIR/phone-draft/`（未设时 `/tmp/phone-draft/`），输出写清卡在哪一步。
- App 里有上次没编辑完的内容（如抖音「继续编辑作品吗？」）时点「存草稿」保留，不替人丢弃。
- 每一步都要核对：填进去的标题、正文读回比对（`check_readback`，被截断会明确报出来）；存草稿后看草稿箱数量有没有加一。
- 从相册选文件前用 `check_newest` 核对相册最新的几项就是刚推的文件：运行中进来新照片（截图、微信自动保存）会让格子错位，选到别人的照片，这时停下不选。
- 运行期间临时把自动熄屏调到 30 分钟（等视频导入、图片上传时没有触摸），退出时改回原值。
- 视频、图片推到手机 `DCIM/phone-draft/`，存草稿成功后清理（三个 App 存草稿时都会把文件复制进自己的草稿箱，实测删掉相册文件后草稿仍可播放）。

## 前提

- 手机打开开发者选项（设置 → 关于手机 → 连点版本号 7 次）和「无线调试」，和电脑连同一个网络（或电脑能访问到手机 IP）。
- 第一次配对：「无线调试 → 使用配对码配对设备」，在弹窗还开着时 `adb pair IP:配对端口 配对码`；再 `pd connect IP:连接端口`（连接端口在无线调试页顶部，和配对端口不同）。
- **手机重启、换网络或重开无线调试后，IP 和端口都会变**：到无线调试页看新地址，`pd connect IP:新端口`。没变时 `pd` 断线会自动用上次地址重连。电脑和手机不在同一子网时，局域网自动发现（mDNS）用不了。
- 第一次连接时 uiautomator2 会往手机装 ATX 辅助 App，Flyme 弹「允许安装」时点允许。
- 富文本粘贴需要手机上装 Edge（它开放 `chrome_devtools_remote` 调试接口）。
- 依赖：`cd skills/phone-draft && uv venv .venv && uv pip install --python .venv/bin/python -r requirements.txt`（国内网络慢时加 `-i https://mirrors.aliyun.com/pypi/simple/`）。依赖 browser-draft 的 `lib/copy_format.py`（发布文案解析），两个 skill 要放在同一个 skills 目录下。

## 写一个新 App 的步骤脚本

步骤脚本是普通 Python，开头 `from phone_draft import *`，`pd run` 设好载荷后执行它。先用 `pd ui` 一页页走一遍，记下每一步的文字、描述或 id。

| 函数 | 作用 |
|---|---|
| `PAYLOAD` | 载荷 JSON（标题、正文、文件路径等，由平台命令生成） |
| `read_copy(路径)` | 读发布文案（`## 标题` / `## 正文` / `## 话题`），格式错误直接 `fail` |
| `device()` | uiautomator2 的设备对象（第一次调用时连接、检查亮屏） |
| `open_app(包名)` | 冷启动 App |
| `text_exists(文字, contains)` / `wait_text(文字, timeout, contains, what)` | 判断 / 等待文字出现，超时留现场并 `fail` |
| `tap_text(文字)` / `tap_desc(描述)` / `tap_id(id)` | 按文字 / 无障碍描述 / resource-id 点击，带「只存草稿」保护 |
| `dismiss([文字…])` | 依次关掉功能介绍类弹窗 |
| `type_text(文字)` | 向当前焦点输入（支持中文和 emoji） |
| `hide_keyboard()` | 键盘弹着时按返回收起；没弹时不按（直接按返回会退出编辑页） |
| `check_readback(期望, 实际, 名称)` | 读回比对，被截断时明确报出 |
| `paste()` | 粘贴（keyevent 279） |
| `paste_html(html, back_to, focus)` | 手机 Edge 复制富文本 → 切回 `back_to` 包 → `focus()` → 光标移到末尾 → 粘贴；大内容自动缩图、分段 |
| `push_media([路径…])` / `check_newest(推上去的路径)` / `clean_media()` | 按顺序推进相册（最新的排在相册最前，返回手机上的路径）/ 选格子前核对相册最新几项就是它们 / 清理 |
| `ui_texts()` | 界面上所有文字 / 描述 / id / 位置 |
| `shot(名字)` / `fail_with_ui(说明)` / `log()` / `fail()` | 截图、留现场后退出、输出进度、出错退出 |

`phone_draft.html_parts` 还有 `split_images`（按图片切开 HTML）、`save_data_uri`（内联图写成文件），给只能从相册插图的编辑器用；`text_length` / `body_complete` 用 App 显示的字数核对正文有没有粘贴全。

## 踩过的坑

- **抖音、小红书的 resource-id 是混淆过的**（`0+t`、`0_resource_name_obfuscated`），会随版本变：按文字和无障碍描述找控件。很多按钮的文字其实在 content-desc 里（抖音「相册」「返回」），`tap_text` 找不到时用 `tap_desc`。
- 同一个描述在不同页面意思不同：抖音首页的「拍摄，按钮」是「+」，进了拍摄页就是录制键，只能在首页点一次。
- **成功提示是 toast 时读不到**（抖音「已保存」）：改看草稿箱数量（抖音「我」页「本地草稿箱，N个草稿」，小红书「草稿箱·N」）。
- 存草稿可能还有一层确认框（小红书「确认保存笔记至草稿箱吗？」）：只在确认框文字里有「草稿箱」时点「确定」。
- **Android 剪贴板一次只能放约 1MB**，超了静默丢弃（剪贴板里还是旧内容）：`paste_html` 先把大图转 JPEG，再按根元素的子节点分段粘贴。
- 手机 Edge 不支持 `/json/new`：用浏览器级的 `Target.createTarget` 开标签页。本机端口要绕开 `http_proxy`。
- **公众号助手**：正文编辑器是 WebView，粘贴的富文本样式能保留，但内联图片上传失败（「上传失败，网络异常」，有失败图片时还不让退出编辑）——图片改用工具栏「插入图片」从相册插入（格子右上角 `check_view` → `tv_next`）；插图后编辑器失去焦点，点工具栏「切换键盘」`iv_keyboard` 把焦点还回去再粘贴；标题框 `title_edit_text` 只在滚到最顶上时才在界面里；编辑器会自动保存，首页「草稿」一行显示最新草稿的标题。
- 相册网格刚打开时还在加载，马上点会点空：等 1–2 秒，点完确认「下一步 / 确定」按钮出现再继续。
- `python -m phone_draft.cli` 启动时包已导入、`PAYLOAD` 已读过：`pd run` 原地刷新这个字典，步骤脚本拿到的才是本次载荷。
- 锁屏判断：`dumpsys power` 的 `mWakefulness`（Flyme 熄屏是 `Dozing`），`dumpsys window` 的 `isKeyguardShowing=true`。
