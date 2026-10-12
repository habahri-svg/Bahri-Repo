/* 3.44 Execution Cockpit.
   - Execution Cockpit: the 10 actions that matter most, with live counts, at the top of Daily Work.
   - All actions: 30 one-tap buttons in three groups (Daily Work, WYZ Rent Operations, Setup & Admin).
   - Status strip: Connected, Setup needed or Error for each source, each one explains itself in one tap.
   - WYZ Rent issue types and team assignment (owner, deadline, status, next action, source).
   Nothing here sends an email by itself. Every send still goes through Send, then Confirm, with Undo. */
(function () {
  "use strict";
  if (typeof $ !== "function" || typeof el !== "function") return;
  var CFG = window.WYZ_CONFIG || {};
  var B = function () { return window.wyzBiz || { hostaway: { state: "unknown" }, wa: { state: "unknown" }, pulse: { state: "unknown" } }; };
  var OWNER = String(CFG.OWNER_EMAIL || "habahri@gmail.com").toLowerCase();
  var isOwner = function () { try { return String(email || "").toLowerCase() === OWNER || !!window.WYZ_DEMO; } catch (e) { return false; } };
  var signedIn = function () { try { return G.connected(); } catch (e) { return false; } };
  var btn = function (label, cls, fn) { var b = el("button", cls || "btn small", label); b.type = "button"; if (fn) b.onclick = fn; return b; };
  var linkBtn = function (label, href, cls) { var a = el("a", "btn small" + (cls ? " " + cls : ""), label); a.href = href; a.target = "_blank"; a.rel = "noopener"; return a; };
  var say = function (t) { try { toast(t); } catch (e) {} };
  var scrollTo = function (node) { if (!node) return; var y = node.getBoundingClientRect().top + window.scrollY - 70; window.scrollTo({ top: Math.max(0, y), behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); };
  var page = function (tid) { try { show(tid); } catch (e) {} };
  var needSignIn = function () { if (signedIn()) return false; try { page("t-today"); showWelcome(); } catch (e) {} say("Sign in first with Continue with Google."); return true; };

  /* ---------- people ---------- */
  var BASE = [["Louloua", "louloua@wyzrent.com"], ["Karim", "karimhbahri@gmail.com"], ["Abbas", ""], ["Sheena", ""], ["Kelvin", ""], ["Marz", "marz@wyzrent.com"], ["Mehyar", ""], ["Houssam", "habahri@gmail.com"]];
  function people() {
    var team = Array.isArray(state.team) ? state.team : [];
    return BASE.map(function (p) {
      var hit = team.find(function (x) { return x && String(x.name || "").toLowerCase().split(" ")[0] === p[0].toLowerCase(); });
      return { name: p[0], email: (hit && hit.email) || p[1] };
    });
  }
  var personEmail = function (n) { var p = people().find(function (x) { return x.name === n; }); return p ? p.email : ""; };
  function savePerson(name, mail) {
    var team = Array.isArray(state.team) ? state.team.slice() : (typeof DEFAULT_TEAM !== "undefined" ? DEFAULT_TEAM.slice() : []);
    team = team.filter(function (x) { return String(x.name || "").toLowerCase().split(" ")[0] !== name.toLowerCase(); });
    team.push({ name: name, email: mail }); state.team = team; persist(); try { renderTeam(); } catch (e) {}
  }
  var teamAddrs = function () { var s = new Set(); people().forEach(function (p) { if (p.email) s.add(p.email.toLowerCase()); }); (Array.isArray(state.team) ? state.team : []).forEach(function (p) { if (p && p.email) s.add(String(p.email).toLowerCase()); }); return s; };
  var isTeam = function (addr) { addr = String(addr || "").toLowerCase(); return !!addr && (teamAddrs().has(addr) || /@wyzrent\.com$/.test(addr)) && addr !== String(email || "").toLowerCase(); };

  /* ---------- WYZ Rent issue types ---------- */
  var CATS = [
    ["acq", "Owner acquisition", /\b(new owner|owner lead|lead|management offer|management proposal|proposal|income estimate|onboard(ing)?|referral|broker|interested in (our|your) (service|management)|list (my|his|her) (unit|apartment|villa))\b/i],
    ["clean", "Cleaning", /\b(clean(ing|er|ers)?|housekeeping|linen|laundry|turnover|towels?)\b/i],
    ["maint", "Maintenance", /\b(maintenance|repair|broken|leak(ing)?|a\/?c|air ?con|plumb(er|ing)|electric(ian|al)?|fix(ed)?|not working|technician|handyman)\b/i],
    ["guest", "Guest issue", /\b(guests?|booking|reservation|check[- ]?in|check[- ]?out|airbnb|booking\.com|stay|complain(t|ed)?|review|refund request)\b/i],
    ["owner", "Owner issue", /\b(owners?|landlord|owner statement|payouts?|owner report)\b/i],
    ["pricing", "Pricing", /\b(pric(e|es|ing)|rates?|pricelabs|adr|discount|occupancy|minimum stay)\b/i],
    ["acct", "Accounting / Wafeq", /\b(invoice|wafeq|vat|receipt|accounting|accounts|payment|transfer|bank|reconcil\w*|expense)\b/i],
    ["ceo", "CEO review", /\b(approv(e|al)|sign(ature|ed)?|contract|legal|decision|agreement|board|urgent)\b/i]
  ];
  var CAT_NAME = {}; CATS.forEach(function (c) { CAT_NAME[c[0]] = c[1]; });
  function textOf(kind, x) {
    if (kind === "task") return String(x.t || "") + " " + String(x.src || "");
    var t = (typeof tById === "function" && tById(x.id)) || {};
    return [x.title, x.summary, t.subject, t.snippet, t.from].join(" ");
  }
  function catOf(kind, x) {
    var k = (kind === "task" ? "task:" : "") + x.id, man = state.cat && state.cat[k];
    if (man) return man === "none" ? "" : man;
    var h = textOf(kind, x);
    for (var i = 0; i < CATS.length; i++) if (CATS[i][2].test(h)) return CATS[i][0];
    return "";
  }
  window.wyzCatOf = function (i) { return catOf("mail", i); };
  window.wyzCatFlt = null;
  window.wyzFilterNote = function (host) {
    if (!window.wyzCatFlt) return;
    var n = el("div", "fltnote"); n.append(el("span", "", "Showing " + (CAT_NAME[window.wyzCatFlt] || "") + " only."));
    n.append(btn("Show all", "btn small", function () { window.wyzCatFlt = null; renderBoard(); }));
    host.append(n);
  };

  /* ---------- assignments: owner, deadline, status, next action, source ---------- */
  var STATUSES = ["Not started", "In progress", "Waiting", "Done"];
  var akey = function (kind, x) { return (kind === "task" ? "task:" : "mail:") + x.id; };
  var asg = function () { return (state.assign = state.assign || {}); };
  var niceD = function (d) { try { return niceDay(d); } catch (e) { return d; } };
  function srcLink(a) {
    if (a.kind === "mail") { var t = (typeof tById === "function" && tById(a.id)) || {}; return t.url || a.url || ""; }
    return "";
  }
  window.wyzRowExtras = function (kind, x, m, acts) {
    var a = asg()[akey(kind, x)];
    if (a && a.who) {
      var late = a.due && a.status !== "Done" && a.due < todayKey();
      m.append(el("span", "asgline" + (late ? " late" : ""), "👤 " + a.who + (a.due ? " · due " + niceD(a.due) + (late ? " (late)" : "") : "") + " · " + (a.status || "Not started") + (a.next ? " · Next: " + a.next : "")));
    }
    var c = catOf(kind, x); if (c) m.append(el("span", "status", "Type: " + CAT_NAME[c]));
    acts.append(btn(a && a.who ? "👤 " + a.who : "👤 Assign", "btn small", function () { openAssign(kind, x); }));
  };
  function openAssign(kind, x, preset) {
    var key = akey(kind, x), cur = Object.assign({ who: "", due: "", status: "Not started", next: "" }, asg()[key] || {}, preset || {});
    var title = kind === "task" ? x.t : (x.title || ((tById(x.id) || {}).subject) || "Email");
    var h = infoOpen("👤 Assign: " + clip(title, 60));
    var who = el("select", "in"); who.setAttribute("aria-label", "Owner"); who.append(new Option("Choose who owns it", ""));
    people().forEach(function (p) { who.append(new Option(p.name, p.name)); }); who.value = cur.who;
    var due = el("input", "in"); due.type = "date"; due.value = cur.due; due.setAttribute("aria-label", "Deadline");
    var st = el("select", "in"); st.setAttribute("aria-label", "Status"); STATUSES.forEach(function (s) { st.append(new Option(s, s)); }); st.value = cur.status;
    var nx = el("input", "in"); nx.placeholder = "Next action, e.g. call the owner and confirm the date"; nx.value = cur.next; nx.setAttribute("aria-label", "Next action");
    var cat = el("select", "in"); cat.setAttribute("aria-label", "Type"); cat.append(new Option("Type: found automatically", ""));
    CATS.forEach(function (c) { cat.append(new Option(c[1], c[0])); }); cat.append(new Option("No type", "none"));
    var ck = (kind === "task" ? "task:" : "") + x.id; cat.value = (state.cat && state.cat[ck]) || "";
    var lab = function (t, n) { var w = el("label", "status"); w.style.cssText = "display:flex;flex-direction:column;gap:4px"; w.append(el("span", "", t), n); return w; };
    h.append(lab("Owner", who), lab("Deadline", due), lab("Status", st), lab("Next action", nx), lab("Type", cat));
    var src = srcLink({ kind: kind === "task" ? "task" : "mail", id: x.id });
    h.append(el("p", "status", "Source: " + (kind === "task" ? "your task list" : "this email") + "."));
    var msg = el("p", "status", "");
    var save = function () {
      if (cat.value) { state.cat = state.cat || {}; state.cat[ck] = cat.value; } else if (state.cat) delete state.cat[ck];
      if (!who.value) { delete asg()[key]; persist(); return null; }
      var rec = { kind: kind === "task" ? "task" : "mail", id: x.id, title: title, who: who.value, due: due.value, status: st.value, next: nx.value.trim(), url: src, at: Date.now() };
      asg()[key] = rec; if (rec.status === "Done" && kind === "task") { x.done = 1; }
      persist(); return rec;
    };
    var after = function () { try { renderBoard(); renderTasks(); } catch (e) {} renderOps(); draw(); };
    var a = el("div", "acts");
    a.append(btn("Save", "btn small solid", function () { save(); after(); infoClose(); say(who.value ? "Assigned to " + who.value + "." : "Saved."); }));
    a.append(btn("Save and email them", "btn small", function () {
      var rec = save(); after(); if (!rec) { msg.className = "status err"; msg.textContent = "Choose who owns it first."; return; }
      var to = personEmail(rec.who);
      if (!to) { askEmail(rec.who, function () { mailAssign(rec); }); return; }
      mailAssign(rec);
    }));
    if (asg()[key]) a.append(btn("Remove assignment", "btn small ghost", function () { delete asg()[key]; persist(); after(); infoClose(); }));
    if (src) a.append(linkBtn("Open the source", src));
    h.append(a, msg, el("p", "status", "\"Save and email them\" opens an email for you to check. Nothing is sent until you press Send and then Confirm."));
  }
  function mailAssign(rec) {
    infoClose();
    var body = "Hi " + rec.who + ",\n\nCan you take this one, please?\n\n" + rec.title + (rec.next ? "\nNext step: " + rec.next : "") + (rec.due ? "\nDeadline: " + niceD(rec.due) : "") + (rec.url ? "\n\nThe email: " + rec.url : "") + "\n\nThanks,\n" + String(myName || "").split(" ")[0];
    openCompose({ to: personEmail(rec.who), subject: "For you: " + clip(rec.title, 80), body: body });
  }
  function askEmail(name, then) {
    var h = infoOpen("Email address for " + name);
    h.append(el("p", "status", "I don't have " + name + "'s email yet. Add it once and it's saved in your team list under Setup & Admin."));
    var i = el("input", "in"); i.type = "email"; i.placeholder = name.toLowerCase() + "@wyzrent.com"; i.setAttribute("aria-label", name + "'s email");
    var m = el("p", "status err", "");
    var go = btn("Save and continue", "btn small solid", function () {
      var v = i.value.trim(); if (!/^\S+@\S+\.\S+$/.test(v)) { m.textContent = "That doesn't look like an email address."; return; }
      savePerson(name, v); infoClose(); then();
    });
    i.addEventListener("keydown", function (e) { if (e.key === "Enter") go.click(); });
    h.append(i, el("div", "acts"), m); h.querySelector(".acts").append(go); setTimeout(function () { i.focus(); }, 50);
  }

  /* ---------- counts ---------- */
  var openItems = function () { try { return allItems().filter(function (i) { return !isOff(i); }); } catch (e) { return []; } };
  function waitingTeam() {
    var out = [];
    openItems().forEach(function (i) {
      if (i.st !== "wait" && i.st !== "follow") return;
      var t = tById(i.id); if (!t || !t.lastFromMe) return;
      if (isTeam(addrOf((t.lastTo || [])[0] || ""))) out.push({ kind: "mail", i: i, who: nameOf((t.lastTo || [])[0] || "") });
    });
    Object.keys(state.handoffs || {}).forEach(function (id) { var h = state.handoffs[id]; if (h && h.status === "waiting" && !out.some(function (x) { return x.i && x.i.id === id; })) out.push({ kind: "handoff", id: id, h: h }); });
    Object.keys(asg()).forEach(function (k) { var a = asg()[k]; if (a && a.who && a.who !== "Houssam" && a.status !== "Done" && personEmail(a.who).toLowerCase() !== String(email || "").toLowerCase()) out.push({ kind: "asg", a: a }); });
    return out;
  }
  function urgentWyz() {
    return openItems().filter(function (i) {
      var co = ""; try { co = coOf(i); } catch (e) {}
      return (i.g || 1) >= 3 && (/wyz/i.test(co) || !!catOf("mail", i));
    });
  }
  var drafted = function () { return openItems().filter(function (i) { return i.st === "reply" && (state.drafted || {})[i.id]; }); };
  var toDraft = function () { return openItems().filter(function (i) { return i.st === "reply" && !(state.drafted || {})[i.id]; }); };
  var topCount = function () { try { return top3Rows().length; } catch (e) { return 0; } };
  var nSt = function (k) { return openItems().filter(function (i) { return i.st === k; }).length; };

  /* ---------- the 30 actions ---------- */
  var A = {};
  A.top10 = function () {
    page("t-today"); state.top3Col = 0; persist(); try { renderTop3(); } catch (e) {}
    var c = $("top3"); if (c && !c.hidden) { scrollTo(c); return; }
    explain("Today's Top 10", ["Your Top 10 shows once your inbox and tasks have loaded.", signedIn() ? "Tap Refresh now at the top, then try again." : "Sign in with Continue with Google first."]);
  };
  var boardFilter = function (k) { if (needSignIn()) return; page("t-today"); window.wyzCatFlt = null; flt = k; renderBoard(); goSec("inbox"); };
  A.reply = function () { boardFilter("reply"); };
  A.chase = function () { boardFilter("follow"); };
  A.waiting = function () {
    if (needSignIn()) return;
    var list = waitingTeam(), h = infoOpen("Waiting from the team (" + list.length + ")");
    if (!list.length) { h.append(el("p", "status", "Nobody on the team owes you anything right now. Emails you sent to the team and items you assign or hand off show here.")); return; }
    list.forEach(function (x) {
      var r = el("div", "item"), m = el("div", "main"), a = el("div", "acts");
      if (x.kind === "mail") { m.append(el("span", "t", x.i.title), el("span", "m", "Waiting on " + x.who)); a.append(btn("Open", "btn small", function () { infoClose(); openThread(x.i.id, { item: x.i }); }), btn("Chase", "btn small solid", function () { infoClose(); openThread(x.i.id, { item: x.i, draft: true }); })); }
      else if (x.kind === "handoff") { m.append(el("span", "t", x.h.title || "Handed off"), el("span", "m", "Handed to " + (x.h.toName || x.h.to || "a team member"))); }
      else { var late = x.a.due && x.a.due < todayKey(); m.append(el("span", "t", x.a.title), el("span", late ? "m asgline late" : "m", x.a.who + (x.a.due ? " · due " + niceD(x.a.due) : "") + " · " + x.a.status)); a.append(btn("Update", "btn small", function () { infoClose(); page("t-ops"); scrollTo($("opsAssigned")); })); }
      m.append(a); r.append(el("span", "dot wait"), m); h.append(r);
    });
  };
  A.urgent = function () {
    if (needSignIn()) return;
    var list = urgentWyz(), late = Object.keys(asg()).map(function (k) { return asg()[k]; }).filter(function (a) { return a.due && a.status !== "Done" && a.due < todayKey(); });
    var h = infoOpen("Urgent WYZ Rent issues (" + (list.length + late.length) + ")");
    if (!list.length && !late.length) { h.append(el("p", "status", "Nothing urgent for WYZ Rent right now.")); return; }
    list.forEach(function (i) {
      var r = el("div", "item"), m = el("div", "main"), a = el("div", "acts"), c = catOf("mail", i);
      m.append(el("span", "t", i.title), el("span", "m", (UR[i.g] || "") + (c ? " · " + CAT_NAME[c] : "") + (i.summary ? " · " + clip(i.summary, 120) : "")));
      a.append(btn("Open", "btn small solid", function () { infoClose(); openThread(i.id, { item: i }); }), btn("👤 Assign", "btn small", function () { openAssign("mail", i); }));
      m.append(a); r.append(el("span", "dot reply"), m); h.append(r);
    });
    late.forEach(function (x) { var r = el("div", "item"), m = el("div", "main"); m.append(el("span", "t", x.title), el("span", "m asgline late", "Late: " + x.who + ", was due " + niceD(x.due))); r.append(el("span", "dot reply"), m); h.append(r); });
  };
  A.draftAll = function () {
    if (needSignIn()) return; page("t-today"); flt = "reply"; renderBoard(); goSec("inbox");
    setTimeout(function () { try { draftAll(false); } catch (e) {} scrollTo($("draftAll")); }, 300);
    say("Writing drafts into your Gmail drafts. Nothing is sent.");
  };
  A.approve = function () {
    if (needSignIn()) return;
    var list = drafted(), h = infoOpen("Approve and send (" + list.length + ")");
    h.append(el("p", "status", "These replies have a draft waiting in Gmail. Open each one, check it, then press Send and Confirm. Nothing goes out without you."));
    if (!list.length) { h.append(el("p", "status", "No drafts waiting. Use Draft All Replies first."), el("div", "acts")); h.lastChild.append(btn("Draft All Replies", "btn small solid", function () { infoClose(); A.draftAll(); })); return; }
    list.forEach(function (i) {
      var t = tById(i.id) || {}, r = el("div", "item"), m = el("div", "main"), a = el("div", "acts");
      m.append(el("span", "t", i.title), el("span", "m", nameOf(t.from) + " · draft saved " + fmtWhen(state.drafted[i.id])));
      a.append(btn("Review and send here", "btn small solid", function () { infoClose(); openThread(i.id, { item: i, draft: true }); }));
      if (t.url) a.append(linkBtn("Open draft in Gmail", t.url));
      m.append(a); r.append(el("span", "dot reply"), m); h.append(r);
    });
  };
  function sendTo(name) {
    if (needSignIn()) return;
    var to = personEmail(name);
    if (!to) { askEmail(name, function () { openCompose({ to: personEmail(name) }); }); return; }
    openCompose({ to: to });
  }
  A.task = function () { page("t-today"); goSec("tasks"); setTimeout(function () { var i = $("taskIn"); if (i) i.focus(); }, 350); };
  A.meeting = function () { if (needSignIn()) return; try { openEvent(null); } catch (e) { say("Couldn't open the meeting form."); } };
  A.askEmail = function () {
    if (needSignIn()) return;
    if (!sample) { explain("Ask AI about this email", ["No AI is connected yet.", "Open Setup & Admin, then AI assistant, and connect Claude or ChatGPT."], [["Open Setup & Admin", function () { page("t-conn"); }]]); return; }
    var h = infoOpen("Ask AI about an email");
    var sel = el("select", "in"); sel.setAttribute("aria-label", "Which email");
    var cands = openItems().slice(0, 25); if (thr && thr.id && thr.mode === "reply" && !cands.some(function (i) { return i.id === thr.id; })) cands.unshift(thr.item);
    cands.forEach(function (i) { sel.append(new Option(clip(i.title || "(No subject)", 80), i.id)); });
    if (thr && thr.id) sel.value = thr.id;
    if (!cands.length) { h.append(el("p", "status", "No emails loaded yet. Tap Refresh now first.")); return; }
    var q = el("input", "in"); q.placeholder = "Your question, e.g. what exactly do they want from me?"; q.setAttribute("aria-label", "Your question");
    var chips = el("div", "chips");
    ["Summarise it in 3 lines", "What do they want from me?", "What should I reply?", "Any risk or money issue?"].forEach(function (t) { chips.append(btn(t, "chip", function () { q.value = t; go.click(); })); });
    var out = el("div", "out"); out.style.whiteSpace = "pre-wrap";
    var go = btn("Ask", "btn small solid", async function () {
      var ques = q.value.trim() || "Summarise it in 3 lines"; go.disabled = true; out.textContent = "Reading the email...";
      try {
        var full = await mcp.callTool("Gmail", "get_thread", { threadId: sel.value, messageFormat: "PLAIN_TEXT" }, { cache: false });
        var msgs = (full.payload && full.payload.messages) || [];
        var txt = msgs.slice(-6).map(function (m) { return "From: " + (m.sender || "") + "\nDate: " + (m.date || "") + "\n" + clip(String(m.plaintextBody || m.body || m.snippet || ""), 3000); }).join("\n\n---\n\n");
        var r = await creditFallback(function (prov) { return sample("You help " + (myName || "a manager") + " at " + ((window.BR && BR.co) || "WYZ Rent") + ". Answer the question about this email conversation in plain, short business English. No em dashes.\n\nQuestion: " + ques + "\n\nConversation:\n" + txt, { cache: false, provider: prov }); });
        out.textContent = String(r.text || "").trim() || "No answer came back.";
      } catch (e) { out.textContent = "Couldn't answer (" + clip((e && e.message) || "unknown reason", 100) + ")."; }
      go.disabled = false;
    });
    q.addEventListener("keydown", function (e) { if (e.key === "Enter") go.click(); });
    var a = el("div", "acts"); a.append(go, btn("Open the email", "btn small", function () { infoClose(); openThread(sel.value); }));
    h.append(sel, chips, q, a, out); setTimeout(function () { q.focus(); }, 50);
  };
  A.askFile = function () { if (needSignIn()) return; try { openAttachments(""); } catch (e) {} say("Pick a file and tap Ask AI about it."); };
  A.saveDrive = function () {
    if (needSignIn()) return;
    if (drive && drive.state && drive.state !== "ok" && drive.state !== "unknown") { explain("Save attachment to Drive", ["Google Drive isn't connected for this page.", "Sign out at the top, sign in again and tick every box Google shows, including Drive."]); return; }
    try { openAttachments(""); } catch (e) {} say("Tap Save to Drive next to any file.");
  };
  A.wa = function () {
    var s = B().wa.state;
    if (s === "ok") { page("t-today"); var c = $("waCard"); if (c) { scrollTo(c); return; } }
    setupNeeded("wa");
  };
  A.cc = function () {
    if (needSignIn()) return;
    if (!String(CFG.COMMAND_CENTER_URL || "").trim()) { setupNeeded("cc"); return; }
    if (thr && thr.id && thr.mode === "reply") { try { window.openCC(); } catch (e) {} return; }
    var h = infoOpen("Send to Command Center: pick an item"), list = openItems().slice(0, 15);
    if (!list.length) { h.append(el("p", "status", "No emails loaded yet. Tap Refresh now first.")); return; }
    list.forEach(function (i) { var r = el("div", "item"), m = el("div", "main"); m.append(el("span", "t", i.title)); var a = el("div", "acts"); a.append(btn("Choose", "btn small solid", function () { infoClose(); openThread(i.id, { item: i }); setTimeout(function () { try { window.openCC(); } catch (e) {} }, 250); })); m.append(a); r.append(el("span", "dot " + i.st), m); h.append(r); });
  };
  A.wrap = function () { var b = $("wrapBtn"); if (b) b.click(); };
  A.check = function () { page("t-conn"); var c = $("c-test"); setTimeout(function () { scrollTo(c); try { testEverything(); } catch (e) {} }, 100); };
  A.install = function () { page("t-inst"); };
  A.hostaway = function () {
    var s = B().hostaway.state;
    if (s === "ok") { page("t-ops"); setTimeout(function () { scrollTo($("haStrip")); }, 50); return; }
    setupNeeded("hostaway");
  };
  A.revenue = function () {
    var d = B().hostaway.data, h = infoOpen("Revenue alert");
    if (d) {
      var occ = +d.occupancy || 0, warn = occ < 70;
      h.append(el("p", warn ? "status err" : "status", (warn ? "⚠️ Occupancy this month is " + occ + "%, below the 70% mark." : "✅ Occupancy this month is " + occ + "%.") + " Booked this month: " + (d.currency || "AED") + " " + Math.round(+d.revenue || 0).toLocaleString("en-GB") + "."));
      h.append(el("p", "status", (d.checkIns || []).length + " check-ins and " + (d.checkOuts || []).length + " check-outs today, " + (d.inHouse || 0) + " guests in house, " + (d.listings || 0) + " listings."));
    } else {
      h.append(el("p", "status", "Hostaway isn't connected, so there are no booking numbers yet."));
      var a0 = el("div", "acts"); a0.append(btn("Why? Setup needed", "btn small", function () { setupNeeded("hostaway"); })); h.append(a0);
    }
    var money = openItems().filter(function (i) { var c = catOf("mail", i); return c === "pricing" || c === "acct"; });
    h.append(el("h3", "", "Pricing and money emails (" + money.length + ")"));
    if (!money.length) h.append(el("p", "status", "None open."));
    money.slice(0, 10).forEach(function (i) { var r = el("div", "item"), m = el("div", "main"); m.append(el("span", "t", i.title), el("span", "m", CAT_NAME[catOf("mail", i)] + " · " + (UR[i.g] || ""))); var a = el("div", "acts"); a.append(btn("Open", "btn small", function () { infoClose(); openThread(i.id, { item: i }); })); m.append(a); r.append(el("span", "dot " + i.st), m); h.append(r); });
    h.append(el("div", "acts")); h.lastChild.append(btn("Open WYZ Rent Operations", "btn small solid", function () { infoClose(); page("t-ops"); }));
  };
  var catAction = function (k) { return function () { page("t-ops"); opsCat = k; renderOps(); setTimeout(function () { scrollTo($("opsCats")); }, 50); }; };

  /* Daily Brief PDF: today's board as a PDF named with the Dubai date and time */
  A.pdf = async function () {
    if (needSignIn()) return;
    say("Making your Daily Brief PDF...");
    try {
      if (!window.jspdf) await new Promise(function (ok, no) { var s = document.createElement("script"); s.src = "jspdf.umd.min.js"; s.onload = ok; s.onerror = function () { no(new Error("couldn't load the PDF maker")); }; document.head.append(s); });
      var doc = new window.jspdf.jsPDF({ unit: "pt", format: "a4" }), W = 595, M = 48, y = 56;
      var dub = new Date(Date.now() + 4 * 3600000), p2 = function (n) { return String(n).padStart(2, "0"); };
      var stamp = dub.getUTCFullYear() + "-" + p2(dub.getUTCMonth() + 1) + "-" + p2(dub.getUTCDate()) + "_" + p2(dub.getUTCHours()) + p2(dub.getUTCMinutes());
      var nice = new Date().toLocaleString("en-GB", { timeZone: "Asia/Dubai", weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
      var line = function (t, size, bold, color) {
        doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size || 10); doc.setTextColor.apply(doc, color || [14, 34, 56]);
        doc.splitTextToSize(String(t).replace(/[^\x20-\x7E -ÿ]/g, ""), W - 2 * M).forEach(function (l) { if (y > 790) { doc.addPage(); y = 56; } doc.text(l, M, y); y += (size || 10) * 1.35; });
      };
      var head = function (t) { y += 8; line(t, 13, true, [16, 75, 112]); y += 2; };
      line(((window.BR && BR.co) || "WYZ Rent") + " · Daily Brief", 9, true, [184, 146, 60]);
      line("Daily Brief for " + (myName || "you"), 20, true, [16, 75, 112]);
      line(nice + " (Dubai time) · App version " + ((window.WYZ_VERSION && WYZ_VERSION.version) || ""), 9, false, [86, 105, 124]);
      y += 6; line(($("heroSum") && $("heroSum").textContent) || "", 11);
      var rows = []; try { rows = top3Rows(); } catch (e) {}
      head("Top " + rows.length + " for today"); rows.forEach(function (x, n) { line((n + 1) + ". " + x.title + (x.why ? " - " + x.why : "")); });
      var sec = function (title, list, fmt) { head(title + " (" + list.length + ")"); if (!list.length) line("Nothing here.", 10, false, [86, 105, 124]); list.slice(0, 25).forEach(function (i) { line("- " + fmt(i)); }); };
      var from = function (i) { var t = tById(i.id) || {}; return (t.lastFromMe ? "to " + nameOf((t.lastTo || [])[0] || "") : nameOf(t.from || "")); };
      sec("Reply needed", openItems().filter(function (i) { return i.st === "reply"; }), function (i) { return i.title + " (" + from(i) + ")"; });
      sec("Chase needed", openItems().filter(function (i) { return i.st === "follow"; }), function (i) { return i.title + " (" + from(i) + ")"; });
      sec("Waiting from the team", waitingTeam(), function (x) { return x.kind === "mail" ? x.i.title + " (" + x.who + ")" : x.kind === "asg" ? x.a.title + " (" + x.a.who + ", " + x.a.status + ")" : (x.h.title || "Handed off"); });
      var today = todayKey(), meets = (events || []).filter(function (e) { var s = e.start && (e.start.dateTime || e.start.date); return s && String(s).slice(0, 10) === today && e.status !== "cancelled"; });
      sec("Meetings today", meets, function (e) { return (e.start.dateTime ? fmtTime(e.start.dateTime) + " " : "All day ") + (e.summary || "(No title)"); });
      sec("Tasks due", (state.tasks || []).filter(function (t) { return !t.done && t.due && t.due <= today; }), function (t) { return t.t + " (due " + niceD(t.due) + ")"; });
      sec("Assigned items", Object.keys(asg()).map(function (k) { return asg()[k]; }).filter(function (a) { return a.status !== "Done"; }), function (a) { return a.title + " | " + a.who + (a.due ? " | due " + niceD(a.due) : "") + " | " + a.status + (a.next ? " | Next: " + a.next : ""); });
      var name = "Daily_Brief_" + stamp + ".pdf"; doc.save(name);
      say("Saved " + name + ", created " + nice + " Dubai time.");
    } catch (e) { say("Couldn't make the PDF (" + clip((e && e.message) || "unknown reason", 80) + ")."); }
  };

  var GROUPS = [
    ["Daily Work", [
      ["Today's Top 10", "What to do first", A.top10], ["Reply Needed", "People waiting on you", A.reply], ["Chase Needed", "No answer yet", A.chase],
      ["Waiting From Team", "What the team owes you", A.waiting], ["Draft All Replies", "Into Gmail drafts, not sent", A.draftAll], ["Approve And Send", "Check drafts, then send", A.approve],
      ["Send To Louloua", "New email", function () { sendTo("Louloua"); }], ["Send To Karim", "New email", function () { sendTo("Karim"); }], ["Send To Abbas", "New email", function () { sendTo("Abbas"); }],
      ["Create Task", "Add to your list", A.task], ["Create Calendar Meeting", "With a Meet link", A.meeting], ["Ask AI About This Email", "Summary, intent, reply idea", A.askEmail],
      ["Ask AI About This File", "Any attachment", A.askFile], ["Save Attachment To Drive", "One tap per file", A.saveDrive], ["WhatsApp Business Inbox", "Answer from here", A.wa],
      ["Daily Brief PDF", "Today, as a PDF", A.pdf], ["End Of Day Wrap", "Done today, next tomorrow", A.wrap]]],
    ["WYZ Rent Operations", [
      ["Urgent WyzRent Issues", "High and critical", A.urgent], ["Owner Issue", "Statements, payouts", catAction("owner")], ["Guest Issue", "Bookings, stays", catAction("guest")],
      ["Maintenance Issue", "Repairs, AC, leaks", catAction("maint")], ["Cleaning Issue", "Turnovers, linen", catAction("clean")], ["Pricing Issue", "Rates, PriceLabs", catAction("pricing")],
      ["Accounting/Wafeq Issue", "Invoices, payments", catAction("acct")], ["Hostaway Today", "Check-ins, occupancy", A.hostaway], ["Revenue Alert", "Occupancy and money", A.revenue],
      ["Owner Acquisition Leads", "New owners", catAction("acq")], ["Send To Command Center", "As an action item", A.cc]]],
    ["Setup & Admin", [["System Check", "Test every connection", A.check], ["Install / Share With Team", "Phone, computer, invite", A.install]]]
  ];
  var MAIN = [
    ["Today's Top 10", A.top10, topCount, true], ["Reply Needed", A.reply, function () { return nSt("reply"); }], ["Chase Needed", A.chase, function () { return nSt("follow"); }],
    ["Waiting From Team", A.waiting, function () { return waitingTeam().length; }], ["Urgent WyzRent Issues", A.urgent, function () { return urgentWyz().length; }],
    ["Draft All Replies", A.draftAll, function () { return toDraft().length; }], ["Approve And Send", A.approve, function () { return drafted().length; }],
    ["Create Task", A.task, null], ["Create Meeting", A.meeting, null], ["Ask AI", function () { page("t-today"); var c = $("askCard"); scrollTo(c); setTimeout(function () { $("askQ").focus(); }, 300); }, null]
  ];

  /* ---------- status strip ---------- */
  var SRC = {
    gmail: ["Gmail"], cal: ["Calendar"], drive: ["Drive"], ai: ["AI"], hostaway: ["Hostaway"], wa: ["WhatsApp"], cc: ["Command Center"]
  };
  function gState(k) {
    if (!signedIn()) return "need";
    var v = k === "drive" ? (drive && drive.state) : connState[k === "gmail" ? "Gmail" : "Google Calendar"];
    if (v === "ok") return "ok";
    if (v === "reauth" || v === "error") return "err";
    if (!v || v === "unknown") return "wait";
    return "need";
  }
  function srcState(k) {
    if (k === "gmail" || k === "cal" || k === "drive") return gState(k);
    if (k === "ai") { try { return Connectors.ai.active() ? "ok" : "need"; } catch (e) { return "need"; } }
    if (k === "cc") return String(CFG.COMMAND_CENTER_URL || "").trim() ? "ok" : "need";
    var s = (B()[k] || {}).state; return s === "unknown" ? "wait" : s;
  }
  var LABEL = { ok: "Connected", need: "Setup needed", err: "Error", wait: "Checking" };
  function strip() {
    var h = $("statusStrip"); if (!h) return; h.replaceChildren();
    Object.keys(SRC).forEach(function (k) {
      var s = srcState(k), b = el("button", "sschip " + (s === "ok" ? "ok" : s === "err" ? "err" : s === "need" ? "need" : ""));
      b.type = "button"; b.append(el("i"), el("b", "", SRC[k][0]), el("span", "", LABEL[s] || "Checking"));
      b.title = SRC[k][0] + ": " + (LABEL[s] || "Checking") + ". Tap for details.";
      b.onclick = function () { setupNeeded(k); }; h.append(b);
    });
  }
  function explain(title, lines, actions) {
    var h = infoOpen(title); lines.forEach(function (t) { h.append(el("p", "status", t)); });
    var a = el("div", "acts"); (actions || []).forEach(function (x) { a.append(typeof x[1] === "string" ? linkBtn(x[0], x[1], x[2]) : btn(x[0], "btn small" + (x[2] ? " " + x[2] : ""), function () { infoClose(); x[1](); })); }); h.append(a); return h;
  }
  var toAdmin = ["Open Setup & Admin", function () { page("t-conn"); }, "solid"];
  var VENV = "https://vercel.com/d?to=" + encodeURIComponent("/[team]/[project]/settings/environment-variables");
  function setupNeeded(k) {
    var s = srcState(k), name = SRC[k][0], ok = s === "ok";
    var head = name + ": " + (LABEL[s] || "Checking");
    var reconnect = ["Sign out and sign in again", function () { var b = $("signOut"); if (b) b.click(); }];
    if (!signedIn() && (k === "gmail" || k === "cal" || k === "drive")) return explain(head, ["You're not signed in yet.", "Tap Continue with Google on Daily Work. Google asks for permission once, tick every box."], [["Go to sign in", function () { page("t-today"); try { showWelcome(); } catch (e) {} }, "solid"]]);
    if (k === "gmail" || k === "cal" || k === "drive") {
      if (ok) return explain(head, [name + " is working. Your " + (k === "gmail" ? "emails" : k === "cal" ? "meetings" : "recent files") + " load on Daily Work."]);
      if (s === "wait") return explain(head, ["Still loading. Give it a few seconds, or tap Refresh now."]);
      return explain(head, [s === "err" ? "Google needs you to sign in again. This happens now and then for safety." : "Google hasn't given this page permission to read " + name + " yet.", "Fix: sign out at the top, sign in again, and on the Google screen tick every box."], [reconnect, toAdmin]);
    }
    if (k === "ai") return explain(head, ok ? ["The AI is connected. It writes drafts, answers questions and picks your Top 10."] : ["No AI is connected, so drafts and answers are off.", "Fix: in Setup & Admin, open AI assistant and connect Claude or ChatGPT."], ok ? [] : [toAdmin, ["Claude credit", "https://console.anthropic.com/settings/billing"]]);
    if (k === "cc") return explain(head, ok ? ["Send To Command Center posts action items to the WYZ Command Center."] : ["The Command Center (the Lovable dashboard) needs to give this page an intake address first.", "Abbas adds it in the Command Center, then it goes into config.js as COMMAND_CENTER_URL. After that the button sends straight there."], ok ? [] : [["Edit config.js", "https://github.com/habahri-svg/Bahri-Repo/edit/claude/gracious-mayer-ywmspl/docs/config.js", "solid"], ["Command Center", (CFG.DASHBOARD_LINK || "https://dashboard.wyzrent.com")]]);
    var b = B()[k] || {};
    if (k === "hostaway") {
      if (ok) return explain(head, ["Today's check-ins, check-outs, occupancy and bookings show on WYZ Rent Operations."], [["Open Hostaway Today", A.hostaway, "solid"]]);
      if (!isOwner()) return explain(head, ["Hostaway numbers aren't switched on for this page yet. Ask Houssam to switch them on."]);
      return explain(head, [s === "err" ? "Hostaway answered with an error" + (b.note ? ": " + String(b.note).replace(/\.$/, "") : "") + "." : "Hostaway isn't connected yet.", "Fix, one time: create an API key in Hostaway, then add HOSTAWAY_ACCOUNT_ID and HOSTAWAY_API_KEY in Vercel and redeploy. The full steps are in Setup & Admin."], [["Hostaway API key", "https://dashboard.hostaway.com/settings/hostaway-api", "solid"], ["Vercel settings", VENV], toAdmin]);
    }
    if (k === "wa") {
      if (ok) return explain(head, ["Your WhatsApp Business messages show on Daily Work. Every answer needs Send and then Confirm."], [["Open WhatsApp inbox", function () { A.wa(); }, "solid"]]);
      if (!isOwner()) return explain(head, ["WhatsApp Business isn't switched on for this page yet. Ask Houssam to switch it on."]);
      return explain(head, [s === "err" ? "WhatsApp answered with an error" + (b.note ? ": " + String(b.note).replace(/\.$/, "") : "") + "." : "WhatsApp Business isn't connected yet." + (b.missing && b.missing.length ? " Still missing: " + b.missing.join(", ") + "." : ""), "Fix, one time: set it up in Meta for Developers and add the settings in Vercel. The numbered steps are in Setup & Admin."], [["Meta apps", "https://developers.facebook.com/apps", "solid"], ["Vercel settings", VENV], toAdmin]);
    }
  }

  /* ---------- WYZ Rent Operations page ---------- */
  var opsCat = null;
  function renderOps() {
    var chips = $("opsCatChips"), list = $("opsCatList"); if (!chips || !list) return;
    var items = openItems(), tasks = (state.tasks || []).filter(function (t) { return !t.done; });
    chips.replaceChildren(); list.replaceChildren();
    CATS.forEach(function (c) {
      var n = items.filter(function (i) { return catOf("mail", i) === c[0]; }).length + tasks.filter(function (t) { return catOf("task", t) === c[0]; }).length;
      var b = el("button", "chip"); b.type = "button"; b.append(el("span", "", c[1]), el("b", "", String(n))); b.setAttribute("aria-pressed", String(opsCat === c[0]));
      b.onclick = function () { opsCat = opsCat === c[0] ? null : c[0]; renderOps(); }; chips.append(b);
    });
    if (!opsCat) { list.append(el("p", "status", signedIn() ? "Choose a type above." : "Sign in to see your WYZ Rent issues.")); }
    else {
      var mi = items.filter(function (i) { return catOf("mail", i) === opsCat; }), ti = tasks.filter(function (t) { return catOf("task", t) === opsCat; });
      var head = el("div", "headrow"); head.append(el("h3", "", CAT_NAME[opsCat] + ": " + (mi.length + ti.length) + " open"));
      head.append(btn("Show these on Daily Work", "btn small", function () { window.wyzCatFlt = opsCat; flt = null; page("t-today"); renderBoard(); goSec("inbox"); }));
      list.append(head);
      mi.forEach(function (i) { var r = el("div", "item"), m = el("div", "main"), a = el("div", "acts"); m.append(el("span", "t", i.title)); if (i.summary) m.append(el("span", "s", clip(i.summary, 160))); var as = asg()[akey("mail", i)]; if (as) m.append(el("span", "asgline", "👤 " + as.who + " · " + as.status)); a.append(btn("Open", "btn small solid", function () { openThread(i.id, { item: i }); }), btn("👤 Assign", "btn small", function () { openAssign("mail", i); }), btn("Not this type", "btn small ghost", function () { state.cat = state.cat || {}; state.cat[i.id] = "none"; persist(); renderOps(); })); m.append(a); r.append(el("span", "dot " + i.st), m); list.append(r); });
      ti.forEach(function (t) { var r = el("div", "item"), m = el("div", "main"), a = el("div", "acts"); m.append(el("span", "t", t.t), el("span", "m", "Task" + (t.due ? " · due " + niceD(t.due) : ""))); a.append(btn("👤 Assign", "btn small", function () { openAssign("task", t); })); m.append(a); r.append(el("span", "dot work"), m); list.append(r); });
      if (!mi.length && !ti.length) list.append(el("p", "status", "Nothing open of this type."));
      /* log a new issue: it becomes a task with this type, and can be assigned straight away */
      var box = el("div", "infosec"); box.append(el("h3", "", "Log a new " + CAT_NAME[opsCat].toLowerCase()));
      var tx = el("input", "in"); tx.placeholder = { acq: "e.g. Owner of a 2BR in JVC wants our offer", clean: "e.g. Cleaner didn't show at Marina 2BR", maint: "e.g. AC not cooling in Marina 2BR", guest: "e.g. Guest asking for late check-out", owner: "e.g. Owner asking about his payout date", pricing: "e.g. Weekend rates too low in Downtown", acct: "e.g. Invoice from the cleaning company to pay", ceo: "e.g. Contract to approve" }[opsCat] || "Describe it in one line"; tx.setAttribute("aria-label", "What happened");
      var who = el("select", "in"); who.setAttribute("aria-label", "Owner"); who.append(new Option("Owner (optional)", "")); people().forEach(function (p) { who.append(new Option(p.name, p.name)); });
      var due = el("input", "in"); due.type = "date"; due.setAttribute("aria-label", "Deadline");
      var add = btn("Log it", "btn small solid", function () {
        var v = tx.value.trim(); if (!v) { tx.focus(); return; }
        addTask(v, "Logged: " + CAT_NAME[opsCat], due.value, 2); var t = (state.tasks || [])[0];
        if (t) { state.cat = state.cat || {}; state.cat["task:" + t.id] = opsCat; if (who.value) asg()[akey("task", t)] = { kind: "task", id: t.id, title: v, who: who.value, due: due.value, status: "Not started", next: "", url: "", at: Date.now() }; persist(); }
        say("Logged" + (who.value ? " and assigned to " + who.value : "") + "."); renderOps(); try { renderTasks(); } catch (e) {} draw();
      });
      var row = el("div", "acts"); row.append(tx, who, due, add); tx.style.flex = "2 1 220px"; box.append(row); list.append(box);
    }
    renderAssigned();
  }
  function renderAssigned() {
    var host = $("opsAssignList"), sel = $("opsWho"); if (!host || !sel) return;
    if (!sel.options.length) { sel.append(new Option("Everyone", "")); people().forEach(function (p) { sel.append(new Option(p.name, p.name)); }); sel.onchange = renderAssigned; }
    host.replaceChildren();
    var all = Object.keys(asg()).map(function (k) { return [k, asg()[k]]; }).filter(function (x) { return x[1] && x[1].who && (!sel.value || x[1].who === sel.value); });
    all.sort(function (a, b) { var da = a[1].status === "Done" ? "9" : a[1].due || "8", db = b[1].status === "Done" ? "9" : b[1].due || "8"; return da < db ? -1 : da > db ? 1 : 0; });
    if (!all.length) { host.append(el("p", "status", "Nothing assigned yet. Tap 👤 Assign on any email or task.")); return; }
    var hd = el("div", "asgrow"); ["Item and next action", "Owner", "Deadline", "Status"].forEach(function (t) { hd.append(el("b", "status", t)); }); host.append(hd);
    all.forEach(function (x) {
      var k = x[0], a = x[1], r = el("div", "asgrow"), late = a.due && a.status !== "Done" && a.due < todayKey();
      var t = el("div", "t"); var ttl = el("button", "btn small ghost", a.title); ttl.style.cssText = "text-align:left;white-space:normal"; ttl.onclick = function () { if (a.kind === "mail") openThread(a.id); else { page("t-today"); goSec("tasks"); } };
      var nx = el("input", "in"); nx.value = a.next || ""; nx.placeholder = "Next action"; nx.setAttribute("aria-label", "Next action"); nx.onchange = function () { a.next = nx.value.trim(); persist(); };
      t.append(ttl, nx); var src = srcLink(a); if (src) t.append(linkBtn("Source", src)); else t.append(el("span", "status", a.kind === "task" ? "Source: task list" : ""));
      var who = el("select", "in"); people().forEach(function (p) { who.append(new Option(p.name, p.name)); }); who.value = a.who; who.setAttribute("aria-label", "Owner"); who.onchange = function () { a.who = who.value; persist(); draw(); };
      var due = el("input", "in" + (late ? " late" : "")); due.type = "date"; due.value = a.due || ""; due.setAttribute("aria-label", "Deadline"); if (late) due.style.borderColor = "#d6453d"; due.onchange = function () { a.due = due.value; persist(); renderAssigned(); draw(); };
      var st = el("select", "in"); STATUSES.forEach(function (s) { st.append(new Option(s, s)); }); st.value = a.status || "Not started"; st.setAttribute("aria-label", "Status");
      st.onchange = function () { a.status = st.value; if (a.kind === "task" && a.status === "Done") { var tk = (state.tasks || []).find(function (y) { return y.id === a.id; }); if (tk) tk.done = 1; } persist(); renderAssigned(); draw(); try { renderTasks(); } catch (e) {} };
      r.append(t, who, due, st); if (a.status === "Done") r.style.opacity = ".55"; host.append(r);
    });
  }

  /* ---------- drawing ---------- */
  function drawGrid() {
    var host = $("actGroups"); if (!host || host.childNodes.length) return;
    GROUPS.forEach(function (g) {
      var box = el("div", "agrp"); box.append(el("h3", "", g[0])); var grid = el("div", "agrid");
      g[1].forEach(function (x) { var b = el("button", "ab"); b.type = "button"; b.append(el("span", "", x[0]), el("small", "", x[1])); b.onclick = function () { try { x[2](); } catch (e) { say("That didn't work: " + clip((e && e.message) || "", 80)); } }; grid.append(b); });
      box.append(grid); host.append(box);
    });
    try { var d = $("actDet"); if (localStorage.getItem("wyz-act-open") === "0") d.open = false; d.addEventListener("toggle", function () { try { localStorage.setItem("wyz-act-open", d.open ? "1" : "0"); } catch (e) {} }); } catch (e) {}
  }
  function drawMain() {
    var host = $("ckMain"); if (!host) return; host.replaceChildren();
    MAIN.forEach(function (x) {
      var b = el("button", "ck" + (x[3] ? " solid" : "")); b.type = "button";
      var n = x[2] ? x[2]() : null; if (n != null) b.append(el("b", "", String(n)));
      b.append(el("span", "", x[0])); b.onclick = function () { try { x[1](); } catch (e) { say("That didn't work: " + clip((e && e.message) || "", 80)); } };
      host.append(b);
    });
    var note = $("ckNote"); if (note) note.textContent = signedIn() ? "Updated " + new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Dubai", hour: "2-digit", minute: "2-digit" }) : "Sign in to fill this in";
  }
  function draw() { try { drawMain(); } catch (e) {} try { strip(); } catch (e) {} try { if (!$("p-ops").hidden) renderOps(); } catch (e) {} }
  window.wyzCockpit = draw;
  window.wyzActions = A;

  /* close the More menu when tapping elsewhere or choosing an item */
  document.addEventListener("click", function (e) { var m = $("heroMore"); if (m && m.open && !m.contains(e.target)) m.open = false; });
  var hm = $("heroMore"); if (hm) hm.querySelector(".hmenu").addEventListener("click", function (e) { if (e.target.closest("button")) hm.open = false; });
  if ($("goCheck")) $("goCheck").onclick = A.check;
  if ($("adInstall")) $("adInstall").onclick = A.install;
  if ($("adTest")) $("adTest").onclick = A.check;
  if ($("adInvite")) $("adInvite").onclick = function () { var b = $("inviteBtn"); if (b) b.click(); };
  if ($("t-ops")) $("t-ops").addEventListener("click", renderOps);
  window.addEventListener("popstate", function () { if (!$("p-ops").hidden) renderOps(); });

  drawGrid(); draw(); renderOps();
  setInterval(function () { if (!document.hidden) draw(); }, 20000);
})();
