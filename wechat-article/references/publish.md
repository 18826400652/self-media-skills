# 发布到公众号草稿箱（wa publish）

`wa publish` 需要三样东西：

1. **AppID 和 AppSecret**：公众号后台 →「设置与开发」→「开发接口管理」→「基本配置」。
2. **IP 白名单**：在同一页面把运行 `wa publish` 的机器公网 IP 加进白名单。查询本机公网 IP：`curl -s ifconfig.me`。
3. **凭据文件**：在项目根目录建 `.env`（已被 `.gitignore` 排除，**不要提交**）：

   ```
   WECHAT_APP_ID=wx…
   WECHAT_APP_SECRET=…
   ```

   路径可以用配置里的 `envFile` 修改；也可以直接设置环境变量。

## 常见问题

| 现象 | 原因 |
|---|---|
| `invalid ip … not in whitelist` | 本机公网 IP 没加白名单。家庭宽带的 IP 会变，变了要重新加 |
| `invalid appsecret` | AppSecret 错误或已重置 |
| `48001: api unauthorized` | 凭据和 IP 是对的（否则会先报别的错），但这个账号没有草稿箱 / 素材接口权限。先确认 AppID 是**公众号**的，不是小程序的（两者后台都在 mp.weixin.qq.com，登录后看左上角）；是公众号的话，个人主体和未认证账号自 2025 年 7 月起没有这些权限，只能用复制粘贴方式 |
| 发布后草稿里没有封面 | frontmatter 没写 `cover`，正文里也没有图片 |

## IP 经常变怎么办

文颜支持 Server 模式：在一台固定 IP 的云服务器上运行 `wenyan serve`，本地用 `--server` 参数发布。这个参数目前需要直接调用文颜，`wa` 还没有封装：

```bash
node_modules/.bin/wenyan publish -f 文章.md -c <主题.css> --server https://你的服务器 --api-key-file <密钥文件>
```

详见 https://github.com/caol64/wenyan-cli/blob/main/docs/server.md

## 个人主体账号：没有草稿 API，用 `wa draft`

个人主体（以及未认证企业）账号在「微信开发者平台 → 公众号 → 接口管理 → 接口权限与额度」里，「发布能力」全部是「无权限」，也没有「新增草稿」接口；永久素材接口倒是有权限。所以 `wa publish` 用不了，用 `wa draft` 通过浏览器存草稿（原理是粘贴）：

- `wa render` 的 HTML 粘贴进公众号编辑器正文即可，样式会保留。
- **图片**：把本地图片转成 `data:` 内联在 HTML 里再粘贴，编辑器会自动转存到 `mmbiz.qpic.cn`，不用手动上传。
- 公众号后台的新版开发设置在 developers.weixin.qq.com/console（微信开发者平台），旧的「开发 → 基本配置」页会显示「你还没有成为开发者」。

## 公众号编辑器的「内容结构检测」

粘贴时编辑器会弹出检测结果（只是建议，可以「继续插入」）。已知规律：

| 提示 | 原因与处理 |
|---|---|
| darkmode-no-gradient：文字背景尽量不要使用渐变 | 文字的 `background` 用了 `linear-gradient`。改纯色（主题已改） |
| 行高异常（代码块） | `line-height` 写成无单位或 em。写成 px 后消失（`doocs-theme.py` 已统一换算成 px） |
| 行高小于字体大小（含加粗的段落） | 去掉加粗的全部样式、只剩 `<strong>` 也照样报，手机预览也没有重叠，判断为检测误报，可忽略 |
| 居中布局不一致（表格） | 未定位到原因，手机预览显示正常 |
