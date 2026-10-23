/* Version switcher: a slim bar at the very top with Back and Forward between published versions.
   Every version is a complete copy of the page. The current one lives in docs/, older ones in docs/previous/<version>/.
   Your data is shared between them (same sign-in, same saved board), so going back never loses anything.
   To archive a version when you publish a new one, see "Going back to an earlier version" in EXECUTION-PAGE.md.
   This file is shared. Both the current page and every archived copy load it. */
(function () {
  "use strict";
  var me = document.currentScript;
  var base = me && me.src ? me.src.replace(/[^\/]*$/, "") : "";
  if (!base || window.WYZ_NO_VERSION_BAR) return;
  function build(list) {
    var cur = String((window.WYZ_VERSION && window.WYZ_VERSION.version) || "");
    var ix = -1;
    list.forEach(function (v, i) { if (String(v.version) === cur) ix = i; });
    /* the live page is always the entry with an empty path. If it was republished (new number), it takes that number */
    if (ix < 0) { list.forEach(function (v, i) { if (!v.path) { v.version = cur; ix = i; } }); }
    if (ix < 0 || !cur) return;
    var back = list[ix - 1], fwd = list[ix + 1], here = list[ix];
    var st = document.createElement("style");
    st.textContent = ".vsw{display:flex;flex-wrap:wrap;align-items:center;gap:8px;max-width:900px;margin:0 auto 10px;padding:6px 10px;border:1px solid var(--line,#dbe5ee);border-radius:10px;background:var(--panel,#fff);font:13px/1.3 var(--font,system-ui,sans-serif);color:var(--fg,#0e2238)}" +
      ".vsw b{color:var(--navy,#104b70)}.vsw .vsn{flex:1 1 140px;min-width:0;color:var(--soft,#56697c);overflow-wrap:anywhere}" +
      ".vsw a,.vsw span.vsb{display:inline-flex;align-items:center;gap:5px;min-height:34px;padding:0 12px;border:1px solid var(--navy,#104b70);border-radius:6px;background:var(--panel,#fff);color:var(--navy,#104b70);font-weight:700;font-size:13px;text-decoration:none;white-space:nowrap}" +
      ".vsw a:hover{background:var(--sky,#e8f2fa)}.vsw span.vsb{opacity:.4;border-color:var(--line,#dbe5ee)}" +
      ".vsw.old{border-color:var(--gold,#b8923c);background:color-mix(in srgb,var(--gold,#b8923c) 14%,var(--panel,#fff))}" +
      "body.demo-on .vsw{margin-top:0}";
    document.head.appendChild(st);
    var bar = document.createElement("div");
    bar.className = "vsw" + (fwd ? " old" : ""); bar.id = "versionSwitch"; bar.setAttribute("role", "navigation"); bar.setAttribute("aria-label", "Switch version");
    var keep = location.search || "";
    var go = function (v, txt, arrow) {
      var a = document.createElement("a");
      a.href = base + (v.path || "") + keep; a.title = txt + (v.label ? ": " + v.label : "");
      a.textContent = arrow === "back" ? "◀ Back to " + v.version : "Forward to " + v.version + " ▶";
      return a;
    };
    var off = function (txt) { var s = document.createElement("span"); s.className = "vsb"; s.textContent = txt; s.setAttribute("aria-disabled", "true"); return s; };
    bar.append(back ? go(back, "Go back to the earlier version", "back") : off("◀ Back"));
    var note = document.createElement("span"); note.className = "vsn";
    var b = document.createElement("b"); b.textContent = "Version " + here.version;
    note.append(b, document.createTextNode(fwd ? " (an earlier version, your data is the same)" : " (latest)" ));
    bar.append(note);
    bar.append(fwd ? go(fwd, "Go forward to the newer version", "fwd") : off("Forward ▶"));
    function put() { var w = document.body; if (!w || document.getElementById("versionSwitch")) return; var first = w.querySelector(".wrap"); first ? w.insertBefore(bar, first) : w.prepend(bar); }
    if (document.body) put(); else document.addEventListener("DOMContentLoaded", put);
    /* the demo ribbon (when present) stays on top */
  }
  fetch(base + "versions.json?t=" + Date.now(), { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) { if (j && Array.isArray(j.versions)) build(j.versions); }).catch(function () {});
})();
