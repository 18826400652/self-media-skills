---
format: 1080x1920
duration: 0s
message: ""
arc: story-explainer
audience: 上班族
mode: autonomous
music: none
kicker: {{角标}}
---

## Video direction

- **recipe** — 按 narrated-video 的 references/douyin-recipe.md 聊天版：一个画面讲一个意思，口播几句说完再换；先给原话、再给 AI 写的，让人自己看出问题；为什么、类比、方法三帧来自费曼检查；配音 1.1 倍速，帧间停 0.3 秒。
- **palette system** — frame.md 的墨黑底（`ink-black`）+ 纸白字（`cream`），荧光黄（`fire-orange`）是唯一强调色。整片最多一帧整屏翻成强调色（`build.ground: "accent"`）。
- **identity chrome** — 每一帧左上角固定角标（frontmatter 的 `kicker`），帧模板自动加。
- **frames** — 每帧写 `- build: {…}`，`nv hf-build` 自动生成画面；时间写 `"@词"`（说到这个词时，词必须在这一帧的口播里）。表里放不下的画面删掉 build 行手写。duration 先写 1s，`nv hf-audio` 后自动改成配音时长。
- **layout** — 标题每行 ≤ 9 个字（再长会折行、和下面的内容重叠）；`prompt` / `stream` 要在这一帧结束前打完（不够就调高 `cps` / `rate`）。
- **safe zones (hard)** — 内容在 x 60–1020、y 230–1150；y 1180–1440 是字幕带；右侧 160px、底部 480px 有平台界面。
- **negative list** — 不要紫蓝「AI 感」光效、粒子、和口播无关的装饰；回弹缓动只给弹出的小元素（组件已分好）；不要连着三帧以上纯文字（先想这句话能画成什么动作）。

## Frame 1 — 钩子

- scene: 第 0 秒就有大画面：原话 vs AI 写的（或错数字、实测截图）
- voiceover: "（与 SCRIPT.md 第 1 帧一致，几句连起来写）"
- duration: 1s
- transition_in: cut
- status: animated
- src: compositions/frames/01-hook.html
- sfx: impact-bass-1 @（钩子里的词）
- build: {"kicker": false, "kit": {"name": "compare", "top": 500, "opts": {"bad": {"tag": "（原话）", "text": "（原始材料）"}, "good": {"tag": "AI 写的（实测原话）", "text": "（AI 写的那一行）"}, "at": [0.15, "@（词）"], "size": 50}}}

## Frame 2 — 开场

- scene: 今天聊聊 + 两行大字
- voiceover: "（与 SCRIPT.md 第 2 帧一致，几句连起来写）"
- duration: 1s
- transition_in: cut
- status: animated
- src: compositions/frames/02-intro.html
- sfx: none
- build: {"camera": "push", "title": {"top": 700, "lines": [{"text": "（第一行）", "at": "@（词）"}, {"text": "（第二行，**重点**）", "at": "@（词）"}], "label": "今天聊聊"}}

## Frame 3 — 场景

- scene: 情景演绎群聊，或逐行出原始材料
- voiceover: "（与 SCRIPT.md 第 3 帧一致，几句连起来写）"
- duration: 1s
- transition_in: cut
- status: animated
- src: compositions/frames/03-scene.html
- sfx: pop @（词）
- build: {"kit": {"name": "chat", "top": 330, "opts": {"title": "（群名）", "count": 4, "height": 820, "size": 44, "messages": [{"from": "（谁）", "text": "（说了什么）", "at": 0.1}, {"from": "我", "me": true, "text": "（回了什么）", "at": "@（词）"}]}}}

## Frame 4 — 操作

- scene: 录屏：粘贴提问、发送
- voiceover: "（与 SCRIPT.md 第 4 帧一致，几句连起来写）"
- duration: 1s
- transition_in: cut
- status: animated
- src: compositions/frames/04-send.html
- sfx: click-soft @（词）
- build: {"rec": {"src": "assets/rec.mp4", "mediaStart": 1.0, "chip": "DeepSeek 实测录屏"}}

## Frame 5 — 结果

- scene: 录屏：回答刷出来 + 计时
- voiceover: "（与 SCRIPT.md 第 5 帧一致，几句连起来写）"
- duration: 1s
- transition_in: cut
- status: animated
- src: compositions/frames/05-result.html
- sfx: ping @（词）
- build: {"rec": {"src": "assets/rec.mp4", "mediaStart": 3.2}, "timer": {"value": 0, "note": "实际用时 · 原速"}}

## Frame 6 — 转折

- scene: 冲击帧：一句话
- voiceover: "（与 SCRIPT.md 第 6 帧一致，几句连起来写）"
- duration: 1s
- transition_in: push-slide UP
- status: animated
- src: compositions/frames/06-turn.html
- sfx: impact-bass-1 @（词）
- build: {"ground": "accent", "title": {"center": true, "top": 740, "lines": [{"text": "（冲击一句）", "at": "@（词）"}]}}

## Frame 7 — 原话

- scene: 原话逐行出现
- voiceover: "（与 SCRIPT.md 第 7 帧一致，几句连起来写）"
- duration: 1s
- transition_in: cut
- status: animated
- src: compositions/frames/07-source.html
- sfx: none
- build: {"camera": "push", "kit": {"name": "stream", "top": 450, "opts": {"source": "（原话 · 出处）", "text": "（原话）", "at": "@（词）", "size": 52, "rate": 0.4}}}

## Frame 8 — AI 写的

- scene: 重建 AI 的回答，focus 出问题那一行
- voiceover: "（与 SCRIPT.md 第 8 帧一致，几句连起来写）"
- duration: 1s
- transition_in: cut
- status: animated
- src: compositions/frames/08-ai.html
- sfx: error @（词）
- build: {"camera": "push", "kit": {"name": "answer", "top": 420, "opts": {"source": "DeepSeek 原话 · 实测第 N 轮", "blocks": [{"h": "（标题）"}, {"table": {"head": ["（列1）", "（列2）"], "rows": [["（值）", "（值）"]]}}], "focus": {"row": 0, "at": "@（词）", "note": "（说明）"}}}}

## Frame 9 — 为什么

- scene: 你以为 / 其实
- voiceover: "（与 SCRIPT.md 第 9 帧一致，几句连起来写）"
- duration: 1s
- transition_in: cut
- status: animated
- src: compositions/frames/09-why.html
- sfx: none
- build: {"camera": "push", "kit": {"name": "compare", "top": 560, "opts": {"bad": {"tag": "你以为", "text": "（常见误解）"}, "good": {"tag": "其实", "text": "（大白话解释）"}, "at": ["@（词）", "@（词）"], "size": 52}}}

## Frame 10 — 类比

- scene: 打个比方（关键镜头可手写小动画，见配方）
- voiceover: "（与 SCRIPT.md 第 10 帧一致，几句连起来写）"
- duration: 1s
- transition_in: cut
- status: animated
- src: compositions/frames/10-analogy.html
- sfx: click-soft @（词）
- build: {"camera": "push", "title": {"top": 700, "lines": [{"text": "（类比第一行）", "at": "@（词）"}, {"text": "**（关键属性）**", "at": "@（词）"}], "label": "打个比方"}}

## Frame 11 — 方法

- scene: 提问卡打出那一句
- voiceover: "（与 SCRIPT.md 第 11 帧一致，几句连起来写）"
- duration: 1s
- transition_in: cut
- status: animated
- src: compositions/frames/11-method.html
- sfx: sparkle @（词）
- build: {"lead": {"text": "就加**一句话**", "top": 330, "at": "@（词）"}, "kit": {"name": "prompt", "top": 450, "opts": {"label": "我的追问（实测第 N 轮）", "text": "（那一句）", "at": "@（词）", "cps": 14, "size": 52}}}

## Frame 12 — 方法结果

- scene: 前后对比
- voiceover: "（与 SCRIPT.md 第 12 帧一致，几句连起来写）"
- duration: 1s
- transition_in: cut
- status: animated
- src: compositions/frames/12-fixed.html
- sfx: sparkle @（词）
- build: {"camera": "push", "kit": {"name": "compare", "top": 470, "opts": {"bad": {"tag": "之前", "text": "（之前）"}, "good": {"tag": "加上这句以后", "text": "（之后）"}, "at": ["@（词）", "@（词）"], "size": 58}}}

## Frame 13 — 方法结果 2

- scene: 原话逐行出现
- voiceover: "（与 SCRIPT.md 第 13 帧一致，几句连起来写）"
- duration: 1s
- transition_in: cut
- status: animated
- src: compositions/frames/13-fixed2.html
- sfx: none
- build: {"camera": "push", "kit": {"name": "stream", "top": 450, "opts": {"source": "（原话 · 实测第 N 轮）", "text": "（原话）", "at": "@（词）", "size": 54, "rate": 0.3}}}

## Frame 14 — 进阶

- scene: （可选）追问提问卡
- voiceover: "（与 SCRIPT.md 第 14 帧一致，几句连起来写）"
- duration: 1s
- transition_in: cut
- status: animated
- src: compositions/frames/14-more.html
- sfx: none
- build: {"camera": "push", "kit": {"name": "prompt", "top": 450, "opts": {"label": "再追问一句", "text": "（追问）", "at": "@（词）", "cps": 14, "size": 52}}}

## Frame 15 — 进阶结果

- scene: （可选）截图圈出
- voiceover: "（与 SCRIPT.md 第 15 帧一致，几句连起来写）"
- duration: 1s
- transition_in: cut
- status: animated
- src: compositions/frames/15-more2.html
- sfx: none
- build: {"camera": "push", "kit": {"name": "shot", "top": 420, "opts": {"src": "assets/（截图）.png", "size": [1080, 860], "caption": "实测第 N 轮", "marks": [{"x": 500, "y": 400, "at": "@（词）", "label": "（说明）"}]}}}

## Frame 16 — 避坑

- scene: 避坑一条
- voiceover: "（与 SCRIPT.md 第 16 帧一致，几句连起来写）"
- duration: 1s
- transition_in: cut
- status: animated
- src: compositions/frames/16-pitfall.html
- sfx: error @（词）
- build: {"camera": "push", "title": {"top": 680, "lines": [{"text": "（第一行）", "at": "@（词）"}, {"text": "（第二行）", "at": "@（词）"}], "label": "避坑"}}

## Frame 17 — 收尾

- scene: 模板卡，keys 标出那一句
- voiceover: "（与 SCRIPT.md 第 17 帧一致，几句连起来写）"
- duration: 1s
- transition_in: crossfade
- status: animated
- src: compositions/frames/17-template.html
- sfx: sparkle @粉丝群
- build: {"camera": "push", "kit": {"name": "template", "top": 440, "opts": {"title": "（模板名）· 截图存好", "lines": ["（模板第一行）", "（关键那一句）"], "keys": [2], "footer": "关注「{{账号}}」· 进粉丝群领模板", "at": 0.05, "stagger": 0.2, "size": 46}}}

## Frame 18 — 下一课

- scene: 下一课预告
- voiceover: "（与 SCRIPT.md 第 18 帧一致，几句连起来写）"
- duration: 1s
- transition_in: cut
- status: animated
- src: compositions/frames/18-next.html
- sfx: none
- build: {"camera": "push", "title": {"top": 760, "lines": [{"text": "（第一行）", "at": "@（词）"}, {"text": "（第二行）", "at": "@（词）"}], "label": "下一课"}}
