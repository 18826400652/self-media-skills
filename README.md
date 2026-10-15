# self-media-skills · 自媒体工具包

一组 Claude Code Skill：把一个选题做成抖音视频 + 小红书视频笔记 + 公众号长文，三个平台存进草稿箱（不点发布）。和具体账号无关，账号、品牌、目录约定都放在**作品项目**里（根目录的 `studio.json` 和各 `<skill>.config.json`）。

## 安装

需要 Node.js 22+、FFmpeg、[uv](https://github.com/astral-sh/uv)、[browser-harness](https://github.com/browser-use/browser-harness)；手机录实测还要 adb。

```bash
git clone <这个仓库> ~/self-media-skills
~/self-media-skills/studio/bin/st install --deps     # 注册 skill 到 ~/.claude/skills、命令放进 ~/.local/bin、装依赖
st init ~/my-media --account 账号名 --audience "目标观众"   # 建作品项目（已有就跳过）
cd ~/my-media && st doctor                          # 逐项检查，按提示补齐（字体、参考音色、浏览器登录…）
```

然后在作品项目里打开 Claude Code，说「新建一期 XX」。入口和完整流程见 [studio/SKILL.md](studio/SKILL.md)、[studio/references/workflow.md](studio/references/workflow.md)。

## 模块

| 模块 | 命令 | 用途 |
|---|---|---|
| [studio](studio/SKILL.md) | `st` | 总入口：作品项目体检（`st doctor`）、新建一期（`st new`）、建项目（`st init`）、安装（`st install`）；默认模板、通用流程 |
| [knowledge-video](knowledge-video/SKILL.md) | `kv` | 一期的总调度：14 / 15 步进度（`kv status`）、用户确认（`kv gate`）、草稿记录（`kv done`）；概念科普的导演手册 |
| [scenario-content](scenario-content/SKILL.md) | `sc` | 内容这几步怎么做（场景卡 → 选题关 → 实测 → 母稿 → 费曼检查 → 自检）；`sc bench` 抓对标，`sc check` 检查 |
| [content-repurpose](content-repurpose/SKILL.md) | — | 方法：一份母稿改编成公众号、小红书、抖音版本 |
| [narrated-video](narrated-video/SKILL.md) | `nv` | 配音讲解视频：脚本 → AI 配音 → 时间轴与字幕 → HyperFrames 动画 → MP4；`nv rec` 录实测，`nv draft` 存抖音、小红书草稿 |
| [video-director](video-director/SKILL.md) | `vd` | 导演做法：导演脚本 → 按内容设计风格的视频工程，`vd qa` 抖音专用检查 |
| [wechat-article](wechat-article/SKILL.md) | `wa` | Markdown → 公众号排版；`wa draft` 存草稿 |
| [image-cards](image-cards/SKILL.md) | `ic` | Markdown → 卡片 PNG（抖音封面、公众号封面） |
| [browser-draft](browser-draft/SKILL.md) | `bd` | 用已登录的浏览器把内容存进各平台草稿箱（默认） |
| [phone-draft](phone-draft/SKILL.md) | `pd` | 通过 adb 操作安卓手机：实测录屏；存草稿备用 |

## 约定

- 每个 skill 的 Node / Python 依赖装在它自己的目录里（`node_modules/`、`.venv/`），不入库
- skill 里不写死任何作品目录名或账号信息；项目专属的东西只进作品项目的配置
- 测试：各 skill 目录里 `node --test tests/*.test.mjs`
