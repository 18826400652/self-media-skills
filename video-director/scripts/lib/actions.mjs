// 段里能直接用的动作库：vd build 注入到 index.html 的 vd:head，段脚本调 window.VDACT.*
// 一律先 gsap.set 初态再 tl.to（seek 安全；不用 fromTo，避开 immediateRender 的坑）
export const ACTIONS_JS = `
window.VDACT = {
  pushIn: function (tl, sel, dur, opts) {
    var o = opts || {};
    gsap.set(sel, { scale: o.from == null ? 1 : o.from, transformOrigin: "50% 45%" });
    tl.to(sel, { scale: o.to == null ? 1.05 : o.to, duration: dur, ease: "none" }, 0);
  },
  popIn: function (tl, sel, at, opts) {
    var o = opts || {};
    gsap.set(sel, { opacity: 0, y: o.y == null ? 24 : o.y });
    tl.to(sel, { opacity: 1, y: 0, duration: o.dur == null ? 0.45 : o.dur, ease: "power3.out" }, at);
  },
  stamp: function (tl, sel, at) {
    gsap.set(sel, { opacity: 0, scale: 1.6, rotate: -8 });
    tl.to(sel, { opacity: 1, scale: 1, rotate: -8, duration: 0.3, ease: "back.out(1.4)" }, at);
  },
  highlight: function (tl, sel, at) {
    gsap.set(sel, { scaleX: 0, transformOrigin: "0% 50%" });
    tl.to(sel, { scaleX: 1, duration: 0.35, ease: "power2.out" }, at);
  },
  // 段与段之间的平移转场：宿主上的 data-vd-enter / data-vd-exit（"pan-left:0.6"）由 vd build 写；endAt = 口播里这段结束的秒数
  panInOut: function (tl, root, endAt) {
    var host = root.parentElement;
    var off = { "pan-left": [1080, 0], "pan-right": [-1080, 0], "pan-up": [0, 1920], "pan-down": [0, -1920] };
    var parse = function (v) { if (!v) return null; var p = v.split(":"); return off[p[0]] ? { d: off[p[0]], dur: Number(p[1]) } : null; };
    var enter = parse(host && host.getAttribute("data-vd-enter"));
    var exit = parse(host && host.getAttribute("data-vd-exit"));
    if (enter) {
      gsap.set(root, { x: enter.d[0], y: enter.d[1], filter: "blur(12px)" });
      tl.to(root, { x: 0, y: 0, filter: "blur(0px)", duration: enter.dur, ease: "power2.inOut" }, 0);
    }
    if (exit) tl.to(root, { x: -exit.d[0], y: -exit.d[1], filter: "blur(12px)", duration: exit.dur, ease: "power2.inOut" }, endAt);
  },
  maskReveal: function (tl, sel, at) {
    gsap.set(sel, { clipPath: "inset(0 100% 0 0)" });
    tl.to(sel, { clipPath: "inset(0 0% 0 0)", duration: 0.45, ease: "power2.inOut" }, at);
  }
};
`;
