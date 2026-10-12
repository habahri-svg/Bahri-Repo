/* Daily Follow-Up Cockpit (v3.44).
   One first screen that answers "what do I need to do today, and what can I click now?".
   It reads the sources the page already connects (Gmail, Calendar, Drive, tasks, WhatsApp, Hostaway, Wafeq, PriceLabs,
   Command Center, imported research), turns every signal into a small action record, and lets you act from here.
   Rules this file keeps:
   - It never sends an email by itself. Drafts go to Gmail drafts, and sending always happens in the existing
     composer where you press Send (with the checks and the undo countdown).
   - It adds nothing the old screens had to give up. It reads the page's own data and calls the page's own functions.
   - Technical words live only under "Setup & Admin".
   Parts: 1 records and scan rules, 2 other sources and connection status, 3 actions, 4 screens. */
(function () {
  "use strict";
  if (typeof $ !== "function" || typeof el !== "function" || typeof persist !== "function") return;
  var CFG = window.WYZ_CONFIG || {};

  /* ======================================================================================
     PART 1. Records, rules, and turning sources into signals
     ====================================================================================== */
  var TEAM = ["Houssam", "Louloua", "Karim", "Abbas", "Sheena", "Kelvin", "Marz", "Mehyar"];
  var TEAM_ALIAS = { Mehyar: /\b(mehyar|mhyar|mayhar|mhayar)\b/i };
  var STATUSES = ["New", "Waiting for me", "Waiting for other", "Assigned", "In progress", "Done", "Snoozed", "Blocked"];
  var PRIOS = ["Critical", "High", "Medium", "Low"];
  var PW = { Critical: 4, High: 3, Medium: 2, Low: 1 };
  var G2P = { 4: "Critical", 3: "High", 2: "Medium", 1: "Low" };
  var OPS = ["guest", "owner", "maint", "clean", "pricing", "acct"];
  var AREAS = { guest: "Guest", owner: "Owner", maint: "Maintenance", clean: "Cleaning", pricing: "Pricing and revenue", acct: "Accounting", acq: "Owner acquisition" };

  var URG = /\b(urgent|urgently|today|asap|pending|deadline|payment|issue|complaint|approval|invoice|renewal|contract|overdue|immediately)\b/gi;
  var KW = {
    guest: /\b(guests?|check-?in|check-?out|arriv(al|als|e|ing)|reservations?|bookings?|airbnb|booking\.com|vrbo|early check|late check|wi-?fi|key ?less|door code|lock ?box|noise|neighbou?rs?)\b/i,
    owner: /\b(owners?|landlord|payouts?|owner statements?|statements?|management (fee|agreement)|your (unit|apartment|property))\b/i,
    maint: /\b(maintenance|repairs?|leak(s|ing)?|plumb(er|ing)|a\/c|air.?con(ditioning)?|ac unit|broken|not working|fault(y)?|technician|electric(al|ian)|lock (is )?offline|key ?less|pest|damage(d)?|mou?ld)\b/i,
    clean: /\b(clean(ing|er|ers)?|housekeep(ing|er)|laundry|linen|towels|turnover|deep clean|dirty|stain(ed)?)\b/i,
    pricing: /\b(pricing|prices?|rates?|adr|revpar|occupancy|revenue|discounts?|minimum stay|pricelabs|yield)\b/i,
    acct: /\b(invoices?|bills?|wafeq|vat|receipts?|accounting|accountant|payable|receivable|reconcil\w*|payment due|outstanding|statement of account|expenses?)\b/i,
    acq: /\b(leads?|prospects?|new owner|owner acquisition|management offer|proposal|income estimate|brokers?|referral|onboard(ing)?|pitch)\b/i
  };
  var CEO = /\b(approv(e|al|als)|decision|decide|sign(ed|ing)?[ -]?off|authori[sz](e|ation)|contract|renewal|agreement|refund|terminat\w*|budget|resign\w*|legal|lawyer|court|escalat\w*)\b/i;
  var PROMISE = /\b(i('| wi)ll (send|share|revert|get back|check|confirm|update|call|arrange|follow|look|come back|let you know|forward)|will (send|share|revert|get back to|confirm|update|follow up|come back|let you know)|let me (check|confirm|get back|look)|we('| wi)ll (send|share|revert|get back|confirm|update))\b/i;
  var ASK = /\?|please|kindly|could you|can you|let me know|confirm|send|share|waiting|update|follow/i;
  var THANKS = /^(thanks|thank you|ok|okay|noted|great|perfect|received|sounds good)\b/i;
  var FREE_DOMAIN = /^(gmail|googlemail|hotmail|outlook|live|yahoo|icloud|me|msn|proton|protonmail)\./i;
  var REVIEW_NAME = /\b(draft|review|contract|agreement|proposal|report|statement|plan|invoice|offer|budget|policy|checklist|sop)\b/i;

  var first = function () { return (typeof myName === "string" && myName.split(" ")[0]) || "Me"; };
  var mine = function (o) { o = String(o || ""); return !o || /^(me|myself|i)$/i.test(o) || o.toLowerCase() === first().toLowerCase(); };
  var today = function () { return todayKey(); };
  var addDays = function (n) { var d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
  var tomorrow = function () { return addDays(1); };
  var dayDiff = function (a, b) { return Math.round((Date.parse(a + "T00:00:00") - Date.parse(b + "T00:00:00")) / 86400000); };
  var short = function (s, n) { return typeof clip === "function" ? clip(s, n) : String(s || "").slice(0, n); };
  var whenLabel = function (d) {
    if (!d) return "";
    var t = today();
    if (d === t) return "Today";
    if (d === tomorrow()) return "Tomorrow";
    if (d < t) { var n = dayDiff(t, d); return "Overdue " + n + " day" + (n > 1 ? "s" : ""); }
    return niceDay(d);
  };
  function CP() { var s = state; s.cp = s.cp || {}; return s.cp; }
  function ACT() { var s = state; s.actions = s.actions || {}; return s.actions; }
  var chaseDays = function () { var n = +CP().chaseDays; return n === 3 ? 3 : 2; };
  var has = function (r, c) { return (r.cats || []).indexOf(c) >= 0; };
  var hasAny = function (r, list) { return list.some(function (c) { return has(r, c); }); };
  var LIVE = {};          /* id -> live objects from the last scan (a mail item, an event, a file). Never saved. */
  var rid = function () { return Math.random().toString(36).slice(2, 10); };

  /* is a record still on my list? */
  function open(r) {
    if (!r || r.status === "Done") return false;
    if (r.status === "Snoozed" && r.snoozeUntil && r.snoozeUntil > today()) return false;
    return true;
  }
  function score(r) {
    var s = { Critical: 100, High: 70, Medium: 40, Low: 10 }[r.priority] || 10, t = today();
    if (r.deadline) {
      if (r.deadline < t) s += 40 + Math.min(20, dayDiff(t, r.deadline) * 3);
      else if (r.deadline === t) s += 25;
      else if (r.deadline === tomorrow()) s += 8;
    }
    if (has(r, "ceo")) s += 25;
    if (has(r, "vip")) s += 15;
    if (has(r, "urgent")) s += 10;
    if (has(r, "reply")) s += 8;
    if (has(r, "chase")) s += 6;
    if (r.status === "Blocked") s += 10;
    if (r.at && r.at > Date.now() && r.at - Date.now() < 3 * 3600000) s += 30;
    if (has(r, "research")) s -= 25;
    if (r.sourceType === "file") s -= 5;
    if (r.status === "Assigned" && !mine(r.owner)) s -= 15;
    return s;
  }

  /* ---------- small readers ---------- */
  function domainOf(addr) { var m = String(addr || "").match(/@([^>\s]+)/); return m ? m[1].toLowerCase() : ""; }
  function personFor(t, who) {
    var d = domainOf(t && (t.lastFromMe ? (t.lastTo || [])[0] : t.from));
    return (who || "") + (d && !FREE_DOMAIN.test(d) ? " (" + d.replace(/^www\./, "") + ")" : "");
  }
  function teamIn(text) {
    var hit = "";
    TEAM.some(function (n) {
      var re = TEAM_ALIAS[n] || new RegExp("\\b" + n + "\\b", "i");
      if (re.test(text)) { hit = n; return true; }
      return false;
    });
    return hit;
  }
  function areaCats(text) {
    var c = [];
    Object.keys(KW).forEach(function (k) { if (KW[k].test(text)) c.push(k); });
    return c;
  }
  function urgentWords(text) {
    var m = String(text || "").match(URG) || [], seen = {}, out = [];
    m.forEach(function (w) { w = w.toLowerCase(); if (!seen[w]) { seen[w] = 1; out.push(w); } });
    return out;
  }
  function bump(p, by) { var n = Math.min(4, Math.max(1, (PW[p] || 2) + by)); return G2P[n]; }
  function defaultStatus(sg) {
    var c = sg.cats || [];
    if (c.indexOf("waitOthers") >= 0 || c.indexOf("chase") >= 0) return "Waiting for other";
    if (c.indexOf("reply") >= 0 || c.indexOf("waitMe") >= 0 || c.indexOf("todo") >= 0) return "Waiting for me";
    return "New";
  }
  /* what the old screens already know about a mail thread: done, snoozed or handed to a team member */
  function appStateOf(id, item) {
    var o = {};
    try {
      var h = state.handoffs && state.handoffs[id];
      if (item && typeof doneNow === "function" && doneNow(item)) o.force = "Done";
      else if (h && (h.status === "waiting" || h.status === "replied")) { o.force = "Assigned"; o.owner = h.name; o.note = h.status === "replied" ? h.name + " replied" : "Handed to " + h.name; }
      else if (state.snooze && state.snooze[id] && state.snooze[id] > today()) { o.force = "Snoozed"; o.until = state.snooze[id]; }
    } catch (e) {}
    return o;
  }

  /* ---------- Gmail ---------- */
  function mailSignals(S, src) {
    var gs = connState.Gmail;
    if (!G.connected()) { src.Gmail = { st: "setup" }; return; }
    if (gs && gs !== "ok") { src.Gmail = { st: gs === "na" ? "na" : "setup" }; return; }
    if (!board && !threads.length) { src.Gmail = { st: "ok", n: 0, waiting: true }; return; }
    src.Gmail = { st: "ok", n: 0 };
    var items = [];
    try { items = allItems(); } catch (e) {}
    var byId = {}; items.forEach(function (i) { byId[i.id] = i; });
    var ch = chaseDays();

    items.forEach(function (i) {
      var t = tById(i.id) || {};
      if (i.st === "fyi") return;
      var who = nameOf(t.lastFromMe ? (t.lastTo || [])[0] : t.from) || "them";
      var txt = [t.subject, t.snippet, i.title, i.summary, t.from].join(" ");
      var d = t.daysSinceLast == null ? 0 : t.daysSinceLast;
      var cats = [], verb = "Do today", next = "", dl = "", why = i.summary || short(t.snippet, 160);
      var pr = G2P[i.g] || "Medium";
      if (i.st === "reply") { cats.push("reply", "waitMe"); verb = "Answer"; next = "Answer " + who + (t.subject ? " about \"" + short(t.subject, 50) + "\"" : ""); }
      else if (i.st === "follow") { cats.push("chase", "waitOthers"); verb = "Chase"; next = "Chase " + who + " for an answer (" + (d || "some") + " day" + (d === 1 ? "" : "s") + " with no reply)"; }
      else if (i.st === "wait") { cats.push("waitOthers"); verb = "Follow up"; next = "Waiting for " + who + ". Chase if no answer by " + niceDay(addDays(Math.max(0, ch - d))); if (d >= ch) { cats.push("chase"); verb = "Chase"; next = "Chase " + who + " (" + d + " days, no reply)"; } }
      else { cats.push("todo", "waitMe"); verb = "Do today"; next = "Do what this asks: " + short(i.title || t.subject, 60); }
      if (t.lastFromMe && PROMISE.test(t.snippet || "")) { cats.push("promise", "waitMe"); why = "You promised something in your last message: \"" + short(t.snippet, 110) + "\""; if (i.st !== "follow") { verb = "Do today"; next = "Do what you promised " + who; } }
      if (t.att > 0 && !t.lastFromMe) { cats.push("file"); why += (why ? " " : "") + "It has " + t.att + " attachment" + (t.att > 1 ? "s" : "") + " to review."; }
      var uw = urgentWords(txt);
      if (uw.length && (i.st === "reply" || i.st === "follow" || i.st === "work") && !t.auto) { cats.push("urgent"); if (pr !== "Critical") pr = bump(pr, 1); why = (why ? why + " " : "") + "Mentions: " + uw.slice(0, 3).join(", ") + "."; }
      if (i.vip) { cats.push("vip"); if (PW[pr] < 3) pr = "High"; }
      var ar = areaCats(txt); ar.forEach(function (c) { cats.push(c); });
      if (ar.some(function (c) { return OPS.indexOf(c) >= 0; })) cats.push("ops");
      if ((i.vip || PW[pr] >= 3) && CEO.test(txt) && i.st !== "wait") cats.push("ceo");
      var tm = teamIn(txt); if (tm) cats.push("team");
      if (i.st === "reply" || i.st === "work") dl = PW[pr] >= 3 ? today() : PW[pr] === 2 ? tomorrow() : addDays(3);
      else dl = d >= ch ? today() : addDays(Math.max(0, ch - d));
      var app = appStateOf(i.id, i);
      S.push({
        id: "mail:" + i.id, title: i.title || t.subject || "(No subject)", source: "Gmail", sourceType: "email", link: t.url || "", person: personFor(t, who),
        summary: short(i.summary || t.snippet || "", 220), why: why, next: next, verb: verb, deadline: dl, priority: pr, cats: uniq(cats),
        force: app.force, forceUntil: app.until, forceOwner: app.owner, forceNote: app.note, live: { item: i, thread: t, mail: true }, ref: { kind: "mail", id: i.id }
      });
      src.Gmail.n++;
    });

    /* things the page's own sorting did not list: promises, silent threads, urgent words */
    threads.forEach(function (t) {
      if (byId[t.id] || t.auto) return;
      var d = t.daysSinceLast == null ? 0 : t.daysSinceLast, txt = (t.subject || "") + " " + (t.snippet || ""), who = nameOf(t.lastFromMe ? (t.lastTo || [])[0] : t.from) || "them";
      var sg = null;
      if (t.lastFromMe && d <= 21) {
        var thanks = (t.snippet || "").length < 90 && THANKS.test(t.snippet || "");
        if (PROMISE.test(t.snippet || "") && !thanks) {
          sg = { cats: ["promise", "waitMe"], verb: "Do today", why: "You promised something: \"" + short(t.snippet, 120) + "\"", next: "Do what you promised " + who, pr: "Medium", dl: today(), st: "work" };
        } else if (d >= ch && ASK.test(txt) && !thanks) {
          sg = { cats: ["chase", "waitOthers"], verb: "Chase", why: "You wrote " + d + " days ago and there is no reply.", next: "Chase " + who + " for an answer", pr: d >= 5 ? "High" : "Medium", dl: today(), st: "follow" };
        }
      } else if (!t.lastFromMe && t.inInbox && (t.unread || t.important) && urgentWords(txt).length) {
        sg = { cats: ["reply", "waitMe", "urgent"], verb: "Answer", why: "Mentions: " + urgentWords(txt).slice(0, 3).join(", ") + ".", next: "Answer " + who, pr: "High", dl: today(), st: "reply" };
      }
      if (!sg) return;
      var ar = areaCats(txt); ar.forEach(function (c) { sg.cats.push(c); });
      if (ar.some(function (c) { return OPS.indexOf(c) >= 0; })) sg.cats.push("ops");
      var item = { id: t.id, st: sg.st, g: PW[sg.pr], title: (sg.verb === "Chase" ? "Chase " + who + ": " : "") + (t.subject || "(No subject)"), summary: sg.why };
      var app = appStateOf(t.id, item);
      S.push({
        id: "mail:" + t.id, title: item.title, source: "Gmail", sourceType: "email", link: t.url || "", person: personFor(t, who), summary: short(t.snippet, 220),
        why: sg.why, next: sg.next, verb: sg.verb, deadline: sg.dl, priority: sg.pr, cats: uniq(sg.cats),
        force: app.force, forceUntil: app.until, forceOwner: app.owner, forceNote: app.note, live: { item: item, thread: t, mail: true }, ref: { kind: "mail", id: t.id }
      });
      src.Gmail.n++;
    });
  }
  function uniq(a) { var s = {}; return a.filter(function (x) { if (s[x]) return false; s[x] = 1; return true; }); }

  /* ---------- Calendar ---------- */
  var PAST_EVENTS = [];
  function attendeesOf(ev) {
    var me = String(email || "").toLowerCase();
    return (ev.attendees || []).map(function (a) { return typeof a === "string" ? { email: a, name: "" } : { email: String(a.email || ""), name: String(a.name || a.displayName || "") }; })
      .filter(function (a) { return (a.email || a.name) && a.email.toLowerCase() !== me && !a.self && !/resource\.calendar\.google\.com$/.test(a.email); });
  }
  function calSignals(S, src) {
    if (!G.connected()) { src.Calendar = { st: "setup" }; return; }
    var cs = connState["Google Calendar"];
    if (cs && cs !== "ok") { src.Calendar = { st: cs === "na" ? "na" : "setup" }; return; }
    if (!events) { src.Calendar = { st: "ok", n: 0, waiting: true }; return; }
    src.Calendar = { st: "ok", n: 0 };
    var now = Date.now(), t0 = today(), t1 = tomorrow(), seen = {};
    (events || []).concat(PAST_EVENTS).forEach(function (ev) {
      var st = ev.start && ev.start.dateTime; if (!st || ev.status === "cancelled" || seen[ev.id]) return;
      seen[ev.id] = 1;
      var s = Date.parse(st), e = ev.end && ev.end.dateTime ? Date.parse(ev.end.dateTime) : s + 3600000, day = ymd(new Date(s));
      var att = attendeesOf(ev), names = att.map(function (a) { return a.name || nameOf(a.email); }).filter(Boolean);
      var link = ev.htmlLink || ev.conferenceUrl || "";
      var txt = [ev.summary, ev.description, names.join(" ")].join(" ");
      var cats = areaCats(txt);
      if (e >= now && (day === t0 || day === t1)) {
        var noAgenda = !(ev.description && String(ev.description).replace(/<[^>]+>/g, "").trim().length > 15);
        var soon = s - now < 3 * 3600000 && s > now - 15 * 60000;
        S.push({
          id: "cal:" + ev.id + ":prep", title: "Prepare: " + (ev.summary || "Meeting"), source: "Calendar", sourceType: "meeting", link: link,
          person: names.slice(0, 3).join(", ") + (names.length > 3 ? " +" + (names.length - 3) : ""),
          summary: (day === t0 ? "Today" : "Tomorrow") + " at " + fmtTime(st) + (ev.location ? " · " + ev.location : ""),
          why: noAgenda ? (att.length ? "There is no agenda in the invite. Add one or ask the organiser what it is for." : "No agenda written yet.") : "Read the agenda and the latest emails with these people before you go in.",
          next: "Open the prep brief", verb: "Prepare", deadline: day, priority: soon ? "High" : "Medium", cats: uniq(["meet"].concat(noAgenda ? ["noagenda"] : [], cats)), at: s, live: { ev: ev }, ref: { kind: "event", id: ev.id }
        });
        src.Calendar.n++;
      } else if (e < now && now - e < 30 * 3600000 && att.length) {
        S.push({
          id: "cal:" + ev.id + ":fu", title: "Follow up after: " + (ev.summary || "Meeting"), source: "Calendar", sourceType: "meeting", link: link, person: names.slice(0, 3).join(", "),
          summary: "Met " + (day === t0 ? "today" : "yesterday") + " at " + fmtTime(st), why: "Meetings only help when the actions are sent out. Capture notes, tasks and a short follow-up email.",
          next: "Send notes and actions to " + (names[0] || "the group"), verb: "Follow up", deadline: t0, priority: "Medium", cats: uniq(["followup", "meet"].concat(cats)), live: { ev: ev }, ref: { kind: "event", id: ev.id }
        });
        src.Calendar.n++;
      }
    });
  }

  /* ---------- Drive ---------- */
  function driveSignals(S, src) {
    if (!G.connected()) { src.Drive = { st: "setup" }; return; }
    if (drive.state !== "ok") { src.Drive = { st: drive.state === "error" ? "error" : "setup", note: drive.note }; return; }
    src.Drive = { st: "ok", n: 0 };
    var me = String(email || "").toLowerCase(), myn = String(myName || "").toLowerCase(), cutoff = Date.now() - 7 * 86400000, n = 0;
    (drive.files || []).forEach(function (f) {
      if (n >= 6) return;
      var mod = Date.parse(f.mod || ""); if (!mod || mod < cutoff) return;
      var by = String(f.by || ""), other = by && by.toLowerCase() !== me && by.toLowerCase() !== myn;
      var rev = REVIEW_NAME.test(f.t);
      if (!other && !(rev && Date.now() - mod < 3 * 86400000)) return;
      n++;
      var cats = ["file"].concat(areaCats(f.t));
      S.push({
        id: "file:" + f.id, title: (other ? "Review: " : "Check: ") + f.t, source: "Drive", sourceType: "file", link: f.link || "https://drive.google.com/file/d/" + encodeURIComponent(String(f.id).replace(/^a\d+~/, "")) + "/view",
        person: other ? by : "", summary: kindOf(f) + " changed " + fmtWhen(f.mod), why: other ? by + " changed or shared this file. It may need your review." : "A document you were working on that looks like it needs a final check.",
        next: "Open it, or ask the AI what changed", verb: "Review", deadline: addDays(1), priority: "Low", cats: uniq(cats), live: { file: f }, ref: { kind: "file", id: f.id }
      });
      src.Drive.n++;
    });
  }

  /* ---------- Tasks (built-in list and Todoist) ---------- */
  function taskPrio(over, dueToday, high) { return over ? (high ? "Critical" : "High") : dueToday ? (high ? "High" : "Medium") : (high ? "Medium" : "Low"); }
  function taskSignals(S, src) {
    var t0 = today(), wk = addDays(7), n = 0;
    src.Tasks = { st: "ok", n: 0 };
    var push = function (id, title, due, high, owner, srcName, link, live) {
      var over = !!due && due < t0, dueToday = due === t0;
      if (due && due > wk && !high) return;
      var cats = [];
      if (over) cats.push("overdue"); else if (dueToday) cats.push("today"); else if (due) cats.push("week");
      var m = mine(owner);
      if (m) cats.push("waitMe"); else cats.push("team", "waitOthers");
      var tm = teamIn(title); if (tm && m) cats.push("team");
      areaCats(title).forEach(function (c) { cats.push(c); });
      S.push({
        id: id, title: title, source: srcName, sourceType: "task", link: link || "app:tasks", person: m ? "" : owner,
        summary: due ? (over ? "Was due " : "Due ") + niceDay(due) : "No date set",
        why: over ? "This is past its date. Do it, move it or hand it over." : dueToday ? "Due today." : due ? "Coming up this week." : "A task without a date. Give it one so it does not slip.",
        next: m ? "Do it, or hand it to someone" : "Check with " + owner + " that it is on track", verb: m ? "Do today" : "Follow up", deadline: due || "",
        priority: taskPrio(over, dueToday, high), cats: uniq(cats), owner: m ? "Me" : owner, status: m ? undefined : "Assigned", live: live, ref: { kind: "task", id: id }
      });
      src.Tasks.n++; n++;
    };
    (state.tasks || []).filter(function (t) { return t && !t.done; }).forEach(function (t) {
      var due = String(t.due || "").slice(0, 10);
      if (!due && n > 24) return;
      push("task:" + t.id, t.t, due, (t.p || 1) > 1, t.owner, "Tasks", "app:tasks", { task: t, kind: "local" });
    });
    if (todo.state === "ok") {
      src.Todoist = { st: "ok", n: 0 };
      (todo.tasks || []).forEach(function (t) {
        var due = String(t.due || "").slice(0, 10);
        push("todoist:" + (t.id || t.t), t.t, due, t.p >= 3, "", "Todoist", t.id ? "https://app.todoist.com/app/task/" + encodeURIComponent(t.id) : "https://app.todoist.com/", { task: t, kind: "todoist" });
        src.Todoist.n++;
      });
    } else src.Todoist = { st: todo.state === "error" ? "error" : "setup", note: todo.note };
  }

  /* ---------- Imported research (ChatGPT and Claude) ---------- */
  function researchSignals(S, src) {
    var fu = research && research.fu && research.fu.items;
    if (!fu || !fu.length) return;
    var convs = {};
    try { allConvs().forEach(function (c) { convs[c.src + ":" + c.id] = c; }); } catch (e) {}
    fu.filter(function (f) { return (f.g || 2) >= 2 && convs[f.key]; }).slice(0, 3).forEach(function (f) {
      var c = convs[f.key];
      S.push({
        id: "research:" + f.key, title: "Pick up: " + (f.topic || c.title), source: "Research", sourceType: "research", link: c.url, person: c.src === "claude" ? "Claude chat" : "ChatGPT chat",
        summary: f.where || "", why: "You left this unfinished in " + (c.src === "claude" ? "Claude" : "ChatGPT") + ".", next: f.next || "Continue the conversation", verb: "Review",
        deadline: "", priority: "Low", cats: ["research", "todo"], live: { conv: c, fu: f }, ref: { kind: "research", id: f.key }
      });
    });
  }

  /* ---------- merge signals into saved records ---------- */
  var LOADED = {};
  function mergeSignals(signals) {
    var A = ACT(), seen = {}, changed = false, t0 = today(), now = Date.now();
    LIVE = {};
    signals.forEach(function (sg) {
      seen[sg.id] = 1; LIVE[sg.id] = sg.live || {};
      var r = A[sg.id];
      if (!r) {
        r = A[sg.id] = { id: sg.id, created: now, notes: "", owner: sg.owner || "Me", status: sg.status || defaultStatus(sg), edited: {} };
        r.priority = sg.priority; r.deadline = sg.deadline || ""; changed = true;
      }
      ["title", "source", "sourceType", "link", "person", "summary", "why", "next", "verb", "at"].forEach(function (k) {
        if ((r[k] || "") !== (sg[k] || "")) { r[k] = sg[k] || ""; changed = true; }
      });
      if (JSON.stringify(r.cats) !== JSON.stringify(sg.cats)) { r.cats = sg.cats; changed = true; }
      if (JSON.stringify(r.ref) !== JSON.stringify(sg.ref)) { r.ref = sg.ref; changed = true; }
      r.edited = r.edited || {};
      if (!r.edited.priority && r.priority !== sg.priority) { r.priority = sg.priority; changed = true; }
      if (!r.edited.deadline && (r.deadline || "") !== (sg.deadline || "")) { r.deadline = sg.deadline || ""; changed = true; }
      if (!r.edited.owner && sg.owner && r.owner !== sg.owner) { r.owner = sg.owner; changed = true; }
      r.seen = now;
      /* status: the old screens (done, snoozed, handed off) and the source win while the user has not set it here */
      if (sg.force) {
        if (r.status !== sg.force || (sg.force === "Snoozed" && r.snoozeUntil !== sg.forceUntil)) { r.status = sg.force; changed = true; }
        if (sg.force === "Snoozed") r.snoozeUntil = sg.forceUntil;
        if (sg.force === "Assigned" && sg.forceOwner) { r.owner = sg.forceOwner; if (sg.forceNote) r.note = sg.forceNote; }
        if (sg.force === "Done" && !r.doneAt) r.doneAt = now;
        r.sf = 1;
      } else if (r.sf) {
        r.sf = 0; r.status = defaultStatus(sg); if (r.status === "Waiting for me" && sg.status) r.status = sg.status; changed = true;
        if (!r.edited.owner) r.owner = sg.owner || "Me";
      } else if (r.status === "Snoozed" && r.snoozeUntil && r.snoozeUntil <= t0) {
        r.status = defaultStatus(sg); r.snoozeUntil = ""; r.note = "Back from snooze"; changed = true;
      } else if (r.status === "Done" && r.auto) {
        /* it was cleared at the source before, and it is back */
        r.status = sg.status || defaultStatus(sg); r.auto = 0; r.doneAt = 0; changed = true;
      } else if (sg.status && !r.edited.status && r.status !== sg.status && (r.status === "New" || r.status === "Waiting for me")) {
        r.status = sg.status; changed = true;
      }
    });
    /* records whose source was read fine but no longer shows them are finished at the source */
    Object.keys(A).forEach(function (id) {
      var r = A[id];
      if (seen[id] || r.status === "Done" || r.manual) return;
      var srcOk = LOADED[r.source];
      var age = now - (r.seen || r.created || now);
      var soft = r.sourceType === "file" || r.sourceType === "research";
      if ((srcOk && !soft) || (soft && age > 7 * 86400000)) { r.status = "Done"; r.auto = 1; r.doneAt = now; r.note = "Cleared at the source"; changed = true; }
    });
    /* tidy: finished records older than 30 days go; never more than 600 */
    var keys = Object.keys(A);
    keys.forEach(function (id) { var r = A[id]; if (r.status === "Done" && (r.doneAt || r.updated || 0) && now - (r.doneAt || r.updated) > 30 * 86400000) { delete A[id]; changed = true; } });
    if (keys.length > 600) {
      keys.filter(function (id) { return A[id] && A[id].status === "Done"; }).sort(function (a, b) { return (A[a].doneAt || 0) - (A[b].doneAt || 0); }).slice(0, keys.length - 600).forEach(function (id) { delete A[id]; changed = true; });
    }
    return changed;
  }
  var records = function () { var A = ACT(); return Object.keys(A).map(function (k) { return A[k]; }); };
  var openRecords = function () { return records().filter(open); };
  var byScore = function (a, b) { return score(b) - score(a); };

  /* ======================================================================================
     PART 2. Other sources, connection status, scanning
     ====================================================================================== */
  var EXT = { WhatsApp: null, Hostaway: null, Wafeq: null, PriceLabs: null, "Command Center": null };
  var money = function (n, c) { try { return new Intl.NumberFormat("en-GB", { style: "currency", currency: c || "AED", maximumFractionDigits: 0 }).format(n); } catch (e) { return (c || "AED") + " " + Math.round(n).toLocaleString("en-GB"); } };

  async function api(path, opts) {
    var t = await G.token();
    var r = await fetch(path, Object.assign({}, opts || {}, { headers: { Authorization: "Bearer " + t, "content-type": "application/json" } }));
    var j = {}; try { j = await r.json(); } catch (e) {}
    if (r.status === 404 || r.status === 405) { var h = new Error("not hosted"); h.hosting = true; throw h; }
    if (!r.ok && !j.viewer) throw new Error(j.error || ("The server answered " + r.status + "."));
    return j;
  }
  async function loadOne(name, path) {
    try {
      var j = await api(path);
      if (!j || j.viewer === false) EXT[name] = { st: "na", note: "Not switched on for your account.", at: Date.now() };
      else if (j.ready === false) EXT[name] = { st: "setup", missing: j.missing || [], owner: !!j.owner, at: Date.now() };
      else if (j.error) EXT[name] = { st: "error", note: j.error, owner: !!j.owner, at: Date.now() };
      else EXT[name] = { st: "ok", data: j, owner: !!j.owner, at: Date.now() };
    } catch (e) {
      EXT[name] = e && e.hosting ? { st: "na", note: "This copy of the page has no server part, so " + name + " can't be read here.", at: Date.now() } : { st: "error", note: (e && e.message) || "", at: Date.now() };
    }
  }
  async function loadCC() {
    var url = String(CFG.COMMAND_CENTER_READ_URL || "").trim();
    if (!url) { EXT["Command Center"] = { st: "setup", sendOnly: !!String(CFG.COMMAND_CENTER_URL || "").trim(), at: Date.now() }; return; }
    try {
      var t = await G.token();
      var r = await fetch(url, { headers: { Authorization: "Bearer " + t } });
      var j = {}; try { j = await r.json(); } catch (e) {}
      if (!r.ok) throw new Error(j.error || ("the Command Center answered " + r.status));
      var list = Array.isArray(j) ? j : (j.actions || j.items || []);
      EXT["Command Center"] = { st: "ok", data: { actions: list }, at: Date.now() };
    } catch (e) { EXT["Command Center"] = { st: "error", note: (e && e.message) || "", at: Date.now() }; }
  }
  async function loadExt(force) {
    if (!G.connected()) return;
    await Promise.all([
      loadOne("WhatsApp", "/api/whatsapp"), loadOne("Hostaway", "/api/hostaway" + (force ? "?fresh=1" : "")),
      loadOne("Wafeq", "/api/wafeq" + (force ? "?fresh=1" : "")), loadOne("PriceLabs", "/api/pricelabs" + (force ? "?fresh=1" : "")), loadCC()
    ]);
  }
  async function loadPast() {
    if (!mcp || connState["Google Calendar"] !== "ok") return;
    try {
      var d = new Date(); d.setDate(d.getDate() - 1); d.setHours(0, 0, 0, 0);
      var r = await mcp.callTool("Google Calendar", "list_events", { startTime: ymd(d) + "T00:00:00", endTime: addDays(1) + "T00:00:00", orderBy: "startTime", pageSize: 40 }, { cache: false });
      PAST_EVENTS = ((r.payload || {}).events || []).filter(function (x) { return x.status !== "cancelled"; });
    } catch (e) {}
  }

  function extSignals(S, src) {
    Object.keys(EXT).forEach(function (k) {
      var x = EXT[k];
      if (!x) { src[k] = { st: "setup", note: "Not checked yet" }; return; }
      src[k] = { st: x.st, note: x.note, n: 0, missing: x.missing, owner: x.owner, sendOnly: x.sendOnly };
    });
    var t0 = today(), t1 = tomorrow(), ch = chaseDays(), sg;

    /* WhatsApp: people waiting for me, and chats where I wrote last and got no answer */
    if (EXT.WhatsApp && EXT.WhatsApp.st === "ok") {
      var chats = EXT.WhatsApp.data.chats || [];
      chats.forEach(function (c) {
        if (!c.last) return;
        var hrs = (Date.now() - c.last.at) / 3600000, name = c.name || "+" + c.wa, txt = c.last.text || "";
        var cats = areaCats(txt);
        if (cats.some(function (x) { return OPS.indexOf(x) >= 0; })) cats.push("ops");
        if (c.last.dir === "in") {
          S.push({
            id: "wa:" + c.wa, title: "WhatsApp: " + name + " is waiting for you", source: "WhatsApp", sourceType: "message", link: "https://wa.me/" + c.wa, person: name,
            summary: short(txt, 200), why: "Their message has waited " + (hrs < 1 ? "less than an hour" : hrs < 48 ? Math.round(hrs) + " hours" : Math.round(hrs / 24) + " days") + (c.canReply ? "." : ". The free reply window is closed, so answer on your phone."),
            next: "Reply to " + name, verb: "Answer", deadline: t0, priority: hrs >= 48 ? "Critical" : hrs >= 3 ? "High" : "Medium", cats: uniq(["reply", "waitMe", "wa"].concat(cats, urgentWords(txt).length ? ["urgent"] : [])), at: 0,
            live: { wa: c }, ref: { kind: "wa", id: c.wa }
          });
          src.WhatsApp.n++;
        } else if (hrs >= ch * 24 && hrs < 21 * 24 && ASK.test(txt)) {
          S.push({
            id: "wa:" + c.wa + ":out", title: "WhatsApp: no answer from " + name, source: "WhatsApp", sourceType: "message", link: "https://wa.me/" + c.wa, person: name,
            summary: "You wrote: " + short(txt, 160), why: "You wrote " + Math.round(hrs / 24) + " days ago and they have not answered.", next: "Chase " + name + " on WhatsApp", verb: "Chase",
            deadline: t0, priority: "Medium", cats: uniq(["chase", "waitOthers", "wa"].concat(cats)), live: { wa: c }, ref: { kind: "wa", id: c.wa }
          });
          src.WhatsApp.n++;
        }
      });
    }

    /* Hostaway: today's arrivals and departures, tomorrow's arrivals, bookings that need a look */
    if (EXT.Hostaway && EXT.Hostaway.st === "ok") {
      var h = EXT.Hostaway.data, link = "https://dashboard.hostaway.com/reservations";
      (h.checkIns || []).slice(0, 8).forEach(function (g, i) {
        S.push({ id: "ha:in:" + t0 + ":" + g.guest + i, title: "Check-in today: " + g.guest, source: "Hostaway", sourceType: "booking", link: link, person: g.guest, summary: g.place + " · " + g.from + " to " + g.to,
          why: "A guest arrives today. Confirm the unit is clean, the keys or lock work, and they have the arrival details.", next: "Confirm the unit is ready", verb: "Prepare", deadline: t0, priority: "Medium", cats: ["guest", "ops"], live: { stay: g }, ref: { kind: "ha", id: g.guest } });
        src.Hostaway.n++;
      });
      (h.checkOuts || []).slice(0, 8).forEach(function (g, i) {
        S.push({ id: "ha:out:" + t0 + ":" + g.guest + i, title: "Check-out today: " + g.guest, source: "Hostaway", sourceType: "booking", link: link, person: g.guest, summary: g.place + " · left " + g.to,
          why: "The unit needs cleaning and a check for damage or missing items before the next guest.", next: "Confirm the cleaning is booked", verb: "Prepare", deadline: t0, priority: "Medium", cats: ["guest", "clean", "ops"], live: { stay: g }, ref: { kind: "ha", id: g.guest } });
        src.Hostaway.n++;
      });
      (h.tomorrowIns || []).slice(0, 8).forEach(function (g, i) {
        S.push({ id: "ha:in:" + t1 + ":" + g.guest + i, title: "Check-in tomorrow: " + g.guest, source: "Hostaway", sourceType: "booking", link: link, person: g.guest, summary: g.place + " · " + g.from + " to " + g.to,
          why: "Get the unit and the arrival message ready one day ahead.", next: "Plan cleaning and the welcome message", verb: "Prepare", deadline: t1, priority: "Low", cats: ["guest", "ops"], live: { stay: g }, ref: { kind: "ha", id: g.guest } });
        src.Hostaway.n++;
      });
      (h.attention || []).slice(0, 8).forEach(function (g, i) {
        S.push({ id: "ha:att:" + g.from + ":" + g.guest + i, title: "Booking needs a look: " + g.guest, source: "Hostaway", sourceType: "booking", link: link, person: g.guest, summary: g.place + " · arrives " + g.from + " · " + g.status,
          why: "This booking is still \"" + g.status + "\" and the guest arrives " + (g.from === t0 ? "today" : "on " + niceDay(g.from)) + ".", next: "Confirm or release the booking", verb: "Review", deadline: g.from, priority: g.from <= t1 ? "High" : "Medium", cats: ["guest", "ops", "urgent"], live: { stay: g }, ref: { kind: "ha", id: g.guest } });
        src.Hostaway.n++;
      });
    }

    /* Wafeq: what customers owe me, and what I must pay */
    if (EXT.Wafeq && EXT.Wafeq.st === "ok") {
      var w = EXT.Wafeq.data, big = +CP().ceoAmount || 10000, wlink = "https://app.wafeq.com/";
      (w.invoices || []).forEach(function (v) {
        if (v.daysLate <= 0) return;
        S.push({ id: "wq:inv:" + v.id, title: "Chase payment: " + (v.contact || "customer") + (v.number ? " · " + v.number : ""), source: "Wafeq", sourceType: "invoice", link: wlink, person: v.contact,
          summary: money(v.amount, v.currency) + " · due " + (v.due ? niceDay(v.due) : "?") + " · " + v.daysLate + " days late", why: "This invoice is unpaid and past its date.", next: "Send a payment reminder", verb: "Follow up",
          deadline: t0, priority: v.daysLate > 14 ? "High" : "Medium", cats: ["acct", "ops", "chase", "waitOthers"], live: { inv: v }, ref: { kind: "wq", id: v.id } });
        src.Wafeq.n++;
      });
      (w.bills || []).forEach(function (v) {
        var soon = v.due && v.due <= addDays(3); if (!soon) return;
        var cats = ["acct", "ops", "waitMe"]; if (v.amount >= big) cats.push("ceo");
        S.push({ id: "wq:bill:" + v.id, title: "Pay: " + (v.contact || "supplier") + (v.number ? " · " + v.number : ""), source: "Wafeq", sourceType: "invoice", link: wlink, person: v.contact,
          summary: money(v.amount, v.currency) + " · due " + (v.due ? niceDay(v.due) : "?") + (v.daysLate > 0 ? " · " + v.daysLate + " days late" : ""), why: v.daysLate > 0 ? "This bill is past its date." : "This bill falls due within three days." + (v.amount >= big ? " It is a large payment, so it needs your approval." : ""),
          next: v.amount >= big ? "Approve and pay" : "Pay it", verb: v.amount >= big ? "Approve" : "Pay", deadline: v.due || t0, priority: v.daysLate > 0 ? "High" : "Medium", cats: uniq(cats), live: { bill: v }, ref: { kind: "wq", id: v.id } });
        src.Wafeq.n++;
      });
    }

    /* PriceLabs: units that need a pricing look */
    if (EXT.PriceLabs && EXT.PriceLabs.st === "ok") {
      (EXT.PriceLabs.data.alerts || []).slice(0, 8).forEach(function (a, i) {
        var hi = /off|full|not updated/i.test(a.reason);
        S.push({ id: "pl:" + a.id + ":" + a.reason.replace(/\W+/g, "").slice(0, 16), title: "Pricing: " + a.name, source: "PriceLabs", sourceType: "pricing", link: "https://app.pricelabs.co/", person: a.name, summary: a.reason,
          why: a.detail, next: "Open PriceLabs and check this unit", verb: "Review", deadline: t0, priority: hi ? "High" : "Medium", cats: ["pricing", "ops"], live: { alert: a }, ref: { kind: "pl", id: a.id } });
        src.PriceLabs.n++;
      });
    }

    /* Command Center: assigned, overdue, blocked */
    var cc = EXT["Command Center"];
    CC_STATS = { assigned: 0, overdue: 0, blocked: 0, done: 0 };
    if (cc && cc.st === "ok") {
      (cc.data.actions || []).forEach(function (a, i) {
        var st = String(a.status || "").toLowerCase();
        if (/complet|done|closed/.test(st)) { CC_STATS.done++; return; }
        var due = String(a.due || a.deadline || "").slice(0, 10), over = /overdue/.test(st) || (due && due < t0), blocked = /block/.test(st), owner = String(a.owner || a.assignee || ""), m = mine(owner);
        var cats = ["cc"].concat(over ? ["overdue"] : [], blocked ? ["blocked"] : [], m ? ["waitMe"] : ["waitOthers", "team"]);
        areaCats([a.title, a.summary].join(" ")).forEach(function (c) { cats.push(c); });
        CC_STATS.assigned++; if (over) CC_STATS.overdue++; if (blocked) CC_STATS.blocked++;
        var pr = { critical: "Critical", high: "High", medium: "Medium", low: "Low" }[String(a.priority || "").toLowerCase()] || (over ? "High" : "Medium");
        S.push({ id: "cc:" + (a.id || i), title: String(a.title || "Action"), source: "Command Center", sourceType: "action", link: a.url || CFG.DASHBOARD_LINK || "", person: owner, summary: short(a.summary || "", 200),
          why: blocked ? "This action is blocked in the Command Center." : over ? "This action is past its date in the Command Center." : "Assigned in the Command Center.", next: blocked ? "Find out what is blocking it" : m ? "Do it, or hand it over" : "Check with " + owner,
          verb: m ? "Do today" : "Follow up", deadline: due, priority: blocked && PW[pr] < 3 ? "High" : pr, cats: uniq(cats), owner: m ? "Me" : owner, status: blocked ? "Blocked" : m ? undefined : "Assigned", live: { cc: a }, ref: { kind: "cc", id: String(a.id || i) } });
        src["Command Center"].n++;
      });
    }
  }
  var CC_STATS = { assigned: 0, overdue: 0, blocked: 0, done: 0 };

  /* ---------- connection status (simple words on the main screen) ---------- */
  var SRC = {};
  var SRC_NAMES = ["Gmail", "Calendar", "Drive", "Todoist", "WhatsApp Business", "Hostaway", "Wafeq", "PriceLabs", "Command Center", "AI", "Microsoft"];
  function googleStep(k, label, okSay) {
    if (!G.configured()) return { st: "Not available", say: "This site is not set up for Google sign-in yet.", step: ["Show the steps", function () { show("t-today"); showWelcome(); }] };
    if (!G.connected()) return { st: "Setup needed", say: "Sign in with Google to read your " + label + ".", step: ["Connect Google", function () { connectGoogle(); }] };
    var s = connState[k];
    if (s === "ok") return { st: "Connected", say: okSay };
    if (s === "reauth") return { st: "Setup needed", say: "Your Google sign-in ran out. Sign in again.", step: ["Sign in again", function () { connectGoogle(); }] };
    if (s === "denied") return { st: "Setup needed", say: "Google needs one more permission. Tap Allow and tick every box.", step: ["Allow", function () { connectGoogle(true); }] };
    if (s === "na") return { st: "Not available", say: "Not available on this device." };
    if (s === "missing") return { st: "Setup needed", say: "Not connected yet.", step: ["Connect Google", function () { connectGoogle(); }] };
    var f = $("fresh");
    if (f && f.classList.contains("err")) return { st: "Error", say: "Could not read it just now. Try Scan My Day again.", step: ["Scan My Day", function () { runScan(true); }] };
    return { st: "Connected", say: okSay };
  }
  function extStatus(k, label, offSay) {
    var x = EXT[k];
    if (!G.connected()) return { st: "Setup needed", say: "Connect Google first.", step: ["Connect Google", function () { connectGoogle(); }] };
    if (!x) return { st: "Setup needed", say: "Tap Scan My Day to check " + label + ".", step: ["Scan My Day", function () { runScan(true); }] };
    if (x.st === "ok") return { st: "Connected", say: label + " is being read." };
    if (x.st === "na") return { st: "Not available", say: x.note || "Not switched on for your account." };
    if (x.st === "error") return { st: "Error", say: "Could not read " + label + " just now.", step: ["Try again", function () { runScan(true); }] };
    return { st: "Setup needed", say: offSay, step: ["How to switch it on", function () { openAdmin(k); }] };
  }
  function connList() {
    var out = [];
    var add = function (name, o) { o.name = name; o.cls = { Connected: "ok", "Setup needed": "todo", Error: "bad", "Not available": "later" }[o.st] || "later"; out.push(o); };
    add("Gmail", googleStep("Gmail", "email", "Your inbox and sent mail are being read."));
    add("Calendar", googleStep("Google Calendar", "meetings", "Today's and tomorrow's meetings are being read."));
    var d;
    if (!G.connected()) d = { st: "Setup needed", say: "Sign in with Google to see your files.", step: ["Connect Google", function () { connectGoogle(); }] };
    else if (drive.state === "ok") d = { st: "Connected", say: "Recent and shared files are being read." };
    else if (drive.state === "error") d = { st: "Error", say: "Could not read Drive just now.", step: ["Scan My Day", function () { runScan(true); }] };
    else d = { st: "Setup needed", say: "Google needs permission for Drive. Tap Allow.", step: ["Allow", function () { connectGoogle(true); }] };
    add("Drive", d);
    var t;
    if (todo.state === "ok") t = { st: "Connected", say: "Your Todoist tasks are being read." };
    else if (todo.state === "error") t = { st: "Error", say: "Todoist did not answer.", step: ["Scan My Day", function () { runScan(true); }] };
    else t = { st: "Setup needed", say: "Optional. Your built-in task list works without it.", step: ["Connect Todoist", function () { setTodoToken(); }] };
    add("Todoist", t);
    add("WhatsApp Business", extStatus("WhatsApp", "WhatsApp", "WhatsApp Business is not connected yet. The owner switches it on once."));
    add("Hostaway", extStatus("Hostaway", "Hostaway", "Hostaway is not connected yet. The owner switches it on once."));
    add("Wafeq", extStatus("Wafeq", "Wafeq", "Wafeq is not connected yet. The owner switches it on once."));
    add("PriceLabs", extStatus("PriceLabs", "PriceLabs", "PriceLabs is not connected yet. The owner switches it on once."));
    var c = EXT["Command Center"], cs;
    if (!G.connected()) cs = { st: "Setup needed", say: "Connect Google first.", step: ["Connect Google", function () { connectGoogle(); }] };
    else if (c && c.st === "ok") cs = { st: "Connected", say: "Your Command Center actions are being read." };
    else if (c && c.st === "error") cs = { st: "Error", say: "The Command Center did not answer.", step: ["Try again", function () { runScan(true); }] };
    else cs = { st: "Setup needed", say: (c && c.sendOnly ? "You can send items to it, but your assigned actions are not read yet. " : "") + "Ask Abbas to switch on the Command Center link.", step: ["See what is needed", function () { openAdmin("Command Center"); }] };
    add("Command Center", cs);
    var ai;
    if (sample) ai = { st: "Connected", say: "AI can draft replies and write briefs for you." };
    else if (typeof chatAI === "function" && chatAI()) ai = { st: "Connected", say: "Using your own " + CHAT[chatAI()].name + " account. You paste the answer back." };
    else ai = { st: "Setup needed", say: "Add Claude or ChatGPT so drafts and briefs can be written for you.", step: ["Connect AI", function () { show("t-conn"); }] };
    add("AI", ai);
    var ms = false, msOk = false; try { ms = G.accounts().some(function (a) { return a.type === "ms"; }) || G.mainType() === "ms"; msOk = G.msConfigured(); } catch (e) {}
    add("Microsoft", ms ? { st: "Connected", say: "Your Outlook mail and calendar are included." } : msOk ? { st: "Setup needed", say: "Optional. Add an Outlook, Hotmail or Microsoft 365 account.", step: ["Add Microsoft", function () { addAccount("ms"); }] } : { st: "Not available", say: "Microsoft sign-in is not switched on for this site." });
    return out;
  }

  /* ---------- the scan ---------- */
  function collect() {
    var S = [], src = {}, go = function (f) { try { f(S, src); } catch (e) { try { console.error("cockpit scan", e); } catch (x) {} } };
    go(mailSignals); go(calSignals); go(driveSignals); go(taskSignals); go(researchSignals); go(extSignals);
    LOADED = {};
    Object.keys(src).forEach(function (k) {
      if (src[k] && src[k].st === "ok" && !src[k].waiting) { LOADED[k] = true; }
    });
    if (src.Tasks) LOADED.Tasks = true;
    LOADED.Research = false;
    return { S: S, src: src };
  }
  var dirty = false, rebuildT = 0, lastBuilt = 0;
  function rebuild() {
    var c = collect(), changed = false;
    SRC = c.src;
    try { changed = mergeSignals(c.S); } catch (e) { try { console.error("cockpit merge", e); } catch (x) {} }
    if (changed) persist();
    lastBuilt = Date.now();
    if (visible()) { try { render(); } catch (e) { try { console.error("cockpit render", e); } catch (x) {} } } else dirty = true;
  }
  function schedule() { clearTimeout(rebuildT); rebuildT = setTimeout(rebuild, 300); }
  var visible = function () { var p = $("p-cockpit"); return !!p && !p.hidden; };

  var scanning = false, lastReport = null, scanNote = "";
  async function runScan(manual) {
    if (scanning) return;
    if (!G.connected()) { if (manual) { try { toast("Connect Google first, then scan."); } catch (e) {} } render(); return; }
    scanning = true; scanNote = "Reading your email, calendar, files and tasks..."; renderStatusLine();
    var t0 = Date.now();
    try { await refreshAll(false); } catch (e) {}
    scanNote = "Reading WhatsApp, Hostaway, accounting, pricing and the Command Center..."; renderStatusLine();
    try { await Promise.all([loadExt(!!manual), loadPast()]); } catch (e) {}
    scanning = false;
    rebuild();
    var rep = [];
    SRC_ORDER.forEach(function (k) {
      var s = SRC[k]; if (!s) return;
      rep.push({ name: k, st: s.st, n: s.n || 0, note: s.note || "" });
    });
    lastReport = { at: Date.now(), ms: Date.now() - t0, rows: rep, open: openRecords().length };
    CP().lastScan = lastReport.at; persist();
    scanNote = ""; render();
    if (manual) { try { toast("Scan finished: " + lastReport.open + " things need you."); } catch (e) {} }
  }
  var SRC_ORDER = ["Gmail", "Calendar", "Drive", "Tasks", "Todoist", "WhatsApp", "Hostaway", "Wafeq", "PriceLabs", "Command Center"];

  /* ======================================================================================
     PART 3. Actions you can take from a card (and from the 30 buttons)
     ====================================================================================== */
  var link = function (label, href, cls) { var a = el("a", "btn small" + (cls ? " " + cls : ""), label); a.href = href; a.target = "_blank"; a.rel = "noopener"; return a; };
  var B = function (text, fn, cls) { var b = el("button", "btn small" + (cls ? " " + cls : ""), text); b.type = "button"; b.onclick = function () { fn(b); }; return b; };
  var note = function (host, text, err) { var p = el("p", "status" + (err ? " err" : ""), text); p.setAttribute("role", "status"); host.append(p); return p; };
  var labelFor = function (text, node) { var w = el("label", "cp-f"); w.append(el("span", "status", text), node); return w; };
  var inp = function (type, value, ph) { var i = el("input", "in"); i.type = type; if (value) i.value = value; if (ph) i.placeholder = ph; return i; };
  var select = function (opts, value) { var s = el("select", "in"); opts.forEach(function (o) { var v = Array.isArray(o) ? o : [o, o]; s.append(new Option(v[1], v[0])); }); if (value != null) s.value = value; return s; };
  var quiet = false;
  function touch(r) { r.updated = Date.now(); persist(); if (!quiet) { try { render(); } catch (e) {} } }
  var live = function (r) { return LIVE[r.id] || {}; };
  var mailItem = function (r) { var L = live(r); return L.item || { id: r.ref && r.ref.id, st: has(r, "reply") ? "reply" : has(r, "chase") ? "follow" : "work", g: PW[r.priority] || 2, title: r.title, summary: r.summary }; };

  /* ---------- who is who ---------- */
  function contactOf(name) {
    var c = (CP().contacts || {})[name] || {};
    var e = c.email || "";
    if (!e) {
      var list = (Array.isArray(state.team) ? state.team : (typeof DEFAULT_TEAM !== "undefined" ? DEFAULT_TEAM : [])) || [];
      var hit = list.filter(function (p) { return p && String(p.name || "").split(" ")[0].toLowerCase() === String(name).toLowerCase(); })[0];
      if (hit) e = hit.email || "";
    }
    return { email: e, phone: c.phone || "" };
  }
  function saveContact(name, email, phone) {
    var c = CP(); c.contacts = c.contacts || {};
    var cur = c.contacts[name] || {};
    if (email && /^\S+@\S+\.\S+$/.test(email)) cur.email = email;
    if (phone) cur.phone = String(phone).replace(/[^\d+]/g, "");
    c.contacts[name] = cur; persist();
  }
  var waTo = function (phone, text) { var p = String(phone || "").replace(/\D/g, ""); return "https://wa.me/" + p + "?text=" + encodeURIComponent(String(text || "").slice(0, 1500)); };

  /* ---------- status changes ---------- */
  function setStatus(r, st) { r.status = st; r.edited = r.edited || {}; r.edited.status = 1; if (st === "Done") r.doneAt = Date.now(); touch(r); }
  function markRecDone(r) {
    var L = live(r);
    try {
      if (r.sourceType === "email" && r.ref) markDone(L.item || { id: r.ref.id, title: r.title, st: "work" });
      else if (r.sourceType === "task" && L.task) {
        if (L.kind === "todoist") completeTodoist(L.task, { disabled: false, textContent: "" });
        else { L.task.done = 1; persist(); renderTasks(); }
      } else logDone({ id: r.id, title: r.title }, "cockpit");
    } catch (e) {}
    r.status = "Done"; r.doneAt = Date.now(); r.auto = 0; r.edited = r.edited || {}; r.edited.status = 1; r.sf = r.sourceType === "email" ? 1 : 0;
    touch(r);
    try { toast("Done: " + short(r.title, 60)); } catch (e) {}
  }
  function snoozeRec(r, days, date) {
    var until = date || addDays(days);
    if (r.sourceType === "email" && r.ref) { try { snoozeUntil(r.ref.id, days, date); } catch (e) {} }
    r.status = "Snoozed"; r.snoozeUntil = until; r.edited = r.edited || {}; r.edited.status = 1;
    touch(r);
    try { toast("Snoozed until " + niceDay(until)); } catch (e) {}
  }
  function snoozeMenu(r) {
    var host = infoOpen("Snooze: " + short(r.title, 70));
    note(host, "It leaves your list and comes back on the day you pick.");
    var row = el("div", "acts");
    [["Tomorrow", 1], ["In 3 days", 3], ["Next week", 7]].forEach(function (o) { row.append(B(o[0], function () { infoClose(); snoozeRec(r, o[1]); }, "solid")); });
    host.append(row);
    var d = inp("date", addDays(2)); d.min = addDays(1);
    var go = B("Pick this date", function () { if (!d.value || d.value <= today()) { d.focus(); return; } infoClose(); snoozeRec(r, 0, d.value); });
    var r2 = el("div", "ask"); r2.append(d, go); host.append(r2);
  }

  /* ---------- assign to a team member ---------- */
  function assignDialog(r) {
    var host = infoOpen("Assign: " + short(r.title, 70));
    note(host, "It becomes a task for them, with a date, and stays under Waiting From Team until they finish. You can nudge them or take it back.");
    var who = select(TEAM.concat(["Other"]), mine(r.owner) ? (TEAM.filter(function (n) { return !mine(n); })[0] || "Other") : r.owner);
    if (TEAM.indexOf(r.owner) < 0 && !mine(r.owner)) who.value = "Other";
    var other = inp("text", "", "Name"); other.hidden = who.value !== "Other";
    who.onchange = function () { other.hidden = who.value !== "Other"; fillContact(); };
    var due = inp("date", r.deadline && r.deadline >= today() ? r.deadline : tomorrow());
    var msg = el("textarea", "in"); msg.rows = 3; msg.value = r.next || ""; msg.setAttribute("aria-label", "What they need to do");
    var em = inp("email", "", "Their email (to write to them)"), ph = inp("tel", "", "Their WhatsApp number, with country code");
    function fillContact() { var n = who.value === "Other" ? other.value.trim() : who.value, c = contactOf(n); em.value = c.email || ""; ph.value = c.phone || ""; }
    fillContact();
    host.append(labelFor("Give it to", who), other, labelFor("Finish by", due), labelFor("What they need to do", msg), labelFor("Their email", em), labelFor("Their WhatsApp number", ph));
    var out = el("div"); var go = B("Assign", function () {
      var n = who.value === "Other" ? other.value.trim() : who.value;
      if (!n) { other.focus(); return; }
      saveContact(n, em.value.trim(), ph.value.trim());
      assignTo(r, n, due.value, msg.value.trim());
      go.disabled = true; go.textContent = "Assigned";
      out.replaceChildren(); note(out, "Assigned to " + n + ". It is in Waiting From Team and on your task list.");
      var c = contactOf(n), subj = "Please handle: " + short(r.title, 80);
      var body = "Hi " + n + ",\n\nCould you take this one: " + (msg.value.trim() || r.title) + (due.value ? "\nPlease finish by " + niceDay(due.value) + "." : "") + (r.link && /^https?:/.test(r.link) ? "\n\nLink: " + r.link : "") + "\n\nThank you.";
      var acts = el("div", "acts");
      acts.append(B("Write the email to " + n, function () { infoClose(); openCompose({ to: c.email, subject: subj, body: body }); }, "solid"));
      acts.append(link("WhatsApp " + n, waTo(c.phone, body)));
      out.append(acts, el("p", "status", "Nothing is sent from here. The email opens in the writing window, where you check it and press Send."));
    }, "solid");
    host.append(go, out);
  }
  function assignTo(r, name, dueDate, text) {
    r.owner = name; r.status = "Assigned"; r.edited = r.edited || {}; r.edited.owner = 1; r.edited.status = 1;
    if (dueDate) { r.deadline = dueDate; r.edited.deadline = 1; }
    r.assignedAt = Date.now(); r.assignNote = text || ""; r.nudged = 0;
    var L = live(r);
    if (r.sourceType === "task" && L.task && L.kind === "local") { L.task.owner = name; if (dueDate) L.task.due = dueDate; persist(); try { renderTasks(); } catch (e) {} }
    else {
      state.tasks = state.tasks || [];
      var t = { id: rid(), t: "[" + name + "] " + short(text || r.title, 150), src: "Assigned to " + name + " from the Follow-Up Cockpit", due: dueDate || "", p: PW[r.priority] >= 3 ? 2 : 1, done: 0, at: Date.now(), owner: name, from: r.id };
      state.tasks.unshift(t); r.taskId = t.id; persist(); try { renderTasks(); } catch (e) {}
    }
    touch(r);
  }
  function nudgeRec(r) {
    var n = r.owner, c = contactOf(n);
    var host = infoOpen("Nudge " + n);
    var body = "Hi " + n + ", a quick check on this one: " + short(r.assignNote || r.title, 140) + (r.deadline ? " (due " + niceDay(r.deadline) + ")" : "") + ". Where does it stand?";
    note(host, "A short reminder. Nothing is sent from here.");
    var ta = el("textarea", "in"); ta.rows = 3; ta.value = body; host.append(ta);
    var acts = el("div", "acts");
    acts.append(B("Write it as an email", function () { r.nudged = Date.now(); touch(r); infoClose(); openCompose({ to: c.email, subject: "Quick check: " + short(r.title, 70), body: ta.value }); }, "solid"));
    var wa = link("Send on WhatsApp", waTo(c.phone, ta.value)); wa.onclick = function () { wa.href = waTo(c.phone, ta.value); r.nudged = Date.now(); persist(); };
    acts.append(wa);
    host.append(acts);
    if (!c.email) note(host, "No email saved for " + n + ". Add it when you assign, or under Setup & Admin, Team contacts.");
  }
  function takeBack(r) {
    var L = live(r);
    r.owner = "Me"; r.status = defaultStatus({ cats: r.cats }); r.edited = r.edited || {}; r.edited.owner = 0; r.edited.status = 0; r.assignedAt = 0;
    if (r.status === "Waiting for other" && !has(r, "chase")) r.status = "Waiting for me";
    if (L.task && L.kind === "local") { L.task.owner = ""; persist(); try { renderTasks(); } catch (e) {} }
    if (r.taskId) { var t = (state.tasks || []).filter(function (x) { return x.id === r.taskId; })[0]; if (t) { t.done = 1; } r.taskId = ""; persist(); try { renderTasks(); } catch (e) {} }
    touch(r);
    try { toast("Taken back. It is yours again."); } catch (e) {}
  }

  /* ---------- create a task / a meeting ---------- */
  function taskDialog(pre) {
    pre = pre || {};
    var host = infoOpen("Create a task");
    var t = inp("text", pre.title || "", "What needs doing?"); t.setAttribute("aria-label", "Task");
    var due = inp("date", pre.due || tomorrow());
    var pri = select([["1", "Normal"], ["2", "High"]], pre.high ? "2" : "1");
    var who = select(["Me"].concat(TEAM), "Me");
    host.append(labelFor("Task", t), labelFor("Finish by", due), labelFor("Priority", pri), labelFor("Who does it", who));
    var out = el("div");
    host.append(B("Create task", function (b) {
      var text = t.value.trim(); if (!text) { t.focus(); return; }
      var owner = who.value === "Me" ? "" : who.value;
      state.tasks = state.tasks || [];
      var task = { id: rid(), t: (owner ? "[" + owner + "] " : "") + short(text, 180), src: pre.src || "Added from the Follow-Up Cockpit", due: due.value || "", p: +pri.value, done: 0, at: Date.now() };
      if (owner) task.owner = owner;
      state.tasks.unshift(task); persist(); try { renderTasks(); } catch (e) {}
      if (todo.state === "ok" && !owner) { try { pushTodoist(text, due.value || ""); } catch (e) {} }
      b.disabled = true; b.textContent = "Created"; out.replaceChildren(); note(out, "Task created" + (owner ? " for " + owner + "." : "."));
      rebuild();
    }, "solid"), out);
  }
  function meetingFor(r) {
    openEvent(null);
    try { $("evtName").value = r ? "Meeting: " + short(r.title.replace(/^(Prepare|Follow up after): /, ""), 70) : ""; $("evtDate").value = tomorrow(); } catch (e) {}
  }

  /* ---------- ask the AI about an email, a file or anything else ---------- */
  function askAbout(r, kind) {
    var L = live(r);
    if (kind === "file" || r.sourceType === "file") {
      if (L.file && typeof fileKind === "function" && fileKind(L.file.mime, L.file.t)) { openFileAI(L.file.t, function () { return mcp.callTool("Google Drive", "read_file", { fileId: L.file.id, mimeType: L.file.mime }, { cache: false }).then(function (x) { return x.payload; }); }); return; }
      if (L.file) { var h0 = infoOpen("Ask AI about this file"); note(h0, "The AI can read Google Docs, Sheets, Slides, PDFs, pictures and text files. This one is a different type. Open it to read it yourself.", false); h0.append(link("Open the file", r.link, "solid")); return; }
    }
    var host = infoOpen("Ask AI: " + short(r.title, 60));
    var ctx = function () {
      if (r.sourceType === "email" && r.ref) return threadText(r.ref.id).then(function (t) { return "Email thread (latest last):\n" + t; });
      return Promise.resolve("Item: " + r.title + "\nFrom: " + r.source + (r.person ? " · " + r.person : "") + "\nDetail: " + r.summary + "\nWhy it matters: " + r.why + (r.notes ? "\nMy notes: " + r.notes : ""));
    };
    var out = el("div", "out"); out.setAttribute("role", "status");
    var q = inp("text", "", r.sourceType === "email" ? "Ask about this email" : "Ask about this item"); q.setAttribute("aria-label", "Your question");
    var run = async function (question, btn) {
      if (!sample) {
        out.replaceChildren(); note(out, "No AI is connected yet. Connect Claude or ChatGPT under Settings, or ask it outside the page:", false);
        var prompt = question + "\n\n" + r.title + "\n" + r.summary + "\n" + r.why;
        out.append(link("Ask Claude", "https://claude.ai/new?q=" + encodeURIComponent(prompt.slice(0, 1500))), document.createTextNode(" "), link("Ask ChatGPT", "https://chatgpt.com/?q=" + encodeURIComponent(prompt.slice(0, 1500))));
        return;
      }
      out.textContent = "Thinking..."; if (btn) btn.disabled = true;
      try {
        var c = await ctx();
        var res = await creditFallback(function (prov) { return sample("You help " + (myName || "a manager") + " at " + BR.co + ", " + BR.desc + ", act on one item. Answer plainly and briefly. No em dashes, no markdown. Today is " + new Date().toDateString() + ".\n\n" + c + "\n\nQuestion: " + question, { cache: false, provider: prov }); });
        out.textContent = String(res.text || "").trim() || "The AI sent back nothing.";
      } catch (e) { out.textContent = "Couldn't answer just now (" + short((e && e.message) || "unknown reason", 100) + ")."; }
      if (btn) btn.disabled = false;
    };
    var chips = el("div", "chips");
    (r.sourceType === "email"
      ? [["Summarise", "Summarise this in three short lines."], ["What must I answer?", "What exactly do I need to answer or decide? List the points."], ["Any risk?", "Is there any risk, deadline or money in this that I might miss?"], ["Suggest a reply", "Write a short reply I could send. Plain text, ready to edit."]]
      : [["Summarise", "Summarise this in three short lines."], ["What should I do first?", "What is the best next step, and who should do it?"], ["Who could take this?", "Which kind of team member should take this, and what should I tell them?"]]
    ).forEach(function (o) { var c = el("button", "chip", o[0]); c.type = "button"; c.onclick = function () { run(o[1]); }; chips.append(c); });
    var go = B("Ask", function (b) { if (q.value.trim()) run(q.value.trim(), b); else q.focus(); }, "solid");
    q.onkeydown = function (e) { if (e.key === "Enter") go.click(); };
    var row = el("div", "ask"); row.append(q, go);
    host.append(chips, row, out);
    if (!sample) run("Help me with this.");
  }

  /* ---------- save an attachment to Drive ---------- */
  async function attachDialog(r) {
    var host = infoOpen("Save attachment to Drive");
    if (r.sourceType !== "email" || !r.ref) { note(host, "This item is not an email, so it has no attachment. Pick an email from your list.", false); return; }
    var wait = note(host, "Reading the email...");
    var msgs = [];
    try { var x = await mcp.callTool("Gmail", "get_thread", { threadId: r.ref.id, messageFormat: "PLAIN_TEXT" }, { cache: false }); msgs = (x.payload && x.payload.messages) || []; }
    catch (e) { wait.className = "status err"; wait.textContent = "Couldn't open the email (" + short((e && e.message) || "unknown reason", 90) + ")."; return; }
    var n = 0;
    msgs.slice().reverse().forEach(function (m) {
      (m.files || []).filter(function (f) { return f.name && !(f.cid && /^image\//.test(f.type || "") && (!f.size || f.size < 60000)); }).forEach(function (f) {
        n++;
        var row = el("div", "item"); row.append(el("span", "dot none")); var mm = el("div", "main");
        mm.append(el("span", "t", "📎 " + f.name), el("span", "m", (f.size ? Math.max(1, Math.round(f.size / 1024)) + " KB · " : "") + (nameOf(m.sender) || "") + (m.date ? " · " + fmtWhen(m.date) : "")));
        var a = el("div", "acts");
        var sv = el("button", "btn small solid", "Save to Drive"); sv.type = "button";
        sv.onclick = async function () { await saveToDrive(m, f, sv); if (!sv.disabled) { var e2 = el("p", "status err", "Couldn't save it. Allow Drive under Settings, or open the email and save it there."); mm.append(e2); } };
        a.append(sv);
        if (typeof fileKind === "function" && fileKind(f.type, f.name)) a.append(B("Ask AI about it", function () { infoClose(); openFileAI(f.name, function () { return attachmentLoader(m, f); }); }));
        mm.append(a); row.append(mm); host.append(row);
      });
    });
    wait.textContent = n ? n + " attachment" + (n > 1 ? "s" : "") + " in this email. Saved into your \"" + ((state.driveFolder && state.driveFolder.trim()) || BR.co + " Attachments") + "\" folder." : "This email has no attachments.";
  }

  /* ---------- Send to Command Center ---------- */
  function ccDialog(r) {
    var url = String(CFG.COMMAND_CENTER_URL || "").trim();
    var host = infoOpen("Send to Command Center");
    if (!url) {
      note(host, "The Command Center link is not switched on yet. Ask Abbas to add the Command Center address to this page (one setting). Until then, copy the item and paste it there.", false);
      var txt = "Action: " + r.title + "\nFrom: " + r.source + (r.person ? " · " + r.person : "") + "\nWhy: " + r.why + "\nNext step: " + r.next + (r.deadline ? "\nBy: " + niceDay(r.deadline) : "") + (r.link && /^https?:/.test(r.link) ? "\nLink: " + r.link : "");
      var pre = el("pre", "cp-pre", txt); host.append(pre);
      var acts = el("div", "acts");
      acts.append(B("Copy the item", function (b) { navigator.clipboard.writeText(txt).then(function () { b.textContent = "Copied"; }).catch(function () { b.textContent = "Select the text to copy"; }); }, "solid"));
      if (CFG.DASHBOARD_LINK) acts.append(link("Open the dashboard", CFG.DASHBOARD_LINK));
      acts.append(B("What Abbas needs to add", function () { infoClose(); openAdmin("Command Center"); }));
      host.append(acts); return;
    }
    var ti = inp("text", r.title); var su = el("textarea", "in"); su.rows = 3; su.value = r.why ? r.summary + (r.summary ? "\n" : "") + r.why : r.summary;
    var pr = select([["critical", "Critical"], ["high", "High"], ["medium", "Medium"], ["low", "Low"]], (r.priority || "Medium").toLowerCase());
    var dep = select(["", "Operations", "Guest relations", "Owners", "Owner acquisition", "Accounting", "Finance", "Pricing", "Marketing", "Maintenance", "CEO"], (function () { return has(r, "guest") ? "Guest relations" : has(r, "maint") ? "Maintenance" : has(r, "acct") ? "Accounting" : has(r, "pricing") ? "Pricing" : has(r, "owner") ? "Owners" : has(r, "acq") ? "Owner acquisition" : has(r, "ceo") ? "CEO" : ""; })());
    host.append(labelFor("Title", ti), labelFor("What needs doing", su), labelFor("Priority", pr), labelFor("Department", dep));
    var st = el("p", "status");
    var go = B("Send to Command Center", async function (b) {
      b.disabled = true; b.textContent = "Sending...";
      try {
        var tok = await G.token();
        var res = await fetch(url, { method: "POST", headers: { Authorization: "Bearer " + tok, "content-type": "application/json" }, body: JSON.stringify({ type: "action_item", title: ti.value.trim(), summary: su.value.trim(), priority: pr.value, department: dep.value, owner: mine(r.owner) ? "" : r.owner, due: r.deadline || "", from: r.person || "", subject: r.title, link: r.link && /^https?:/.test(r.link) ? r.link : "", sentBy: email || "", createdAt: new Date().toISOString() }) });
        var j = {}; try { j = await res.json(); } catch (e) {}
        if (!res.ok) throw new Error(j.error || ("the Command Center answered " + res.status));
        b.textContent = "Sent"; st.className = "status"; st.textContent = "It is in the Command Center now."; if (j.url) st.append(" ", link("Open it", j.url));
        r.sentToCC = Date.now(); touch(r);
      } catch (e) { b.disabled = false; b.textContent = "Send to Command Center"; st.className = "status err"; st.textContent = "Couldn't send it (" + short((e && e.message) || "unknown reason", 100) + ")."; }
    }, "solid");
    host.append(go, st);
  }

  /* ---------- edit / notes ---------- */
  function editDialog(r) {
    var host = infoOpen("Edit: " + short(r.title, 70));
    var st = select(STATUSES, r.status), pr = select(PRIOS, r.priority), dl = inp("date", r.deadline || ""), ow = select(["Me"].concat(TEAM, ["Other"]), mine(r.owner) ? "Me" : (TEAM.indexOf(r.owner) >= 0 ? r.owner : "Other"));
    var other = inp("text", TEAM.indexOf(r.owner) < 0 && !mine(r.owner) ? r.owner : "", "Name"); other.hidden = ow.value !== "Other"; ow.onchange = function () { other.hidden = ow.value !== "Other"; };
    var nt = el("textarea", "in"); nt.rows = 4; nt.value = r.notes || ""; nt.setAttribute("aria-label", "Notes");
    host.append(labelFor("Status", st), labelFor("Priority", pr), labelFor("Deadline", dl), labelFor("Owner", ow), other, labelFor("Notes", nt));
    host.append(B("Save", function () {
      r.edited = r.edited || {};
      if (st.value !== r.status) { r.status = st.value; r.edited.status = 1; if (st.value === "Done") r.doneAt = Date.now(); }
      if (pr.value !== r.priority) { r.priority = pr.value; r.edited.priority = 1; }
      if ((dl.value || "") !== (r.deadline || "")) { r.deadline = dl.value; r.edited.deadline = 1; }
      var o = ow.value === "Other" ? (other.value.trim() || "Other") : ow.value;
      if (o !== r.owner) { r.owner = o; r.edited.owner = 1; }
      r.notes = nt.value; infoClose(); touch(r);
    }, "solid"));
  }

  /* ---------- the main button on a card, by kind of item ---------- */
  function primary(r) {
    var L = live(r);
    switch (r.sourceType) {
      case "email": return openThread(r.ref.id, { item: mailItem(r), draft: /^(Answer|Chase|Follow up)$/.test(r.verb) });
      case "meeting": if (L.ev) return has(r, "followup") ? openNotes(L.ev) : openBrief(L.ev); break;
      case "file": return askAbout(r, "file");
      case "message": if (L.wa && window.openWAChat) return window.openWAChat(L.wa); break;
      case "research": if (r.link) return window.open(r.link, "_blank", "noopener"); break;
      default: break;
    }
    if (r.status === "New" || r.status === "Waiting for me") { r.status = "In progress"; r.edited = r.edited || {}; r.edited.status = 1; touch(r); }
    if (r.link && /^https?:/.test(r.link)) window.open(r.link, "_blank", "noopener");
  }
  /* write a reply with the AI and save it to Gmail drafts. It is never sent. */
  async function draftWithAI(r, btn) {
    if (r.sourceType !== "email") { toast("Open it to answer. Drafts are saved for emails."); return; }
    if (!sample) { var h = infoOpen("Draft with AI"); note(h, "No AI is connected yet, so nothing can be drafted. Connect Claude or ChatGPT under Settings. You can still open the email and write the answer yourself.", false); h.append(B("Open the email and write it", function () { infoClose(); primary(r); }, "solid")); return; }
    if (btn) { btn.disabled = true; btn.textContent = "Writing..."; }
    try {
      await draftOne(mailItem(r));
      r.note = "Draft saved in Gmail, not sent"; touch(r);
      var h2 = infoOpen("Draft saved"); note(h2, "Saved in your Gmail drafts. It has not been sent. Check it, then press Send in the writing window or in Gmail."); 
      var a = el("div", "acts"); a.append(B("Check it and send here", function () { infoClose(); primary(r); }, "solid"), link("Open Gmail drafts", "https://mail.google.com/mail/?authuser=" + encodeURIComponent(email || "") + "#drafts")); h2.append(a);
    } catch (e) {
      var h3 = infoOpen("Couldn't write the draft");
      note(h3, e && e.code === "consent_required" ? "Google needs one more permission to save drafts. Sign out and in again and tick every box." : "Couldn't write it (" + short((e && e.message) || "unknown reason", 120) + ").", true);
    }
    if (btn) { btn.disabled = false; btn.textContent = "Draft with AI"; }
  }

  /* ---------- pick an item for the buttons that act on one item ---------- */
  var sel = "";
  function selected() { var r = sel && ACT()[sel]; return r && open(r) ? r : null; }
  function pickItem(title, filter, cb, hint) {
    var cur = selected();
    if (cur && (!filter || filter(cur))) { cb(cur); return; }
    var list = openRecords().filter(filter || function () { return true; }).sort(byScore).slice(0, 14);
    var host = infoOpen(title);
    note(host, hint || "Choose the item.", false);
    if (!list.length) { note(host, "Nothing on your list fits this yet. Tap Scan My Day to look again."); return; }
    list.forEach(function (r) {
      var row = el("div", "item cp-pick"); row.append(el("span", "dot " + dotOf(r)));
      var m = el("div", "main"); m.append(el("span", "t", r.title), el("span", "m", r.source + (r.person ? " · " + short(r.person, 40) : "") + (r.deadline ? " · " + whenLabel(r.deadline) : "")));
      m.append(B("Choose this one", function () { sel = r.id; infoClose(); cb(r); }, "solid")); row.append(m); host.append(row);
    });
  }
  var dotOf = function (r) { return r.priority === "Critical" ? "reply" : r.priority === "High" ? "follow" : r.priority === "Medium" ? "work" : "none"; };

  /* ---------- write all the drafts, then review before sending ---------- */
  var draftingAll = false, draftMsg = "";
  async function draftAllReplies() {
    if (draftingAll) return;
    if (!sample) { var h = infoOpen("Draft All Replies"); note(h, "This needs an AI to write the drafts. Connect Claude or ChatGPT under Settings, then try again. Nothing is ever sent by this button.", false); h.append(B("Open Settings", function () { infoClose(); show("t-conn"); }, "solid")); return; }
    var list = openRecords().filter(function (r) { return r.sourceType === "email" && has(r, "reply") && !(state.drafted || {})[r.ref.id]; }).sort(byScore).slice(0, 8);
    if (!list.length) { draftMsg = "Nothing needs a new draft. Every email waiting for your answer already has one, or there are none."; render(); return; }
    draftingAll = true; var ok = 0, bad = 0, stop = "";
    for (var i = 0; i < list.length; i++) {
      draftMsg = "Writing draft " + (i + 1) + " of " + list.length + "..."; renderStatusLine();
      try { await draftOne(mailItem(list[i])); ok++; list[i].note = "Draft saved in Gmail, not sent"; }
      catch (e) {
        bad++;
        if (e && e.code === "consent_required") { stop = "Google needs one more permission to save drafts. Sign out and in again and tick every box."; break; }
        if ((typeof isCreditErr === "function" && isCreditErr(e)) || (e && e.code === "rate_limited")) { stop = (e.message || "The AI is unavailable right now") + " Stopped after " + ok + "."; break; }
      }
    }
    draftingAll = false; persist();
    draftMsg = (ok ? ok + " draft" + (ok > 1 ? "s" : "") + " saved in Gmail. None were sent. Use Approve And Send to check each one. " : "No drafts were saved. ") + (bad && !stop ? bad + " could not be written. " : "") + stop;
    render();
    if (ok) approveDialog();
  }
  function approveDialog() {
    var host = infoOpen("Approve And Send");
    note(host, "Nothing goes out until you press Send. Open each draft, read it, and send it from the writing window. It checks for a missing attachment and leftover [DETAIL] placeholders, and gives you a few seconds to undo.", false);
    var list = openRecords().filter(function (r) {
      if (r.sourceType !== "email" || !r.ref) return false;
      var at = (state.drafted || {})[r.ref.id]; if (!at) return false;
      var t = tById(r.ref.id) || {}; if (t.lastFromMe && Date.parse(t.mineAt || 0) > at) return false;
      return true;
    }).sort(byScore);
    var fromWa = openRecords().filter(function (r) { return r.sourceType === "message" && has(r, "reply"); }).slice(0, 5);
    if (!list.length && !fromWa.length) { note(host, "No drafts are waiting for your approval. Use Draft All Replies, or open any email and tap Draft with AI."); host.append(link("Open Gmail drafts", "https://mail.google.com/mail/?authuser=" + encodeURIComponent(email || "") + "#drafts")); return; }
    list.forEach(function (r) {
      var row = el("div", "item"); row.append(el("span", "dot " + dotOf(r))); var m = el("div", "main");
      m.append(el("span", "t", r.title), el("span", "m", "Draft saved " + fmtWhen(new Date(state.drafted[r.ref.id]).toISOString()) + " · to " + (r.person || "them")));
      var a = el("div", "acts");
      a.append(B("Check it and send", function () { infoClose(); primary(r); }, "solid"), B("Not needed", function (b) { delete state.drafted[r.ref.id]; persist(); b.closest(".item").remove(); }, "ghost"));
      m.append(a); row.append(m); host.append(row);
    });
    if (fromWa.length) {
      host.append(el("h3", "", "WhatsApp messages waiting for your answer"));
      fromWa.forEach(function (r) {
        var row = el("div", "item"); row.append(el("span", "dot " + dotOf(r))); var m = el("div", "main");
        m.append(el("span", "t", r.person || r.title), el("span", "m", short(r.summary, 100)));
        var a = el("div", "acts"); a.append(B("Write and send", function () { infoClose(); primary(r); }, "solid")); m.append(a); row.append(m); host.append(row);
      });
    }
    host.append(link("Open Gmail drafts", "https://mail.google.com/mail/?authuser=" + encodeURIComponent(email || "") + "#drafts"));
  }

  /* ======================================================================================
     PART 4. The screen
     ====================================================================================== */
  var transferOnly = function (r) { return ["task", "action", "invoice", "booking"].indexOf(r.sourceType) >= 0 || (r.edited && r.edited.deadline); };
  var VIEWS = [
    { k: "top", label: "Today's Top 10", short: "Top 10", hint: "The ten things that matter most right now, most important first.", need: [] },
    { k: "reply", label: "Reply Needed", short: "Reply", hint: "People waiting for your answer.", fn: function (r) { return has(r, "reply"); }, need: ["Gmail", "WhatsApp"] },
    { k: "chase", label: "Chase Needed", short: "Chase", hint: "People who owe you an answer and have gone quiet.", fn: function (r) { return has(r, "chase"); }, need: ["Gmail", "WhatsApp", "Wafeq"] },
    { k: "waitOthers", label: "Waiting From Others", short: "Waiting on others", hint: "Everything you are waiting on someone else for.", fn: function (r) { return has(r, "waitOthers") || r.status === "Waiting for other" || (r.status === "Assigned" && !mine(r.owner)); }, need: ["Gmail", "WhatsApp"] },
    { k: "waitMe", label: "Waiting From Me", short: "Waiting on me", hint: "Things other people are waiting for you to do.", fn: function (r) { return mine(r.owner) && (has(r, "waitMe") || r.status === "Waiting for me"); }, need: ["Gmail", "WhatsApp", "Calendar"] },
    { k: "overdue", label: "Overdue Tasks", short: "Overdue", hint: "Past their date. Do them, move them or hand them over.", fn: function (r) { return !!r.deadline && r.deadline < today() && transferOnly(r); }, need: ["Tasks", "Command Center"] },
    { k: "today", label: "Due Today", short: "Due today", hint: "Tasks and commitments with today's date.", fn: function (r) { return r.deadline === today() && transferOnly(r); }, need: ["Tasks", "Command Center"] },
    { k: "meet", label: "Meetings To Prepare", short: "Meetings", hint: "Today and tomorrow, plus follow-ups after meetings that just ended.", fn: function (r) { return has(r, "meet"); }, need: ["Calendar"] },
    { k: "urgent", label: "Urgent WyzRent Issues", short: "Urgent WyzRent", hint: "Guest, owner, maintenance, cleaning, pricing and accounting items that cannot wait.", fn: function (r) { return hasAny(r, OPS) && (PW[r.priority] >= 3 || has(r, "urgent") || (!!r.deadline && r.deadline <= today())); }, need: ["Hostaway", "WhatsApp", "Gmail"] },
    { k: "ceo", label: "CEO Decisions", short: "CEO decisions", hint: "Approvals, contracts, renewals and large payments that need you.", fn: function (r) { return has(r, "ceo"); }, need: ["Gmail", "Wafeq"] },
    { k: "team", label: "Waiting From Team", short: "With the team", hint: "Items you handed to someone. Nudge, take back, or mark done.", fn: function (r) { return !mine(r.owner) && (r.status === "Assigned" || r.status === "Blocked"); }, need: [] },
    { k: "guest", label: "Guest Issues", hint: "Check-ins, check-outs, guest messages and booking problems.", fn: function (r) { return has(r, "guest"); }, need: ["Hostaway", "WhatsApp", "Gmail"] },
    { k: "owner", label: "Owner Issues", hint: "Owner questions, statements and payouts.", fn: function (r) { return has(r, "owner"); }, need: ["Gmail", "WhatsApp"] },
    { k: "maint", label: "Maintenance Issues", hint: "Repairs, leaks, air conditioning, locks and faults.", fn: function (r) { return has(r, "maint"); }, need: ["Gmail", "WhatsApp", "Hostaway"] },
    { k: "clean", label: "Cleaning Issues", hint: "Cleaning, laundry and turnovers, including today's check-outs.", fn: function (r) { return has(r, "clean"); }, need: ["Hostaway", "Gmail", "WhatsApp"] },
    { k: "pricing", label: "Pricing / Revenue Issues", hint: "Units that need a pricing look and revenue questions.", fn: function (r) { return has(r, "pricing"); }, need: ["PriceLabs", "Gmail"] },
    { k: "acct", label: "Accounting / Wafeq Issues", hint: "Unpaid invoices, bills to pay and accounting follow-ups.", fn: function (r) { return has(r, "acct"); }, need: ["Wafeq", "Gmail"] },
    { k: "acq", label: "Owner Acquisition Leads", hint: "New owner leads, offers and proposals to follow up.", fn: function (r) { return has(r, "acq"); }, need: ["Gmail", "WhatsApp"] },
    { k: "wa", label: "WhatsApp Follow-Ups", hint: "WhatsApp chats waiting for you, and chats where nobody answered you.", fn: function (r) { return has(r, "wa"); }, need: ["WhatsApp"] },
    { k: "files", label: "Files To Review", hint: "Attachments and Drive files that need your eyes.", fn: function (r) { return has(r, "file"); }, need: ["Drive", "Gmail"] },
    { k: "done", label: "Done Today", hint: "What you finished today.", fn: null, need: [] }
  ];
  var VIEW = function (k) { return VIEWS.filter(function (v) { return v.k === k; })[0] || VIEWS[0]; };
  var CORE = ["top", "reply", "chase", "waitOthers", "waitMe", "overdue", "today", "meet", "urgent", "ceo"];
  function rowsFor(k) {
    if (k === "top") return openRecords().sort(byScore).slice(0, 10);
    if (k === "done") { var t0 = new Date(); t0.setHours(0, 0, 0, 0); return records().filter(function (r) { return r.status === "Done" && r.doneAt >= t0.getTime(); }).sort(function (a, b) { return b.doneAt - a.doneAt; }); }
    var v = VIEW(k); return openRecords().filter(v.fn).sort(byScore);
  }
  var V = { view: "top", engine: "" };
  var root = null;

  var statusCls = function (s) { return { Done: "ok", "In progress": "ok", Assigned: "", Blocked: "bad", Snoozed: "later", New: "", "Waiting for me": "todo", "Waiting for other": "later" }[s] || ""; };
  function srcHref(r) {
    if (r.link && /^https?:/.test(r.link)) return r.link;
    if (r.sourceType === "email" && r.ref) return "https://mail.google.com/mail/?authuser=" + encodeURIComponent(email || "") + "#all/" + encodeURIComponent(String(r.ref.id).replace(/^a\d+~/, ""));
    return "";
  }
  function srcLink(r) {
    var href = srcHref(r), a;
    if (r.link === "app:tasks") { a = el("button", "cp-src", r.source + " ↗"); a.type = "button"; a.onclick = function () { show("t-today"); goSec("tasks"); }; a.title = "Show it in My tasks"; return a; }
    if (!href) return el("span", "cp-src plain", r.source);
    a = el("a", "cp-src", r.source + " ↗"); a.href = href; a.target = "_blank"; a.rel = "noopener"; a.title = "Open it in " + r.source; return a;
  }
  function primaryLabel(r) {
    if (r.sourceType === "task") return "";
    if (r.sourceType === "email") return /^(Answer|Chase|Follow up)$/.test(r.verb) ? r.verb : "Open";
    if (r.sourceType === "research") return "Continue";
    return r.verb || "Open";
  }
  function card(r, compact) {
    var c = el("article", "cp-card p-" + String(r.priority || "Medium").toLowerCase()); c.dataset.id = r.id; if (sel === r.id) c.classList.add("sel");
    c.onclick = function (e) { if (e.target.closest("button,a,summary,details,input,select")) return; sel = sel === r.id ? "" : r.id; render(); };
    var head = el("div", "cp-ch"); head.append(el("span", "dot " + dotOf(r)), el("span", "cp-t", r.title));
    var pills = el("div", "cp-pills");
    pills.append(el("span", "pill pr-" + String(r.priority).toLowerCase(), r.priority), el("span", "pill " + statusCls(r.status), r.status));
    head.append(pills); c.append(head);
    var meta = el("div", "cp-meta"); meta.append(srcLink(r));
    if (r.person) meta.append(el("span", "", r.person));
    if (r.deadline) { var late = r.deadline < today(); var d = el("span", late ? "cp-late" : "", (r.edited && r.edited.deadline ? "Due: " : "By: ") + whenLabel(r.deadline)); meta.append(d); }
    meta.append(el("span", "", "Owner: " + (mine(r.owner) ? "Me" : r.owner)));
    c.append(meta);
    if (!compact) {
      if (r.why) c.append(el("p", "cp-why", r.why));
      if (r.next) { var nx = el("p", "cp-next"); nx.append(el("b", "", "Next: "), document.createTextNode(r.next)); c.append(nx); }
      if (r.notes) c.append(el("p", "cp-notes", "Note: " + short(r.notes, 160)));
      else if (r.note) c.append(el("p", "cp-notes", r.note));
    }
    c.append(actions(r));
    return c;
  }
  function actions(r) {
    var a = el("div", "acts cp-acts"), pl = primaryLabel(r);
    if (pl) a.append(B(pl, function () { sel = r.id; primary(r); }, "solid"));
    if (r.sourceType === "email" && (has(r, "reply") || has(r, "chase") || has(r, "promise"))) a.append(B("Draft with AI", function (b) { draftWithAI(r, b); }));
    if (r.sourceType === "message" && has(r, "reply") && live(r).wa && live(r).wa.canReply === false) a.append(link("Open in WhatsApp", r.link));
    if (!mine(r.owner)) { a.append(B("Nudge", function () { nudgeRec(r); }), B("Take back", function () { takeBack(r); }, "ghost")); }
    else a.append(B("Assign", function () { assignDialog(r); }));
    a.append(B("Snooze", function () { snoozeMenu(r); }, "ghost"), B("Done", function () { markRecDone(r); }, "ghost"));
    var d = el("details", "cp-more"); d.append(el("summary", "", "More ▾"));
    var m = el("div", "cp-menu");
    var item = function (t, fn) { var b = el("button", "", t); b.type = "button"; b.onclick = function () { d.open = false; fn(); }; m.append(b); };
    item("Create task", function () { taskDialog({ title: r.next && r.sourceType !== "task" ? short(r.next, 100) : r.title, due: r.deadline && r.deadline >= today() ? r.deadline : tomorrow(), high: PW[r.priority] >= 3, src: r.source + ": " + short(r.title, 60) }); });
    item("Create meeting", function () { meetingFor(r); });
    item(r.sourceType === "file" ? "Ask AI about this file" : r.sourceType === "email" ? "Ask AI about this email" : "Ask AI about this", function () { sel = r.id; askAbout(r, r.sourceType === "file" ? "file" : "email"); });
    if (r.sourceType === "email") item("Save attachment to Drive", function () { attachDialog(r); });
    item("Send to Command Center", function () { ccDialog(r); });
    item("Notes, status, priority, date", function () { editDialog(r); });
    if (r.sourceType === "email") item("Read the whole thread", function () { openThread(r.ref.id, { item: mailItem(r) }); });
    d.append(m); a.append(d);
    return a;
  }

  /* ---------- the parts of the screen ---------- */
  function header() {
    var h = el("header", "cp-head");
    var l = el("div", "cp-hl");
    l.append(el("h2", "", "Daily Follow-Up Cockpit"));
    var n = openRecords().length, crit = openRecords().filter(function (r) { return r.priority === "Critical"; }).length;
    var sub = !G.connected() ? "Connect your accounts and I will show what to answer, chase, delegate and do today." : n ? n + " thing" + (n > 1 ? "s" : "") + " need you" + (crit ? ", " + crit + " critical" : "") + ". " : "Nothing is waiting. ";
    var ls = CP().lastScan, lb = lastBuilt; l.append(el("p", "sub", sub + (ls ? "Last scan " + fmtTime(new Date(ls).toISOString()) + "." : lb && G.connected() ? "Updated " + fmtTime(new Date(lb).toISOString()) + ". Tap Scan My Day to read everything again." : (G.connected() ? "Not scanned yet." : ""))));
    var st = el("p", "status", scanNote || draftMsg || ""); st.id = "cpStatus"; st.setAttribute("role", "status"); l.append(st);
    h.append(l);
    var r = el("div", "cp-hr");
    var scan = B(scanning ? "Scanning..." : "Scan My Day", function () { runScan(true); }, "solid cp-scan"); scan.disabled = scanning; r.append(scan);
    var jump = B("All 30 actions ↓", function () { var g = $("cpGrid"); if (g) g.scrollIntoView({ behavior: "smooth", block: "start" }); }, "ghost"); r.append(jump);
    h.append(r);
    return h;
  }
  function renderStatusLine() { var s = $("cpStatus"); if (s) s.textContent = scanNote || draftMsg || ""; var b = document.querySelector(".cp-scan"); if (b) { b.disabled = scanning; b.textContent = scanning ? "Scanning..." : "Scan My Day"; } }

  function connStrip() {
    var wrap = el("section", "cp-conn"); wrap.setAttribute("aria-label", "Connections");
    var row = el("div", "cp-chips"), detail = el("div", "cp-conn-detail"); detail.id = "cpConnDetail";
    var list = connList(), open_ = V.connOpen;
    list.forEach(function (c) {
      var b = el("button", "cp-chip " + c.cls); b.type = "button"; b.setAttribute("aria-pressed", String(open_ === c.name));
      b.append(el("i", "cdot"), el("span", "nm", c.name), el("span", "st", c.st));
      b.onclick = function () { V.connOpen = V.connOpen === c.name ? "" : c.name; render(); };
      row.append(b);
    });
    wrap.append(row);
    var bad = list.filter(function (c) { return c.st === "Setup needed" || c.st === "Error"; }).length;
    if (!open_) { wrap.append(el("p", "status cp-conn-sum", bad ? bad + " source" + (bad > 1 ? "s" : "") + " need setup or attention. Tap one to see the next step." : "Everything you use is connected.")); }
    var cur = list.filter(function (c) { return c.name === open_; })[0];
    if (cur) {
      detail.append(el("b", "", cur.name + ": " + cur.st), el("span", "", " " + cur.say));
      if (cur.step) detail.append(document.createTextNode(" "), B(cur.step[0], cur.step[1], "solid"));
      wrap.append(detail);
    }
    return wrap;
  }
  function slot() { var d = new Date(), h = d.getHours() + d.getMinutes() / 60; return h < 12 ? "morning" : h < 16.5 ? "midday" : "eod"; }
  var ENGINES = [["morning", "Morning Brief"], ["midday", "Midday Check"], ["eod", "End-Of-Day Wrap"], ["queue", "Follow-Up Queue"], ["tomorrow", "Tomorrow Prep"]];
  function rhythm() {
    var w = el("section", "cp-rhythm"); w.setAttribute("aria-label", "Daily rhythm");
    var s = slot(), cur = { morning: "morning", midday: "midday", eod: "eod" }[s];
    ENGINES.forEach(function (e) {
      var b = el("button", "cp-seg" + (e[0] === cur ? " now" : ""), e[1]); b.type = "button"; b.setAttribute("aria-pressed", String(V.engine === e[0]));
      if (e[0] === cur) b.append(el("small", "", " now"));
      b.onclick = function () { V.engine = V.engine === e[0] ? "" : e[0]; render(); scrollPanel(); };
      w.append(b);
    });
    return w;
  }
  function chipsRow() {
    var w = el("nav", "cp-tabs"); w.setAttribute("aria-label", "Sections");
    CORE.concat(["team"]).forEach(function (k) {
      var v = VIEW(k), n = rowsFor(k).length;
      var b = el("button", "cp-tab" + (n ? " has" : ""), v.short || v.label); b.type = "button"; b.setAttribute("aria-pressed", String(!V.engine && V.view === k));
      if (k === "top") b.append(el("b", "", String(n))); else b.append(el("b", "", String(n)));
      b.onclick = function () { gotoView(k); };
      w.append(b);
    });
    return w;
  }
  function gotoView(k) { V.view = k; V.engine = ""; render(); scrollPanel(); }
  function scrollPanel() { var p = $("cpPanel"); if (p) { p.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); var h = p.querySelector("h3"); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } } }

  /* what to say when a list is empty, and which sources could be missing */
  function emptyNote(host, v) {
    var rows = connList(), miss = [];
    (v.need || []).forEach(function (n) {
      var name = n === "WhatsApp" ? "WhatsApp Business" : n === "Tasks" ? "Todoist" : n; if (n === "Tasks") return;
      var c = rows.filter(function (x) { return x.name === name; })[0];
      if (c && c.st !== "Connected") miss.push(c);
    });
    host.append(el("p", "cp-empty", V.view === "top" && !G.connected() ? "Nothing to show yet. Connect your accounts above." : "Nothing here right now. That is a good sign."));
    if (miss.length) {
      var box = el("div", "cp-setup"); box.append(el("b", "", "Not seeing everything yet"));
      miss.forEach(function (c) {
        var p = el("p", "status"); p.append(el("b", "", c.name + " (" + c.st + "): "), document.createTextNode(c.say + " "));
        if (c.step) p.append(B(c.step[0], c.step[1], "small solid"));
        box.append(p);
      });
      host.append(box);
    }
  }
  function panel() {
    var p = el("section", "cp-panel"); p.id = "cpPanel";
    if (V.engine) { engineView(p, V.engine); return p; }
    var v = VIEW(V.view), rows = rowsFor(v.k);
    var h = el("div", "cp-ph"); h.append(el("h3", "", v.label + " (" + rows.length + ")"));
    if (v.k !== "top") { var back = B("Back to Top 10", function () { gotoView("top"); }, "ghost"); h.append(back); }
    p.append(h, el("p", "status", v.hint));
    if (draftMsg) p.append(el("p", "status cp-msg", draftMsg));
    if (!rows.length) emptyNote(p, v);
    var cap = v.k === "top" ? 10 : 60;
    rows.slice(0, cap).forEach(function (r) { p.append(card(r)); });
    if (rows.length > cap) p.append(el("p", "status", "Showing the first " + cap + " of " + rows.length + "."));
    if (lastReport && v.k === "top") p.append(scanReport());
    return p;
  }
  function scanReport() {
    var d = el("details", "cp-report"); d.append(el("summary", "", "What the last scan read"));
    lastReport.rows.forEach(function (x) {
      var say = x.st === "ok" ? x.n + " item" + (x.n === 1 ? "" : "s") + " found" : x.st === "setup" ? "Setup needed" : x.st === "na" ? "Not available" : "Error";
      d.append(el("p", "status", x.name + ": " + say + (x.note ? " (" + short(x.note, 80) + ")" : "")));
    });
    d.append(el("p", "status", "Took " + Math.round(lastReport.ms / 100) / 10 + " seconds."));
    return d;
  }

  /* ---------- the daily rhythm: five views ---------- */
  var plural = function (n, w) { return n + " " + w + (n === 1 ? "" : "s"); };
  function group(host, title, rows, opts) {
    opts = opts || {};
    var g = el("div", "cp-grp"); g.append(el("h4", "", title + " (" + rows.length + ")"));
    if (!rows.length) g.append(el("p", "status", opts.empty || "Nothing."));
    rows.slice(0, opts.cap || 8).forEach(function (r) { g.append(card(r, opts.compact !== false)); });
    if (rows.length > (opts.cap || 8)) { var more = B("See all " + rows.length, function () { if (opts.view) gotoView(opts.view); }, "ghost"); g.append(more); }
    host.append(g);
  }
  function peopleLine(rows) {
    var by = {}; rows.forEach(function (r) { var k = r.person || r.source; (by[k] = by[k] || []).push(r); });
    return Object.keys(by).sort(function (a, b) { return by[b].length - by[a].length; }).map(function (k) { return k + (by[k].length > 1 ? " (" + by[k].length + ")" : ""); });
  }
  function ha() { return EXT.Hostaway && EXT.Hostaway.st === "ok" ? EXT.Hostaway.data : null; }
  function opsLine() {
    var h = ha(); if (!h) return "";
    return "Check-ins today " + h.checkIns.length + ", check-outs " + h.checkOuts.length + ", guests in house " + h.inHouse + ", occupancy this month " + h.occupancy + "%.";
  }
  function snapshot() {
    var c = CP(), d = today();
    if (!c.snap || c.snap.day !== d) { c.snap = { day: d, at: Date.now(), p: {} }; openRecords().forEach(function (r) { c.snap.p[r.id] = PW[r.priority]; }); persist(); }
    return c.snap;
  }
  function briefTools(host, kind, textFn, title) {
    var out = el("div", "out cp-brief"); out.hidden = true; out.setAttribute("role", "status");
    var acts = el("div", "acts"), cur = "";
    var show_ = function (t) { cur = t; out.hidden = false; out.textContent = t; };
    acts.append(B("Create the " + title.toLowerCase(), function () { show_(textFn()); }, "solid"));
    acts.append(B("Write it with AI", async function (b) {
      var plain = textFn();
      if (!sample) { show_(plain); note(host, "No AI is connected, so here is the simple version. Connect Claude or ChatGPT under Settings for a written one.", false); return; }
      b.disabled = true; b.textContent = "Writing..."; out.hidden = false; out.textContent = "Writing it...";
      try {
        var res = await creditFallback(function (prov) { return sample("Write the " + title + " for " + (myName || "the reader") + " at " + BR.co + ", " + BR.desc + ". Plain text only, no markdown, no em dashes, short lines, at most 20 lines. Say what matters first, name people to chase, and end with the one thing to protect time for.\n\nData:\n" + plain, { cache: false, provider: prov }); });
        show_(String(res.text || "").trim() || plain);
      } catch (e) { show_(plain + "\n\n(The AI could not write this just now, so this is the simple version.)"); }
      b.disabled = false; b.textContent = "Write it with AI";
    }));
    acts.append(B("Copy", function (b) { var t = cur || textFn(); show_(t); navigator.clipboard.writeText(t).then(function () { b.textContent = "Copied"; setTimeout(function () { b.textContent = "Copy"; }, 1500); }).catch(function () { b.textContent = "Select the text"; }); }, "ghost"));
    acts.append(B("Save to my Gmail drafts", async function (b) {
      var t = cur || textFn(); show_(t); b.disabled = true; b.textContent = "Saving...";
      try { await mcp.callTool("Gmail", "create_draft", { to: [email], cc: [], subject: title + ", " + new Date().toLocaleDateString("en-GB"), body: t, attachments: [] }); b.textContent = "Saved as a draft. Not sent"; }
      catch (e) { b.disabled = false; b.textContent = "Save to my Gmail drafts"; note(host, e && e.code === "consent_required" ? "Google needs one more permission to save drafts. Sign out and in again and tick every box." : "Couldn't save the draft (" + short((e && e.message) || "unknown reason", 90) + ").", true); }
    }, "ghost"));
    var wa = link("Send on WhatsApp", "#", "ghost"); wa.onclick = function () { wa.href = waLink(cur || textFn()); };
    acts.append(wa);
    host.append(acts, out);
  }
  function listText(title, rows, fmt) { return rows.length ? [title].concat(rows.slice(0, 10).map(function (r, i) { return "  " + (i + 1) + ". " + (fmt ? fmt(r) : r.title); })).concat([""]) : []; }
  function morningText() {
    var all = openRecords(), L = [], head = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
    L.push("Morning Brief, " + head, "");
    L = L.concat(listText("Top 10 things to do today", rowsFor("top")));
    L = L.concat(listText("Urgent replies", rowsFor("reply").filter(function (r) { return PW[r.priority] >= 3; })));
    L = L.concat(listText("People to chase", rowsFor("chase"), function (r) { return (r.person || r.source) + ": " + short(r.title, 70); }));
    L = L.concat(listText("Meetings", rowsFor("meet").filter(function (r) { return r.deadline === today(); }), function (r) { return r.title + " (" + r.summary + ")"; }));
    var o = opsLine(); var urgent = rowsFor("urgent");
    if (o || urgent.length) { L.push("WyzRent operations"); if (o) L.push("  " + o); urgent.slice(0, 6).forEach(function (r) { L.push("  - " + r.title); }); L.push(""); }
    L = L.concat(listText("CEO decisions", rowsFor("ceo")));
    return L.join("\n").trim();
  }
  function phead(p, title) { var h = el("div", "cp-ph"); h.append(el("h3", "", title)); p.append(h); return h; }
  function morningView(p) {
    var snap = snapshot();
    phead(p, "Morning Brief");
    p.append(el("p", "status", "Your day in one place: what to do first, who is waiting, who to chase, meetings and WyzRent operations."));
    var all = openRecords();
    p.append(el("p", "cp-sum", plural(rowsFor("top").length, "top item") + " · " + plural(rowsFor("reply").length, "reply") + " · " + plural(rowsFor("chase").length, "person") + " to chase · " + plural(rowsFor("meet").filter(function (r) { return r.deadline === today(); }).length, "meeting") + " today · " + plural(rowsFor("urgent").length, "WyzRent issue") + " · " + plural(rowsFor("ceo").length, "CEO decision")));
    var o = opsLine(); if (o) p.append(el("p", "status", o));
    briefTools(p, "morning", morningText, "Morning Brief");
    group(p, "Top 10 things to do today", rowsFor("top"), { cap: 10, view: "top" });
    group(p, "Urgent replies", rowsFor("reply").filter(function (r) { return PW[r.priority] >= 3; }), { cap: 5, view: "reply", empty: "No urgent replies." });
    var ch = rowsFor("chase"); var g = el("div", "cp-grp"); g.append(el("h4", "", "People to chase (" + ch.length + ")")); g.append(el("p", "status", ch.length ? peopleLine(ch).join(", ") : "Nobody to chase.")); if (ch.length) g.append(B("Open Chase Needed", function () { gotoView("chase"); }, "ghost")); p.append(g);
    group(p, "Meetings today", rowsFor("meet").filter(function (r) { return r.deadline === today(); }), { cap: 6, view: "meet", empty: "No meetings today." });
    group(p, "WyzRent operational issues", rowsFor("urgent"), { cap: 5, view: "urgent", empty: "No urgent WyzRent issues." });
    group(p, "CEO decisions", rowsFor("ceo"), { cap: 5, view: "ceo", empty: "No decisions waiting." });
  }
  function middayView(p) {
    var snap = snapshot();
    phead(p, "Midday Check");
    p.append(el("p", "status", "Halfway through the day: what is still open, what became urgent, and what to hand over."));
    var all = openRecords();
    var stillOpen = all.filter(function (r) { return (PW[r.priority] >= 3 || r.deadline === today() || (r.deadline && r.deadline < today())) && r.sourceType !== "research"; }).sort(byScore);
    var urgentNow = all.filter(function (r) { return PW[r.priority] >= 3 && (snap.p[r.id] == null || snap.p[r.id] < 3); }).sort(byScore);
    var del = all.filter(function (r) { return mine(r.owner) && ["task", "action", "invoice", "booking", "pricing"].indexOf(r.sourceType) >= 0 || (mine(r.owner) && hasAny(r, ["maint", "clean", "guest", "acq"]) && !has(r, "ceo")); }).sort(byScore);
    p.append(el("p", "cp-sum", plural(stillOpen.length, "item") + " still open · " + plural(urgentNow.length, "item") + " became urgent · " + plural(del.length, "item") + " could go to someone else"));
    briefTools(p, "midday", function () {
      var L = ["Midday Check, " + new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }), ""];
      L = L.concat(listText("Still open", stillOpen)).concat(listText("Became urgent since this morning", urgentNow)).concat(listText("Could go to someone else", del, function (r) { var d = (CP().defaultOwner || {})[firstArea(r)]; return r.title + (d ? " (suggest " + d + ")" : ""); }));
      return L.join("\n").trim();
    }, "Midday Check");
    group(p, "What is still open", stillOpen, { cap: 8, view: "top", empty: "Nothing urgent is open. Good." });
    group(p, "What became urgent since this morning", urgentNow, { cap: 6, empty: "Nothing new became urgent." });
    var g = el("div", "cp-grp"); g.append(el("h4", "", "What needs delegation (" + del.length + ")"));
    if (!del.length) g.append(el("p", "status", "Nothing obvious to hand over."));
    del.slice(0, 6).forEach(function (r) {
      var sug = (CP().defaultOwner || {})[firstArea(r)];
      var c = card(r, true); if (sug) c.append(el("p", "cp-notes", "Usual owner for this: " + sug)); g.append(c);
    });
    p.append(g);
    var act = el("div", "acts"); act.append(B("Draft All Replies", draftAllReplies), B("Scan again", function () { runScan(true); }, "ghost")); p.append(act);
  }
  var firstArea = function (r) { return ["maint", "clean", "guest", "owner", "pricing", "acct", "acq"].filter(function (c) { return has(r, c); })[0] || ""; };
  function unsentDrafts() {
    var d = state.drafted || {}, out = [];
    Object.keys(d).forEach(function (id) {
      var t = tById(id) || {}, at = d[id]; if (t.lastFromMe && Date.parse(t.mineAt || 0) > at) return;
      var r = ACT()["mail:" + id]; if (r && r.status === "Done") return;
      out.push({ id: id, at: at, rec: r, title: (r && r.title) || t.subject || "Email" });
    });
    return out.sort(function (a, b) { return b.at - a.at; });
  }
  function tomorrowMeetings() {
    var t1 = tomorrow();
    return (events || []).filter(function (x) { return x.start && x.start.dateTime && ymd(new Date(x.start.dateTime)) === t1 && x.status !== "cancelled"; }).sort(function (a, b) { return Date.parse(a.start.dateTime) - Date.parse(b.start.dateTime); });
  }
  function eodText() {
    var done = rowsFor("done"), L = ["End-Of-Day Wrap, " + new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }), ""];
    L.push("Done today: " + done.length); done.slice(0, 12).forEach(function (r) { L.push("  - " + r.title); }); L.push("");
    var nd = openRecords().filter(function (r) { return PW[r.priority] >= 3 || (r.deadline && r.deadline <= today()); }).sort(byScore);
    L = L.concat(listText("Not done", nd));
    var wm = rowsFor("waitMe"); L.push("Waiting for me: " + (wm.length ? peopleLine(wm).slice(0, 8).join(", ") : "nobody"));
    var ch = openRecords().filter(function (r) { return has(r, "chase") || (r.status === "Assigned" && !mine(r.owner)); }); L.push("To chase tomorrow: " + (ch.length ? peopleLine(ch).slice(0, 8).join(", ") : "nobody"));
    var dr = unsentDrafts(); L.push("Drafts not sent: " + dr.length); dr.slice(0, 6).forEach(function (x) { L.push("  - " + x.title); });
    var tm = tomorrowMeetings(); L.push("", "Tomorrow's meetings: " + (tm.length ? "" : "none")); tm.forEach(function (m) { L.push("  " + fmtTime(m.start.dateTime) + "  " + (m.summary || "Meeting")); });
    return L.join("\n").trim();
  }
  function eodView(p) {
    phead(p, "End-Of-Day Wrap");
    p.append(el("p", "status", "What got done, what did not, who is waiting, who to chase tomorrow, and what is still sitting in drafts."));
    var done = rowsFor("done"), cleared = records().filter(function (r) { var t0 = new Date(); t0.setHours(0, 0, 0, 0); return r.auto && r.doneAt >= t0.getTime(); });
    var nd = openRecords().filter(function (r) { return PW[r.priority] >= 3 || (r.deadline && r.deadline <= today()); }).sort(byScore);
    var dr = unsentDrafts(), tm = tomorrowMeetings();
    p.append(el("p", "cp-sum", plural(done.length, "item") + " done · " + plural(nd.length, "item") + " not done · " + plural(dr.length, "draft") + " not sent · " + plural(tm.length, "meeting") + " tomorrow"));
    briefTools(p, "eod", eodText, "End-Of-Day Wrap");
    var g = el("div", "cp-grp"); g.append(el("h4", "", "Done today (" + done.length + ")"));
    if (!done.length) g.append(el("p", "status", "Nothing marked done yet today."));
    done.slice(0, 12).forEach(function (r) { var row = el("p", "cp-line", "✓ " + r.title); g.append(row); });
    if (cleared.length) g.append(el("p", "status", cleared.length + " more cleared on their own because you handled them in Gmail, Todoist or elsewhere."));
    p.append(g);
    group(p, "Not done", nd, { cap: 8, view: "top", empty: "Everything important is done." });
    var wm = rowsFor("waitMe"), g2 = el("div", "cp-grp"); g2.append(el("h4", "", "Who is waiting for me (" + wm.length + ")")); g2.append(el("p", "status", wm.length ? peopleLine(wm).slice(0, 10).join(", ") : "Nobody.")); p.append(g2);
    var ch = openRecords().filter(function (r) { return has(r, "chase") || (r.status === "Assigned" && !mine(r.owner)); }), g3 = el("div", "cp-grp"); g3.append(el("h4", "", "Who must be chased tomorrow (" + ch.length + ")")); g3.append(el("p", "status", ch.length ? peopleLine(ch).slice(0, 10).join(", ") : "Nobody.")); if (ch.length) g3.append(B("Open the Follow-Up Queue", function () { V.engine = "queue"; render(); scrollPanel(); }, "ghost")); p.append(g3);
    var g4 = el("div", "cp-grp"); g4.append(el("h4", "", "Drafts not sent (" + dr.length + ")"));
    if (!dr.length) g4.append(el("p", "status", "No drafts are waiting."));
    dr.slice(0, 6).forEach(function (x) { var row = el("div", "cp-line"); row.append(document.createTextNode(x.title + " "), x.rec ? B("Check it and send", function () { primary(x.rec); }, "small") : link("Open Gmail drafts", "https://mail.google.com/mail/?authuser=" + encodeURIComponent(email || "") + "#drafts")); g4.append(row); });
    p.append(g4);
    var g5 = el("div", "cp-grp"); g5.append(el("h4", "", "Tomorrow's meetings (" + tm.length + ")"));
    if (!tm.length) g5.append(el("p", "status", "No meetings tomorrow."));
    tm.forEach(function (m) { var row = el("div", "cp-line"); row.append(document.createTextNode(fmtTime(m.start.dateTime) + "  " + (m.summary || "Meeting") + " "), B("Prep brief", function () { openBrief(m); }, "small")); g5.append(row); });
    p.append(g5);
  }
  function queueView(p) {
    phead(p, "Follow-Up Queue");
    p.append(el("p", "status", "Kept up to date for you: everything you sent or handed over that still needs a response."));
    var all = openRecords();
    var mailWait = all.filter(function (r) { return r.sourceType === "email" && (has(r, "waitOthers") || has(r, "chase")); }).sort(byScore);
    var waWait = all.filter(function (r) { return has(r, "wa") && (has(r, "chase") || has(r, "waitOthers")); }).sort(byScore);
    var waMe = all.filter(function (r) { return has(r, "wa") && has(r, "reply"); }).sort(byScore);
    var team = rowsFor("team");
    var over = rowsFor("overdue");
    var pay = all.filter(function (r) { return r.sourceType === "invoice" && (has(r, "chase") || has(r, "waitOthers")); });
    p.append(el("p", "cp-sum", plural(mailWait.length, "email") + " awaiting a reply · " + plural(waWait.length + waMe.length, "WhatsApp chat") + " · " + plural(team.length, "item") + " with the team · " + plural(over.length, "overdue task") + " · " + plural(pay.length, "payment") + " to chase"));
    group(p, "Emails awaiting a reply", mailWait, { cap: 8, view: "waitOthers", empty: "No emails are waiting for a reply." });
    group(p, "WhatsApp conversations awaiting a reply", waMe.concat(waWait), { cap: 6, view: "wa", empty: "No WhatsApp chats are waiting." });
    group(p, "Assigned to the team", team, { cap: 8, view: "team", empty: "Nothing is with the team right now." });
    group(p, "Payments to chase", pay, { cap: 5, view: "acct", empty: "No unpaid invoices to chase." });
    group(p, "Overdue tasks", over, { cap: 6, view: "overdue", empty: "No overdue tasks." });
  }
  function tomorrowView(p) {
    phead(p, "Tomorrow Prep");
    p.append(el("p", "status", "Get ready tonight so tomorrow starts clean."));
    var t1 = tomorrow(), all = openRecords();
    var meet = all.filter(function (r) { return has(r, "meet") && !has(r, "followup") && r.deadline === t1; }).sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
    var due = all.filter(function (r) { return r.deadline === t1 && transferOnly(r); }).sort(byScore);
    var back = records().filter(function (r) { return r.status === "Snoozed" && r.snoozeUntil === t1; });
    var arrivals = (ha() && ha().tomorrowIns) || [];
    var chase = all.filter(function (r) { return has(r, "chase"); }).sort(byScore);
    p.append(el("p", "cp-sum", plural(meet.length, "meeting") + " · " + plural(due.length, "task") + " due · " + plural(arrivals.length, "arrival") + " · " + plural(back.length, "snoozed item") + " coming back · " + plural(chase.length, "chase")));
    briefTools(p, "tomorrow", function () {
      var L = ["Tomorrow Prep, " + niceDay(t1), ""];
      L = L.concat(listText("Meetings to prepare", meet, function (r) { return r.title + " (" + r.summary + ")"; })).concat(listText("Tasks due", due)).concat(listText("People to chase first thing", chase, function (r) { return (r.person || r.source) + ": " + short(r.title, 60); }));
      if (arrivals.length) { L.push("Arrivals tomorrow"); arrivals.forEach(function (g) { L.push("  - " + g.guest + ", " + g.place); }); L.push(""); }
      if (back.length) { L.push("Snoozed items coming back: " + back.length); }
      return L.join("\n").trim();
    }, "Tomorrow Prep");
    group(p, "Meetings to prepare", meet, { cap: 6, view: "meet", empty: "No meetings tomorrow." });
    group(p, "Tasks due tomorrow", due, { cap: 6, view: "today", empty: "No tasks due tomorrow." });
    group(p, "Chase first thing", chase, { cap: 5, view: "chase", empty: "Nobody to chase." });
    if (arrivals.length) { var g = el("div", "cp-grp"); g.append(el("h4", "", "Guests arriving tomorrow (" + arrivals.length + ")")); arrivals.slice(0, 8).forEach(function (a) { g.append(el("p", "cp-line", a.guest + " · " + a.place)); }); p.append(g); }
    if (back.length) { var g2 = el("div", "cp-grp"); g2.append(el("h4", "", "Snoozed items coming back (" + back.length + ")")); back.slice(0, 8).forEach(function (r) { g2.append(el("p", "cp-line", r.title)); }); p.append(g2); }
  }
  function engineView(p, k) {
    ({ morning: morningView, midday: middayView, eod: eodView, queue: queueView, tomorrow: tomorrowView }[k] || morningView)(p);
  }

  /* ---------- the 30 buttons ---------- */
  var viewBtn = function (n, label, icon, k) { return { n: n, label: label, icon: icon, view: k }; };
  var GRID = [
    { title: "See what needs you", items: [
      { n: 1, label: "Scan My Day", icon: "🔎", run: function () { runScan(true); } },
      viewBtn(2, "Today's Top 10", "⭐", "top"), viewBtn(3, "Reply Needed", "✉️", "reply"), viewBtn(4, "Chase Needed", "🔔", "chase"),
      viewBtn(5, "Waiting From Others", "⏳", "waitOthers"), viewBtn(6, "Waiting From Me", "🙋", "waitMe"), viewBtn(7, "Overdue Tasks", "⚠️", "overdue"),
      viewBtn(8, "Due Today", "📅", "today"), viewBtn(9, "Prepare Meetings", "🗓️", "meet"), viewBtn(10, "CEO Decisions", "🧭", "ceo")] },
    { title: "Do it from here", items: [
      { n: 11, label: "Draft All Replies", icon: "📝", run: function () { draftAllReplies(); } },
      { n: 12, label: "Approve And Send", icon: "✅", run: function () { approveDialog(); } },
      { n: 13, label: "Create Task", icon: "➕", run: function () { taskDialog({}); } },
      { n: 14, label: "Assign To Team", icon: "👥", run: function () { pickItem("Assign to team", null, assignDialog, "Which item do you want to hand over?"); } },
      { n: 15, label: "Create Calendar Meeting", icon: "📆", run: function () { meetingFor(selected()); } },
      { n: 16, label: "Snooze", icon: "😴", run: function () { pickItem("Snooze", null, snoozeMenu, "Which item should come back later?"); } },
      { n: 17, label: "Mark Done", icon: "✔️", run: function () { pickItem("Mark done", null, markRecDone, "Which item is finished?"); } },
      { n: 18, label: "Ask AI About This Email", icon: "🤖", run: function () { pickItem("Ask AI about an email", function (r) { return r.sourceType === "email"; }, function (r) { askAbout(r, "email"); }, "Which email?"); } },
      { n: 19, label: "Ask AI About This File", icon: "📄", run: function () { askFilePicker(); } },
      { n: 20, label: "Save Attachment To Drive", icon: "💾", run: function () { pickItem("Save an attachment to Drive", function (r) { var t = live(r).thread; return r.sourceType === "email" && (!t || t.att > 0); }, attachDialog, "Which email has the attachment?"); } }] },
    { title: "WyzRent areas", items: [
      viewBtn(21, "Guest Issues", "🛎️", "guest"), viewBtn(22, "Owner Issues", "🏠", "owner"), viewBtn(23, "Maintenance Issues", "🛠️", "maint"), viewBtn(24, "Cleaning Issues", "🧹", "clean"),
      viewBtn(25, "Pricing / Revenue Issues", "📈", "pricing"), viewBtn(26, "Accounting / Wafeq Issues", "🧾", "acct"), viewBtn(27, "Owner Acquisition Leads", "🤝", "acq"), viewBtn(28, "WhatsApp Follow-Ups", "💬", "wa")] },
    { title: "Send and wrap up", items: [
      { n: 29, label: "Send To Command Center", icon: "📤", run: function () { pickItem("Send to Command Center", null, ccDialog, "Which item should go to the Command Center?"); } },
      { n: 30, label: "End-Of-Day Wrap", icon: "🌙", run: function () { V.engine = "eod"; render(); scrollPanel(); } }] }
  ];
  function askFilePicker() {
    var cur = selected();
    if (cur && cur.sourceType === "file") { askAbout(cur, "file"); return; }
    var files = (drive.state === "ok" ? drive.files : []).slice(0, 12);
    var host = infoOpen("Ask AI about a file");
    var fr = openRecords().filter(function (r) { return r.sourceType === "file"; });
    if (!files.length && !fr.length) {
      note(host, drive.state === "ok" ? "No recent files found. Open a file from Documents and use Ask AI about it there." : "Google Drive is not connected yet. Connect it, then your recent files show here.", false);
      if (drive.state !== "ok") host.append(B("Connect Google Drive", function () { infoClose(); connectGoogle(true); }, "solid"));
      return;
    }
    note(host, "Choose a file. The AI reads it only when you ask a question.", false);
    files.forEach(function (f) {
      var row = el("div", "item"); row.append(el("span", "dot none")); var m = el("div", "main");
      m.append(el("span", "t", f.t), el("span", "m", kindOf(f) + (f.mod ? " · changed " + fmtWhen(f.mod) : "")));
      m.append(B("Ask AI about it", function () { infoClose(); if (fileKind(f.mime, f.t)) openFileAI(f.t, function () { return mcp.callTool("Google Drive", "read_file", { fileId: f.id, mimeType: f.mime }, { cache: false }).then(function (x) { return x.payload; }); }); else window.open(f.link || "https://drive.google.com/file/d/" + f.id + "/view", "_blank", "noopener"); }, "solid"));
      row.append(m); host.append(row);
    });
  }
  function gridBtn(g) {
    var b = el("button", "cp-gb"); b.type = "button"; b.dataset.n = String(g.n);
    b.append(el("span", "ic", g.icon), el("span", "lb", g.label));
    if (g.view) { var n = rowsFor(g.view).length; b.append(el("b", "ct", String(n))); b.setAttribute("aria-pressed", String(!V.engine && V.view === g.view)); b.setAttribute("aria-label", g.label + ", " + n); }
    b.title = g.n + ". " + g.label;
    b.onclick = function () { if (g.view) gotoView(g.view); else g.run(); };
    return b;
  }
  function grid() {
    var w = el("section", "cp-grid"); w.id = "cpGrid"; w.setAttribute("aria-label", "All actions");
    var head = el("div", "cp-ph"); head.append(el("h3", "", "All 30 actions")); w.append(head);
    var cur = selected();
    var sl = el("p", "status cp-sel"); sl.id = "cpSel";
    if (cur) { sl.append(document.createTextNode("Selected item: "), el("b", "", short(cur.title, 70)), document.createTextNode(" ")); sl.append(B("Clear", function () { sel = ""; render(); }, "ghost")); }
    else sl.textContent = "Buttons 14 to 20 and 29 act on one item. Tap an item first, or the button will ask you to choose one.";
    w.append(sl);
    GRID.forEach(function (grp) { var g = el("div", "cp-gg"); g.append(el("h4", "", grp.title)); var row = el("div", "cp-gr"); grp.items.forEach(function (it) { row.append(gridBtn(it)); }); g.append(row); w.append(g); });
    return w;
  }
  function overview() {
    var d = el("details", "cp-over"); d.append(el("summary", "", "All sections at a glance"));
    CORE.filter(function (k) { return k !== "top"; }).forEach(function (k) {
      var v = VIEW(k), rows = rowsFor(k), g = el("div", "cp-grp"); g.append(el("h4", "", v.label + " (" + rows.length + ")"));
      if (!rows.length) g.append(el("p", "status", "Nothing."));
      rows.slice(0, 3).forEach(function (r) { g.append(card(r, true)); });
      if (rows.length > 3) g.append(B("See all " + rows.length, function () { gotoView(k); }, "ghost"));
      d.append(g);
    });
    return d;
  }

  /* ---------- Setup & Admin (technical details live only here) ---------- */
  var VENV = "https://vercel.com/d?to=" + encodeURIComponent("/[team]/[project]/settings/environment-variables");
  var TECH = {
    Gmail: ["Google sign-in with the Gmail scopes (readonly, compose, modify).", "Google Cloud console: enable the Gmail API and list the scopes. Client ID is in docs/config.js."],
    Calendar: ["Google sign-in with the Calendar scopes (readonly, events).", "Enable the Google Calendar API."],
    Drive: ["Google sign-in with the Drive scopes (metadata.readonly, readonly, file).", "Enable the Google Drive API."],
    Todoist: ["A Todoist API token pasted by the user (Todoist, Settings, Integrations, Developer).", "Stored on the device. The built-in task list works without it."],
    "WhatsApp Business": ["Vercel variables WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET. Optional WHATSAPP_VIEWERS. Needs Upstash Redis storage.", "Webhook address: " + location.origin + "/api/whatsapp (subscribe to messages in Meta, WhatsApp, Configuration)."],
    Hostaway: ["Vercel variables HOSTAWAY_ACCOUNT_ID and HOSTAWAY_API_KEY. Optional HOSTAWAY_CITY and HOSTAWAY_VIEWERS.", "Hostaway, Settings, Hostaway API."],
    Wafeq: ["Vercel variable WAFEQ_API_KEY. Optional WAFEQ_VIEWERS.", "Wafeq, Settings, Developers. Not yet tested against a live Wafeq account: if a field name differs, edit api/wafeq.js (slim)."],
    PriceLabs: ["Vercel variable PRICELABS_API_KEY. Optional PRICELABS_VIEWERS.", "PriceLabs, Account Settings, API Details. Not yet tested against a live PriceLabs account: edit api/pricelabs.js if a field differs."],
    "Command Center": ["docs/config.js: COMMAND_CENTER_URL (send an item, POST) and COMMAND_CENTER_READ_URL (read your actions, GET).", "The read address must answer GET with Authorization: Bearer <Google token> and JSON {\"actions\":[{id,title,owner,status,due,priority,url,summary}]}. Status: open, assigned, overdue, blocked or completed."],
    AI: ["Vercel variable ANTHROPIC_API_KEY (shared) or the person's own key under Settings. Optional OPENAI_API_KEY.", "See EXECUTION-PAGE.md, Claude for everyone."],
    Microsoft: ["docs/config.js: MS_CLIENT_ID (Azure app registration).", "See EXECUTION-PAGE.md, Microsoft."]
  };
  function openAdmin(name) {
    V.admin = true; V.adminFocus = name || ""; render();
    var d = $("cpAdmin"); if (d) { d.open = true; d.scrollIntoView({ behavior: "smooth", block: "start" }); }
  }
  function adminBox() {
    var d = el("details", "cp-admin"); d.id = "cpAdmin"; d.open = !!V.admin;
    var sm = el("summary", "", "Setup & Admin"); d.append(sm);
    d.ontoggle = function () { V.admin = d.open; if (d.open && !d.querySelector(".cp-ab")) render(); };
    if (!d.open) return d;
    var body = el("div", "cp-ab");
    body.append(el("p", "status", "Technical details for whoever sets this page up. You do not need anything here to use the cockpit."));
    /* sources */
    var h1 = el("h4", "", "Your sources"); body.append(h1);
    connList().forEach(function (c) {
      var t = TECH[c.name] || ["", ""], row = el("div", "cp-ar" + (V.adminFocus === c.name || (V.adminFocus === "WhatsApp" && c.name === "WhatsApp Business") ? " focus" : ""));
      var top = el("div", "cp-art"); top.append(el("b", "", c.name), el("span", "pill " + c.cls, c.st)); row.append(top);
      row.append(el("p", "status", c.say));
      row.append(el("p", "status", "Needs: " + t[0]), el("p", "status", t[1]));
      var key = c.name === "WhatsApp Business" ? "WhatsApp" : c.name, x = EXT[key];
      if (x && x.missing && x.missing.length) row.append(el("p", "status err", "Still missing: " + x.missing.join(", ")));
      var acts = el("div", "acts"); if (c.step) acts.append(B(c.step[0], c.step[1], "solid"));
      if (/Vercel/.test(t[0])) acts.append(link("Vercel settings", VENV));
      if (c.name === "Command Center") acts.append(B("Copy what Abbas needs", function (b) { navigator.clipboard.writeText(ccSpec()).then(function () { b.textContent = "Copied"; }).catch(function () { b.textContent = "Select the text"; }); }, "ghost"));
      row.append(acts); body.append(row);
    });
    /* preferences */
    body.append(el("h4", "", "Rules"));
    var cd = select([["2", "2 days"], ["3", "3 days"]], String(chaseDays())); cd.onchange = function () { CP().chaseDays = +cd.value; persist(); schedule(); };
    body.append(labelFor("Chase an email after no reply for", cd));
    var big = inp("number", String(+CP().ceoAmount || 10000)); big.min = "0"; big.step = "500"; big.onchange = function () { CP().ceoAmount = Math.max(0, +big.value || 10000); persist(); schedule(); };
    body.append(labelFor("A bill at or above this amount needs your approval (CEO Decisions)", big));
    var uo = el("div", "cp-uo"); uo.append(el("span", "status", "Usual owner by area. Used to suggest who to hand an item to."));
    Object.keys(AREAS).forEach(function (k) {
      var s = select([["", "No one"]].concat(TEAM.map(function (n) { return [n, n]; })), (CP().defaultOwner || {})[k] || "");
      s.onchange = function () { CP().defaultOwner = CP().defaultOwner || {}; if (s.value) CP().defaultOwner[k] = s.value; else delete CP().defaultOwner[k]; persist(); };
      uo.append(labelFor(AREAS[k], s));
    });
    body.append(uo);
    body.append(el("h4", "", "Team contacts"), el("p", "status", "Used when you assign or nudge. Saved on this device and in your private page data."));
    TEAM.forEach(function (n) {
      var c = contactOf(n), row = el("div", "cp-tc"); row.append(el("b", "", n));
      var e = inp("email", c.email, "Email"), p = inp("tel", c.phone, "WhatsApp number");
      var sv = function () { saveContact(n, e.value.trim(), p.value.trim()); }; e.onchange = sv; p.onchange = sv; row.append(e, p); body.append(row);
    });
    /* records */
    body.append(el("h4", "", "Your action records"));
    var all = records(), openN = all.filter(open).length;
    body.append(el("p", "status", all.length + " saved (" + openN + " open). Each one keeps its source, owner, date, status and notes."));
    var ra = el("div", "acts");
    ra.append(B("Download as a file", function () {
      var blob = new Blob([JSON.stringify(all.map(function (r) { return { id: r.id, title: r.title, source: r.source, sourceLink: r.link, sourceType: r.sourceType, person: r.person, summary: r.summary, nextStep: r.next, owner: r.owner, deadline: r.deadline, status: r.status, priority: r.priority, created: new Date(r.created || 0).toISOString(), lastUpdated: new Date(r.updated || r.seen || r.created || 0).toISOString(), notes: r.notes || "" }; }), null, 2)], { type: "application/json" });
      var a = el("a"); a.href = URL.createObjectURL(blob); a.download = "wyz-action-records-" + today() + ".json"; document.body.append(a); a.click(); setTimeout(function () { a.remove(); URL.revokeObjectURL(a.href); }, 500);
    }));
    ra.append(B("Remove finished records", function () { var A = ACT(); Object.keys(A).forEach(function (k) { if (A[k].status === "Done") delete A[k]; }); persist(); render(); }, "ghost"));
    ra.append(B("Reset all records", function () { if (confirm("Delete every saved action record? The next scan creates them again from your sources.")) { state.actions = {}; persist(); rebuild(); } }, "ghost"));
    body.append(ra);
    /* shortcuts */
    body.append(el("h4", "", "Other pages"));
    var go = el("div", "acts");
    go.append(B("Settings", function () { show("t-conn"); }), B("Install on phone or computer", function () { show("t-inst"); }), B("System check", function () { show("t-today"); var t = $("c-test"); if (t) t.scrollIntoView({ behavior: "smooth" }); }), link("Admin page", "admin"), B("Today (inbox, week, tasks, documents)", function () { show("t-today"); }, "ghost"));
    body.append(go);
    var st = el("div"); st.id = "cpSelf";
    body.append(el("h4", "", "Test the cockpit"), el("p", "status", "Checks that all 30 buttons are wired and that assigning, snoozing and finishing an item work. It uses a temporary test item and removes it afterwards. It never sends anything."), B("Run the check", function () { selfCheck(); }, "solid"), st);
    if (V.self) {
      st.append(el("p", "status " + (V.self.pass === V.self.res.length ? "" : "err"), V.self.pass + " of " + V.self.res.length + " checks passed."));
      V.self.res.forEach(function (x) { st.append(el("p", "status", (x[1] ? "✓ " : "✗ ") + x[0] + (x[2] ? " (" + x[2] + ")" : ""))); });
    }
    d.append(body); return d;
  }
  function ccSpec() {
    return "Command Center link for the WYZ Execution Page\n\n1. SEND (button: Send To Command Center). Set COMMAND_CENTER_URL in docs/config.js.\nPOST <address>  Header: Authorization: Bearer <Google access token>  (verify with https://oauth2.googleapis.com/tokeninfo and allow only wyzrent.com and owner accounts)\nBody (JSON): {\"type\":\"action_item\",\"title\":\"\",\"summary\":\"\",\"priority\":\"critical|high|medium|low\",\"department\":\"\",\"owner\":\"\",\"due\":\"YYYY-MM-DD\",\"from\":\"\",\"subject\":\"\",\"link\":\"\",\"sentBy\":\"\",\"createdAt\":\"ISO date\"}\nAnswer: {\"url\":\"link to the new item\"}\n\n2. READ (assigned, overdue, blocked and completed actions). Set COMMAND_CENTER_READ_URL in docs/config.js.\nGET <address>  Header: Authorization: Bearer <Google access token>\nAnswer: {\"actions\":[{\"id\":\"\",\"title\":\"\",\"owner\":\"name\",\"status\":\"open|assigned|overdue|blocked|completed\",\"due\":\"YYYY-MM-DD\",\"priority\":\"critical|high|medium|low\",\"url\":\"\",\"summary\":\"\"}]}\nReturn only the signed-in person's own actions, plus any they assigned to others.\nBoth addresses must allow requests from the page's address (CORS).";
  }

  /* ---------- the built-in check (Stage 11) ---------- */
  function selfCheck() {
    quiet = true;
    var res = [], ok = function (name, pass, why) { res.push([name, !!pass, why || ""]); };
    var btns = []; GRID.forEach(function (g) { g.items.forEach(function (i) { btns.push(i); }); });
    ok("30 buttons defined", btns.length === 30, btns.length + " found");
    ok("Buttons numbered 1 to 30", btns.every(function (b, i) { return b.n === i + 1; }));
    ok("Every button does something", btns.every(function (b) { return b.view ? !!VIEW(b.view).label : typeof b.run === "function"; }));
    ok("Every button is on the screen", document.querySelectorAll(".cp-gb").length === 30, document.querySelectorAll(".cp-gb").length + " on screen");
    ok("Cockpit is the first tab", document.querySelector('[role="tablist"] .tab, nav.tabs .tab').id === "t-cockpit");
    var A = ACT(), id = "manual:selfcheck";
    var t0 = state.tasks ? state.tasks.length : 0;
    A[id] = { id: id, title: "Self-check item", source: "Manual", sourceType: "manual", link: "", person: "", summary: "", why: "", next: "Test", verb: "Do today", owner: "Me", deadline: today(), status: "New", priority: "Medium", created: Date.now(), notes: "", cats: ["waitMe"], manual: true, edited: {} };
    var r = A[id];
    var other = TEAM.filter(function (n) { return !mine(n); })[0]; try { assignTo(r, other, tomorrow(), "test"); ok("Assign to team", r.owner === other && r.status === "Assigned" && rowsFor("team").some(function (x) { return x.id === id; })); } catch (e) { ok("Assign to team", false, e.message); }
    try { takeBack(r); ok("Take back", mine(r.owner) && r.status !== "Assigned"); } catch (e) { ok("Take back", false, e.message); }
    try { r.status = "Snoozed"; r.snoozeUntil = addDays(2); ok("Snoozed item leaves the list", !open(r)); r.snoozeUntil = today(); ok("Snoozed item comes back on its day", open(r) === true); r.status = "New"; r.snoozeUntil = ""; } catch (e) { ok("Snooze", false, e.message); }
    try { r.status = "Done"; r.doneAt = Date.now(); ok("Done item leaves the list", !open(r) && rowsFor("done").some(function (x) { return x.id === id; })); } catch (e) { ok("Mark done", false, e.message); }
    ok("Records keep every required field", ["id", "title", "source", "link", "sourceType", "person", "summary", "next", "owner", "deadline", "status", "priority", "created", "notes"].every(function (k) { return k in r; }));
    ok("Statuses and priorities are the agreed ones", STATUSES.length === 8 && PRIOS.join() === "Critical,High,Medium,Low");
    ok("Email drafting never sends", String(draftOne).indexOf("send_message") < 0);
    ok("Nothing here sends mail by itself", [draftWithAI, draftAllReplies, approveDialog, primary, nudgeRec, assignDialog].every(function (f) { return String(f).indexOf("send_message") < 0; }), "sending happens only in the writing window");
    if (state.tasks) state.tasks = state.tasks.filter(function (x) { return x.from !== id; });
    delete A[id]; sel = sel === id ? "" : sel; persist();
    V.self = { pass: res.filter(function (x) { return x[1]; }).length, res: res };
    quiet = false; render();
    return res;
  }

  /* ---------- put it all together ---------- */
  function render() {
    root = root || $("cpRoot"); if (!root) return;
    var keepScroll = window.scrollY, focusId = document.activeElement && document.activeElement.id;
    root.replaceChildren();
    var wrap = el("div", "cp");
    wrap.append(header());
    if (!G.connected()) {
      var w = el("div", "card note cp-welcome"); var pad = el("div", "pad");
      pad.append(el("h3", "", "Connect your accounts to start"), el("p", "sub", "Sign in once. Then Scan My Day reads your email, calendar, files, tasks and WyzRent systems, and shows what to answer, chase, delegate and do today."));
      var a = el("div", "acts"); a.append(B("Continue with Google", function () { var b = $("wBtn"); if (b && !b.disabled) b.click(); else { show("t-today"); showWelcome(); } }, "solid"));
      try { if (G.msConfigured()) a.append(B("Continue with Microsoft", function () { $("wMs").click(); })); } catch (e) {}
      pad.append(a); w.append(pad); wrap.append(w);
    }
    wrap.append(connStrip(), rhythm(), bannerNow(), chipsRow(), panel(), grid(), overview(), adminBox());
    root.append(wrap);
    if (focusId && $(focusId)) try { $(focusId).focus({ preventScroll: true }); } catch (e) {}
    window.scrollTo(0, keepScroll);
  }
  function bannerNow() {
    var s = slot(), n = rowsFor("top").length, w = el("p", "status cp-now");
    var txt = s === "morning" ? "Good morning. Your Morning Brief is ready." : s === "midday" ? "It is midday. Time for a quick check on what is still open." : "The day is winding down. Your End-Of-Day Wrap and Tomorrow Prep are ready.";
    w.append(document.createTextNode(txt + " "));
    var key = s === "morning" ? "morning" : s === "midday" ? "midday" : "eod";
    w.append(B("Open " + ENGINES.filter(function (e) { return e[0] === key; })[0][1], function () { V.engine = key; render(); scrollPanel(); }, "ghost"));
    if (s === "eod") w.append(document.createTextNode(" "), B("Tomorrow Prep", function () { V.engine = "tomorrow"; render(); scrollPanel(); }, "ghost"));
    return w;
  }

  /* ---------- hooks into the rest of the page ---------- */
  ["renderBoard", "renderTasks", "renderCal", "renderDocs", "renderSetup", "renderResearch"].forEach(function (n) {
    var f = window[n]; if (typeof f !== "function") return;
    window[n] = function () { var r = f.apply(this, arguments); try { schedule(); } catch (e) {} return r; };
  });
  var origShow = window.show;
  if (typeof origShow === "function") {
    window.show = function (tid) {
      var r = origShow.apply(this, arguments);
      document.body.classList.toggle("cp-on", tid === "t-cockpit");
      if (tid === "t-cockpit") { if (dirty) { dirty = false; rebuild(); } else { try { render(); } catch (e) {} } }
      return r;
    };
  }
  function heroCompact() {
    var row = document.querySelector(".herorefresh"); if (!row || $("cpHeroMore")) return;
    ["refresh", "newMailBtn"].forEach(function (id) { var b = $(id); if (b) b.setAttribute("data-keep", "1"); });
    var f = $("fresh"); if (f) f.setAttribute("data-keep", "1");
    var more = el("button", "btn", "More ▾"); more.id = "cpHeroMore"; more.type = "button"; more.setAttribute("aria-expanded", "false");
    more.onclick = function () { var on = document.body.classList.toggle("cp-more"); more.setAttribute("aria-expanded", String(on)); more.textContent = on ? "Less ▴" : "More ▾"; };
    row.insertBefore(more, $("refresh").nextSibling);
    document.body.classList.add("cp-on");
  }

  /* a gentle reminder at the start of each part of the day, when the page is open and alerts are on */
  function tick() {
    if (!G.connected() || !state) return;
    var c = CP(), s = slot(), key = today() + s;
    c.said = c.said || {};
    if (c.said[key]) return;
    c.said[key] = 1;
    Object.keys(c.said).forEach(function (k) { if (k.slice(0, 10) !== today()) delete c.said[k]; });
    persist();
    try {
      if (state.alertsOn && "Notification" in window && Notification.permission === "granted" && typeof showAlert === "function") {
        var n = rowsFor("top").length;
        showAlert(s === "morning" ? "Morning Brief is ready" : s === "midday" ? "Midday Check" : "End-Of-Day Wrap", { body: n + " thing" + (n === 1 ? "" : "s") + " need you. Open the Follow-Up Cockpit.", tag: "wyz-cp-" + s });
      }
    } catch (e) {}
  }

  function start() {
    root = $("cpRoot"); if (!root) return;
    heroCompact();
    render();
    var tries = 0;
    (function wait() {
      var on = false; try { on = G.connected(); } catch (e) {}
      if (!on) { if (++tries < 600) setTimeout(wait, 3000); render(); return; }
      setTimeout(function () { loadExt(false).then(function () { rebuild(); }); loadPast().then(function () { schedule(); }); }, 1500);
      setInterval(function () { if (!document.hidden && G.connected()) loadExt(false).then(schedule); }, 10 * 60000);
      setInterval(tick, 60000); setTimeout(tick, 8000);
    })();
    rebuild();
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("info").hidden) infoClose(); });
    document.addEventListener("click", function (e) { document.querySelectorAll("details.cp-more[open]").forEach(function (d) { if (!d.contains(e.target)) d.open = false; }); });
  }
  window.WYZ_CP = { scan: runScan, rebuild: rebuild, render: render, records: records, open: openRecords, grid: GRID, views: VIEWS, selfCheck: selfCheck, assign: assignTo, snooze: snoozeRec, done: markRecDone, ext: EXT, collect: collect, merge: mergeSignals };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else setTimeout(start, 0);
})();
