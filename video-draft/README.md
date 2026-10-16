# video-draft

把成片 mp4 + 发布文案（+ 封面图）存进抖音或小红书的草稿箱，不发布。命令 `vdraft`。

## 用法

```bash
vdraft <成片.mp4> --copy <发布文案.md> [--cover <封面图>] [--to douyin|xiaohongshu] [--via browser|phone]
```

示例：

```bash
vdraft 抖音/renders/xx.mp4 --copy 抖音/发布文案.md --cover 抖音/out/01.png
vdraft 抖音/renders/xx.mp4 --copy 小红书/文案.md --cover 抖音/out/01.png --to xiaohongshu
```

## 接口

- 输入：成片 mp4（必填）、`--copy` 文案（必填）、`--cover` 封面图（png / jpg，仅浏览器端）
- 文案格式：`## 标题` / `## 正文` / `## 话题`，由 browser-draft 的 `read_copy` 解析
- `--to` 默认 `douyin`；`--via` 默认 `browser`
- 退出码：0 成功；3（仅 `--via phone`）手机不可用；其他非 0 为失败
- 把参数写成临时 payload（`{ video, copy, cover? }`）后，通过命令行调用 `bd run <步骤.py>` 或 `pd run <步骤.py>`，不 import 其他 skill 的代码

## 依赖

- Node.js 22+
- browser-draft（`bd`）：浏览器端；需要用户已登录抖音创作者中心 / 小红书创作服务平台
- phone-draft（`pd`）：手机端备用

## 测试

```bash
cd video-draft && node --test tests/*.test.mjs
```

## 来源与许可证

由本仓库早先的配音讲解视频 skill（已删除）的存草稿命令搬出，行为不变，随仓库许可证。
