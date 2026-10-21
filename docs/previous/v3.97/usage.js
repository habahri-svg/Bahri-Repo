/* AI usage meter (3.82): how much of this month's Claude and ChatGPT budget has been used, in percent, with an alert at 25, 50 and 75 percent.
   Shown only to the owner (OWNER_EMAILS). Numbers come from /api/usage, which counts the tokens the page uses through the shared AI.
   It is an ESTIMATE (tokens x the price per million tokens you set, against the monthly budget you set). Neither Anthropic nor OpenAI
   publishes a live balance, so the real balance is one tap away on their billing pages. Your Claude.ai and ChatGPT chat plans are not counted. */
(function () {
  "use strict";
  if (typeof $ !== "function" || typeof el !== "function" || typeof G === "undefined") return;
  var STEPS = [25, 50, 75];
  var NAME = { claude: "Claude", chatgpt: "ChatGPT" };
  var BILL = { claude: "https://console.anthropic.com/settings/billing", chatgpt: "https://platform.openai.com/settings/organization/billing/overview" };
  var S = { state: "idle", data: null, open: false, msg: "" };
  var bar = null, lastFetch = 0;

  var usd = function (n) { return "$" + (Math.round((+n || 0) * 100) / 100).toFixed(2); };
  var tok = function (n) { n = +n || 0; return n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? Math.round(n / 1e3) + "k" : String(n); };
  var level = function (p) { return p >= 75 ? "hi" : p >= 50 ? "mid" : "lo"; };
  var step = function (p) { var s = 0; STEPS.forEach(function (t) { if (p >= t) s = t; }); return s; };
  var seenKey = function (mon, p) { return "wyz-usage-alert:" + mon + ":" + p; };
  var getSeen = function (mon, p) { try { return +localStorage.getItem(seenKey(mon, p)) || 0; } catch (e) { return 0; } };
  var setSeen = function (mon, p, v) { try { localStorage.setItem(seenKey(mon, p), String(v)); } catch (e) {} };

  function css() {
    if ($("usageCss")) return;
    var s = document.createElement("style"); s.id = "usageCss";
    s.textContent = [
      "#usageBar{margin:0 0 10px;font-size:13px}",
      "#usageBar .urow{display:flex;gap:10px;flex-wrap:wrap;align-items:center}",
      "#usageBar .utitle{color:var(--soft)}",
      "#usageBar .uchip{display:inline-flex;gap:8px;align-items:center;border:1px solid var(--line);border-radius:999px;padding:4px 12px;background:var(--panel,var(--bg));color:var(--fg);font:inherit;cursor:pointer}",
      "#usageBar .uchip b{font-weight:700}",
      "#usageBar .umeter{width:64px;height:7px;border-radius:99px;background:var(--line);overflow:hidden;display:inline-block}",
      "#usageBar .umeter i{display:block;height:100%;border-radius:99px}",
      "#usageBar .lo i{background:#1a7f4b}#usageBar .mid i{background:#b7791f}#usageBar .hi i{background:#c0392b}",
      "#usageBar .lo b{color:#1a7f4b}#usageBar .mid b{color:#b7791f}#usageBar .hi b{color:#c0392b}",
      "#usageBar .ualert{margin-top:6px;padding:8px 12px;border-radius:12px;border:1px solid var(--line);background:var(--panel,var(--bg))}",
      "#usageBar .ualert.mid{border-color:#b7791f}#usageBar .ualert.hi{border-color:#c0392b}",
      "#usageBar .upanel{margin-top:8px;padding:12px;border:1px solid var(--line);border-radius:14px;background:var(--panel,var(--bg))}",
      "#usageBar .ugrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:14px}",
      "#usageBar .ucol h4{margin:0 0 6px}",
      "#usageBar .ucol p{margin:2px 0}",
      "#usageBar label{display:block;margin:6px 0 2px;color:var(--soft);font-size:12px}",
      "#usageBar input{width:100%;max-width:120px;font:inherit;padding:5px 8px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--fg)}",
      "#usageBar .unote{color:var(--soft);font-size:12px;margin-top:8px}"
    ].join("\n");
    document.head.append(s);
  }

  async function call(method, body) {
    var t = await G.token();
    var r = await fetch("/api/usage", { method: method, headers: { Authorization: "Bearer " + t, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    var j = {}; try { j = await r.json(); } catch (e) {}
    if (r.status === 404 || r.status === 405) { var n = new Error("no server"); n.none = true; throw n; }
    if (!r.ok) throw new Error(j.error || "The usage numbers did not load.");
    return j;
  }

  /* One alert for the highest step newly reached, per AI per month. Falling back under a step (a new month, or a bigger budget) re-arms it. */
  function checkAlerts(d) {
    var out = [];
    ["claude", "chatgpt"].forEach(function (p) {
      var u = d.providers && d.providers[p]; if (!u) return;
      var now = step(u.pct), seen = getSeen(d.month, p);
      if (now > seen) {
        setSeen(d.month, p, now);
        out.push({ p: p, step: now, pct: u.pct });
      } else if (now < seen) setSeen(d.month, p, now);
    });
    return out;
  }
  function announce(list) {
    list.forEach(function (a) {
      var msg = NAME[a.p] + " use is at " + Math.round(a.pct) + "% of this month's budget (passed " + a.step + "%).";
      try { if (typeof toast === "function") toast(msg); } catch (e) {}
      try {
        if (window.Notification && Notification.permission === "granted") {
          var o = { body: msg + " Open the page for the details.", tag: "wyz-usage-" + a.p + "-" + a.step };
          if (navigator.serviceWorker && navigator.serviceWorker.ready) navigator.serviceWorker.ready.then(function (reg) { reg.showNotification("AI usage " + a.step + "%", o); }).catch(function () { new Notification("AI usage " + a.step + "%", o); });
          else new Notification("AI usage " + a.step + "%", o);
        }
      } catch (e) {}
    });
  }

  function chip(p, u) {
    var b = el("button", "uchip " + level(u.pct)); b.type = "button"; b.setAttribute("aria-expanded", String(S.open));
    var m = el("span", "umeter"), i = document.createElement("i"); i.style.width = Math.min(100, Math.max(0, u.pct)) + "%"; m.append(i);
    var t = el("span"); t.append(document.createTextNode(NAME[p] + " "), el("b", "", Math.round(u.pct) + "%"));
    b.append(m, t); b.title = "Estimated " + usd(u.cost) + " of " + usd(u.budget) + " this month. Tap for details.";
    b.onclick = function () { S.open = !S.open; draw(); };
    return b;
  }

  function field(label, val, id) {
    var w = document.createElement("div"), l = el("label", "", label), i = document.createElement("input");
    i.type = "number"; i.min = "0"; i.step = "any"; i.value = val; i.id = id; l.htmlFor = id; w.append(l, i); return w;
  }
  function panel(d) {
    var box = el("div", "upanel"), grid = el("div", "ugrid");
    ["claude", "chatgpt"].forEach(function (p) {
      var u = d.providers[p], c = el("div", "ucol");
      c.append(el("h4", "", NAME[p] + " this month"));
      c.append(el("p", "", "About " + usd(u.cost) + " of " + usd(u.budget) + " (" + u.pct + "%)"));
      c.append(el("p", "status", u.calls + " calls, " + tok(u.in) + " tokens in, " + tok(u.out) + " out"));
      c.append(field("Monthly budget (US dollars)", d.cfg.budget[p], "uB-" + p));
      c.append(field("Price per million tokens in (US dollars)", d.cfg.price[p].in, "uPi-" + p));
      c.append(field("Price per million tokens out (US dollars)", d.cfg.price[p].out, "uPo-" + p));
      var a = el("a", "", "Check the real balance"); a.href = BILL[p]; a.target = "_blank"; a.rel = "noopener"; a.style.display = "inline-block"; a.style.marginTop = "8px";
      c.append(a);
      grid.append(c);
    });
    box.append(grid);
    var row = el("div", "acts"); row.style.marginTop = "10px";
    var save = el("button", "btn small solid", "Save budget and prices"); save.type = "button";
    var st = el("span", "status", S.msg || ""); st.style.marginLeft = "8px";
    save.onclick = async function () {
      save.disabled = true; st.textContent = "Saving...";
      try {
        var n = function (id) { return $(id).value; };
        await call("POST", { budget: { claude: n("uB-claude"), chatgpt: n("uB-chatgpt") },
          price: { claude: { in: n("uPi-claude"), out: n("uPo-claude") }, chatgpt: { in: n("uPi-chatgpt"), out: n("uPo-chatgpt") } } });
        S.msg = "Saved."; await refresh(true);
      } catch (e) { st.textContent = "Couldn't save (" + ((e && e.message) || "unknown reason") + ")."; }
      save.disabled = false;
    };
    row.append(save, st); box.append(row);
    box.append(el("p", "unote", "These are estimates from the tokens this page used, times the prices above. Prices start as placeholders, so set them from your Anthropic and OpenAI price lists. Your Claude.ai and ChatGPT chat plans are not counted here. You get an alert when either AI passes 25%, 50% and 75%."));
    return box;
  }

  function draw() {
    css();
    if (!bar) {
      var anchor = $("verBar"); if (!anchor) return;
      bar = document.createElement("div"); bar.id = "usageBar"; bar.hidden = true;
      anchor.parentNode.insertBefore(bar, anchor.nextSibling);
    }
    var d = S.data;
    if (S.state === "hidden" || !d || !d.providers) { bar.hidden = true; return; }
    bar.hidden = false; bar.replaceChildren();
    var row = el("div", "urow"); row.append(el("span", "utitle", "AI use this month (estimate):"));
    row.append(chip("claude", d.providers.claude), chip("chatgpt", d.providers.chatgpt));
    bar.append(row);
    ["claude", "chatgpt"].forEach(function (p) {
      var u = d.providers[p], s = step(u.pct); if (!s) return;
      var a = el("div", "ualert " + level(u.pct), NAME[p] + " is at " + Math.round(u.pct) + "% of this month's budget" + (u.pct >= 100 ? ". The estimate is over budget, check the real balance." : "."));
      bar.append(a);
    });
    if (S.open) bar.append(panel(d));
  }

  async function refresh(force) {
    if (!force && Date.now() - lastFetch < 20000) return;
    lastFetch = Date.now();
    try {
      var j = await call("GET");
      if (j.viewer === false || j.storage === false) { S.state = "hidden"; S.data = null; draw(); return; }
      S.data = j; S.state = "ok"; draw();
      announce(checkAlerts(j));
    } catch (e) {
      if (e && e.none) S.state = "hidden";
      /* any other problem: keep showing the last numbers */
      draw();
    }
  }

  var tries = 0;
  function start() {
    var on = false; try { on = G.connected(); } catch (e) {}
    if (!on) { if (++tries < 400) setTimeout(start, 2500); return; }
    refresh(true);
    setInterval(function () { if (!document.hidden) refresh(false); }, 5 * 60 * 1000);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) refresh(false); });
    window.addEventListener("wyz-ai-status", function () { setTimeout(function () { refresh(false); }, 4000); });
  }
  window.WYZ_USAGE = { state: function () { return S; }, refresh: refresh, steps: STEPS, step: step, level: level };
  setTimeout(start, 3000);
})();
