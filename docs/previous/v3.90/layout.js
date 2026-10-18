/* Layouts: choose how the Today page is laid out. Settings > "How Today looks". Saved on this device only (a phone and a laptop can differ).
   - Classic:         one column, as before.
   - Bento squares:   Inbox, Calendar, Tasks and the rest as scrolling tiles in a grid.
   - Four panes:      Inbox, Calendar, Tasks and Documents side by side, each scrolling on its own.
   - Phone execution: one narrow column with big buttons and a bottom bar that shows one section at a time.
   Only the look changes. Nothing is moved or removed, so every button keeps working and Classic is always one tap away. */
(function () {
  "use strict";
  if (typeof $ !== "function" || typeof el !== "function") return;
  var KEY = "wyz-layout", MODES = ["classic", "bento", "panes", "phone"];
  var NAME = { classic: "Classic", bento: "Bento squares", panes: "Four panes", phone: "Phone execution" };
  var DESC = { classic: "One column, as it has always been.", bento: "Tiles in a grid. Each one scrolls inside itself.", panes: "Inbox, Calendar, Tasks and Documents side by side.", phone: "Narrow, big buttons, and a bottom bar that shows one section at a time." };
  var PANES = [["inbox", "Inbox"], ["cal", "Calendar"], ["tasks", "Tasks"], ["docs", "Files"], ["more", "More"]];
  var cur = "classic", pane = "inbox";
  var get = function () { try { var v = localStorage.getItem(KEY); return MODES.indexOf(v) >= 0 ? v : "classic"; } catch (e) { return "classic"; } };
  var save = function (v) { try { localStorage.setItem(KEY, v); } catch (e) {} };

  var T = "html[data-layout=TAG] #p-today";
  var css = [
    "html[data-layout=bento] body>.wrap,html[data-layout=panes] body>.wrap{max-width:1500px}",
    /* bento */
    "html[data-layout=bento] #p-today #secs{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));grid-auto-flow:dense;gap:16px;align-items:start}",
    "html[data-layout=bento] #p-today #secs>[data-sec]{border:1px solid var(--line);border-radius:18px;padding:12px;max-height:540px;overflow:auto;min-width:0;background:color-mix(in srgb,var(--bg) 60%,transparent)}",
    "@media(min-width:900px){html[data-layout=bento] #p-today #secs>[data-sec=inbox]{grid-column:span 2;max-height:620px}html[data-layout=bento] #p-today #secs>[data-sec=setup]{grid-column:1/-1;max-height:none}html[data-layout=bento] #p-today #secs>[data-sec=research]{grid-column:1/-1;max-height:640px}}",
    /* four panes */
    "html[data-layout=panes] #p-today #secs{display:grid;grid-template-columns:1fr;gap:14px;align-items:start}",
    "html[data-layout=panes] #p-today #secs>[data-sec]{min-width:0}",
    "@media(min-width:900px){html[data-layout=panes] #p-today #secs{grid-template-columns:1fr 1fr}",
    "html[data-layout=panes] #p-today #secs>[data-sec=inbox],html[data-layout=panes] #p-today #secs>[data-sec=cal],html[data-layout=panes] #p-today #secs>[data-sec=tasks],html[data-layout=panes] #p-today #secs>[data-sec=docs]{height:min(74vh,760px);overflow:auto;border:1px solid var(--line);border-radius:16px;padding:12px;background:color-mix(in srgb,var(--bg) 60%,transparent)}",
    "html[data-layout=panes] #p-today #secs>[data-sec=setup]{order:0;grid-column:1/-1}html[data-layout=panes] #p-today #secs>[data-sec=inbox]{order:1}html[data-layout=panes] #p-today #secs>[data-sec=cal]{order:2}html[data-layout=panes] #p-today #secs>[data-sec=tasks]{order:3}html[data-layout=panes] #p-today #secs>[data-sec=docs]{order:4}html[data-layout=panes] #p-today #secs>[data-sec=research]{order:5;grid-column:1/-1}html[data-layout=panes] #p-today #secs>[data-sec=links]{order:6;grid-column:1/-1}}",
    /* phone execution */
    "html[data-layout=phone] body>.wrap{max-width:480px}",
    "html[data-layout=phone] body[data-page=today]{padding-bottom:84px}",
    "html[data-layout=phone] body[data-page=today] .btn{min-height:46px;font-size:16px}html[data-layout=phone] body[data-page=today] .btn.small{min-height:42px}html[data-layout=phone] body[data-page=today] .chip{min-height:40px}",
    "html[data-layout=phone] body[data-page=today] .item{padding-block:14px}",
    "#phoneNav{display:none}",
    "html[data-layout=phone] body[data-page=today] #phoneNav{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:40;gap:6px;padding:8px 10px calc(8px + env(safe-area-inset-bottom));background:var(--bg);border-top:1px solid var(--line);box-shadow:0 -4px 16px rgba(0,0,0,.12);justify-content:center}",
    "#phoneNav button{flex:1 1 0;max-width:96px;min-height:52px;border:1px solid var(--line);border-radius:14px;background:var(--card,var(--bg));color:var(--fg);font:inherit;font-size:13px;font-weight:600;cursor:pointer}",
    "#phoneNav button[aria-pressed=true]{background:var(--navy);color:#fff;border-color:var(--navy)}",
    /* settings picker */
    "#layoutPick{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:10px}",
    "#layoutPick button{display:flex;flex-direction:column;gap:8px;align-items:stretch;text-align:left;padding:10px;border:2px solid var(--line);border-radius:14px;background:var(--bg);color:var(--fg);font:inherit;cursor:pointer}",
    "#layoutPick button[aria-pressed=true]{border-color:var(--navy);box-shadow:0 0 0 3px color-mix(in srgb,var(--navy) 20%,transparent)}",
    "#layoutPick .lp{display:grid;gap:4px;height:70px;padding:6px;border-radius:8px;background:color-mix(in srgb,var(--navy) 8%,var(--bg))}#layoutPick .lp i{display:block;border-radius:4px;background:color-mix(in srgb,var(--navy) 55%,var(--bg))}",
    "#layoutPick b{font-size:15px}#layoutPick span.d{font-size:13px;color:var(--soft)}"
  ];
  PANES.forEach(function (p) {
    var show = p[0] === "more" ? ["setup", "research", "links"] : [p[0]], all = ["setup", "inbox", "cal", "tasks", "docs", "research", "links"];
    var hide = all.filter(function (k) { return show.indexOf(k) < 0; }).map(function (k) { return "html[data-layout=phone][data-pane=" + p[0] + "] body[data-page=today] #secs>[data-sec=" + k + "]"; });
    css.push(hide.join(",") + "{display:none!important}");
  });
  var st = document.createElement("style"); st.textContent = css.join("\n"); document.head.append(st);

  /* the bottom bar, only visible in Phone execution on Today */
  var nav = el("nav"); nav.id = "phoneNav"; nav.setAttribute("aria-label", "Sections");
  PANES.forEach(function (p) {
    var b = el("button", "", p[1]); b.type = "button"; b.dataset.pane = p[0]; b.setAttribute("aria-pressed", String(p[0] === pane));
    b.onclick = function () { setPane(p[0]); var s = $("secs"); if (s) window.scrollTo({ top: Math.max(0, s.getBoundingClientRect().top + window.scrollY - 70) }); };
    nav.append(b);
  });
  document.body.append(nav);
  function setPane(k) { pane = k; document.documentElement.setAttribute("data-pane", k); [].forEach.call(nav.children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.pane === k)); }); }

  function apply(m) {
    cur = m; document.documentElement.setAttribute("data-layout", m); setPane(pane);
    [].forEach.call(document.querySelectorAll("#layoutPick button"), function (b) { b.setAttribute("aria-pressed", String(b.dataset.mode === m)); });
    var n = $("layoutNote"); if (n) n.textContent = "Now showing: " + NAME[m] + ". " + DESC[m];
  }
  var PREV = { classic: ["1fr", [1, 1, 1]], bento: ["1fr 1fr 1fr", [1, 1, 1, 1, 1, 1]], panes: ["1fr 1fr", [1, 1, 1, 1]], phone: ["1fr", [1, 1, 1]] };
  function card() {
    if ($("layoutCard")) return;
    var host = $("srcCard"); if (!host || !host.parentNode) return;
    var c = el("div", "card note"); c.id = "layoutCard"; var pad = el("div", "pad"); c.append(pad);
    pad.append(el("h2", "", "How Today looks"), el("p", "sub", "Pick the layout of the Today page. It's saved on this device only, so your phone and your laptop can differ. Nothing is removed, and Classic is always one tap away."));
    var g = el("div"); g.id = "layoutPick"; g.setAttribute("role", "group"); g.setAttribute("aria-label", "Layout");
    MODES.forEach(function (m) {
      var b = document.createElement("button"); b.type = "button"; b.dataset.mode = m; b.setAttribute("aria-pressed", String(m === cur));
      var pv = el("div", "lp"); pv.style.gridTemplateColumns = PREV[m][0]; PREV[m][1].forEach(function () { pv.append(document.createElement("i")); });
      if (m === "phone") { pv.style.width = "46%"; pv.style.margin = "0 auto"; }
      b.append(pv, el("b", "", NAME[m]), el("span", "d", DESC[m]));
      b.onclick = function () { save(m); apply(m); }; g.append(b);
    });
    var note = el("p", "status"); note.id = "layoutNote";
    var go = el("button", "btn small solid", "See it on Today"); go.type = "button"; go.onclick = function () { if (window.WYZ_PAGES) window.WYZ_PAGES.go("today"); else show("t-today"); };
    pad.append(g, note, go); host.parentNode.insertBefore(c, host); apply(cur);
  }
  apply(get()); card();
  window.WYZ_LAYOUT = { set: function (m) { if (MODES.indexOf(m) >= 0) { save(m); apply(m); } }, get: function () { return cur; } };
})();
