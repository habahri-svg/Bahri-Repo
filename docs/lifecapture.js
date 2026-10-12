/* 3.47 Capture: get things into My Life with the least effort.
   - Say it or type it: one line, the AI files it in the right section (or as a task). You check it first.
   - Scan and file: photo or PDF from your phone. The AI reads it, names it, saves it to your Drive and adds the record.
   - Travel: flights and hotels found in your email, a check-in reminder in your calendar.
   - Spending: a month's spend by category, read from your bank and card alert emails.
   Nothing is added or saved until you press the button. */
(function () {
  "use strict";
  var C = window.wyzLifeCollections; if (!C || typeof el !== "function") return;
  var btn = function (label, cls, fn) { var b = el("button", cls || "btn small", label); b.type = "button"; if (fn) b.onclick = fn; return b; };
  var say = function (t) { try { toast(t); } catch (e) {} };
  var save = function (x) { window.wyzLifeSave(x); };
  var items = function (c) { return window.wyzLifeItems(c); };
  var nid = function () { return "l" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };
  var pad = function (n) { return String(n).padStart(2, "0"); };
  var isDate = function (v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")); };
  var todayStr = function () { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
  var parseJ = function (t) { t = String(t || ""); var a = t.indexOf("{"), b = t.lastIndexOf("}"); if (a < 0 || b < a) throw new Error("the AI's answer wasn't readable"); return JSON.parse(t.slice(a, b + 1)); };
  var aiJson = function (prompt) { return creditFallback(function (prov) { return sample.json(prompt, { cache: false, provider: prov }); }); };
  var noAI = function (h) { h.append(el("p", "status", "This needs the AI. Connect Claude or ChatGPT under Settings first.")); };

  C.travel = { name: "Travel", icon: "✈️", dateLabel: "Date", dueFuture: true,
    fields: [["t", "What", "text"], ["kind", "Type", "select", ["Flight", "Hotel", "Car", "Train", "Other"]], ["d", "Date", "date"], ["time", "Time", "time"], ["from", "From", "text"], ["to", "To", "text"], ["ref", "Booking reference", "text"], ["trip", "Trip", "text"], ["link", "Link", "url"], ["n", "Notes", "textarea"]] };
  var CATS = ["Groceries", "Dining", "Transport", "Fuel", "Shopping", "Bills", "Travel", "Health", "Family", "Business", "Other"];
  C.spend = { name: "Spending", icon: "💸", dateLabel: "Date", noDue: true,
    fields: [["t", "Merchant", "text"], ["d", "Date", "date"], ["amt", "Amount (AED)", "money"], ["cat", "Category", "select", CATS], ["n", "Notes", "textarea"]] };

  var KINDS = ["family", "plans", "bills", "home", "health", "property", "deals", "docs", "travel", "spend"];
  var kindList = function () { return KINDS.filter(function (k) { return C[k]; }).map(function (k) { return k + " (" + C[k].name + ")"; }).join(", "); };

  /* ---------- a preview card: check and change before it's added ---------- */
  function preview(host, x, onAdd) {
    var box = el("div", "lform"), col = el("select"), ti = el("input"), da = el("input"), am = el("input");
    KINDS.concat(["task"]).forEach(function (k) { if (k === "task" || C[k]) col.append(new Option(k === "task" ? "✅ My tasks" : C[k].icon + " " + C[k].name, k)); });
    col.value = x.collection && (C[x.collection] || x.collection === "task") ? x.collection : "task";
    ti.value = x.title || ""; da.type = "date"; da.value = isDate(x.date) ? x.date : ""; am.type = "number"; am.step = "0.01"; am.value = x.amount ? String(x.amount).replace(/[^\d.]/g, "") : "";
    [["Where it goes", col], ["Title", ti], ["Date", da], ["Amount (AED), if any", am]].forEach(function (p) { var l = el("label"); l.append(el("span", "", p[0]), p[1]); p[1].setAttribute("aria-label", p[0]); box.append(l); });
    var acts = el("div", "acts full");
    acts.append(btn("Add it", "btn small solid", function () {
      var t = ti.value.trim(); if (!t) { ti.focus(); return; }
      if (col.value === "task") { try { addTask(t, "Captured", da.value, 1); } catch (e) {} say("Added to My tasks."); onAdd && onAdd(); return; }
      var f = Object.assign({}, x.fields || {}); if (am.value) f.amt = am.value;
      if (col.value === "spend" && !f.cat) f.cat = CATS.indexOf(x.category) >= 0 ? x.category : "Other";
      save({ id: nid(), c: col.value, t: t.slice(0, 140), d: da.value || (col.value === "spend" ? todayStr() : ""), r: ["monthly", "quarterly", "yearly"].indexOf(x.repeat) >= 0 ? x.repeat : "", n: x.notes || "", f: f, u: Date.now() });
      say("Added to " + C[col.value].name + "."); onAdd && onAdd();
    }));
    box.append(acts); host.append(box);
  }

  /* ---------- say it or type it ---------- */
  function captureCard() {
    var card = el("div", "card note lifesec"), p = el("div", "pad"); card.append(p); card.id = "life-capture";
    p.append(el("h2", "", "⚡ Capture"), el("p", "status", "Say it or type it in one line, e.g. \"DEWA bill 850 dirhams due on the 15th every month\" or \"dentist Thursday 10:30\". The AI files it. You check it first."));
    var row = el("div", "ask"), ta = el("input", "in"), mic = btn("🎤", "btn", null), go = btn("File it", "btn solid", null), out = el("div");
    ta.placeholder = "Say or type anything for My Life"; ta.setAttribute("aria-label", "What to capture");
    var SRc = window.SpeechRecognition || window.webkitSpeechRecognition, rec = null;
    mic.title = "Speak"; mic.setAttribute("aria-label", "Speak");
    mic.onclick = function () {
      if (rec) { try { rec.stop(); } catch (e) {} return; }
      if (!SRc) { say("This browser can't listen. Use the keyboard's microphone instead."); ta.focus(); return; }
      rec = new SRc(); rec.lang = /[؀-ۿ]/.test(ta.value) ? "ar-AE" : "en-GB"; rec.interimResults = true; var fin = "";
      rec.onresult = function (e) { var it = ""; for (var k = e.resultIndex; k < e.results.length; k++) { var t = e.results[k][0].transcript; if (e.results[k].isFinal) fin += t + " "; else it += t; } ta.value = (fin + it).trim(); };
      rec.onend = function () { rec = null; mic.textContent = "🎤"; if (ta.value.trim()) go.click(); };
      rec.onerror = function (e) { say(e.error === "not-allowed" ? "Allow the microphone for this site, then try again." : "Couldn't hear you."); };
      try { rec.start(); mic.textContent = "⏹"; } catch (e) { rec = null; }
    };
    go.onclick = async function () {
      var v = ta.value.trim(); if (!v) { ta.focus(); return; }
      out.replaceChildren();
      if (!sample) { preview(out, { title: v, collection: "task" }, function () { ta.value = ""; out.replaceChildren(); }); return; }
      go.disabled = true; out.append(el("p", "status", "Filing it..."));
      try {
        var r = await aiJson("Today is " + new Date().toDateString() + " (Dubai). File this note from " + (myName || "the user") + " into a personal life organiser. Sections: " + kindList() + ", or task (a to-do). Return {\"collection\":\"...\",\"title\":\"short plain title\",\"date\":\"YYYY-MM-DD or empty\",\"amount\":\"number in AED or empty\",\"repeat\":\"empty, monthly, quarterly or yearly\",\"category\":\"for spend only: " + CATS.join(", ") + "\",\"fields\":{},\"notes\":\"\"}. For fields use only these keys when they apply: time (HH:MM), who, prov, kind, from, to, ref, rel, email, phone, stage, next, co. Note: " + v);
        out.replaceChildren(); preview(out, r || {}, function () { ta.value = ""; out.replaceChildren(); });
      } catch (e) { out.replaceChildren(el("p", "status err", "Couldn't file it (" + clip((e && e.message) || "unknown reason", 80) + "). Pick the section yourself:")); preview(out, { title: v }, function () { ta.value = ""; out.replaceChildren(); }); }
      go.disabled = false;
    };
    ta.addEventListener("keydown", function (e) { if (e.key === "Enter") go.click(); });
    row.append(ta, mic, go); p.append(row, out);
    /* scan and file */
    var sc = el("div", "acts"), file = el("input"); file.type = "file"; file.accept = "image/*,application/pdf"; file.hidden = true;
    sc.append(btn("📷 Scan and file a document", "btn small", function () { file.click(); }), file);
    p.append(sc); var sout = el("div"); p.append(sout);
    file.onchange = function () { var f = file.files && file.files[0]; file.value = ""; if (f) scan(f, sout); };
    return card;
  }

  /* ---------- scan and file ---------- */
  function readB64(f) { return new Promise(function (ok, no) { var r = new FileReader(); r.onload = function () { ok(String(r.result).split(",")[1] || ""); }; r.onerror = function () { no(new Error("couldn't read the file")); }; r.readAsDataURL(f); }); }
  function shrink(f) {
    return new Promise(function (ok) {
      if (!/^image\//.test(f.type)) return ok(null);
      var img = new Image(), u = URL.createObjectURL(f);
      img.onload = function () { var s = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u); ok(c.toDataURL("image/jpeg", 0.82).split(",")[1]); };
      img.onerror = function () { URL.revokeObjectURL(u); ok(null); }; img.src = u;
    });
  }
  async function scan(f, out) {
    out.replaceChildren(el("p", "status", "Reading " + f.name + "..."));
    if (f.size > 15 * 1024 * 1024) { out.replaceChildren(el("p", "status err", "That file is over 15 MB. Take a smaller photo.")); return; }
    var isPdf = f.type === "application/pdf";
    if (isPdf && f.size > 3 * 1024 * 1024) { out.replaceChildren(el("p", "status err", "PDFs over 3 MB can't be read here. Save it to Drive and add it to the Document vault.")); return; }
    var x = { title: f.name.replace(/\.[^.]+$/, ""), collection: "docs" };
    try {
      var raw = await readB64(f), small = isPdf ? raw : (await shrink(f)) || raw;
      var aiNote = "";
      if (sample && Connectors.ai.avail("claude")) try {
        var block = { type: isPdf ? "document" : "image", source: { type: "base64", media_type: isPdf ? "application/pdf" : (small === raw ? f.type : "image/jpeg"), data: small } };
        var r = await sample([{ role: "user", content: [block, { type: "text", text: "Today is " + new Date().toDateString() + ". This is a document photographed or uploaded by " + (myName || "the user") + " for their personal life organiser. Read it and return JSON only: {\"collection\":\"one of " + KINDS.join(", ") + "\",\"title\":\"short plain title, e.g. DEWA bill September 2026\",\"kind\":\"Receipt, Bill, Contract, ID, Medical, Letter, Ticket or Other\",\"date\":\"YYYY-MM-DD: due date for bills, expiry for IDs, date for receipts and letters\",\"amount\":\"number in AED or empty\",\"category\":\"for receipts: " + CATS.join(", ") + "\",\"provider\":\"\",\"summary\":\"one line\"}. Receipts go to spend, bills to bills, IDs and contracts to docs, medical to health, tickets to travel." }] }], { cache: false, provider: "claude" });
        var j = {}; try { j = parseJ(r.text); } catch (pe) { j = {}; }
        x = { title: j.title || x.title, collection: KINDS.indexOf(j.collection) >= 0 ? j.collection : "docs", date: j.date, amount: j.amount, category: j.category, notes: j.summary || "", fields: { kind: j.kind || "", prov: j.provider || "" }, kindName: j.kind || "Other" };
      } catch (ae) { aiNote = "The AI couldn't read it (" + clip((ae && ae.message) || "unknown reason", 60) + "), so fill it in yourself. "; }
      out.replaceChildren(el("p", "status", aiNote + (sample ? "Check it, then press Add it. The file is saved to your Drive at the same time." : "No AI connected, so fill it in yourself. The file is saved to your Drive when you press Add it.")));
      var folder = "Execution Page scans";
      preview(out, x, null);
      var addBtn = out.querySelector(".lform .btn.solid"), orig = addBtn.onclick;
      addBtn.onclick = async function () {
        addBtn.disabled = true; addBtn.textContent = "Saving to Drive...";
        try {
          var dub = new Date(Date.now() + 4 * 3600000), stamp = dub.getUTCFullYear() + "-" + pad(dub.getUTCMonth() + 1) + "-" + pad(dub.getUTCDate()) + "_" + pad(dub.getUTCHours()) + pad(dub.getUTCMinutes());
          var ext = (f.name.match(/\.[a-z0-9]+$/i) || [isPdf ? ".pdf" : ".jpg"])[0];
          var title = out.querySelector('.lform input[aria-label="Title"]').value.trim() || x.title;
          var name = title.replace(/[\\\/:*?"<>|]+/g, " ").slice(0, 80) + "_" + stamp + ext;
          var sv = (await mcp.callTool("Google Drive", "save_file", { name: name, mime: f.type || "application/octet-stream", data: raw, folder: folder }, { cache: false })).payload || {};
          x.fields = Object.assign({}, x.fields, { link: sv.link || "" }); x.notes = (x.notes ? x.notes + "\n" : "") + "File: " + (sv.link || name);
          orig.call(addBtn); out.replaceChildren(el("p", "status", "Saved to your Drive folder \"" + folder + "\" as " + name + "."));
        } catch (e) { addBtn.disabled = false; addBtn.textContent = "Add it"; say("Couldn't save to Drive (" + clip((e && e.message) || "unknown reason", 70) + ")."); }
      };
      if (sample && !Connectors.ai.avail("claude")) out.prepend(el("p", "status", "Reading photos needs Claude. ChatGPT here only reads text, so fill it in yourself."));
    } catch (e) {
      out.replaceChildren(el("p", "status err", "The AI couldn't read it (" + clip((e && e.message) || "unknown reason", 80) + "). Fill it in yourself:"));
      preview(out, { title: f.name.replace(/\.[^.]+$/, ""), collection: "docs" }, function () { out.replaceChildren(el("p", "status", "Added. The file wasn't saved to Drive, add it from the Document vault.")); });
    }
  }

  /* ---------- travel ---------- */
  function addCal(title, d, t, mins, desc) {
    return mcp.callTool("Google Calendar", "create_event", { title: title, start: d + "T" + t, end: window.wyzEndAt(d, t, mins || 30), description: desc || "From My Life on your Execution Page." }, { cache: false });
  }
  function travelExtra(x, a) {
    var f = x.f || {};
    if (x.d && f.time) a.append(btn("📅", "btn small", function () { addCal("✈️ " + x.t, x.d, f.time, 60).then(function () { say("Added to your calendar."); }).catch(function (e) { say("Couldn't add it (" + clip((e && e.message) || "", 60) + ")."); }); }));
    if (f.kind === "Flight" && x.d && f.time) a.append(btn("Check-in reminder", "btn small", function () {
      var dt = new Date(x.d + "T" + f.time + ":00"); dt.setDate(dt.getDate() - 1);
      var d = dt.getFullYear() + "-" + pad(dt.getMonth() + 1) + "-" + pad(dt.getDate()), t = pad(dt.getHours()) + ":" + pad(dt.getMinutes());
      addCal("Online check-in: " + x.t, d, t, 15, "Check in online for " + x.t + (f.ref ? " (booking " + f.ref + ")" : "") + ".").then(function () { say("Check-in reminder set for " + d + " at " + t + "."); }).catch(function (e) { say("Couldn't add it (" + clip((e && e.message) || "", 60) + ")."); });
    }));
    if (/^https?:\/\//.test(f.link || "")) { var l = el("a", "btn small", "Open"); l.href = f.link; l.target = "_blank"; l.rel = "noopener"; a.append(l); }
  }
  async function findTrips() {
    var h = infoOpen("✈️ Trips found in your email"); if (!sample) { noAI(h); return; }
    var st = el("p", "status", "Reading flight and hotel emails from the last 6 months..."); h.append(st);
    try {
      var r = await mcp.callTool("Gmail", "search_threads", { query: "newer_than:180d (flight OR itinerary OR \"e-ticket\" OR \"boarding pass\" OR \"booking confirmation\" OR \"hotel reservation\" OR \"your stay\" OR emirates OR flydubai OR etihad OR \"booking.com\" OR airbnb)", pageSize: 30 }, { cache: false });
      var th = ((r.payload && r.payload.threads) || []).map(slimThread).slice(0, 30);
      if (!th.length) { st.textContent = "No flight or hotel emails found."; return; }
      var j = await aiJson("Today is " + new Date().toDateString() + ". From these emails, list upcoming travel only (today or later): flights, hotels, car hires. For each: id (the e-number), kind (Flight, Hotel, Car, Train or Other), title (e.g. EK 953 Dubai to Beirut, or Hotel Le Gray Beirut), date (YYYY-MM-DD), time (HH:MM local, or empty), from, to, ref (booking reference), trip (short trip name, e.g. Beirut October). Return {\"items\":[...]} with at most 15. Skip marketing.\n\n" + th.map(function (t, i) { return "e" + i + " | from: " + nameOf(t.from) + " | " + t.subject + " | " + t.snippet; }).join("\n"));
      var have = items("travel").map(function (x) { return (x.t + x.d).toLowerCase(); });
      var found = ((j && j.items) || []).filter(function (x) { return x && x.title && isDate(x.date) && x.date >= todayStr() && have.indexOf((x.title + x.date).toLowerCase()) < 0; });
      st.textContent = found.length ? "Tick what to add." : "No new upcoming trips found.";
      var checks = [];
      found.forEach(function (x) { var t = th[+String(x.id || "").replace(/\D/g, "")] || {}; var lab = el("label", "litem"), cb = el("input"), m = el("div", "main"); cb.type = "checkbox"; cb.checked = true; checks.push([cb, x, t]); m.append(el("div", "lt", x.title), el("div", "lm", [x.kind, x.date + (x.time ? " " + x.time : ""), x.ref ? "Ref " + x.ref : "", x.trip].filter(Boolean).join(" · "))); lab.append(m, cb); h.append(lab); });
      if (found.length) { var a = el("div", "acts"); a.append(btn("Add the ticked trips", "btn small solid", function () { var n = 0; checks.forEach(function (c) { if (!c[0].checked) return; var x = c[1]; save({ id: nid(), c: "travel", t: String(x.title).slice(0, 120), d: x.date, f: { kind: ["Flight", "Hotel", "Car", "Train"].indexOf(x.kind) >= 0 ? x.kind : "Other", time: /^\d{2}:\d{2}$/.test(x.time || "") ? x.time : "", from: x.from || "", to: x.to || "", ref: x.ref || "", trip: x.trip || "", link: c[2].url || "" }, u: Date.now() }); n++; }); infoClose(); say(n + " added to Travel."); })); h.append(a); }
    } catch (e) { st.className = "status err"; st.textContent = "Couldn't check your email (" + clip((e && e.message) || "unknown reason", 90) + ")."; }
  }
  function travelSection() {
    var card = window.wyzLifeSection("travel", { intro: "Flights, hotels and cars, with a check-in reminder for each flight.", empty: "No trips yet. Add one, or find them in your email.", extra: travelExtra, filter: function (x) { return !x.d || x.d >= todayStr() || showPast; } });
    var pad2 = card.querySelector(".pad"), acts = pad2.querySelector(".acts");
    acts.append(btn("🔎 Find trips in my email", "btn small", findTrips), btn(showPast ? "Hide past trips" : "Show past trips", "btn small ghost", function () { showPast = !showPast; window.wyzLifeRender(); }));
    var next = items("travel").filter(function (x) { return x.d && x.d >= todayStr(); }).sort(function (a, b) { return a.d < b.d ? -1 : 1; })[0];
    if (next) { var n = Math.round((Date.parse(next.d + "T00:00:00") - Date.parse(todayStr() + "T00:00:00")) / 864e5); pad2.insertBefore(el("p", "status", "Next: " + next.t + (n === 0 ? " today" : n === 1 ? " tomorrow" : " in " + n + " days") + ((next.f || {}).time ? " at " + next.f.time : "") + "."), acts); }
    return card;
  }
  var showPast = false;

  /* ---------- spending ---------- */
  var month = "";   /* YYYY-MM shown */
  var curMonth = function () { return todayStr().slice(0, 7); };
  function monthName(m) { return new Date(m + "-01T00:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" }); }
  function shiftMonth(m, k) { var d = new Date(m + "-01T00:00:00"); d.setMonth(d.getMonth() + k); return d.getFullYear() + "-" + pad(d.getMonth() + 1); }
  async function readBank(m) {
    var h = infoOpen("💸 Spending in " + monthName(m)); if (!sample) { noAI(h); return; }
    var st = el("p", "status", "Reading your bank and card alert emails for " + monthName(m) + "..."); h.append(st);
    try {
      var a = m.replace("-", "/") + "/01", b = shiftMonth(m, 1).replace("-", "/") + "/01";
      var r = await mcp.callTool("Gmail", "search_threads", { query: "after:" + a + " before:" + b + " (debit OR debited OR purchase OR \"card ending\" OR transaction OR spent OR \"has been charged\" OR \"payment of\" OR \"was used\")", pageSize: 80 }, { cache: false });
      var th = ((r.payload && r.payload.threads) || []).map(slimThread).slice(0, 80);
      if (!th.length) { st.textContent = "No bank or card alert emails found for " + monthName(m) + "."; return; }
      var j = await aiJson("From these bank and card alert emails, list each money-out transaction (purchases, card payments, debits). Skip credits, refunds, salary, OTP codes, marketing and transfers between own accounts. For each: id (e-number), date (YYYY-MM-DD), merchant (short), amount (number), currency (3 letters), category (one of " + CATS.join(", ") + "). Return {\"items\":[...]}.\n\n" + th.map(function (t, i) { return "e" + i + " | " + String(t.date || "").slice(0, 16) + " | " + nameOf(t.from) + " | " + t.subject + " | " + t.snippet; }).join("\n"));
      var have = new Set(items("spend").map(function (x) { return x.d + "|" + (+((x.f || {}).amt) || 0).toFixed(2) + "|" + String(x.t).toLowerCase(); }));
      var found = ((j && j.items) || []).filter(function (x) { return x && x.merchant && +x.amount > 0 && isDate(x.date) && !have.has(x.date + "|" + (+x.amount).toFixed(2) + "|" + String(x.merchant).toLowerCase()); });
      var other = found.filter(function (x) { return x.currency && String(x.currency).toUpperCase() !== "AED"; }).length;
      st.textContent = found.length ? found.length + " transactions found. Untick any you don't want." + (other ? " " + other + " are in another currency and are added at their own amount, marked in the notes." : "") : "Nothing new found for " + monthName(m) + ".";
      var checks = [];
      found.forEach(function (x) { var lab = el("label", "litem"), cb = el("input"), mm = el("div", "main"); cb.type = "checkbox"; cb.checked = true; checks.push([cb, x]); mm.append(el("div", "lt", x.merchant + " · " + (x.currency || "AED") + " " + (+x.amount).toLocaleString("en-GB")), el("div", "lm", x.date + " · " + (x.category || "Other"))); lab.append(mm, cb); h.append(lab); });
      if (found.length) { var ac = el("div", "acts"); ac.append(btn("Add the ticked", "btn small solid", function () { var n = 0; checks.forEach(function (c) { if (!c[0].checked) return; var x = c[1], cur = String(x.currency || "AED").toUpperCase(); save({ id: nid(), c: "spend", t: String(x.merchant).slice(0, 80), d: x.date, n: cur !== "AED" ? "Amount in " + cur : "", f: { amt: String(+x.amount), cat: CATS.indexOf(x.category) >= 0 ? x.category : "Other", src: "bank email" }, u: Date.now() }); n++; }); infoClose(); say(n + " added to Spending."); })); h.append(ac); }
    } catch (e) { st.className = "status err"; st.textContent = "Couldn't read your email (" + clip((e && e.message) || "unknown reason", 90) + ")."; }
  }
  function spendSection() {
    if (!month) month = curMonth();
    var inMonth = function (x) { return String(x.d || "").slice(0, 7) === month; };
    var card = window.wyzLifeSection("spend", { intro: "Your spending by month and category. Add it by hand, by voice, by scanning a receipt, or from your bank alert emails.", empty: "Nothing for " + monthName(month) + " yet.", filter: inMonth });
    var p = card.querySelector(".pad"), acts = p.querySelector(".acts");
    acts.append(btn("🏦 Read my bank emails", "btn small", function () { readBank(month); }));
    var nav = el("div", "chips");
    nav.append(btn("‹ " + monthName(shiftMonth(month, -1)).split(" ")[0], "chip", function () { month = shiftMonth(month, -1); window.wyzLifeRender(); }), el("b", "", monthName(month)));
    if (month < curMonth()) nav.append(btn(monthName(shiftMonth(month, 1)).split(" ")[0] + " ›", "chip", function () { month = shiftMonth(month, 1); window.wyzLifeRender(); }));
    p.insertBefore(nav, acts);
    var list = items("spend").filter(inMonth), total = 0, by = {};
    list.forEach(function (x) { var v = +((x.f || {}).amt) || 0; if ((x.n || "").indexOf("Amount in ") === 0) return; total += v; var c = (x.f || {}).cat || "Other"; by[c] = (by[c] || 0) + v; });
    if (list.length) {
      var sum = el("div"); sum.style.cssText = "display:flex;flex-direction:column;gap:6px;margin:4px 0 10px";
      sum.append(el("div", "lt", "Total " + monthName(month) + ": AED " + Math.round(total).toLocaleString("en-GB")));
      var max = Math.max.apply(null, Object.keys(by).map(function (k) { return by[k]; }).concat([1]));
      Object.keys(by).sort(function (a, b) { return by[b] - by[a]; }).forEach(function (k) {
        var r = el("div"); r.style.cssText = "display:grid;grid-template-columns:110px minmax(0,1fr) 90px;gap:8px;align-items:center;font-size:13px"; r.title = k + ": AED " + Math.round(by[k]).toLocaleString("en-GB") + " (" + Math.round(by[k] * 100 / (total || 1)) + "%)";
        var bar = el("div"); bar.style.cssText = "height:10px;border-radius:0 4px 4px 0;background:var(--navy);width:" + Math.max(2, Math.round(by[k] * 100 / max)) + "%";
        var track = el("div"); track.append(bar);
        var v = el("span", "", "AED " + Math.round(by[k]).toLocaleString("en-GB")); v.style.textAlign = "right"; v.style.fontVariantNumeric = "tabular-nums";
        r.append(el("span", "", k), track, v); sum.append(r);
      });
      p.insertBefore(sum, acts.nextSibling);
    }
    return card;
  }

  window.wyzLifeAddTop(captureCard);
  window.wyzLifeAddSection(travelSection);
  window.wyzLifeAddSection(spendSection);
  try { if (!$("p-life").hidden) window.wyzLifeRender(); } catch (e) {}
})();
