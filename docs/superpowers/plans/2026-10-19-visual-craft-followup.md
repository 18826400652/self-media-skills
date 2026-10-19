# 视觉工艺层后续优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 在已落地的视觉工艺层上继续做 10 项优化：先让 `st test` 在 Node 24 下可信（A1），再把 craft 告警汇总、判定收紧（A2/A3），然后让阈值跟项目规范走、补景别变化、改字阶口径、拆文件（B1–B4），最后做好段模板、段 1 样片和 `st review` 趋势（C1–C3）。

**Architecture:** 先做工具链和判定质量（A），再做规则可配置化和代码结构（B），最后做内容模板和复盘（C）。A/B 全部走 TDD；C1 先出模板，C2 用副本上的 seg-01 样片验证，C3 把 `qa-douyin.json` 的 `craft` 汇总进 `st review`。

**Tech Stack:** Node.js 22+（ESM、`node:test`）、puppeteer-core、HyperFrames、Canvas 像素统计；不新增依赖。

**Spec:** 本计划；上一轮的实现与证据见 `docs/superpowers/plans/2026-10-19-video-visual-craft.md` 和 `docs/superpowers/reports/2026-10-19-visual-craft-check.md`。分支继续用 `feat/visual-craft`。

---

## 全局约束

- 不新增依赖；不改 `kv` / `vo` / `vd build` 的时间轴和音频逻辑。
- 所有 craft 检查仍然只报 `warn`，不改 `passed`、不卡 kv。
- 旧工程（没有 `blocks/texts`）不崩；没有 `craft` 的旧 `qa-douyin.json` 在 `st review` 里跳过。
- 工具包不写死账号：新阈值走项目配置；默认值仍是工具包默认。
- 每个 Task 先写失败测试，再实现；提交信息用中文，一个 Task 一个 commit。
- 本机 Node 24 下 `st test` 的解析问题由 A1 修；修完用它作为全量验证命令。

## Review Focus

1. **A1 的 TAP 输出**：`--test-reporter=tap` 在 Node 22/24 都有；CI 是 Node 22，本机 24，都要能数出通过数。
2. **A3 的阈值收紧不能把参考样张判坏**：参考手机 25.7% 且有 `rotate(-4deg)`，材质应仍能拿离轴分；2.2% 的便利贴不应该拿分。
3. **B1 的配置默认值**：没写 `craft` 的项目必须和现在完全一样；写了非法值要给中文错误，不能静默。
4. **B3 的口径变化**：`max/主体字号` 不能把"一个大标题 + 很多小标签"误判成没有层级；测试要覆盖大标题 + 多小标签。
5. **C1/C2 不碰用户原工程**：只在 `.dsh/qa-sample` 副本里改；模板本身只进 `templates/`。
6. **C3 只读**：`st review` 只读 `qa-douyin.json`，不重跑 qa、不修改作品项目。

---

## 文件结构

**修改**
- `studio/scripts/lib/test-all.mjs`、`studio/tests/test-all.test.mjs`：A1
- `video-director/scripts/lib/douyin-qa.mjs`：A2/A3/B2/B3（B4 时拆走）
- `video-director/scripts/lib/qa-run.mjs`、`scripts/vd.mjs`：A2/A3/B1
- `video-director/scripts/lib/config.mjs`、`tests/config.test.mjs`：B1
- `video-director/tests/douyin-qa.test.mjs`、`tests/qa-run.test.mjs`：A2/A3/B1/B2/B3
- `video-director/templates/segment.html`、`tests/templates.test.mjs`、`SKILL.md`：C1
- `studio/scripts/lib/review.mjs`、`studio/tests/monitor.test.mjs`：C3
- `docs/superpowers/reports/2026-10-19-visual-craft-followup.md`：最终验收报告

**新建**
- `video-director/scripts/lib/craft.mjs`：B4 拆出的 craft 纯函数
- `video-director/tests/craft.test.mjs`：B4 拆出的 craft 测试（从 douyin-qa.test.mjs 移过来）
- `video-director/templates/segment-hero.html`：C1 好段模板

---

## Task A1: st test 强制 TAP reporter

**Files:**
- Modify: `studio/scripts/lib/test-all.mjs`（第 46 行附近的 spawn）
- Test: `studio/tests/test-all.test.mjs`

**Interfaces:**
- Produces: `nodeTestArgs(files) → string[]`，返回 `["--test", "--test-reporter=tap", ...files]`；`runSuite` 用它。

- [ ] **Step 1: 写失败测试**

在 `studio/tests/test-all.test.mjs` 加：

~~~js
test("st test：node --test 强制 TAP reporter，Node 24 的 spec 输出也能数通过数", () => {
  assert.deepEqual(nodeTestArgs(["tests/a.test.mjs"]), ["--test", "--test-reporter=tap", "tests/a.test.mjs"]);
});
~~~

把 `nodeTestArgs` 加进 import。

- [ ] **Step 2: 跑测试确认失败**

~~~bash
cd studio && node --test tests/test-all.test.mjs
~~~

Expected: FAIL，`nodeTestArgs is not a function` 或 import 失败。

- [ ] **Step 3: 实现**

~~~js
export const nodeTestArgs = (files) => ["--test", "--test-reporter=tap", ...files];
~~~

`runSuite` 的 spawn 改成 `spawnSync(process.execPath, nodeTestArgs(s.files), ...)`。

- [ ] **Step 4: 跑测试确认通过**

~~~bash
cd studio && node --test tests/test-all.test.mjs
~~~

Expected: PASS（原有 4 个 + 新增 1 个）。

- [ ] **Step 5: 全量验证**

~~~bash
cd /home/power/self-media-skills && studio/bin/st test --strict
~~~

Expected: 所有 Node 套件有真实通过数；studio 的 1 个失败消失；Python 套件照旧。若还有失败，记录具体用例名，不要跳过。

- [ ] **Step 6: 提交**

~~~bash
git add studio/scripts/lib/test-all.mjs studio/tests/test-all.test.mjs
git commit -m "fix(studio): st test 强制 TAP reporter，Node 24 也能数通过数"
~~~

---

## Task A2: craft 告警按类汇总 + 写进 JSON

**Files:**
- Modify: `video-director/scripts/lib/douyin-qa.mjs`（craft 区域）
- Modify: `video-director/scripts/lib/qa-run.mjs`（返回 `craft.counts`）
- Modify: `video-director/scripts/vd.mjs`（用 `craftSummary` 打印）
- Test: `video-director/tests/douyin-qa.test.mjs`、`tests/qa-run.test.mjs`

**Interfaces:**
- `craftCounts(issues) → { type, hierarchy, hook, subject, gap, material, variety }`（只数 craft-*，没有的键为 0）。
- `craftSummary(craft) → { metrics, counts } | null`：`metrics` 是现在那一行；`counts` 是 `"字阶 5 · 层级 7 · …"`；没有 segments 返回 null。
- `qa-run` 返回 `craft: { ...analyzeCraft(frames), counts: craftCounts(checkCraft(frames)) }`。
- `vd.mjs` 打印 `metrics` 和 `"⚠ 视觉工艺：" + counts`。

- [ ] **Step 1: 写失败测试**

在 `douyin-qa.test.mjs` 加：

~~~js
test("craftCounts：只数 craft-*，按类汇总", () => {
  const issues = [
    { kind: "craft-type" }, { kind: "craft-type" }, { kind: "craft-subject" }, { kind: "still" },
  ];
  assert.deepEqual(craftCounts(issues), { type: 2, hierarchy: 0, hook: 0, subject: 1, gap: 0, material: 0, variety: 0 });
});

test("craftSummary：有指标时返回两行；空 craft 返回 null", () => {
  const craft = { first: { maxFont: 46, cluster: 35.2 }, segments: [{ maxFont: 46, cluster: 35.2, gap: 70, id: "s1" }], material: { score: 1 }, variety: { centered: 8, total: 9 }, counts: { type: 2, hierarchy: 0, hook: 0, subject: 0, gap: 0, material: 1, variety: 1 } };
  const s = craftSummary(craft);
  assert.match(s.metrics, /首帧 46px/);
  assert.match(s.counts, /字阶 2/);
  assert.equal(craftSummary({ segments: [] }), null);
});
~~~

在 `qa-run.test.mjs` 的 craft 用例里断言 `r.craft.counts.type > 0`。

- [ ] **Step 2: 跑测试确认失败**

~~~bash
cd video-director && node --test tests/douyin-qa.test.mjs tests/qa-run.test.mjs
~~~

Expected: FAIL，`craftCounts is not a function`。

- [ ] **Step 3: 实现**

`douyin-qa.mjs` 加 `CRAFT_KIND_LABEL` 和两个函数；把 `vd.mjs` 里的摘要拼接移进 `craftSummary`（用数组 join，处理空数组/`cluster = null`）。`qa-run` 先算 `craftIssues = checkCraft(frames)`，再 `counts = craftCounts(craftIssues)`，把 `counts` 放进 `craft`；`warns` 用同一个 `craftIssues`，不要算两遍。

- [ ] **Step 4: 跑测试确认通过**

~~~bash
cd video-director && node --test tests/douyin-qa.test.mjs tests/qa-run.test.mjs
~~~

Expected: PASS。

- [ ] **Step 5: 提交**

~~~bash
git add video-director/scripts/lib/douyin-qa.mjs video-director/scripts/lib/qa-run.mjs video-director/scripts/vd.mjs video-director/tests/douyin-qa.test.mjs video-director/tests/qa-run.test.mjs
git commit -m "feat(vd): craft 告警按类汇总，计数写进 qa-douyin.json"
~~~

---

## Task A3: 材质按主体面积、空白带按行覆盖率

**Files:**
- Modify: `video-director/scripts/lib/douyin-qa.mjs`
- Test: `video-director/tests/douyin-qa.test.mjs`

**Interfaces:**
- `maxGap`：一行要被 ≥10% 内容宽（106px）的并集覆盖才算填上；1px/20px 的小元素不能填洞。
- 材质：`shadow` / `rotation` 只认面积 ≥5% 的绘制块；`rotation` 或 `materials` 含 `"tape"` 仍算（胶带是显式标记）。
- 消息里写清"按主体面积"。

- [ ] **Step 1: 写失败测试**

~~~js
test("checkCraft：20px 的小元素填不掉 415px 的空白带；200px 才算", () => {
  const hole = (w) => shot("s1", 1, {
    blocks: [
      block({ box: [100, 300, 900, 700] }),
      block({ box: [100, 1115, 900, 1150] }),
      block({ box: [500, 900, 500 + w, 910] }),
    ],
    texts: [text({ fontSize: 64 })],
  });
  assert.ok(kinds([hole(20)]).includes("craft-gap"));
  assert.ok(!kinds([hole(200)]).includes("craft-gap"));
});

test("checkCraft：2.2% 的旋转块不给材质分；10% 的给", () => {
  const small = shot("s1", 1, { blocks: [block({ box: [100, 300, 200, 500], rot: -4 })], texts: [text({ fontSize: 64 })] });
  const big = shot("s1", 1, { blocks: [block({ box: [100, 300, 400, 900], rot: -4 })], texts: [text({ fontSize: 64 })] });
  assert.equal(analyzeCraft([small]).material.rotation, false);
  assert.equal(analyzeCraft([big]).material.rotation, true);
});
~~~

同样加多层投影的小/大块用例。

- [ ] **Step 2: 跑测试确认失败**

~~~bash
cd video-director && node --test tests/douyin-qa.test.mjs
~~~

Expected: FAIL，小元素仍填洞 / 2.2% 仍给离轴分。

- [ ] **Step 3: 实现**

`maxGap` 改成每行收集 x 区间 → 排序合并 → 覆盖长度 ≥ `0.1 * (right-left)` 才标记。`analyzeCraft` 的 `shadow` / `rotation` 先过滤 `areaOf(b.box) >= 0.05 * W * H`；`materials.has("tape")` 不受面积限制。

- [ ] **Step 4: 跑测试确认通过**

~~~bash
cd video-director && node --test tests/douyin-qa.test.mjs
~~~

Expected: PASS。原有空白带 415px 的用例仍成立（洞里没有宽块）。

- [ ] **Step 5: 在副本上复核**

~~~bash
cd .dsh/qa-sample/抖音 && vd qa .   # 需要 PATH 指向仓库的 video-director/bin
node -e 'const j=require("./qa-douyin.json"); console.log(j.craft.material, j.craft.segments.map(s=>s.id+":"+s.gap))'
~~~

Expected: 改造前副本的材质从 1/4 变成 0/4（便利贴 2.2% 不再给分）；空白带仍是 seg-06 415、seg-09 290。把新数值写进 C 的验收报告；如果材质层已加，4/4 只应由大块投影/纹理/暗角/胶带给出。

- [ ] **Step 6: 提交**

~~~bash
git add video-director/scripts/lib/douyin-qa.mjs video-director/tests/douyin-qa.test.mjs
git commit -m "fix(vd): 材质按主体面积算，空白带按行覆盖率算"
~~~

---

## Task B1: 项目级 craft 阈值

**Files:**
- Modify: `video-director/scripts/lib/config.mjs`、`tests/config.test.mjs`
- Modify: `video-director/scripts/lib/douyin-qa.mjs`（`CRAFT_DEFAULTS`、`checkCraft(frames, craft)`）
- Modify: `video-director/scripts/lib/qa-run.mjs`（`douyinQa(..., { craft })`）
- Modify: `video-director/scripts/vd.mjs`（传 `config.craft`）
- Modify: `video-director/SKILL.md`、`references/visual-craft.md`
- Test: `tests/config.test.mjs`、`tests/douyin-qa.test.mjs`

**Interfaces:**
- `CRAFT_DEFAULTS = { typeFloor: 64, typeRatio: 1.6, hookFont: 96, hookCluster: 35, subjectMin: 30, gapMax: 250, variety: 70, scaleCv: 0.15 }`。
- `loadConfig(...).craft` 是默认值和 `c.craft` 的合并；每个值必须是正数（`hookCluster` / `variety` 0–100），否则中文报错。
- `checkCraft(frames, craft = {})` 用 `{ ...CRAFT_DEFAULTS, ...craft }`。
- `douyinQa(built, page, shotDir, { craft } = {})`。

- [ ] **Step 1: 写失败测试**

`config.test.mjs`：
- 没写 `craft` → `c.craft.typeFloor === 64`；
- 写了 `{ craft: { typeFloor: 100 } }` → 只覆盖这一项，其余默认；
- `{ craft: { typeFloor: "big" } }` → `/craft.typeFloor 必须是正数/`。

`douyin-qa.test.mjs`：
- 同一帧 96px 标题，默认不报 `craft-type`；`checkCraft([f], { typeFloor: 100 })` 报；
- `gapMax: 100` 时 150px 空白报，默认不报。

- [ ] **Step 2: 跑测试确认失败**

~~~bash
cd video-director && node --test tests/config.test.mjs tests/douyin-qa.test.mjs
~~~

Expected: FAIL，`craft` 不存在 / 阈值不生效。

- [ ] **Step 3: 实现**

把 `douyin-qa.mjs` 里的 `TYPE_FLOOR` 等常量改成 `CRAFT_DEFAULTS` 的键；`checkCraft` 的每个比较用 `o.*`。`config.mjs` 从 `douyin-qa.mjs` import `CRAFT_DEFAULTS`（纯模块，无副作用），校验后合并。`qa-run` 把 `opts.craft` 传给 `checkCraft`。`vd.mjs` 已有 `config`，直接传。

- [ ] **Step 4: 跑测试确认通过**

~~~bash
cd video-director && node --test tests/config.test.mjs tests/douyin-qa.test.mjs tests/qa-run.test.mjs
~~~

Expected: PASS。

- [ ] **Step 5: 更新文档**

`SKILL.md` 的配置说明加一行：`video-director.config.json` 可选 `craft`（阈值，默认见 visual-craft.md）。`visual-craft.md` 第 0 节加"阈值可以在项目配置里覆盖"。

- [ ] **Step 6: 提交**

~~~bash
git add video-director/scripts/lib/config.mjs video-director/scripts/lib/douyin-qa.mjs video-director/scripts/lib/qa-run.mjs video-director/scripts/vd.mjs video-director/tests/config.test.mjs video-director/tests/douyin-qa.test.mjs video-director/tests/qa-run.test.mjs video-director/SKILL.md video-director/references/visual-craft.md
git commit -m "feat(vd): craft 阈值支持项目配置（video-director.config.json 的 craft）"
~~~

---

## Task B2: 构图变化加"大小"维度

**Files:**
- Modify: `video-director/scripts/lib/douyin-qa.mjs`
- Test: `video-director/tests/douyin-qa.test.mjs`

**Interfaces:**
- `CraftMetrics.variety` 增 `scales: number[]`、`scaleBands: number`。
- 大小雷同：`scales.length ≥ 3` 且 `std/mean < scaleCv`（默认 0.15）或档位 < 3 → 和中心雷同一起报一条 `craft-variety`；消息写清是"中心"还是"大小"。

- [ ] **Step 1: 写失败测试**

- 9 段全 20% 面积、中心分开 → `craft-variety` 消息含"大小"；
- 9 段中心全 540、面积 10/20/30 交替 → 消息含"中心"；
- 中心分开 + 面积分开 → 不报。

- [ ] **Step 2: 跑测试确认失败**

~~~bash
cd video-director && node --test tests/douyin-qa.test.mjs
~~~

Expected: FAIL，`variety.scales` 不存在。

- [ ] **Step 3: 实现**

`analyzeCraft` 收集 `segments.map(s => s.cluster).filter(x => x !== null)`；计算 `mean`、`std`、`scaleBands = new Set(scales.map(x => Math.floor(x / 5))).size`。`checkCraft` 的 `craft-variety` 拼两部分消息。

- [ ] **Step 4: 跑测试确认通过**

~~~bash
cd video-director && node --test tests/douyin-qa.test.mjs
~~~

- [ ] **Step 5: 提交**

~~~bash
git add video-director/scripts/lib/douyin-qa.mjs video-director/tests/douyin-qa.test.mjs
git commit -m "feat(vd): 构图变化检查加主体大小维度"
~~~

---

## Task B3: 字阶改用"最大 / 主体字号"

**Files:**
- Modify: `video-director/scripts/lib/douyin-qa.mjs`
- Test: `video-director/tests/douyin-qa.test.mjs`
- Modify: `video-director/references/visual-craft.md`、`templates/DIRECTOR.md`（口径说明）

**Interfaces:**
- `textSizes(f)` 返回 `{ size, area }`；`frameBody(f)` 是"小于最大字号的字号里，总面积最大的那个"；`frameRatio = max / frameBody`。
- `CraftMetrics.segments[].ratio` 语义改为"最大/主体"；消息改成"最大/主体"。

- [ ] **Step 1: 写失败测试**

- 一帧 104px 大标题 + 3 行 34px 正文 + 10 个 12px 标签（标签面积小）→ ratio ≈ 3.06，不报层级；
- 42px 标题 + 32px 正文 → ratio 1.31，报；
- 只有一种字号 → ratio 1；
- 76px 大数字 + 32px 正文 → ratio 2.375，不报。

- [ ] **Step 2: 跑测试确认失败**

~~~bash
cd video-director && node --test tests/douyin-qa.test.mjs
~~~

Expected: FAIL，`frameBody` 不存在 / ratio 口径不对。

- [ ] **Step 3: 实现**

`textSizes` 用 `boxOf` 的宽高算面积；按字号累加面积；`frameBody` 取 `size < max` 里面积最大的；没有就返回 max。`frameRatio` 用它。同步改 `visual-craft.md` §4.2 和 `DIRECTOR.md` 自检行的"最大/中位"→"最大/主体"。

- [ ] **Step 4: 跑测试确认通过**

~~~bash
cd video-director && node --test tests/douyin-qa.test.mjs
~~~

- [ ] **Step 5: 副本复核**

~~~bash
cd .dsh/qa-sample/抖音 && vd qa .
~~~

Expected: 记录 seg-06 的 ratio 变化；如果 `craft-hierarchy` 不再报 seg-06，但 `craft-type` 仍报（60 < 64），说明口径变化是预期的，写进报告。

- [ ] **Step 6: 提交**

~~~bash
git add video-director/scripts/lib/douyin-qa.mjs video-director/tests/douyin-qa.test.mjs video-director/references/visual-craft.md video-director/templates/DIRECTOR.md
git commit -m "feat(vd): 字阶层级改用最大/主体字号，避免小标签拉低中位"
~~~

---

## Task B4: 拆出 craft.mjs

**Files:**
- Create: `video-director/scripts/lib/craft.mjs`
- Create: `video-director/tests/craft.test.mjs`
- Modify: `video-director/scripts/lib/douyin-qa.mjs`（只留 douyin 检查，`re-export` craft）
- Modify: `video-director/scripts/lib/qa-run.mjs`（从 craft.mjs import）
- Modify: `video-director/tests/douyin-qa.test.mjs`（craft 用例移到 craft.test.mjs）

**Interfaces:**
- `craft.mjs` 导出 `W`、`H`、`CRAFT_DEFAULTS`、`analyzeCraft`、`checkCraft`、`craftCounts`、`craftSummary`。
- `douyin-qa.mjs` 导出 `W`、`H`（供其他模块）并 `export { analyzeCraft, checkCraft, craftCounts, craftSummary, CRAFT_DEFAULTS } from "./craft.mjs"`。
- 测试数不变（B4 只搬文件）。

- [ ] **Step 1: 先跑基线**

~~~bash
cd video-director && node --test tests/*.test.mjs
~~~

Expected: 当前通过数（例如 180+），0 失败。

- [ ] **Step 2: 搬移**

把 craft 常量/几何/比例/材质/分析/检查/汇总搬到 `craft.mjs`；`douyin-qa.mjs` 的 `W/H` 改成从 `craft.mjs` import；把 `douyin-qa.test.mjs` 的 craft 测试段移到 `craft.test.mjs`，import 改到 `../scripts/lib/craft.mjs`。`qa-run.mjs` 从 `craft.mjs` import。

- [ ] **Step 3: 全量测试**

~~~bash
cd video-director && node --test tests/*.test.mjs
~~~

Expected: 通过数与 Step 1 相同，0 失败。

- [ ] **Step 4: 提交**

~~~bash
git add video-director/scripts/lib/craft.mjs video-director/scripts/lib/douyin-qa.mjs video-director/scripts/lib/qa-run.mjs video-director/tests/craft.test.mjs video-director/tests/douyin-qa.test.mjs
git commit -m "refactor(vd): 视觉工艺检查拆到 craft.mjs，douyin-qa 只留抖音检查"
~~~

---

## Task C1: 好段模板 segment-hero.html

**Files:**
- Create: `video-director/templates/segment-hero.html`
- Modify: `video-director/templates/segment.html`（注释指向 hero）
- Modify: `video-director/SKILL.md`（每段画面怎么写：首段/关键段用 hero）
- Modify: `video-director/tests/templates.test.mjs`

**目标构图（模板默认值）：**
- 主体卡片 860×860，left 110、top 280（约 **35.6%**），`box-shadow: var(--vd-shadow-paper)`，`rotate(-3deg)`。
- 段级大标题 104px（`--vd-type-display`），left 60、top 900、width 840；不压字幕带。
- 卡片内 44px 小标题 + 32px 正文；右下角红章 120×120（28px 字）。
- 胶带用真实 `div`，带 `data-vd-material="tape"`；卡片加 `data-vd-key`? **不要**：卡片会进右侧安全区，加 key 会误报；卡片里的文字照常检查。
- 动画用 `at("词")` 示例；每个动作锚到 `@词`；入场 `power3.out` 0.5s。

- [ ] **Step 1: 写失败测试**

`templates.test.mjs` 断言 hero 文件存在并含：`font-size: 104px` 或 `var(--vd-type-display)`、`var(--vd-shadow-paper)`、`data-vd-material="tape"`、`rotate(-3deg)`、`860px`、`data-composition-id="SEG_ID"`。

- [ ] **Step 2: 跑测试确认失败**

~~~bash
cd video-director && node --test tests/templates.test.mjs
~~~

Expected: FAIL，`ENOENT segment-hero.html`。

- [ ] **Step 3: 写模板**

按目标构图写 `segment-hero.html`（`SEG_ID` 占位、`gsap.set` 入场前状态、`tl.fromTo(..., immediateRender: false)`）。示例文案用占位，不写死账号。

- [ ] **Step 4: 测试 + hyperframes check**

~~~bash
cd video-director && node --test tests/templates.test.mjs
~~~

然后在副本上把模板套进一段（C2 会做），用 `vd build --sample --no-music` + `vd qa` 验证；`npx hyperframes check` 0 error。

- [ ] **Step 5: 提交**

~~~bash
git add video-director/templates/segment-hero.html video-director/templates/segment.html video-director/SKILL.md video-director/tests/templates.test.mjs
git commit -m "feat(vd): 新增好段模板 segment-hero，按视觉工艺构图"
~~~

---

## Task C2: 副本上的 seg-01 样片 + 10s 渲染

**Files:**
- 只在 `.dsh/qa-sample/抖音` 副本里改：`compositions/frames/seg-01-hook.html`、`index.html`（材质层）
- Create: `docs/superpowers/reports/2026-10-19-visual-craft-followup.md`（最终报告）

**步骤：**
- [ ] 按 C1 的 hero 构图重写 seg-01；保留原 `@词` 锚点，动画时间不改口播时间。
- [ ] `vd build . --sample --no-music` + `vd qa .`。
  - Expected: `craft.first.maxFont ≥ 96`、`cluster ≥ 35`、`material ≥ 2/4`、`craft-type/hierarchy/subject/gap/hook` 对 seg-01 不再报；没有新 ✗。
- [ ] `vd render . --sample` 出 `renders/sample.mp4`；用 `ffmpeg -ss 0.8 -i renders/sample.mp4 -frames:v 1` 抽首帧。
- [ ] 和 `/home/power/test/sheet/f00.png` 对比；把 before/after 路径写进最终报告。
- [ ] 如果 hero 重排导致安全区/字幕带冲突，先调位置，不要降低阈值。
- [ ] 提交只包含报告（副本不进 git）：

~~~bash
git add docs/superpowers/reports/2026-10-19-visual-craft-followup.md
git commit -m "docs(vd): 后续优化验收报告（craft 口径、好段模板、样片）"
~~~

---

## Task C3: st review 汇总视觉工艺

**Files:**
- Modify: `studio/scripts/lib/review.mjs`
- Test: `studio/tests/monitor.test.mjs`（现有 review 用例旁边加）

**Interfaces:**
- `craftSection(root, works)`：找 `<作品>/<系列>/<一期>/run.json` 同目录的 `抖音/qa-douyin.json`；读 `craft`；按 qa 文件 mtime 倒序，取最近 10 期。
- 输出表：`| 期 | 首帧 | 主体簇 | 空白带 | 材质 | 构图 | ⚠ |`；⚠ 用 `craft.counts` 求和；没有 `craft` 的文件跳过。
- 没有带 craft 的 qa：`没有带视觉工艺指标的 qa-douyin.json（旧工程先重跑 vd qa）`。

- [ ] **Step 1: 写失败测试**

在 `monitor.test.mjs` 加一个临时项目：`04-作品/系列/一期/run.json` + `04-作品/系列/一期/抖音/qa-douyin.json`，craft 有 first/segments/material/variety/counts；调 `review(root, { home: temp })`，断言输出含 `视觉工艺`、`46px`、`415px`、`1/4`、`8/9`；再建一个没有 craft 的 qa，断言提示"没有带视觉工艺指标"。

- [ ] **Step 2: 跑测试确认失败**

~~~bash
cd studio && node --test tests/monitor.test.mjs
~~~

Expected: FAIL，输出没有"视觉工艺"。

- [ ] **Step 3: 实现**

在 `review()` 的 `prefSection` 前插 `...craftSection(root, works)`；用现有 `runFiles` 找期目录；只读文件，不执行 vd。

- [ ] **Step 4: 跑测试确认通过**

~~~bash
cd studio && node --test tests/monitor.test.mjs
~~~

- [ ] **Step 5: 提交**

~~~bash
git add studio/scripts/lib/review.mjs studio/tests/monitor.test.mjs
git commit -m "feat(studio): st review 汇总各期视觉工艺指标"
~~~

---

## 验收标准

1. `st test --strict` 在 Node 24 和 22 上都能数出通过数；studio 的 `test-all` 失败消失。
2. A2/A3/B1/B2/B3 的单测全绿；craft 阈值可从项目配置覆盖；旧工程不崩。
3. `qa-douyin.json` 的 `craft` 有 `counts`；`vd qa` 打印指标行 + 分类计数行。
4. B4 搬完后测试数与搬前一致；`douyin-qa.mjs` 不再包含 craft 实现。
5. C1 的 hero 模板通过 `hyperframes check`；C2 在副本上 `craft.first ≥96 / ≥35% / 材质 ≥2/4`，seg-01 的 craft 告警清零，0 个 ✗。
6. C3 的 `st review` 能列出至少一期 craft 指标；没有 craft 的旧 qa 有提示。
7. 不新增依赖；不改 kv/vo/build；不碰用户原工程。

## 不在本次范围

- R5 主题包；把 craft 变成 error；用 LLM 判"好不好看"。
- 全片渲染（只做 C2 的 10s 样片）。
- 修 `studio` 之外的其他既有失败（A1 只修 `test-all` 的 TAP 解析）。
