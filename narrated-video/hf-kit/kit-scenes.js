/*
 * hf-kit 场景组件：还原上班族熟悉的界面。在 kit.js 之后引用（帧模板自动引用）。
 *   Kit.chat    聊天界面（群聊、@人、文档卡、红圈）——演示场景用，默认标「情景演绎」
 * 只用 fromTo / set，颜色读 --kit-*，渲染可复现。用法和参数见 references/hf-kit.md。
 */
(function () {
  "use strict";
  if (!window.Kit || !window.Kit._u) throw new Error("kit-scenes.js 要在 kit.js 之后引用");
  var Kit = window.Kit;
  var U = Kit._u;
  var el = U.el, num = U.num;
  var AVATAR_COLORS = ["#8FB8FF", "#F4F1EA", "#9BE3B4", "#FFB38A", "#C9A7FF", "#7FDBDA"]; // 头像底色，按人名固定分配
  var MENTION_RE = /@[^\s，。、！？,.!?]+/g;

  injectStyle();

  function injectStyle() {
    var css = [
      ".kit-chat{position:relative;font-family:var(--kit-font);color:var(--kit-ink);background:var(--kit-surface);border:1px solid var(--kit-line);border-radius:36px;overflow:hidden}",
      ".kit-chat .top{height:96px;display:flex;align-items:center;justify-content:center;gap:12px;font-size:32px;font-weight:700;border-bottom:1px solid var(--kit-line)}",
      ".kit-chat .top small{font-weight:500;color:var(--kit-muted)}",
      ".kit-chat-staged{position:absolute;right:24px;top:28px;font-size:22px;font-weight:700;letter-spacing:.08em;color:var(--kit-muted);border:1.5px solid var(--kit-line);border-radius:99px;padding:4px 14px}",
      ".kit-chat .view{position:relative;overflow:hidden}",
      ".kit-chat .list{padding:34px 34px 40px;display:flex;flex-direction:column;gap:32px}",
      ".kit-chat .msg{display:flex;gap:18px;align-items:flex-start}",
      ".kit-chat .msg.me{flex-direction:row-reverse}",
      ".kit-chat .av{flex:none;width:76px;height:76px;border-radius:20px;display:grid;place-items:center;font-size:34px;font-weight:900;color:#101114}",
      ".kit-chat .who{font-size:24px;color:var(--kit-muted);margin-bottom:8px}",
      ".kit-chat .msg.me .who{text-align:right}",
      ".kit-chat .bub{line-height:1.45;padding:18px 26px;border-radius:8px 28px 28px 28px;background:color-mix(in srgb,var(--kit-ink) 9%,transparent);border:1.5px solid color-mix(in srgb,var(--kit-ink) 8%,transparent);max-width:600px;white-space:pre-line}",
      ".kit-chat .msg.me .bub{border-radius:28px 8px 28px 28px}",
      ".kit-chat .msg.bad .bub{background:color-mix(in srgb,var(--kit-danger) 12%,transparent);border-color:color-mix(in srgb,var(--kit-danger) 50%,transparent)}",
      ".kit-chat .doc{width:640px;border-radius:28px 8px 28px 28px;background:color-mix(in srgb,var(--kit-accent) 9%,transparent);border:1.5px solid color-mix(in srgb,var(--kit-accent) 35%,transparent);padding:22px 26px}",
      ".kit-chat .doc .dh{display:flex;align-items:center;gap:12px;font-size:30px;font-weight:900}",
      ".kit-chat .doc .dh small{margin-left:auto;font-size:22px;font-weight:700;color:var(--kit-accent);border:1.5px solid color-mix(in srgb,var(--kit-accent) 50%,transparent);padding:2px 12px;border-radius:99px}",
      ".kit-chat .doc table{width:100%;margin-top:16px;border-collapse:collapse;font-size:31px}",
      ".kit-chat .doc th{text-align:left;font-size:25px;font-weight:500;color:var(--kit-muted);padding:0 6px 8px}",
      ".kit-chat .doc td{position:relative;padding:11px 6px;border-top:1px solid color-mix(in srgb,var(--kit-ink) 10%,transparent)}",
      ".kit-ring{position:absolute;left:-14%;top:-22%;width:128%;height:144%;overflow:visible;pointer-events:none}",
    ].join("\n");
    var style = document.createElement("style");
    style.setAttribute("data-kit-scenes", "");
    style.textContent = css;
    document.head.appendChild(style);
  }

  /** 在一个元素外面画手绘圈（cell 要是定位元素） */
  function ringAround(tl, cell, color, at, seed) {
    var svg = U.svgEl("svg", { class: "kit-ring", viewBox: "0 0 100 100", preserveAspectRatio: "none" }, cell);
    var variants = [0, 1, 2].map(function (k) { return U.wobblyEllipse(50, 50, 47, 44, seed + k * 7); });
    var ring = U.svgEl("path", { d: variants[0], fill: "none", stroke: color, "stroke-width": 4, "stroke-linecap": "round", "vector-effect": "non-scaling-stroke" }, svg);
    ring.style.opacity = 0;
    ring.style.filter = "drop-shadow(0 0 8px " + color + ")";
    var end = U.drawOn(tl, ring, at, 0.5);
    U.boil(tl, ring, variants, end, at + 6);
  }

  /** 文字里的 @某人 用强调色（用文本节点拼，不解析 HTML） */
  function textWithMentions(parent, text) {
    var last = 0, m;
    MENTION_RE.lastIndex = 0;
    while ((m = MENTION_RE.exec(text))) {
      parent.appendChild(document.createTextNode(text.slice(last, m.index)));
      el("span", "kit-acc", parent, m[0]);
      last = m.index + m[0].length;
    }
    parent.appendChild(document.createTextNode(text.slice(last)));
  }

  function avatar(parent, msg, T) {
    var av = el("div", "av", parent, Array.from(msg.from)[0]);
    av.style.background = msg.me
      ? "linear-gradient(135deg," + T.accent + ",color-mix(in srgb," + T.accent + " 70%,#e08a00))"
      : AVATAR_COLORS[U.hashText(msg.from) % AVATAR_COLORS.length];
  }

  function docCard(tl, parent, d, T) {
    var card = el("div", "doc", parent);
    var dh = el("div", "dh", card, d.title);
    if (d.tag) el("small", "", dh, d.tag);
    var table = el("table", "", card);
    if (d.head) {
      var hr = el("tr", "", table);
      d.head.forEach(function (h) { el("th", "", hr, h); });
    }
    var cells = d.rows.map(function (row) {
      var tr = el("tr", "", table);
      return row.map(function (c) { return el("td", "", tr, c); });
    });
    if (d.mark) {
      var cell = cells[d.mark.row] && cells[d.mark.row][d.mark.col];
      if (!cell) throw new Error("Kit.chat: doc.mark 指向不存在的单元格（第 " + d.mark.row + " 行第 " + d.mark.col + " 列，从 0 数）");
      cell.style.fontWeight = "700";
      tl.fromTo(cell, { color: T.ink }, { color: T.danger, duration: 0.2, ease: "none" }, num(d.mark.at, 1));
      ringAround(tl, cell, T.danger, num(d.mark.at, 1), U.hashText(cell.textContent));
    }
  }

  /**
   * 聊天界面：消息按口播一条条弹出，超出高度时整体上推。
   * { title, count, staged=true, at=0, stagger=0.5, height=760, size=34,
   *   messages:[{ from, text, me, tone:"bad", doc:{ title, tag, head, rows, mark:{row,col,at} }, at }] }
   * 这是演示场景，默认在角上标「情景演绎」；AI 的回答不要用它伪造，用 Kit.answer 放实测原文。
   */
  Kit.chat = function (tl, sel, o) {
    var host = U.hostOf(sel);
    var T = U.tok(host);
    var size = num(o.size, 34);
    var box = el("div", "kit kit-chat", host);
    var top = el("div", "top", box, o.title || "");
    if (o.count) el("small", "", top, "(" + o.count + ")");
    if (o.staged !== false) el("div", "kit-chat-staged", box, "情景演绎");
    var view = el("div", "view", box);
    view.style.height = num(o.height, 760) - 96 + "px";
    var list = el("div", "list", view);
    U.inFrom(tl, box, Math.max(0, num(o.at, 0) - 0.3), 30);

    var items = U.itemsWithTimes(o.messages, num(o.at, 0), num(o.stagger, 0.5));
    var nodes = items.map(function (x) {
      var m = x.o;
      var row = el("div", "msg" + (m.me ? " me" : "") + (m.tone === "bad" ? " bad" : ""), list);
      avatar(row, m, T);
      var col = el("div", "", row);
      el("div", "who", col, m.from);
      if (m.doc) docCard(tl, col, m.doc, T);
      if (m.text != null) {
        var bub = el("div", "bub", col);
        bub.style.fontSize = size + "px";
        textWithMentions(bub, m.text);
      }
      return row;
    });

    // 布局定了再量：每条消息出现时，如果底部超出可视区就把列表往上推
    var viewH = view.clientHeight, pad = 40, shift = 0;
    nodes.forEach(function (row, i) {
      var at = items[i].at;
      tl.fromTo(row, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.35, ease: U.EASE }, at);
      var need = Math.max(0, row.offsetTop + row.offsetHeight + pad - viewH);
      if (need > shift) {
        tl.fromTo(list, { y: -shift }, { y: -need, duration: 0.35, ease: U.EASE }, at);
        shift = need;
      }
    });
  };

  Kit._scenes = { ringAround: ringAround };
})();
