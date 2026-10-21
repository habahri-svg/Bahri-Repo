/* Show or hide (3.85): one button in the blue bar at the top that hides and shows things at once, without opening the Arrange panel.
   - Focus mode (hides everything except the emails to reply to) can be switched off here.
   - Each section on Today, the buttons in the blue bar and the shortcut chips each have a Show switch.
   - "Show everything" puts all of it back in one tap.
   It uses the same saved settings as Arrange (secHide, btnHide, hideChips), so the two always agree.
   Also: when Focus is on, a bar under the tabs says so and has a "Show everything" button, because Focus quietly hides
   most of the page and used to look like the inbox had lost its emails. */
(function () {
  "use strict";
  if (typeof $ !== "function" || typeof el !== "function") return;
  var hero = document.querySelector(".herorefresh"); if (!hero) return;
  var S = function () { try { return state; } catch (e) { return {}; } };
  var arr = function (k) { var s = S(); return Array.isArray(s[k]) ? s[k] : []; };
  var save = function () { try { persist(); } catch (e) {} };
  var apply = function () { try { window.WYZ_ARRANGE && window.WYZ_ARRANGE.apply(); } catch (e) {} };
  var focusApply = function () { try { applyFocus(); } catch (e) { document.body.classList.toggle("focus", !!S().focus); } };

  var st = document.createElement("style");
  st.textContent = "#shPop{position:fixed;z-index:60;width:min(420px,calc(100vw - 24px));max-height:78vh;overflow:auto;background:var(--panel,var(--bg));color:var(--fg);border:1px solid var(--line);border-radius:16px;box-shadow:0 18px 44px rgba(0,0,0,.28);padding:12px 14px}" +
    "#shPop h3{margin:12px 0 6px;font-size:13px;color:var(--soft);text-transform:none;letter-spacing:0}" +
    "#shPop .shrow{display:flex;align-items:center;gap:10px;min-height:40px;border-bottom:1px solid var(--line)}" +
    "#shPop .shrow:last-child{border-bottom:0}" +
    "#shPop .shrow label{display:flex;align-items:center;gap:10px;flex:1 1 auto;cursor:pointer;min-height:40px}" +
    "#shPop input[type=checkbox]{width:22px;height:22px;flex:none}" +
    "#shPop .shrow.off .shname{opacity:.5;text-decoration:line-through}" +
    "#focusBanner{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:0 0 12px;padding:10px 14px;border:1px solid var(--gold,#b8923c);border-left-width:6px;border-radius:14px;background:var(--panel,var(--bg));color:var(--fg)}" +
    "#focusBanner[hidden]{display:none}";
  document.head.append(st);

  /* ---------- the Focus banner ---------- */
  var banner = null;
  function drawBanner() {
    var on = !!S().focus;
    if (!banner) {
      var secs = $("secs"); if (!secs || !secs.parentNode) return;
      banner = document.createElement("div"); banner.id = "focusBanner"; banner.setAttribute("role", "status"); banner.hidden = true;
      banner.append(el("b", "", "Focus is on."), el("span", "status", "You only see your top list and the emails to reply to. The rest of the page is hidden, not lost."));
      var b = el("button", "btn small solid", "Show everything"); b.type = "button";
      b.onclick = function () { var s = S(); s.focus = 0; save(); focusApply(); drawBanner(); try { toast("Focus is off. Everything is showing."); } catch (e) {} };
      banner.append(b);
      secs.parentNode.insertBefore(banner, secs);
    }
    banner.hidden = !on;
  }
  new MutationObserver(drawBanner).observe(document.body, { attributes: true, attributeFilter: ["class"] });

  /* ---------- the button and the pop-up ---------- */
  var btn = null, pop = null;
  var labelOf = function (c) { try { return window.WYZ_ARRANGE.labelOf(c); } catch (e) { return (c.textContent || "").replace(/\s+/g, " ").trim() || c.id; } };
  var keyOf = function (c) { try { return window.WYZ_ARRANGE.keyOf(c); } catch (e) { return c.id; } };
  var secKeys = function () { return [].map.call(document.querySelectorAll("#secs > [data-sec]"), function (s) { return s.dataset.sec; }); };
  function row(name, shown, onChange) {
    var r = el("div", "shrow" + (shown ? "" : " off"));
    var lab = el("label"), cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = shown; cb.setAttribute("aria-label", "Show " + name);
    var nm = el("span", "shname", name); nm.style.flex = "1 1 auto";
    cb.onchange = function () { r.classList.toggle("off", !cb.checked); onChange(cb.checked); };
    lab.append(cb, nm, el("span", "status", "Show")); r.append(lab); return r;
  }
  function toggleIn(key, k, on) { var h = arr(key).filter(function (x) { return x !== k; }); if (!on) h.push(k); S()[key] = h; save(); apply(); }
  function build() {
    pop.replaceChildren();
    var head = el("div", "headrow"); var t = el("b", "", "Show or hide"); t.style.flex = "1 1 auto";
    var close = el("button", "btn small ghost", "Close"); close.type = "button"; close.onclick = closePop; head.append(t, close); pop.append(head);
    pop.append(el("p", "status", "Switch things off to hide them, on to show them. It changes right away and is saved."));

    pop.append(el("h3", "", "Focus mode"));
    /* ticked means Focus is OFF and the whole page shows */
    pop.append(row("Show everything (Focus off)", !S().focus, function (on) { S().focus = on ? 0 : 1; save(); focusApply(); drawBanner(); }));

    pop.append(el("h3", "", "Sections on Today"));
    var labels = (typeof SEC_LABEL !== "undefined") ? SEC_LABEL : {};
    secKeys().forEach(function (k) { pop.append(row(labels[k] || k, arr("secHide").indexOf(k) < 0, function (on) { toggleIn("secHide", k, on); })); });
    pop.append(row("Shortcut chips under the tabs", !S().hideChips, function (on) { S().hideChips = !on; save(); apply(); }));

    pop.append(el("h3", "", "Buttons in the blue bar"));
    var its = []; try { its = window.WYZ_ARRANGE.items(); } catch (e) {}
    its.forEach(function (c) { var k = keyOf(c); pop.append(row(labelOf(c), arr("btnHide").indexOf(k) < 0, function (on) { toggleIn("btnHide", k, on); })); });

    var acts = el("div", "acts"); acts.style.marginTop = "10px";
    var all = el("button", "btn small solid", "Show everything"); all.type = "button";
    all.onclick = function () { var s = S(); delete s.secHide; delete s.btnHide; delete s.hideChips; s.focus = 0; save(); focusApply(); apply(); drawBanner(); build(); };
    var arrange = el("button", "btn small ghost", "More: move things around"); arrange.type = "button";
    arrange.onclick = function () { closePop(); var a = $("arrangeBtn"); if (a) a.click(); };
    acts.append(all, arrange); pop.append(acts);
  }
  function place() {
    var r = btn.getBoundingClientRect(), w = Math.min(420, window.innerWidth - 24);
    pop.style.left = Math.max(12, Math.min(r.left, window.innerWidth - w - 12)) + "px";
    pop.style.top = Math.min(r.bottom + 8, window.innerHeight - 160) + "px";
  }
  function openPop() {
    if (!pop) { pop = document.createElement("div"); pop.id = "shPop"; pop.setAttribute("role", "dialog"); pop.setAttribute("aria-label", "Show or hide"); pop.hidden = true; document.body.append(pop); }
    build(); place(); pop.hidden = false; btn.setAttribute("aria-expanded", "true");
  }
  function closePop() { if (pop) pop.hidden = true; if (btn) btn.setAttribute("aria-expanded", "false"); }
  document.addEventListener("click", function (e) { if (pop && !pop.hidden && !pop.contains(e.target) && e.target !== btn && !(btn && btn.contains(e.target))) closePop(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closePop(); });
  window.addEventListener("resize", function () { if (pop && !pop.hidden) place(); });

  function addButton() {
    if ($("showHideBtn")) return;
    btn = el("button", "btn", "👁 Show or hide"); btn.type = "button"; btn.id = "showHideBtn"; btn.setAttribute("aria-haspopup", "dialog"); btn.setAttribute("aria-expanded", "false");
    btn.title = "Hide or show the sections and buttons, and switch Focus off";
    btn.onclick = function () { if (pop && !pop.hidden) closePop(); else openPop(); };
    hero.insertBefore(btn, $("arrangeBtn") || $("fresh") || null);
  }
  addButton(); drawBanner();
  setTimeout(function () { addButton(); drawBanner(); }, 1500); setTimeout(drawBanner, 4000);
  new MutationObserver(function () { addButton(); }).observe(hero, { childList: true });
})();
