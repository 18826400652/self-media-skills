---
name: phone-draft
description: 通过 adb（uiautomator2）操作安卓手机：把做好的内容填进抖音、小红书、公众号助手存成草稿（不点发布，各平台命令的 --via phone 备用方案）；
  在 DeepSeek、豆包 App 里自动提问并录屏做实测（pd rec，输出和 sc rec 同格式的 mp4 / json / txt）。
  提供 pd 命令和一组公共函数（打开 App、按文字 / 描述点击、等待、输入中文、富文本粘贴、推相册、截图），
  各平台的发草稿步骤写成脚本放在各自的 skill 里（如 wechat-article 的 phone_wechat.py）。
  当用户要「用手机发草稿」「用手机录 AI 实测」、手机连不上要重连，或要给某个 App 新写脚本时使用。
---

# phone-draft：用手机自动存草稿

```bash
pd devices                     # 检查手机：型号、电量、屏幕状态（断线会先用上次的地址自动重连）
pd connect [IP:端口]           # 无线重连并记住地址；不带参数用上次记住的
pd ui [名字]                   # 截图 + 列出界面上的文字 / 描述 / id（探索 App、写脚本时用）
pd run <步骤.py> [载荷.json]   # 执行一个平台的手机发草稿步骤
pd rec deepseek|doubao <提问.txt> <输出.mp4> [--think] [--search] [--timeout 300]
                               # 在 AI App 里提问并录屏，输出 .mp4 / .json / .txt（和 sc rec 同格式）
```

各平台命令默认走浏览器（browser-draft）；加 `--via phone` 时生成载荷后调用 `pd run`：

| 平台 | 命令 | 手机步骤脚本 |
|---|---|---|
| 公众号 | `wa draft 文章.md --via phone` | `wechat-article/scripts/phone_wechat.py`（公众号助手） |
| 抖音 | `vdraft 成片.mp4 --copy 发布文案.md --via phone` | `video-draft/scripts/phone_douyin.py` |
| 小红书（视频） | `vdraft 成片.mp4 --copy 小红书/文案.md --to xiaohongshu --via phone` | `video-draft/scripts/phone_xiaohongshu.py` |

小红书图文笔记（卡片图片，项目不走图文时用不到）只有浏览器方案：`ic draft 文案.md`。

## 规则

- **只存草稿，永远不点发布。** `tap_text` / `tap_desc` / `tap_id` 拒绝点含「发表」「发布」「群发」「发作品」「日常」且不含「草稿」的按钮（抖音的发布键叫「发作品」，「限时日常」会直接发出）。唯一例外是 `tap_desc(…, allow_forbidden=True)`，只给描述叫「发布」的入口按钮（小红书底部「+」）用。
- **登录、扫码、验证由人完成**；锁屏时 `pd` 先唤醒，有锁屏密码就停下请人解锁。
- 失败时停在原地，不自动后退或放弃；截图和界面文字存到 `$TMPDIR/phone-draft/`（未设时 `/tmp/phone-draft/`），输出写清卡在哪一步。
- App 里有上次没编辑完的内容（如抖音「继续编辑作品吗？」）时点「存草稿」保留，不替人丢弃。
- 每一步都要核对：填进去的标题、正文读回比对（`check_readback`，被截断会明确报出来）；存草稿后看草稿箱数量有没有加一。
- 从相册选文件前用 `check_newest` 核对相册最新的几项就是刚推的文件：运行中进来新照片（截图、微信自动保存）会让格子错位，选到别人的照片，这时停下不选。
- 运行期间临时把自动熄屏调到 30 分钟（等视频导入、图片上传时没有触摸），退出时改回原值。
- 视频、图片推到手机 `DCIM/phone-draft/`，存草稿成功后清理（三个 App 存草稿时都会把文件复制进自己的草稿箱，实测删掉相册文件后草稿仍可播放）。

## 录 AI 实测（pd rec）

一般用 `sc rec <输出.mp4> --prompt 提问.txt --app deepseek|doubao`，它调用 `pd rec`。每一轮：

1. **隐私检查，不过就不录**：勿扰模式没开就停下（录屏会录到弹出的通知）；进不了空白新对话就停下（豆包新对话里出现不认识的文字也停下，报错只露每段开头几个字）。豆包新对话要从侧边栏进，侧边栏有历史标题，所以录屏在进了新对话之后才开始。
2. 设模型开关：DeepSeek 的「深度思考」「智能搜索」默认关，`--think` / `--search` 打开；App 会记住上次的开关，所以每轮都读一遍、不对就点、再核对；录完改回用户原来的设置。豆包没有这两个开关。打字（uiautomator2 经剪贴板粘贴）和「复制」会改手机剪贴板，录完（包括中途失败）放回原来的内容。提问文件的 Windows 换行（\r\n）读入时统一成 \n；不认识的参数直接报错。
3. 开始录屏（scrcpy，无窗口、无声音、mkv），2 秒后点输入框分段打字（每段至少 2 字、整段最多 40 次，换行按回车）。输完读回输入框和提问比对，不一致不发送。
4. 点发送，5 秒内输入框要清空，否则报「没发出去」。
5. 每秒读一次界面文字：出现提问以外的新文字、连续 3 次不变才算回答结束（DeepSeek 还要输入栏右下角变回「切换至语音」——生成时那里是停止键）。超过 `--timeout` 秒就停下，原始录屏留在 `<输出>.raw.mkv`。
6. 多录 2 秒后停止，转码：裁掉顶部 120 像素状态栏 → 缩到高 1920 → 左右补边到 1080（颜色取画面左边缘，浅色 App 是白色）。
7. 录屏停了以后，DeepSeek 滑到回答末尾点「复制」读剪贴板，完整回答附在 `.txt` 的「## 复制的完整回答」下（界面文字只有屏幕上那一段）。豆包的复制按钮没有描述，长回答只有屏幕上的部分。

输出：`.json` 的 `pastedAt` 是开始打字的时刻（长提问打字较久，剪辑时可加速）；`device: "phone"`，还记了 `app`、`think`、`search`。长回答 App 不会自己往下滚，视频里只看得到回答开头。

## 前提

- 手机打开开发者选项（设置 → 关于手机 → 连点版本号 7 次）和「无线调试」，和电脑连同一个网络（或电脑能访问到手机 IP）。
- 第一次配对：「无线调试 → 使用配对码配对设备」，在弹窗还开着时 `adb pair IP:配对端口 配对码`；再 `pd connect IP:连接端口`（连接端口在无线调试页顶部，和配对端口不同）。
- **手机重启、换网络或重开无线调试后，IP 和端口都会变**：到无线调试页看新地址，`pd connect IP:新端口`。没变时 `pd` 断线会自动用上次地址重连。电脑和手机不在同一子网时，局域网自动发现（mDNS）用不了。
- **WSL 里优先用无线调试**。WSL 的 adb 看不到 USB 线连的手机；从 WSL 调 Windows 的 `adb.exe` 会报 `failed to start daemon`。真要走 USB：在 Windows 用 usbipd 把手机转进 WSL（要管理员权限），而且手机正在做「USB 网络共享」给电脑上网时，转进 WSL 后电脑会断网——这种情况只能用无线调试。富文本粘贴要的「USB 调试」开关打开就行，不用真插线。
- 第一次连接时 uiautomator2 会往手机装 ATX 辅助 App，Flyme 弹「允许安装」时点允许。
- 富文本粘贴需要手机上装 Edge（它开放 `chrome_devtools_remote` 调试接口），并且开着「USB 调试」（`adb_enabled=1`），只开无线调试时 Edge 不开放这个接口。
- 录 AI 实测要 scrcpy：`scripts/setup-scrcpy.sh` 下载官方 Linux 便携版到 `vendor/`（不入库；断点续传，代理慢时去掉 `http_proxy` 直连 GitHub 反而快），或设 `PD_SCRCPY` 指向已有的 scrcpy。录之前手机解锁、开勿扰。
- 依赖：`cd skills/phone-draft && uv venv .venv && uv pip install --python .venv/bin/python -r requirements.txt`（国内网络慢时加 `-i https://mirrors.aliyun.com/pypi/simple/`）。发布文案解析用自带的 `lib/copy_format.py`（正本在工具包根 `shared/python/`，由 `st sync-shared` 同步，不要直接改这份拷贝），单独拷走也能用。

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

`phone_draft.html_parts` 还有 `split_images`（按图片切开 HTML）、`save_data_uri`（内联图写成文件），给只能从相册插图的编辑器用；`text_tail` / `tail_present` 在粘贴后的界面文字里找这一段的结尾，核对有没有粘贴全（公众号助手不显示字数，WebView 的段落文字在界面结构里读得到）。

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
- **DeepSeek**：点「开启新对话」后，按文字查找（UiSelector）有时一直找不到开关和输入框，导出的界面结构 1–2 秒后就有了——DeepSeek 的控件都从导出结构里取坐标点。问候语每次不一样（「你好，我能帮什么忙吗？」「欢迎回来，随时开始吧」）。输入框没获得焦点时只是一段提示文字，点了才变成 EditText。发送后 App 自己收键盘，再按返回会退出 App。开关颜色：开淡蓝 (236,242,254)、关白。
- **豆包**：打开时停在上次的对话，「聊聊新话题」只是一条分隔线；新对话从侧边栏顶部搜索框右边的按钮进。按钮多数没有描述，按「和某个文字同一行、在它右边」找（取最近的；侧边栏打开时主界面的图标也在同一行更右边）。两行以上的提问，输入框右边会多出「展开全屏」键，发送键在它下面（取最靠下的）。输入框里上次没发出去的文字不算对话内容。提问长到占满一屏时，回答在屏幕外：屏幕中间下方出一个没有描述的 ↓（紧贴输入区分隔线 `id/splitter` 上方），点它才滚到回答；回答完的标记是回答下面的「重新生成」按钮 `id/msg_action_regenerate`（平常的界面里没有描述，往上翻过之后的另一种渲染里才有描述「重新生成」），它常在屏幕下沿外，文字不变后要往上推一小段。
- **scrcpy**：输出重定向到文件时整块缓冲，`stdbuf -oL` 才能及时看到「Recording started」；屏幕不动时几乎不出帧，录屏文件可能一直是 0 字节。用 `&` 放到后台的 scrcpy 收不到 Ctrl+C（SIGINT），`Recorder` 用 Popen 启动没有这个问题。
- 锁屏判断：`dumpsys power` 的 `mWakefulness`（Flyme 熄屏是 `Dozing`），`dumpsys window` 的 `isKeyguardShowing=true`。
