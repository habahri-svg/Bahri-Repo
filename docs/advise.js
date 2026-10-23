/* Advise me: a consultant answer (what, when, how) for any decision, anywhere in the app.
   Uses the AI already connected (sample + creditFallback from app.js). No new service, no new cost. */
(function () {
  "use strict";
  var TOPICS = ["SAMOCO legal", "Kuwait company", "A09 villa", "Lebanon money", "Inheritance", "Karim", "Health", "WYZ Rent", "Tax and visas"];
  var ADV = [
    ["Whole team", "ONE joint adviser made of six experts working together: a lawyer (UAE, Lebanon, Kuwait, US), a doctor, a personal trainer, a financial adviser, a business consultant and a family and learning coach. Silently check the matter from every angle that applies (legal exposure, cash and currency, health and energy, business impact, family effect, time). Merge them into ONE clear recommendation, not six opinions. Where experts disagree, pick the safest sequence and say why in the RISK line. In the TEAM field list in a few words which experts shaped the answer.", true, []],
    ["Lawyer", "a senior commercial and property lawyer for UAE, Lebanon, Kuwait and US (Delaware) matters. Check contracts, deadlines, authority, evidence and who must sign. Name the document or office needed.", true, ["SAMOCO legal", "Kuwait company", "A09 villa", "Inheritance", "Tax and visas"]],
    ["Doctor", "a careful physician. Give practical steps, red-flag symptoms that need a doctor today, and what to ask a clinician. Never diagnose or change medication.", true, ["Health"]],
    ["Trainer", "a personal trainer and sleep and nutrition coach. Give a simple weekly plan, small daily actions and a measurable target. Adjust for age and any injury the user states.", true, ["Health"]],
    ["Financial", "a cautious financial adviser. Cover cash flow, risk, currency, fees, tax and what to confirm in writing. Never promise returns.", true, ["Lebanon money", "A09 villa", "Inheritance"]],
    ["Business", "a business consultant for short-term rentals, oil and gas, and investment. Give the decision, the numbers to check, the owner and the deadline.", false, ["WYZ Rent", "SAMOCO legal", "Kuwait company"]],
    ["Family", "a family and learning coach. Cover Karim's job search and learning, family agreements and routines. Warm, practical, one next step.", false, ["Karim"]]
  ];
  var adviser = 0;
  var pickMode = false, sheet, btn, ctxBox, qBox, out, go;

  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function clip(s, n) { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n) + "..." : s; }
  function pageName() { var h = document.querySelector("[role=tab][aria-selected=true]") || document.querySelector(".tab.on,.tab.active"); return h ? clip(h.textContent, 30) : (document.title || "this page"); }

  function build() {
    var css = document.createElement("style");
    css.textContent =
      "#advBtn{position:fixed;right:14px;bottom:14px;z-index:60;min-height:44px;padding:0 18px;border:0;border-radius:999px;background:var(--accent,#0071e3);color:#fff;font:600 14px system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.2);cursor:pointer}" +
      "#advSheet{position:fixed;right:14px;bottom:70px;z-index:61;width:min(94vw,420px);max-height:78vh;overflow:auto;background:var(--panel,#fff);color:var(--fg,#1d1d1f);border:1px solid var(--line,#d2d2d7);border-radius:18px;box-shadow:0 12px 40px rgba(0,0,0,.25);padding:14px}" +
      "#advSheet[hidden]{display:none}#advSheet h3{margin:0 0 6px;font-size:16px}" +
      "#advSheet textarea{width:100%;min-height:64px;box-sizing:border-box;border:1px solid var(--line,#d2d2d7);border-radius:12px;padding:8px;font:inherit;background:transparent;color:inherit}" +
      "#advSheet .chips{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}#advSheet .row{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}" +
      "#advSheet .ctx{font-size:12px;opacity:.7;margin:4px 0}#advSheet .ans div{margin:6px 0;line-height:1.4}#advSheet .ans b{display:inline-block;min-width:54px}" +
      "#advSheet .cav{font-size:12px;opacity:.7;margin-top:8px}.advpick{outline:3px solid var(--accent,#0071e3)!important;outline-offset:2px;cursor:crosshair}";
    document.head.appendChild(css);
    btn = el("button", null, "Advise me"); btn.id = "advBtn"; btn.type = "button"; btn.setAttribute("aria-label", "Advise me: what to do, when and how");
    sheet = el("div"); sheet.id = "advSheet"; sheet.hidden = true; sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-label", "Advise me");
    sheet.append(el("h3", null, "What should I do?"));
    ctxBox = el("div", "ctx"); sheet.append(ctxBox);
    qBox = el("textarea"); qBox.placeholder = "Describe the decision or the next step. Or tap Point at something."; sheet.append(qBox);
    var advRow = el("div", "chips"); advRow.id = "advWho";
    ADV.forEach(function (a, i) { var b = el("button", "btn small" + (i === 0 ? "" : " ghost"), a[0]); b.type = "button"; b.dataset.i = i; b.onclick = function () { setAdv(i); }; advRow.append(b); });
    sheet.append(advRow);
    var chips = el("div", "chips");
    TOPICS.forEach(function (t) { var b = el("button", "btn ghost small", t); b.type = "button"; b.onclick = function () { qBox.value = (qBox.value ? qBox.value + "\n" : "") + "Topic: " + t + ". "; qBox.focus(); }; chips.append(b); });
    sheet.append(chips);
    var row = el("div", "row");
    go = el("button", "btn", "Advise"); go.type = "button";
    var pick = el("button", "btn ghost", "Point at something"); pick.type = "button";
    var close = el("button", "btn ghost", "Close"); close.type = "button";
    row.append(go, pick, close); sheet.append(row);
    out = el("div", "ans"); sheet.append(out);
    document.body.append(btn, sheet);
    btn.onclick = function () { sheet.hidden = !sheet.hidden; if (!sheet.hidden) { refreshCtx(); qBox.focus(); } };
    close.onclick = function () { sheet.hidden = true; stopPick(); };
    pick.onclick = function () { sheet.hidden = true; startPick(); };
    go.onclick = run;
  }

  var picked = "";
  function setAdv(i) { adviser = i; Array.prototype.forEach.call(document.querySelectorAll("#advWho button"), function (b) { b.classList.toggle("ghost", +b.dataset.i !== i); }); }
  function refreshCtx() {
    var sel = ""; try { sel = String(window.getSelection() || "").trim(); } catch (e) {}
    if (sel) picked = sel;
    ctxBox.textContent = "Where: " + pageName() + (picked ? ". Selected: " + clip(picked, 90) : ".");
  }
  function over(e) { if (e.target.closest && e.target.closest("#advSheet,#advBtn")) return; document.querySelectorAll(".advpick").forEach(function (x) { x.classList.remove("advpick"); }); var t = blockOf(e.target); if (t) t.classList.add("advpick"); }
  function blockOf(n) { return n && n.closest ? (n.closest(".card,li,tr,article,.item,.row,section") || n) : null; }
  function click(e) {
    if (e.target.closest && e.target.closest("#advSheet,#advBtn")) return;
    e.preventDefault(); e.stopPropagation();
    var t = blockOf(e.target); picked = clip(t ? t.innerText : "", 900); stopPick();
    sheet.hidden = false; refreshCtx(); qBox.focus();
  }
  function startPick() { pickMode = true; document.addEventListener("mouseover", over, true); document.addEventListener("click", click, true); btn.textContent = "Tap an item"; }
  function stopPick() { pickMode = false; document.removeEventListener("mouseover", over, true); document.removeEventListener("click", click, true); document.querySelectorAll(".advpick").forEach(function (x) { x.classList.remove("advpick"); }); btn.textContent = "Advise me"; }

  async function run() {
    var q = qBox.value.trim();
    if (!q && !picked) { qBox.focus(); return; }
    out.replaceChildren();
    if (typeof sample === "undefined" || !sample) { out.append(el("p", "status", "This needs the AI. Connect Claude or ChatGPT under Settings first.")); return; }
    go.disabled = true; out.append(el("p", "status", "Thinking it through..."));
    var me = (typeof myName !== "undefined" && myName) || "Sam";
    var prompt = "You are the personal consultant of " + me + " (CEO advisor at WYZ Rent, Dubai; principal at SAMOCO). Answer as the "+ADV[adviser][0]+" adviser: "+ADV[adviser][1]+" If the matter clearly belongs to another specialty, say so in the RISK line. Today is " + new Date().toDateString() + " (Dubai).\n" +
      "Decision or step: " + (q || "(see the selected item)") + "\nPage: " + pageName() + (picked ? "\nSelected item: " + picked : "") +
      "\n\nGive exactly three short lines. WHAT to do. WHEN to do it (a concrete date or deadline). HOW to do it (the first practical step, with an official https link only if you are sure it is correct). Add one short RISK line if there is a real risk, else empty. The TEAM line is one short phrase naming the experts involved. Plain words, contractions, no em dashes, no semicolons. Never invent facts, names, amounts or links. If key information is missing, say exactly what is missing in the RISK line. Add caveat true if the topic is legal, medical or financial.\n" +
      ""+(document.documentElement.lang === "ar" ? "Write the answer values in Arabic (keep official links as they are). " : "")+"Return JSON only: {\"team\":\"\",\"what\":\"\",\"when\":\"\",\"how\":\"\",\"risk\":\"\",\"caveat\":false}";
    try {
      var a = await creditFallback(function (prov) { return sample.json(prompt, { cache: false, provider: prov }); });
      out.replaceChildren();
      var box = el("div"); [["Team", a.team], ["What", a.what], ["When", a.when], ["How", a.how], ["Risk", a.risk]].forEach(function (r) { if (!r[1]) return; var d = el("div"); var b = el("b", null, r[0] + ": "); d.append(b); linkify(d, String(r[1])); box.append(d); });
      out.append(box);
      if (a.caveat || ADV[adviser][2]) out.append(el("div", "cav", "I'm not a licensed lawyer, doctor or financial adviser. Confirm with a professional before you act."));
    } catch (e) { out.replaceChildren(el("p", "status err", "Couldn't answer (" + clip((e && e.message) || "unknown reason", 90) + ").")); }
    go.disabled = false;
  }
  function linkify(host, s) {
    var re = /https:\/\/[^\s)]+/g, last = 0, m;
    while ((m = re.exec(s))) { host.append(document.createTextNode(s.slice(last, m.index))); var a = el("a", null, m[0]); a.href = m[0]; a.target = "_blank"; a.rel = "noopener noreferrer"; host.append(a); last = m.index + m[0].length; }
    host.append(document.createTextNode(s.slice(last)));
  }
  window.wyzAdvise = function (text) { if (!sheet) return; picked = clip(text, 900); sheet.hidden = false; refreshCtx(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build); else build();
})();
