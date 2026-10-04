/*
 * hf-kit：HyperFrames 画面组件库（讲解类竖屏视频）。
 *
 * 用法（在 compositions/frames/NN-*.html 里）：
 *   <div id="f03-shot" style="position:absolute;left:60px;top:560px;width:960px"></div>
 *   <script src="compositions/kit/kit.js"></script>
 *   <script>
 *     var tl = gsap.timeline({ paused: true });
 *     Kit.shot(tl, "#f03-shot", { src: "assets/a.png", size: [1610, 800], at: 0, ... });
 *     window.__timelines["03-evidence"] = tl;
 *   </script>
 *
 * 每个组件 = 一个函数 Kit.xxx(tl, 宿主选择器, 选项)：把画面建在宿主元素里，把动画加进这一帧的时间轴。
 * 同一组件在一帧、一个视频里可以用多次。时间（at 等）是相对这一帧开头的秒数，按配音逐字时间填写。
 * 颜色和字体只读 CSS 变量 --kit-*（见 TOKENS），品牌在项目配置 hfKit.tokens 里设置，由 nv hf-kit 写入。
 * 部分动效参考了 HyperFrames 组件库（Apache-2.0）的 strikethrough-replace、vox-annotate、
 * hw-callout-circle、streaming-text、typed-prompt、ui-focus-zoom。
 */
(function () {
  "use strict";
  if (window.Kit) return;

  // 默认值是中性配色；nv hf-kit 复制时会把下面这一行替换成项目配置
  var TOKENS = /*KIT_TOKENS*/ { accent: "#5B8CFF", ink: "#F5F5F5", muted: "#8A8A8A", bg: "#111111", surface: "#1C1C1C", line: "#2E2E2E", font: '"Noto Sans SC", sans-serif', mono: '"JetBrains Mono", "Noto Sans SC", monospace' } /*END_KIT_TOKENS*/;

  var EASE = "power3.out";
  var SVG_NS = "http://www.w3.org/2000/svg";
  var STREAM_GAPS = [0.167, 0.1, 0, 0.367, 0, 0.167, 0.133, 0.1, 0.1, 0.133, 0.167, 0.133, 0, 0.233, 0.167, 0.1, 0, 0.133, 0.133, 0.1];

  injectStyle();

  /* ---------- 通用工具 ---------- */

  function injectStyle() {
    var vars = Object.keys(TOKENS).map(function (k) { return "--kit-" + k + ":" + TOKENS[k] + ";"; }).join("");
    var css = [
      ":root{" + vars + "}",
      ".kit{position:relative;font-family:var(--kit-font);color:var(--kit-ink);line-height:1.25}",
      ".kit svg{overflow:visible}",
      ".kit-acc{color:var(--kit-accent)}",
      ".kit-muted{color:var(--kit-muted)}",
      ".kit-cap{font-size:28px;font-weight:700;letter-spacing:.12em;color:var(--kit-muted);margin-bottom:20px}",
      ".kit-strike{display:flex;align-items:center;gap:.35em;font-weight:900;white-space:nowrap}",
      ".kit-strike .o{position:relative;display:inline-block}",
      ".kit-strike .o i{position:absolute;left:-4%;right:-4%;top:52%;height:.09em;background:var(--kit-accent);transform-origin:left center}",
      ".kit-line{font-weight:900;white-space:normal}",
      ".kit-key{position:relative;display:inline-block;white-space:nowrap}",
      ".kit-key>span{position:relative;z-index:1}",
      ".kit-key>svg{position:absolute;z-index:0;pointer-events:none}",
      ".kit-note{position:absolute;white-space:nowrap;font-weight:700;color:var(--kit-accent)}",
      ".kit-shot-win{position:relative;overflow:hidden;border:1px solid var(--kit-line);background:var(--kit-surface)}",
      ".kit-shot-world{position:absolute;left:0;top:0;transform-origin:0 0}",
      ".kit-shot-world img{display:block}",
      ".kit-over{position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;pointer-events:none}",
      ".kit-stream p{margin:0;font-weight:500}",
      ".kit-stream .w{opacity:0}",
      ".kit-prompt{background:var(--kit-surface);border:1px solid var(--kit-line);padding:36px 40px}",
      ".kit-prompt .t{white-space:pre-wrap;font-weight:500}",
      ".kit-prompt .c{display:inline-block;width:.08em;height:1em;margin-left:.06em;vertical-align:-.12em;background:var(--kit-accent)}",
      ".kit-tag{font-family:var(--kit-mono);font-size:26px;font-weight:700;letter-spacing:.08em;color:var(--kit-accent);margin-bottom:18px}",
      ".kit-cmp{display:flex;flex-direction:column;gap:28px}",
      ".kit-card{background:var(--kit-surface);border:1px solid var(--kit-line);padding:32px 36px}",
      ".kit-card.good{border-color:var(--kit-accent)}",
      ".kit-card .tag{font-size:30px;font-weight:900;margin-bottom:14px}",
      ".kit-card .body{font-weight:500}",
      ".kit-card.bad .body{color:var(--kit-muted)}",
      ".kit-num{font-weight:900;color:var(--kit-accent);line-height:1;white-space:nowrap}",
      ".kit-num>span{display:inline-block;line-height:1}",
      ".kit-num .u{font-size:.36em;margin-left:.12em}",
      ".kit-num-label{font-size:40px;font-weight:700;color:var(--kit-ink);margin-top:20px}",
      ".kit-tpl{background:var(--kit-surface);border-top:8px solid var(--kit-accent);padding:40px 44px}",
      ".kit-tpl .ttl{font-size:46px;font-weight:900;margin-bottom:28px}",
      ".kit-tpl .ln{font-weight:500;margin:0 0 18px}",
      ".kit-tpl .ph{color:var(--kit-bg);background:var(--kit-accent);padding:0 .2em;margin:0 .08em;font-weight:700}",
      ".kit-tpl .ft{font-size:30px;color:var(--kit-muted);margin-top:26px}",
    ].join("\n");
    var style = document.createElement("style");
    style.setAttribute("data-kit", "");
    style.textContent = css;
    document.head.appendChild(style);
  }

  // 实际生效的颜色：帧里可以用 --kit-* 覆盖默认值（SVG 描边和颜色渐变需要具体色值）
  function tok(host) {
    var cs = getComputedStyle(host);
    var out = {};
    Object.keys(TOKENS).forEach(function (k) { out[k] = cs.getPropertyValue("--kit-" + k).trim() || TOKENS[k]; });
    return out;
  }

  function hostOf(sel) {
    var host = typeof sel === "string" ? document.querySelector(sel) : sel;
    if (!host) throw new Error("Kit: 找不到宿主元素 " + sel);
    return host;
  }

  function el(tag, cls, parent, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    if (parent) parent.appendChild(node);
    return node;
  }

  function svgEl(tag, attrs, parent) {
    var node = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(node);
    return node;
  }

  function num(v, d) {
    var n = Number(v);
    return isFinite(n) ? n : d;
  }

  // 确定性伪随机（同一 seed 每次结果相同，渲染可复现）
  function rng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashText(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  // 平滑闭合曲线：点列 → Catmull-Rom 转三次贝塞尔
  function smoothPath(pts) {
    var d = "M " + pts[0][0].toFixed(1) + " " + pts[0][1].toFixed(1);
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      var c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      var c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += " C " + [c1, c2, p2].map(function (p) { return p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(", ");
    }
    return d;
  }

  // 手绘椭圆：起笔和收笔错开一点，半径有轻微起伏
  function wobblyEllipse(cx, cy, rx, ry, seed) {
    var r = rng(seed);
    var a0 = -2.2 + r() * 0.4, sweep = Math.PI * 2 + 0.45;
    var pts = [];
    for (var i = 0; i <= 14; i++) {
      var a = a0 + (sweep * i) / 14;
      var k = 1 + (r() - 0.5) * 0.08 + (i === 14 ? 0.06 : 0);
      pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
    }
    return smoothPath(pts);
  }

  // 描线动画：路径从无到有画出来
  function drawOn(tl, path, at, dur, opacity) {
    var len = path.getTotalLength() * 1.15;
    path.style.strokeDasharray = len + " " + len;
    tl.set(path, { opacity: opacity == null ? 1 : opacity }, at);
    tl.fromTo(path, { strokeDashoffset: len }, { strokeDashoffset: 0, duration: dur, ease: "power2.inOut" }, at);
    return at + dur;
  }

  // 手绘「抖动」：画完后按固定节奏换几种略有差异的笔迹（逐帧确定，不是随机抖）
  function boil(tl, path, variants, from, until) {
    var step = 1 / 6;
    var i = 0;
    for (var t = from + step; t < until; t += step) {
      tl.set(path, { attr: { d: variants[i % variants.length] } }, t);
      i++;
    }
  }

  function inFrom(tl, node, at, y) {
    tl.fromTo(node, { opacity: 0, y: y == null ? 30 : y }, { opacity: 1, y: 0, duration: 0.45, ease: EASE }, at);
  }

  // 一行大字放不下时自动缩小字号，保证不折行（中文按每字 1em 估算）
  function fitSize(host, text, size) {
    var w = host.clientWidth;
    if (!w) return size;
    return Math.min(size, Math.floor(w / (Array.from(text).length + 0.3)));
  }

  // 把「列编号」这样的关键词从一行字里拆出来
  function splitKey(parent, text, key) {
    var i = key ? text.indexOf(key) : -1;
    if (i < 0) {
      parent.appendChild(document.createTextNode(text));
      return null;
    }
    parent.appendChild(document.createTextNode(text.slice(0, i)));
    var wrap = el("span", "kit-key", parent);
    el("span", "", wrap, key);
    parent.appendChild(document.createTextNode(text.slice(i + key.length)));
    return wrap;
  }

  /* ---------- 组件 ---------- */

  var Kit = {};

  /** 划掉换新：「一下午」被划掉，换成「8 秒」。{ from, to, at, inAt=0, size=140 } */
  Kit.strike = function (tl, sel, o) {
    var host = hostOf(sel);
    var T = tok(host);
    var size = fitSize(host, o.from + o.to + "  ", num(o.size, 140)), at = num(o.at, 1), inAt = num(o.inAt, 0);
    var box = el("div", "kit kit-strike", host);
    box.style.fontSize = size + "px";
    var old = el("span", "o", box, o.from);
    var line = el("i", "", old);
    var neu = el("span", "kit-acc", box, o.to);
    inFrom(tl, old, inAt);
    tl.fromTo(line, { scaleX: 0 }, { scaleX: 1, duration: 0.32, ease: "power2.out" }, at);
    tl.fromTo(old, { color: T.ink }, { color: T.muted, duration: 0.3, ease: "none" }, at + 0.1);
    tl.fromTo(neu, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.4, ease: EASE }, at + 0.28);
  };

  /** 荧光笔：一行字里的关键词被涂上底色。{ text, key, at, inAt=0, size=110, style="highlight"|"underline" } */
  Kit.marker = function (tl, sel, o) {
    var host = hostOf(sel);
    var T = tok(host);
    var size = fitSize(host, o.text, num(o.size, 110)), at = num(o.at, 1), inAt = num(o.inAt, 0);
    var line = el("div", "kit kit-line", host);
    line.style.fontSize = size + "px";
    var key = splitKey(line, o.text, o.key);
    inFrom(tl, line, inAt);
    if (!key) return;
    key.classList.add("kit-acc");
    var under = o.style === "underline";
    var svg = svgEl("svg", { viewBox: "0 0 100 40", preserveAspectRatio: "none" }, key);
    svg.style.cssText = under
      ? "left:-2%;width:104%;top:88%;height:18%"
      : "left:-4%;width:108%;top:50%;height:45%";
    var path = svgEl("path", {
      d: under ? "M 2 20 C 24 14, 52 26, 98 16" : "M 2 22 C 26 17, 58 26, 98 19",
      fill: "none",
      stroke: T.accent,
      "stroke-width": under ? 9 : 36,
      "stroke-linecap": "round",
    }, svg);
    path.style.opacity = 0;
    drawOn(tl, path, at, 0.5, under ? 1 : 0.32);
  };

  /** 圈词加注释：圈出关键词，引线连到一句说明。{ text, key, note, at, inAt=0, size=96, seed } */
  Kit.annotate = function (tl, sel, o) {
    var host = hostOf(sel);
    var T = tok(host);
    var size = fitSize(host, o.text, num(o.size, 96)), at = num(o.at, 1), inAt = num(o.inAt, 0);
    var line = el("div", "kit kit-line", host);
    line.style.whiteSpace = "nowrap";
    line.style.paddingTop = Math.round(size * 0.9) + "px";
    line.style.fontSize = size + "px";
    var key = splitKey(line, o.text, o.key);
    inFrom(tl, line, inAt);
    if (!key) return;
    var seed = o.seed || hashText(o.key);
    var svg = svgEl("svg", { viewBox: "0 0 100 100", preserveAspectRatio: "none" }, key);
    svg.style.cssText = "left:-10%;width:120%;top:-14%;height:128%";
    var variants = [0, 1, 2].map(function (k) { return wobblyEllipse(50, 50, 48, 46, seed + k * 7); });
    var ring = svgEl("path", { d: variants[0], fill: "none", stroke: T.accent, "stroke-width": 3, "stroke-linecap": "round", "vector-effect": "non-scaling-stroke" }, svg);
    ring.style.strokeWidth = Math.max(4, size * 0.05) + "px";
    ring.style.opacity = 0;
    var end = drawOn(tl, ring, at, 0.6);
    boil(tl, ring, variants, end, num(o.until, at + 6));
    if (!o.note) return;
    // 说明写在关键词上方；关键词靠右时右对齐，靠左时左对齐，避免出界
    var toRight = key.offsetLeft + key.offsetWidth / 2 < (host.clientWidth || 960) / 2;
    var note = el("div", "kit-note", key, o.note);
    note.style.cssText = (toRight ? "left:40%" : "right:40%") + ";bottom:150%;font-size:" + Math.max(36, Math.round(size * 0.46)) + "px";
    var conn = svgEl("svg", { viewBox: "0 0 100 100", preserveAspectRatio: "none" }, key);
    conn.style.cssText = (toRight ? "left:45%" : "right:45%") + ";width:30%;bottom:88%;height:62%";
    var cpd = toRight ? "M 5 95 C 10 60, 20 30, 40 6" : "M 95 95 C 90 60, 80 30, 60 6";
    var cp = svgEl("path", { d: cpd, fill: "none", stroke: T.accent, "stroke-linecap": "round", "vector-effect": "non-scaling-stroke" }, conn);
    cp.style.strokeWidth = "3px";
    cp.style.opacity = 0;
    drawOn(tl, cp, at + 0.4, 0.35);
    tl.fromTo(note, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.3, ease: EASE }, at + 0.68);
  };

  /**
   * 截图证据：截图出现 → 推近到重点 → 手绘圈逐个圈出并写说明。
   * { src, size:[原图宽,原图高], width=宿主宽, height=按比例, caption, inAt=0,
   *   zoom:{ x, y, scale=2, at, dur=0.9 },   // x/y 是原图像素坐标
   *   marks:[{ x, y, r=20, at, label, side="below"|"above"|"left"|"right" }] }
   * 圈的位置按推近后的画面计算，所以圈要安排在推近结束之后。
   */
  Kit.shot = function (tl, sel, o) {
    var host = hostOf(sel);
    var T = tok(host);
    var iw = o.size[0], ih = o.size[1];
    var W = num(o.width, host.clientWidth || 960);
    var s = W / iw;
    var H = num(o.height, Math.round(ih * s));
    var inAt = num(o.inAt, 0);
    var box = el("div", "kit", host);
    if (o.caption) inFrom(tl, el("div", "kit-cap", box, o.caption), inAt, 0);
    var stage = el("div", "", box);
    stage.style.cssText = "position:relative;width:" + W + "px;height:" + H + "px";
    var win = el("div", "kit-shot-win", stage);
    win.style.cssText = "width:" + W + "px;height:" + H + "px";
    var world = el("div", "kit-shot-world", win);
    var img = el("img", "", world);
    img.src = o.src;
    img.alt = "";
    img.style.cssText = "width:" + W + "px;height:" + Math.round(ih * s) + "px";
    inFrom(tl, win, inAt, 40);

    // 推近：目标点移到窗口中心，且不露出截图以外的背景
    var S = 1, tx = 0, ty = 0;
    if (o.zoom) {
      S = num(o.zoom.scale, 2);
      var dw = W * S, dh = ih * s * S;
      tx = Math.min(0, Math.max(W - dw, W / 2 - o.zoom.x * s * S));
      ty = Math.min(0, Math.max(H - dh, H / 2 - o.zoom.y * s * S));
      tl.fromTo(world, { x: 0, y: 0, scale: 1 }, { x: tx, y: ty, scale: S, duration: num(o.zoom.dur, 0.9), ease: "power3.inOut" }, num(o.zoom.at, inAt + 0.6));
    }

    var over = svgEl("svg", { class: "kit-over", viewBox: "0 0 " + W + " " + H }, stage);
    (o.marks || []).forEach(function (m, idx) {
      var cx = m.x * s * S + tx, cy = m.y * s * S + ty;
      var r = num(m.r, 20) * s * S;
      var rx = r * 1.25, ry = r * 1.05;
      var seed = 11 + idx * 13;
      var variants = [0, 1, 2].map(function (k) { return wobblyEllipse(cx, cy, rx, ry, seed + k * 7); });
      var ring = svgEl("path", { d: variants[0], fill: "none", stroke: T.accent, "stroke-width": 5, "stroke-linecap": "round" }, over);
      ring.style.opacity = 0;
      var at = num(m.at, 1);
      var end = drawOn(tl, ring, at, 0.55);
      boil(tl, ring, variants, end, num(o.until, at + 6));
      if (!m.label) return;
      var side = m.side || "below";
      var gap = 70;
      var lx = cx + (side === "left" ? -rx - gap : side === "right" ? rx + gap : -rx * 0.2);
      var ly = cy + (side === "above" ? -ry - gap : side === "below" ? ry + gap : 0);
      var sx = cx + (side === "left" ? -rx : side === "right" ? rx : 0);
      var sy = cy + (side === "above" ? -ry : side === "below" ? ry : 0);
      var conn = svgEl("path", {
        d: "M " + sx.toFixed(1) + " " + sy.toFixed(1) + " Q " + ((sx + lx) / 2 + 18).toFixed(1) + " " + ((sy + ly) / 2).toFixed(1) + " " + lx.toFixed(1) + " " + ly.toFixed(1),
        fill: "none", stroke: T.accent, "stroke-width": 3.5, "stroke-linecap": "round",
      }, over);
      conn.style.opacity = 0;
      drawOn(tl, conn, end - 0.1, 0.3);
      var label = el("div", "kit-note", stage, m.label);
      label.style.fontSize = num(m.labelSize, 48) + "px";
      var tf = side === "left" ? "translate(-100%,-50%)" : side === "right" ? "translate(0,-50%)" : side === "above" ? "translate(-50%,-100%)" : "translate(-50%,0)";
      label.style.left = lx + "px";
      label.style.top = ly + "px";
      label.style.transform = tf;
      tl.fromTo(label, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: EASE }, end + 0.12);
    });
  };

  /** AI 原话逐段出现（模仿流式输出的节奏）。{ text, at, size=52, source, rate=1 } */
  Kit.stream = function (tl, sel, o) {
    var host = hostOf(sel);
    var T = tok(host);
    var at = num(o.at, 0.4), rate = num(o.rate, 1);
    var box = el("div", "kit kit-stream", host);
    if (o.source) inFrom(tl, el("div", "kit-cap", box, o.source), Math.max(0, at - 0.3), 0);
    var p = el("p", "", box);
    p.style.fontSize = num(o.size, 52) + "px";
    p.style.lineHeight = "1.5";
    var tokens = o.text.match(/[“”‘’"\/，。、；：！？,.;:!?（）()]|[^“”‘’"\/，。、；：！？,.;:!?（）()]{1,2}/g) || [];
    var t = at;
    tokens.forEach(function (tok, i) {
      var w = el("span", "w", p, tok);
      if (i > 0) t += STREAM_GAPS[i % STREAM_GAPS.length] * rate;
      tl.set(w, { opacity: 1 }, t);
      tl.fromTo(w, { color: T.muted }, { color: T.ink, duration: 0.27, ease: "none" }, t);
    });
  };

  /** 提示词一个字一个字打出来（可多行）。{ text, at, label="提问", size=44, cps=14, inAt } */
  Kit.prompt = function (tl, sel, o) {
    var host = hostOf(sel);
    var T = tok(host);
    var at = num(o.at, 0.5), inAt = num(o.inAt, Math.max(0, at - 0.4));
    var box = el("div", "kit kit-prompt", host);
    if (o.label !== "") el("div", "kit-tag", box, o.label || "提问");
    var line = el("div", "", box);
    line.style.fontSize = num(o.size, 44) + "px";
    line.style.lineHeight = "1.5";
    var text = el("span", "t", line);
    el("span", "c", line);
    inFrom(tl, box, inAt);
    // 按 1-3 字一组打字，节奏固定（同一句每次一样）
    var r = rng(hashText(o.text));
    var stops = [0], pos = 0;
    while (pos < o.text.length) {
      pos = Math.min(o.text.length, pos + 1 + Math.floor(r() * 3));
      stops.push(pos);
    }
    var cps = num(o.cps, 14);
    var dur = o.text.length / cps;
    var proxy = { i: 0 };
    tl.fromTo(proxy, { i: 0 }, {
      i: stops.length - 1, duration: dur, ease: "none",
      onUpdate: function () { text.textContent = o.text.slice(0, stops[Math.round(proxy.i)]); },
    }, at);
  };

  /** 手绘箭头：在宿主坐标里从 from 指向 to。{ from:[x,y], to:[x,y], at, bend=0.25, label, seed } */
  Kit.arrow = function (tl, sel, o) {
    var host = hostOf(sel);
    var T = tok(host);
    var at = num(o.at, 1);
    var svg = svgEl("svg", { class: "kit-over" }, host);
    var x1 = o.from[0], y1 = o.from[1], x2 = o.to[0], y2 = o.to[1];
    var dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy);
    var bend = num(o.bend, 0.25);
    var mx = (x1 + x2) / 2 - (dy / len) * len * bend, my = (y1 + y2) / 2 + (dx / len) * len * bend;
    var r = rng(o.seed || 5);
    var pts = [];
    for (var i = 0; i <= 8; i++) {
      var t = i / 8, u = 1 - t;
      var j = i > 0 && i < 8 ? (r() - 0.5) * 6 : 0;
      pts.push([u * u * x1 + 2 * u * t * mx + t * t * x2 + j, u * u * y1 + 2 * u * t * my + t * t * y2 + j]);
    }
    var body = svgEl("path", { d: smoothPath(pts), fill: "none", stroke: T.accent, "stroke-width": 6, "stroke-linecap": "round" }, svg);
    body.style.opacity = 0;
    var end = drawOn(tl, body, at, 0.5);
    var ang = Math.atan2(y2 - my, x2 - mx), hl = 28;
    var head = svgEl("path", {
      d: "M " + (x2 - hl * Math.cos(ang - 0.45)).toFixed(1) + " " + (y2 - hl * Math.sin(ang - 0.45)).toFixed(1) +
        " L " + x2 + " " + y2 + " L " + (x2 - hl * Math.cos(ang + 0.45)).toFixed(1) + " " + (y2 - hl * Math.sin(ang + 0.45)).toFixed(1),
      fill: "none", stroke: T.accent, "stroke-width": 6, "stroke-linecap": "round", "stroke-linejoin": "round",
    }, svg);
    tl.fromTo(head, { opacity: 0 }, { opacity: 1, duration: 0.12, ease: "none" }, end - 0.05);
    if (o.label) {
      var label = el("div", "kit-note", host, o.label);
      label.style.cssText += ";font-size:" + num(o.labelSize, 52) + "px;left:" + x1 + "px;top:" + y1 + "px;transform:translate(-50%,-120%)";
      inFrom(tl, label, Math.max(0, at - 0.3), 16);
    }
  };

  /** 对比卡：上面是错的/以前的，下面是对的/现在的。{ bad:{tag,text}, good:{tag,text}, at:[a,b], size=44 } */
  Kit.compare = function (tl, sel, o) {
    var host = hostOf(sel);
    var T = tok(host);
    var ats = o.at || [0.3, 1.5];
    var box = el("div", "kit kit-cmp", host);
    [["bad", o.bad, ats[0]], ["good", o.good, ats[1]]].forEach(function (row) {
      var card = el("div", "kit-card " + row[0], box);
      el("div", "tag " + (row[0] === "good" ? "kit-acc" : "kit-muted"), card, row[1].tag);
      var body = el("div", "body", card, row[1].text);
      body.style.fontSize = num(o.size, 44) + "px";
      inFrom(tl, card, num(row[2], 0));
    });
  };

  /** 大数字：可从 countFrom 数到 value。{ value, unit, label, at, countFrom, size=300 } */
  Kit.number = function (tl, sel, o) {
    var host = hostOf(sel);
    var T = tok(host);
    var at = num(o.at, 0.3);
    var box = el("div", "kit", host);
    var n = el("div", "kit-num", box);
    n.style.fontSize = num(o.size, 300) + "px";
    var v = el("span", "", n, String(o.value));
    if (o.unit) el("span", "u", n, o.unit);
    inFrom(tl, n, at, 40);
    if (o.countFrom != null && isFinite(Number(o.value))) {
      var target = Number(o.value), proxy = { v: Number(o.countFrom) };
      var digits = (String(o.value).split(".")[1] || "").length;
      tl.fromTo(proxy, { v: Number(o.countFrom) }, {
        v: target, duration: num(o.countDur, 0.8), ease: "power2.out",
        onUpdate: function () { v.textContent = proxy.v.toFixed(digits); },
      }, at);
    }
    if (o.label) {
      // 大字的字形框比行高大约 0.23em，说明文字要让开，否则会和数字的文字框重叠
      var lab = el("div", "kit-num-label", box, o.label);
      lab.style.marginTop = Math.round(num(o.size, 300) * 0.25) + "px";
      inFrom(tl, lab, at + 0.25, 16);
    }
  };

  /** 模板卡：可截图保存的提问模板，【】里的内容高亮成要替换的部分。{ title, lines:[], at, stagger=0.25, size=40, footer } */
  Kit.template = function (tl, sel, o) {
    var host = hostOf(sel);
    var T = tok(host);
    var at = num(o.at, 0.3), stagger = num(o.stagger, 0.25);
    var card = el("div", "kit kit-tpl", host);
    if (o.title) el("div", "ttl", card, o.title);
    inFrom(tl, card, at);
    (o.lines || []).forEach(function (text, i) {
      var p = el("p", "ln", card);
      p.style.fontSize = num(o.size, 40) + "px";
      text.split(/(【[^】]*】)/).forEach(function (part) {
        if (!part) return;
        if (part.charAt(0) === "【") el("span", "ph", p, part.slice(1, -1));
        else p.appendChild(document.createTextNode(part));
      });
      inFrom(tl, p, at + 0.3 + i * stagger, 16);
    });
    if (o.footer) inFrom(tl, el("div", "ft", card, o.footer), at + 0.4 + (o.lines || []).length * stagger, 0);
  };

  window.Kit = Kit;
})();
