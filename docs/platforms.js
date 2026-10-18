/* Platforms (3.86): one page with every platform WYZ Rent runs on, grouped, searchable, with pinning.
   Platforms is the first tab. Open it from there or at #/platforms. Gmail, Calendar and Drive jump to the sections already on Today.
   Your own links from Settings appear at the bottom. Pins and the last search are saved on this device only. */
(function () {
  "use strict";
  if (typeof $ !== "function" || typeof el !== "function" || typeof show !== "function" || typeof tabs === "undefined") return;
  var PIN = "wyz-plat-pin";
  var G_ = [
    ["Run the day", [
      ["WYZ Dashboard", "https://dashboard.wyzrent.com", "Live command center"],
      ["Operations dashboard", "https://claude.ai/code/artifact/f3dce086-f0b0-4bbd-83ea-7cee86b23c7f", "Occupancy, revenue, queues (Claude)"],
      ["Todoist", "https://app.todoist.com/app/today", "Tasks"],
      ["Gmail", "https://mail.google.com", "@inbox"],
      ["Google Calendar", "https://calendar.google.com", "@cal"],
      ["Google Drive", "https://drive.google.com", "@docs"]
    ]],
    ["Operations", [
      ["Hostaway", "https://dashboard.hostaway.com", "Reservations, calendar, inbox"],
      ["Revenue Hub", "https://id-preview--bcb09d21-8c59-455c-819b-237cae292506.lovable.app", "Cleaning, maintenance, guest issues"],
      ["WhatsApp Business", "https://web.whatsapp.com", "Guest and team chats"],
      ["Airbnb host", "https://www.airbnb.com/hosting", "Listings and messages"],
      ["Booking.com extranet", "https://admin.booking.com", "Property admin"]
    ]],
    ["Revenue and pricing", [
      ["PriceLabs", "https://app.pricelabs.co", "Dynamic pricing"],
      ["WYZ Rent website", "https://wyzrent.com", "Public site and direct bookings"]
    ]],
    ["Finance", [
      ["Wafeq", "https://app.wafeq.com", "Accounting, invoices, VAT"],
      ["Zapier", "https://zapier.com/app/zaps", "Hostaway to Wafeq automations"]
    ]],
    ["Marketing", [
      ["Instagram", "https://www.instagram.com", "Posts and messages"],
      ["YouTube Studio", "https://studio.youtube.com", "Channel and shorts"],
      ["Canva", "https://www.canva.com", "Designs"],
      ["LinkedIn", "https://www.linkedin.com", "Company and network"]
    ]],
    ["Build and admin", [
      ["Lovable projects", "https://lovable.dev/dashboard", "All your apps"],
      ["Command Center build", "https://lovable.dev/projects/1cc94a7d-8c35-4257-be82-df4aaf0d6def", "Lovable editor"],
      ["Revenue Hub build", "https://lovable.dev/projects/bcb09d21-8c59-455c-819b-237cae292506", "Lovable editor"],
      ["Supabase", "https://supabase.com/dashboard", "Databases"],
      ["Vercel", "https://vercel.com/dashboard", "This page and its server"],
      ["GitHub repo", "https://github.com/habahri-svg/Bahri-Repo", "Code and versions"],
      ["Google Cloud", "https://console.cloud.google.com/apis/credentials", "Sign-in and API settings"]
    ]],
    ["AI helpers", [
      ["Claude", "https://claude.ai/new", "Ask, build, fix"],
      ["ChatGPT", "https://chatgpt.com", "Second AI"]
    ]]
  ];
  var pins = []; try { pins = JSON.parse(localStorage.getItem(PIN) || "[]"); } catch (e) {}
  function savePins() { try { localStorage.setItem(PIN, JSON.stringify(pins)); } catch (e) {} }
  var REC = "wyz-plat-rec", rec = []; try { rec = JSON.parse(localStorage.getItem(REC) || "[]"); } catch (e) {}
  function noteUse(n) { rec = [n].concat(rec.filter(function (x) { return x !== n; })).slice(0, 6); try { localStorage.setItem(REC, JSON.stringify(rec)); } catch (e) {} }
  var q = "";

  function card(n, u, d) {
    var here = d && d.charAt(0) === "@" ? d.slice(1) : null;
    var wrap = el("div", "platcard");
    var main;
    if (here) { main = el("button", "platmain"); main.type = "button"; main.onclick = function () { noteUse(n); show("t-today"); if (typeof goSec === "function") goSec(here); }; }
    else { main = el("a", "platmain"); main.href = u; main.target = "_blank"; main.rel = "noopener"; main.addEventListener("click", function () { noteUse(n); }); }
    main.append(el("b", "", n + (here ? "" : " ↗")), el("span", "", here ? "On the Today page" : d));
    var on = pins.indexOf(n) >= 0;
    var star = el("button", "platstar", on ? "★" : "☆"); star.type = "button";
    star.setAttribute("aria-label", (on ? "Unpin " : "Pin ") + n); star.title = on ? "Unpin" : "Pin to the top";
    star.onclick = function () { var i = pins.indexOf(n); if (i >= 0) pins.splice(i, 1); else pins.push(n); savePins(); render(); };
    var stt = statusOf(n); if (stt) { var dot = el("span", "platdot " + stt[0], stt[1]); main.append(dot); }
    wrap.append(main, star); return wrap;
  }
  /* Switches: one place to turn alerts and briefs on or off, and to pause everything. Each feature also keeps its own switch where it lives. */
  function switchesCard() {
    var box = el("div", "platgrp"); box.append(el("h3", "", "Alerts and briefs"));
    var msg = el("p", "sub", "Both start off. Nothing is sent until you switch it on, and you can switch it off here at any time.");
    var l1 = el("label", "srcrow"), c1 = el("input"); c1.type = "checkbox"; c1.id = "swAlerts";
    var t1 = el("span", ""); t1.style.flex = "1"; t1.append(el("b", "", "Critical email alerts"), el("span", "status", " On this device. Free."));
    l1.append(c1, t1);
    c1.onchange = function () { var a = $("alertsOn"); if (!a) return; a.checked = c1.checked; if (a.onchange) a.onchange(); setTimeout(function () { c1.checked = !!(typeof state !== "undefined" && state.alertsOn); }, 400); };
    var acts = el("div", "acts");
    var b1 = el("button", "btn small", "Phone brief 8am and 6pm: set up or turn off"); b1.type = "button";
    b1.onclick = function () { var s = document.querySelector('#modeSw button[data-mode="life"]'); if (s) s.click(); setTimeout(function () { var c = $("life-notify"); if (c) c.scrollIntoView({ behavior: "smooth", block: "center" }); }, 500); };
    var b2 = el("button", "btn small ghost", "Pause everything"); b2.type = "button";
    b2.onclick = function () {
      c1.checked = false; c1.onchange();
      var n = $("life-notify"); if (n) Array.prototype.forEach.call(n.querySelectorAll("button"), function (b) { if (/turn off here/i.test(b.textContent)) b.click(); });
      msg.textContent = "Paused on this device: alerts are off and the phone brief is unsubscribed. WhatsApp alerts and Wafeq or PriceLabs are not connected, so nothing of theirs is running.";
    };
    acts.append(b1, b2);
    var note = el("p", "status", "WhatsApp alerts to your phone and live Wafeq and PriceLabs data are not built yet. They need Meta and provider keys and they can cost per message, so they stay off until you give the keys and say go.");
    box.append(msg, l1, acts, note);
    var sync = function () { c1.checked = !!(typeof state !== "undefined" && state.alertsOn); };
    sync(); window.addEventListener("hashchange", sync);
    return box;
  }
  function statusOf(n) {
    if (n === "Hostaway") { var h = window.wyzHA; if (!h || !h.viewer) return null; return h.ready ? ["ok", "Connected"] : ["bad", "Check the key"]; }
    if (n === "Wafeq" || n === "PriceLabs") return ["off", "Not connected yet"];
    return null;
  }
  window.addEventListener("wyz-ha", function () { try { render(); } catch (e) {} });
  function section(title, items, root) {
    if (!items.length) return;
    var s = el("div", "platgrp"); s.append(el("h3", "", title));
    var g = el("div", "platgrid"); items.forEach(function (i) { g.append(card(i[0], i[1], i[2])); });
    s.append(g); root.append(s);
  }
  function render() {
    var root = $("platRoot"); if (!root) return; root.replaceChildren();
    var all = []; G_.forEach(function (g) { g[1].forEach(function (i) { all.push(i); }); });
    var mine = []; try { mine = ((typeof state !== "undefined" && state.links) || []).map(function (l) { return [l.n, l.u, "Your own link"]; }); } catch (e) {}
    var ql = q.trim().toLowerCase();
    var test = function (i) { return !ql || (i[0] + " " + i[2]).toLowerCase().indexOf(ql) >= 0; };
    if (!ql) section("Recently used", rec.map(function (n) { return all.concat(mine).filter(function (i) { return i[0] === n; })[0]; }).filter(Boolean), root);
    if (!ql) section("Pinned", all.concat(mine).filter(function (i) { return pins.indexOf(i[0]) >= 0; }), root);
    G_.forEach(function (g) { section(g[0], g[1].filter(test), root); });
    section("Your own links", mine.filter(test), root);
    if (!root.children.length) root.append(el("p", "sub", "Nothing matches. Add your own link in Settings."));
  }
  function build() {
    if ($("p-plat") || !document.querySelector(".tabs")) return;
    var tab = el("button", "tab", "Platforms"); tab.id = "t-plat"; tab.type = "button"; tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", "false"); tab.setAttribute("aria-controls", "p-plat");
    var first = $("t-today"); first.parentNode.insertBefore(tab, first);
    var p = el("section", "wrap"); p.id = "p-plat"; p.hidden = true; p.style.gap = "16px"; p.setAttribute("role", "tabpanel"); p.setAttribute("aria-labelledby", "t-plat");
    var c = el("div", "card"), pad = el("div", "pad");
    pad.append(el("h2", "", "All your platforms"), el("p", "sub", "Pick one to open it. Star the ones you use most and they move to the top."));
    var s = el("input", "in"); s.type = "search"; s.id = "platSearch"; s.placeholder = "Search platforms"; s.setAttribute("aria-label", "Search platforms");
    s.oninput = function () { q = s.value; render(); };
    pad.append(s, el("div", "")); pad.append(switchesCard()); if (window.wyzLifeImportCard) pad.append(window.wyzLifeImportCard()); var root = el("div"); root.id = "platRoot"; pad.append(root); c.append(pad); p.append(c);
    $("p-conn").parentNode.insertBefore(p, $("p-conn"));
    tab.onclick = function () { show("t-plat"); };
    tabs.push(["t-plat", "p-plat"]);
    var st = el("style"); st.textContent =
      ".platdot{font-size:12px;margin-top:4px;color:var(--soft)}.platdot.ok{color:#1d8348}.platdot.bad{color:#c0392b}.platgrp{margin-top:14px}.platgrp h3{margin:0 0 8px}.platgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}" +
      ".platcard{position:relative;display:flex}.platmain{flex:1;display:flex;flex-direction:column;gap:2px;text-align:left;text-decoration:none;color:var(--fg);background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 38px 12px 14px;font:inherit;cursor:pointer;min-height:58px}" +
      ".platmain:hover,.platmain:focus-visible{border-color:var(--navy);background:var(--sky)}.platmain span{color:var(--soft);font-size:13px}" +
      ".platstar{position:absolute;top:6px;right:6px;border:0;background:none;font-size:20px;line-height:1;cursor:pointer;color:var(--gold);padding:4px 6px}" +
      "body[data-page=platforms] .herodate,body[data-page=platforms] .herosum,body[data-page=platforms] .herostats,body[data-page=platforms] .herorefresh,body[data-page=platforms] #hello{display:none!important}body[data-page=platforms] #pageHead{display:flex}";
    document.head.append(st);
    render();
  }
  build();
})();
