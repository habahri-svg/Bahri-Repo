/* Pages: Today, My Life, Settings and Install are separate pages, each with its own address and its own top.
   - Today:    #/today     the full header with the day's numbers and tools.
   - Settings: #/settings  its own title and a way back, without the Today tools.
   - Install:  #/install   same as Settings.
   - My Life:  #/my-life
   The browser Back and Forward buttons move between pages, a page can be bookmarked or sent as a link, and each page opens at the top.
   Nothing is removed: the tabs are the menu between pages, and every page keeps all of its content. */
(function () {
  "use strict";
  if (typeof $ !== "function" || typeof el !== "function" || typeof show !== "function") return;
  var MAP = { today: "t-today", settings: "t-conn", "my-life": "t-life", install: "t-inst" };
  var REV = {}; Object.keys(MAP).forEach(function (k) { REV[MAP[k]] = k; });
  var TITLE = { settings: "Settings", install: "Install on phone or computer" };
  var busy = false, orig = window.show;

  var st = document.createElement("style");
  st.textContent = "body[data-page=settings] .herodate,body[data-page=settings] .herosum,body[data-page=settings] .herostats,body[data-page=settings] .herorefresh,body[data-page=settings] #hello,body[data-page=install] .herodate,body[data-page=install] .herosum,body[data-page=install] .herostats,body[data-page=install] .herorefresh,body[data-page=install] #hello{display:none!important}" +
    "#pageHead{display:none;align-items:center;flex-wrap:wrap;gap:10px 14px}body[data-page=settings] #pageHead,body[data-page=install] #pageHead{display:flex}#pageHead h1{margin:0;color:#fff;font-size:26px;flex:1 1 200px}" +
    "body[data-page=settings] .hero,body[data-page=install] .hero{padding-block:14px}";
  document.head.append(st);

  var head = null;
  function ensureHead() {
    if (head) return head;
    var hello = $("hello"); if (!hello || !hello.parentNode) return null;
    head = el("div"); head.id = "pageHead";
    var h = el("h1", "", ""); h.id = "pageTitle";
    var back = el("button", "btn", "← Back to Today"); back.type = "button"; back.id = "pageBack"; back.onclick = function () { show("t-today"); };
    var rf = el("button", "btn", "↻ Refresh"); rf.type = "button"; rf.id = "pageRefresh"; rf.title = "Reload your email, calendar and tasks";
    rf.onclick = function () { var b = $("refresh"); if (b) b.click(); rf.textContent = "Refreshing..."; setTimeout(function () { rf.textContent = "↻ Refresh"; }, 2500); };
    head.append(h, rf, back); hello.parentNode.insertBefore(head, hello);
    return head;
  }
  function setPage(tid) {
    var name = REV[tid] || "today";
    document.body.setAttribute("data-page", name);
    if (TITLE[name] && ensureHead()) $("pageTitle").textContent = TITLE[name];
  }
  function tabOk(tid) { var t = $(tid); return !!t && !t.hidden; }

  window.show = function (tid) {
    var r = orig.apply(this, arguments);
    setPage(tid);
    if (!busy && REV[tid]) {
      var h = "#/" + REV[tid];
      if (location.hash !== h) { try { history.pushState({ wyzPage: tid }, "", location.pathname + location.search + h); } catch (e) {} }
      window.scrollTo(0, 0);
    }
    return r;
  };

  function fromHash() {
    var m = location.hash.match(/^#\/([a-z-]+)/), tid = m && MAP[m[1]];
    return tid && tabOk(tid) ? tid : "t-today";
  }
  window.addEventListener("popstate", function () { busy = true; try { window.show(fromHash()); } finally { busy = false; } window.scrollTo(0, 0); });

  /* open the page named in the address, if any (a link to #/settings opens Settings) */
  function start() {
    setPage("t-today");
    if (/^#\/[a-z-]+/.test(location.hash)) {
      var tid = fromHash(); busy = true;
      try { window.show(tid); } finally { busy = false; }
      if (tid === "t-today") { try { history.replaceState(null, "", location.pathname + location.search + "#/today"); } catch (e) {} }
    }
  }
  /* My Life appears a moment after sign-in, so a #/my-life link is tried again then */
  var tries = 0;
  (function late() { if (/^#\/my-life/.test(location.hash) && tabOk("t-life") && $("p-life") && $("p-life").hidden) { busy = true; try { window.show("t-life"); } finally { busy = false; } return; } if (++tries < 20) setTimeout(late, 1500); })();
  window.WYZ_PAGES = { go: function (name) { if (MAP[name]) window.show(MAP[name]); } };
  start();
})();
