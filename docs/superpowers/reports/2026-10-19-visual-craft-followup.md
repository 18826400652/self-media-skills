# 视觉工艺后续优化验收报告（2026-10-19）

> 分支：`feat/visual-craft`。本轮 A1–C3，接在上一轮 [视觉工艺层验收报告](2026-10-19-visual-craft-check.md) 后面。
> 用户原工程没有改；C2 的样片在 `.dsh/qa-sample/抖音` 副本上做（不进 git）。

## 1. 本轮改了什么

| # | 改什么 | 文件 | 结果 |
|---|---|---|---|
| A1 | `st test` 强制 TAP reporter | `studio/scripts/lib/test-all.mjs`、`tests/test-all.test.mjs` | Node 24 也能数出真实通过数；studio 的 `test-all` 失败消失 |
| A2 | craft 告警按类汇总 + `craft.counts` | `craft.mjs`、`qa-run.mjs`、`vd.mjs`、测试 | `vd qa` 打两行：指标 + "字阶 5 · 层级 5 · …" |
| A3 | 材质按主体面积、空白带按行覆盖率 | `craft.mjs`、`tests/craft.test.mjs` | 2.2% 便利贴不再给材质分；20px 小标签填不掉 415px 的洞 |
| B1 | 项目级 craft 阈值 | `config.mjs`、`craft.mjs`、`qa-run.mjs`、`vd.mjs`、`SKILL.md`、测试 | `video-director.config.json` 可选 `craft`，非法值中文报错 |
| B2 | 构图变化加大小维度 | `craft.mjs`、测试 | `craft-variety` 同时看中心 x 和主体大小（`scaleCv` / 档位） |
| B3 | 字阶改"最大/主体字号" | `craft.mjs`、测试、文档 | 小标签拉不低中位；样片层级告警 7 → 5 |
| B4 | 拆 `craft.mjs` | 新 `scripts/lib/craft.mjs`、`tests/craft.test.mjs`；`douyin-qa.mjs` 只留抖音检查 | 测试数不变，职责分开 |
| C1 | 好段模板 `segment-hero.html` | 新模板、`segment.html` 注释、`SKILL.md`、`visual-craft.md`、模板测试 | 104px 大标题 + 860×860 卡片 + 胶带 + 三层投影 |
| C2 | 副本 seg-01 换成 hero + 样片 | 只在 `.dsh/qa-sample` | craft 0 条、材质 4/4、0 个 ✗；13.4s 样片渲染通过 |
| C3 | `st review` 汇总视觉工艺 | `review.mjs`、`monitor.test.mjs`、`studio/SKILL.md` | 各期 `qa-douyin.json` 的 `craft` 进一张表 |

## 2. 验证证据

### 2.1 测试

~~~bash
studio/bin/st test --strict
~~~

结果：**643 个用例通过，0 失败**。其中 `video-director` 189、`studio` 94、`knowledge-video` 95、`phone-draft` 131、`browser-draft` 13；`sync-shared` 一致。A1 之前同一命令会显示多个 Node 套件"0 通过"、studio 1 个失败；现在都正常。

### 2.2 第 1 期副本（改造前，已加材质层）

~~~bash
cd .dsh/qa-sample/抖音 && vd qa .
~~~

- 54 个时间点，**0 个 ✗**，52s。
- `视觉工艺：首帧 46px / 簇 35.2% · 段内字号 46–120px · 主体簇 7.2–35.2% · 空白带 415px · 材质 3/4 · 构图 8/9 段居中`
- `视觉工艺告警：字阶 5 · 层级 5 · 首帧 1 · 主体 7 · 空白 2 · 构图 1`（共 21 条；材质 3/4 不报，层级按"最大/主体"从 7 降到 5）。
- 空白带仍是 seg-06 415px、seg-09 290px；材质 3/4（多层投影 + 纹理 + 暗角；主管卡片没有离轴，便利贴 2.2% 不再算）。
- 按 A3 的新口径，**没加材质层的原工程应是材质 0/4**（不再靠 2.2% 便利贴拿离轴分）；加材质层后是 3/4。

### 2.3 好段样片（C2）

副本 seg-01 换成 `segment-hero` 的构图（大标题 + 860×860 卡片 + 胶带 + 三层投影），文案用这期的：

~~~text
视觉工艺：首帧 104px / 簇 39.8% · 段内字号 104–104px · 主体簇 39.8–39.8% · 空白带 20px · 材质 4/4 · 构图 1/1 段居中
视觉工艺告警：0 条
✓ 抖音专用检查（样片 seg-01-hook，结果 qa-douyin-sample.json）：8 个时间点，0 个 ✗
~~~

- `vd build . --sample --no-music`：**Check passed，0 error / 5 warning**（5 条都是其它段的既有 negative-z / fromTo 警告，不是 hero）。
- `vd render . --sample`：13.43s、1080×1920、h264、30fps、403 帧；`vd verify` 通过（声音平均 -24.7 dB，峰值 -5.4 dB）。
- 首帧：`.dsh/qa-sample/hero-f00-v2.png`。
- 对照：`/home/power/test/sheet/f00.png`（旧：手机 460×840、标题 46px、单层投影、无纹理）→ 新：主体簇 39.8%、标题 104px、材质 4/4、中间空白 20px。
- 途中修了两处真问题：① 印章在卡片旋转后右边缘约 932px，进右侧安全区（0 个 ✗ 前有 1 个 ✗）；把 `right` 从 60px 改到 90px。② 标题一开始和字幕重复（`说个偷懒的事` 两遍），改成 `10 秒出周报`；模板里加了"标题不要重复字幕"的注释。

样片长度是 **13.4s（整段 seg-01）**，不是计划里的 10s：段本身 13.4s，压到 10s 会截断；报告如实记录。

### 2.4 `st review` 的视觉工艺表（C3）

测试里用一期带 `craft` 的 qa 生成：

~~~text
## 视觉工艺（最近 7 天的成片）

| 期 | 首帧 | 主体簇 | 空白带 | 材质 | 构图 | ⚠ |
|---|---|---|---|---|---|---|
| AI办公/01-群聊 | 46px / 35.2% | 24.0–35.2% | 415px | 1/4 | 8/9 | 14 |
~~~

没有 `craft` 的旧 qa 会显示"没有带视觉工艺指标的 qa-douyin.json（旧工程先重跑 vd qa）"；`st review` 只读文件，不重跑 qa。

## 3. 设计决定 / Ruling

- **A3 材质门槛 5%**：主体面积 ≥5% 的块才给多层投影 / 离轴分；`tape` 是显式标记，不受面积限制。代价：很小的装饰旋转不再加分；参考样张 25.7% 的手机仍然有离轴分。
- **A3 空白带行覆盖 10%**：一行至少被 10% 内容宽覆盖才算填上；代价：一条很宽的窄装饰条仍可能把洞切开，但 20px 小标签不会。
- **B3 主体字号**：取"比最大字号小的字号里总面积最大的那个"；代价：一帧只有一个字号时 ratio = 1，会报层级（本来就没有层级）。
- **C2 样片 13.4s**：保留整段 seg-01，不压到 10s；代价：比计划长 3.4s。
- **C3 只认 `抖音/qa-douyin.json`**：不写旧目录 `抖音-director`（studio 的 no-legacy 测试会报）；代价：旧布局的工程要先按新流程重跑。

## 4. 未验证 / 注意

- CI 的 Node 22 `st test --strict`：本机 Node 24 已 643 全过；推送后需要看一次 CI。
- 用户原工程没动：C2 的样片、hero 重排、材质层都在 `.dsh/qa-sample` 副本里；要进真实一期需要用户确认。
- `templates/segment-hero.html` 里的 `at("词")` 是注释示例；复制后要把词换成 DIRECTOR.md 里真实存在的 `@词`。
- 纸纹的全屏成本仍在（约 30s → 48s qa）；本轮没有改。
- `.gitignore` 里的 `.dsh/` 是会话工具加的，未提交。

## 5. 复用 / 沉淀

- 没有新增依赖。
- A1 的 `nodeTestArgs` 可给其他跑 `node --test` 的脚本复用；目前只在 studio。
- `craftSummary / craftCounts` 在 `craft.mjs`，`st review` 复用 `craft.counts`；没有复制逻辑。
- `segment-hero` 复用了 `--vd-shadow-paper` / `--vd-type-display` / `data-vd-material`，没有新造一套样式系统。

## 6. 结论

A1–C3 全部落地并有真实证据：`st test` 643 全过；`vd qa` 的 craft 检查从"能报"变成"能按类汇总、能配阈值、能看大小"；hero 模板和 13.4s 样片把主体簇从 35.2% 提到 39.8%、首帧字号从 46 提到 104、材质从 3/4 提到 4/4，craft 告警 21 → 0；`st review` 能看到各期趋势。原工程未动，下一期可以直接按新规则做。
