/* The owner's "Fix the app" box. Only the owner sees the button (the server decides, see api/fix.js).
   Type what should change. Claude reads the code, prepares the change and shows it. Nothing goes live until
   you press Go live. Every publish gets a new version number, and the last one can be undone. */
(function () {
  "use strict";
  if (typeof $ !== "function" || typeof el !== "function" || typeof infoOpen !== "function") return;
  var KEY = "wyz-fixbox-last";
  var S = null;        /* the fix in progress: {title, base, messages, edits, log, summary, done, busy, error, live, preview} */
  var info = null;     /* what the server said about setup */
  var host = null;

  var dubai = function (iso) {
    try { return new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dubai", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) + " Dubai time"; } catch (e) { return iso; }
  };
  var short = function (p) { return String(p).replace(/^docs\//, ""); };
  var lastLive = function () { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; } };
  var saveLive = function (v) { try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch (e) {} };

  async function api(method, body) {
    var t = await G.token();
    var r = await fetch("/api/fix", { method: method, headers: { Authorization: "Bearer " + t, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    var j = {}; try { j = await r.json(); } catch (e) {}
    if (!r.ok) { var err = new Error(j.error || ("The server answered " + r.status + ".")); err.status = r.status; throw err; }
    return j;
  }

  /* ---------- Back to previous version (owner only, at the very top) ---------- */
  function backBar() {
    var bar = $("verBar"); if (!bar || $("backVer")) return;
    var b = el("button", "btn small", "↩ Back to previous version"); b.type = "button"; b.id = "backVer";
    b.title = "Put the app back to the version before this one. You can go forward again.";
    b.style.marginLeft = "10px"; b.onclick = askBack; bar.append(b);
  }
  async function askBack() {
    var h = infoOpen("↩ Back to previous version"), st = p("status", "Checking the versions...");
    h.append(st);
    var t; try { t = await G.token(); } catch (e) { st.textContent = "Sign in first."; return; }
    var get = async function (dir) { var r = await fetch("/api/fix?rollback=" + dir, { headers: { Authorization: "Bearer " + t } }); var j = {}; try { j = await r.json(); } catch (e) {} if (!r.ok) throw new Error(j.error || ("The server answered " + r.status + ".")); return j; };
    var info2; try { info2 = await get("back"); } catch (e) { st.className = "status err"; st.textContent = e.message; if (/GITHUB_TOKEN/.test(e.message)) h.append(p("status", "Add GITHUB_TOKEN in Vercel (see 🛠 Fix the app, Shortcuts), redeploy, then try again.")); return; }
    st.textContent = "Live now: version " + info2.from + (info2.fromName ? " (" + info2.fromName + ")" : "") + ".";
    h.append(p("", "Go back to version " + info2.to + (info2.toName ? ": " + info2.toName : "") + "?"));
    h.append(p("status", "All the code goes back to that version. Nothing is deleted, and you can come forward again. The page updates itself about a minute after you confirm."));
    var msg = p("status", "");
    var go = el("button", "btn small solid", "Yes, go back to " + info2.to); go.type = "button";
    var run = async function (dir, b) {
      b.disabled = true; b.textContent = "Working...";
      try {
        var r = await fetch("/api/fix", { method: "POST", headers: { Authorization: "Bearer " + t, "content-type": "application/json" }, body: JSON.stringify({ action: "rollback", dir: dir }) });
        var j = {}; try { j = await r.json(); } catch (e) {} if (!r.ok) throw new Error(j.error || ("The server answered " + r.status + "."));
        b.textContent = "Done"; msg.className = "status"; msg.textContent = "Version " + j.to + " is going live now (" + dubai(new Date().toISOString()) + "). The page reloads by itself in about a minute.";
      } catch (e) { b.disabled = false; b.textContent = "Try again"; msg.className = "status err"; msg.textContent = e.message; }
    };
    go.onclick = function () { run("back", go); };
    var a = el("div", "acts"); a.append(go);
    if (info2.canForward) { var fw = el("button", "btn small", "Undo going back"); fw.type = "button"; fw.onclick = function () { run("forward", fw); }; a.append(fw); }
    var no = el("button", "btn small ghost", "Cancel"); no.type = "button"; no.onclick = infoClose; a.append(no);
    h.append(a, msg);
  }

  /* ---------- the button ---------- */
  var tries = 0;
  function look() {
    if ($("fixBtn")) return;
    var on = false; try { on = G.connected(); } catch (e) {}
    if (!on) { if (++tries < 400) setTimeout(look, 3000); return; }
    api("GET").then(function (j) {
      if (!j || !j.owner || $("fixBtn")) return;
      info = j; backBar(); setInterval(backBar, 4000);
      var b = el("button", "btn", "🛠 Fix the app"); b.type = "button"; b.id = "fixBtn"; b.title = "Tell Claude what to change in this app";
      b.onclick = open;
      var after = $("inviteBtn");
      if (after && after.parentNode) after.parentNode.insertBefore(b, after.nextSibling);
    }).catch(function () { /* not the owner, or the function isn't there: no button */ });
  }
  setTimeout(look, 1500);

  /* ---------- the panel ---------- */
  function open() { host = infoOpen("🛠 Fix the app"); draw(); }
  function visible() { return host && host.isConnected && !$("info").hidden && $("infoTitle").textContent.indexOf("Fix the app") >= 0; }
  function p(cls, text) { var n = el("p", cls, text); n.style.margin = "0"; return n; }
  function btn(label, cls, fn) { var b = el("button", "btn small" + (cls ? " " + cls : ""), label); b.type = "button"; b.onclick = fn; return b; }

  function draw() {
    if (!visible()) return;
    host.replaceChildren();
    if (info && !info.ready) return drawSetup();
    if (!S) return drawStart();
    drawRun();
  }

  /* One-tap shortcuts to the places the owner needs for setup and upkeep. */
  function shortcuts(setup) {
    var V = "https://vercel.com/d?to=" + encodeURIComponent("/[team]/[project]/");
    var links = [
      ["🔑 Create GitHub token", "https://github.com/settings/personal-access-tokens/new", "Opens GitHub's new token page. Choose only " + ((info && info.repo) || "this repository") + ", Contents: Read and write"],
      ["⚙️ Vercel settings", V + "settings/environment-variables", "Where GITHUB_TOKEN and OWNER_EMAILS go. Vercel asks you to pick the project"],
      ["🚀 Vercel deployments", V + "deployments", "See each publish and press Redeploy"],
      ["📁 App code on GitHub", "https://github.com/" + ((info && info.repo) || ""), "Every change made to the app"],
      ["💳 Claude credit", "https://console.anthropic.com/settings/billing", "Top up the credit the AI uses"],
      ["👥 Who uses the AI", "/admin", "Your owner page"],
      ["🏷️ Brand for another company", "/brand", "Name, logo and colours for a company that buys the page"],
      ["🏨 Hostaway API key", "https://dashboard.hostaway.com/settings/hostaway-api", "For the numbers strip at the top of Today"]
    ];
    var box = el("div", "infosec"); box.append(el("h3", "", setup ? "Shortcuts to set it up" : "Shortcuts"));
    var a = el("div", "acts");
    links.forEach(function (l) { var n = el("a", "btn small" + (setup && a.childNodes.length < 2 ? " solid" : ""), l[0]); n.href = l[1]; n.target = "_blank"; n.rel = "noopener"; n.title = l[2]; a.append(n); });
    var z = el("button", "btn small solid", "⬇️ Download app code (.zip)"); z.type = "button"; z.title = "The full code: the page, the server functions and settings";
    z.onclick = function () { downloadZip(z); }; a.prepend(z);
    box.append(a); return box;
  }
  /* Whole code from GitHub. If GitHub isn't connected yet, zips the page files this site serves instead. */
  async function downloadZip(btn) {
    var old = btn.textContent; btn.disabled = true; btn.textContent = "Preparing...";
    var d = new Date(), pad = function (n) { return String(n).padStart(2, "0"); };
    var dub = new Date(d.getTime() + 4 * 3600000);
    var stamp = dub.getUTCFullYear() + "-" + pad(dub.getUTCMonth() + 1) + "-" + pad(dub.getUTCDate()) + "_" + pad(dub.getUTCHours()) + pad(dub.getUTCMinutes());
    var ver = (window.WYZ_VERSION && window.WYZ_VERSION.version) || "";
    var name = "WYZ-Execution-Page_v" + ver + "_" + stamp + ".zip", blob = null, partial = false;
    try {
      var t = await G.token();
      var r = await fetch("/api/fix?zip=1", { headers: { Authorization: "Bearer " + t } });
      if (r.ok && /zip/.test(r.headers.get("content-type") || "")) blob = await r.blob();
    } catch (e) {}
    if (!blob) {
      try {
        if (!window.JSZip) throw new Error("no zip");
        var files = ["index.html", "app.js", "connectors.js", "config.js", "version.js", "fixbox.js", "demo.js", "microsoft.js", "sw.js", "manifest.webmanifest", "admin.html", "privacy.html", "ms-redirect.html"];
        var zip = new JSZip();
        for (var i = 0; i < files.length; i++) { try { var q = await fetch(files[i] + "?t=" + Date.now(), { cache: "no-store" }); if (q.ok) zip.file("docs/" + files[i], await q.text()); } catch (e) {} }
        blob = await zip.generateAsync({ type: "blob" }); partial = true;
      } catch (e) {}
    }
    btn.disabled = false; btn.textContent = old;
    if (!blob) { if (typeof toast === "function") toast("Couldn't prepare the zip. Try again in a moment."); return; }
    var u = URL.createObjectURL(blob), l = document.createElement("a"); l.href = u; l.download = name; document.body.append(l); l.click(); l.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 60000);
    if (typeof toast === "function") toast("Downloaded " + name + (partial ? ". Page files only, add GITHUB_TOKEN in Vercel to include the server code." : ", the full code."));
  }

  function drawSetup() {
    host.append(p("status err", "One setting is still missing before the Fix box can work."));
    host.append(p("", "In Vercel, open this project, then Settings, then Environment Variables, and add: " + (info.missing || []).join(", ") + ". Then redeploy."));
    if ((info.missing || []).indexOf("GITHUB_TOKEN") >= 0) {
      host.append(p("status", "GITHUB_TOKEN is a key that lets this box save changes to the app's code. Create it at github.com, Settings, Developer settings, Fine-grained tokens. Give it access to only the repository " + info.repo + ", with the permission Contents set to Read and write. Add Deployments set to Read-only if you want preview links."));
    }
    host.append(shortcuts(true));
    host.append(p("status", "Order: 1. Create the GitHub token and copy it. 2. Open Vercel settings, add it as GITHUB_TOKEN and save. 3. Open Vercel deployments and press Redeploy on the newest one. 4. Come back and press Check again."));
    var a = el("div", "acts"); a.append(btn("Check again", "", function () { api("GET").then(function (j) { info = j; draw(); }).catch(function (e) { toast(e.message); }); })); host.append(a);
  }

  function drawStart() {
    host.append(p("status", "Tell Claude what to change, in your own words. It reads the code, prepares the change and shows it to you. Nothing goes live until you press Go live."));
    var ta = el("textarea", "in"); ta.rows = 5; ta.style.minHeight = "110px"; ta.placeholder = "Example: make the Invite button gold. Or: the Attachments list shows the oldest file first, show the newest first."; ta.setAttribute("aria-label", "What should change");
    var st = p("status", "");
    var file = document.createElement("input"); file.type = "file"; file.accept = "image/png,image/jpeg,image/webp"; file.hidden = true;
    var shot = null;
    var pick = btn("📷 Add a screenshot", "ghost", function () { file.click(); });
    file.onchange = function () {
      var f = file.files && file.files[0]; if (!f) return;
      if (f.size > 3000000) { st.className = "status err"; st.textContent = "That picture is too big. Use one under 3 MB."; return; }
      var rd = new FileReader();
      rd.onload = function () { var m = /^data:([^;]+);base64,(.*)$/.exec(String(rd.result)); if (m) { shot = { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } }; pick.textContent = "📷 Screenshot added"; st.className = "status"; st.textContent = ""; } };
      rd.readAsDataURL(f);
    };
    var go = btn("Start", "solid", function () {
      var t = ta.value.trim();
      if (t.length < 8) { st.className = "status err"; st.textContent = "Describe the change in a sentence first."; ta.focus(); return; }
      S = { title: t.replace(/\s+/g, " ").slice(0, 70), base: "", messages: [{ role: "user", content: shot ? [shot, { type: "text", text: t }] : t }], edits: [], log: [], summary: "", done: false, busy: false, error: "", steps: 0 };
      run();
    });
    var a = el("div", "acts"); a.append(go, pick, file); host.append(ta, a, st);
    var last = lastLive();
    if (last) {
      var box = el("div", "infosec"); box.append(el("h3", "", "Last fix"));
      box.append(p("status", "Version " + last.version + ", \"" + last.name + "\", published " + dubai(last.updated) + "."));
      var ua = el("div", "acts"); ua.append(undoBtn()); box.append(ua); host.append(box);
    }
    var hs = el("div", "infosec"); hs.append(el("h3", "", "Fix history"));
    var hl = el("div"); var hb = btn("Show every fix", "ghost", function () { hb.disabled = true; hb.textContent = "Loading..."; drawHistory(hl).then(function () { hb.remove(); }).catch(function (e) { hb.disabled = false; hb.textContent = "Show every fix"; toast(e.message); }); });
    var ha = el("div", "acts"); ha.append(hb); hs.append(ha, hl); host.append(hs);
    host.append(shortcuts(false));
    host.append(p("status", "Each fix uses a little of your Claude credit. Changes to sign-in, security or who can use the AI are refused here on purpose."));
  }

  function undoBtn(sha, label) {
    var armed = false, base = label || "Undo the last fix";
    var b = btn(base, "ghost", function () {
      if (!armed) { armed = true; b.textContent = "Confirm: undo it"; return; }
      b.disabled = true; b.textContent = "Undoing...";
      api("POST", sha ? { action: "undo", sha: sha } : { action: "undo" }).then(function (r) {
        saveLive(null); S = null; draw();
        host.prepend(p("", "Undone. Version " + r.version + " is live, published " + dubai(r.updated) + ". Refresh the page in about a minute."));
      }).catch(function (e) { b.disabled = false; armed = false; b.textContent = base; toast(e.message); });
    });
    return b;
  }

  async function drawHistory(box) {
    var r = await api("POST", { action: "history" });
    box.replaceChildren();
    if (!r.items || !r.items.length) { box.append(p("status", "No fixes yet.")); return; }
    r.items.forEach(function (x) {
      var row = el("div", "acts"); row.style.alignItems = "center"; row.style.borderTop = "1px solid var(--line)"; row.style.paddingTop = "6px";
      var t = el("span", "", "Version " + x.version + " · " + x.name); t.style.flex = "1 1 220px";
      var m = el("span", "status", dubai(x.date) + (x.undone ? " · undone" : "")); m.style.flex = "1 1 100%";
      row.append(t);
      if (!x.undone) row.append(undoBtn(x.sha, "Undo"));
      row.append(m); box.append(row);
    });
  }

  function drawRun() {
    host.append(p("", "“" + S.title + "”"));
    if (S.log.length) {
      var d = document.createElement("details"); d.open = !S.done;
      d.append(el("summary", "status", S.done ? "What Claude did (" + S.log.length + " steps)" : "Working..."));
      var ul = el("ul", "status"); ul.style.margin = "6px 0 0"; ul.style.paddingLeft = "18px";
      S.log.slice(-60).forEach(function (l) { ul.append(el("li", "", l)); });
      d.append(ul); host.append(d);
    }
    if (S.busy) host.append(p("status", S.log.length ? "Still working. This can take a minute or two." : "Reading the code..."));
    if (S.error) {
      host.append(p("status err", S.error));
      var ea = el("div", "acts"); ea.append(btn("Continue", "solid", run), btn("Discard", "ghost", discard)); host.append(ea);
      return;
    }
    if (!S.done) return;

    if (S.live) {
      host.append(p("", "Version " + S.live.version + " is live. Published " + dubai(S.live.updated) + "."));
      host.append(p("status", "The site takes about a minute to update. Then press Update now when it appears, or refresh the page."));
      var la = el("div", "acts"); la.append(btn("New fix", "solid", function () { S = null; draw(); }), undoBtn()); host.append(la);
      return;
    }

    var out = el("div", "out", S.summary || "Done."); host.append(out);
    if (S.edits.length) {
      var sec = el("div", "infosec"); sec.append(el("h3", "", S.edits.length === 1 ? "1 change, not live yet" : S.edits.length + " changes, not live yet"));
      S.edits.forEach(function (e) {
        var dd = document.createElement("details");
        dd.append(el("summary", "", short(e.file) + (e.why ? ": " + e.why : "")));
        var mk = function (label, text) { var w = el("div"); w.append(el("div", "status", label)); var pre = el("pre", "", text || "(nothing)"); pre.style.cssText = "white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;margin:2px 0 8px;padding:8px;border:1px solid var(--line);border-radius:6px;background:var(--bg);max-height:220px;overflow:auto"; w.append(pre); return w; };
        dd.append(mk("Before", e.old), mk("After", e.new)); sec.append(dd);
      });
      host.append(sec);
      if (S.preview) drawPreview();
      var armed = false;
      var live = btn("Go live", "solid", function () {
        if (!armed) { armed = true; live.textContent = "Confirm: publish for everyone"; return; }
        live.disabled = true; live.textContent = "Publishing...";
        api("POST", { action: "publish", target: "live", edits: S.edits, title: S.title }).then(function (r) { S.live = r; saveLive({ version: r.version, name: r.name, updated: r.updated }); draw(); })
          .catch(function (e) { live.disabled = false; armed = false; live.textContent = "Go live"; toast(e.message); });
      });
      var pv = btn(S.preview ? "Rebuild preview" : "Preview first", "", function () {
        pv.disabled = true; pv.textContent = "Building preview...";
        api("POST", { action: "publish", target: "preview", edits: S.edits, title: S.title }).then(function (r) { S.preview = { sha: r.sha, version: r.version, state: "waiting", url: "", since: Date.now() }; draw(); poll(); })
          .catch(function (e) { pv.disabled = false; pv.textContent = "Preview first"; toast(e.message); });
      });
      var a = el("div", "acts"); a.append(live, pv, btn("Discard", "ghost", discard)); host.append(a);
    } else {
      var na = el("div", "acts"); na.append(btn("Start over", "ghost", discard)); host.append(na);
    }
    var ta = el("textarea", "in"); ta.rows = 2; ta.style.minHeight = "64px"; ta.placeholder = S.edits.length ? "Not quite right? Say what to adjust." : "Answer Claude, or describe the change another way."; ta.setAttribute("aria-label", "Follow-up");
    var fa = el("div", "acts"); fa.append(btn("Send", "", function () {
      var t = ta.value.trim(); if (!t) { ta.focus(); return; }
      S.messages.push({ role: "user", content: t }); S.done = false; S.summary = ""; S.preview = null; S.steps = 0; run();
    }));
    host.append(ta, fa);
  }

  function drawPreview() {
    var pr = S.preview, box = el("div", "infosec"); box.append(el("h3", "", "Preview"));
    if (pr.state === "ready" && pr.url) {
      var link = el("a", "btn small", "Open the preview"); link.href = pr.url.replace(/\/$/, "") + "/?demo"; link.target = "_blank"; link.rel = "noopener";
      box.append(p("status", "This opens a test copy with sample data, so you can look at the change safely. Vercel may ask you to log in first. Your real page isn't touched."));
      var a = el("div", "acts"); a.append(link); box.append(a);
    } else if (pr.state === "failed") box.append(p("status err", "The preview failed to build, so don't publish this. Tell Claude what happened or discard it."));
    else if (pr.state === "unknown") box.append(p("status", "The preview is building on the branch \"fixbox-preview\". Open your Vercel project and look under Deployments to see it. (Give the GitHub token the Deployments read permission to get the link here.)"));
    else box.append(p("status", "Building the preview. This takes about a minute..."));
    host.append(box);
  }
  function poll() {
    var pr = S && S.preview; if (!pr || pr.state !== "waiting") return;
    if (Date.now() - pr.since > 240000) { pr.state = "unknown"; draw(); return; }
    setTimeout(function () {
      if (!S || S.preview !== pr) return;
      api("POST", { action: "preview_status", sha: pr.sha }).then(function (r) { pr.state = r.state === "ready" && !r.url ? "unknown" : r.state; pr.url = r.url || ""; if (pr.state === "waiting") poll(); else draw(); }).catch(function () { poll(); });
    }, 7000);
  }

  function discard() { S = null; draw(); }

  /* Keeps asking the server for the next step until Claude says it is finished. */
  async function run() {
    if (!S || S.busy) return;
    var me = S; me.busy = true; me.error = ""; draw();
    try {
      while (!me.done) {
        if (++me.steps > 40) throw new Error("This is taking too many steps. Press Continue to keep going, or discard it and ask for a smaller change.");
        var r = await api("POST", { action: "step", base: me.base, messages: me.messages, edits: me.edits });
        if (S !== me) return;
        me.base = r.base; me.messages = me.messages.concat(r.add || []); me.edits = r.edits || me.edits;
        (r.notes || []).forEach(function (n) { me.log.push(n); });
        if (r.done) { me.done = true; me.summary = r.summary || ""; }
        draw();
      }
    } catch (e) {
      if (S !== me) return;
      me.steps = 0; me.error = (e && e.message) || "Something went wrong.";
    }
    me.busy = false;
    if (S === me) draw();
    if (me.done && !visible()) { try { toast("Your fix is ready to review. Open Fix the app."); } catch (e) {} }
  }
})();
