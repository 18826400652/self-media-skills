// 一期视频走到哪了：按「文件有没有 + 确认节点过没过」找第一个没完成的阶段。
// 阶段：brief → research → script → storyboard → render → review → done；确认节点：script ①、storyboard ②、final ③
const step = (stage, next, waitingFor = null) => ({ stage, next, waitingFor });

/** @returns {{ stage: string, next: string, waitingFor: "script"|"storyboard"|"final"|null }} */
export function detectStatus(f) {
  if (!f.hasBrief) return step("brief", "从 templates/brief.md 复制，写清这期一句话讲明白什么、跟观众有什么关系");
  if (!f.hasEvidence) {
    return f.type === "practical"
      ? step("research", "按 scenario-content 做实测，写 实测记录.md（同一提问跑两轮并录屏）")
      : step("research", "按 references/research.md 查资料，写 research.json（每条事实带来源和原文摘录）");
  }
  if (!f.hasScript) return step("script", "按类型档案的结构配方写 抖音/SCRIPT.md，每句标「**依据:**」");
  if (!f.gates.script) {
    return f.checkOk
      ? step("script", "kv brief 生成研究简报，请用户确认研究简报和脚本（确认节点 ①）", "script")
      : step("script", "先修好 kv check 报的 ✗");
  }
  if (!f.hasStoryboard || !f.hasSheet) return step("storyboard", "写 STORYBOARD 的 build 行 → nv hf-audio → nv hf-build --snap");
  if (!f.gates.storyboard) return step("storyboard", "请用户看 snapshots/sheet.jpg（确认节点 ②）", "storyboard");
  if (!f.hasRender) return step("render", "nv render 渲染成片（自带成片检查）");
  if (!f.qa) return step("review", "按 references/qa.md 逐帧看图，写 qa.json");
  if (!f.qa.passed) return step("review", "qa.json 有未修的问题：修好 high 级问题，重写 qa.json");
  if (!f.gates.final) return step("review", "请用户看成片（确认节点 ③）", "final");
  return step("done", "写经验库记录（三个节点的修改、QA 问题、缺的组件），读一遍规律.md 看要不要更新");
}
