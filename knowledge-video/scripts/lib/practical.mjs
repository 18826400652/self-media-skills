// 实用类一期的 14 步和 4 个确认节点（纯函数）。输入 facts 由 practical-facts.mjs 从作品目录读出来。
//   facts.steps[key] = { ok, why, content? }   这一步自己的条件满足没有；why 是没满足的原因；
//                                              content=false 表示草稿步骤的内容本身还没写好
//   facts.gates[gate] = { passed, at, quote, stale }   stale：确认后相关文件又改过
export const GATE_LABEL = { topic: "① 选题关", script: "② 脚本 + 配音稿", storyboard: "③ 分镜总览图", director: "③a 导演脚本", sample: "③b 风格样片", final: "④ 成片" };
export const DRAFT_KEYS = ["wechat", "xiaohongshu", "douyin"];

export const STEPS = [
  { n: 1, key: "scenario", label: "场景卡" },
  { n: 2, key: "topic", label: "选题关", gate: "topic" },
  { n: 3, key: "test", label: "实测" },
  { n: 4, key: "draft", label: "母稿" },
  { n: 5, key: "feynman", label: "费曼检查" },
  { n: 6, key: "selfcheck", label: "自检" },
  { n: 7, key: "script", label: "抖音脚本 + 配音稿", gate: "script" },
  { n: 8, key: "storyboard", label: "配音 + 分镜", gate: "storyboard" },
  { n: 9, key: "render", label: "渲染 + QA", gate: "final" },
  { n: 10, key: "wechat", label: "公众号" },
  { n: 11, key: "xiaohongshu", label: "小红书" },
  { n: 12, key: "douyin", label: "抖音草稿" },
  { n: 13, key: "record", label: "发布记录" },
  { n: 14, key: "retro", label: "复盘" },
];

const DIRECTOR_VIDEO = [
  { key: "director", label: "配音 + 导演脚本", gate: "director" },
  { key: "sample", label: "风格样片", gate: "sample" },
];

/** 这种做法的步骤：director 把第 8 步「配音 + 分镜」换成导演脚本、风格样片两步，后面顺延编号 */
export function stepsFor(video = "template") {
  if (video !== "director") return STEPS;
  const at = STEPS.findIndex((s) => s.key === "storyboard");
  return [...STEPS.slice(0, at), ...DIRECTOR_VIDEO, ...STEPS.slice(at + 1)].map((s, i) => ({ ...s, n: i + 1 }));
}

export const gatesFor = (video = "template") => stepsFor(video).filter((s) => s.gate).map((s) => s.gate);

const HOW = {
  scenario: "按 scenario-content 第 1 步写 场景卡.md",
  topic: "按 scenario-content 第 2 步：sc bench 抓对标，写 选题关.md",
  test: "按 scenario-content 第 3 步实测（nv rec --app 手机录屏，同一提问跑两轮），写 实测记录.md",
  draft: "按 scenario-content 第 4 步写 母稿.md",
  feynman: "按 scenario-content 第 5 步写 费曼检查.md，补回母稿",
  selfcheck: "跑 sc check，修好所有 ✗",
  script: "按 content-repurpose 和 narrated-video 写 抖音/SCRIPT.md 和 抖音/VOICE.md（nv hf-audio 抖音 --check 要通过）",
  storyboard: "nv hf-audio 配音 → 写 STORYBOARD 的 build 行 → nv hf-build --snap（越框检查要通过）",
  render: "nv render 渲染，按 knowledge-video references/qa.md 写 qa.json",
  wechat: "写 公众号/文章.md（wa），wa draft 存草稿成功后 kv done <作品> wechat",
  xiaohongshu: "写 小红书/文案.md（标题 ≤ 20 字），nv draft <成片.mp4> --copy 小红书/文案.md --to xiaohongshu 存草稿成功后 kv done <作品> xiaohongshu",
  douyin: "写 抖音/发布文案.md（标题 ≤ 30 字），ic render 抖音/封面.md 出封面，nv draft <成片.mp4> --copy 抖音/发布文案.md 存草稿成功后 kv done <作品> douyin",
  record: "在 发布记录.md 填置顶评论原文",
  retro: "在经验库写这期的复盘（文件名带作品简称）",
  director: "nv hf-audio 抖音 配音 → 按 video-director 新建 抖音-director/，写 DIRECTOR.md，vd cues 抖音-director --check 通过",
  sample: "按 video-director 写样片的几段 → vd build 抖音-director --sample → vd qa 无 ✗ → npx hyperframes render -o renders/sample.mp4",
  renderDirector: "写其余各段 → vd build 抖音-director → vd qa 无 ✗ → nv render 抖音-director，按 knowledge-video references/qa.md 写 qa.json；vd check 列出组件候选，交成片时一起给用户",
};

const how = (key, video) => (key === "render" && video === "director" ? HOW.renderDirector : HOW[key]);

const gateState = (g) => (g.passed && !g.stale ? "passed" : g.passed && g.stale ? "stale" : "waiting");

export function practicalStatus(facts) {
  const rows = [];
  let next = null;
  let waitingFor = null;
  for (const s of stepsFor(facts.video)) {
    const own = facts.steps[s.key];
    const g = s.gate ? facts.gates[s.gate] : null;
    const state = !g ? undefined : !next && own.ok ? gateState(g) : "pending";
    const done = !next && own.ok && (!g || state === "passed");
    rows.push({ n: s.n, key: s.key, label: s.label, done, ...(s.gate ? { gate: s.gate, gateState: state } : {}) });
    if (done || next) continue;
    if (!own.ok) next = `${s.n} ${s.label}：${how(s.key, facts.video)}${own.why ? `（现在：${own.why}）` : ""}`;
    else {
      waitingFor = s.gate;
      const why = state === "stale" ? "确认后改过，需要重新确认，" : "";
      next = `${why}等用户确认 ${GATE_LABEL[s.gate]}；用户说通过后 kv gate <作品> ${s.gate} "用户原话"`;
    }
  }
  return { rows, next: next ?? "这期做完了", waitingFor };
}

/** 到第 n 步（含）为止，第一个挡路的原因；null = 都走完了 */
function blockerThrough(facts, n) {
  for (const s of stepsFor(facts.video).filter((x) => x.n <= n)) {
    const own = facts.steps[s.key];
    if (!own.ok) return `第 ${s.n} 步 ${s.label} 还没做完${own.why ? `：${own.why}` : ""}`;
    const g = s.gate && facts.gates[s.gate];
    if (g && s.n < n) {
      if (!g.passed) return `${GATE_LABEL[s.gate]} 还没确认`;
      if (g.stale) return `${GATE_LABEL[s.gate]} 确认后改过，需要重新确认`;
    }
  }
  return null;
}

export function gateBlocker(facts, gate) {
  const step = stepsFor(facts.video).find((s) => s.gate === gate);
  if (!step) return `没有这个确认节点：${gate}（可选：${gatesFor(facts.video).join("、")}）`;
  return blockerThrough(facts, step.n);
}

export function doneBlocker(facts, key) {
  if (!DRAFT_KEYS.includes(key)) return `只能记 ${DRAFT_KEYS.join("、")}：${key}`;
  const step = stepsFor(facts.video).find((s) => s.key === key);
  const own = facts.steps[key];
  if (own.content === false) return own.why;
  const before = blockerThrough(facts, step.n - 1);
  if (before) return before;
  const g = facts.gates.final;
  return g.passed && !g.stale ? null : `${GATE_LABEL.final} 还没确认`;
}
