// 声明式动画：根据元素上的 data-* 属性自动往 GSAP 时间轴里加动画，每期视频基本不用写 JS。
//
//   入场  data-enter="up|left|right|pop|fade|mark|slam|stamp"   元素从这个方向出现
//         （mark 荧光笔划线；slam 从大到小砸下来，用于大字；stamp 盖章，带一点旋转）
//         data-at="3"        第 3 句口播开始时；"3+0.5" 再晚 0.5 秒；"s2" 场景 s2 开始；省略 = 所在场景开始
//                 "3@数错了"  第 3 句说到「数错了」时（按字数比例估算），也可再加 "+0.2"
//         data-stagger="0.3" 改为让子元素依次入场，间隔 0.3 秒
//         data-dur="0.5"     动画时长
//   效果  data-fx="dim|focus|fill|flyin|pulse|shake"（可以写多个，用空格分开）
//         data-fx-at="7"     效果的时间，写法同 data-at
//         dim：变暗；focus：放大并用高亮色描边；fill：进度条涨到 data-fill（%）；
//         flyin：nv-funnel 的条目依次飞进 .target；pulse：跳动几下；shake：抖一下（翻车、出错）
//   镜头  nv-shot 上写 data-cam="11:1 0.5 0.5; 11@第五条:1.9 0.44 0.24"
//         分号分隔的关键帧「时间:缩放 中心x 中心y」，中心是截图上的比例坐标（0-1），镜头平滑推过去
//   全局  #root 上写 data-drift="0.04"：每个场景在持续时间里缓慢推近 4%，画面不会「死」住
//         字幕自动弹入，字幕里的重点词在说到它时再跳一下
//
// 用法：const tl = gsap.timeline({ paused: true }); nvAnimate(tl); 之后可以继续写自定义动画。
// 只用确定性逻辑（不读时间、不随机），保证每次渲染一致。
(function () {
  const ENTER = {
    up: { y: 50, opacity: 0 },
    left: { x: -60, opacity: 0 },
    right: { x: 80, opacity: 0 },
    pop: { scale: 0, opacity: 0, ease: "back.out(2)" },
    fade: { opacity: 0 },
    mark: { "--mark": "0%", ease: "power2.inOut" },
    slam: { scale: 2.4, opacity: 0, ease: "expo.out", duration: 0.45 },
    stamp: { scale: 3, rotation: -14, opacity: 0, ease: "back.out(1.6)", duration: 0.35 },
  };
  const CAM_MOVE = 0.9; // 镜头移动时长

  const num = (v, fallback) => (v === undefined || v === "" ? fallback : Number(v));
  const startOf = (el) => num(el && el.dataset.start, 0);
  const highlight = () => getComputedStyle(document.documentElement).getPropertyValue("--highlight").trim();

  function lineStart(n) {
    const cap = document.getElementById("cap-" + n);
    return cap ? startOf(cap) : 0; // 未配音前字幕不存在，按 0 处理
  }

  /** 第 n 句说到 word 的时间：按字数比例估算（与 sync.mjs 的 wordTime 一致） */
  function wordTime(n, word) {
    const cap = document.getElementById("cap-" + n);
    if (!cap) return 0;
    const text = cap.textContent;
    const idx = text.indexOf(word);
    if (idx < 0) throw new Error("第 " + n + " 句的字幕里找不到「" + word + "」");
    const speech = num(cap.dataset.speech, num(cap.dataset.duration, 0));
    return startOf(cap) + ([...text.slice(0, idx)].length / [...text].length) * speech;
  }

  /** "" → 所在场景开始；"3" → 第 3 句；"3@词" → 第 3 句说到「词」；"s2" → 元素 #s2 开始；可加 "+0.5" */
  function resolveAt(el, spec) {
    const m = String(spec || "").match(/^([^+@]*)(?:@([^+]+))?(?:\+([\d.]+))?$/);
    if (!m) throw new Error("看不懂的时间写法：" + spec);
    const ref = m[1].trim();
    const offset = m[3] ? Number(m[3]) : 0;
    if (!ref) return startOf(el.closest(".scene")) + offset;
    if (/^\d+$/.test(ref)) return (m[2] ? wordTime(Number(ref), m[2].trim()) : lineStart(Number(ref))) + offset;
    return startOf(document.getElementById(ref)) + offset;
  }

  const FX = {
    dim(tl, el, at) {
      tl.to(el, { opacity: 0.3, duration: 0.4 }, at);
    },
    focus(tl, el, at) {
      const color = highlight();
      tl.to(el, { scale: 1.08, borderColor: color, duration: 0.4, ease: "back.out(2)" }, at);
      tl.to(el.querySelectorAll(".big, .value"), { color: color, duration: 0.4 }, at);
    },
    fill(tl, el, at) {
      const bar = el.querySelector("i") || el;
      const to = num(el.dataset.fill, 100) + "%";
      tl.fromTo(bar, { width: "0%" }, { width: to, duration: num(el.dataset.fillDur, 2.5), ease: "none" }, at);
    },
    flyin(tl, el, at) {
      const target = el.querySelector(".target");
      const items = el.querySelectorAll(".items > *");
      if (!target || !items.length) return;
      const dx = (item) => target.offsetLeft + target.offsetWidth / 2 - (item.offsetLeft + item.offsetWidth / 2);
      tl.to(
        items,
        { x: (i, item) => dx(item), scale: 0.3, opacity: 0, duration: 0.5, stagger: 0.25, ease: "power2.in" },
        at,
      );
    },
    pulse(tl, el, at) {
      tl.to(el, { scale: 1.12, duration: 0.2, yoyo: true, repeat: 5 }, at);
    },
    shake(tl, el, at) {
      const xs = [-18, 16, -12, 9, -5, 0]; // 固定序列，保证每次渲染一致
      xs.forEach((x, i) => tl.to(el, { x: x, duration: 0.05, ease: "none" }, at + i * 0.05));
    },
  };

  /** nv-shot 镜头：把截图上的 (cx, cy) 推到画框中央，并缩放到 s 倍 */
  function camera(tl, shot) {
    const cam = shot.querySelector(".cam");
    if (!cam) throw new Error("nv-shot 里缺少 .cam");
    const w = shot.clientWidth;
    const h = shot.clientHeight;
    const keys = shot.dataset.cam.split(/[;；]/).map((k) => k.trim()).filter(Boolean).map((k) => {
      const i = k.lastIndexOf(":");
      const [scale, cx, cy] = k.slice(i + 1).trim().split(/\s+/).map(Number);
      return { at: resolveAt(shot, k.slice(0, i)), scale: scale, cx: cx, cy: cy };
    });
    const pose = (k) => ({ x: w / 2, y: h / 2, xPercent: -100 * k.scale * k.cx, yPercent: -100 * k.scale * k.cy, scale: k.scale });
    gsap.set(cam, { transformOrigin: "0 0", ...pose(keys[0]) });
    keys.slice(1).forEach((k) => tl.to(cam, { ...pose(k), duration: CAM_MOVE, ease: "power2.inOut" }, k.at));
  }

  /** 字幕弹入；字幕里的重点词说到时再跳一下 */
  function captions(tl) {
    document.querySelectorAll(".caption").forEach((cap) => {
      const start = startOf(cap);
      tl.from(cap, { scale: 0.86, opacity: 0, duration: 0.16, ease: "back.out(2)" }, start);
      const n = Number(cap.dataset.line);
      cap.querySelectorAll("mark").forEach((mark) => {
        tl.to(mark, { y: -16, duration: 0.12, yoyo: true, repeat: 1, ease: "power2.out" }, Math.max(start, wordTime(n, mark.textContent)));
      });
    });
  }

  /** 场景缓慢推近 */
  function drift(tl) {
    const amount = num(document.getElementById("root").dataset.drift, 0);
    if (!amount) return;
    document.querySelectorAll(".scene").forEach((scene) => {
      tl.fromTo(scene, { scale: 1 }, { scale: 1 + amount, duration: num(scene.dataset.duration, 0), ease: "none" }, startOf(scene));
    });
  }

  window.nvAt = (id) => startOf(document.getElementById(id));
  window.nvLine = lineStart;

  window.nvAnimate = function (tl) {
    document.querySelectorAll("[data-enter]").forEach((el) => {
      const vars = ENTER[el.dataset.enter];
      if (!vars) throw new Error("未知的 data-enter：" + el.dataset.enter);
      const stagger = num(el.dataset.stagger, 0);
      const targets = stagger ? el.children : el;
      tl.from(
        targets,
        { ease: "power3.out", ...vars, duration: num(el.dataset.dur, vars.duration || 0.5), stagger: stagger },
        resolveAt(el, el.dataset.at),
      );
    });

    document.querySelectorAll("[data-fx]").forEach((el) => {
      const at = resolveAt(el, el.dataset.fxAt);
      el.dataset.fx.split(/\s+/).forEach((name) => {
        if (!FX[name]) throw new Error("未知的 data-fx：" + name);
        FX[name](tl, el, at);
      });
    });

    document.querySelectorAll(".nv-shot[data-cam]").forEach((shot) => camera(tl, shot));
    captions(tl);
    drift(tl);
    return tl;
  };
})();
