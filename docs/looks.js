/* 3.43.3 Looks: eleven designs (six of them pastel) to choose from inside the app, plus your own colours.
   Open with 🎨 Colours at the top, or under Settings, Personalise. Every change shows straight away and is saved on this device.
   Uses saveLook, lookNow and COLS from app.js. */
(function () {
  "use strict";
  if (typeof saveLook !== "function" || typeof el !== "function") return;
  var CLEAR = { c1: "", c2: "", cH: "", cB: "", cP: "", cT: "" };
  var LOOKS = [
    { p: "ocean", name: "WYZ Classic", desc: "Deep navy and champagne gold", h1: "#104b70", h2: "#0e2238", bg: "#f4f8fc", card: "#ffffff", main: "#104b70", acc: "#b8923c" },
    { p: "ivory", name: "Ivory Gold", desc: "Warm ivory, navy and gold", h1: "#16324e", h2: "#0e2238", bg: "#faf7f1", card: "#ffffff", main: "#16324e", acc: "#b8923c" },
    { p: "marina", name: "Marina Teal", desc: "Sea teal with a coral touch", h1: "#0f6466", h2: "#0a3d40", bg: "#f2f8f7", card: "#ffffff", main: "#0f6466", acc: "#d08c60" },
    { p: "dune", name: "Desert Dune", desc: "Sand, terracotta and bronze", h1: "#7a3a22", h2: "#3b2216", bg: "#f8f3ec", card: "#fffdf9", main: "#9a4a2a", acc: "#c08a3e" },
    { p: "graphite", name: "Graphite Gold", desc: "Executive charcoal and gold", h1: "#1f2633", h2: "#0b0d12", bg: "#f4f5f7", card: "#ffffff", main: "#1f2633", acc: "#b8923c" },
    { p: "rose", name: "Pastel Rose", desc: "Blush pink and soft gold", h1: "#b35a85", h2: "#8a3a63", bg: "#fdf1f5", card: "#fffafc", main: "#a64d79", acc: "#e0a96d" },
    { p: "lavender", name: "Pastel Lavender", desc: "Soft lilac and warm gold", h1: "#7761bd", h2: "#54428c", bg: "#f4f1fb", card: "#fbfaff", main: "#6a54b0", acc: "#d9a45b" },
    { p: "mint", name: "Pastel Mint", desc: "Fresh mint and honey", h1: "#3a9877", h2: "#1f6a4f", bg: "#eefaf5", card: "#fafffd", main: "#2c7f62", acc: "#e0a14a" },
    { p: "peach", name: "Pastel Peach", desc: "Peach sorbet and amber", h1: "#b95a30", h2: "#8a3d1c", bg: "#fff5ee", card: "#fffdfa", main: "#b0532b", acc: "#e0a640" },
    { p: "skyblue", name: "Pastel Sky", desc: "Baby blue and soft gold", h1: "#3b7fc0", h2: "#2b5f94", bg: "#eef6fd", card: "#fbfdff", main: "#2f72b3", acc: "#e3a553" },
    { p: "butter", name: "Pastel Butter", desc: "Soft lemon and olive gold", h1: "#9a8014", h2: "#6a5709", bg: "#fffbe9", card: "#fffef7", main: "#8a7210", acc: "#d98f3f" }
  ];
  var current = function () { var l = lookNow(); return l.p && LOOKS.some(function (x) { return x.p === l.p; }) ? l.p : "ocean"; };

  function card(x) {
    var b = el("button", "lookc"); b.type = "button"; b.dataset.pal = x.p; b.setAttribute("aria-pressed", String(current() === x.p));
    var m = el("span", "lookm"); m.setAttribute("aria-hidden", "true");
    var h = el("span", "lh"); h.style.background = "linear-gradient(135deg," + x.h1 + "," + x.h2 + ")"; h.style.borderBottom = "3px solid " + x.acc;
    var i1 = el("i"); i1.style.width = "38%"; var i2 = el("i"); i2.style.width = "18%"; i2.style.opacity = ".6"; h.append(i1, i2);
    var body = el("span", "lb"); body.style.background = x.bg;
    var c = el("span", "lcard"); c.style.background = x.card; c.style.border = "1px solid rgba(0,0,0,.08)";
    var row = el("span", "lrow"); var bt = el("span", "lbtn"); bt.style.background = x.main; var d1 = el("span", "ldot"); d1.style.background = x.acc; var d2 = el("span", "ldot"); d2.style.background = "#d6453d"; var d3 = el("span", "ldot"); d3.style.background = "#45a843";
    row.append(bt, d1, d2, d3); body.append(c, row); m.append(h, body);
    b.append(m, el("b", "", x.name), el("small", "", x.desc));
    b.onclick = function () { saveLook(Object.assign({ p: x.p }, CLEAR)); sync(); };
    return b;
  }
  /* My looks: your own colour sets, as many as you like, saved on this device */
  var MYKEY = "wyz-mylooks", KEYS = ["cH", "c1", "c2", "cB", "cP", "cT"];
  var mine = function () { try { var a = JSON.parse(localStorage.getItem(MYKEY) || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
  var keepMine = function (a) { try { localStorage.setItem(MYKEY, JSON.stringify(a)); } catch (e) { toast("This browser wouldn't save your looks."); } document.querySelectorAll(".minebox").forEach(function (b) { if (b.redraw) b.redraw(); }); };
  var colourNow = function () { var o = {}; (typeof COLS !== "undefined" ? COLS : []).forEach(function (c) { var i = $(c[0]); o[c[1]] = i && /^#[0-9a-f]{6}$/i.test(i.value) ? i.value.toLowerCase() : ""; }); return o; };
  var sameColours = function (a, b) { return KEYS.every(function (k) { return String(a[k] || "").toLowerCase() === String(b[k] || "").toLowerCase(); }); };
  function myCard(x, redraw) {
    var wrap = el("div", "mylook"); wrap.style.cssText = "display:flex;flex-direction:column;gap:6px";
    var b = el("button", "lookc"); b.type = "button"; b.dataset.mine = x.id; b.setAttribute("aria-pressed", "false");
    var m = el("span", "lookm"); m.setAttribute("aria-hidden", "true");
    var h = el("span", "lh"); h.style.background = x.cH || x.c1 || "#104b70"; h.style.borderBottom = "3px solid " + (x.c2 || "#b8923c");
    var i1 = el("i"); i1.style.width = "38%"; var i2 = el("i"); i2.style.width = "18%"; i2.style.opacity = ".6"; h.append(i1, i2);
    var body = el("span", "lb"); body.style.background = x.cB || "#f4f8fc";
    var c = el("span", "lcard"); c.style.background = x.cP || "#fff"; c.style.border = "1px solid rgba(0,0,0,.08)";
    var row = el("span", "lrow"); var bt = el("span", "lbtn"); bt.style.background = x.c1 || "#104b70"; var d1 = el("span", "ldot"); d1.style.background = x.c2 || "#b8923c";
    row.append(bt, d1); body.append(c, row); m.append(h, body);
    b.append(m, el("b", "", x.name), el("small", "", "Your colours"));
    b.onclick = function () { var o = { p: x.p || "ocean" }; KEYS.forEach(function (k) { o[k] = x[k] || ""; }); saveLook(o); sync(); };
    var acts = el("div", "acts"); acts.style.gap = "6px";
    var up = el("button", "btn small ghost", "Update"); up.type = "button"; up.title = "Replace this look with the colours you have now";
    up.onclick = function () { var a = mine(), i = a.findIndex(function (y) { return y.id === x.id; }); if (i < 0) return; Object.assign(a[i], colourNow(), { p: current() }); keepMine(a); toast("\"" + x.name + "\" updated."); redraw(); };
    var del = el("button", "btn small ghost", "Delete"); del.type = "button";
    del.onclick = function () { if (!confirm("Delete your look \"" + x.name + "\"? Your other looks are not touched.")) return; keepMine(mine().filter(function (y) { return y.id !== x.id; })); redraw(); };
    acts.append(up, del); wrap.append(b, acts); return wrap;
  }
  function mineBox() {
    var box = el("div", "minebox"); box.style.cssText = "margin-top:10px";
    function draw() {
      box.replaceChildren(); var list = mine();
      var h = el("h3", "", "My looks" + (list.length ? " (" + list.length + ")" : "")); h.style.cssText = "margin:8px 0 2px;font-size:15px"; box.append(h);
      box.append(el("p", "status", "Change the colours below, name them, and save as many looks as you like. Tap one to use it. They stay on this device."));
      if (list.length) { var g = el("div", "looks"); g.setAttribute("role", "group"); g.setAttribute("aria-label", "My looks"); list.forEach(function (x) { g.append(myCard(x, draw)); }); box.append(g); }
      var r = el("div", "ask"), nm = el("input", "in"); nm.placeholder = "Name this look, for example Sunday pink"; nm.maxLength = 30; nm.setAttribute("aria-label", "Name for the new look");
      var sv = el("button", "btn small solid", "Save current colours as a new look"); sv.type = "button";
      sv.onclick = function () { var a = mine(), name = nm.value.trim() || "My look " + (a.length + 1); a.push(Object.assign({ id: "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: name, p: current() }, colourNow())); keepMine(a); toast("Saved \"" + name + "\"."); draw(); };
      r.append(nm, sv); box.append(r); markMine();
    }
    box.redraw = draw; draw(); return box;
  }
  function markMine() { var now = lookNow(), cn = colourNow(), has = KEYS.some(function (k) { return now[k]; }); document.querySelectorAll("[data-mine]").forEach(function (b) { var x = mine().find(function (y) { return y.id === b.dataset.mine; }); b.setAttribute("aria-pressed", String(!!x && has && sameColours(x, cn))); }); }
  function grid() { var g = el("div", "looks"); g.setAttribute("role", "group"); g.setAttribute("aria-label", "Choose a look"); LOOKS.forEach(function (x) { g.append(card(x)); }); var w = el("div"); w.append(g, mineBox()); return w; }

  /* Settings, Personalise: the two old swatches become the five looks */
  var sw = $("swatches"); if (sw) { sw.replaceWith(grid()); }

  /* the quick panel from 🎨 Colours */
  var panel = null;
  function sync() {
    var p = current();
    document.querySelectorAll(".lookc[data-pal]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.pal === p)); }); markMine();
    if (panel && panel.isConnected) panel.querySelectorAll("input[type=color]").forEach(function (inp) { var src = $(inp.dataset.src); if (src) inp.value = src.value; });
    if (panel && panel.isConnected) { var md = panel.querySelector("select"); var l = lookNow(); if (md) md.value = l.m === "light" || l.m === "dark" ? l.m : "auto"; }
  }
  window.wyzLookSync = sync;
  function open() {
    var h = infoOpen("🎨 Choose your look");
    h.append(el("p", "status", "Tap a look. It changes straight away and is saved on this device. Each look has a light and a dark version."));
    h.append(grid());
    var sec = el("div", "infosec"); sec.append(el("h3", "", "Your own colours"));
    sec.append(el("p", "status", "Start from a look, then change any colour. Background, cards and text apply to the light version."));
    var picks = el("div", "cpicks");
    var LABELS = { colHeader: "Header", colMain: "Buttons and links", colAccent: "Accent", colBg: "Page background", colPanel: "Cards", colText: "Text" };
    (typeof COLS !== "undefined" ? COLS : []).forEach(function (c) {
      var id = c[0], key = c[1], src = $(id);
      var lab = el("label", "cpick"), inp = el("input"); inp.type = "color"; inp.dataset.src = id; inp.value = src ? src.value : c[2];
      inp.oninput = function () { var o = {}; o[key] = inp.value; saveLook(o); };
      lab.append(inp, el("span", "", LABELS[id] || id)); picks.append(lab);
    });
    sec.append(picks);
    var row = el("div", "acts");
    var mode = el("select", "in"); mode.setAttribute("aria-label", "Light or dark"); [["auto", "Match my device"], ["light", "Always light"], ["dark", "Always dark"]].forEach(function (o) { mode.append(new Option(o[1], o[0])); });
    mode.onchange = function () { saveLook({ m: mode.value }); };
    var reset = el("button", "btn small ghost", "Back to WYZ Classic"); reset.type = "button"; reset.onclick = function () { saveLook(Object.assign({ p: "ocean" }, CLEAR)); sync(); };
    var keep = el("button", "btn small ghost", "Clear my own colours"); keep.type = "button"; keep.onclick = function () { saveLook(Object.assign({}, CLEAR)); sync(); };
    row.append(mode, keep, reset); sec.append(row);
    h.append(sec); panel = h; sync();
  }
  var btn = $("lookBtn"); if (btn) btn.onclick = open;
  window.wyzOpenLooks = open;
  sync();
})();
