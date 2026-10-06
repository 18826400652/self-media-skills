/*
 * hf-kit 场景组件：还原上班族熟悉的界面。在 kit.js 之后引用（帧模板自动引用）。
 *   Kit.chat    聊天界面（群聊、@人、文档卡、红圈）——演示场景用，默认标「情景演绎」
 *   Kit.answer  重建 AI 回答（实测原文，可推近到表格某一行）
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
      ".kit-ans-stage{position:relative;perspective:2200px}",
      ".kit-ans{position:relative;font-family:var(--kit-font);color:var(--kit-ink);background:var(--kit-surface);border:1px solid var(--kit-line);border-radius:32px;overflow:hidden;transform:rotateX(6deg) rotateY(-8deg) scale(.96);transform-origin:50% 0}",
      ".kit-ans .bar{height:84px;display:flex;align-items:center;gap:14px;padding:0 30px;border-bottom:1px solid var(--kit-line);font-weight:700}",
      ".kit-ans .logo,.kit-ans-lens .logo{flex:none;width:40px;height:40px;border-radius:50%}",
      ".kit-ans .body{padding:26px 34px 30px;line-height:1.6}",
      ".kit-ans h4{margin:6px 0 12px;font-size:1.2em}",
      ".kit-ans p{margin:0 0 12px;white-space:pre-line}",
      ".kit-ans table{width:100%;border-collapse:collapse}",
      ".kit-ans td,.kit-ans th{text-align:left;padding:12px 8px;border-bottom:1px solid color-mix(in srgb,var(--kit-ink) 10%,transparent)}",
      ".kit-ans th{color:var(--kit-muted);font-weight:500}",
      ".kit-ans-lens{position:absolute;left:20px;right:0;padding:28px 34px 34px;border-radius:32px;background:var(--kit-surface);border:2px solid color-mix(in srgb,var(--kit-accent) 55%,transparent);box-shadow:0 0 0 10px color-mix(in srgb,var(--kit-accent) 6%,transparent),0 0 80px color-mix(in srgb,var(--kit-accent) 18%,transparent),0 50px 120px rgb(0 0 0/.7)}",
      ".kit-ans-lens .src{display:flex;align-items:center;gap:12px;font-size:27px;color:var(--kit-muted);letter-spacing:.06em}",
      ".kit-ans-lens .line{display:grid;gap:20px;align-items:center;margin-top:18px;font-size:44px;font-weight:700;line-height:1.35}",
      ".kit-ans-lens .line>span{position:relative}",
      ".kit-ans-note{position:absolute;right:-6px;top:-74px;transform:rotate(4deg);background:var(--kit-danger);color:#fff;font-size:30px;font-weight:900;padding:10px 22px;border-radius:14px;white-space:nowrap}",
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

  var APPS = { DeepSeek: "#4D6BFE" }; // 头部 logo 色；新增应用在这里加

  function answerBlocks(body, blocks) {
    var table = null;
    blocks.forEach(function (b) {
      if (b.h != null) el("h4", "", body, b.h);
      else if (b.p != null) el("p", "", body, b.p);
      else if (b.table) {
        var t = el("table", "", body);
        if (b.table.head) {
          var hr = el("tr", "", t);
          b.table.head.forEach(function (h) { el("th", "", hr, h); });
        }
        var rows = b.table.rows.map(function (r) {
          var tr = el("tr", "", t);
          r.forEach(function (c) { el("td", "", tr, c); });
          return tr;
        });
        if (!table) table = { el: t, rows: rows, data: b.table.rows };
      }
    });
    return table;
  }

  /**
   * 重建 AI 回答：用实测记录里的原文排成清楚的回答界面；focus 时面板虚化，那一行放大浮出并圈出单元格。
   * { app="DeepSeek", source（必填）, blocks:[{h}|{p}|{table:{head,rows}}], at=0, size=27,
   *   focus:{ row（从 0 数）, col, at, note, noteAt } }
   * 文字必须是实测原文，source 写清出处（如「DeepSeek 原话 · 实测第 1 轮」）。
   */
  Kit.answer = function (tl, sel, o) {
    if (!o.source) throw new Error("Kit.answer: 缺少 source（写明出处，如「DeepSeek 原话 · 实测第 1 轮」）");
    var host = U.hostOf(sel);
    var T = U.tok(host);
    var app = o.app || "DeepSeek";
    var logoColor = APPS[app] || T.accent;
    var at = num(o.at, 0);
    var stage = el("div", "kit kit-ans-stage", host);
    var panel = el("div", "kit-ans", stage);
    panel.style.fontSize = num(o.size, 27) + "px";
    var bar = el("div", "bar", panel);
    el("i", "logo", bar).style.background = logoColor;
    el("span", "", bar, app);
    var table = answerBlocks(el("div", "body", panel), o.blocks || []);
    U.inFrom(tl, panel, at, 40);
    if (!o.focus) return;

    var f = o.focus;
    if (!table) throw new Error("Kit.answer: focus 需要 blocks 里有表格");
    var data = table.data[f.row];
    if (!data) throw new Error("Kit.answer: focus.row 超出表格行数（共 " + table.data.length + " 行，从 0 数）");
    var fAt = num(f.at, at + 1);
    tl.fromTo(panel, { filter: "blur(0px) brightness(1)" }, { filter: "blur(1.6px) brightness(0.62)", duration: 0.4, ease: "none" }, fAt);

    var lens = el("div", "kit-ans-lens", stage);
    var rowEl = table.rows[f.row];
    lens.style.top = Math.max(0, table.el.offsetTop + rowEl.offsetTop - 60) + "px"; // table 相对面板（已含头部高度），tr 相对 table；浮在原来那一行附近
    var src = el("div", "src", lens);
    el("i", "logo", src).style.background = logoColor;
    el("span", "", src, o.source);
    var line = el("div", "line", lens);
    line.style.gridTemplateColumns = "1fr" + " auto".repeat(data.length - 1);
    var cells = data.map(function (c) { return el("span", "", line, c); });
    tl.fromTo(lens, { opacity: 0, scale: 0.92, y: 20 }, { opacity: 1, scale: 1, y: 0, duration: 0.45, ease: U.EASE }, fAt + 0.1);
    if (f.col != null) {
      var cell = cells[f.col];
      if (!cell) throw new Error("Kit.answer: focus.col 超出列数（共 " + data.length + " 列，从 0 数）");
      cell.style.color = T.danger;
      ringAround(tl, cell, T.danger, fAt + 0.5, U.hashText(cell.textContent));
    }
    if (f.note) {
      var note = el("div", "kit-ans-note", lens, f.note);
      tl.fromTo(note, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.3, ease: U.EASE }, num(f.noteAt, fAt + 0.7));
    }
  };

  Kit._scenes = { ringAround: ringAround };
})();
