/* 3.46 Life admin: bills and renewals, home and car, health and appointments, property and investments,
   deals pipeline and document vault, on the My Life page.
   - "Find due dates in my email" reads recent emails with the AI and suggests items. You tick what to add.
   - Paid moves a repeating bill to its next date. Add to calendar puts a reminder in your Google Calendar (no guests).
   - Document vault searches your Drive and keeps links to the files that matter.
   Uses the record engine in life.js. */
(function () {
  "use strict";
  var C = window.wyzLifeCollections; if (!C || typeof el !== "function") return;
  var btn = function (label, cls, fn) { var b = el("button", cls || "btn small", label); b.type = "button"; if (fn) b.onclick = fn; return b; };
  var say = function (t) { try { toast(t); } catch (e) {} };
  var items = function (c) { return window.wyzLifeItems(c); };
  var save = function (x) { window.wyzLifeSave(x); };
  var nid = function () { return "l" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };
  var link = function (label, href) { if (!/^https?:\/\//i.test(String(href || ""))) return null; var a = el("a", "btn small", label); a.href = href; a.target = "_blank"; a.rel = "noopener"; return a; };

  C.bills = { name: "Bills and renewals", icon: "💳", dateLabel: "Due", allowRepeat: true,
    fields: [["t", "What", "text"], ["d", "Due date", "date"], ["amt", "Amount (AED)", "money"], ["prov", "Company or account", "text"], ["pay", "How to pay (link or note)", "text"], ["n", "Notes", "textarea"]] };
  C.home = { name: "Home and car", icon: "🚗", dateLabel: "Next date", allowRepeat: true,
    fields: [["t", "What", "text"], ["kind", "Type", "select", ["Car service", "Car registration", "Car insurance", "Home maintenance", "Home insurance", "Appliance", "Warranty", "Other"]], ["d", "Next date", "date"], ["prov", "Garage, company or contact", "text"], ["amt", "Cost (AED)", "money"], ["n", "Notes", "textarea"]] };
  C.health = { name: "Health and appointments", icon: "🩺", dateLabel: "Date", allowRepeat: true,
    fields: [["t", "What", "text"], ["kind", "Type", "select", ["Appointment", "Medication", "Test", "Check-up", "Record"]], ["d", "Date", "date"], ["time", "Time", "time"], ["who", "Doctor or clinic", "text"], ["n", "Notes", "textarea"]] };
  C.property = { name: "Property and investments", icon: "🏢", dateLabel: "Key date",
    fields: [["t", "Name", "text"], ["loc", "Where", "select", ["Dubai", "Athens", "Lebanon", "Other"]], ["kind", "Type", "select", ["Apartment", "Villa", "Building", "Land", "Fund", "Shares", "Other"]], ["value", "Value (AED)", "money"], ["rent", "Rent in per month (AED)", "money"], ["d", "Key date (lease end, service charge, sale)", "date"], ["docs", "Documents link", "url"], ["n", "Notes", "textarea"]] };
  C.deals = { name: "Deals pipeline", icon: "🤝", dateLabel: "Next step by",
    fields: [["t", "Deal", "text"], ["co", "For", "select", ["SAMOCO", "WYZ Rent", "Personal", "Other"]], ["stage", "Stage", "select", ["Idea", "Talking", "Proposal sent", "Negotiating", "Signed", "Won", "Lost", "On hold"]], ["next", "Next step", "text"], ["d", "Next step by", "date"], ["who", "Counterparty", "text"], ["value", "Value", "money"], ["link", "Main document link", "url"], ["n", "Notes", "textarea"]] };
  C.docs = { name: "Document vault", icon: "📁", dateLabel: "Date or expiry",
    fields: [["t", "Document", "text"], ["kind", "Type", "select", ["Contract", "Proposal", "Agreement", "Letter", "ID or passport", "Title deed", "Invoice", "Other"]], ["area", "Deal or area", "text"], ["d", "Date or expiry", "date"], ["link", "Link (Drive or web)", "url"], ["n", "Notes", "textarea"]] };

  /* ---------- actions on each item ---------- */
  function addToCalendar(x) {
    if (!x.d) { say("Add a date first."); return; }
    var t = (x.f && x.f.time) || "09:00", end = (function () { var p = t.split(":"); var m = (+p[0]) * 60 + (+p[1] || 0) + 30; return String(Math.floor(m / 60) % 24).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); })();
    var d = window.wyzLifeNext(x) || x.d;
    mcp.callTool("Google Calendar", "create_event", { title: (C[x.c] ? C[x.c].icon + " " : "") + x.t, start: d + "T" + t, end: d + "T" + end, description: "From My Life on your Execution Page." + (x.n ? "\n" + x.n : "") }, { cache: false })
      .then(function () { say("Added to your calendar on " + d + " at " + t + "."); })
      .catch(function (e) { say("Couldn't add it to the calendar (" + clip((e && e.message) || "unknown reason", 70) + ")."); });
  }
  function paid(x) {
    var y = Object.assign({}, x, { f: Object.assign({}, x.f || {}) }); y.f.lastPaid = new Date().toISOString().slice(0, 10);
    var rep = x.r || "";
    if (rep) {
      var nd = window.wyzLifeNext(x);
      /* move past the date just paid */
      var step = rep === "monthly" ? 1 : rep === "quarterly" ? 3 : 12, b = new Date((nd || x.d) + "T00:00:00"), day = b.getDate();
      var n2 = new Date(b.getFullYear(), b.getMonth() + step, 1); n2.setDate(Math.min(day, new Date(n2.getFullYear(), n2.getMonth() + 1, 0).getDate()));
      y.d = n2.getFullYear() + "-" + String(n2.getMonth() + 1).padStart(2, "0") + "-" + String(n2.getDate()).padStart(2, "0");
      save(y); say("Marked as paid. Next due " + y.d + ".");
    } else { y.done = 1; save(y); say("Marked as paid."); }
  }
  var calBtn = function (x) { return btn("📅", "btn small", function () { addToCalendar(x); }); };
  function billsExtra(x, a) {
    if (!x.done) a.append(btn("✓ Paid", "btn small solid", function () { paid(x); }));
    var p = link("Pay", x.f && x.f.pay); if (p) a.append(p);
    a.append(calBtn(x));
  }
  function homeExtra(x, a) { if (!x.done) a.append(btn("✓ Done", "btn small", function () { if (x.r) paid(x); else { var y = Object.assign({}, x, { done: 1 }); save(y); } })); a.append(calBtn(x)); }
  function healthExtra(x, a) { a.append(calBtn(x)); if (!x.done && (x.f || {}).kind !== "Medication") a.append(btn("✓ Done", "btn small", function () { if (x.r) paid(x); else save(Object.assign({}, x, { done: 1 })); })); }
  function propExtra(x, a) { var l = link("Documents", x.f && x.f.docs); if (l) a.append(l); }
  function dealExtra(x, a) {
    var st = (x.f || {}).stage || "Idea"; a.prepend(el("span", "due", st));
    var l = link("Document", x.f && x.f.link); if (l) a.append(l);
  }
  function docExtra(x, a) { var l = link("Open", x.f && x.f.link); if (l) a.append(l); }

  /* ---------- deals: filter by company and stage ---------- */
  var dealFlt = "";
  function dealsSection() {
    var card = window.wyzLifeSection("deals", { intro: "Every deal in one place: stage, next step and the date it's due.", empty: dealFlt ? "No deals for " + dealFlt + "." : "Add a deal: SAMOCO, WYZ Rent or personal.", extra: dealExtra, filter: function (x) { return !dealFlt || (x.f || {}).co === dealFlt; } });
    var chips = el("div", "chips"), all = items("deals").filter(function (x) { return ["Won", "Lost"].indexOf((x.f || {}).stage) < 0; });
    ["", "SAMOCO", "WYZ Rent", "Personal", "Other"].forEach(function (k) {
      var n = k ? all.filter(function (x) { return (x.f || {}).co === k; }).length : all.length; if (k && !n) return;
      var b = el("button", "chip"); b.type = "button"; b.append(el("span", "", k || "All open"), el("b", "", String(n))); b.setAttribute("aria-pressed", String(dealFlt === k));
      b.onclick = function () { dealFlt = k; window.wyzLifeRender(); }; chips.append(b);
    });
    var pad = card.querySelector(".pad"); pad.insertBefore(chips, pad.children[2] || null);
    return card;
  }

  /* ---------- document vault: search Drive and keep the ones that matter ---------- */
  function docsSection() {
    var card = window.wyzLifeSection("docs", { intro: "Contracts, proposals, IDs and deeds, with a link to each file. Search your Drive to add them.", empty: "Nothing in the vault yet.", extra: docExtra });
    var pad = card.querySelector(".pad"), box = el("div", "ask"), q = el("input", "in"), go = btn("Search Drive", "btn small", null), out = el("div");
    q.placeholder = "Find a file in your Drive, e.g. SAMOCO agreement"; q.setAttribute("aria-label", "Search your Drive");
    go.onclick = async function () {
      var term = q.value.trim(); if (!term) { q.focus(); return; }
      go.disabled = true; out.replaceChildren(el("p", "status", "Searching your Drive..."));
      try {
        var r = await mcp.callTool("Google Drive", "search_files", { query: term, pageSize: 10 }, { cache: false });
        var files = (r.payload && r.payload.files) || []; out.replaceChildren();
        if (!files.length) out.append(el("p", "status", "Nothing found for \"" + term + "\"."));
        files.forEach(function (f) {
          var row = el("div", "litem"), m = el("div", "main"), a = el("div", "la");
          m.append(el("div", "lt", f.title), el("div", "lm", f.modifiedTime ? "Changed " + new Date(f.modifiedTime).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : ""));
          var href = "https://drive.google.com/open?id=" + encodeURIComponent(f.id);
          var o = link("Open", href); if (o) a.append(o);
          a.append(btn("＋ Add to vault", "btn small solid", function () {
            var kind = /contract/i.test(f.title) ? "Contract" : /proposal/i.test(f.title) ? "Proposal" : /agreement|mou/i.test(f.title) ? "Agreement" : /invoice/i.test(f.title) ? "Invoice" : "Other";
            save({ id: nid(), c: "docs", t: f.title, d: "", f: { kind: kind, link: href, area: term, mod: String(f.modifiedTime || "").slice(0, 10) }, u: Date.now() }); say("Added to the vault.");
          }));
          row.append(m, a); out.append(row);
        });
      } catch (e) { out.replaceChildren(el("p", "status err", "Couldn't search your Drive (" + clip((e && e.message) || "unknown reason", 80) + ").")); }
      go.disabled = false;
    };
    q.addEventListener("keydown", function (e) { if (e.key === "Enter") go.click(); });
    box.append(q, go); pad.insertBefore(box, pad.children[3] || null); pad.insertBefore(out, box.nextSibling);
    return card;
  }

  /* ---------- find due dates in my email ---------- */
  var Q = "newer_than:120d (renewal OR renew OR expiry OR expires OR \"due date\" OR \"payment due\" OR invoice OR bill OR DEWA OR du OR etisalat OR \"Emirates ID\" OR visa OR registration OR insurance OR policy OR appointment OR booking OR \"service due\" OR \"lease\" OR \"service charge\")";
  async function findInEmail(b) {
    var h = infoOpen("🔎 Due dates found in your email");
    if (!sample) { h.append(el("p", "status", "This needs the AI. Connect Claude or ChatGPT under Settings first.")); return; }
    var st = el("p", "status", "Reading your last 4 months of email for bills, renewals and appointments..."); h.append(st);
    try {
      var r = await mcp.callTool("Gmail", "search_threads", { query: Q, pageSize: 40 }, { cache: false });
      var th = ((r.payload && r.payload.threads) || []).map(slimThread).filter(function (t) { return !t.lastFromMe; }).slice(0, 40);
      if (!th.length) { st.textContent = "No bills, renewals or appointments found in the last 4 months."; return; }
      var list = th.map(function (t, i) { return "e" + i + " | from: " + nameOf(t.from) + " | subject: " + t.subject + " | " + t.snippet + " | date: " + String(t.date || "").slice(0, 16); }).join("\n");
      var have = items().map(function (x) { return x.t.toLowerCase(); });
      var res = await creditFallback(function (prov) { return sample.json("Today is " + new Date().toDateString() + ". From these emails, find real upcoming or recurring items for a personal life organiser: bills and renewals (utilities, phone, insurance, subscriptions, service charges, Emirates ID, visa, licences), home and car (service, registration, insurance, warranty) and health (appointments, tests). Skip newsletters, marketing and anything already past with no repeat. Give each: id (the e-number), collection (bills, home or health), title (short, plain), date (YYYY-MM-DD, the due or appointment date, best guess from the email), amount (number in AED or empty), provider, repeat (empty, monthly, quarterly or yearly). Return {\"items\":[...]} with at most 15.\n\nEmails:\n" + list, { cache: false, provider: prov }); });
      var found = ((res && res.items) || []).filter(function (x) { return x && x.title && C[x.collection] && have.indexOf(String(x.title).toLowerCase()) < 0; });
      st.textContent = found.length ? "Tick what to add. You can edit each one after." : "Nothing new found. Everything is already in My Life, or nothing had a date.";
      var checks = [];
      found.forEach(function (x) {
        var t = th[+String(x.id || "").replace(/\D/g, "")] || {};
        var lab = el("label", "litem"); lab.style.cursor = "pointer";
        var cb = el("input"); cb.type = "checkbox"; cb.checked = true; checks.push([cb, x, t]);
        var m = el("div", "main"); m.append(el("div", "lt", C[x.collection].icon + " " + x.title), el("div", "lm", [x.date ? "Date " + x.date : "No date", x.amount ? "AED " + x.amount : "", x.provider || "", x.repeat ? "repeats " + x.repeat : "", t.subject ? "Email: " + clip(t.subject, 60) : ""].filter(Boolean).join(" · ")));
        lab.append(m, cb); h.append(lab);
      });
      if (found.length) {
        var a = el("div", "acts");
        a.append(btn("Add the ticked items", "btn small solid", function () {
          var n = 0;
          checks.forEach(function (c) {
            if (!c[0].checked) return; var x = c[1], t = c[2];
            var f = { prov: x.provider || "" }; if (x.amount) f.amt = String(x.amount).replace(/[^\d.]/g, "");
            if (x.collection === "home") f.kind = "Other"; if (x.collection === "health") { f.kind = "Appointment"; f.who = x.provider || ""; }
            save({ id: nid(), c: x.collection, t: String(x.title).slice(0, 120), d: /^\d{4}-\d{2}-\d{2}$/.test(x.date || "") ? x.date : "", r: ["monthly", "quarterly", "yearly"].indexOf(x.repeat) >= 0 ? x.repeat : "", n: t.url ? "From the email: " + t.url : "", f: f, u: Date.now() }); n++;
          });
          infoClose(); say(n + " item" + (n === 1 ? "" : "s") + " added to My Life.");
        }));
        h.append(a);
      }
    } catch (e) { st.className = "status err"; st.textContent = "Couldn't check your email (" + clip((e && e.message) || "unknown reason", 90) + ")."; }
  }

  /* ---------- sections on the page, in order ---------- */
  window.wyzLifeAddSection(function () {
    var c = el("div", "card note"), p = el("div", "pad"); c.append(p);
    p.append(el("h2", "", "🔎 Let the AI fill it in"), el("p", "status", "Reads your last 4 months of email for bills, renewals, car and home dates and appointments, and suggests them. Nothing is added until you tick it."));
    var a = el("div", "acts"); a.append(btn("Find due dates in my email", "btn small solid", function (e) { findInEmail(e.target); })); p.append(a);
    return c;
  });
  window.wyzLifeAddSection(function () { return window.wyzLifeSection("bills", { intro: "Utilities, phone, insurance, subscriptions, Emirates ID, visa, service charges. Paid moves a repeating bill to its next date.", empty: "No bills yet. Add one, or let the AI find them in your email.", extra: billsExtra }); });
  window.wyzLifeAddSection(function () { return window.wyzLifeSection("home", { intro: "Car service, registration and insurance, home maintenance and warranties.", empty: "Nothing yet.", extra: homeExtra }); });
  window.wyzLifeAddSection(function () { return window.wyzLifeSection("health", { intro: "Appointments, medication, tests and records. Kept in your own Drive file, not on any server.", empty: "Nothing yet.", extra: healthExtra }); });
  window.wyzLifeAddSection(function () {
    var card = window.wyzLifeSection("property", { intro: "Dubai, Athens and Lebanon in one list: value, rent and key dates.", empty: "Add a property or investment.", extra: propExtra });
    var ps = items("property"), val = ps.reduce(function (s, x) { return s + (+((x.f || {}).value) || 0); }, 0), rent = ps.reduce(function (s, x) { return s + (+((x.f || {}).rent) || 0); }, 0);
    if (ps.length) { var pad = card.querySelector(".pad"); pad.insertBefore(el("p", "status", "Total value AED " + Math.round(val).toLocaleString("en-GB") + " · rent in AED " + Math.round(rent).toLocaleString("en-GB") + " a month"), pad.children[2] || null); }
    return card;
  });
  window.wyzLifeAddSection(dealsSection);
  window.wyzLifeAddSection(docsSection);
  try { if (!$("p-life").hidden) window.wyzLifeRender(); } catch (e) {}
})();
