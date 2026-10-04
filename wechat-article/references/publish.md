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
| 发布后草稿里没有封面 | frontmatter 没写 `cover`，正文里也没有图片 |

## IP 经常变怎么办

文颜支持 Server 模式：在一台固定 IP 的云服务器上运行 `wenyan serve`，本地用 `--server` 参数发布。这个参数目前需要直接调用文颜，`wa` 还没有封装：

```bash
node_modules/.bin/wenyan publish -f 文章.md -c <主题.css> --server https://你的服务器 --api-key-file <密钥文件>
```

详见 https://github.com/caol64/wenyan-cli/blob/main/docs/server.md
