/* 3.99: Email buttons on one line, and a small editor to fix or delete them.
   - Every email line shows its buttons (Open in Gmail, Read thread, Reply here, Ask, Done, Snooze, Pin, Add to tasks, Instruct, Spam, Delete) on one line.
     If the line is too narrow the text shrinks a little first, and only wraps as a last resort.
   - "Edit email buttons" (above your email list) opens a list of every button. Change the wording, or press Delete to remove a button, then press Save.
     A deleted button is only hidden, so Restore brings it back. Nothing changes until you press Save.
   - Saved with your page data (this device, and your account when signed in), so it stays after a refresh. */
(function () {
  "use strict";
  if (typeof el !== "function" || typeof state === "undefined" || typeof persist !== "function") return;

  var KEYS = [
    ["gmail", "Open in Gmail"], ["read", "Read thread"], ["reply", "Reply here"], ["openreply", "Open to reply"],
    ["ask", "Ask"], ["done", "Done"], ["snooze", "Snooze"], ["pin", "📌 Pin"], ["tasks", "Add to tasks"],
    ["instructai", "Instruct AI"], ["spam", "🚫 Spam"], ["delete", "🗑 Delete"], ["instruct", "Instruct"]
  ];
  var DEF = {}; KEYS.forEach(function (k) { DEF[k[0]] = k[1]; });

  function cfg() {
    var c = state.mailBtns;
    if (!c || typeof c !== "object") c = state.mailBtns = {};
    if (!c.hide || typeof c.hide !== "object") c.hide = {};
    if (!c.label || typeof c.label !== "object") c.label = {};
    return c;
  }
  function labelNode(n) { return n.tagName === "DETAILS" ? (n.querySelector("summary") || n) : n; }
  function keyOf(n) {
    var t = labelNode(n).textContent.replace(/▾/g, "").trim().toLowerCase();
    if (/^open in gmail/.test(t)) return "gmail";
    if (/^read thread/.test(t)) return "read";
    if (/^(reply|chase) here/.test(t)) return "reply";
    if (/^open to (reply|chase)/.test(t)) return "openreply";
    if (/^ask\b/.test(t)) return "ask";
    if (/^(done|undo done)/.test(t)) return "done";
    if (/^snooze/.test(t)) return "snooze";
    if (/pin$/.test(t)) return "pin";
    if (/^(add to tasks|added)/.test(t)) return "tasks";
    if (/^instruct ai/.test(t)) return "instructai";
    if (/spam/.test(t)) return "spam";
    if (/(delete|move to bin)/.test(t)) return "delete";
    if (/^instruct/.test(t)) return "instruct";
    return "";
  }

  /* ---------- one line ---------- */
  var css = document.createElement("style");
  css.textContent =
    ".item[data-thr] .acts{flex-wrap:nowrap;gap:4px;align-items:center;--mbf:13px}" +
    ".item[data-thr] .acts>*{flex:0 0 auto;white-space:nowrap}" +
    ".item[data-thr] .acts .btn.small{font-size:var(--mbf);padding:5px 8px}" +
    ".item[data-thr] .acts details.askdd>summary{font-size:var(--mbf);padding:0 7px;height:28px;min-width:0}" +
    ".item[data-thr] .acts.mb-wrap{flex-wrap:wrap}" +
    ".mbbar{display:flex;gap:8px;align-items:center;margin:0 0 8px}" +
    ".mbpanel{border:1px solid var(--navy);border-radius:10px;background:var(--panel);color:var(--fg);padding:12px 14px;margin:0 0 12px}" +
    ".mbpanel h3{margin:0 0 4px;font-size:15px}" +
    ".mbrow{display:flex;gap:8px;align-items:center;margin:6px 0}" +
    ".mbrow .in{flex:1 1 auto;min-width:0}" +
    ".mbrow.mbgone .in{text-decoration:line-through;opacity:.5}" +
    ".mbrow .mbdef{flex:0 0 120px;font-size:12px;opacity:.65}" +
    ".mbfoot{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}";
  document.head.appendChild(css);

  function applyRow(acts) {
    var c = cfg();
    [].forEach.call(acts.children, function (ch) {
      if (!ch.dataset.mbk) {
        var k0 = keyOf(ch); if (!k0) return;
        ch.dataset.mbk = k0; ch.dataset.mbd = labelNode(ch).textContent;
      }
      var k = ch.dataset.mbk, want = c.hide[k] ? "none" : "";
      if (ch.style.display !== want) ch.style.display = want;
      var ln = labelNode(ch), cur = ln.textContent, over = c.label[k];
      if (over) {
        var w = ch.tagName === "DETAILS" ? over + " ▾" : over;
        if (cur === ch.dataset.mbd || cur === ch.dataset.mbw) { if (cur !== w) ln.textContent = w; ch.dataset.mbw = w; }
      } else if (ch.dataset.mbw && cur === ch.dataset.mbw) {
        ln.textContent = ch.dataset.mbd; delete ch.dataset.mbw;
      }
    });
  }
  function fit(acts) {
    if (!acts.clientWidth) return;
    acts.classList.remove("mb-wrap");
    var sizes = [13, 12, 11, 10];
    for (var i = 0; i < sizes.length; i++) {
      acts.style.setProperty("--mbf", sizes[i] + "px");
      if (acts.scrollWidth <= acts.clientWidth + 1) return;
    }
    acts.classList.add("mb-wrap");
  }
  var queued = 0;
  function all() {
    queued = 0;
    [].forEach.call(document.querySelectorAll(".item[data-thr] .acts"), function (a) { applyRow(a); fit(a); });
  }
  function later() { if (!queued) queued = requestAnimationFrame(all); }
  try { new MutationObserver(later).observe(document.body, { childList: true, subtree: true }); } catch (e) {}
  window.addEventListener("resize", later);

  /* ---------- the editor ---------- */
  var host = document.getElementById("board");
  if (!host || !host.parentNode) return;
  var bar = el("div", "mbbar"), edit = el("button", "btn small", "✎ Edit email buttons"); edit.type = "button";
  var msg = el("span", "status", ""); bar.append(edit, msg);
  var panel = el("div", "mbpanel"); panel.hidden = true;
  host.parentNode.insertBefore(bar, host); host.parentNode.insertBefore(panel, host);

  function say(t, bad) { msg.className = "status" + (bad ? " err" : ""); msg.textContent = t; }
  function open() {
    var c = cfg(), draft = { hide: Object.assign({}, c.hide), label: Object.assign({}, c.label) }, inputs = {};
    panel.replaceChildren(); panel.hidden = false; edit.disabled = true;
    panel.append(el("h3", "", "Edit email buttons"));
    panel.append(el("p", "status", "Change the wording, or press Delete to remove a button. Nothing changes until you press Save. A deleted button can be restored."));
    KEYS.forEach(function (kv) {
      var k = kv[0], r = el("div", "mbrow" + (draft.hide[k] ? " mbgone" : ""));
      var inp = el("input", "in"); inp.value = draft.label[k] || DEF[k]; inp.maxLength = 24; inp.setAttribute("aria-label", "Button wording for " + DEF[k]); inputs[k] = inp;
      var def = el("span", "mbdef", "was: " + DEF[k]);
      var del = el("button", "btn small", draft.hide[k] ? "Restore" : "Delete"); del.type = "button";
      del.onclick = function () { if (draft.hide[k]) delete draft.hide[k]; else draft.hide[k] = 1; r.classList.toggle("mbgone", !!draft.hide[k]); del.textContent = draft.hide[k] ? "Restore" : "Delete"; };
      r.append(inp, def, del); panel.append(r);
    });
    var f = el("div", "mbfoot");
    var save = el("button", "btn small solid", "Save"); save.type = "button";
    var cancel = el("button", "btn small", "Cancel"); cancel.type = "button";
    var reset = el("button", "btn small", "Restore all to original"); reset.type = "button";
    var close = function () { panel.hidden = true; panel.replaceChildren(); edit.disabled = false; };
    save.onclick = function () {
      var n = cfg(); n.hide = {}; n.label = {};
      KEYS.forEach(function (kv) {
        var k = kv[0], v = inputs[k].value.replace(/\s+/g, " ").trim();
        if (draft.hide[k]) n.hide[k] = 1;
        if (v && v !== DEF[k]) n.label[k] = v;
      });
      persist(); all(); close();
      var gone = Object.keys(n.hide).length, ren = Object.keys(n.label).length;
      say("Saved. " + (gone ? gone + " deleted" : "None deleted") + ", " + (ren ? ren + " reworded." : "none reworded."));
    };
    cancel.onclick = function () { close(); say("Nothing changed."); };
    reset.onclick = function () { draft.hide = {}; KEYS.forEach(function (kv) { inputs[kv[0]].value = DEF[kv[0]]; }); [].forEach.call(panel.querySelectorAll(".mbrow"), function (r) { r.classList.remove("mbgone"); var b = r.querySelector("button"); if (b) b.textContent = "Delete"; }); say("Press Save to keep the originals."); };
    f.append(save, cancel, reset); panel.append(f);
    say("");
  }
  edit.onclick = open;
  later();
})();
