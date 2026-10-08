/*
 * hf-kit 场景组件：还原上班族熟悉的界面。在 kit.js 之后引用（帧模板自动引用）。
 *   Kit.chat    聊天界面（群聊、@人、文档卡、红圈）——演示场景用，默认标「情景演绎」
 *   Kit.answer  重建 AI 回答（实测原文，可推近到表格某一行）
 *   Kit.attach  问题打进输入框、文件卡飞进附件栏（「先把文件发给它」）——默认标「示例」
 *   Kit.pick    一摞资料落下、打叉，挑出几页飞出来排开（「别整本扔，挑几页」）——默认标「示例」
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
      /* 动作画面（attach / pick）；角上的「示例」标签 */
      ".kit-tag-demo{position:absolute;right:20px;top:-58px;font-size:24px;font-weight:700;letter-spacing:.08em;color:var(--kit-muted);border:1.5px solid var(--kit-line);border-radius:99px;padding:4px 14px}",
      ".kit-att{position:relative;height:400px;border-radius:36px;background:linear-gradient(180deg,rgb(255 255 255/.08),rgb(255 255 255/.03));border:2px solid rgb(255 255 255/.12);box-shadow:0 40px 100px rgb(0 0 0/.55)}",
      ".kit-att .slot{position:absolute;left:36px;top:34px;width:520px;height:150px;box-sizing:border-box;border-radius:24px;border:3px dashed rgb(255 255 255/.18);padding:50px 28px;font-size:34px;color:var(--kit-muted)}",
      ".kit-att .in{position:absolute;left:40px;top:220px;right:160px;font-size:52px;font-weight:700;line-height:1.5;white-space:nowrap;overflow:hidden}",
      ".kit-att .caret{display:inline-block;width:5px;height:56px;background:var(--kit-accent);vertical-align:-10px;margin-left:6px}",
      ".kit-att .send{position:absolute;right:36px;bottom:36px;width:104px;height:104px;border-radius:52px;background:var(--kit-accent);display:grid;place-items:center}",
      ".kit-att .send svg{width:50px;height:50px;fill:var(--kit-bg)}",
      ".kit-att .file{position:absolute;left:36px;top:34px;width:520px;height:150px;box-sizing:border-box;border-radius:24px;background:#F4F1EA;color:#111;display:flex;align-items:center;gap:26px;padding:0 28px;box-shadow:0 24px 60px rgb(0 0 0/.5);z-index:2}",
      ".kit-att .file .ic{flex:none;width:78px;height:96px;border-radius:10px;background:#E5484D;color:#fff;font-size:26px;font-weight:900;display:grid;place-items:center}",
      ".kit-att .file .nm{font-size:44px;font-weight:900;line-height:1.15}",
      ".kit-att .file .mt{font-size:30px;font-weight:500;color:#666}",
      ".kit-att .done{position:absolute;left:580px;top:80px;font-size:34px;font-weight:900;color:var(--kit-bg);background:var(--kit-accent);padding:8px 20px;border-radius:40px;z-index:3}",
      ".kit-pick{position:relative;height:500px}",
      ".kit-pick .stack{position:absolute;left:30px;top:0;width:400px;height:480px}",
      ".kit-pick .stack i{position:absolute;left:0;top:0;width:360px;height:440px;border-radius:14px;background:#D9D4C7;box-shadow:0 2px 0 rgb(0 0 0/.25)}",
      ".kit-pick .cover{position:absolute;left:0;top:0;width:360px;height:440px;box-sizing:border-box;border-radius:14px;background:#F4F1EA;color:#111;padding:40px 34px;box-shadow:0 30px 70px rgb(0 0 0/.5)}",
      ".kit-pick .cover .t{font-size:52px;font-weight:900;line-height:1.2}",
      ".kit-pick .cover .n{font-size:96px;font-weight:900;margin-top:70px;line-height:1;font-variant-numeric:tabular-nums}",
      ".kit-pick .cover .u{font-size:36px;font-weight:700;color:#666;margin-top:34px}",
      ".kit-pick .x{position:absolute;left:30px;top:40px;width:340px;height:400px;overflow:visible}",
      ".kit-pick .pg{position:absolute;left:540px;width:420px;height:150px;box-sizing:border-box;border-radius:16px;background:#F4F1EA;color:#111;padding:18px 26px;box-shadow:0 20px 50px rgb(0 0 0/.45)}",
      ".kit-pick .pg .no{font-size:28px;font-weight:900;color:#888}",
      ".kit-pick .pg .tx{display:inline-block;margin-top:8px;font-size:40px;font-weight:900;background:linear-gradient(var(--kit-accent),var(--kit-accent)) no-repeat 0 85%/100% 38%}",
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
        // immediateRender: false：多段上推时，否则建好时间轴后列表会停在最后一段的起点
        tl.fromTo(list, { y: -shift }, { y: -need, duration: 0.35, ease: U.EASE, immediateRender: false }, at);
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
    // 放大卡片故意盖在虚化的面板上：被盖住的每个文字元素都要标记（hyperframes check 只看元素自己，不继承）
    panel.querySelectorAll("td,th,h4,p").forEach(function (n) { n.setAttribute("data-layout-allow-overlap", ""); });
    tl.fromTo(panel, { filter: "blur(0px) brightness(1)" }, { filter: "blur(1.6px) brightness(0.62)", duration: 0.4, ease: "none" }, fAt);

    var lens = el("div", "kit-ans-lens", stage);
    var rowEl = table.rows[f.row];
    lens.style.top = Math.max(0, table.el.offsetTop + rowEl.offsetTop - 60) + "px"; // table 相对面板（已含头部高度），tr 相对 table；浮在原来那一行附近
    var src = el("div", "src", lens);
    el("i", "logo", src).style.background = logoColor;
    el("span", "", src, o.source);
    var line = el("div", "line", lens);
    // 第一列（事项）最宽，中间列按内容，最后一列（常是长说明）可折行
    line.style.gridTemplateColumns = data.length > 2
      ? "minmax(0,1.5fr)" + " auto".repeat(data.length - 2) + " minmax(0,1fr)"
      : "minmax(0,1fr)" + (data.length > 1 ? " auto" : "");
    var cells = data.map(function (c) { return el("span", "", line, c); });
    tl.fromTo(lens, { opacity: 0, scale: 0.92, y: 20 }, { opacity: 1, scale: 1, y: 0, duration: 0.45, ease: U.POP }, fAt + 0.1);
    if (f.col != null) {
      var cell = cells[f.col];
      if (!cell) throw new Error("Kit.answer: focus.col 超出列数（共 " + data.length + " 列，从 0 数）");
      cell.style.color = T.danger;
      ringAround(tl, cell, T.danger, fAt + 0.5, U.hashText(cell.textContent));
    }
    if (f.note) {
      var note = el("div", "kit-ans-note", lens, f.note);
      tl.fromTo(note, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.3, ease: U.POP }, num(f.noteAt, fAt + 0.7));
    }
  };

  /* ---------- 动作画面：把一句「怎么做」画成一个动作 ---------- */

  // 画面里的文件名、页码是演示用的，默认在角上标「示例」，免得观众当成真实数据
  function demoTag(parent, o) {
    if (o.tag === false) return;
    el("div", "kit-tag-demo", parent, o.tag || "示例");
  }

  /**
   * 文件飞进输入框：输入框出现 → 说到问题时逐字打进去 → 说到「文件」时文件卡沿弧线飞进附件栏、落地回弹，亮「✓ 已附上」。
   * { question, file:{ name, meta, type="PDF" }, at=0, askAt=at+0.4, fileAt=askAt+0.9, done="✓ 已附上"|false, tag="示例"|false }
   */
  Kit.attach = function (tl, sel, o) {
    var host = U.hostOf(sel);
    var file = o.file || {};
    var at = num(o.at, 0), askAt = num(o.askAt, at + 0.4), fileAt = num(o.fileAt, askAt + 0.9);
    var box = el("div", "kit kit-att", host);
    demoTag(box, o);
    var slot = el("div", "slot", box, "附件");
    var overlapOk = function (node) { node.setAttribute("data-layout-allow-overlap", ""); return node; }; // 文件卡落进附件栏时故意盖住虚线框
    var input = el("div", "in", box);
    var q = el("span", "q", input);
    var caret = el("i", "caret", input);
    var send = el("div", "send", box);
    U.svgEl("path", { d: "M4 12 L20 4 L14 20 L11 13 Z" }, U.svgEl("svg", { viewBox: "0 0 24 24" }, send));
    var card = el("div", "file", box);
    overlapOk(slot);
    overlapOk(el("div", "ic", card, file.type || "PDF"));
    var info = el("div", "", card);
    overlapOk(el("div", "nm", info, file.name || "资料.pdf"));
    if (file.meta) overlapOk(el("div", "mt", info, file.meta));
    var done = o.done === false ? null : el("div", "done", box, o.done || "✓ 已附上");

    tl.fromTo(box, { opacity: 0, y: 60, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.55, ease: U.EASE }, at);
    tl.fromTo(caret, { opacity: 1 }, { opacity: 0, duration: 0.25, ease: "steps(1)", yoyo: true, repeat: 1 }, at + 0.3);
    var text = String(o.question || ""), typed = { i: 0 };
    tl.fromTo(typed, { i: 0 }, {
      i: text.length, duration: Math.min(0.9, 0.07 * text.length), ease: "none",
      onUpdate: function () { q.textContent = text.slice(0, Math.round(typed.i)); },
    }, askAt);
    tl.fromTo(card, { x: 430, y: -330, rotation: 14, scale: 0.8, opacity: 0 }, { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1, duration: 0.55, ease: U.POP }, fileAt);
    tl.fromTo(slot, { opacity: 1 }, { opacity: 0, duration: 0.2, ease: "none", immediateRender: false }, fileAt + 0.45);
    if (done) tl.fromTo(done, { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.3, ease: U.POP }, fileAt + 0.5);
    tl.fromTo(send, { scale: 1 }, { scale: 1.12, duration: 0.25, ease: "sine.inOut", yoyo: true, repeat: 1, immediateRender: false }, fileAt + 0.6);
  };

  /**
   * 一摞资料里挑几页：整摞落下、页数从 0 数上来 →（rejectAt）红叉两笔、整摞抖一下 → 整摞变暗，挑出的几页依次飞出、在右边排开，之后轻轻浮动。
   * { title, total, unit="页", picks:[{ page, text }]（1–4 页）, at=0, rejectAt（不写就不打叉）, pickAt=at+1.2, tag="示例"|false }
   */
  Kit.pick = function (tl, sel, o) {
    var host = U.hostOf(sel);
    var picks = (o.picks || []).slice(0, 4);
    if (!picks.length) throw new Error("Kit.pick: picks 至少要有一页（{ page, text }）");
    var at = num(o.at, 0), pickAt = num(o.pickAt, at + 1.2);
    var box = el("div", "kit kit-pick", host);
    demoTag(box, o);
    var stack = el("div", "stack", box);
    for (var i = 7; i >= 1; i--) el("i", "", stack).style.transform = "translate(" + i * 4 + "px," + i * 4 + "px)";
    var cover = el("div", "cover", stack);
    el("div", "t", cover, o.title || "资料");
    var n = el("div", "n", cover, "0");
    el("div", "u", cover, o.unit || "页");
    var total = num(o.total, 100);
    tl.fromTo(stack, { y: -420, opacity: 0, rotation: -6 }, { y: 0, opacity: 1, rotation: 0, duration: 0.5, ease: "back.out(1.2)" }, at);
    var cnt = { v: 0 };
    tl.fromTo(cnt, { v: 0 }, { v: total, duration: 0.6, ease: "power2.out", onUpdate: function () { n.textContent = Math.round(cnt.v); } }, at + 0.25);

    if (o.rejectAt != null) {
      var rejectAt = num(o.rejectAt, at + 0.8);
      var T = U.tok(host);
      var svg = U.svgEl("svg", { class: "x", viewBox: "0 0 340 400" }, stack);
      ["M 20 30 L 320 370", "M 320 30 L 20 370"].forEach(function (d, k) {
        var path = U.svgEl("path", { d: d, stroke: T.danger, "stroke-width": 22, "stroke-linecap": "round", fill: "none" }, svg);
        var len = path.getTotalLength();
        // 圆头笔触没画时也会露一个点，所以先藏起来
        tl.fromTo(path, { strokeDasharray: len, strokeDashoffset: len, opacity: 0 }, { strokeDashoffset: 0, opacity: 1, duration: 0.18, ease: "power2.in" }, rejectAt + k * 0.16);
      });
      tl.fromTo(stack, { x: 0 }, { x: 10, duration: 0.05, ease: "none", yoyo: true, repeat: 3, immediateRender: false }, rejectAt + 0.34);
    }

    tl.fromTo(stack, { opacity: 1, scale: 1 }, { opacity: 0.45, scale: 0.92, duration: 0.35, ease: U.EASE, immediateRender: false }, pickAt);
    var pages = picks.map(function (p, k) {
      var pg = el("div", "pg", box);
      pg.style.top = k * 170 + "px";
      // 飞出来时边转边放大，页码和标题的文字框会短暂交叠
      el("div", "no", pg, p.page || "").setAttribute("data-layout-allow-overlap", "");
      el("div", "tx", pg, p.text || "").setAttribute("data-layout-allow-overlap", "");
      tl.fromTo(pg, { x: -460, y: 120 - k * 170, rotation: -10, opacity: 0, scale: 0.7 }, { x: 0, y: 0, rotation: 0, opacity: 1, scale: 1, duration: 0.45, ease: U.POP }, pickAt + k * 0.18);
      return pg;
    });
    // 落定后轻轻浮动（有限次数，渲染可复现）
    tl.fromTo(pages, { y: 0 }, { y: -8, duration: 0.5, ease: "sine.inOut", yoyo: true, repeat: 1, stagger: 0.1, immediateRender: false }, pickAt + 0.45 + picks.length * 0.18);
  };

  Kit._scenes = { ringAround: ringAround };
})();
