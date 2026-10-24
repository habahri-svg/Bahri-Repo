/* Tests for api/usage.js and the alert steps in docs/usage.js. Run with: node tests/usage.test.js  (no packages needed) */
"use strict";
const assert = require("assert");
const vm = require("vm");
const fs = require("fs");
process.env.GOOGLE_CLIENT_ID = "cid"; process.env.OWNER_EMAILS = "boss@wyzrent.com";
const S = require("../api/_shared.js");
let hash = [], cfg = null, saved = null;
S.verify = async (t) => (t === "owner" ? { email: "boss@wyzrent.com" } : { email: "other@x.com" });
S.store = () => ({});
S.redis = async (cmds) => cmds.map((c) => c[0] === "HGETALL" ? hash : c[0] === "GET" ? cfg : c[0] === "SET" ? (saved = c[2], "OK") : null);
const H = require("../api/usage.js");
const call = async (method, token, body) => { let out = {}; const res = { setHeader() {}, status(c) { out.code = c; return this; }, json(j) { out.body = j; return this; } };
  await H({ method, headers: { authorization: "Bearer " + token }, body }, res); return out; };
let pass = 0, fail = 0;
const t = async (n, f) => { try { await f(); pass++; console.log("PASS " + n); } catch (e) { fail++; console.log("FAIL " + n + ": " + e.message); } };
(async () => {
  await t("percent of budget from tokens and prices", async () => {
    hash = ["claude_in", "2000000", "claude_out", "400000", "claude_calls", "40", "chatgpt_in", "200000", "chatgpt_out", "0"];
    const r = await call("GET", "owner");
    assert.strictEqual(r.body.providers.claude.cost, 12);
    assert.strictEqual(r.body.providers.claude.pct, 60);
    assert.strictEqual(r.body.providers.chatgpt.pct, 2.5);
  });
  await t("only the owner sees it", async () => { const r = await call("GET", "x"); assert.strictEqual(r.body.viewer, false); });
  await t("saved budget changes the percent", async () => {
    cfg = JSON.stringify({ budget: { claude: 40 } });
    const r = await call("GET", "owner"); assert.strictEqual(r.body.providers.claude.pct, 30);
  });
  await t("bad numbers are ignored, good ones saved", async () => {
    cfg = null; await call("POST", "owner", { budget: { claude: -5, chatgpt: 50 } });
    const c = JSON.parse(saved); assert.strictEqual(c.budget.claude, 20); assert.strictEqual(c.budget.chatgpt, 50);
  });
  const ctx = { window: {}, document: { getElementById() { return null; }, addEventListener() {}, hidden: false, head: { append() {} } }, localStorage: { getItem() { return null; }, setItem() {} },
    $: () => null, el: () => ({}), G: {}, setTimeout() {}, setInterval() {}, console };
  ctx.window = ctx; vm.createContext(ctx); vm.runInContext(fs.readFileSync(__dirname + "/../docs/usage.js", "utf8"), ctx);
  const U = ctx.WYZ_USAGE;
  await t("steps 25, 50, 75", () => { [[0, 0], [24.9, 0], [25, 25], [49, 25], [50, 50], [74.9, 50], [75, 75], [130, 75]].forEach(([p, s]) => assert.strictEqual(U.step(p), s, p + " -> " + s)); });
  await t("colour levels", () => { assert.strictEqual(U.level(10), "lo"); assert.strictEqual(U.level(50), "mid"); assert.strictEqual(U.level(75), "hi"); });
  console.log(pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
})();
