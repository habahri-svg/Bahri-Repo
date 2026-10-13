/* Instruct: a small "Instruct ▾" menu on every line on Today (tasks, emails, meetings, documents, files).
   Choose what to do: have the AI summarise it, plan it, write the instruction or check it for risks, or tell a team member to do it by email or WhatsApp.
   The person window: pick the person, say what you want done, add a deadline, then Write the email or open WhatsApp.
   Nothing is ever sent for you. The email opens in the usual writing window and you press Send. WhatsApp opens with the message ready.
   Each instruction is kept under "Instructions I've sent" so you can mark it done or remind them. On a task line it shows who you asked. */
(function () {
  "use strict";
  if (typeof el !== "function" || typeof infoOpen !== "function" || typeof state === "undefined") return;
  var short = function (s, n) { return typeof clip === "function" ? clip(s, n) : String(s || "").slice(0, n); };
  var B = function (t, fn, cls) { var b = el("button", "btn small" + (cls ? " " + cls : ""), t); b.type = "button"; b.onclick = function () { fn(b); }; return b; };
  var pad = function (n) { return n < 10 ? "0" + n : "" + n; };
  var ymd = function (d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
  var niceD = function (iso) { try { return new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long" }); } catch (e) { return iso; } };
  var team = function () { try { return teamList(); } catch (e) { return []; } };
  var phones = function () { state.teamPhones = state.teamPhones || {}; return state.teamPhones; };
  var digits = function (v) { var d = String(v || "").replace(/[^\d+]/g, ""); if (/^00/.test(d)) d = d.slice(2); return d.replace(/\D/g, ""); };
  var QUICK = ["Please handle this today.", "Please reply to them and copy me.", "Please arrange this and confirm when it's booked.", "Please follow up and tell me when it's done."];

  /* ---------- the window ---------- */
  function open(item, again, mode) {
    var h = infoOpen("Instruct someone");
    h.append(el("p", "status", "This writes the message for you. Nothing is sent until you press Send in your email, or Send in WhatsApp."));
    var box = el("div", "out"); box.style.cssText = "padding:8px 10px"; box.append(el("b", "", short(item.title, 120))); if (item.meta) box.append(el("div", "status", short(item.meta, 160))); h.append(box);

    h.append(el("span", "status", "Who should do it"));
    var chips = el("div", "chips"), pick = { name: "", email: "", phone: "" };
    var nameI = el("input", "in"); nameI.placeholder = "Name"; nameI.setAttribute("aria-label", "Name"); nameI.autocomplete = "off";
    var emailI = el("input", "in"); emailI.placeholder = "Email: name@company.com"; emailI.setAttribute("aria-label", "Their email"); emailI.autocomplete = "off";
    try { if (typeof attachAutocomplete === "function") attachAutocomplete(emailI, false); } catch (e) {}
    var phoneI = el("input", "in"); phoneI.placeholder = "WhatsApp number with country code, e.g. 971501234567"; phoneI.setAttribute("aria-label", "Their WhatsApp number"); phoneI.inputMode = "tel"; phoneI.autocomplete = "off";
    var remember = el("label", "status"); remember.style.cssText = "display:flex;gap:8px;align-items:center"; var rcb = document.createElement("input"); rcb.type = "checkbox"; rcb.checked = true; remember.append(rcb, document.createTextNode(" Remember this number for them"));
    var setPerson = function (p) { nameI.value = p.name || ""; emailI.value = p.email || ""; phoneI.value = p.phone || phones()[String(p.email || "").toLowerCase()] || ""; [].forEach.call(chips.children, function (c) { c.setAttribute("aria-pressed", String(c.dataset.email === (p.email || "") && !!p.email)); }); };
    team().forEach(function (p) { var c = el("button", "chip", p.name); c.type = "button"; c.dataset.email = p.email; c.setAttribute("aria-pressed", "false"); c.onclick = function () { setPerson(p); }; chips.append(c); });
    if (chips.children.length) h.append(chips);
    var row = el("div", "ask"); row.append(nameI, emailI); h.append(row, phoneI, remember);

    h.append(el("span", "status", "What you want them to do"));
    var qs = el("div", "chips"); QUICK.forEach(function (q) { var c = el("button", "chip", q); c.type = "button"; c.onclick = function () { note.value = (note.value.trim() ? note.value.trim() + " " : "") + q; note.focus(); }; qs.append(c); }); h.append(qs);
    var note = el("textarea", "in"); note.rows = 3; note.placeholder = "Write it in your own words, for example: Please call the owner today and confirm the payout date."; note.setAttribute("aria-label", "Your instruction"); note.value = again ? "Reminder: " + (again.note || "") : ""; h.append(note);

    h.append(el("span", "status", "Deadline (optional)"));
    var due = el("input", "in"); due.type = "date"; due.setAttribute("aria-label", "Deadline"); due.style.flex = "0 1 170px";
    var dr = el("div", "chips"); var d0 = new Date(); [["Today", 0], ["Tomorrow", 1], ["In 3 days", 3], ["Next week", 7]].forEach(function (x) { var c = el("button", "chip", x[0]); c.type = "button"; c.onclick = function () { var d = new Date(d0); d.setDate(d.getDate() + x[1]); due.value = ymd(d); }; dr.append(c); });
    var urg = el("label", "status"); urg.style.cssText = "display:flex;gap:8px;align-items:center"; var ucb = document.createElement("input"); ucb.type = "checkbox"; urg.append(ucb, document.createTextNode(" Mark as urgent"));
    var dl = el("div", "ask"); dl.append(due); h.append(dl, dr, urg);
    var inc = el("label", "status"); inc.style.cssText = "display:flex;gap:8px;align-items:center"; var icb = document.createElement("input"); icb.type = "checkbox"; icb.checked = true; inc.append(icb, document.createTextNode(" Include the item's details and link")); h.append(inc);

    var st = el("p", "status"); st.setAttribute("aria-live", "polite");
    function who() {
      var em = emailI.value.trim(), nm = nameI.value.trim() || (em ? em.split("@")[0] : "");
      return { name: nm, email: /^\S+@\S+\.\S+$/.test(em) ? em : "", phone: digits(phoneI.value) };
    }
    function text(forWa) {
      var w = who(), lines = [];
      lines.push((forWa ? "Hi " : "Hi ") + (w.name || "there") + ",");
      lines.push("");
      lines.push((ucb.checked ? "URGENT. " : "") + (note.value.trim() || "Please take care of this."));
      if (icb.checked) { lines.push(""); lines.push("Item: " + item.title); if (item.meta) lines.push(item.meta); if (item.link) lines.push(item.link); }
      if (due.value) { lines.push(""); lines.push("Please have it done by " + niceD(due.value) + "."); }
      lines.push(""); lines.push("Please tell me when it's done. Thank you.");
      var sg = !forWa && typeof sigText === "function" ? sigText() : ""; if (sg) { lines.push(""); lines.push(sg); }
      return lines.join("\n");
    }
    function need(kind) {
      var w = who();
      if (!w.name && !w.email && !w.phone) { st.className = "status err"; st.textContent = "Pick or type who should do it."; nameI.focus(); return null; }
      if (kind === "email" && !w.email) { st.className = "status err"; st.textContent = "Add their email address to write the email."; emailI.focus(); return null; }
      if (kind === "wa" && w.phone && w.phone.length < 8) { st.className = "status err"; st.textContent = "That WhatsApp number looks too short. Include the country code."; phoneI.focus(); return null; }
      if (!note.value.trim()) { st.className = "status err"; st.textContent = "Write what you want them to do."; note.focus(); return null; }
      st.className = "status"; st.textContent = ""; return w;
    }
    function record(via, w) {
      if (w.phone && w.email && rcb.checked) { phones()[w.email.toLowerCase()] = w.phone; }
      state.instructions = state.instructions || [];
      state.instructions.push({ id: Math.random().toString(36).slice(2, 10), key: item.key || "", title: short(item.title, 160), link: item.link || "", meta: short(item.meta || "", 160), name: w.name, email: w.email, phone: w.phone, via: via, at: Date.now(), due: due.value || "", note: note.value.trim(), done: 0 });
      persist(); try { renderInstr(); if (/^(me|td):/.test(item.key || "")) renderTasks(); } catch (e) {}
    }
    var acts = el("div", "acts");
    acts.append(B("Write the email", function () {
      var w = need("email"); if (!w) return; record("email", w); infoClose();
      try { openCompose({ to: w.email, subject: (ucb.checked ? "URGENT: " : "") + "Please do: " + short(item.title, 90), body: text(false) }); } catch (e) { toast("Couldn't open the email window."); }
    }, "solid"));
    var wa = el("a", "btn small solid", "Open WhatsApp"); wa.href = "#"; wa.target = "_blank"; wa.rel = "noopener";
    wa.onclick = function (e) { var w = need("wa"); if (!w) { e.preventDefault(); return; } wa.href = "https://wa.me/" + (w.phone || "") + "?text=" + encodeURIComponent(text(true).slice(0, 1700)); record("whatsapp", w); setTimeout(function () { st.className = "status"; st.textContent = w.phone ? "WhatsApp opened with the message ready. Press Send there." : "WhatsApp opened. Choose who to send it to, then press Send."; }, 50); };
    acts.append(wa, B("Copy the message", function (b) { var w = need(""); if (!w) return; navigator.clipboard.writeText(text(false)).then(function () { b.textContent = "Copied"; setTimeout(function () { b.textContent = "Copy the message"; }, 1500); }).catch(function () { b.textContent = "Select the text to copy"; }); }, "ghost"));
    h.append(acts, st);
    if (again) { setPerson({ name: again.name, email: again.email, phone: again.phone }); if (again.due) due.value = again.due; }
    else if (chips.children.length === 1) chips.firstChild.click();
    (mode === "wa" && !again ? phoneI : again ? note : nameI.value ? note : nameI).focus();
  }

  /* ---------- a button on every line ---------- */
  /* the AI choices run in the page's own AI window (the same one as "Ask AI about it" on a file) */
  var AI = [["Summarise it", "Summarize this in five short lines."], ["What should I do first?", "What do I need to do or decide because of this? Give me the first step and then the rest, in order."], ["Make a plan", "Break this into concrete steps. For each, say who should do it and a sensible deadline."], ["Write the instruction for my team", "Write a short, clear instruction I can send to a team member to get this done: what to do, by when, and what to report back."], ["Check it for risks", "Point out anything unusual, risky or missing that I should check before I act on this."]];
  function runAI(row, q) {
    var it = itemOf(row);
    if (typeof openFileAI !== "function") { toast("The AI window isn't available here."); return; }
    openFileAI(it.title, async function () {
      var ctx = "Item: " + it.title + (it.meta ? "\n" + it.meta : "") + (it.link ? "\nLink: " + it.link : "");
      if (row.dataset.thr && typeof threadText === "function") { try { var t = await threadText(row.dataset.thr); if (t) ctx += "\n\nThe email conversation:\n" + t; } catch (e) {} }
      return { text: ctx.slice(0, 60000) };
    });
    var qi = document.getElementById("fileAIQ"); if (qi) { qi.value = q; if (q && typeof runFileAI === "function") runFileAI(); else qi.focus(); }
  }
  function menu(row) {
    var d = document.createElement("details"); d.className = "askdd instrdd";
    var sm = document.createElement("summary"); sm.textContent = "Instruct \u25BE"; sm.title = "Choose what to do with this line"; sm.setAttribute("aria-label", "Instruct: choose what to do with this line"); d.append(sm);
    var m = el("div", "askmenu"); m.style.minWidth = "230px";
    var add = function (label, fn) { var b = document.createElement("button"); b.type = "button"; b.textContent = label; b.onclick = function () { d.open = false; fn(); }; m.append(b); };
    var hd = function (t) { var h = el("div", "status", t); h.style.cssText = "padding:6px 10px 2px;font-weight:700;font-size:12px"; m.append(h); };
    hd("Ask the AI here");
    add("Tell the AI what to do\u2026", function () { runAI(row, ""); });
    AI.forEach(function (a) { add(a[0], function () { runAI(row, a[1]); }); });
    hd("Tell someone to do it");
    add("By email\u2026", function () { open(itemOf(row), null, "email"); });
    add("On WhatsApp\u2026", function () { open(itemOf(row), null, "wa"); });
    hd("Ask in the apps");
    var it = itemOf(row), q = encodeURIComponent(("Help me with this: " + it.title + (it.meta ? " (" + it.meta + ")" : "") + ". What should I do and in what order?").slice(0, 1500));
    [["Claude (new chat)", "https://claude.ai/new?q=" + q], ["ChatGPT (new chat)", "https://chatgpt.com/?q=" + q]].forEach(function (x) { var a = document.createElement("a"); a.textContent = x[0]; a.href = x[1]; a.target = "_blank"; a.rel = "noopener"; a.onclick = function () { d.open = false; }; m.append(a); });
    d.append(m); return d;
  }
  function itemOf(row) {
    var isEv = row.classList.contains("ev"), title = "", meta = "", link = "";
    if (isEv) {
      var sp = row.querySelector("span"), a = sp && sp.querySelector("a:not(.btn)"); title = a ? a.textContent : (sp && sp.firstChild ? sp.firstChild.textContent : ""); link = a ? a.href : "";
      var tm = row.querySelector("b"); meta = "Meeting" + (tm ? " " + tm.textContent : "");
    } else {
      var t = row.querySelector(".t"); title = t ? t.textContent : ""; var m = row.querySelector(".m"); meta = m ? m.textContent : "";
      var l = row.querySelector('a[href^="http"]:not([href*="wa.me"])'); link = l ? l.href : "";
    }
    return { title: String(title).trim(), meta: String(meta).replace(/\s+/g, " ").trim(), link: link, key: row.dataset.tkey || "", thr: row.dataset.thr || "" };
  }
  function decorate(root) {
    [].forEach.call(root.querySelectorAll(".item, .ev"), function (row) {
      if (row.dataset.instr || row.closest("#info,#thr,#pvDlg,#infoBody")) return;
      var it = itemOf(row); if (!it.title) return; row.dataset.instr = "1";
      var b = menu(row); b.classList.add("instrBtn");
      if (row.classList.contains("ev")) { b.style.marginLeft = "8px"; var sp = row.querySelector("span"); (sp || row).append(b); }
      else { var acts = row.querySelector(".acts"); if (!acts) { var mn = row.querySelector(".main") || row; acts = el("div", "acts"); mn.append(acts); } acts.append(b); }
    });
  }
  var host = document.getElementById("p-today") || document.body, queued = false;
  new MutationObserver(function () { if (queued) return; queued = true; requestAnimationFrame(function () { queued = false; decorate(host); }); }).observe(host, { childList: true, subtree: true });
  decorate(host);

  /* ---------- Instructions I've sent ---------- */
  function renderInstr() {
    var c = document.getElementById("instrCard");
    if (!c) { c = el("div", "card note"); c.id = "instrCard"; var anchor = document.getElementById("handoffCard") || document.getElementById("owedCard") || document.getElementById("allSearch"); if (!anchor || !anchor.parentNode) return; anchor.parentNode.insertBefore(c, anchor); }
    var openTaskIds = {}; (state.tasks || []).forEach(function (t) { if (!t.done) openTaskIds["me:" + (t.id || t.t)] = 1; });
    var list = (state.instructions || []).filter(function (x) { if (x.done) return false; if (/^me:/.test(x.key) && !openTaskIds[x.key]) return false; return true; }).sort(function (a, b) { return b.at - a.at; });
    c.hidden = !list.length; c.replaceChildren(); if (!list.length) return;
    var p = el("div", "pad"); c.append(p);
    p.append(el("h2", "", "Instructions I've sent (" + list.length + ")"), el("span", "status", "What you asked people to do. Mark it done when they have, or remind them."));
    list.forEach(function (x) {
      var r = el("div", "item"); r.append(el("span", "dot follow")); var m = el("div", "main"); m.dataset.noinstr = "1";
      m.append(el("span", "t", x.title), el("span", "m", (x.name || x.email || x.phone) + " · by " + (x.via === "whatsapp" ? "WhatsApp" : "email") + " · " + new Date(x.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + (x.due ? " · due " + niceD(x.due) : "") + (x.note ? " · \"" + short(x.note, 70) + "\"" : "")));
      var a = el("div", "acts");
      a.append(B("Done", function () { x.done = 1; persist(); renderInstr(); try { renderTasks(); } catch (e) {} }, "solid"), B("Remind them", function () { open({ title: x.title, meta: x.meta, link: x.link, key: x.key }, x) }, "ghost"), B("Remove", function () { state.instructions = (state.instructions || []).filter(function (y) { return y.id !== x.id; }); persist(); renderInstr(); try { renderTasks(); } catch (e) {} }, "ghost"));
      m.append(a); r.append(m); p.append(r); r.dataset.instr = "1";
    });
  }
  var rt = window.renderTasks; if (typeof rt === "function") window.renderTasks = function () { var r = rt.apply(this, arguments); try { renderInstr(); } catch (e) {} return r; };
  window.WYZ_INSTRUCT = { open: open, render: renderInstr };
  var tries = 0; (function later() { renderInstr(); if (++tries < 6) setTimeout(later, 2000); })();
})();
