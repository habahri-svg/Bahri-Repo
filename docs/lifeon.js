/* 3.48 Always on.
   - Ask my life: one question over My Life, your tasks, calendar and email.
   - Follow-up radar (Work view): everyone who owes you an answer, across email, hand-offs, WhatsApp and deals.
   - The 8am and 6pm brief: a banner when it's ready, the brief itself, and a PDF.
   - Phone notifications at 8am and 6pm (the server keeps only your phone's push address, nothing else).
   - Guitar and songbook: your SongBook one tap away, a practice log and songs to learn.
   Nothing here sends an email or a message. */
(function () {
  "use strict";
  var C = window.wyzLifeCollections; if (!C || typeof el !== "function") return;
  var btn = function (label, cls, fn) { var b = el("button", cls || "btn small", label); b.type = "button"; if (fn) b.onclick = fn; return b; };
  var say = function (t) { try { toast(t); } catch (e) {} };
  var items = function (c) { return window.wyzLifeItems(c); };
  var nid = function () { return "l" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };
  var pad = function (n) { return String(n).padStart(2, "0"); };
  var todayStr = function () { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
  var dayAdd = function (k) { var d = new Date(); d.setDate(d.getDate() + k); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
  var dubaiHour = function () { return (new Date().getUTCHours() + 4) % 24; };
  var nice = function () { return new Date().toLocaleString("en-GB", { timeZone: "Asia/Dubai", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); };
  var openItems = function () { try { return allItems().filter(function (i) { return !isOff(i); }); } catch (e) { return []; } };

  /* ---------- guitar and songbook ---------- */
  var SONGBOOK = "https://houssam-songbook.lovable.app";
  C.guitar = { name: "Guitar and songbook", icon: "🎸", noDue: true,
    fields: [["t", "Song", "text"], ["kind", "What", "select", ["Practised", "To learn", "Learning", "Learned"]], ["d", "Date", "date"], ["mins", "Minutes", "number"], ["n", "Notes", "textarea"]] };
  function guitarSection() {
    var card = window.wyzLifeSection("guitar", { intro: "Your SongBook, a practice log and the songs you want to learn.", empty: "Log a practice or add a song to learn." });
    var p = card.querySelector(".pad"), acts = p.querySelector(".acts");
    var url = (state.songbookUrl || SONGBOOK), a = el("a", "btn small", "🎵 Open my SongBook"); a.href = url; a.target = "_blank"; a.rel = "noopener";
    acts.prepend(a);
    acts.append(btn("✓ Log today's practice", "btn small", function () {
      var song = prompt("Which song did you practise?", ""); if (song == null) return;
      var mins = prompt("How many minutes?", "20"); if (mins == null) return;
      window.wyzLifeSave({ id: nid(), c: "guitar", t: (song.trim() || "Practice").slice(0, 100), d: todayStr(), f: { kind: "Practised", mins: String(+mins || 0) }, u: Date.now() });
      say("Practice logged.");
    }), btn("Change SongBook link", "btn small ghost", function () { var v = prompt("SongBook address", url); if (v && /^https:\/\//.test(v.trim())) { state.songbookUrl = v.trim(); persist(); window.wyzLifeRender(); } }));
    var log = items("guitar").filter(function (x) { return (x.f || {}).kind === "Practised" && x.d; });
    var days = new Set(log.filter(function (x) { return x.d >= dayAdd(-6); }).map(function (x) { return x.d; })).size;
    var mins = log.filter(function (x) { return x.d >= dayAdd(-6); }).reduce(function (s, x) { return s + (+((x.f || {}).mins) || 0); }, 0);
    var learn = items("guitar").filter(function (x) { var k = (x.f || {}).kind; return k === "To learn" || k === "Learning"; }).length;
    p.insertBefore(el("p", "status", "Last 7 days: practised on " + days + " day" + (days === 1 ? "" : "s") + ", " + mins + " minutes. " + learn + " song" + (learn === 1 ? "" : "s") + " to learn."), acts);
    return card;
  }

  /* ---------- ask my life ---------- */
  function lifeLines() {
    var next = window.wyzLifeNext;
    return items().filter(function (x) { return x.c !== "spend" || String(x.d || "") >= dayAdd(-62); }).slice(0, 400).map(function (x) {
      var f = x.f || {}, CC = C[x.c] || { name: x.c, fields: [] };
      var bits = CC.fields.filter(function (fd) { return ["t", "d", "n"].indexOf(fd[0]) < 0 && f[fd[0]]; }).map(function (fd) { return fd[1] + ": " + f[fd[0]]; });
      return CC.name + " | " + x.t + (x.d ? " | date " + x.d : "") + (next(x) && next(x) !== x.d ? " | next " + next(x) : "") + (x.r ? " | repeats " + x.r : "") + (x.done ? " | done" : "") + (bits.length ? " | " + bits.join("; ") : "") + (x.n ? " | notes: " + clip(x.n, 120) : "");
    }).join("\n");
  }
  function askCard() {
    var card = el("div", "card note lifesec"), p = el("div", "pad"); card.append(p); card.id = "life-ask";
    p.append(el("h2", "", "💬 Ask my life"), el("p", "status", "One question over My Life, your tasks, your calendar and your email."));
    var row = el("div", "ask"), q = el("input", "in"), go = btn("Ask", "btn solid", null), out = el("div");
    q.placeholder = "e.g. When is my car insurance due?"; q.setAttribute("aria-label", "Your question");
    var chips = el("div", "chips");
    ["What's due this week?", "When is my next trip?", "What did I spend this month?", "What's pending with SAMOCO?"].forEach(function (t) { chips.append(btn(t, "chip", function () { q.value = t; go.click(); })); });
    go.onclick = async function () {
      var ques = q.value.trim(); if (!ques) { q.focus(); return; }
      out.replaceChildren();
      if (!sample) { out.append(el("p", "status", "This needs the AI. Connect Claude or ChatGPT under Settings first.")); return; }
      go.disabled = true; out.append(el("p", "status", "Looking through your life..."));
      try {
        var plan = await creditFallback(function (prov) { return sample.json("Turn this question into a short Gmail search query that would find the most relevant emails from the last year, or empty if email won't help. Question: " + ques + "\nReturn {\"gmail\":\"...\"}", { cache: false, provider: prov }); });
        var mails = [];
        if (plan && plan.gmail) { try { var r = await mcp.callTool("Gmail", "search_threads", { query: String(plan.gmail).slice(0, 200) + " newer_than:365d", pageSize: 8 }, { cache: false }); mails = ((r.payload && r.payload.threads) || []).map(slimThread).slice(0, 8); } catch (e) {} }
        var evs = (events || []).filter(function (e) { var s = e.start && (e.start.dateTime || e.start.date); return s && String(s).slice(0, 10) >= todayStr(); }).slice(0, 30).map(function (e) { return (e.start.dateTime || e.start.date) + " " + (e.summary || ""); }).join("\n");
        var tasks = (state.tasks || []).filter(function (t) { return !t.done; }).slice(0, 40).map(function (t) { return t.t + (t.due ? " (due " + t.due + ")" : ""); }).join("\n");
        var ans = await creditFallback(function (prov) { return sample.json("You are the personal assistant of " + (myName || "the user") + ". Today is " + new Date().toDateString() + " (Dubai). Answer the question from the information below only. Be short and plain, with exact dates and amounts. No em dashes. If the answer isn't there, say so and say where to add it.\nQuestion: " + ques + "\n\nMY LIFE:\n" + (lifeLines() || "(empty)") + "\n\nTASKS:\n" + (tasks || "(none)") + "\n\nCALENDAR:\n" + (evs || "(none)") + "\n\nEMAILS:\n" + (mails.map(function (t, i) { return "e" + i + " | " + String(t.date || "").slice(0, 16) + " | " + nameOf(t.from) + " | " + t.subject + " | " + t.snippet; }).join("\n") || "(none)") + "\n\nReturn {\"answer\":\"...\",\"emails\":[\"e0\"]} listing only emails you used.", { cache: false, provider: prov }); });
        out.replaceChildren(el("div", "mailtext", String((ans && ans.answer) || "No answer came back.")));
        var used = ((ans && ans.emails) || []).map(function (k) { return mails[+String(k).replace(/\D/g, "")]; }).filter(Boolean);
        if (used.length) { var u = el("div", "acts"); u.append(el("span", "status", "From:")); used.forEach(function (t) { u.append(btn(clip(t.subject, 40), "btn small ghost", function () { openThread(t.id); })); }); out.append(u); }
      } catch (e) { out.replaceChildren(el("p", "status err", "Couldn't answer (" + clip((e && e.message) || "unknown reason", 90) + ").")); }
      go.disabled = false;
    };
    q.addEventListener("keydown", function (e) { if (e.key === "Enter") go.click(); });
    row.append(q, go); p.append(row, chips, out);
    return card;
  }

  /* ---------- follow-up radar (Work view) ---------- */
  function radarList() {
    var out = [];
    openItems().forEach(function (i) {
      if (i.st !== "wait" && i.st !== "follow") return; var t = tById(i.id); if (!t || !t.lastFromMe) return;
      out.push({ kind: "Email", title: i.title || t.subject, who: nameOf((t.lastTo || [])[0] || ""), days: t.daysSinceLast || 0, go: function () { openThread(i.id, { item: i, draft: true }); }, label: "Chase" });
    });
    Object.keys(state.handoffs || {}).forEach(function (id) { var h = state.handoffs[id]; if (!h || h.status !== "waiting") return; out.push({ kind: "Handed off", title: h.subject || "Handed off", who: h.name || h.to || "", days: Math.floor((Date.now() - (h.at || Date.now())) / 864e5), go: function () { openThread(id); }, label: "Open" }); });
    try { (window.wyzWA ? window.wyzWA() : []).forEach(function (c) { var l = c.last; if (!l || l.dir !== "out") return; var d = Math.floor((Date.now() - (+l.at || Date.now())) / 864e5); if (d < 1) return; out.push({ kind: "WhatsApp", title: clip(l.text || "", 60), who: c.name || ("+" + c.wa), days: d, go: function () { window.wyzOpenWA(c); }, label: "Open" }); }); } catch (e) {}
    items("deals").forEach(function (x) { var st = (x.f || {}).stage; if (!x.d || x.d >= todayStr() || ["Won", "Lost", "On hold", "Signed"].indexOf(st) >= 0) return; out.push({ kind: "Deal", title: x.t + ((x.f || {}).next ? ": " + x.f.next : ""), who: (x.f || {}).who || "", days: Math.round((Date.parse(todayStr()) - Date.parse(x.d)) / 864e5), go: function () { setLife(); window.wyzLifeOpenForm("deals", x.id); }, label: "Update" }); });
    return out.sort(function (a, b) { return b.days - a.days; });
  }
  function setLife() { var b = document.querySelector('#modeSw button[data-mode="life"]'); if (b) b.click(); }
  function drawRadar() {
    var host = $("owedCard"); if (!host || !host.parentNode) return;
    var card = $("radarCard"); if (!card) { card = el("div", "card note"); card.id = "radarCard"; host.parentNode.insertBefore(card, host); }
    var list = radarList(); card.hidden = !list.length; card.replaceChildren(); if (!list.length) return;
    var p = el("div", "pad"); card.append(p);
    var h = el("h2"); h.append(el("span", "", "📡 Follow-up radar"), el("span", "lcount", String(list.length))); h.style.display = "flex"; h.style.alignItems = "center"; h.lastChild.style.marginLeft = "auto"; p.append(h);
    var by = {}; list.forEach(function (x) { by[x.kind] = (by[x.kind] || 0) + 1; });
    p.append(el("p", "status", "Everyone who owes you an answer, longest wait first: " + Object.keys(by).map(function (k) { return by[k] + " " + k.toLowerCase(); }).join(", ") + ". Chase opens a draft, nothing is sent until you press Send and Confirm."));
    list.slice(0, 10).forEach(function (x) {
      var r = el("div", "litem"), m = el("div", "main"), a = el("div", "la");
      m.append(el("div", "lt", x.title), el("div", "lm", x.kind + (x.who ? " · " + x.who : "") + " · waiting " + (x.days <= 0 ? "today" : x.days + " day" + (x.days === 1 ? "" : "s"))));
      a.append(btn(x.label, x.label === "Chase" ? "btn small solid" : "btn small", x.go)); r.append(m, a); p.append(r);
    });
  }
  if (typeof renderBoard === "function") { var _rb = renderBoard; window.renderBoard = function () { var r = _rb.apply(this, arguments); try { drawRadar(); drawBanner(); } catch (e) {} return r; }; }

  /* ---------- the 8am and 6pm brief ---------- */
  var slot = function () { var h = dubaiHour(); return h >= 5 && h < 14 ? "morning" : h >= 16 || h < 2 ? "evening" : ""; };
  function briefData(kind) {
    var d = {}, evDay = kind === "evening" ? dayAdd(1) : todayStr();
    try { d.top = top3Rows().slice(0, 5).map(function (x) { return x.title + (x.why ? " (" + clip(x.why, 60) + ")" : ""); }); } catch (e) { d.top = []; }
    d.replies = openItems().filter(function (i) { return i.st === "reply"; }).map(function (i) { return i.title; });
    d.meet = (events || []).filter(function (e) { var s = e.start && (e.start.dateTime || e.start.date); return s && String(s).slice(0, 10) === evDay && e.status !== "cancelled"; }).map(function (e) { return (e.start.dateTime ? fmtTime(e.start.dateTime) : "All day") + " " + (e.summary || "(No title)"); });
    d.meetLabel = kind === "evening" ? "Meetings tomorrow" : "Meetings today";
    d.life = (window.wyzLifeDue ? window.wyzLifeDue(3) : []).map(function (o) { return o.x.t + " (" + o.d + ")"; });
    d.radar = radarList().slice(0, 5).map(function (x) { return x.title + " · " + x.who + ", " + x.days + " days"; });
    var start = new Date(); start.setHours(0, 0, 0, 0);
    d.done = (state.log || []).filter(function (l) { return l.at >= start.getTime(); }).map(function (l) { return l.t; });
    return d;
  }
  function openBrief(kind) {
    kind = kind === "evening" || kind === "morning" ? kind : (slot() || (dubaiHour() < 14 ? "morning" : "evening"));
    state.briefSeen = state.briefSeen || {}; state.briefSeen[todayStr() + ":" + kind] = 1; persist(); drawBanner();
    var d = briefData(kind), h = infoOpen((kind === "morning" ? "☀️ Morning brief" : "🌙 Evening brief") + " · " + nice());
    var sec = function (title, list, empty) { var s = el("div", "infosec"); s.append(el("h3", "", title + (list.length ? " (" + list.length + ")" : ""))); if (!list.length) s.append(el("p", "status", empty)); list.slice(0, 8).forEach(function (t) { s.append(el("div", "lm", "• " + t)); }); h.append(s); };
    h.append(el("p", "status", ($("heroSum") && $("heroSum").textContent) || ""));
    if (kind === "evening") sec("Done today", d.done, "Nothing marked done today yet.");
    sec(kind === "morning" ? "Do these first" : "Still open for tomorrow", d.top, "Nothing urgent.");
    sec("Replies waiting", d.replies, "No one is waiting for a reply.");
    sec(d.meetLabel, d.meet, "No meetings.");
    sec("My Life in the next 3 days", d.life, "Nothing due.");
    sec("Waiting on others", d.radar, "Nobody owes you anything.");
    var a = el("div", "acts");
    a.append(btn(kind === "morning" ? "Plan my day" : "End-of-day wrap", "btn small solid", function () { infoClose(); var b = $(kind === "morning" ? "planBtn" : "wrapBtn"); if (b) b.click(); }), btn("⬇️ PDF", "btn small", function () { briefPdf(kind, d); }), btn("🔔 Phone notifications", "btn small ghost", function () { infoClose(); setLife(); setTimeout(function () { var n = $("life-notify"); if (n) n.scrollIntoView({ block: "start" }); }, 200); }));
    h.append(a);
  }
  window.wyzOpenBrief = openBrief;
  async function briefPdf(kind, d) {
    try {
      if (!window.jspdf) await new Promise(function (ok, no) { var s = document.createElement("script"); s.src = "jspdf.umd.min.js"; s.onload = ok; s.onerror = function () { no(new Error("couldn't load the PDF maker")); }; document.head.append(s); });
      var doc = new window.jspdf.jsPDF({ unit: "pt", format: "a4" }), M = 48, y = 56;
      var line = function (t, size, bold, col) { doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size || 10); doc.setTextColor.apply(doc, col || [14, 34, 56]); doc.splitTextToSize(String(t).replace(/[^\x20-\x7E -ÿ]/g, ""), 595 - 2 * M).forEach(function (l) { if (y > 790) { doc.addPage(); y = 56; } doc.text(l, M, y); y += (size || 10) * 1.35; }); };
      line("WYZ Rent · Execution Page", 9, true, [184, 146, 60]); line(kind === "morning" ? "Morning brief" : "Evening brief", 20, true, [16, 75, 112]); line(nice() + " (Dubai time)", 9, false, [86, 105, 124]);
      var sec = function (t, l) { y += 8; line(t, 13, true, [16, 75, 112]); if (!l.length) line("Nothing.", 10, false, [86, 105, 124]); l.slice(0, 15).forEach(function (x) { line("- " + x); }); };
      if (kind === "evening") sec("Done today", d.done);
      sec(kind === "morning" ? "Do these first" : "Still open for tomorrow", d.top); sec("Replies waiting", d.replies); sec(d.meetLabel, d.meet); sec("My Life in the next 3 days", d.life); sec("Waiting on others", d.radar);
      var dub = new Date(Date.now() + 4 * 3600000), name = (kind === "morning" ? "Morning" : "Evening") + "_Brief_" + dub.getUTCFullYear() + "-" + pad(dub.getUTCMonth() + 1) + "-" + pad(dub.getUTCDate()) + "_" + pad(dub.getUTCHours()) + pad(dub.getUTCMinutes()) + ".pdf";
      doc.save(name); say("Downloaded " + name + ", created " + nice() + " Dubai time.");
    } catch (e) { say("Couldn't make the PDF (" + clip((e && e.message) || "", 60) + ")."); }
  }
  function drawBanner() {
    var s = slot(), host = $("p-today"); if (!host) return;
    var b = $("briefBanner");
    var seen = state.briefSeen && state.briefSeen[todayStr() + ":" + s];
    if (!s || seen || !signedIn()) { if (b) b.remove(); return; }
    if (!b) { b = el("div", "card note"); b.id = "briefBanner"; var ref = $("top3") || host.firstChild; host.insertBefore(b, ref); }
    b.replaceChildren(); var p = el("div", "pad"), row = el("div", "acts"); b.append(p);
    row.append(el("b", "", s === "morning" ? "☀️ Your morning brief is ready" : "🌙 Your evening brief is ready"), btn("Open it", "btn small solid", function () { openBrief(s); }), btn("Not now", "btn small ghost", function () { state.briefSeen = state.briefSeen || {}; state.briefSeen[todayStr() + ":" + s] = 1; persist(); b.remove(); }));
    row.style.alignItems = "center"; p.append(row);
  }
  var signedIn = function () { try { return G.connected(); } catch (e) { return false; } };

  /* ---------- phone notifications ---------- */
  var b64ToBytes = function (s) { s = String(s).replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; var r = atob(s), o = new Uint8Array(r.length); for (var i = 0; i < r.length; i++) o[i] = r.charCodeAt(i); return o; };
  async function api(method, body) { var t = await G.token(); var r = await fetch("/api/push", { method: method, headers: { Authorization: "Bearer " + t, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); var j = {}; try { j = await r.json(); } catch (e) {} if (!r.ok) throw new Error(j.error || ("The server answered " + r.status + ".")); return j; }
  var standalone = function () { return (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true; };
  var isIOS = function () { return /iPhone|iPad|iPod/.test(navigator.userAgent); };
  function notifyCard() {
    var card = el("div", "card lifesec"), p = el("div", "pad"); card.append(p); card.id = "life-notify";
    p.append(el("h2", "", "🔔 Brief on your phone"), el("p", "status", "At 8am and 6pm Dubai time your phone gets \"Your morning brief\" or \"Your evening brief\". Tap it and the brief opens here. The server keeps only your phone's notification address, never your emails or My Life."));
    var st = el("p", "status", ""), a = el("div", "acts"); p.append(st, a);
    var supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    var show = function (t, err) { st.className = "status" + (err ? " err" : ""); st.textContent = t; };
    if (!supported) { show(isIOS() && !standalone() ? "On iPhone, add the page to your Home Screen first (Install tab), then open it from there and come back here." : "This browser can't show notifications.", true); a.append(btn("Open the brief now", "btn small", function () { openBrief(); })); return card; }
    show(Notification.permission === "granted" ? "Notifications are allowed on this device." : Notification.permission === "denied" ? "Notifications are blocked for this site. Allow them in your browser's site settings, then come back." : "Not turned on yet on this device.");
    a.append(btn("Turn on for this device", "btn small solid", async function (e) {
      var b = e.target; b.disabled = true;
      try {
        if (isIOS() && !standalone()) throw new Error("On iPhone, add the page to your Home Screen first (Install tab), then open it from there.");
        var perm = await Notification.requestPermission(); if (perm !== "granted") throw new Error("Notifications weren't allowed.");
        var info = await api("GET"); if (!info.ready) throw new Error(info.storage === false ? "Setup needed: storage (Upstash) isn't switched on for this site yet. Ask Houssam." : "The server isn't ready for notifications yet.");
        var reg = await navigator.serviceWorker.ready;
        var sub = await reg.pushManager.getSubscription(); if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(info.key) });
        await api("POST", { action: "subscribe", sub: { endpoint: sub.endpoint } });
        state.pushOn = 1; persist(); show("On. You'll get the brief at 8am and 6pm Dubai time on this device.");
      } catch (x) { show(String((x && x.message) || "Couldn't turn it on."), true); }
      b.disabled = false;
    }), btn("Send a test", "btn small", async function () {
      try { var j = await api("POST", { action: "test" }); show(j.sent ? "Test sent to " + j.sent + " device" + (j.sent === 1 ? "" : "s") + ". It should arrive in a few seconds." : "No device is signed up yet. Tap Turn on first.", !j.sent); } catch (x) { show(String((x && x.message) || "Couldn't send a test."), true); }
    }), btn("Turn off here", "btn small ghost", async function () {
      try { var reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription(); if (sub) { await api("POST", { action: "unsubscribe", endpoint: sub.endpoint }).catch(function () {}); await sub.unsubscribe(); } state.pushOn = 0; persist(); show("Off on this device."); } catch (x) { show("Couldn't turn it off.", true); }
    }), btn("Open the brief now", "btn small ghost", function () { openBrief(); }));
    return card;
  }

  /* ---------- wiring ---------- */
  window.wyzLifeAddTop(askCard);
  window.wyzLifeAddSection(guitarSection);
  window.wyzLifeAddSection(notifyCard);
  if (navigator.serviceWorker) navigator.serviceWorker.addEventListener("message", function (e) { if (e.data && e.data.brief) openBrief(e.data.brief); });
  var tries = 0;
  (function wait() {
    if (!signedIn() || typeof board === "undefined" || !board) { if (++tries < 200) setTimeout(wait, 3000); return; }
    drawRadar(); drawBanner();
    if (location.hash === "#brief") { history.replaceState(null, "", location.pathname + location.search); openBrief(); }
  })();
  setInterval(function () { if (!document.hidden) drawBanner(); }, 10 * 60000);
  try { if (!$("p-life").hidden) window.wyzLifeRender(); } catch (e) {}
})();
