/* Tests for the free AI (Gemini) path in api/chatgpt.js. Run with: node tests/freeai.test.js  (no packages needed) */
"use strict";
const assert = require("assert");
process.env.GOOGLE_CLIENT_ID = "cid"; process.env.ALLOWED_EMAILS = "boss@wyzrent.com"; process.env.GEMINI_API_KEY = "AIzaTESTKEY";
delete process.env.OPENAI_API_KEY;
const S = require("../api/_shared.js");
const calls = [];
global.fetch = async (url, opts) => {
  if (/oauth2\.googleapis\.com/.test(url)) return { ok: true, json: async () => ({ aud: "cid", email: "boss@wyzrent.com", email_verified: "true", expires_in: 300 }) };   /* the Google sign-in check */
  calls.push({ url, opts }); return global.__next();
};
const H = require("../api/chatgpt.js");
const run = async (method, body) => { const out = {}; const res = { setHeader() {}, status(c) { out.code = c; return this; }, json(j) { out.body = j; return this; } };
  await H({ method, headers: { authorization: "Bearer t" }, body }, res); return out; };
const ok = (obj) => ({ ok: true, status: 200, text: async () => JSON.stringify(obj) });
const bad = (status, obj) => ({ ok: false, status, text: async () => JSON.stringify(obj) });
let pass = 0, fail = 0;
const t = async (n, f) => { calls.length = 0; try { await f(); pass++; console.log("PASS " + n); } catch (e) { fail++; console.log("FAIL " + n + ": " + e.message); } };
(async () => {
  await t("GET says it is ready and names the free AI", async () => { const r = await run("GET"); assert.strictEqual(r.body.ok, true); assert.match(r.body.label, /Gemini/); });
  await t("a reply comes back in the same shape as Claude", async () => {
    global.__next = () => ok({ candidates: [{ content: { parts: [{ text: "Hello " }, { text: "Sam" }] } }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2 } });
    const r = await run("POST", { messages: [{ role: "user", content: "hi" }, { role: "assistant", content: "yo" }, { role: "user", content: "again" }] });
    assert.strictEqual(r.code, 200); assert.strictEqual(r.body.content[0].text, "Hello Sam");
    const sent = JSON.parse(calls[0].opts.body); assert.deepStrictEqual(sent.contents.map((c) => c.role), ["user", "model", "user"]);
    assert.strictEqual(calls[0].opts.headers["x-goog-api-key"], "AIzaTESTKEY"); assert.match(calls[0].url, /generativelanguage\.googleapis\.com/);
  });
  await t("it never calls OpenAI", async () => { assert.ok(calls.every((c) => !/openai\.com/.test(c.url))); });
  await t("the free limit gives a plain message and 429", async () => {
    global.__next = () => bad(429, { error: { message: "Resource exhausted" } });
    const r = await run("POST", { messages: [{ role: "user", content: "hi" }] });
    assert.strictEqual(r.code, 429); assert.match(r.body.error, /free limit/); assert.ok(!/credit|billing|quota/i.test(r.body.error));
  });
  await t("a refused key is explained", async () => {
    global.__next = () => bad(400, { error: { message: "API key not valid" } });
    const r = await run("POST", { messages: [{ role: "user", content: "hi" }] }); assert.match(r.body.error, /rejected the free AI key/);
  });
  console.log(pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
})();
