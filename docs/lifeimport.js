/* Life fill (3.94): items Claude found in Sam's Gmail and Google Calendar on 19 Oct 2026.
   Nothing is added until you tap the button. Ticked items only. Already-added items are skipped. */
(function () {
  "use strict";
  var FOUND = [
    { c: "family", t: "Mom", d: "2027-05-22", r: "yearly", f: { rel: "Mother" }, n: "From your Google Calendar birthdays." },
    { c: "family", t: "Alaa Bahri", d: "2027-01-27", r: "yearly", f: { rel: "Bahri family (check relation)" }, n: "From your Google Calendar birthdays." },
    { c: "family", t: "Malek Bahri", d: "2027-03-04", r: "yearly", f: { rel: "Bahri family (check relation)" }, n: "From your Google Calendar birthdays." },
    { c: "family", t: "Omar Bahri", d: "2027-07-01", r: "yearly", f: { rel: "Bahri family (check relation)" }, n: "From your Google Calendar birthdays." },
    { c: "family", t: "Razaz Younes", d: "2026-11-05", r: "yearly", f: { rel: "Friend or contact" }, n: "Next birthday in your calendar." },
    { c: "family", t: "Farid Kasm", d: "2026-11-16", r: "yearly", f: { rel: "Friend or contact" }, n: "Next birthday in your calendar." },
    { c: "travel", t: "Flight to Dubai FZ 158 from Beirut", d: "2026-11-10", r: "", f: { kind: "Flight", time: "11:50", from: "Beirut BEY", to: "Dubai" }, n: "Lands 15:00 Dubai time. From your calendar. There is also FZ 160 the same day, keep the one you booked." },
    { c: "travel", t: "Flight to Dubai FZ 160 from Beirut", d: "2026-11-10", r: "", f: { kind: "Flight", time: "23:40", from: "Beirut BEY", to: "Dubai" }, n: "Lands 02:50 on 11 Nov. It appears twice in your calendar, so check for a duplicate." },
    { c: "plans", t: "ADIPEC 2026, Abu Dhabi", d: "2026-11-02", r: "", f: { who: "You" }, n: "2 to 5 November. Your visitor badge is confirmed (email from registration@adipec.com, 17 Oct)." },
    { c: "bills", t: "Squire Patton Boggs past due balance dispute", d: "", r: "", f: {}, n: "Nada Abdelsater (ASAS Law) proposed a call about it with Ghislaine Bruner. From your 16 Oct morning briefing. Confirm the call outcome." },
    { c: "bills", t: "Maître Nada, USD 5,000", d: "", r: "", f: {}, n: "You said this is to be paid. Confirm the invoice and what it covers first." },
    { c: "property", t: "A09 villa lease, 10% security deposit", d: "", r: "", f: {}, n: "Rent AED 3.5M. The deposit is about AED 350,000. Get refund terms, escrow and Ejari in writing before paying." },
    { c: "property", t: "SA17 La Mer villa, buyer inquiry from Huspy", d: "", r: "", f: {}, n: "Emin Isbeceren asked if SA17 at La Mer (AED 135M) is still for sale. Unanswered as of 16 Oct." }
  ];
  var el = function (t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  var nid = function () { return "l" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };
  window.wyzLifeImportCard = function () {
    var box = el("div", "platgrp"); box.append(el("h3", "", "Fill My Life from your email and calendar"));
    box.append(el("p", "sub", "Claude read your Gmail and Google Calendar on 19 Oct 2026. Tick what to add, then tap Add. Cars: nothing about your cars was found in your email, so add them with Scan and file in Life or tell Claude the details."));
    var checks = [];
    FOUND.forEach(function (x, i) {
      var l = el("label", "srcrow"), c = el("input"); c.type = "checkbox"; c.checked = true; checks.push(c);
      var t = el("span", ""); t.style.flex = "1"; t.append(el("b", "", x.t), el("span", "status", " " + x.c + (x.d ? " · " + x.d : "")));
      l.append(c, t); box.append(l);
    });
    var out = el("p", "status", ""), b = el("button", "btn small solid", "Add ticked items to My Life"); b.type = "button";
    b.onclick = function () {
      if (typeof window.wyzLifeSave !== "function" || typeof window.wyzLifeItems !== "function") { out.className = "status err"; out.textContent = "My Life isn't ready yet. Open Life once, then come back."; return; }
      var added = 0, skipped = 0;
      FOUND.forEach(function (x, i) {
        if (!checks[i].checked) return;
        var have = []; try { have = window.wyzLifeItems(x.c) || []; } catch (e) {}
        if (have.some(function (h) { return String(h.t || "").toLowerCase() === x.t.toLowerCase(); })) { skipped++; return; }
        window.wyzLifeSave({ id: nid(), c: x.c, t: x.t, d: x.d, r: x.r, n: x.n, f: x.f || {}, u: Date.now() }); added++;
      });
      out.className = "status"; out.textContent = "Added " + added + (skipped ? ", skipped " + skipped + " already there" : "") + ". Open Life to see them.";
    };
    box.append(b, out); return box;
  };
})();
