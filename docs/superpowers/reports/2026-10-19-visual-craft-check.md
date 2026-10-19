# 视觉工艺层验收报告（2026-10-19）

> 分支：`feat/visual-craft`（基线 `da25251`）。用户原工程没有改；所有 `vd qa` 都跑在 `.dsh/qa-sample` 副本上。
> 方案与审查：[2026-10-19-video-visual-craft.md](../plans/2026-10-19-video-visual-craft.md)。

## 1. 改动内容

| 文件 | 作用 |
|---|---|
| `video-director/references/visual-craft.md` | 视觉工艺 6 层规则、自检表、反例库、旧工程迁移；数值默认区间，项目视觉规范优先 |
| `video-director/evals/cases.md` | 6 条视觉工艺评估用例（典型 / 模糊 / 极简 / 矛盾 / 超出 / 缺规范） |
| `video-director/templates/DIRECTOR.md` | §1 加"材质与光影""视觉规范"；§3 加 6 行数字自检 |
| `video-director/references/director-rules.md` | 第 3、11a、12 条接入视觉工艺；字号只留一句指向 visual-craft |
| `video-director/SKILL.md` | 设计文档一行；`vd qa` 命令行；"每段画面怎么写"加一条 |
| `video-director/scripts/lib/inspect-page.mjs` | 采集 `blocks` / `texts` / `materials` / `aestheticOk` / `px`；`shot64`；遮挡跳过 `data-layout-ignore` |
| `video-director/scripts/lib/douyin-qa.mjs` | `analyzeCraft` / `checkCraft`；`qaTimes` 加 0.8s 首帧；空白带忽略全屏背景块 |
| `video-director/scripts/lib/qa-run.mjs` | 截图一次同时取 base64 / 像素；汇总 `craft` |
| `video-director/scripts/vd.mjs` | `qa-douyin.json` 写 `craft`；终端打印"视觉工艺"摘要 |
| `video-director/templates/index.html` | 材质 / 字阶变量和 `.vd-*` 工具类；grain / vignette 层（带标记） |
| `video-director/templates/segment.html` | 注释补 `data-vd-material` / `data-vd-aesthetic-ok` |
| `video-director/tests/{douyin-qa,inspect-page,qa-run,templates}.test.mjs` | 新增 19 个用例；首帧改变后的 3 个既有断言同步更新 |
| `studio/references/workflow.md` | `vd qa` 一行补视觉工艺 |
| `knowledge-video/SKILL.md` | 第 9/10 步加"⚠ 视觉工艺也要看" |

## 2. 验证证据

### 2.1 测试

~~~bash
(cd video-director && node --test tests/*.test.mjs)
~~~

结果：**tests 173 / pass 173 / fail 0**。改造前基线是 154；新增 19 个（douyin-qa 13、inspect-page 3、qa-run 1、templates 2）。

其他套件：

~~~text
knowledge-video  95 pass / 0 fail
studio           90 pass / 1 fail（既有故障：test-all.test.mjs 期望 TAP 的 # pass，Node 24 输出 spec）
~~~

`st test --strict` 在本机 Node 24 下仍然不可信：Node 套件多数显示"0 通过"（`test-all.mjs` 只认 TAP），studio 那 1 个失败也在。CI 用 Node 22；本报告用 `node --test` 的真实输出作为证据。

### 2.2 第 1 期工程副本的 `vd qa`

副本：`.dsh/qa-sample/抖音`（221MB，含 `node_modules`；`video-director.config.json` 的 `brandDir` 改成原工程的绝对路径）。原工程 `/home/power/self-media/.../抖音` 没有动。

| 场景 | 耗时 | craft 摘要 | ✗ |
|---|---|---|---|
| 改造前（无材质层） | 27s | 首帧 46px / 簇 35.2%；主体簇 7.2–35.2%；空白带 415px；材质 1/4；构图 8/9 | 0 |
| 材质层（原 SVG 纸纹） | 52s | 材质 4/4 | 0 |
| 材质层（PNG 纸纹） | 48s | 材质 4/4 | 0 |
| 只留暗角（去掉 grain） | 30s | 材质 3/4 | 0 |

改造前那次共 **54 个时间点**（首帧 + 53 个 cue/段尾），**24 条 craft ⚠**：

- `craft-type` 5 段：seg-01 46px、seg-04 60px、seg-06 60px、seg-08 60px、seg-09 48px。
- `craft-hierarchy` 7 段：seg-01 1.29、seg-03 1.45、seg-04 1.30、seg-06 1.52、seg-07 1.22、seg-08 1.43、seg-09 1.00。
- `craft-subject` 7 段：seg-03 24.9%、seg-04 15.7%、seg-05 24.8%、seg-06 12.4%、seg-07 21.8%、seg-08 28.1%、seg-09 7.2%。
- `craft-gap` 2 段：seg-06 415px（y 735 起）、seg-09 290px。
- `craft-hook` 1 条：首帧 46px（<96）、簇 35.2%（<35%）。
- `craft-material` 1 条：1/4（多层投影× 纹理× 暗角×；便利贴/标签的 3–6° 旋转算 1 件）。
- `craft-variety` 1 条：9 段里 8 段主体簇中心在 x 446–554（±5% 宽）。

材质层（PNG）跑完后：`craft.material = { shadow: true, grain: true, vignette: true, rotation: true, score: 4 }`，`passed: true`，**0 个 ✗**（没有栏目标签被挡）。`npx hyperframes check` 在副本上是 **Check passed**（0 error，48/48 对比度）。

### 2.3 `craft` 写进 `qa-douyin.json`（改造前示例；加材质层后 `material` 是 4/4）

~~~json
{
  "passed": true,
  "issues": [{ "level": "warn", "msg": "..." }],
  "shots": [{ "t": 0.8, "label": "首帧", "file": "snapshots/cues/01.png" }],
  "craft": {
    "first": { "t": 0.8, "label": "首帧", "maxFont": 46, "cluster": 35.21 },
    "segments": [{ "id": "seg-06-pit", "maxFont": 60, "ratio": 1.52, "cluster": 12.42, "gap": 415, "gapAt": 735 }],
    "material": { "shadow": false, "grain": false, "vignette": false, "rotation": true, "score": 1, "missing": ["多层投影", "纹理", "暗角"] },
    "variety": { "total": 9, "centered": 8, "centers": [482.5, 500, 493.5, 500.5, 510, 500, 490, 500, 690] },
    "color": [{ "t": 0.8, "vivid": 0.46, "dark": 1.54, "meanL": 89.69, "stdL": 12.33 }]
  }
}
~~~

kv 只读 `passed` 和 mtime；`craft` 是新增字段，不影响第 9/10 步。

## 3. 和原需求文档的差异

- 原文档的 4 条审美指标换成 **7 条 craft 检查**，全部 `warn`，不改 `passed`。
- 主体按 **60px 邻近簇** 算，不按单块；参考样张的单块 25.7% 也能通过。
- 色相桶 / 密度两条删掉（原样片上不会触发或方向不对）；色度只做信息。
- 字阶按 **每帧 max/中位** 的中位数，不按段内最大字号。
- 空白带、构图变化是新增的，直接对应"中间空 415px""8/9 段居中"。
- 材质改成 4 项可确定判断的分数（多层投影 / 纹理 / 暗角 / 离轴或胶带），至少 2/4。
- R4 的变量放 `templates/index.html` 的手写 `<style>`，不是会被 `vd build` 覆盖的 `vd:brand` 块；材质层放 `vd:segments` 和 `vd:brand` 之间，带 `data-layout-ignore`。
- 纹理由 `feTurbulence` 改成 **128×128 预渲染 PNG**：全屏纸纹仍会让 `vd qa` 从约 30s 到 48s（SVG 版 52s），这是画面内容成本，不是 craft 检查的成本；不需要纸纹时删掉 grain 层，材质仍有 3/4。

## 4. 复用情况

- 采集：复用 `inspect-page.mjs` 的 `boxOf` / `opacityOf` / `openPage` 骨架；`paints` 提出来复用。
- 判定：复用 `douyin-qa.mjs` 的 `W/H` / `CAPTION` / `summarize` 和 issue 结构。
- 编排：复用 `qa-run.mjs` 的截图循环和 `vd.mjs` 的 JSON 写出。
- 样式：复用 `/home/power/test/styleframe` 的三层投影 / 纸纹 / 暗角 / 旋转思路，改成 CSS 变量和工具类；不引入 CDN。
- 品牌数值：复用 `06-品牌资产/视觉规范.md`（大标题 110–140、要点 64–80、字幕 56），工具包只给默认下限。
- 依赖：没有新增。像素统计用浏览器自带 Canvas。

## 5. 未验证 / 未做

- **段 1 的重新排版和样片渲染**：没有动用户原工程。材质层已在副本上验证（4/4、0 ✗），但"手机放大 + 段级 104px 大标题 + 重排空白带"是内容设计工作，建议在下一期实际制作时按 `visual-craft.md` 做，再用 `vd qa` 看 craft 指标。
- **Node 22 的 `st test --strict` / CI**：本地 Node 24 的解析问题不影响 `node --test` 的证据；CI 需要实际推送后确认。
- **全片渲染**：没有重新渲染成片；本报告只验证 `vd qa`（截图/判定），没有验证编码后的观感。
- **studio 的 1 个失败**：`test-all.test.mjs` 和本任务无关，改造前就有。
- **纸纹性能**：48s（PNG）/ 52s（SVG）/ 30s（无 grain），见 2.2；如果 qa 速度是硬约束，默认模板可以去掉 grain 层。

## 6. 沉淀提议

- `pixels()` 的色度 / 暗部统计如果以后有第二个 skill 要用，再提到 `shared/node/pixels.mjs`；本期留在 video-director，避免过早抽象。
- `analyzeCraft` / `checkCraft` 依赖 1080×1920 和品牌排除规则，不建议进 `shared/`。

## 7. 结论

视觉工艺层已经落地：规则、DIRECTOR 自检、采集、7 条 craft 检查、指标输出、模板材质层和文档交叉引用都在；第 1 期副本上 `vd qa` 从"全绿"变成能报出 24 条 craft ⚠，同时 `passed` 仍为 true、0 个 ✗。用户原工程没有改，下一步可以直接在下一期里按新规则做画面。
