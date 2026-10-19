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
  maskReveal: function (tl, sel, at) {
    gsap.set(sel, { clipPath: "inset(0 100% 0 0)" });
    tl.to(sel, { clipPath: "inset(0 0% 0 0)", duration: 0.45, ease: "power2.inOut" }, at);
  }
};
`;
