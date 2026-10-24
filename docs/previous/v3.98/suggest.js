/* Suggested answers (3.95).
   Every email that needs an answer gets one written for it, right on its card. Then one of three things:
     - Agree and send: the answer goes to the usual Send with the Undo countdown, no retyping.
     - Change the direction: type what you want instead ("say yes but next week", "shorter", "ask for the invoice")
       and press Rewrite. The answer is rewritten your way, then Agree and send.
     - Edit: open the full reply box with the suggested text already in it.
   Answers are written once and remembered, so a page refresh costs nothing. A new message on the thread means a
   new suggestion. At most 6 are written on their own per page load; the rest show a "Suggest an answer" button.
   Switch it off under the inbox headline. It uses the same reply prompt, the same rewrite and the same Send as
   Reply here, so nothing new can go wrong on the way out. */
(function () {
  "use strict";
  if (typeof $ !== "function" || typeof el !== "function" || typeof draftFor !== "function" || typeof writeMyWay !== "function") return;
  var MAX_AUTO = 6, autoLeft = MAX_AUTO;
  var mem = {};   /* thread text per email, kept for the rewrite */

  var st = document.createElement("style");
  st.textContent = ".sugg{margin-top:8px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:color-mix(in srgb,var(--navy) 6%,var(--bg))}" +
    ".sugg .sgh{font-weight:700;font-size:13px}" +
    ".sugg .sgt{white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px;line-height:1.45;max-height:9.5em;overflow:auto;margin:6px 0 8px}" +
    ".sugg .ask{margin-top:4px}.sugg .acts{margin-top:6px}";
  document.head.append(st);

  var on = function () { return !(state && state.suggestOff) && !!sample && !srcOff("ai"); };
  var cache = function () { state.sugg = state.sugg || {}; return state.sugg; };
  var skipped = function () { state.suggSkip = state.suggSkip || {}; return state.suggSkip; };
  var isChase = function (i) { return i.st === "follow" || i.st === "wait"; };
  var wants = function (i) { return (i.st === "reply" || isChase(i)) && !isOff(i) && !(state.done && state.done[i.id]); };

  async function threadText(i) {
    if (mem[i.id]) return mem[i.id];
    var msgs = [];
    try { var full = await mcp.callTool("Gmail", "get_thread", { threadId: i.id, messageFormat: "PLAIN_TEXT" }, { cache: false }); msgs = (full.payload && full.payload.messages) || full.messages || []; } catch (e) {}
    var text = msgs.slice(-6).map(function (x) { return "From: " + (x.sender || "") + "\nDate: " + (x.date || "") + "\n" + String(x.plaintextBody || x.plaintext_body || x.snippet || "").slice(0, 3000); }).join("\n\n---\n\n");
    mem[i.id] = { text: text, msgs: msgs };
    return mem[i.id];
  }
  /* the same prompt Reply here uses, through the same credit fallback */
  async function suggest(i) {
    var th = await threadText(i), tone = "";
    try { tone = await toneExamples(); } catch (e) {}
    var r = await creditFallback(function (prov) { return sample(replyPrompt(isChase(i), tone, th.text, i), { cache: false, provider: prov }); });
    var t = String((r && r.text) || "").trim();
    if (!t) throw new Error("the AI sent back nothing");
    var tt = tById(i.id) || {};
    cache()[i.id] = { text: t, at: Date.now(), last: tt.lastId || "" }; persist();
    return t;
  }

  function block(i, row) {
    var m = row.querySelector(".main"); if (!m || m.querySelector(".sugg") || m.querySelector(".draftbox")) return;
    if (skipped()[i.id]) return;
    var tt = tById(i.id) || {}, c = cache()[i.id];
    if (c && c.last && tt.lastId && c.last !== tt.lastId) c = null;   /* a new message arrived: write a fresh one */

    var box = el("div", "sugg"), head = el("div", "sgh", isChase(i) ? "Suggested chaser" : "Suggested answer"), txt = el("div", "sgt"), note = el("span", "status", "");
    var go = el("button", "btn small solid", "Agree and send"); go.type = "button"; go.title = "Send this answer. You get the usual Undo countdown.";
    var ed = el("button", "btn small ghost", "Edit"); ed.type = "button"; ed.title = "Open the full reply box with this text in it";
    var no = el("button", "btn small ghost", "Not now"); no.type = "button"; no.title = "Hide the suggestion for this email";
    var dir = el("input", "in"); dir.placeholder = "Change the direction, for example: say yes but next week"; dir.setAttribute("aria-label", "Change the direction of the answer"); dir.autocomplete = "off";
    var rw = el("button", "btn small", "Rewrite"); rw.type = "button"; rw.title = "Rewrite the answer in the direction you typed";
    var dirRow = el("div", "ask"); dirRow.append(dir, rw);
    var acts = el("div", "acts"); acts.append(go, ed, no);
    box.append(head, txt, dirRow, acts, note); m.append(box);

    var text = "";
    var show = function (t) { text = t; txt.textContent = t; go.disabled = false; rw.disabled = false; ed.disabled = false; };
    var busy = function (msg) { go.disabled = true; rw.disabled = true; txt.textContent = msg; note.className = "status"; note.textContent = ""; };
    var failed = function (e, retry) {
      txt.textContent = ""; go.disabled = true; rw.disabled = true;
      note.className = "status err"; note.textContent = "Couldn't write a suggestion (" + clip((e && e.message) || "unknown reason", 90) + ").";
      var again = el("button", "btn small ghost", "Try again"); again.type = "button"; again.onclick = function () { again.remove(); retry(); }; acts.prepend(again);
    };
    var write = function () { busy("Writing a suggested answer..."); suggest(i).then(show).catch(function (e) { failed(e, write); }); };
    if (c) show(c.text);
    else if (autoLeft > 0) { autoLeft--; write(); }
    else {
      go.disabled = true; rw.disabled = true; ed.disabled = true;
      var sg = el("button", "btn small", "Suggest an answer"); sg.type = "button";
      sg.onclick = function () { sg.remove(); write(); }; acts.prepend(sg);
    }

    /* the full reply box, built only when needed, starting from the text shown here */
    var editor = null;
    async function openEditor() {
      if (editor && editor.isConnected) return editor;
      var fake = el("button", "btn small", "Reply here"); fake.type = "button"; m.append(fake);
      await draftFor(i, m, fake, text);
      var boxes = m.querySelectorAll(".draftbox"); editor = boxes[boxes.length - 1] || null;
      return editor;
    }
    go.onclick = async function () {
      if (!text) return;
      go.disabled = true; go.textContent = "Preparing...";
      var e = null; try { e = await openEditor(); } catch (x) {}
      var ta = e && e.querySelector("textarea");
      var sd = e && [].filter.call(e.querySelectorAll("button"), function (b) { return b.textContent === "Send"; })[0];
      if (!e || !ta || !sd) { go.disabled = false; go.textContent = "Agree and send"; note.className = "status err"; note.textContent = "Couldn't open the reply. Use Reply here instead."; return; }
      if (ta.value.trim() !== text.trim()) ta.value = text;
      box.remove();
      sd.click();                                         /* Confirm: send to ... */
      if (/^Confirm/.test(sd.textContent)) sd.click();    /* starts the Undo countdown, same as pressing Confirm */
      try { e.scrollIntoView({ block: "nearest", behavior: "smooth" }); } catch (x) {}
    };
    ed.onclick = async function () {
      if (!text) return;
      ed.disabled = true; ed.textContent = "Opening...";
      try { await openEditor(); box.remove(); } catch (x) { ed.disabled = false; ed.textContent = "Edit"; }
    };
    rw.onclick = async function () {
      var d = dir.value.trim(); if (!d) { dir.focus(); return; }
      rw.disabled = true; go.disabled = true; note.className = "status"; note.textContent = "Rewriting...";
      var th = await threadText(i);
      await writeMyWay(d, isChase(i), th.text,
        function (t) { show(t); var k = cache()[i.id] || {}; k.text = t; k.at = Date.now(); k.last = (tById(i.id) || {}).lastId || k.last || ""; cache()[i.id] = k; persist(); },
        function (msg, err) { note.className = "status" + (err ? " err" : ""); note.textContent = msg || ""; }, i);
      rw.disabled = false; go.disabled = !text; dir.value = "";
    };
    dir.addEventListener("keydown", function (e) { if (e.key === "Enter") rw.click(); });
    no.onclick = function () { skipped()[i.id] = 1; persist(); box.remove(); };
  }

  /* the switch, under the inbox headline */
  function addSwitch() {
    if ($("suggSwitch")) return;
    var h = $("headline"); if (!h || !h.parentNode) return;
    var lab = el("label", "status"); lab.id = "suggSwitch"; lab.style.display = "block";
    var cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = !(state && state.suggestOff);
    cb.onchange = function () { state.suggestOff = !cb.checked; persist(); if (!cb.checked) [].forEach.call(document.querySelectorAll(".sugg"), function (n) { n.remove(); }); else scan(); };
    lab.append(cb, document.createTextNode(" Suggest answers for me, so I can agree and send, or change the direction"));
    h.after(lab);
  }

  function scan() {
    addSwitch();
    if (!on()) return;
    var items; try { items = allItems(); } catch (e) { return; }
    [].forEach.call(document.querySelectorAll("#board .item[data-thr]"), function (row) {
      var id = row.dataset.thr, i = null;
      for (var k = 0; k < items.length; k++) if (items[k].id === id) { i = items[k]; break; }
      if (i && wants(i)) block(i, row);
    });
  }
  var t = 0;
  var kick = function () { clearTimeout(t); t = setTimeout(scan, 200); };
  var host = $("board");
  if (host) new MutationObserver(kick).observe(host, { childList: true, subtree: true });
  kick();
})();
