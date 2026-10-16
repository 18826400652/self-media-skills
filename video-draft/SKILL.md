---
name: video-draft
description: >
  把做好的成片 mp4 + 发布文案（+ 封面图）存进抖音或小红书的草稿箱，只存草稿，不点发布。
  提供 vdraft 命令：vdraft <成片.mp4> --copy <文案.md> [--cover <图>] [--to douyin|xiaohongshu] [--via browser|phone]。
  当用户要「存抖音草稿」「存小红书视频草稿」「把成片发到草稿箱」，或一期作品走到抖音草稿、小红书这两步时使用。
  公众号草稿用 wechat-article（wa draft），图文卡片草稿用 image-cards（ic draft），不在这里。
---

# video-draft：成片 → 抖音 / 小红书草稿

**铁律：只存草稿，永远不点发布。登录、扫码、验证由用户完成。**

用户说「直接发布」时拒绝：vdraft 没有发布功能，草稿存好后由用户自己在抖音创作者中心 / 小红书创作服务平台的草稿箱里点发布。

## 命令

```bash
vdraft 抖音/renders/xx.mp4 --copy 抖音/发布文案.md --cover 抖音/out/01.png            # 抖音（默认）
vdraft 抖音/renders/xx.mp4 --copy 小红书/文案.md --cover 抖音/out/01.png --to xiaohongshu
vdraft 抖音/renders/xx.mp4 --copy 抖音/发布文案.md --via phone                       # 手机备用
```

| 参数 | 说明 |
|---|---|
| `--copy <文案.md>` | 必填。格式 `## 标题` / `## 正文` / `## 话题`；抖音标题 ≤ 30 字（`sc check` 会查），小红书标题 ≤ 20 字 |
| `--cover <图>` | 封面图（png / jpg）。**只支持浏览器**；不传时抖音用视频画面、小红书用第一帧 |
| `--to douyin\|xiaohongshu` | 平台，默认 `douyin` |
| `--via browser\|phone` | 默认 `browser`：用 browser-draft 的 `bd` 操作已登录的浏览器；`phone`：用 phone-draft 的 `pd` 操作手机 App（备用） |

用户只说「存草稿」「发小红书」时先问清楚：哪个平台、成片 mp4 在哪、文案在哪、有没有封面图，不猜。`--via phone` 加 `--cover` 会报错，手机端存完后在 App 里手动换封面；手机不可用时不会回落到浏览器，让用户检查 adb 连接或去掉 `--via phone`。

## 注意事项

- **抖音网页端只保留一条未发布的作品**：已有一条时脚本会停下，先在创作者中心把它发布或「放弃」（Claude 不替人放弃）
- 抖音：横封面（4:3）、竖封面（3:4）都会上传 `--cover` 的图；预览在创作者中心「发布视频」页点「继续编辑」。弹窗有时加载不出来，会提示「封面没设上」
- **小红书网页草稿只存在这台电脑的浏览器里**，不同步到手机 App，清浏览器数据会丢；在创作服务平台「草稿箱」预览，在电脑上发布。网页按 3:4 裁封面，9:16 的封面只留上面一截，封面大字放上半部分
- 脚本中途失败时可能留下一份半成品草稿，删掉即可
- 成功后在 kv 里记：`kv done <作品> douyin` / `kv done <作品> xiaohongshu`

## 出错时

- 找不到 `bd` / `pd`：需要先装 browser-draft / phone-draft 并软链到 PATH
- 退出码 3（`--via phone`）：手机不可用，见上面的提示
- 其他失败：看脚本输出，不要重复点；先到草稿箱看有没有留下半成品

具体步骤脚本在 `scripts/`：`draft_douyin.py`、`draft_xiaohongshu.py`（浏览器）、`phone_douyin.py`、`phone_xiaohongshu.py`（手机），由 `bd run` / `pd run` 执行。
