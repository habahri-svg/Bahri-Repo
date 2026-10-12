/* 3.45 My Life: the personal side of the page.
   - Work and Life switch at the top. Life shows the My Life page, Work shows Today.
   - My Life keeps records (family, plans, and later bills, home and car, health, property, deals, documents, travel...)
     in one small private file in your own Google Drive, so phone and computer show the same thing.
   - Groups (Family, Team, your own) fill the To line in one tap. Sending still needs Send, then Confirm.
   - Backup to Drive every week, and export to Excel or PDF any time.
   Everything shows as plain text. Nothing here sends anything by itself. */
(function () {
  "use strict";
  if (typeof $ !== "function" || typeof el !== "function") return;
  var FILE = "Execution Page - My Life.json", FOLDER = "Execution Page data", BKFOLDER = "Execution Page backups";

  /* ---------- the collections ---------- */
  /* field: [key, label, type, options]. Keys t (title), d (date) and n (notes) are shared by all. */
  var COLL = {
    family: { name: "Family", icon: "👪", repeat: "yearly", dateLabel: "Birthday",
      fields: [["t", "Name", "text"], ["rel", "Relation", "text"], ["d", "Birthday", "date"], ["email", "Email", "email"], ["phone", "Phone", "tel"], ["n", "Notes", "textarea"]] },
    plans: { name: "Family plans", icon: "🗓️", dateLabel: "When",
      fields: [["t", "What", "text"], ["d", "When", "date"], ["who", "Who's coming", "text"], ["n", "Notes", "textarea"]] }
  };
  window.wyzLifeCollections = COLL;   /* later releases add more */

  var L = function () {
    var l = state.life = state.life || {};
    l.items = l.items || {}; l.groups = l.groups || {}; l.gu = l.gu || 0;
    return l;
  };
  var meta = function () { return (state.lifeMeta = state.lifeMeta || {}); };
  var live = function (c) { var it = L().items; return Object.keys(it).map(function (k) { return it[k]; }).filter(function (x) { return x && !x.x && (!c || x.c === c); }); };
  var nid = function () { return "l" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };
  var pad = function (n) { return String(n).padStart(2, "0"); };
  var ymdL = function (d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
  var today = function () { return ymdL(new Date()); };
  var say = function (t) { try { toast(t); } catch (e) {} };
  var btn = function (label, cls, fn) { var b = el("button", cls || "btn small", label); b.type = "button"; if (fn) b.onclick = fn; return b; };
  var dubaiStamp = function () { var d = new Date(Date.now() + 4 * 3600000); return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()) + "_" + pad(d.getUTCHours()) + pad(d.getUTCMinutes()); };
  var dubaiNice = function () { return new Date().toLocaleString("en-GB", { timeZone: "Asia/Dubai", weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); };

  /* next date an item is due: birthdays and yearly items repeat, others are one-off */
  function nextDate(x) {
    if (!x || !x.d || !/^\d{4}-\d{2}-\d{2}$/.test(x.d)) return "";
    var rep = x.r || (COLL[x.c] && COLL[x.c].repeat) || "";
    if (!rep) return x.d;
    var t = today(), y = +t.slice(0, 4), md = x.d.slice(4);
    if (rep === "yearly") { var n = y + md; return n >= t ? n : (y + 1) + md; }
    /* monthly and quarterly: the next date on or after today, counted from the date you set */
    if (rep === "monthly" || rep === "quarterly") {
      if (x.d >= t) return x.d;
      var step = rep === "monthly" ? 1 : 3, base = new Date(x.d + "T00:00:00"), day = base.getDate(), k = 0, nd = x.d;
      while (nd < t && k < 600) { k += step; var dt = new Date(base.getFullYear(), base.getMonth() + k, 1); dt.setDate(Math.min(day, new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate())); nd = ymdL(dt); }
      return nd;
    }
    return x.d;
  }
  var daysTo = function (d) { if (!d) return 9999; return Math.round((Date.parse(d + "T00:00:00") - Date.parse(today() + "T00:00:00")) / 86400000); };
  function dueLabel(x) {
    var d = nextDate(x); if (!d) return null; var n = daysTo(d);
    var txt = n === 0 ? "Today" : n === 1 ? "Tomorrow" : n < 0 ? (-n) + " day" + (n === -1 ? "" : "s") + " late" : n <= 14 ? "In " + n + " days" : new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    var s = el("span", "due" + (n < 0 ? " late" : n <= 7 ? " soon" : ""), (COLL[x.c] && COLL[x.c].repeat === "yearly" && x.c === "family" ? "🎂 " : "") + txt);
    return s;
  }
  window.wyzLifeDue = function (days) {
    var closed = ["Won", "Lost", "On hold", "Signed"];
    return live().map(function (x) { return { x: x, d: nextDate(x) }; }).filter(function (o) { var n = daysTo(o.d); var CC = COLL[o.x.c] || {}; if (CC.noDue) return false; if (CC.dueFuture && n < 0) return false;
      return o.d && n <= (days || 14) && n >= -60 && !o.x.done && o.x.c !== "docs" || (o.x.c === "docs" && o.d && n <= 30 && n >= -7); }).filter(function (o) { return closed.indexOf((o.x.f || {}).stage) < 0; }).sort(function (a, b) { return a.d < b.d ? -1 : 1; });
  };

  /* ---------- saving: this device right away, your Drive a moment later ---------- */
  var saveT = 0, syncing = false, syncNote = "";
  function changed() { persist(); clearTimeout(saveT); saveT = setTimeout(syncNow, 2500); render(); }
  function merge(remote) {
    var l = L(), changedAny = false;
    if (!remote || typeof remote !== "object") return false;
    var ri = remote.items || {};
    Object.keys(ri).forEach(function (k) { var a = l.items[k], b = ri[k]; if (b && (!a || (+b.u || 0) > (+a.u || 0))) { l.items[k] = b; changedAny = true; } });
    if (remote.groups && (+remote.gu || 0) > (+l.gu || 0)) { l.groups = remote.groups; l.gu = remote.gu; changedAny = true; }
    /* forget deleted items after 90 days */
    var old = Date.now() - 90 * 864e5; Object.keys(l.items).forEach(function (k) { var x = l.items[k]; if (x && x.x && (+x.u || 0) < old) delete l.items[k]; });
    return changedAny;
  }
  async function syncNow() {
    if (syncing) { clearTimeout(saveT); saveT = setTimeout(syncNow, 2000); return; }
    var on = false; try { on = G.connected() && !!mcp; } catch (e) {}
    if (!on) { syncNote = "Saved on this device. Sign in to keep a copy in your Drive."; drawSync(); return; }
    syncing = true; syncNote = "Saving to your Drive..."; drawSync();
    try {
      var m = meta();
      var got = (await mcp.callTool("Google Drive", "get_text", { name: FILE, fileId: m.fileId || "" }, { cache: false })).payload || {};
      if (got.text) { try { if (merge(JSON.parse(got.text))) { persist(); render(); } } catch (e) {} }
      var body = JSON.stringify({ app: "WYZ Execution Page", v: 1, saved: new Date().toISOString(), items: L().items, groups: L().groups, gu: L().gu });
      var put = (await mcp.callTool("Google Drive", "put_text", { name: FILE, folder: FOLDER, fileId: got.id || "", text: body }, { cache: false })).payload || {};
      m.fileId = put.id || got.id || m.fileId; m.syncAt = Date.now(); persist();
      syncNote = "Saved to your Drive at " + new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Dubai", hour: "2-digit", minute: "2-digit" }) + ". Your phone and computer share it.";
    } catch (e) {
      syncNote = e && e.code === "consent_required" ? "Saved on this device. To keep it in your Drive too, sign out and in again and tick Drive." : "Saved on this device. Drive didn't answer (" + clip((e && e.message) || "unknown reason", 60) + "), it tries again on the next change.";
      if (e && /not found|404/i.test(String(e.message || ""))) meta().fileId = "";
    }
    syncing = false; drawSync(); autoBackup();
  }
  window.wyzLifeChanged = changed;
  window.wyzLifeItems = live;
  window.wyzLifeNext = nextDate;
  window.wyzLifeSave = function (x) { x.u = Date.now(); L().items[x.id] = x; changed(); };

  /* ---------- groups ---------- */
  function teamDefault() { try { return teamList().map(function (p) { return p.email; }); } catch (e) { return []; } }
  function groups() {
    var g = Object.assign({}, L().groups);
    if (!g.Team) { var t = teamDefault(); if (t.length) g.Team = t; }
    return g;
  }
  window.wyzServerGroups = function (sg) {
    if (!sg || typeof sg !== "object") return;
    var l = L(), add = false;
    Object.keys(sg).forEach(function (k) { if (!l.groups[k] && Array.isArray(sg[k]) && sg[k].length) { l.groups[k] = sg[k].slice(0, 50); add = true; } });
    if (add) { l.gu = Date.now(); changed(); }
    drawGroupChips();
  };
  function drawGroupChips() {
    var h = $("thrGroups"); if (!h) return; h.replaceChildren();
    var g = groups();
    Object.keys(g).forEach(function (name) {
      var list = (g[name] || []).filter(function (e) { return /^\S+@\S+\.\S+$/.test(e); }); if (!list.length) return;
      var b = el("button", "chip"); b.type = "button"; b.append(el("span", "", (name === "Family" ? "👪 " : name === "Team" ? "👥 " : "✉️ ") + name), el("b", "", String(list.length)));
      b.title = "Add " + list.join(", ");
      b.onclick = function () {
        var to = $("thrTo"), have = String(to.value || "").split(/[,;]/).map(function (s) { return s.trim(); }).filter(Boolean);
        var lc = have.map(function (s) { return (addrOf(s) || s).toLowerCase(); });
        list.forEach(function (e) { if (lc.indexOf(e.toLowerCase()) < 0) { have.push(e); lc.push(e.toLowerCase()); } });
        to.value = have.join(", "); to.dispatchEvent(new Event("input"));
        say(name + " added to To. Check the list, then Send and Confirm.");
      };
      h.append(b);
    });
  }
  function emailGroup(name) {
    var g = groups()[name] || [];
    if (!g.length) { say("The " + name + " group is empty. Add people under My Life, Groups."); return; }
    try { openCompose({ to: g.join(", ") }); } catch (e) {}
  }

  /* ---------- the page ---------- */
  var openForm = null;   /* {c, id} of the form that is open */
  function form(c, x, host) {
    var C = COLL[c], f = el("div", "lform"), inputs = {};
    C.fields.forEach(function (fd) {
      var lab = el("label", fd[2] === "textarea" ? "full" : ""); lab.append(el("span", "", fd[1]));
      var inp = fd[2] === "textarea" ? el("textarea") : fd[2] === "select" ? el("select") : el("input");
      if (fd[2] === "select") (fd[3] || []).forEach(function (o) { inp.append(new Option(o, o)); });
      else if (fd[2] !== "textarea") inp.type = fd[2] === "money" ? "number" : fd[2];
      if (fd[2] === "money") inp.step = "0.01";
      if (fd[2] === "textarea") inp.rows = 2;
      var v = x ? (fd[0] === "t" || fd[0] === "d" || fd[0] === "n" ? x[fd[0]] : (x.f || {})[fd[0]]) : "";
      inp.value = v == null ? "" : v; inp.setAttribute("aria-label", fd[1]);
      inputs[fd[0]] = inp; lab.append(inp); f.append(lab);
    });
    if (!C.repeat && C.allowRepeat) {
      var lr = el("label"); lr.append(el("span", "", "Repeats")); var rp = el("select"); rp.setAttribute("aria-label", "Repeats"); [["", "No"], ["monthly", "Every month"], ["quarterly", "Every 3 months"], ["yearly", "Every year"]].forEach(function (o) { rp.append(new Option(o[1], o[0])); }); rp.value = (x && x.r) || ""; lr.append(rp); f.append(lr); inputs.__r = rp;
    }
    var msg = el("p", "status err full", "");
    var acts = el("div", "acts full");
    acts.append(btn(x ? "Save" : "Add", "btn small solid", function () {
      var t = String(inputs.t.value || "").trim(); if (!t) { msg.textContent = "Add a " + C.fields[0][1].toLowerCase() + " first."; inputs.t.focus(); return; }
      var it = x ? Object.assign({}, x) : { id: nid(), c: c, f: {} };
      it.f = Object.assign({}, it.f || {});
      C.fields.forEach(function (fd) { var v = String(inputs[fd[0]].value || "").trim(); if (fd[0] === "t" || fd[0] === "d" || fd[0] === "n") it[fd[0]] = v; else it.f[fd[0]] = v; });
      if (inputs.__r) it.r = inputs.__r.value;
      it.u = Date.now(); L().items[it.id] = it; openForm = null; changed(); say(x ? "Saved." : "Added.");
    }), btn("Cancel", "btn small ghost", function () { openForm = null; render(); }));
    f.append(msg, acts); host.append(f);
    setTimeout(function () { try { inputs.t.focus(); } catch (e) {} }, 30);
  }
  function del(x) { if (!confirm("Delete \"" + x.t + "\"?")) return; x.x = 1; x.u = Date.now(); changed(); say("Deleted. It stays in your weekly backup."); }
  function row(x, extra) {
    var r = el("div", "litem"), m = el("div", "main"), a = el("div", "la");
    m.append(el("div", "lt", x.t || "(No name)"));
    var C = COLL[x.c] || { fields: [] };
    var bits = C.fields.filter(function (fd) { return fd[0] !== "t" && fd[0] !== "n" && fd[0] !== "d" && fd[2] !== "textarea" && fd[2] !== "url" && fd[0] !== "pay"; }).map(function (fd) { var v = (x.f || {})[fd[0]]; return v ? (fd[2] === "money" ? fd[1] + " " + Number(v).toLocaleString("en-GB") : v) : ""; }).filter(Boolean);
    if (bits.length) m.append(el("div", "lm", bits.join(" · ")));
    if (x.n) m.append(el("div", "lm", x.n));
    var CC = COLL[x.c] || {}, past = x.d && x.d < today();
    var plain = x.d ? new Date(x.d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
    var d = x.done ? el("span", "due", "✓ Done") : CC.noDue ? (plain ? el("span", "due", plain) : null) : (CC.dueFuture && past) ? el("span", "due", "Past · " + plain) : dueLabel(x); if (d) a.append(d);
    if (extra) extra(x, a);
    a.append(btn("Edit", "btn small ghost", function () { openForm = { c: x.c, id: x.id }; render(); }), btn("Delete", "btn small ghost", function () { del(x); }));
    r.append(m, a); return r;
  }
  function section(c, opts) {
    opts = opts || {};
    var C = COLL[c], card = el("div", "card lifesec"), pad = el("div", "pad"); card.append(pad); card.id = "life-" + c;
    var list = live(c).filter(opts.filter || function () { return true; }).sort(function (a, b) { var da = nextDate(a) || "9999", db = nextDate(b) || "9999"; return da < db ? -1 : da > db ? 1 : String(a.t).localeCompare(String(b.t)); });
    var h = el("h2"); h.append(el("span", "", C.icon + " " + C.name), el("span", "lcount", list.length ? String(list.length) : "")); pad.append(h);
    if (opts.intro) pad.append(el("p", "status", opts.intro));
    var top = el("div", "acts"); top.append(btn("＋ Add", "btn small solid", function () { openForm = { c: c, id: "" }; render(); }));
    (opts.actions || []).forEach(function (b) { top.append(b); }); pad.append(top);
    if (openForm && openForm.c === c && !openForm.id) form(c, null, pad);
    var box = el("div"); pad.append(box);
    if (!list.length && !(openForm && openForm.c === c)) box.append(el("p", "status", opts.empty || "Nothing here yet."));
    list.forEach(function (x) { if (openForm && openForm.c === c && openForm.id === x.id) form(c, x, box); else box.append(row(x, opts.extra)); });
    return card;
  }
  var digits = function (p) { return String(p || "").replace(/[^\d+]/g, ""); };
  function familyExtra(x, a) {
    var f = x.f || {};
    if (f.email && /^\S+@\S+\.\S+$/.test(f.email)) a.append(btn("✉️", "btn small", function () { try { openCompose({ to: f.email }); } catch (e) {} }));
    if (digits(f.phone).length > 6) { var c = el("a", "btn small", "📞"); c.href = "tel:" + digits(f.phone); a.append(c); var w = el("a", "btn small", "💬"); w.href = "https://wa.me/" + digits(f.phone).replace(/^\+/, ""); w.target = "_blank"; w.rel = "noopener"; a.append(w); }
  }
  var renderers = [], tops = [];   /* later releases add their sections here, in order */
  window.wyzLifeAddSection = function (fn) { renderers.push(fn); };
  window.wyzLifeAddTop = function (fn) { tops.push(fn); };

  function render() {
    var root = $("lifeRoot"); if (!root || $("p-life").hidden) { drawGroupChips(); return; }
    root.replaceChildren();
    /* due soon */
    var due = window.wyzLifeDue(14), dc = el("div", "card note lifesec"), dp = el("div", "pad"); dc.append(dp);
    var dh = el("h2"); dh.append(el("span", "", "⏰ Coming up in the next 14 days"), el("span", "lcount", due.length ? String(due.length) : "")); dp.append(dh);
    if (!due.length) dp.append(el("p", "status", "Nothing due. Birthdays, plans and renewals you add show here."));
    due.slice(0, 12).forEach(function (o) { var r = el("div", "litem"), m = el("div", "main"); m.append(el("div", "lt", o.x.t), el("div", "lm", (COLL[o.x.c] ? COLL[o.x.c].icon + " " + COLL[o.x.c].name : ""))); var a = el("div", "la"); var d = dueLabel(o.x); if (d) a.append(d); r.append(m, a); dp.append(r); });
    root.append(dc);
    tops.forEach(function (fn) { try { var n = fn(); if (n) root.append(n); } catch (e) {} });
    /* family hub */
    root.append(section("family", { intro: "The people closest to you. Birthdays repeat every year and show above a week before.", empty: "Add your family: name, relation, birthday, email and phone.", extra: familyExtra,
      actions: [btn("✉️ Email family", "btn small", function () { emailGroup("Family"); })] }));
    root.append(section("plans", { intro: "Trips, dinners, school and family events.", empty: "No plans yet." }));
    renderers.forEach(function (fn) { try { var n = fn(); if (n) root.append(n); } catch (e) {} });
    root.append(groupsCard(), backupCard());
    drawSync(); drawGroupChips();
  }
  window.wyzLifeRender = render;
  window.wyzLifeRow = row;
  window.wyzLifeOpenForm = function (c, id) { openForm = { c: c, id: id || "" }; render(); var n = $("life-" + c); if (n) n.scrollIntoView({ block: "start" }); };
  window.wyzLifeSection = section;

  function groupsCard() {
    var card = el("div", "card lifesec"), pad = el("div", "pad"); card.append(pad); card.id = "life-groups";
    pad.append(el("h2", "", "✉️ Groups"), el("p", "status", "One tap fills the To line in New email. You still check it and press Send, then Confirm."));
    var g = groups();
    Object.keys(g).forEach(function (name) {
      var r = el("div", "litem"), m = el("div", "main"), a = el("div", "la");
      m.append(el("div", "lt", name + " (" + (g[name] || []).length + ")"), el("div", "lm", (g[name] || []).join(", ")));
      a.append(btn("Email", "btn small", function () { emailGroup(name); }), btn("Edit", "btn small ghost", function () { editGroup(name); }));
      if (name !== "Team" || L().groups.Team) a.append(btn("Delete", "btn small ghost", function () { if (!confirm("Delete the group " + name + "?")) return; delete L().groups[name]; L().gu = Date.now(); changed(); }));
      r.append(m, a); pad.append(r);
    });
    pad.append(el("div", "acts")); pad.lastChild.append(btn("＋ New group", "btn small solid", function () { editGroup(""); }));
    return card;
  }
  function editGroup(name) {
    var h = infoOpen(name ? "Edit group: " + name : "New group");
    var n = el("input", "in"); n.value = name; n.placeholder = "Group name, e.g. Owners or SAMOCO lawyers"; n.setAttribute("aria-label", "Group name");
    var t = el("textarea", "in"); t.rows = 5; t.value = (groups()[name] || []).join(", "); t.placeholder = "Emails, separated by commas"; t.setAttribute("aria-label", "Emails");
    var m = el("p", "status err", "");
    var go = btn("Save group", "btn small solid", function () {
      var nn = n.value.trim().slice(0, 40); if (!nn) { m.textContent = "Give the group a name."; return; }
      var list = t.value.split(/[\s,;]+/).map(function (s) { return s.trim(); }).filter(Boolean), bad = list.filter(function (e) { return !/^\S+@\S+\.\S+$/.test(e); });
      if (bad.length) { m.textContent = "These don't look like email addresses: " + bad.join(", "); return; }
      var l = L(); if (name && name !== nn) delete l.groups[name]; l.groups[nn] = Array.from(new Set(list)); l.gu = Date.now(); infoClose(); changed(); say("Group saved.");
    });
    var a = el("div", "acts"); a.append(go);
    h.append(n, t, a, m);
  }

  /* ---------- backup and export ---------- */
  function backupCard() {
    var card = el("div", "card lifesec"), pad = el("div", "pad"); card.append(pad); card.id = "life-backup";
    pad.append(el("h2", "", "🗄️ Backup and export"));
    var s = el("p", "syncline"); s.id = "lifeSync"; pad.append(s);
    var m = meta(); pad.append(el("p", "status", m.lastBackup ? "Last backup: " + new Date(m.lastBackup).toLocaleString("en-GB", { timeZone: "Asia/Dubai", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) + " Dubai time, in the Drive folder \"" + BKFOLDER + "\". A new one is made every week by itself." : "A backup goes to your Drive every week by itself. You can make one now too."));
    var a = el("div", "acts");
    a.append(btn("Back up now", "btn small solid", function (e) { backup(false, e.target); }), btn("⬇️ Excel", "btn small", function (e) { exportXlsx(e.target); }), btn("⬇️ PDF", "btn small", function (e) { exportPdf(e.target); }));
    pad.append(a); return card;
  }
  function drawSync() { var s = $("lifeSync"); if (s) s.textContent = syncNote || (meta().syncAt ? "Saved to your Drive. Your phone and computer share it." : "Saved on this device."); }
  async function backup(auto, b) {
    if (b) { b.disabled = true; b.textContent = "Backing up..."; }
    try {
      var name = "My Life backup " + dubaiStamp() + ".json";
      await mcp.callTool("Google Drive", "put_text", { name: name, folder: BKFOLDER, text: JSON.stringify({ app: "WYZ Execution Page", backup: new Date().toISOString(), items: L().items, groups: L().groups, gu: L().gu, tasks: state.tasks || [], assign: state.assign || {} }) }, { cache: false });
      meta().lastBackup = Date.now(); persist();
      if (!auto) say("Backed up to your Drive as " + name + ", created " + dubaiNice() + " Dubai time.");
    } catch (e) { if (!auto) say("Couldn't back up (" + clip((e && e.message) || "unknown reason", 70) + ")."); }
    if (b) { b.disabled = false; b.textContent = "Back up now"; }
    render();
  }
  function autoBackup() { var m = meta(); if (live().length && (!m.lastBackup || Date.now() - m.lastBackup > 7 * 864e5) && !m.bkBusy) { m.bkBusy = 1; backup(true).then(function () { delete m.bkBusy; }); } }
  function loadLib(src, test) { return test() ? Promise.resolve() : new Promise(function (ok, no) { var s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = function () { no(new Error("couldn't load " + src)); }; document.head.append(s); }); }
  function rowsFor(c) {
    var C = COLL[c];
    return live(c).map(function (x) { var o = {}; C.fields.forEach(function (fd) { o[fd[1]] = fd[0] === "t" || fd[0] === "d" || fd[0] === "n" ? (x[fd[0]] || "") : ((x.f || {})[fd[0]] || ""); }); var nd = nextDate(x); if (nd && nd !== x.d) o["Next date"] = nd; return o; });
  }
  async function exportXlsx(b) {
    b.disabled = true;
    try {
      await loadLib("xlsx.mini.min.js", function () { return !!window.XLSX; });
      var wb = XLSX.utils.book_new();
      Object.keys(COLL).forEach(function (c) { var r = rowsFor(c); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r.length ? r : [{ Note: "Nothing yet" }]), COLL[c].name.slice(0, 31)); });
      var g = groups(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Object.keys(g).map(function (k) { return { Group: k, Emails: (g[k] || []).join(", ") }; })), "Groups");
      var name = "My_Life_" + dubaiStamp() + ".xlsx"; XLSX.writeFile(wb, name);
      say("Downloaded " + name + ", created " + dubaiNice() + " Dubai time.");
    } catch (e) { say("Couldn't make the Excel file (" + clip((e && e.message) || "", 60) + ")."); }
    b.disabled = false;
  }
  async function exportPdf(b) {
    b.disabled = true;
    try {
      await loadLib("jspdf.umd.min.js", function () { return !!window.jspdf; });
      var doc = new window.jspdf.jsPDF({ unit: "pt", format: "a4" }), W = 595, M = 48, y = 56;
      var line = function (t, size, bold, col) { doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size || 10); doc.setTextColor.apply(doc, col || [14, 34, 56]);
        doc.splitTextToSize(String(t).replace(/[^\x20-\x7E -ÿ]/g, ""), W - 2 * M).forEach(function (l) { if (y > 790) { doc.addPage(); y = 56; } doc.text(l, M, y); y += (size || 10) * 1.35; }); };
      line("WYZ Rent · Execution Page", 9, true, [184, 146, 60]); line("My Life", 20, true, [16, 75, 112]); line("Created " + dubaiNice() + " (Dubai time)", 9, false, [86, 105, 124]);
      Object.keys(COLL).forEach(function (c) { y += 8; line(COLL[c].name, 13, true, [16, 75, 112]); var r = rowsFor(c); if (!r.length) line("Nothing yet.", 10, false, [86, 105, 124]); r.forEach(function (o) { line("- " + Object.keys(o).filter(function (k) { return o[k]; }).map(function (k) { return k + ": " + o[k]; }).join(" | ")); }); });
      var name = "My_Life_" + dubaiStamp() + ".pdf"; doc.save(name); say("Downloaded " + name + ", created " + dubaiNice() + " Dubai time.");
    } catch (e) { say("Couldn't make the PDF (" + clip((e && e.message) || "", 60) + ")."); }
    b.disabled = false;
  }

  /* ---------- Work and Life switch ---------- */
  var MODEKEY = "wyz-mode";
  var getMode = function () { try { return localStorage.getItem(MODEKEY) === "life" ? "life" : "work"; } catch (e) { return "work"; } };
  function setMode(m, fromClick) {
    try { localStorage.setItem(MODEKEY, m); } catch (e) {}
    document.querySelectorAll("#modeSw button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.mode === m)); });
    $("t-life").hidden = m !== "life"; $("t-today").hidden = m === "life";
    var cur = ["t-today", "t-life", "t-conn", "t-inst"].find(function (t) { return $(t).getAttribute("aria-selected") === "true"; });
    if (m === "life" && (fromClick || cur === "t-today")) show("t-life");
    if (m === "work" && (fromClick || cur === "t-life")) show("t-today");
    document.documentElement.setAttribute("data-mode", m);
  }
  document.querySelectorAll("#modeSw button").forEach(function (b) { b.onclick = function () { setMode(b.dataset.mode, true); }; });
  window.wyzOnTab = function (tid) { if (tid === "t-life") render(); };

  /* ---------- start ---------- */
  setMode(getMode(), false);
  var started = false, tries = 0;
  function start() {
    var on = false; try { on = G.connected() && !!mcp; } catch (e) {}
    if (!on) { if (++tries < 400) setTimeout(start, 3000); drawGroupChips(); return; }
    if (started) return; started = true;
    syncNow(); drawGroupChips();
    document.addEventListener("visibilitychange", function () { if (!document.hidden && Date.now() - (meta().syncAt || 0) > 5 * 60000) syncNow(); });
  }
  setTimeout(start, 1500);
  render();
})();
