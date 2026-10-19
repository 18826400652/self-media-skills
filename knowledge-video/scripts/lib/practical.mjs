// 实用类一期的 15 步和 5 个确认节点（纯函数）。输入 facts 由 practical-facts.mjs 从作品目录读出来。
//   facts.steps[key] = { ok, why, content? }   这一步自己的条件满足没有；why 是没满足的原因；
//                                              content=false 表示草稿步骤的内容本身还没写好
//   facts.gates[gate] = { passed, at, quote, stale, changed }   stale：确认后相关文件的内容又改过（排版不算）；changed：改了哪些文件
export const GATE_LABEL = { topic: "① 选题关", script: "② 脚本 + 配音稿", director: "③a 导演脚本", sample: "③b 风格样片", final: "④ 成片" };
export const DRAFT_KEYS = ["wechat", "xiaohongshu", "douyin"];

export const STEPS = [
  { n: 1, key: "scenario", label: "场景卡" },
  { n: 2, key: "topic", label: "选题关", gate: "topic" },
  { n: 3, key: "test", label: "实测" },
  { n: 4, key: "draft", label: "母稿" },
  { n: 5, key: "feynman", label: "费曼检查" },
  { n: 6, key: "selfcheck", label: "自检" },
  { n: 7, key: "script", label: "抖音脚本 + 配音稿", gate: "script" },
  { n: 8, key: "director", label: "配音 + 导演脚本", gate: "director" },
  { n: 9, key: "sample", label: "风格样片", gate: "sample" },
  { n: 10, key: "render", label: "渲染 + QA", gate: "final" },
  { n: 11, key: "wechat", label: "公众号" },
  { n: 12, key: "xiaohongshu", label: "小红书" },
  { n: 13, key: "douyin", label: "抖音草稿" },
  { n: 14, key: "record", label: "发布记录" },
  { n: 15, key: "retro", label: "复盘" },
];

export const GATES = STEPS.filter((s) => s.gate).map((s) => s.gate);

const HOW = {
  scenario: "按 scenario-content 第 1 步写 场景卡.md",
  topic: "按 scenario-content 第 2 步：sc bench 抓对标，写 选题关.md",
  test: "按 scenario-content 第 3 步实测（sc rec --app 手机录屏，同一提问跑两轮），写 实测记录.md",
  draft: "按 scenario-content 第 4 步写 母稿.md",
  feynman: "按 scenario-content 第 5 步写 费曼检查.md，补回母稿",
  selfcheck: "跑 sc check，修好所有 ✗",
  script: "按 content-repurpose 写 抖音/SCRIPT.md 和 抖音/VOICE.md（vo 抖音 --check 要通过）",
  render: "写其余各段 → vd build 抖音 → vd qa 抖音 无 ✗ → vd render 抖音 → 看成片 → 按 knowledge-video references/qa.md 写 qa.json（qa.json 要比成片新：之后改画面重渲染了，要看过新成片再更新 qa.json）；vd check 抖音 列出组件候选，交成片时一起给用户",
  wechat: "写 公众号/文章.md（wa），wa draft 存草稿成功后 kv done <作品> wechat",
  xiaohongshu: "写 小红书/文案.md（标题 ≤ 20 字），vdraft <成片.mp4> --copy 小红书/文案.md --cover 抖音/out/01.png --to xiaohongshu 存草稿成功后 kv done <作品> xiaohongshu",
  douyin: "写 抖音/发布文案.md（标题 ≤ 30 字），ic render 抖音/封面.md 出封面，vdraft <成片.mp4> --copy 抖音/发布文案.md --cover 抖音/out/01.png 存草稿成功后 kv done <作品> douyin",
  record: "在 发布记录.md 填置顶评论原文",
  retro: "在经验库写这期的复盘（文件名带作品简称）",
  director: "vo 抖音 配音 → 按 video-director 写 抖音/DIRECTOR.md，vd cues 抖音 --check 通过",
  sample: "按 video-director 写样片的几段 → vd build 抖音 --sample → vd qa 抖音 无 ✗ → vd render 抖音 --sample",
};

// 内容写好、只差存草稿时怎么存（用户不让 Claude 存、要自己存的，用户说存好了再 kv done）
const SAVE_HOW = {
  wechat: "wa draft 公众号/文章.md",
  xiaohongshu: "vdraft <成片.mp4> --copy 小红书/文案.md --cover 抖音/out/01.png --to xiaohongshu",
  douyin: "vdraft <成片.mp4> --copy 抖音/发布文案.md --cover 抖音/out/01.png",
};
const saveNext = (s) => `${s.n} ${s.label}：内容已写好，只差存草稿：${SAVE_HOW[s.key]}，成功后 kv done <作品> ${s.key}；用户自己存的，用户说存好了再 kv done <作品> ${s.key}`;
const LAST_GATE_N = Math.max(...STEPS.filter((s) => s.gate).map((s) => s.n));

const gateState = (g) => (g.passed && !g.stale ? "passed" : g.passed && g.stale ? "stale" : "waiting");

export function practicalStatus(facts) {
  const rows = [];
  let next = null;
  let waitingFor = null;
  for (const s of STEPS) {
    const own = facts.steps[s.key];
    // ④ 通过后的草稿、发布记录、复盘互不依赖：各自算 ✓，内容写好没存草稿的单独标出来
    if (s.n > LAST_GATE_N && !next && !waitingFor) {
      const pendingSave = !own.ok && own.content === true && SAVE_HOW[s.key];
      rows.push({ n: s.n, key: s.key, label: s.label, done: own.ok, ...(pendingSave ? { note: "内容已写好，待存草稿" } : {}) });
      continue;
    }
    const g = s.gate ? facts.gates[s.gate] : null;
    const state = !g ? undefined : !next && own.ok ? gateState(g) : "pending";
    const done = !next && own.ok && (!g || state === "passed");
    rows.push({ n: s.n, key: s.key, label: s.label, done, ...(s.gate ? { gate: s.gate, gateState: state } : {}) });
    if (done || next) continue;
    if (!own.ok) next = `${s.n} ${s.label}：${HOW[s.key]}${own.why ? `（现在：${own.why}）` : ""}`;
    else {
      waitingFor = s.gate;
      const why = state === "stale" ? `确认后改过${g.changed?.length ? `（${g.changed.join("、")}）` : ""}，需要重新确认，` : "";
      next = `${why}等用户确认 ${GATE_LABEL[s.gate]}；用户说通过后 kv gate <作品> ${s.gate} "用户原话"`;
    }
  }
  if (!next && !waitingFor) {
    const first = STEPS.find((s) => s.n > LAST_GATE_N && !facts.steps[s.key].ok);
    if (first) {
      const own = facts.steps[first.key];
      next = own.content === true && SAVE_HOW[first.key] ? saveNext(first) : `${first.n} ${first.label}：${HOW[first.key]}${own.why ? `（现在：${own.why}）` : ""}`;
    }
  }
  return { rows, next: next ?? "这期做完了", waitingFor, ...shotRemind(facts) };
}

/** ④ 通过后、复盘还没写：台账里这期第二次出现的镜头候选要提醒用户（video-director 的缺镜头流程） */
function shotRemind(facts) {
  const final = facts.gates.final;
  if (!facts.shotQueue?.length || facts.steps.retro?.ok || !final?.passed || final.stale) return {};
  return { remind: `镜头候选该磨了：${facts.shotQueue.join("、")}（第 2 次出现）。和用户确认后按 video-director 的磨镜头流程做；不做就把台账里的 status 改成 dropped` };
}

/** 到第 n 步（含）为止，第一个挡路的原因；null = 都走完了 */
function blockerThrough(facts, n) {
  for (const s of STEPS.filter((x) => x.n <= n)) {
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
  const step = STEPS.find((s) => s.gate === gate);
  if (!step) return `没有这个确认节点：${gate}（可选：${GATES.join("、")}）`;
  return blockerThrough(facts, step.n);
}

export function doneBlocker(facts, key) {
  if (!DRAFT_KEYS.includes(key)) return `只能记 ${DRAFT_KEYS.join("、")}：${key}`;
  const step = STEPS.find((s) => s.key === key);
  const own = facts.steps[key];
  if (own.content === false) return own.why;
  const before = blockerThrough(facts, step.n - 1);
  if (before) return before;
  const g = facts.gates.final;
  return g.passed && !g.stale ? null : `${GATE_LABEL.final} 还没确认`;
}
