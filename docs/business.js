/* Business extras: WYZ numbers from Hostaway, Team pulse for the owner, and Send to Command Center.
   Each one stays hidden until it is set up, and the owner sees a setup card with direct links instead. */
(function () {
  "use strict";
  if (typeof $ !== "function" || typeof el !== "function") return;
  var CFG = window.WYZ_CONFIG || {};

  async function call(path, opts) {
    var t = await G.token();
    var r = await fetch(path, Object.assign({}, opts || {}, { headers: { Authorization: "Bearer " + t, "content-type": "application/json" } }));
    var j = {}; try { j = await r.json(); } catch (e) {}
    if (!r.ok && !j.viewer && !j.owner) throw new Error(j.error || ("The server answered " + r.status + "."));
    return j;
  }
  var money = function (n, c) { try { return new Intl.NumberFormat("en-GB", { style: "currency", currency: c || "AED", maximumFractionDigits: 0 }).format(n); } catch (e) { return (c || "AED") + " " + Math.round(n).toLocaleString("en-GB"); } };
  var link = function (label, href, cls) { var a = el("a", "btn small" + (cls ? " " + cls : ""), label); a.href = href; a.target = "_blank"; a.rel = "noopener"; return a; };
  var VENV = "https://vercel.com/d?to=" + encodeURIComponent("/[team]/[project]/settings/environment-variables");
  var VDEP = "https://vercel.com/d?to=" + encodeURIComponent("/[team]/[project]/deployments");

  /* ---------- WYZ numbers strip (Hostaway) ---------- */
  var strip = null;
  function stripBox() {
    if (strip && strip.isConnected) return strip;
    strip = el("div", "card note"); strip.id = "haStrip";
    var p = $("p-today"); if (p) p.prepend(strip);
    return strip;
  }
  function tile(label, value, list, sub) {
    var b = el("button", "chip"); b.type = "button"; b.style.cssText = "flex-direction:column;align-items:flex-start;border-radius:10px;padding:8px 12px;min-width:120px";
    b.append(el("span", "status", label), el("b", "", String(value))); if (sub) b.append(el("span", "status", sub));
    if (list && list.length) b.onclick = function () {
      var h = infoOpen(label);
      list.forEach(function (x) { var r = el("div", "item"); var m = el("div", "main"); m.append(el("span", "t", x.guest), el("span", "m", x.place + " · " + x.from + " to " + x.to + " · " + x.nights + " night" + (x.nights === 1 ? "" : "s"))); r.append(m); h.append(r); });
    };
    else b.disabled = !list;
    return b;
  }
  async function loadStrip(fresh) {
    var j;
    try { j = await call("/api/hostaway" + (fresh ? "?fresh=1" : "")); } catch (e) { return; }
    if (!j || !j.viewer) { if (strip) strip.remove(); return; }
    var box = stripBox(); box.replaceChildren(); var pad = el("div", "pad"); box.append(pad);
    var head = el("div", "headrow"); head.append(el("h2", "", "Today at " + (CFG.COMPANY || "WYZ Rent")));
    if (!j.ready) {
      if (!j.owner) { box.remove(); return; }
      pad.append(head, el("p", "status", "Connect Hostaway to see today's check-ins, check-outs, guests in house, occupancy and this month's bookings here."));
      pad.append(el("p", "status", "1. Copy your Account ID and create an API key in Hostaway. 2. Add them in Vercel as HOSTAWAY_ACCOUNT_ID and HOSTAWAY_API_KEY. Optional: HOSTAWAY_CITY = Dubai to count Dubai only, and HOSTAWAY_VIEWERS for who else may see it. 3. Redeploy."));
      var a = el("div", "acts"); a.append(link("🔑 Hostaway API settings", "https://dashboard.hostaway.com/settings/hostaway-api", "solid"), link("⚙️ Vercel settings", VENV, "solid"), link("🚀 Vercel deployments", VDEP));
      var x = el("button", "btn small ghost", "Hide this"); x.type = "button"; x.onclick = function () { state.haHide = 1; persist(); box.remove(); }; a.append(x);
      if (state.haHide) { box.remove(); return; }
      pad.append(a); return;
    }
    if (j.error) { pad.append(head, el("p", "status err", j.error)); return; }
    var rf = el("button", "btn small ghost", "Refresh"); rf.type = "button"; rf.onclick = function () { rf.disabled = true; loadStrip(true); }; head.append(rf);
    pad.append(head);
    var row = el("div", "acts");
    row.append(tile("Check-ins today", j.checkIns.length, j.checkIns), tile("Check-outs today", j.checkOuts.length, j.checkOuts), tile("Guests in house", j.inHouse, null),
      tile("Occupancy this month", j.occupancy + "%", null, j.listings + " listings" + (j.city ? " in " + j.city : "")), tile("Booked this month", money(j.revenue, j.currency), null, "Nights in " + j.month));
    pad.append(row, el("span", "status", "From Hostaway, " + new Date(j.at).toLocaleTimeString("en-GB", { timeZone: "Asia/Dubai", hour: "2-digit", minute: "2-digit" }) + " Dubai time. Tap a number to see the guests."));
  }

  /* ---------- Team pulse ---------- */
  function counts() {
    var items = allItems().filter(function (i) { return !isOff(i); });
    var n = function (k) { return items.filter(function (i) { return i.st === k; }).length; };
    var owed = new Set(); items.forEach(function (i) { if (i.st === "wait" || i.st === "follow") { var t = tById(i.id); if (t && t.lastFromMe) owed.add(addrOf((t.lastTo || [])[0] || "")); } });
    var hand = Object.values(state.handoffs || {}).filter(function (h) { return h && h.status === "waiting"; }).length;
    var tasks = (state.tasks || []).filter(function (t) { return t && !t.done; }), today = todayKey();
    var overdue = tasks.filter(function (t) { var d = t.due || t.date || ""; return d && String(d).slice(0, 10) < today; }).length;
    return { reply: n("reply"), follow: n("follow"), wait: n("wait"), owed: owed.size, handed: hand, overdue: overdue, open: tasks.length, name: myName || "" };
  }
  var lastPulse = 0;
  function sendPulse() {
    if (state.pulseOff || !board || Date.now() - lastPulse < 2 * 3600000) return;
    try { if (G.mainType && G.mainType() === "ms") {} } catch (e) {}
    lastPulse = Date.now();
    call("/api/pulse", { method: "POST", body: JSON.stringify(counts()) }).catch(function () {});
  }
  async function loadPulse() {
    var j; try { j = await call("/api/pulse"); } catch (e) { return; }
    if (!j || !j.owner) return;
    var host = $("handoffCard"); if (!host || !host.parentNode) return;
    var card = $("pulseCard"); if (!card) { card = el("div", "card note"); card.id = "pulseCard"; host.parentNode.insertBefore(card, host); }
    card.replaceChildren(); var pad = el("div", "pad"); card.append(pad);
    pad.append(el("h2", "", "Team pulse"));
    if (!j.storage) {
      pad.append(el("p", "status", "Switch on storage to see what each person has open: replies due, people to chase, overdue tasks. Add Upstash Redis to this Vercel project (free), then redeploy."));
      var a = el("div", "acts"); a.append(link("🗄️ Add Upstash Redis", "https://vercel.com/marketplace/upstash", "solid"), link("🚀 Vercel deployments", VDEP));
      var x = el("button", "btn small ghost", "Hide this"); x.type = "button"; x.onclick = function () { state.pulseHide = 1; persist(); card.remove(); }; a.append(x);
      if (state.pulseHide) { card.remove(); return; }
      pad.append(a); return;
    }
    if (!j.people.length) { pad.append(el("p", "status", "No one has shared yet. Each person's page sends its counts a few times a day once they open it.")); return; }
    pad.append(el("span", "status", "Counts only, never email text. Most behind first."));
    j.people.forEach(function (p) {
      var r = el("div", "item"); var hot = p.overdue + p.follow;
      r.append(el("span", "dot " + (hot >= 5 ? "reply" : hot ? "follow" : "fyi")));
      var m = el("div", "main");
      m.append(el("span", "t", (p.name || p.email.split("@")[0]) + " · " + p.email));
      m.append(el("span", "m", p.reply + " to reply · " + p.follow + " to chase · " + p.wait + " waiting · " + p.handed + " handed off · " + p.overdue + " overdue of " + p.open + " tasks"));
      m.append(el("span", "status", "Updated " + (typeof fmtWhen === "function" ? fmtWhen(p.at) : new Date(p.at).toLocaleString("en-GB"))));
      r.append(m); pad.append(r);
    });
  }

  /* ---------- Send to Command Center ---------- */
  window.ccButton = function () {
    var b = el("button", "btn small", "📤 Command Center"); b.type = "button"; b.title = "Send this to the company Command Center as an action item";
    b.onclick = function () { openCC(); };
    return b;
  };
  function openCC() {
    var url = String(CFG.COMMAND_CENTER_URL || "").trim();
    var t = tById(thr.id) || {}, it = thr.item || {};
    var host = infoOpen("📤 Send to Command Center");
    if (!url) {
      host.append(el("p", "status", "This needs an intake address from the Command Center (the Lovable dashboard). Once Abbas adds it, paste it into config.js as COMMAND_CENTER_URL and this button sends straight there."));
      var spec = "Please add an intake endpoint to the WYZ Command Center:\n\nPOST <your address>\nHeader: Authorization: Bearer <Google access token of the sender> (check it with https://oauth2.googleapis.com/tokeninfo and accept only wyzrent.com and our owner accounts)\nBody (JSON): {\"type\":\"action_item\",\"title\":\"...\",\"summary\":\"...\",\"priority\":\"low|medium|high|critical\",\"department\":\"...\",\"from\":\"sender of the email\",\"subject\":\"...\",\"link\":\"Gmail link\",\"sentBy\":\"email of the person sending\",\"createdAt\":\"ISO time\"}\nAnswer: {\"ok\":true,\"id\":\"...\",\"url\":\"link to the item\"}\nAllow the origin " + location.origin + " (CORS).";
      var pre = el("pre", "", spec); pre.style.cssText = "white-space:pre-wrap;font-size:12px;border:1px solid var(--line);border-radius:6px;padding:8px;background:var(--bg)";
      var cp = el("button", "btn small solid", "Copy the request for Abbas"); cp.type = "button"; cp.onclick = function () { navigator.clipboard.writeText(spec).then(function () { cp.textContent = "Copied"; }).catch(function () {}); };
      var a = el("div", "acts"); a.append(cp, link("Open config.js on GitHub", "https://github.com/habahri-svg/Bahri-Repo/edit/claude/gracious-mayer-ywmspl/docs/config.js"));
      host.append(pre, a); return;
    }
    var ti = el("input", "in"); ti.value = it.title || t.subject || ""; ti.setAttribute("aria-label", "Title");
    var su = el("textarea", "in"); su.rows = 3; su.value = it.summary || t.snippet || ""; su.setAttribute("aria-label", "What needs doing");
    var pr = el("select", "in"); [["medium", "Medium"], ["high", "High"], ["critical", "Critical"], ["low", "Low"]].forEach(function (o) { pr.append(new Option(o[1], o[0])); });
    pr.value = ({ 4: "critical", 3: "high", 1: "low" })[it.g] || "medium";
    var dep = el("select", "in"); ["", "Operations", "Guest relations", "Owners", "Owner acquisition", "Accounting", "Finance", "Pricing", "Marketing", "Maintenance", "CEO"].forEach(function (d) { dep.append(new Option(d || "Department (optional)", d)); });
    var st = el("p", "status", "");
    var go = el("button", "btn small solid", "Send"); go.type = "button";
    go.onclick = async function () {
      go.disabled = true; go.textContent = "Sending...";
      try {
        var tok = await G.token();
        var r = await fetch(url, { method: "POST", headers: { Authorization: "Bearer " + tok, "content-type": "application/json" }, body: JSON.stringify({ type: "action_item", title: ti.value.trim(), summary: su.value.trim(), priority: pr.value, department: dep.value, from: t.from || "", subject: t.subject || "", link: t.url || "", sentBy: email || "", createdAt: new Date().toISOString() }) });
        var j = {}; try { j = await r.json(); } catch (e) {}
        if (!r.ok) throw new Error(j.error || ("the Command Center answered " + r.status));
        go.textContent = "Sent"; st.textContent = "It's in the Command Center now."; if (j.url) st.append(" ", link("Open it", j.url));
      } catch (e) { go.disabled = false; go.textContent = "Send"; st.className = "status err"; st.textContent = "Couldn't send it (" + clip((e && e.message) || "unknown reason", 100) + ")."; }
    };
    var a = el("div", "acts"); a.append(go);
    host.append(ti, su, pr, dep, a, st);
  }

  /* ---------- start once signed in ---------- */
  var started = false, tries = 0;
  function start() {
    var on = false; try { on = G.connected(); } catch (e) {}
    if (!on) { if (++tries < 400) setTimeout(start, 3000); return; }
    if (started) return; started = true;
    loadStrip(false); loadPulse();
    setInterval(function () { if (!document.hidden) loadStrip(false); }, 30 * 60000);
    setInterval(sendPulse, 10 * 60000); setTimeout(sendPulse, 20000);
  }
  setTimeout(start, 2000);
  if ($("pulseShare")) {
    $("pulseShare").onchange = function () { state.pulseOff = !$("pulseShare").checked; persist(); };
    setTimeout(function () { try { $("pulseShare").checked = !state.pulseOff; } catch (e) {} }, 4000);
  }
})();
