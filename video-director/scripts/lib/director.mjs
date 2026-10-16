// 解析 DIRECTOR.md：给人看的正文 + 一个 ```json vd 机器块
export const SECTIONS = ["## 1. 视觉方案", "## 2. 分段", "## 3. 导演规则自检", "## 4. 音乐", "## 5. 账号固定元素", "## 6. 新增内容", "## 7. 样片范围", "## 8. 组件候选"];
const BLOCK = /```json vd\s*\n([\s\S]*?)\n```/g;
// @词：遇到空白、@、#、|、中英文标点、引号、括号即结束；可带 #序号（| 用来隔开组件 cues 里的几个 @词）
const TOKEN = /(?<!\\)@([^\s@#，。、：；！？,.;:!?"'`「」『』“”‘’（）()\[\]【】<>|]+)(?:#(\d+))?/g;
const HEX = /^#[0-9A-Fa-f]{6}$/;
const COMPONENT = /^dy-[a-z0-9-]+$/;

export function parseDirector(md) {
  const errors = [];
  const blocks = [...md.matchAll(BLOCK)];
  let vd = null;
  if (blocks.length === 0) errors.push("缺少 ```json vd 机器块（放在 DIRECTOR.md 末尾，结构见 templates/DIRECTOR.md）");
  else if (blocks.length > 1) errors.push(`\`\`\`json vd 机器块只能有一个，现在有 ${blocks.length} 个`);
  else {
    try { vd = JSON.parse(blocks[0][1]); } catch (err) { errors.push(`机器块 JSON 格式错误：${err.message}`); }
  }
  for (const s of SECTIONS) if (!md.includes(s)) errors.push(`缺少章节「${s}」`);
  if (md.includes("（待填）")) errors.push("还有（待填）没写完");
  if (vd) errors.push(...checkVd(vd));

  const seen = new Set();
  const tokens = [];
  // 反引号只是排版，`@一张表` 照样是锚点；只有写法说明里的 `@词`、`@词#2` 不算
  for (const m of md.replace(/`@词(?:#\d+)?`/g, "").matchAll(TOKEN)) {
    const t = { text: m[1], nth: m[2] ? Number(m[2]) : 1, raw: m[0] };
    const key = `${t.text}#${t.nth}`;
    if (!seen.has(key)) { seen.add(key); tokens.push(t); }
  }
  return { vd, tokens, errors, candidates: parseCandidates(md) };
}

/** 第 8 节「组件候选」的表格：| 画面 | 建议组件名 | 变量 | 来源段 |，跳过表头、分隔行和「无」 */
function parseCandidates(md) {
  const at = md.indexOf("## 8. 组件候选");
  if (at < 0) return [];
  const out = [];
  for (const line of md.slice(at).split("\n").slice(1)) {
    if (line.startsWith("## ") || line.startsWith("```")) break;
    if (!line.trim().startsWith("|")) continue;
    const [scene = "", name = "", vars = "", from = ""] = line.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((c) => c.replaceAll("\\|", "|").trim());
    if (!scene || scene === "画面" || scene === "无" || /^:?-+:?$/.test(scene)) continue;
    out.push({ scene, name, vars, from });
  }
  return out;
}

function checkVd(vd) {
  const e = [];
  for (const k of ["bg", "ink", "muted", "accent", "alert"]) if (!HEX.test(vd.palette?.[k] ?? "")) e.push(`palette.${k} 必须是 #RRGGBB`);
  if (!vd.kicker) e.push("缺少 kicker（栏目标签文字）");
  else if (/^（.*）$/.test(vd.kicker.trim())) e.push(`kicker（栏目标签）还没填：${vd.kicker}`);
  if (!Array.isArray(vd.segments) || !vd.segments.length) e.push("segments 不能为空");
  (Array.isArray(vd.segments) ? vd.segments : []).forEach((s, i) => {
    if (s.component !== undefined && !COMPONENT.test(s.component)) e.push(`segments[${i}].component 必须是 dykit 组件名（dy-开头）`);
    if (s.vars !== undefined && (typeof s.vars !== "object" || s.vars === null || Array.isArray(s.vars))) e.push(`segments[${i}].vars 必须是对象`);
  });
  for (const k of ["title", "body"]) if (vd.fonts?.[k] !== undefined && !["serif", "sans"].includes(vd.fonts[k])) e.push(`fonts.${k} 只能是 serif 或 sans`);
  (vd.sfx ?? []).forEach((s, i) => { if (!/^@\S/.test(s.at ?? "")) e.push(`sfx[${i}].at 必须写成 @词`); });
  if (vd.music && !/^@\S/.test(vd.music.drop ?? "")) e.push("music.drop 必须写成 @词（或把 music 写成 null）");
  for (const k of ["next", "question", "cta"]) if (!vd.ending?.[k]) e.push(`ending.${k} 不能为空`);
  if (!(vd.ending?.hold >= 0)) e.push("ending.hold 必须是不小于 0 的秒数");
  if (!/^@\S/.test(vd.sample?.end ?? "")) e.push("sample.end 必须写成 @词");
  return e;
}

/** 在解析结果上再查：分段从第 1 句连续覆盖到第 lineCount 句；sample 引用的段存在 */
export function validateDirector({ vd, errors }, lineCount) {
  const e = [...errors];
  if (!vd?.segments) return e;
  const ids = new Set();
  const covered = new Map();
  for (const s of vd.segments) {
    if (ids.has(s.id)) e.push(`段 id 重复：${s.id}`);
    ids.add(s.id);
    const [a, b] = s.lines ?? [];
    for (let n = a; n <= b; n++) covered.set(n, (covered.get(n) ?? 0) + 1);
  }
  for (let n = 1; n <= lineCount; n++) {
    if (!covered.has(n)) e.push(`第 ${n} 句没有分到任何段`);
    else if (covered.get(n) > 1) e.push(`第 ${n} 句同时分到了多个段`);
  }
  for (const id of vd.sample?.segments ?? []) if (!ids.has(id)) e.push(`sample.segments 里的 ${id} 不是已定义的段`);
  return e;
}
