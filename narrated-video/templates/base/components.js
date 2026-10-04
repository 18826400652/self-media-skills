// 声明式动画：根据元素上的 data-* 属性自动往 GSAP 时间轴里加动画，每期视频基本不用写 JS。
//
//   入场  data-enter="up|left|right|pop|fade|mark"   元素从这个方向出现（mark 为荧光笔划线）
//         data-at="3"        第 3 句口播开始时；"3+0.5" 再晚 0.5 秒；"s2" 场景 s2 开始；省略 = 所在场景开始
//         data-stagger="0.3" 改为让子元素依次入场，间隔 0.3 秒
//         data-dur="0.5"     动画时长
//   效果  data-fx="dim|focus|fill|flyin|pulse"（可以写多个，用空格分开）
//         data-fx-at="7"     效果的时间，写法同 data-at
//         dim：变暗；focus：放大并用高亮色描边；fill：进度条涨到 data-fill（%）；
//         flyin：nv-funnel 的条目依次飞进 .target；pulse：跳动几下
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
  };

  const num = (v, fallback) => (v === undefined || v === "" ? fallback : Number(v));
  const startOf = (el) => num(el && el.dataset.start, 0);
  const highlight = () => getComputedStyle(document.documentElement).getPropertyValue("--highlight").trim();

  function lineStart(n) {
    const cap = document.getElementById("cap-" + n);
    return cap ? startOf(cap) : 0; // 未配音前字幕不存在，按 0 处理
  }

  /** "" → 所在场景开始；"3" → 第 3 句；"s2" → 元素 #s2 开始；可加 "+0.5" */
  function resolveAt(el, spec) {
    const m = String(spec || "").match(/^([^+]*)(?:\+([\d.]+))?$/);
    const ref = m ? m[1].trim() : "";
    const offset = m && m[2] ? Number(m[2]) : 0;
    if (!ref) return startOf(el.closest(".scene")) + offset;
    if (/^\d+$/.test(ref)) return lineStart(Number(ref)) + offset;
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
  };

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
        { duration: num(el.dataset.dur, 0.5), ease: "power3.out", ...vars, stagger: stagger },
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
    return tl;
  };
})();
