# 视觉 QA

渲染后，逐帧看 `抖音/snapshots/sheet.jpg` 和成片抽帧（`ffmpeg -ss <秒> -i <成片> -frames:v 1 x.png`），写 `qa.json`。

## 检查项（checked 必须全部写上）

| 检查项 | 看什么 |
|---|---|
| `safe-area` | 内容在 x 60–1020、y 230–1150 内，不进字幕带（y 1180–1440）和右侧 150px |
| `text-size` | 手机上要读的字不小于 37px |
| `density` | 一屏只有一个主体；表格最多 2～3 行清晰可读 |
| `typo` | 错别字、标点、术语写法前后一致 |
| `fact-on-screen` | 画面上的数字、说法和 research.json 一致（实用技巧类：和实测记录一致） |
| `rhythm` | 画面跟着口播出现，没有长时间不动、也没有一闪而过 |

## 格式

```json
{
  "passed": false,
  "checked": ["safe-area", "text-size", "density", "typo", "fact-on-screen", "rhythm"],
  "issues": [{ "frame": 4, "severity": "high", "check": "density", "problem": "一屏 6 行表格，手机上看不清", "fix": "只留 2 行，其余虚化" }]
}
```

- `severity`：`high`（必须修，修好前不请用户看成片）、`medium`（建议修）、`low`（记下来）
- `passed: true` 时不能有 high 级问题
