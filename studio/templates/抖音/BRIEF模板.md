---
workflow: faceless-explainer
flow: automation
storyboard: no
message: ""
destination: douyin
aspect: 1080x1920
language: zh-CN
audience: 想做自媒体的新手
length: 90-120s
angle: story-explainer
narration: yes
---

## Intent

{{角标}}：{{标题}}。抖音竖屏，不出镜，AI 配音 + 动画。内容依据同一作品目录下的 母稿.md 和 实测记录.md。

设计原则：前 3 秒亮成品或结果；一屏只讲一件事、字要大；画面跟着口播走；
动效克制，每帧一个亮点动作；左上角固定角标「{{角标}}」作为辨识符号。

## Assets

- 实测截图：../实测/（用到的复制到 capture/assets/ 和 assets/，画面里引用 assets/<文件名>）
- 品牌：frame.md（来自项目品牌目录，studio.json 的 `brand`），组件库 compositions/kit/kit.js（nv hf-kit）

## Customizations

- 配音：narrated-video.config.json 的 TTS（seedaudio + 参考音色），按 VOICE.md 导演稿用 `nv hf-audio . --pause 0.3` 生成，不用 HeyGen / Kokoro
- 音效：STORYBOARD 每帧 `- sfx: 名称 @关键词`，用 `nv hf-sfx` 放置
- 画面：按 narrated-video 的 references/hf-kit.md 选用表选组件
- 背景音乐：不在视频里加，发布时在抖音曲库选

## Notes

- 抖音安全区：内容放在 x 60–1020、y 230–1150；右侧 160px、底部 480px 有平台界面；y 1180–1440 是字幕带
- 演示数据、截图、AI 原话必须来自实测记录，不能编造
