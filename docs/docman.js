/* Document manager for the Documents list: select one or many, Forward, Remove, and a "Removed" view to restore from.
   - Forward writes an email with the links (and a note) in the usual writing window. You check it and press Send yourself.
     It can also share on WhatsApp or copy the links. Nothing is sent from here, and sharing a link does not change who has access.
   - Remove takes a document off this list, after a confirmation. It does NOT delete anything in Google Drive: this page only has
     permission to read your Drive files, not to delete them. Every removed document can be restored from "Removed", and Undo
     (↶ in the header) brings it back too. "Delete in Drive" opens the real file where you can delete it for good.
   Also provides window.WYZ_FORWARD(items) so other lists (the Library) can forward the same way. */
(function () {
  "use strict";
  if (typeof renderDocs !== "function" || typeof el !== "function" || typeof infoOpen !== "function") return;
  var orig = window.renderDocs, SEL = {}, showRemoved = false;
  var short = function (s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
  var plural = function (n, w) { return n + " " + w + (n === 1 ? "" : "s"); };
  var linkOf = function (f) { return f.link || "https://drive.google.com/file/d/" + encodeURIComponent(String(f.id || "").replace(/^a\d+~/, "")) + "/view"; };
  var hidden = function () { state.docHidden = state.docHidden || {}; return state.docHidden; };
  var B = function (t, fn, cls) { var b = el("button", "btn small" + (cls ? " " + cls : ""), t); b.type = "button"; b.onclick = function () { fn(b); }; return b; };

  /* ---------- confirmation ---------- */
  function confirmBox(title, lines, okLabel) {
    return new Promise(function (resolve) {
      var h = infoOpen(title), done = false, fin = function (v) { if (done) return; done = true; clearInterval(obs); infoClose(); resolve(v); };
      lines.forEach(function (l) { h.append(typeof l === "string" ? el("p", "", l) : l); });
      var a = el("div", "acts"); a.append(B(okLabel, function () { fin(true); }, "solid"), B("Cancel", function () { fin(false); }, "ghost")); h.append(a);
      var obs = setInterval(function () { var box = $("info"); if (box && box.hidden) fin(false); }, 300);
    });
  }
  var nameList = function (rows) { var ul = el("ul"); ul.style.cssText = "margin:4px 0;padding-left:18px;font-size:14px"; rows.slice(0, 6).forEach(function (r) { ul.append(el("li", "", short(r.title || r.t, 70))); }); if (rows.length > 6) ul.append(el("li", "", "and " + (rows.length - 6) + " more")); return ul; };

  /* ---------- Forward (shared) ---------- */
  function forward(items) {
    if (!items || !items.length) return;
    var h = infoOpen("Forward " + plural(items.length, "document"));
    h.append(el("p", "status", "This writes an email with the links, in the usual writing window. You check it and press Send. People need access to a Drive file to open its link, and Drive will ask you to share it if they don't have it."));
    h.append(nameList(items));
    var to = el("input", "in"); to.type = "text"; to.placeholder = "To: name@company.com"; to.setAttribute("aria-label", "Send to"); to.autocomplete = "off";
    try { if (typeof attachAutocomplete === "function") attachAutocomplete(to, true); } catch (e) {}
    h.append(el("span", "status", "Send to"), to);
    var team = []; try { team = teamList(); } catch (e) {}
    if (team.length) { var chips = el("div", "chips"); team.forEach(function (p) { var c = el("button", "chip", p.name); c.type = "button"; c.onclick = function () { to.value = (to.value ? to.value.replace(/[,\s]+$/, "") + ", " : "") + p.email; }; chips.append(c); }); h.append(chips); }
    var msg = el("textarea", "in"); msg.rows = 3; msg.value = "Hi,\n\nSharing " + (items.length > 1 ? "these documents" : "this document") + " with you."; msg.setAttribute("aria-label", "Your note"); h.append(el("span", "status", "Your note"), msg);
    var body = function () { return msg.value.trim() + "\n\n" + items.map(function (i) { return "• " + (i.title || i.t) + "\n  " + (i.link || "") + (i.text ? "\n  " + short(String(i.text).replace(/\s+/g, " "), 400) : ""); }).join("\n\n") + (typeof sigText === "function" && sigText() ? "\n\n" + sigText() : ""); };
    var acts = el("div", "acts");
    acts.append(B("Write the email", function () { infoClose(); try { openCompose({ to: to.value.trim(), subject: items.length > 1 ? items.length + " documents" : (items[0].title || items[0].t), body: body() }); } catch (e) { toast("Couldn't open the email window."); } }, "solid"));
    var wa = el("a", "btn small", "Share on WhatsApp"); wa.href = "#"; wa.target = "_blank"; wa.rel = "noopener"; wa.onclick = function () { wa.href = "https://wa.me/?text=" + encodeURIComponent(body().slice(0, 1700)); };
    acts.append(wa, B("Copy the links", function (b) { var t = items.map(function (i) { return (i.title || i.t) + " " + (i.link || ""); }).join("\n"); navigator.clipboard.writeText(t).then(function () { b.textContent = "Copied"; }).catch(function () { b.textContent = "Select the text to copy"; }); }, "ghost"));
    h.append(acts); to.focus();
  }
  window.WYZ_FORWARD = forward;

  /* ---------- Remove / Restore ---------- */
  async function removeFiles(files) {
    var ok = await confirmBox("Remove " + plural(files.length, "document") + " from this list?", [nameList(files), "They leave your Documents list and go to Removed, where you can restore them, or press Undo (↶). Nothing is deleted in Google Drive: this page can't delete Drive files. To delete one for real, open it in Drive."], "Remove from the list");
    if (!ok) return;
    var h = hidden(), now = Date.now();
    files.forEach(function (f) { h[f.id] = { t: f.t, link: linkOf(f), mod: f.mod || "", mime: f.mime || "", ext: f.ext || "", by: f.by || "", at: now }; delete SEL[f.id]; });
    persist(); renderDocs();
    try { toast(plural(files.length, "document") + " removed from the list."); } catch (e) {}
  }
  function restoreIds(ids) { var h = hidden(); ids.forEach(function (id) { delete h[id]; delete SEL[id]; }); persist(); renderDocs(); }

  /* ---------- the list ---------- */
  window.renderDocs = function () {
    var h = hidden(), df = drive.files, dr = docResults, shown;
    try {
      shown = (dr || df || []).filter(function (f) { return !h[f.id]; });
      drive.files = (df || []).filter(function (f) { return !h[f.id]; }); if (dr) docResults = dr.filter(function (f) { return !h[f.id]; });
      if (showRemoved) { drive.files = []; docResults = null; }
      orig.apply(this, arguments);
    } finally { drive.files = df; docResults = dr; }
    try { decorate(showRemoved ? [] : shown); } catch (e) { try { console.error("docman", e); } catch (x) {} }
  };
  function tools(list) {
    var host = $("docs"); if (!host || !host.parentNode) return;
    var t = $("docTools"); if (!t) { t = el("div", "acts"); t.id = "docTools"; t.style.cssText = "padding:0 14px 8px;align-items:center"; host.parentNode.insertBefore(t, host); }
    t.replaceChildren();
    var rem = Object.keys(hidden()).length, picked = list.filter(function (f) { return SEL[f.id]; });
    if (!showRemoved) {
      var all = B("Select all " + list.length, function () { list.forEach(function (f) { SEL[f.id] = 1; }); renderDocs(); }, "ghost"); all.disabled = !list.length;
      var clr = B("Clear", function () { SEL = {}; renderDocs(); }, "ghost"); clr.disabled = !picked.length;
      var fw = B("Forward selected (" + picked.length + ")", function () { forward(picked.map(function (f) { return { title: f.t, link: linkOf(f) }; })); }, "solid"); fw.disabled = !picked.length;
      var rm = B("Remove selected (" + picked.length + ")", function () { removeFiles(picked); }, "ghost"); rm.disabled = !picked.length;
      t.append(all, clr, fw, rm);
    }
    t.append(B(showRemoved ? "← Back to documents" : "Removed (" + rem + ")", function () { showRemoved = !showRemoved; SEL = {}; renderDocs(); }, "ghost"));
  }
  function decorate(list) {
    var host = $("docs"); if (!host) return;
    tools(list);
    if (showRemoved) { removedView(host); return; }
    var rows = [].filter.call(host.children, function (c) { return c.classList && c.classList.contains("item"); });
    rows.forEach(function (r, i) {
      var f = list[i]; if (!f) return;
      var cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = !!SEL[f.id]; cb.setAttribute("aria-label", "Select " + f.t); cb.style.cssText = "width:20px;height:20px;margin-top:3px";
      cb.onchange = function () { if (cb.checked) SEL[f.id] = 1; else delete SEL[f.id]; tools(list); };
      r.style.gridTemplateColumns = "26px minmax(0,1fr)"; r.replaceChild(cb, r.firstChild);
      var acts = r.querySelector(".acts"); if (!acts) return;
      acts.append(B("Forward", function () { forward([{ title: f.t, link: linkOf(f) }]); }), B("Remove", function () { removeFiles([f]); }, "ghost"));
      var d = el("a", "btn small ghost", "Delete in Drive ↗"); d.href = linkOf(f); d.target = "_blank"; d.rel = "noopener"; d.title = "Opens the file in Drive, where you can delete it for good"; acts.append(d);
    });
  }
  function removedView(host) {
    var h = hidden(), ids = Object.keys(h).sort(function (a, b) { return h[b].at - h[a].at; });
    $("docsHead").textContent = ids.length ? plural(ids.length, "document") + " removed from your list. Restore them here. They are still in Google Drive." : "Nothing has been removed.";
    host.replaceChildren();
    ids.forEach(function (id) {
      var f = h[id], r = el("div", "item"); r.append(el("span", "dot none")); var m = el("div", "main");
      m.append(el("span", "t", f.t), el("span", "m", "Removed " + (typeof fmtWhen === "function" ? fmtWhen(new Date(f.at).toISOString()) : new Date(f.at).toLocaleString("en-GB"))));
      var a = el("div", "acts"); a.append(B("Restore", function () { restoreIds([id]); }, "solid"), B("Forward", function () { forward([{ title: f.t, link: f.link }]); }, "ghost"));
      var d = el("a", "btn small ghost", "Delete in Drive ↗"); d.href = f.link; d.target = "_blank"; d.rel = "noopener"; a.append(d); m.append(a); r.append(m); host.append(r);
    });
    if (ids.length > 1) { var all = el("div", "acts"); all.style.padding = "8px 14px"; all.append(B("Restore all", function () { restoreIds(ids); }, "ghost")); host.append(all); }
  }
  setTimeout(function () { try { renderDocs(); } catch (e) {} }, 1500);
})();
