/* Graphs: one header button opens the Monthly Revenue Comparison (this year against last year, month by month, from Hostaway via /api/revenue).
   Same idea as the Revenue Hub chart. Shown only to owners and the people listed in REVENUE_VIEWERS.
   Months that have not happened yet show bookings made so far, and are marked so they are not read as a drop. */
(function () {
  "use strict";
  if (typeof $ !== "function" || typeof el !== "function" || typeof G === "undefined") return;
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var NS = "http://www.w3.org/2000/svg";
  var nowY = function () { return new Date(Date.now() + 4 * 3600000).getUTCFullYear(); };
  var nowM = function () { return new Date(Date.now() + 4 * 3600000).getUTCMonth(); };
  var aed = function (n) { try { return new Intl.NumberFormat("en-GB", { style: "currency", currency: "AED", maximumFractionDigits: 0 }).format(n); } catch (e) { return "AED " + Math.round(n).toLocaleString("en-GB"); } };
  var k = function (v) { return v ? (v >= 1000 ? Math.round(v / 1000) + "k" : String(Math.round(v))) : ""; };
  var pct = function (a, b) { return b > 0 ? (a - b) / b * 100 : null; };
  var sgn = function (p) { return (p >= 0 ? "+" : "") + p.toFixed(1) + "%"; };
  var svg = function (tag, attrs, text) { var e = document.createElementNS(NS, tag); Object.keys(attrs || {}).forEach(function (a) { e.setAttribute(a, attrs[a]); }); if (text != null) e.textContent = text; return e; };

  var S = { year: nowY(), metric: "total", cur: null, prev: null, state: "idle", msg: "", info: null };
  var card = null, dlg = null, btn = null;

  async function load(year, fresh) {
    var t = await G.token();
    var r = await fetch("/api/revenue?year=" + year + (fresh ? "&fresh=1" : ""), { headers: { Authorization: "Bearer " + t } });
    if (r.status === 404 || r.status === 405) { var e = new Error("no server"); e.none = "noserver"; throw e; }
    var j = {}; try { j = await r.json(); } catch (x) {}
    if (j.viewer === false) { var v = new Error("not a viewer"); v.none = "notviewer"; v.seen = j.email || ""; v.listed = j.listed || null; throw v; }
    if (j.ready === false) { var s = new Error("setup"); s.setup = j; throw s; }
    if (!r.ok || !j.months) throw new Error(j.error || "Hostaway did not answer.");
    return j;
  }
  async function refresh(fresh) {
    S.state = "loading"; draw();
    try {
      var both = await Promise.all([load(S.year, fresh), load(S.year - 1, fresh)]);
      S.cur = both[0]; S.prev = both[1]; S.state = "ok"; S.msg = "";
    } catch (e) {
      if (e.none) { S.state = e.none; S.seen = e.seen || ""; S.listed = e.listed || null; }
      else if (e.setup) { S.state = e.setup.owner ? "setup" : "hidden"; S.info = e.setup; }
      else { S.state = S.cur && S.prev && S.cur.year === S.year ? "stale" : "error"; S.msg = (e && e.message) || ""; }
    }
    draw();
  }

  function rows() {
    var c = (S.cur && S.cur.months) || [], p = (S.prev && S.prev.months) || [], net = S.metric === "net";
    return MONTHS.map(function (m, i) {
      var cm = c[i] || {}, pm = p[i] || {};
      var cv = net ? cm.net : cm.revenue, pv = net ? pm.net : pm.revenue;
      return { label: m, cur: cv || 0, prev: pv || 0, change: pct(cv || 0, pv || 0), curListings: cm.listings || 0, prevListings: pm.listings || 0, curNights: cm.bookedNights || 0, prevNights: pm.bookedNights || 0, curMissing: cm.netMissingNights || 0, prevMissing: pm.netMissingNights || 0 };
    });
  }
  function chart(R) {
    var W = 960, H = 340, L = 46, Rr = 10, T = 34, B = 54, iw = W - L - Rr, ih = H - T - B;
    var max = Math.max.apply(null, R.map(function (r) { return Math.max(r.cur, r.prev); }).concat([1]));
    var step = Math.pow(10, Math.floor(Math.log10(max))), nice = Math.ceil(max / step * 2) / 2 * step; if (nice < max) nice = max;
    var y = function (v) { return T + ih - v / nice * ih; };
    var s = svg("svg", { viewBox: "0 0 " + W + " " + H, width: "100%", role: "img", "aria-label": "Monthly revenue, " + S.year + " against " + (S.year - 1) });
    s.style.minWidth = "640px"; s.style.display = "block";
    for (var g = 0; g <= 4; g++) { var gv = nice * g / 4; s.append(svg("line", { x1: L, x2: W - Rr, y1: y(gv), y2: y(gv), stroke: "var(--line)", "stroke-dasharray": "3 3" }), svg("text", { x: L - 6, y: y(gv) + 4, "text-anchor": "end", "font-size": 11, fill: "var(--soft)" }, k(gv))); }
    var gw = iw / 12, bw = Math.min(38, gw * 0.34), thisM = nowM(), future = S.year === nowY();
    R.forEach(function (r, i) {
      var cx = L + gw * i + gw / 2, g2 = svg("g", {});
      var bars = [["prev", r.prev, cx - bw - 1, "color-mix(in srgb,var(--navy) 38%,var(--bg))", S.year - 1, r.prevListings, r.prevNights], ["cur", r.cur, cx + 1, "var(--navy)", S.year, r.curListings, r.curNights]];
      bars.forEach(function (b) {
        var h = Math.max(0, b[1] / nice * ih), rect = svg("rect", { x: b[2], y: y(b[1]), width: bw, height: h, rx: 3, fill: b[3] });
        rect.append(svg("title", {}, MONTHS[i] + " " + b[4] + ": " + aed(b[1]) + " · " + b[5] + " listings · " + b[6] + " nights booked"));
        g2.append(rect);
        if (b[1]) g2.append(svg("text", { x: b[2] + bw / 2, y: y(b[1]) - 5, "text-anchor": "middle", "font-size": 10, "font-weight": b[0] === "cur" ? 700 : 500, fill: b[0] === "cur" ? "var(--fg)" : "var(--soft)" }, k(b[1])));
        if (b[0] === "cur" && b[5] > 0 && h >= 30 && bw >= 18) { g2.append(svg("rect", { x: b[2] + bw / 2 - 14, y: y(b[1]) + 6, width: 28, height: 15, rx: 7, fill: "var(--bg)", "fill-opacity": ".92" }), svg("text", { x: b[2] + bw / 2, y: y(b[1]) + 17, "text-anchor": "middle", "font-size": 9.5, "font-weight": 700, fill: "var(--fg)" }, String(b[5]))); }
      });
      g2.append(svg("text", { x: cx, y: H - B + 18, "text-anchor": "middle", "font-size": 11, fill: "var(--soft)" }, r.label));
      if (r.change != null && r.prev > 0) {
        var soon = future && i > thisM;
        g2.append(svg("text", { x: cx, y: H - B + 33, "text-anchor": "middle", "font-size": 10.5, "font-weight": 700, fill: soon ? "var(--soft)" : r.change >= 0 ? "#16a34a" : "#dc2626" }, sgn(r.change) + (soon ? "*" : "")));
      }
      s.append(g2);
    });
    return s;
  }
  function table(R) {
    var d = el("details"); d.append(el("summary", "status", "Show the numbers as a table"));
    var t = document.createElement("table"); t.style.cssText = "border-collapse:collapse;width:100%;font-size:13px";
    var head = document.createElement("tr"); ["Month", String(S.year - 1), String(S.year), "Change"].forEach(function (h) { var th = document.createElement("th"); th.textContent = h; th.style.cssText = "text-align:right;padding:4px 8px;border-bottom:1px solid var(--line)"; head.append(th); }); head.firstChild.style.textAlign = "left"; t.append(head);
    R.forEach(function (r) { var tr = document.createElement("tr"); [r.label, aed(r.prev), aed(r.cur), r.change == null ? "" : sgn(r.change)].forEach(function (v, i) { var td = document.createElement("td"); td.textContent = v; td.style.cssText = "padding:4px 8px;border-bottom:1px solid var(--line);text-align:" + (i ? "right" : "left"); tr.append(td); }); t.append(tr); });
    d.append(t); return d;
  }
  var bt = function (txt, fn, cls) { var b = el("button", "btn small" + (cls ? " " + cls : ""), txt); b.type = "button"; b.onclick = fn; return b; };

  function draw() {
    if (!card) return;
    if (S.state === "hidden") { if (btn) btn.hidden = true; return; }
    card.replaceChildren();
    var pad = el("div", "pad"); card.append(pad);
    var head = el("div", "headrow"); head.append(el("h2", "", "Monthly " + (S.metric === "net" ? "Net to WyzRent" : "Revenue") + " Comparison"));
    var tg = el("div", "chips"); [["total", "Total revenue"], ["net", "Company net"]].forEach(function (m) { var c = el("button", "chip", m[1]); c.type = "button"; c.setAttribute("aria-pressed", String(S.metric === m[0])); c.onclick = function () { S.metric = m[0]; draw(); }; tg.append(c); });
    var sel = el("select", "in"); sel.style.cssText = "flex:0 0 auto;width:auto"; sel.setAttribute("aria-label", "Year"); for (var y = nowY(); y >= nowY() - 4; y--) sel.append(new Option(String(y), String(y))); sel.value = String(S.year); sel.onchange = function () { S.year = +sel.value; S.cur = S.prev = null; refresh(false); };
    head.append(tg, sel); pad.append(head);
    pad.append(el("p", "sub", S.year + " against " + (S.year - 1) + " · AED · Hostaway" + (S.metric === "net" ? " · property manager payout" : "")));
    if (S.state === "noserver" || S.state === "notviewer") {
      pad.append(el("p", "status err", S.state === "noserver" ? "The revenue service isn't on this site. The page asked for /api/revenue and the server said it doesn't exist." : "Your Google account isn't on the revenue list, so the server refused to show revenue." + (S.seen ? " The server saw you as " + S.seen + "." : "") + (S.listed ? " Its list has " + S.listed.owners + " in OWNER_EMAILS and " + S.listed.viewers + " in REVENUE_VIEWERS" + (S.listed.owners + S.listed.viewers === 0 ? ", so this site isn't receiving the variable yet. Check it is saved for Production and redeploy." : ", so the variable is there but this address isn't in it. Look for a typo, a space, or quote marks around the address.") : "")));
      pad.append(el("p", "status", S.state === "noserver" ? "Fix: in Vercel, redeploy the project from the live branch (the file api/revenue.js must be in it). Then reload this page." : "Fix: in Vercel, open the project, Environment Variables, and make sure " + (S.seen || "your Google email") + " is in REVENUE_VIEWERS or OWNER_EMAILS (several emails separated by commas), for Production. Redeploy, then reload this page. If that is not the email you expected, sign out and back in with the right Google account."));
      var ac0 = el("div", "acts"); ac0.append(bt("Check again", function () { refresh(true); }, "solid")); pad.append(ac0);
      return;
    }
    if (S.state === "setup") {
      pad.append(el("p", "status", "Not switched on yet. It reads Hostaway with the same Account ID and API key as the strip above, and shows only to owners (add others in the Vercel variable REVENUE_VIEWERS). Missing: " + ((S.info && S.info.missing) || []).join(", ") + "."));
      return;
    }
    if (S.state === "loading" && !S.cur) { pad.append(el("p", "status", "Loading revenue from Hostaway (about 10 seconds the first time)...")); return; }
    if (S.state === "error") { var er = el("p", "status err", "Live Hostaway revenue is temporarily unavailable (" + S.msg + "). Nothing is shown rather than a partial year."); pad.append(er, bt("Try again", function () { refresh(true); }, "solid")); return; }
    var R = rows(), ct = R.reduce(function (a, r) { return a + r.cur; }, 0), pt = R.reduce(function (a, r) { return a + r.prev; }, 0), p = pct(ct, pt);
    var line = el("p", "status"); line.style.fontWeight = "600"; line.textContent = (S.state === "stale" ? "Showing the last verified Hostaway totals (refresh unavailable) · " : "Hostaway verified · ") + S.year + ": " + aed(ct) + " · " + (S.year - 1) + ": " + aed(pt) + (p != null ? " · " + sgn(p) : ""); pad.append(line);
    if (S.year === nowY()) {
      var m = nowM(), c2 = R.slice(0, m + 1).reduce(function (a, r) { return a + r.cur; }, 0), p2 = R.slice(0, m + 1).reduce(function (a, r) { return a + r.prev; }, 0), q = pct(c2, p2);
      pad.append(el("p", "status", "Jan to " + MONTHS[m] + ": " + S.year + " " + aed(c2) + " against " + aed(p2) + (q != null ? " (" + sgn(q) + ")" : "") + ". Months after " + MONTHS[m] + " show bookings made so far, so they are not final and the change marked * is not a real drop."));
    }
    var miss = R.reduce(function (a, r) { return a + r.curMissing + r.prevMissing; }, 0);
    if (S.metric === "net" && miss) pad.append(el("p", "status", miss + " booked nights have no Hostaway net value and are left out. Nothing is estimated."));
    if (!R.some(function (r) { return r.cur || r.prev; })) { pad.append(el("p", "status", "No revenue found for these years.")); return; }
    var box = el("div"); box.style.cssText = "overflow-x:auto"; box.id = "revChart"; box.append(chart(R)); pad.append(box);
    var lg = el("div", "chips"); [["color-mix(in srgb,var(--navy) 38%,var(--bg))", String(S.year - 1)], ["var(--navy)", String(S.year)]].forEach(function (l) { var c = el("span", "chip"); var d = el("i"); d.style.cssText = "display:inline-block;width:12px;height:12px;border-radius:3px;background:" + l[0]; c.append(d, document.createTextNode(l[1])); lg.append(c); });
    pad.append(lg, el("p", "status", "The number inside a " + S.year + " bar is the listings with revenue that month."), table(R));
    var ac = el("div", "acts"); ac.append(bt("Refresh", function () { refresh(true); }, "ghost")); pad.append(ac);
  }

  /* one button in the header opens the graphs in a window; nothing sits on the page */
  function openGraphs() {
    if (!dlg) {
      dlg = el("div", "onb"); dlg.id = "gfxDlg"; dlg.hidden = true; dlg.setAttribute("role", "dialog"); dlg.setAttribute("aria-modal", "true"); dlg.setAttribute("aria-labelledby", "gfxTitle");
      var box = el("div", "onbbox card"); box.style.maxWidth = "1000px"; var pad = el("div", "pad");
      var hr = el("div", "headrow"); var t = el("h2", "", "Graphs"); t.id = "gfxTitle"; t.style.flex = "1 1 200px"; hr.append(t, bt("Close", function () { dlg.hidden = true; }));
      var body = el("div"); body.id = "gfxBody"; pad.append(hr, body); box.append(pad); dlg.append(box); document.body.append(dlg);
      dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.hidden = true; });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !dlg.hidden) dlg.hidden = true; });
    }
    card = $("gfxBody"); card.replaceChildren(); dlg.hidden = false;
    if (S.state === "ok" || S.state === "stale") draw(); else refresh(false);
    var c = dlg.querySelector("button"); if (c) c.focus();
  }
  function addButton() {
    if (btn || S.state === "hidden") return;
    var row = document.querySelector(".herorefresh"); if (!row) return;
    btn = el("button", "btn", "📊 Graphs"); btn.type = "button"; btn.id = "graphsBtn"; btn.title = "Show the graphs";
    btn.onclick = openGraphs; var after = $("refresh"); after && after.nextSibling ? row.insertBefore(btn, after.nextSibling) : row.append(btn);
  }
  var tries = 0;
  function start() {
    var on = false; try { on = G.connected(); } catch (e) {}
    if (!on) { if (++tries < 400) setTimeout(start, 2500); return; }
    card = el("div");                       /* detached until the window is opened */
    refresh(false).then(addButton);
  }
  window.WYZ_REV = { state: function () { return S; }, refresh: refresh };
  setTimeout(start, 2500);
})();
