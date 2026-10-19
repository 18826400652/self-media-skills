// 段与段之间的平移转场：前一段多留 overlap 秒、平移出去，后一段同时从同方向平移进来（spec 5.4）
// 后一段的开始时间不动：段里 VD.at() 和组件 cues 都从段开头算，挪开始时间会让所有动作错位
const ROTATION = ["pan-left", "pan-up", "pan-right", "pan-down"];
const r3 = (x) => Math.round(x * 1000) / 1000;

const isShotDirector = (segments) => segments.some((s) => s.custom || String(s.component ?? "").startsWith("dy-shot-"));

/** 每段的宿主时间和进出方向；老 DIRECTOR（一个镜头、custom 都没有）保持硬切 */
export function transitionPlan(segments, { overlap = 0.6, minSeg = 1.2 } = {}) {
  const plan = segments.map((s) => ({ id: s.id, start: s.start, duration: s.duration, enter: null, exit: null }));
  if (!isShotDirector(segments)) return plan;
  let turn = 0;
  for (let i = 0; i < segments.length - 1; i++) {
    const a = segments[i], b = segments[i + 1];
    if (a.transition === "none" || a.duration < minSeg || b.duration < minSeg) continue;
    const dir = a.transition && a.transition !== "auto" ? a.transition : ROTATION[turn++ % ROTATION.length];
    const value = `${dir}:${overlap}`;
    plan[i] = { ...plan[i], duration: r3(plan[i].duration + overlap), exit: value };
    plan[i + 1] = { ...plan[i + 1], enter: value };
  }
  return plan;
}
