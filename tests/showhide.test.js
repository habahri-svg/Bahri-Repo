/* Tests the Show or hide button and the Focus banner (docs/showhide.js and docs/arrange.js) in a simulated page.
   Needs jsdom, so it is skipped when jsdom is not installed. Run with: node tests/showhide.test.js */
"use strict";
let JSDOM; try { ({ JSDOM } = require("jsdom")); } catch (e) { try { ({ JSDOM } = require(process.env.JSDOM_PATH)); } catch (e2) { console.log("SKIP (jsdom not installed)"); process.exit(0); } }
const fs = require("fs"), assert = require("assert");
const html = `<!doctype html><html><body><header><div class="herorefresh"><button id="focusBtn">Focus</button><button id="wrapBtn">End-of-day wrap</button><span id="fresh">x</span></div></header>
<div class="toolbar" id="toolbar"></div><div id="secs"><div data-sec="setup"></div><div data-sec="inbox"></div><div data-sec="cal"></div><div data-sec="links"></div></div></body></html>`;
const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true });
const w = dom.window;
w.eval(`
  var $ = function (id) { return document.getElementById(id); };
  var el = function (t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  var state = { done: {}, snooze: {}, tasks: [] }; var persisted = 0; function persist() { persisted++; }
  var SEC_LABEL = { setup: "Setup", inbox: "Inbox", cal: "Your week", links: "Quick links" };
  function infoOpen() { return document.createElement("div"); } function infoSection(h, t) { var d = document.createElement("div"); h.appendChild(d); return d; } function infoClose() {}
  function toast() {}
  function applyFocus() { var on = !!state.focus; document.body.classList.toggle("focus", on); }
`);
w.eval(fs.readFileSync(__dirname + "/../docs/arrange.js", "utf8"));
w.eval(fs.readFileSync(__dirname + "/../docs/showhide.js", "utf8"));
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log("PASS " + n); } catch (e) { fail++; console.log("FAIL " + n + ": " + e.message); } };
const d = w.document, $ = (id) => d.getElementById(id), st = () => w.eval("state");
const tick = () => new Promise((r) => setTimeout(r, 30));
(async () => {
  t("the button is added to the top bar and Arrange never hides it", () => { assert.ok($("showHideBtn")); assert.ok($("arrangeBtn")); assert.ok(!w.WYZ_ARRANGE.items().some((c) => c.id === "showHideBtn")); });
  t("no banner while Focus is off", () => { const b = $("focusBanner"); assert.ok(b && b.hidden); });
  w.eval("state.focus = 1; applyFocus();"); await tick();
  t("a banner appears when Focus is on", () => { assert.strictEqual($("focusBanner").hidden, false); assert.match($("focusBanner").textContent, /Focus is on/); });
  t("the banner's button switches Focus off and everything shows", () => { [...$("focusBanner").querySelectorAll("button")].find((b) => /Show everything/.test(b.textContent)).click(); assert.strictEqual(st().focus, 0); assert.ok(!d.body.classList.contains("focus")); });
  $("showHideBtn").click();
  t("the pop-up lists the sections and buttons", () => { const p = $("shPop"); assert.ok(p && !p.hidden); ["Inbox", "Setup", "Your week", "Quick links", "End-of-day wrap"].forEach((n) => assert.ok(p.textContent.includes(n), n)); });
  t("switching a section off hides it, on shows it again", () => {
    const row = [...$("shPop").querySelectorAll(".shrow")].find((r) => /Your week/.test(r.textContent)); const cb = row.querySelector("input");
    cb.checked = false; cb.dispatchEvent(new w.Event("change")); assert.ok(d.querySelector('[data-sec="cal"]').classList.contains("arr-hidden")); assert.deepStrictEqual([...st().secHide], ["cal"]);
    cb.checked = true; cb.dispatchEvent(new w.Event("change")); assert.ok(!d.querySelector('[data-sec="cal"]').classList.contains("arr-hidden"));
  });
  t("switching a top-bar button off hides it", () => {
    const row = [...$("shPop").querySelectorAll(".shrow")].find((r) => /End-of-day wrap/.test(r.textContent)); const cb = row.querySelector("input");
    cb.checked = false; cb.dispatchEvent(new w.Event("change")); assert.ok($("wrapBtn").classList.contains("arr-hidden"));
  });
  t("Show everything puts it all back", () => {
    st().focus = 1; st().hideChips = true; [...$("shPop").querySelectorAll("button")].find((b) => b.textContent === "Show everything").click();
    assert.strictEqual(st().focus, 0); assert.ok(!st().hideChips); assert.ok(!$("wrapBtn").classList.contains("arr-hidden")); assert.ok(![...d.querySelectorAll("[data-sec]")].some((s) => s.classList.contains("arr-hidden")));
  });
  console.log(pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
})();
