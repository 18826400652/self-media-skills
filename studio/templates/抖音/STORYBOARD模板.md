---
format: 1080x1920
duration: 0s
message: ""
arc: story-explainer
audience: 想做自媒体的新手
mode: autonomous
music: none
kicker: {{角标}}
---

## Video direction

- **recipe** — 按 narrated-video 的 references/douyin-recipe.md「成品教程」：成品亮相 → 准备 → 三步（每步两帧：说做什么 → 看真实操作）→ 一个坑 → 回到成品 → 领模板。不讲原理；每一步都要让观众看得见点哪里、复制什么。帧间停 0.3 秒。
- **palette system** — frame.md 的墨黑底（`ink-black`）+ 纸白字（`cream`），荧光黄（`fire-orange`）是唯一强调色。整片最多一帧整屏翻成强调色（`build.ground: "accent"`），留给「一个坑」。
- **identity chrome** — 每一帧左上角固定角标（frontmatter 的 `kicker`），帧模板自动加；第 1 帧不显示。
- **frames** — 每帧写 `- build: {…}`，`nv hf-build` 自动生成画面；时间写 `"@词"`（说到这个词时，词必须在这一帧的口播里）。表里放不下的画面删掉 build 行手写。duration 先写 1s，`nv hf-audio` 后自动改成配音时长。
- **layout** — 标题每行 ≤ 9 个字；`prompt` 要在这一帧结束前打完（不够就调高 `cps`）；内容待在四角框里（y 330–1160）。
- **safe zones (hard)** — 内容在 x 60–1020、y 230–1150；y 1180–1440 是字幕带；右侧 160px、底部 480px 有平台界面。
- **negative list** — 不要紫蓝「AI 感」光效、粒子、和口播无关的装饰；不要连着三帧以上纯文字；画面、口播里不出现微信号、二维码、「加微信」。

## Frame 1 — 钩子：成品亮相

- scene: 第 0 秒就是成品（截图或录屏），下方一行代价
- voiceover: "（与 SCRIPT.md 第 1 帧一致，几句连起来写）"
- duration: 1s
- transition_in: cut
- status: animated
- src: compositions/frames/01-hook.html
- sfx: impact-bass-1 @（词）
- build: {"kicker": false, "kit": {"name": "shot", "top": 330, "opts": {"src": "assets/result.png", "size": [1080, 1920], "caption": "（成品是什么）", "height": 720}}, "lead": {"text": "（用时 · 花费）", "top": 1090, "at": "@（词）"}}

## Frame 2 — 你能拿到什么

- scene: 今天教你 + 两行大字
- voiceover: "（与 SCRIPT.md 第 2 帧一致，几句连起来写）"
- duration: 1s
- transition_in: cut
- status: animated
- src: compositions/frames/02-promise.html
- sfx: none
- build: {"camera": "push", "title": {"top": 700, "lines": [{"text": "（第一行）", "at": "@（词）"}, {"text": "（第二行，**重点**）", "at": "@（词）"}], "label": "今天教你"}}

## Frame 3 — 准备

- scene: 三项清单：工具 / 花费 / 用时
- voiceover: "（与 SCRIPT.md 第 3 帧一致，几句连起来写）"
- duration: 1s
- transition_in: cut
- status: animated
- src: compositions/frames/03-prep.html
- sfx: pop @（词）
- build: {"kit": {"name": "checklist", "top": 360, "opts": {"title": "要准备的", "items": [{"text": "（工具）", "at": "@（词）"}, {"text": "（花费）", "at": "@（词）"}, {"text": "（用时）", "at": "@（词）"}], "size": 64}}}

## Frame 4 — 第一步

- scene: 步骤条亮到第一步
- voiceover: "（与 SCRIPT.md 第 4 帧一致，几句连起来写）"
- duration: 1s
- transition_in: cut
- status: animated
- src: compositions/frames/04-step1.html
- sfx: click-soft @（词）
- build: {"kit": {"name": "steps", "top": 380, "opts": {"steps": [{"title": "（第一步）", "desc": "（一句说明）", "at": "@（词）"}, {"title": "（第二步）", "desc": ""}, {"title": "（第三步）", "desc": ""}], "size": 64}}}

## Frame 5 — 第一步操作

- scene: 录屏：真实操作，推近到要点的位置
- voiceover: "（与 SCRIPT.md 第 5 帧一致，几句连起来写）"
- duration: 1s
- transition_in: cut
- status: animated
- src: compositions/frames/05-step1-rec.html
- sfx: ping @（词）
- build: {"rec": {"src": "assets/rec.mp4", "mediaStart": 1.0, "chip": "（工具名）实操录屏"}}

## Frame 6 — 第二步

- scene: 要复制的那句话打出来
- voiceover: "（与 SCRIPT.md 第 6 帧一致，几句连起来写）"
- duration: 1s
- transition_in: cut
- status: animated
- src: compositions/frames/06-step2.html
- sfx: click-soft @（词）
- build: {"kit": {"name": "prompt", "top": 420, "opts": {"label": "复制这句", "text": "（要复制的那句话）", "at": "@（词）", "cps": 18}}}

## Frame 7 — 第二步操作

- scene: 录屏或截图：结果出来
- voiceover: "（与 SCRIPT.md 第 7 帧一致，几句连起来写）"
- duration: 1s
- transition_in: cut
- status: animated
- src: compositions/frames/07-step2-rec.html
- sfx: ping @（词）
- build: {"rec": {"src": "assets/rec.mp4", "mediaStart": 10.0}, "timer": {"value": 0, "note": "实际用时 · 原速"}}

## Frame 8 — 第三步

- scene: 步骤条亮到第三步
- voiceover: "（与 SCRIPT.md 第 8 帧一致，几句连起来写）"
- duration: 1s
- transition_in: cut
- status: animated
- src: compositions/frames/08-step3.html
- sfx: click-soft @（词）
- build: {"kit": {"name": "steps", "top": 380, "opts": {"steps": [{"title": "（第一步）", "desc": ""}, {"title": "（第二步）", "desc": ""}, {"title": "（第三步）", "desc": "（一句说明）", "at": "@（词）"}], "size": 64}}}

## Frame 9 — 第三步操作

- scene: 截图：结果，圈出要看的地方
- voiceover: "（与 SCRIPT.md 第 9 帧一致，几句连起来写）"
- duration: 1s
- transition_in: cut
- status: animated
- src: compositions/frames/09-step3-shot.html
- sfx: ping @（词）
- build: {"kit": {"name": "shot", "top": 380, "opts": {"src": "assets/step3.png", "size": [1080, 1920], "caption": "（这是什么）", "height": 720, "marks": [{"x": 540, "y": 960, "at": "@（词）", "label": "（看这里）"}]}}}

## Frame 10 — 一个坑

- scene: 我第一次 vs 改了之后（整片唯一一帧强调色底可以放这里）
- voiceover: "（与 SCRIPT.md 第 10 帧一致，几句连起来写）"
- duration: 1s
- transition_in: cut
- status: animated
- src: compositions/frames/10-pit.html
- sfx: error @（词）
- build: {"kit": {"name": "compare", "top": 420, "opts": {"bad": {"tag": "我第一次", "text": "（踩坑的结果）"}, "good": {"tag": "改了之后", "text": "（正确的结果）"}, "at": ["@（词）", "@（词）"], "size": 50}}}

## Frame 11 — 怎么避开

- scene: 一句话大字，荧光笔划关键词
- voiceover: "（与 SCRIPT.md 第 11 帧一致，几句连起来写）"
- duration: 1s
- transition_in: cut
- status: animated
- src: compositions/frames/11-avoid.html
- sfx: none
- build: {"kit": {"name": "marker", "top": 640, "opts": {"text": "（一句话怎么避开）", "key": "（关键词）", "inAt": "@（词）", "at": "@（词）", "size": 110}}}

## Frame 12 — 回到成品

- scene: 回到第 1 帧的成品，呼应开头
- voiceover: "（与 SCRIPT.md 第 12 帧一致，几句连起来写）"
- duration: 1s
- transition_in: cut
- status: animated
- src: compositions/frames/12-back.html
- sfx: sparkle @（词）
- build: {"kit": {"name": "shot", "top": 330, "opts": {"src": "assets/result.png", "size": [1080, 1920], "caption": "（成品）", "height": 720}}, "lead": {"text": "就这三步，**你也能做出来**", "top": 1090, "at": "@（词）"}}

## Frame 13 — 领模板

- scene: 模板卡：前两行 + 去哪领
- voiceover: "（与 SCRIPT.md 第 13 帧一致，几句连起来写）"
- duration: 1s
- transition_in: crossfade
- status: animated
- src: compositions/frames/13-template.html
- sfx: sparkle @粉丝群
- build: {"camera": "push", "kit": {"name": "template", "top": 440, "opts": {"title": "（模板名）", "lines": ["（模板第一行）", "（关键那一句）"], "keys": [2], "footer": "关注「{{账号}}」· 进粉丝群领模板", "at": 0.05, "stagger": 0.2, "size": 46}}}

## Frame 14 — 下一期

- scene: 下一期预告
- voiceover: "（与 SCRIPT.md 第 14 帧一致，几句连起来写）"
- duration: 1s
- transition_in: cut
- status: animated
- src: compositions/frames/14-next.html
- sfx: none
- build: {"camera": "push", "title": {"top": 760, "lines": [{"text": "（第一行）", "at": "@（词）"}, {"text": "（第二行）", "at": "@（词）"}], "label": "下一期"}}
