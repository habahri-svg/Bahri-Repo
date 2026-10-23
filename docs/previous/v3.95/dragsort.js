/* Drag and drop to move sections (3.79).
   Every section on Today, and every card on Settings, gets a grip (⠿) next to its up and down arrows. Press and hold the
   grip, drag the section up or down, and let go. It uses the same saved order as the arrows, so the two always agree.
   Works with a mouse, a finger and a pen. The arrows still work, and the grip also answers the up and down keys. */
(function () {
  "use strict";
  if (typeof $ !== "function" || typeof el !== "function") return;

  var LISTS = [
    { /* Today: Setup, Inbox, Your week, My tasks, Research, Documents, Quick links */
      host: function () { return $("secs"); },
      items: function (h) { return [].filter.call(h.children, function (c) { return c.dataset && c.dataset.sec; }); },
      key: function (c) { return c.dataset.sec; },
      grip: function (c) { return c.querySelector(".pad > h2 .mv"); },
      save: function (keys) {
        var m = movableKeys();
        state.order = keys.filter(function (k) { return m.indexOf(k) >= 0; });
        persist(); applyOrder();
      }
    },
    { /* Settings: each card */
      host: function () { return $("p-conn"); },
      items: function () { return setCards(); },
      key: function (c) { return c.dataset.col; },
      grip: function (c) { return c.querySelector(":scope > .pad > h2 .mv"); },
      save: function (keys) { state.setOrder = keys; persist(); applySetOrder(); }
    }
  ];

  var css = [
    ".dragh{cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;letter-spacing:0;padding-inline:10px}",
    ".dragh:active{cursor:grabbing}",
    ".dragsorting{outline:3px solid var(--navy);outline-offset:3px;border-radius:18px;box-shadow:0 18px 40px rgba(0,0,0,.28);position:relative;z-index:30;opacity:.96}",
    "body.dragging-sec{cursor:grabbing;user-select:none;-webkit-user-select:none}"
  ].join("\n");
  var st = document.createElement("style"); st.textContent = css; document.head.append(st);

  var visible = function (n) { return n.offsetParent !== null; };

  function begin(list, item, grip, e) {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    var host = list.host(), raf = 0, lastY = e.clientY, moved = false;
    item.classList.add("dragsorting"); document.body.classList.add("dragging-sec");

    function place() {
      var y = lastY, sibs = list.items(host).filter(function (s) { return s !== item && visible(s); });
      for (var i = 0; i < sibs.length; i++) {
        var s = sibs[i], r = s.getBoundingClientRect(), mid = r.top + r.height / 2;
        var after = !!(s.compareDocumentPosition(item) & Node.DOCUMENT_POSITION_FOLLOWING); /* item comes after s */
        if (after && y < mid) { s.parentNode.insertBefore(item, s); moved = true; break; }
        if (!after && y > mid) { s.parentNode.insertBefore(item, s.nextSibling); moved = true; break; }
      }
    }
    function tick() {
      var h = window.innerHeight, edge = 90;
      if (lastY < edge) window.scrollBy(0, -Math.ceil((edge - lastY) / 5));
      else if (lastY > h - edge) window.scrollBy(0, Math.ceil((lastY - (h - edge)) / 5));
      place(); raf = requestAnimationFrame(tick);
    }
    function onMove(ev) { lastY = ev.clientY; }
    function end() {
      cancelAnimationFrame(raf);
      document.removeEventListener("pointermove", onMove, true); document.removeEventListener("pointerup", end, true); document.removeEventListener("pointercancel", end, true);
      item.classList.remove("dragsorting"); document.body.classList.remove("dragging-sec");
      if (moved) {
        list.save(list.items(host).map(list.key));
        if (typeof toast === "function") toast("Moved. Your order is saved.");
      }
      var g = list.grip(item); if (g) { var b = g.querySelector(".dragh"); if (b) b.focus(); }
    }
    /* listen on the whole page: moving the section moves its grip too, and the browser then drops the pointer */
    document.addEventListener("pointermove", onMove, true); document.addEventListener("pointerup", end, true); document.addEventListener("pointercancel", end, true);
    raf = requestAnimationFrame(tick);
  }

  function addGrip(list, item) {
    var mv = list.grip(item); if (!mv || mv.querySelector(".dragh")) return;
    var h = item.querySelector(":scope > .pad > h2"), name = h ? (h.firstChild && h.firstChild.textContent ? h.firstChild.textContent : h.textContent) : "section";
    name = String(name).replace(/\s+/g, " ").trim();
    var b = el("button", "btn small ghost dragh", "⠿"); b.type = "button";
    b.title = "Drag to move"; b.setAttribute("aria-label", "Drag to move: " + name + ". Or press the up and down keys.");
    b.onclick = function (e) { e.stopPropagation(); };
    b.onpointerdown = function (e) { begin(list, item, b, e); };
    b.onkeydown = function (e) {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") { e.stopPropagation(); return; }
      e.preventDefault(); e.stopPropagation();
      var arrows = mv.querySelectorAll("button.mvb"), a = arrows[e.key === "ArrowUp" ? 0 : 1];
      if (a && !a.disabled) a.click();
      setTimeout(function () { var g = list.grip(item); if (g) { var nb = g.querySelector(".dragh"); if (nb) nb.focus(); } }, 0);
    };
    mv.prepend(b);
  }

  function addAll() {
    LISTS.forEach(function (list) {
      var host = list.host(); if (!host) return;
      list.items(host).forEach(function (item) { addGrip(list, item); });
    });
  }
  addAll();
  /* sections can be rebuilt later (a refresh, a layout change): put any missing grip back */
  var t = 0;
  new MutationObserver(function () { clearTimeout(t); t = setTimeout(addAll, 150); }).observe(document.body, { childList: true, subtree: true });
})();
