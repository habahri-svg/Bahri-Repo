/* 3.74 Sync: every computer and phone you sign in on works as one.
   Done, Delete, Snooze, Pin, tasks, reminders, hand-offs, assignments, rules, team, templates, settings and your colours
   are kept in one private file in your own Google Drive ("Execution Page data/Execution Page - Sync.json").
   Each change carries its time, so the newest change wins, and a delete on one device deletes everywhere.
   Checks for changes when you open the page, when you come back to it, every minute while it's open, and a few
   seconds after you change something. Sign-ins themselves stay on each device, for safety.
   Kept per device on purpose: the page layout (phone and laptop can differ), collapsed sections, text size, PIN lock.
   My Life has its own file and keeps syncing as before. */
(function () {
  "use strict";
  if (typeof persist !== "function" || typeof el !== "function") return;
  var FILE = "Execution Page - Sync.json", FOLDER = "Execution Page data";
  var SEP = "\u0001", SEPA = "\u0002";
  /* never synced: My Life (own file), this file's own notes, device-only flags */
  var SKIP = { life: 1, lifeMeta: 1, pushOn: 1, log: 1 };
  /* settings kept outside the main state that should still follow you */
  var EXTRA = { "__look": "wyz-look", "__mylooks": "wyz-mylooks" };
  var meta = null, fileId = "", pushing = false, pulling = false, pushT = 0, lastPull = 0, applying = false, note = "", started = false;

  var isObj = function (v) { return !!v && typeof v === "object" && !Array.isArray(v); };
  var idArray = function (v) { return Array.isArray(v) && v.length > 0 && v.every(function (x) { return isObj(x) && x.id != null && x.id !== ""; }); };
  var mkey = function () { return (typeof LS === "string" ? LS : "wyzcc-v1") + "-sync"; };
  function loadMeta() { try { var m = JSON.parse(localStorage.getItem(mkey()) || "null"); return m && m.clock && m.flat ? m : null; } catch (e) { return null; } }
  function saveMeta() { try { localStorage.setItem(mkey(), JSON.stringify(meta)); } catch (e) {} }

  /* the state as a flat list of small pieces: "done␁<id>" -> value, "tasks␂<id>" -> task, "rules" -> value */
  function flatten() {
    var out = {}, s = state || {};
    Object.keys(s).forEach(function (k) {
      if (SKIP[k]) return; var v = s[k];
      if (isObj(v)) { out[k] = "{}"; Object.keys(v).forEach(function (sub) { if (v[sub] !== undefined) out[k + SEP + sub] = JSON.stringify(v[sub]); }); }
      else if (idArray(v)) { out[k] = "[id]"; v.forEach(function (x, i) { out[k + SEPA + x.id] = JSON.stringify(Object.assign({}, x, { __o: i })); }); }
      else if (v !== undefined) out[k] = JSON.stringify(v);
    });
    Object.keys(EXTRA).forEach(function (k) { try { var v = localStorage.getItem(EXTRA[k]); if (v != null) out[k] = v; } catch (e) {} });
    return out;
  }
  function unflatten(flat) {
    var s = {}, arr = {};
    Object.keys(flat).forEach(function (p) {
      if (p.indexOf(SEP) >= 0 || p.indexOf(SEPA) >= 0 || EXTRA[p]) return;
      var v = flat[p];
      if (v === "{}") s[p] = {}; else if (v === "[id]") { s[p] = []; arr[p] = []; } else { try { s[p] = JSON.parse(v); } catch (e) {} }
    });
    Object.keys(flat).forEach(function (p) {
      var i = p.indexOf(SEP), j = p.indexOf(SEPA), v;
      if (i > 0) { var k = p.slice(0, i); if (!isObj(s[k])) s[k] = {}; try { v = JSON.parse(flat[p]); } catch (e) { return; } s[k][p.slice(i + 1)] = v; }
      else if (j > 0) { var k2 = p.slice(0, j); if (!arr[k2]) { arr[k2] = []; } try { v = JSON.parse(flat[p]); } catch (e) { return; } arr[k2].push(v); }
    });
    Object.keys(arr).forEach(function (k) {
      var a = arr[k], allAt = a.length && a.every(function (x) { return typeof x.at === "number"; });
      a.sort(function (x, y) { return allAt ? y.at - x.at : (x.__o || 0) - (y.__o || 0); });
      s[k] = a.map(function (x) { var c = Object.assign({}, x); delete c.__o; return c; });
    });
    return s;
  }

  /* note what changed since last time, with the time it changed */
  function track() {
    if (applying || !meta) return;
    var f = flatten(), now = Date.now(), changed = false;
    Object.keys(f).forEach(function (p) { if (meta.flat[p] !== f[p]) { meta.clock[p] = now; changed = true; } });
    Object.keys(meta.flat).forEach(function (p) { if (!(p in f)) { meta.clock[p] = now; changed = true; } });
    meta.flat = f;
    if (changed) { saveMeta(); clearTimeout(pushT); pushT = setTimeout(push, 3000); }
  }

  /* bring in another device's changes: for every piece, the newer change wins (a delete is a change too) */
  function mergeDoc(R) {
    if (!R || !R.clock) return false;
    var changed = false, rf = R.flat || {};
    Object.keys(R.clock).forEach(function (p) {
      var rt = +R.clock[p] || 0, lt = +meta.clock[p] || 0;
      if (rt > lt) {
        meta.clock[p] = rt;
        if (p in rf) { if (meta.flat[p] !== rf[p]) { meta.flat[p] = rf[p]; changed = true; } }
        else if (p in meta.flat) { delete meta.flat[p]; changed = true; }
      }
    });
    /* done list for the end-of-day wrap: keep both sides */
    if (Array.isArray(R.log) && R.log.length) {
      var have = new Set((state.log || []).map(function (l) { return l.at + "|" + l.t; })), add = R.log.filter(function (l) { return l && !have.has(l.at + "|" + l.t); });
      if (add.length) { state.log = (state.log || []).concat(add).sort(function (a, b) { return a.at - b.at; }).slice(-300); changed = true; }
    }
    return changed;
  }
  function prune() {
    var old = Date.now() - 120 * 864e5;
    Object.keys(meta.clock).forEach(function (p) { if (!(p in meta.flat) && meta.clock[p] < old) delete meta.clock[p]; });
  }
  function apply() {
    var keep = {}; Object.keys(SKIP).forEach(function (k) { if (state && state[k] !== undefined) keep[k] = state[k]; });
    var next = Object.assign(unflatten(meta.flat), keep);
    applying = true;
    try {
      Object.keys(EXTRA).forEach(function (k) {
        try { var cur = localStorage.getItem(EXTRA[k]); if (k in meta.flat) { if (cur !== meta.flat[k]) localStorage.setItem(EXTRA[k], meta.flat[k]); } else if (cur != null && meta.clock[k]) localStorage.removeItem(EXTRA[k]); } catch (e) {}
      });
      restore({ state: next });
      try { lsSet({ board: board, state: state, at: Date.now() }); } catch (e) {}
      try { if (typeof applyLook === "function" && typeof lookNow === "function") applyLook(lookNow()); } catch (e) {}
      try { if (window.wyzLifeSoftRender) window.wyzLifeSoftRender(); } catch (e) {}
    } finally { applying = false; }
    meta.flat = flatten(); saveMeta();
  }

  var online = function () { try { return G.connected() && !!mcp && !!uid; } catch (e) { return false; } };
  async function pull() {
    if (!online() || pulling) return false;
    pulling = true;
    try {
      var got = (await mcp.callTool("Google Drive", "get_text", { name: FILE, folder: FOLDER }, { cache: false })).payload || {};
      fileId = got.id || "";
      var texts = [got.text].concat(got.others || []).filter(Boolean), changed = false;
      for (var i = 0; i < texts.length; i++) {
        var R; try { R = JSON.parse(texts[i]); } catch (e) { if (i === 0) throw new Error("the sync file in your Drive couldn't be read, so it wasn't overwritten"); continue; }
        if (mergeDoc(R)) changed = true;
      }
      if (changed) { prune(); apply(); }
      lastPull = Date.now(); if (!pushing) setNote("ok");
      return changed;
    } finally { pulling = false; }
  }
  async function push() {
    if (!online()) { setNote("off"); return; }
    if (pushing || pulling) { clearTimeout(pushT); pushT = setTimeout(push, 2000); return; }
    pushing = true; setNote("saving");
    try {
      await pull().catch(function (e) { throw e; });
      var doc = { app: "WYZ Execution Page", kind: "sync", v: 1, saved: new Date().toISOString(), flat: meta.flat, clock: meta.clock, log: (state.log || []).slice(-300) };
      var put = (await mcp.callTool("Google Drive", "put_text", { name: FILE, folder: FOLDER, fileId: fileId, text: JSON.stringify(doc) }, { cache: false })).payload || {};
      fileId = put.id || fileId; meta.pushed = Date.now(); saveMeta(); setNote("ok");
    } catch (e) {
      setNote("err", e && e.code === "consent_required" ? "Drive permission is missing. Sign out and in again and tick Drive." : clip((e && e.message) || "Drive didn't answer", 80));
    }
    pushing = false;
  }
  window.wyzSyncNow = function () { return push(); };

  /* a small line in the header and in Settings */
  function setNote(kind, msg) {
    var t = new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Dubai", hour: "2-digit", minute: "2-digit" });
    note = kind === "ok" ? "🔄 In sync with your other devices, " + t : kind === "saving" ? "🔄 Syncing..." : kind === "off" ? "🔄 Sync starts when you're signed in" : "⚠️ Sync paused: " + (msg || "") + ". It retries by itself.";
    var a = $("syncSt"); if (!a) { var f = $("fresh"); if (f && f.parentNode) { a = el("button", "status"); a.id = "syncSt"; a.type = "button"; a.style.cssText = "background:none;border:0;padding:0;cursor:pointer;color:inherit;font:inherit"; a.title = "Tap to sync now"; a.onclick = function () { push(); }; f.after(a); } }
    if (a) { a.textContent = note; a.style.opacity = ".9"; }
    var b = $("syncCardSt"); if (b) b.textContent = note;
  }
  function settingsCard() {
    var host = $("p-conn"); if (!host || $("syncCard")) return;
    var c = el("div", "card note"); c.id = "syncCard"; var p = el("div", "pad"); c.append(p);
    p.append(el("h2", "", "🔄 One page on every device"), el("p", "status", "Everything you do here (Done, Delete, Snooze, Pin, tasks, reminders, hand-offs, rules, team, templates, settings and colours) is the same on every computer and phone where you sign in with the same Google account. A delete on one device deletes everywhere. It's kept in a private file in your own Drive. Only the page layout, collapsed sections, text size and PIN lock stay per device."));
    var st = el("p", "status", note); st.id = "syncCardSt"; p.append(st);
    var a = el("div", "acts"); var b = el("button", "btn small solid", "Sync now"); b.type = "button"; b.onclick = function () { b.disabled = true; push().then(function () { b.disabled = false; }); }; a.append(b); p.append(a);
    host.insertBefore(c, host.children[1] || null);
  }

  /* hook every save in the app */
  var _p = window.persist;
  window.persist = function () { var r = _p.apply(this, arguments); try { track(); } catch (e) {} return r; };

  function start() {
    if (!online() || !state) { setTimeout(start, 2500); return; }
    if (started) return; started = true;
    meta = loadMeta();
    if (!meta) {
      /* first time on this device: what's here counts as old, so changes made on your other devices win,
         and anything only this device has is still added to the shared file */
      meta = { clock: {}, flat: flatten() }; Object.keys(meta.flat).forEach(function (p) { meta.clock[p] = 1; }); saveMeta();
    } else track();
    settingsCard();
    push();
    setInterval(function () { if (!document.hidden && Date.now() - lastPull > 55000) pull().catch(function (e) { setNote("err", clip((e && e.message) || "", 80)); }); }, 15000);
    var back = function () { if (!document.hidden && Date.now() - lastPull > 10000) pull().catch(function () {}); };
    document.addEventListener("visibilitychange", back); window.addEventListener("focus", back);
  }
  setTimeout(start, 2000);
})();
