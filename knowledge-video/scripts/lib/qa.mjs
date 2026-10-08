// qa.json 校验：Claude 逐帧看总览图和成片抽帧后写的视觉 QA。检查项说明见 references/qa.md。
export const QA_CHECKS = ["safe-area", "text-size", "density", "typo", "fact-on-screen", "rhythm", "motion"];
const SEVERITIES = ["high", "medium", "low"];
const error = (msg) => ({ level: "error", msg });

/** @returns {{ level: "error"|"warn", msg: string }[]} */
export function validateQa(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [error("qa.json 必须是一个对象")];
  const out = [];
  if (typeof data.passed !== "boolean") out.push(error("qa.json 的 passed 必须是 true 或 false"));
  const checked = Array.isArray(data.checked) ? data.checked : [];
  const missing = QA_CHECKS.filter((c) => !checked.includes(c));
  if (missing.length) out.push(error(`qa.json 的 checked 缺少：${missing.join("、")}`));
  if (!Array.isArray(data.issues)) return [...out, error("qa.json 的 issues 必须是数组")];
  data.issues.forEach((it, i) => {
    if (!SEVERITIES.includes(it?.severity)) out.push(error(`qa.json 第 ${i + 1} 个问题：severity 只能是 high、medium、low`));
  });
  if (data.passed === true && data.issues.some((it) => it?.severity === "high")) {
    out.push(error("qa.json：passed 为 true 时不能有 high 级问题（先修好再改 passed）"));
  }
  return out;
}
