---
name: narrated-video
description: >
  制作「AI 配音 + 动画 + 字幕」的讲解类短视频（不出镜、知识科普、教程、产品讲解），
  输出抖音 / 小红书 / 视频号竖屏或 B 站 / YouTube 横屏 MP4。流程：分镜脚本 → 逐句 TTS 配音 →
  自动生成时间轴与字幕 → HyperFrames（HTML + GSAP）编排动画 → 渲染。
  当用户要做讲解视频、口播动画、知识短视频、给脚本配音配字幕、新建一期视频，
  或项目里有 narrated-video.config.json 时使用。
---

# narrated-video：配音讲解视频

核心原则：**先配音，再做动画。**画面时间从配音时间轴里取，不要手写秒数。改了台词，重新配音后动画会自动对齐。

所有命令都通过 `bin/nv` 调用（若已链接到 `~/.local/bin/nv`，直接用 `nv`）。

## 流程

```bash
nv new <名称> [--date YYYY-MM-DD]     # 按项目配置新建一期（无配置时用 nv new --dir <目录>）
# 1. 写 脚本.md 的分镜表
nv voice <视频目录>                   # 2. 逐句配音 → audio/voice.wav + timeline.json → 自动 sync
# 3. 编排 index.html 的场景和动画（见下方约定）
nv check <视频目录>                   # 4. lint + 运行时检查
nv snapshot <视频目录> --at 1.5,8,15  # 5. 截关键帧，务必看图确认
nv render <视频目录>                  # 6. 输出 <视频目录>/renders/<作品名>.mp4
```

其他子命令会原样透传给 `hyperframes`，如 `nv preview`、`nv doctor`、`nv lint`。

## 视频工程的组成

| 文件 | 作用 | 谁来改 |
|---|---|---|
| `脚本.md` | 分镜表：一行 = 一句口播 = 一个画面 | 人 / AI |
| `index.html` | 场景和 GSAP 动画 | 人 / AI |
| `preset.css` | 平台尺寸、安全区、字号 | `nv new` 生成，不手改 |
| `base.css` | 通用布局（场景、列表、字幕、高亮） | skill 提供 |
| `theme.css` | 配色、字体、装饰（项目品牌） | 项目提供 |
| `timeline.json` | 每句的起止时间 | `nv voice` 生成 |
| `audio/`、`renders/`、`snapshots/` | 配音、成品、截图 | 生成物，不入 git |

## 分镜表格式（脚本.md）

必须有 `## 分镜` 小节。表格需包含 `#`（行号）、`口播…`、`重点词…` 三列，其他列随意。

- **每句口播不超过 28 字**（字幕最多两行，竖屏一行约 14 字）
- **重点词**用顿号分隔，会在字幕里自动高亮
- 英文缩写容易被 TTS 读错，必要时写成读音友好的形式

## 时间轴约定（编排 index.html 时必须遵守）

| 写法 | 含义 |
|---|---|
| `<section id="s2" class="clip scene" data-lines="2-4">` | 场景绑定第 2-4 句口播，`sync` 会写入 `data-start` / `data-duration` |
| `at("s2")` | 场景 s2 的开始时间 |
| `line(3)` | 第 3 句口播的开始时间（读取字幕元素 `#cap-3`） |
| `<!-- captions:start -->…<!-- captions:end -->` | 字幕区，由 `sync` 生成，不要手改 |

示例：要点在对应那句口播开始时出现：

```js
document.querySelectorAll("#s2 li").forEach((li, i) => {
  tl.from(li, { x: -80, opacity: 0, duration: 0.5 }, line(2 + i));
});
```

改了口播文字就重跑 `nv voice`（未改的句子走缓存）；只改了场景绑定就跑 `nv sync`。

## HyperFrames 硬性规则

- 根元素 `#root` 带 `data-composition-id="main"`；时间轴是 `gsap.timeline({ paused: true })`，注册到 `window.__timelines["main"]`
- 有时间的元素需要 `class="clip"` 和 `data-start` / `data-duration`
- 只写确定性逻辑：不用 `Date.now()`、`Math.random()`、网络请求
- `querySelector` 里不能用模板字符串（打包器会崩溃），要用字符串拼接或 `getElementById`
- 高亮的划线动画：`tl.from("mark", { "--mark": "0%" })`
- `nested_structure_needs_subcomposition` 警告只影响 Studio 时间轴显示，可以忽略
- 详细文档：`node_modules/hyperframes/dist/docs/`，或运行 `nv docs <主题>`

## 画面设计要点

- 前 3 秒是钩子：结果前置、反常识或痛点，不做自我介绍
- 每 3-5 秒画面要有变化；一屏只讲一件事
- 中文大标题用 `<br />` 手动断行，避免把一个词拆到两行
- 颜色和字号只用 CSS 变量（`--highlight`、`--text-hero` 等），不写死
- 渲染前用 `nv snapshot` 截图，**看图**检查断行、遮挡、安全区

## 项目配置 narrated-video.config.json（可选，放在项目根目录）

```json
{
  "preset": "douyin",
  "tts": { "provider": "kokoro", "voice": "zf_xiaobei", "speed": 1.0 },
  "template": "path/to/project-template",
  "theme": "path/to/theme.css",
  "episodes": {
    "root": "作品目录",
    "dirPattern": "{{DATE}}-{{NAME}}",
    "videoSubdir": "抖音",
    "scaffold": [{ "from": "模板/母稿.md", "to": "母稿.md" }]
  }
}
```

- `preset`：`presets/` 下的平台预设，目前有 `douyin`（9:16）、`xiaohongshu`（3:4）、`bilibili`（16:9）
- `template`：项目模板目录，叠加在 `templates/base/` 之上，同名文件覆盖
- `theme`：项目品牌主题，替换 `theme.css`。需要定义的变量见 `templates/base/theme.css`
- `scaffold`：新建一期时额外生成的文件，支持占位符 `{{TITLE}}` / `{{标题}}` / `{{DATE}}`
- 所有路径都相对于配置文件所在目录

## 扩展

- **新平台**：在 `presets/` 加一个 JSON，字段参照 `douyin.json`
- **新 TTS 服务商**：写 `tts/<名字>.mjs` 导出 `synthesize({ text, voice, speed, outFile })`，再到 `tts/index.mjs` 登记。密钥用环境变量
- **环境搭建与排坑**：见 `references/setup.md`
