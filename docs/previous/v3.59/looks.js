/* 3.43.3 Looks: five designs to choose from inside the app, plus your own colours.
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
    { p: "graphite", name: "Graphite Gold", desc: "Executive charcoal and gold", h1: "#1f2633", h2: "#0b0d12", bg: "#f4f5f7", card: "#ffffff", main: "#1f2633", acc: "#b8923c" }
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
  function grid() { var g = el("div", "looks"); g.setAttribute("role", "group"); g.setAttribute("aria-label", "Choose a look"); LOOKS.forEach(function (x) { g.append(card(x)); }); return g; }

  /* Settings, Personalise: the two old swatches become the five looks */
  var sw = $("swatches"); if (sw) { sw.replaceWith(grid()); }

  /* the quick panel from 🎨 Colours */
  var panel = null;
  function sync() {
    var p = current();
    document.querySelectorAll(".lookc").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.pal === p)); });
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
