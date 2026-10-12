/* Undo and Redo for what you do in the page.
   Covers the things the page stores for you: Done and Undo done (including the Gmail "WYZ-Done" label), Snooze, Pin, tasks,
   handing an email to the team, quick links, VIP and muted senders, team, templates, signature, company tabs, section order,
   and moving files to Trash in the Library.
   It cannot take back things that already left the page: a sent email (use the Undo send countdown), a WhatsApp message,
   a calendar change, an email archived or deleted in Gmail, a draft saved to Gmail, or "Delete forever" in the Library.
   Buttons are in the header; keys are Ctrl or Cmd + Z (undo) and Ctrl or Cmd + Shift + Z or Ctrl + Y (redo).
   The history is kept on this device and survives a reload. */
(function () {
  "use strict";
  if (typeof state === "undefined" || typeof persist !== "function") return;
  var KEYS = ["tasks", "snooze", "pin", "links", "rules", "team", "tpls", "sig", "repeat", "meetNotes", "coRules", "quick", "driveFolder", "styleNote", "order", "setOrder", "connOrder", "off", "docHidden"];
  var MAX = 100;
  var U = { undo: [], redo: [], last: null, replay: false, ready: false };
  var groups = [];
  var clone = function (x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); };
  var same = function (a, b) { return JSON.stringify(a) === JSON.stringify(b); };
  var short = function (s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
  var titleOf = function (id) { try { var t = tById(id); if (t && t.subject) return t.subject; var i = (board && board.items || []).filter(function (x) { return x.id === id; })[0]; return i && i.title || "an email"; } catch (e) { return "an email"; } };
  var storeKey = function () { return "wyz-undo-" + (typeof LS === "string" ? LS : "x"); };

  function snap() {
    var s = {}; KEYS.forEach(function (k) { s[k] = clone(state[k]); });
    s.handoffs = clone(state.handoffs); s.hk = Object.keys(state.handoffs || {}).sort().join(",");
    return s;
  }
  function save() { try { localStorage.setItem(storeKey(), JSON.stringify({ u: U.undo.slice(-MAX), r: U.redo.slice(-MAX) })); } catch (e) {} }
  function load() {
    try { var j = JSON.parse(localStorage.getItem(storeKey()) || "null"); if (j) { U.undo = j.u || []; U.redo = j.r || []; } } catch (e) {}
  }

  /* ---------- naming what changed ---------- */
  function describe(ch, a, b) {
    var L = [];
    if (ch.indexOf("tasks") >= 0) {
      var A = {}, Bm = {}; (a.tasks || []).forEach(function (t) { A[t.id] = t; }); (b.tasks || []).forEach(function (t) { Bm[t.id] = t; });
      var added = (b.tasks || []).filter(function (t) { return !A[t.id]; }), gone = (a.tasks || []).filter(function (t) { return !Bm[t.id]; });
      var flipped = (b.tasks || []).filter(function (t) { return A[t.id] && !A[t.id].done && t.done; }), back = (b.tasks || []).filter(function (t) { return A[t.id] && A[t.id].done && !t.done; });
      if (added.length) L.push("Added task: " + short(added[0].t, 50) + (added.length > 1 ? " and " + (added.length - 1) + " more" : ""));
      else if (flipped.length) L.push("Finished task: " + short(flipped[0].t, 50));
      else if (back.length) L.push("Reopened task: " + short(back[0].t, 50));
      else if (gone.length) L.push("Removed task: " + short(gone[0].t, 50));
      else L.push("Changed a task");
    }
    if (ch.indexOf("snooze") >= 0) {
      var sa = a.snooze || {}, sb = b.snooze || {}, add = Object.keys(sb).filter(function (k) { return sa[k] !== sb[k]; }), rem = Object.keys(sa).filter(function (k) { return !(k in sb); });
      if (add.length) L.push("Snoozed: " + short(titleOf(add[0]), 50) + " until " + sb[add[0]] + (add.length > 1 ? " and " + (add.length - 1) + " more" : ""));
      else if (rem.length) L.push("Brought back: " + short(titleOf(rem[0]), 50));
    }
    if (ch.indexOf("pin") >= 0) { var pa = a.pin || {}, pb = b.pin || {}, pn = Object.keys(pb).filter(function (k) { return !(k in pa); }), pr = Object.keys(pa).filter(function (k) { return !(k in pb); }); L.push(pn.length ? "Pinned: " + short(titleOf(pn[0]), 50) : "Unpinned: " + short(titleOf((pr[0]) || ""), 50)); }
    if (ch.indexOf("handoffs") >= 0) { var ha = a.handoffs || {}, hb = b.handoffs || {}, hn = Object.keys(hb).filter(function (k) { return !(k in ha); }), hr = Object.keys(ha).filter(function (k) { return !(k in hb); }); L.push(hn.length ? "Handed to " + (hb[hn[0]].name || "the team") + ": " + short(hb[hn[0]].subject || "", 50) : "Took back: " + short((ha[hr[0]] || {}).subject || "an email", 50)); }
    if (ch.indexOf("links") >= 0) { var la = (a.links || []).length, lb = (b.links || []).length; L.push(lb > la ? "Added a link: " + short((b.links[lb - 1] || {}).n, 40) : lb < la ? "Removed a link" : "Changed a link"); }
    if (ch.indexOf("docHidden") >= 0) { var da = Object.keys(a.docHidden || {}), db = Object.keys(b.docHidden || {}), dn = db.filter(function (k) { return da.indexOf(k) < 0; }), dr = da.filter(function (k) { return db.indexOf(k) < 0; }); L.push(dn.length ? "Removed from Documents: " + short((b.docHidden[dn[0]] || {}).t, 50) + (dn.length > 1 ? " and " + (dn.length - 1) + " more" : "") : "Restored to Documents: " + short((a.docHidden[dr[0]] || {}).t, 50) + (dr.length > 1 ? " and " + (dr.length - 1) + " more" : "")); }
    var plain = { rules: "Changed VIP and muted senders", team: "Changed the team list", tpls: "Changed reply templates", sig: "Changed your signature", repeat: "Changed weekly repeats", meetNotes: "Saved meeting notes", coRules: "Changed company tabs", quick: "Changed one-tap replies", driveFolder: "Changed the Drive folder", styleNote: "Changed your writing style", order: "Moved sections", setOrder: "Moved settings", connOrder: "Moved setup steps", off: "Changed what the page reads" };
    Object.keys(plain).forEach(function (k) { if (ch.indexOf(k) >= 0) L.push(plain[k]); });
    return L.length ? L[0] + (L.length > 1 ? " (+" + (L.length - 1) + ")" : "") : "Changed something";
  }

  /* ---------- recording ---------- */
  var toastT = 0;
  function note(entry) {
    var t = document.getElementById("undoToast");
    if (!t) { t = document.createElement("div"); t.id = "undoToast"; t.setAttribute("role", "status"); t.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:40;max-width:min(92vw,420px);display:flex;gap:10px;align-items:center;padding:9px 12px;border-radius:10px;background:var(--navy);color:var(--onnavy);font:14px/1.3 var(--font,system-ui);box-shadow:0 6px 20px rgba(0,0,0,.25)"; document.body.append(t); }
    t.replaceChildren(); var s = document.createElement("span"); s.textContent = entry.label; s.style.minWidth = "0"; s.style.overflowWrap = "anywhere";
    var b = document.createElement("button"); b.type = "button"; b.textContent = "Undo"; b.style.cssText = "flex:none;border:1px solid currentColor;background:transparent;color:inherit;border-radius:6px;padding:4px 10px;font:inherit;font-weight:700;cursor:pointer";
    b.onclick = function () { undo(); t.hidden = true; }; t.append(s, b); t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 8000);
  }
  function push(entry, quiet) {
    entry.at = Date.now();
    var prev = U.undo[U.undo.length - 1];
    if (prev && prev.kind === entry.kind && entry.at - prev.at < 1200 && entry.kind === "done" && prev.act === entry.act) { prev.ids = prev.ids.concat(entry.ids); prev.label = (entry.act === "done" ? "Marked " : "Reopened ") + prev.ids.length + " emails" + (entry.act === "done" ? " done" : ""); prev.at = entry.at; }
    else if (prev && prev.kind === "state" && entry.kind === "state" && entry.at - prev.at < 1200 && same(Object.keys(prev.after).sort(), Object.keys(entry.after).sort())) { prev.after = entry.after; prev.label = entry.label; prev.at = entry.at; }
    else U.undo.push(entry);
    if (U.undo.length > MAX) U.undo.shift();
    U.redo = []; save(); paint(); if (!quiet) note(U.undo[U.undo.length - 1]);
  }
  function capture() {
    if (!U.ready) return;
    if (U.replay) { U.last = snap(); return; }
    var now = snap(), last = U.last || now, ch = [];
    KEYS.forEach(function (k) { if (!same(now[k], last[k])) ch.push(k); });
    if (now.hk !== last.hk) ch.push("handoffs");
    U.last = now;
    if (!ch.length) return;
    var before = {}, after = {}; ch.forEach(function (k) { before[k] = last[k]; after[k] = now[k]; });
    push({ kind: "state", label: describe(ch, last, now), before: before, after: after });
  }
  var origPersist = window.persist;
  window.persist = function () { var r = origPersist.apply(this, arguments); try { capture(); } catch (e) {} return r; };

  /* Done goes through the page's own functions, so the Gmail label follows */
  var origSet = window.setDone, origUn = window.undoDone;
  if (typeof origSet === "function") window.setDone = function (id, soft) { var r = origSet.apply(this, arguments); if (!soft && !U.replay && U.ready && id) push({ kind: "done", act: "done", ids: [id], label: "Marked done: " + short(titleOf(id), 50) }); return r; };
  if (typeof origUn === "function") window.undoDone = function (id) { var r = origUn.apply(this, arguments); if (!U.replay && U.ready && id) push({ kind: "done", act: "undone", ids: [id], label: "Reopened: " + short(titleOf(id), 50) }); return r; };

  /* ---------- replaying ---------- */
  function rerender() {
    ["renderBoard", "renderTasks", "renderLinks", "renderTeam", "renderRules", "renderTplList", "renderTplSelect", "renderDocs", "renderTop3", "renderHandoffs", "renderOwed", "applyOrder", "applySetOrder", "renderSetup", "renderSources", "renderHello", "renderCal"].forEach(function (f) { try { if (typeof window[f] === "function") window[f](); } catch (e) {} });
  }
  async function applyEntry(e, dir) {   /* dir -1 = undo, +1 = redo */
    U.replay = true;
    try {
      if (e.kind === "state") {
        var tgt = dir < 0 ? e.before : e.after;
        Object.keys(tgt).forEach(function (k) { if (tgt[k] === undefined) delete state[k]; else state[k] = clone(tgt[k]); });
        persist(); rerender();
      } else if (e.kind === "done") {
        var doIt = (dir < 0) === (e.act === "done");   /* undoing "done" = reopen; redoing "done" = done again */
        e.ids.forEach(function (id) { if (doIt) { if (typeof origUn === "function") origUn(id); } else if (typeof origSet === "function") { origSet(id); persist(); try { renderBoard(); renderTop3(); } catch (x) {} } });
      } else if (e.kind === "lib" && window.WYZ_LIB) {
        var toTrash = (dir < 0) === (e.act === "restore");
        if (toTrash) await window.WYZ_LIB.trashKeys(e.keys, e.lov || []); else await window.WYZ_LIB.restoreKeys(e.keys);
      }
    } finally { U.replay = false; U.last = snap(); }
  }
  async function undo() { var e = U.undo.pop(); if (!e) return; try { await applyEntry(e, -1); U.redo.push(e); } catch (x) { U.undo.push(e); } save(); paint(); }
  async function redo() { var e = U.redo.pop(); if (!e) return; try { await applyEntry(e, 1); U.undo.push(e); } catch (x) { U.redo.push(e); } save(); paint(); }
  async function undoTo(n) { while (U.undo.length > n) { var before = U.undo.length; await undo(); if (U.undo.length === before) break; } }
  async function redoTo(n) { while (U.redo.length > n) { var before = U.redo.length; await redo(); if (U.redo.length === before) break; } }

  /* ---------- buttons and history ---------- */
  function paint() {
    groups.forEach(function (g) {
      if (!g.u.isConnected && !g.stale) { g.stale = 1; }
      var u = U.undo[U.undo.length - 1], r = U.redo[U.redo.length - 1];
      g.u.disabled = !u; g.r.disabled = !r;
      g.u.title = u ? "Undo: " + u.label : "Nothing to undo"; g.r.title = r ? "Redo: " + r.label : "Nothing to redo";
      g.u.setAttribute("aria-label", g.u.title); g.r.setAttribute("aria-label", g.r.title);
    });
  }
  function mkButtons() {
    var w = document.createElement("span"); w.className = "undogrp"; w.style.cssText = "display:inline-flex;gap:6px;flex-wrap:wrap";
    var mk = function (txt, fn) { var b = document.createElement("button"); b.type = "button"; b.className = "btn"; b.textContent = txt; b.onclick = fn; return b; };
    var g = { u: mk("↶ Undo", function () { undo(); }), r: mk("↷ Redo", function () { redo(); }), h: mk("🕘 History", openHistory) };
    g.u.className = g.r.className = g.h.className = "btn undobtn"; g.u.id = g.u.id || ""; w.append(g.u, g.r, g.h); groups.push(g); paint(); return w;
  }
  function openHistory() {
    var host = infoOpen("History of your changes");
    var p = function (t, c) { var e = document.createElement("p"); e.className = "status" + (c ? " " + c : ""); e.textContent = t; return e; };
    host.append(p("Undo and Redo cover what the page stores for you: Done, Snooze, Pin, tasks, hand-offs to the team, links, VIP and muted senders, templates, signature, section order, and Library Trash. They can't take back a sent email (use the Undo send countdown), a WhatsApp message, a calendar change, an email deleted or archived in Gmail, or Delete forever."));
    var list = document.createElement("div");
    var fmt = function (ms) { try { return new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } };
    var row = function (e, state_, fn, lbl) {
      var r = document.createElement("div"); r.className = "item"; r.style.opacity = state_ === "redo" ? ".6" : "1";
      var d = document.createElement("span"); d.className = "dot " + (state_ === "redo" ? "none" : "fyi"); var m = document.createElement("div"); m.className = "main";
      var t = document.createElement("span"); t.className = "t"; t.textContent = e.label; var s = document.createElement("span"); s.className = "m"; s.textContent = fmt(e.at) + (state_ === "redo" ? " · undone" : "");
      var a = document.createElement("div"); a.className = "acts"; var b = document.createElement("button"); b.type = "button"; b.className = "btn small"; b.textContent = lbl; b.onclick = function () { fn(); infoClose(); }; a.append(b);
      m.append(t, s, a); r.append(d, m); return r;
    };
    if (!U.undo.length && !U.redo.length) list.append(p("Nothing yet. Your changes show here as you make them."));
    for (var i = U.redo.length - 1; i >= 0; i--) (function (i) { list.append(row(U.redo[i], "redo", function () { redoTo(i); }, "Redo up to here")); })(i);
    for (var j = U.undo.length - 1; j >= 0; j--) (function (j) { list.append(row(U.undo[j], "undo", function () { undoTo(j); }, "Undo back to here")); })(j);
    host.append(list);
  }
  document.addEventListener("keydown", function (e) {
    var mod = e.ctrlKey || e.metaKey, k = String(e.key || "").toLowerCase();
    if (!mod || (k !== "z" && k !== "y")) return;
    var t = e.target; if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
    var open = ["thr", "info", "onb", "evt", "fileAI", "lock"].some(function (id) { var d = document.getElementById(id); return d && !d.hidden; });
    if (open) return;
    e.preventDefault(); if (k === "y" || e.shiftKey) redo(); else undo();
  });

  /* start once signed in and the saved data is loaded */
  var tries = 0;
  function start() {
    var on = false; try { on = G.connected(); } catch (e) {}
    if (!on) { if (++tries < 400) setTimeout(start, 2000); return; }
    load(); U.last = snap(); U.ready = true;
    var row = document.querySelector(".herorefresh"), after = document.getElementById("refresh");
    if (row && !row.querySelector(".undogrp")) { var w = mkButtons(); after && after.nextSibling ? row.insertBefore(w, after.nextSibling) : row.append(w); }
    paint();
  }
  window.WYZ_UNDO = {
    record: function (e) { if (U.ready && !U.replay) push(e); }, undo: undo, redo: redo, mkButtons: mkButtons, history: openHistory,
    _state: function () { return { undo: U.undo.length, redo: U.redo.length, labels: U.undo.map(function (e) { return e.label; }) }; },
    _dump: function () { return JSON.stringify({ u: U.undo, r: U.redo }); }, _load: function (s) { var j = JSON.parse(s); U.undo = j.u; U.redo = j.r; paint(); }
  };
  setTimeout(start, 2500);
})();
