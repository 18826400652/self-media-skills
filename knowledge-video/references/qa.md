# 视觉 QA

渲染后，先跑 `nv hf-build 抖音 --motion`（每帧四张：入场 / 中段 / 落定前 / 落定，并自动检查落定后还动不动；过程图存在 `抖音/snapshots/motion-sheet.jpg`，不会动 ③ 用的 `sheet.jpg`，也不会让 kv 以为分镜改过），再逐帧看 `抖音/snapshots/motion-sheet.jpg` 和成片抽帧（`ffmpeg -ss <秒> -i <成片> -frames:v 1 x.png`），写 `qa.json`。

只看每帧结尾一张图，会漏掉「过程」上的问题：元素出现得太晚、落定后整帧不动、连续几帧长得一样。官方 Claude Design 指南把「完整看一遍再调节奏」当成 Claude Code 的主要工作：看哪一帧拖、哪一帧太静，再微调时长和动作。

## 检查项（checked 必须全部写上）

| 检查项 | 看什么 |
|---|---|
| `safe-area` | 内容在 x 60–1020、y 230–1150 内，不进字幕带（y 1180–1440）和右侧 150px |
| `text-size` | 手机上要读的字不小于 37px |
| `density` | 一屏只有一个主体；表格最多 2～3 行清晰可读 |
| `typo` | 错别字、标点、术语写法前后一致 |
| `fact-on-screen` | 画面上的数字、说法和 research.json 一致（实用技巧类：和实测记录一致） |
| `rhythm` | 画面跟着口播出现，没有一闪而过；连续三帧以上同一种画面（如都是文字卡）算节奏偏平，换一种组件或插一帧冲击帧；构图别连续三帧都靠同一边 |
| `motion` | 每帧落定后都还在动（缓推、录屏、数字在数、圈在抖）；`--motion` 报「落定后完全静止」的帧要处理或写明理由 |

## 格式

```json
{
  "passed": false,
  "checked": ["safe-area", "text-size", "density", "typo", "fact-on-screen", "rhythm", "motion"],
  "issues": [{ "frame": 4, "severity": "high", "check": "density", "problem": "一屏 6 行表格，手机上看不清", "fix": "只留 2 行，其余虚化" }]
}
```

- `severity`：`high`（必须修，修好前不请用户看成片）、`medium`（建议修）、`low`（记下来）
- `passed: true` 时不能有 high 级问题
