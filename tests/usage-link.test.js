/* Tests the "All subscriptions" link next to the AI use chips (docs/usage.js, setting USAGE_METER_URL in docs/config.js) in a simulated page.
   Needs jsdom, so it is skipped when jsdom is not installed. Run with: node tests/usage-link.test.js */
"use strict";
let JSDOM; try { ({ JSDOM } = require("jsdom")); } catch (e) { try { ({ JSDOM } = require(process.env.JSDOM_PATH)); } catch (e2) { console.log("SKIP (jsdom not installed)"); process.exit(0); } }
const fs = require("fs"), assert = require("assert");
const src = fs.readFileSync(__dirname + "/../docs/usage.js", "utf8");
const data = {
  viewer: true, storage: true, month: "2026-10",
  providers: { claude: { pct: 10, cost: 1, budget: 10, calls: 1, in: 100, out: 50 }, chatgpt: { pct: 20, cost: 2, budget: 10, calls: 2, in: 200, out: 80 } },
  cfg: { budget: { claude: 10, chatgpt: 10 }, price: { claude: { in: 3, out: 15 }, chatgpt: { in: 2, out: 8 } } }
};

/* Loads usage.js into a fresh simulated page with the given USAGE_METER_URL and gives back the page once the bar has been drawn. */
async function load(url, viewer) {
  const dom = new JSDOM('<!doctype html><html><body><div id="verBar"></div></body></html>', { url: "https://example.test/", runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  const real = w.setTimeout.bind(w);
  w.setTimeout = (f, ms) => real(f, ms >= 3000 ? 5 : ms);          /* the page waits 3 seconds before it starts */
  w.setInterval = () => 0;
  w.fetch = async () => ({ ok: true, status: 200, json: async () => Object.assign({}, data, viewer === false ? { viewer: false } : {}) });
  w.WYZ_CONFIG = url === undefined ? {} : { USAGE_METER_URL: url };
  w.eval(`
    var $ = function (id) { return document.getElementById(id); };
    var el = function (t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
    var G = { connected: function () { return true; }, token: async function () { return "t"; } };
  `);
  w.eval(src);
  await new Promise((r) => real(r, 120));
  return w.document;
}

let pass = 0, fail = 0;
const t = async (n, f) => { try { await f(); pass++; console.log("PASS " + n); } catch (e) { fail++; console.log("FAIL " + n + ": " + e.message); } };

(async () => {
  await t("the usage bar still shows the Claude and ChatGPT chips", async () => {
    const d = await load("");
    assert.strictEqual(d.querySelectorAll("#usageBar button.uchip").length, 2);
  });
  await t("a claude.ai address adds the All subscriptions link, opening in a new tab", async () => {
    const d = await load("https://claude.ai/artifact/abc123");
    const a = d.getElementById("usageMeterLink");
    assert.ok(a, "link missing");
    assert.strictEqual(a.getAttribute("href"), "https://claude.ai/artifact/abc123");
    assert.strictEqual(a.target, "_blank");
    assert.match(a.rel, /noopener/);
    assert.match(a.textContent, /All subscriptions/);
  });
  await t("no address, no link", async () => { assert.ok(!(await load("")).getElementById("usageMeterLink")); assert.ok(!(await load(undefined)).getElementById("usageMeterLink")); });
  await t("an address that is not claude.ai gives no link", async () => {
    for (const u of ["https://evil.example/claude.ai/", "http://claude.ai/artifact/x", "javascript:alert(1)", "//claude.ai/x"]) assert.ok(!(await load(u)).getElementById("usageMeterLink"), u);
  });
  await t("a viewer who is not the owner sees no bar and no link", async () => {
    const d = await load("https://claude.ai/artifact/abc123", false);
    assert.ok(!d.getElementById("usageMeterLink"));
    const bar = d.getElementById("usageBar"); assert.ok(!bar || bar.hidden);
  });
  console.log(pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
