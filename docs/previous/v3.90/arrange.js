/* Arrange this page (3.79).
   A "⚙ Arrange" button at the end of the blue box opens one panel where you can, for each of these:
     - the buttons in the blue box at the top
     - the sections on Today
     - the row of shortcut chips under the tabs
   drag a row up or down to move it, and switch it off to hide it (or on to show it again). Changes apply at once and are
   saved with the rest of your settings. "Put everything back" resets all of it. The ⚙ Arrange button itself never hides. */
(function () {
  "use strict";
  if (typeof $ !== "function" || typeof el !== "function" || typeof infoOpen !== "function") return;
  var hero = document.querySelector(".herorefresh");
  if (!hero) return;

  var st = document.createElement("style");
  st.textContent = ".arr-hidden{display:none!important}" +
    ".arrrow{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--line);border-radius:12px;background:var(--panel,var(--bg))}" +
    ".arrrow.arrdrag{outline:3px solid var(--navy);box-shadow:0 10px 26px rgba(0,0,0,.22);position:relative;z-index:5}" +
    ".arrgrip{cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;min-width:40px;min-height:40px;font-size:18px}" +
    ".arrgrip:active{cursor:grabbing}" +
    ".arrrow label{display:flex;align-items:center;gap:8px;cursor:pointer;min-height:40px}" +
    ".arrrow input[type=checkbox]{width:22px;height:22px}" +
    ".arrrow.off .arrlab{opacity:.5;text-decoration:line-through}";
  document.head.append(st);

  /* ---------- the buttons in the blue box ---------- */
  var txt = function (n) { return (n.textContent || "").replace(/\s+/g, " ").trim(); };
  var keyOf = function (c) { return c.id || ("grp:" + txt(c)); };
  var labelOf = function (c) { var t = txt(c); return /Undo/.test(t) && /Redo/.test(t) ? "Undo, Redo, History" : (t || keyOf(c)); };
  var items = function () { return [].filter.call(hero.children, function (c) { return c.id !== "fresh" && c.id !== "arrangeBtn" && c.id !== "showHideBtn" && c.nodeType === 1; }); };
  var arr = function (k) { return (state && Array.isArray(state[k])) ? state[k] : []; };

  function applyButtons() {
    var its = items(), order = arr("btnOrder"), hide = arr("btnHide");
    var known = [];
    order.forEach(function (k) { var c = its.filter(function (x) { return keyOf(x) === k; })[0]; if (c) known.push(c); });
    var seq = known.concat(its.filter(function (c) { return known.indexOf(c) < 0; }));
    var same = seq.every(function (c, i) { return its[i] === c; });
    if (!same) { var anchor = $("arrangeBtn") || $("fresh"); seq.forEach(function (c) { hero.insertBefore(c, anchor); }); }
    its.forEach(function (c) { c.classList.toggle("arr-hidden", hide.indexOf(keyOf(c)) >= 0); });
  }
  function applySections() {
    var hide = arr("secHide");
    [].forEach.call(document.querySelectorAll("#secs > [data-sec]"), function (s) { s.classList.toggle("arr-hidden", hide.indexOf(s.dataset.sec) >= 0); });
    var tb = $("toolbar"); if (tb) tb.classList.toggle("arr-hidden", !!(state && state.hideChips));
  }
  function applyAll() { try { applyButtons(); applySections(); } catch (e) {} }
  window.WYZ_ARRANGE = { apply: function () { applyAll(); }, items: function () { return items(); }, keyOf: keyOf, labelOf: labelOf };

  /* the button that opens the panel */
  function addOpener() {
    if ($("arrangeBtn")) return;
    var b = el("button", "btn", "⚙️ Arrange"); b.type = "button"; b.id = "arrangeBtn";
    b.title = "Move, hide or show the buttons and sections";
    b.onclick = openPanel;
    hero.insertBefore(b, $("fresh") || null);
  }
  addOpener();
  setTimeout(applyAll, 0); setTimeout(applyAll, 1500); setTimeout(applyAll, 4000);
  var t = 0; new MutationObserver(function () { clearTimeout(t); t = setTimeout(function () { addOpener(); applyAll(); }, 120); }).observe(hero, { childList: true });

  /* ---------- the panel ---------- */
  function scroller(n) {
    for (var p = n.parentElement; p; p = p.parentElement) { var o = getComputedStyle(p).overflowY; if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight) return p; }
    return null;
  }
  /* drag one row up or down inside its list */
  function dragRow(list, row, grip, e, done) {
    e.preventDefault(); e.stopPropagation();
    var lastY = e.clientY, raf = 0, moved = false, sc = scroller(list);
    row.classList.add("arrdrag");
    function place() {
      var rows = [].filter.call(list.children, function (r) { return r !== row; });
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i], b = r.getBoundingClientRect(), mid = b.top + b.height / 2;
        var after = !!(r.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING);
        if (after && lastY < mid) { list.insertBefore(row, r); moved = true; break; }
        if (!after && lastY > mid) { list.insertBefore(row, r.nextSibling); moved = true; break; }
      }
    }
    function tick() {
      var box = sc ? sc.getBoundingClientRect() : { top: 0, bottom: window.innerHeight }, edge = 60;
      var d = lastY < box.top + edge ? -Math.ceil((box.top + edge - lastY) / 4) : lastY > box.bottom - edge ? Math.ceil((lastY - (box.bottom - edge)) / 4) : 0;
      if (d) { if (sc) sc.scrollTop += d; else window.scrollBy(0, d); }
      place(); raf = requestAnimationFrame(tick);
    }
    function mv(ev) { lastY = ev.clientY; }
    function end() {
      cancelAnimationFrame(raf);
      document.removeEventListener("pointermove", mv, true); document.removeEventListener("pointerup", end, true); document.removeEventListener("pointercancel", end, true);
      row.classList.remove("arrdrag");
      if (moved) done();
      grip.focus();
    }
    /* listen on the whole page: moving the row moves its grip too, and the browser then drops the pointer */
    document.addEventListener("pointermove", mv, true); document.addEventListener("pointerup", end, true); document.addEventListener("pointercancel", end, true);
    raf = requestAnimationFrame(tick);
  }

  /* one row: grip, name, show switch */
  function makeRow(list, name, shown, onShow, onMoved, moveByKey) {
    var row = el("div", "arrrow" + (shown ? "" : " off"));
    var g = el("button", "btn small ghost arrgrip", "⠿"); g.type = "button"; g.title = "Drag to move"; g.setAttribute("aria-label", "Drag to move: " + name + ". Or press the up and down keys.");
    g.onpointerdown = function (e) { if (e.button != null && e.button !== 0) return; dragRow(list, row, g, e, onMoved); };
    g.onkeydown = function (e) {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      var sib = e.key === "ArrowUp" ? row.previousElementSibling : row.nextElementSibling;
      if (!sib) return;
      if (e.key === "ArrowUp") list.insertBefore(row, sib); else list.insertBefore(sib, row);
      onMoved(); g.focus();
    };
    var lab = el("label"); var cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = shown; cb.setAttribute("aria-label", "Show " + name);
    var nm = el("span", "arrlab", name); nm.style.flex = "1 1 auto";
    cb.onchange = function () { row.classList.toggle("off", !cb.checked); onShow(cb.checked); };
    lab.append(cb, el("span", "status", "Show"));
    row.append(g, nm, lab); row.dataset.key = moveByKey; row.style.alignItems = "center";
    return row;
  }

  function openPanel() {
    var host = infoOpen("⚙️ Arrange this page");
    host.append(el("p", "sub", "Drag the grip (⠿) to move a row up or down. Switch a row off to hide it, and on to show it again. It changes right away and is saved for you."));

    /* buttons in the blue box */
    var sec1 = infoSection(host, "Buttons in the blue box");
    var l1 = el("div"); l1.id = "arrList"; l1.style.cssText = "display:flex;flex-direction:column;gap:8px"; sec1.append(l1);
    var order = items().map(keyOf), cur = items(); /* current order on screen */
    function saveButtons() {
      var keys = [].map.call(l1.children, function (r) { return r.dataset.key; });
      state.btnOrder = keys; persist(); applyButtons();
    }
    cur.forEach(function (c) {
      var k = keyOf(c), shown = arr("btnHide").indexOf(k) < 0;
      l1.append(makeRow(l1, labelOf(c), shown, function (on) {
        var h = arr("btnHide").filter(function (x) { return x !== k; }); if (!on) h.push(k); state.btnHide = h; persist(); applyButtons();
      }, saveButtons, k));
    });

    /* sections on Today */
    var sec2 = infoSection(host, "Sections on Today");
    var l2 = el("div"); l2.style.cssText = "display:flex;flex-direction:column;gap:8px"; sec2.append(l2);
    function saveSections() {
      var keys = [].map.call(l2.children, function (r) { return r.dataset.key; });
      var m = movableKeys(); state.order = keys.filter(function (k) { return m.indexOf(k) >= 0; }); persist(); applyOrder(); applySections();
    }
    var labels = (typeof SEC_LABEL !== "undefined") ? SEC_LABEL : {};
    secOrder().forEach(function (k) {
      var shown = arr("secHide").indexOf(k) < 0;
      l2.append(makeRow(l2, labels[k] || k, shown, function (on) {
        var h = arr("secHide").filter(function (x) { return x !== k; }); if (!on) h.push(k); state.secHide = h; persist(); applySections();
      }, saveSections, k));
    });

    /* the shortcut chips row */
    var sec3 = infoSection(host, "Shortcut chips under the tabs");
    var rowc = el("div", "arrrow"); rowc.style.alignItems = "center";
    var lab = el("label"); var cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = !(state && state.hideChips); cb.setAttribute("aria-label", "Show the shortcut chips");
    cb.onchange = function () { state.hideChips = !cb.checked; persist(); applySections(); };
    lab.append(cb, el("span", "", "Expand all, Collapse all, Setup, Inbox, Your week and the rest"));
    rowc.append(lab); sec3.append(rowc);

    var a = el("div", "acts");
    var reset = el("button", "btn small ghost", "Put everything back"); reset.type = "button";
    var armed = false;
    reset.onclick = function () {
      if (!armed) { armed = true; reset.textContent = "Confirm: put everything back"; return; }
      delete state.btnOrder; delete state.btnHide; delete state.secHide; delete state.hideChips; delete state.order; persist();
      applyOrder(); applyAll(); openPanel();
    };
    var done = el("button", "btn small solid", "Done"); done.type = "button"; done.onclick = function () { infoClose(); };
    a.append(done, reset); host.append(a);
  }
})();
