/* Tests the page side of the free AI (docs/connectors.js): free first, and never a paid AI by itself. Run with: node tests/freeai-page.test.js */
"use strict";
const assert = require("assert"), vm = require("vm"), fs = require("fs");
const store = {};
const ls = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
const fetchLog = []; let responder = () => ({ ok: false, status: 500, json: async () => ({}) });
const sb = { console, setTimeout, clearTimeout, Promise, JSON, Date, URL, URLSearchParams, encodeURIComponent, decodeURIComponent,
  localStorage: ls, sessionStorage: ls, location: { hash: "", href: "https://x.test/", origin: "https://x.test", search: "", pathname: "/" }, navigator: {},
  document: { addEventListener() {}, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {}, append() {} }, body: { appendChild() {}, append() {} }, getElementById: () => null, querySelector: () => null },
  CustomEvent: function (n, o) { this.type = n; this.detail = o && o.detail; }, Event: function (n) { this.type = n; },
  fetch: async (url, opts) => { fetchLog.push({ url: String(url), body: opts && opts.body }); return responder(String(url), opts); } };
sb.window = sb; sb.self = sb; sb.addEventListener = () => {}; sb.dispatchEvent = () => true; sb.WYZ_CFG = {}; sb.WYZ_CONFIG = {};
vm.createContext(sb);
try { vm.runInContext(fs.readFileSync(__dirname + "/../docs/connectors.js", "utf8"), sb); } catch (e) { console.log("LOAD FAIL " + e.message); process.exit(1); }
const A = sb.Connectors.ai;
let pass = 0, fail = 0;
const t = async (n, f) => { fetchLog.length = 0; try { await f(); pass++; console.log("PASS " + n); } catch (e) { fail++; console.log("FAIL " + n + ": " + e.message); } };
const gem = (text) => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) });
(async () => {
  A.set("sk-ant-TESTCLAUDE");                     /* a paid Claude key is saved */
  await t("no free key: Claude is used and the slot is ChatGPT", () => { assert.strictEqual(A.isFree("chatgpt"), false); assert.strictEqual(A.active(), "claude"); assert.strictEqual(A.names.chatgpt, "ChatGPT"); });
  A.setOpenAI("AIzaFAKEFREEKEY1234567890abc");    /* a free Gemini key is added */
  await t("a Gemini key makes the second slot the free AI", () => { assert.strictEqual(A.isFree("chatgpt"), true); assert.strictEqual(A.names.chatgpt, "Free AI (Gemini)"); });
  await t("free goes first even though Claude is saved", () => { assert.strictEqual(A.active(), "chatgpt"); });
  await t("a question goes to Google, not to Anthropic or OpenAI", async () => {
    responder = () => gem("fine"); const s = sb.Connectors.makeSample(); const r = await s("hello", { cache: false });
    assert.strictEqual(r.text, "fine"); assert.ok(fetchLog.length === 1 && /generativelanguage\.googleapis\.com/.test(fetchLog[0].url), fetchLog.map((x) => x.url).join());
  });
  await t("when the free AI hits its limit, the paid Claude is NOT used", async () => {
    responder = (url) => /generativelanguage/.test(url) ? { ok: false, status: 429, json: async () => ({ error: { message: "Resource exhausted" } }) } : { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: "PAID" }] }) };
    const s = sb.Connectors.makeSample(); let err = null, r = null; try { r = await s("hello", { cache: false }); } catch (e) { err = e; }
    assert.ok(err, "should have failed instead of using Claude"); assert.match(err.message, /free limit/); assert.ok(fetchLog.every((x) => !/anthropic\.com/.test(x.url)), "Claude was called");
  });
  await t("free-first off: the saved Claude is used again", () => { A.setFreeFirst(false); A.setChosen("claude"); assert.strictEqual(A.active(), "claude"); A.setFreeFirst(true); });
  await t("a list broken in the middle keeps the complete items and asks Google for JSON mode", async () => {
    const broken = '{"headline":"Hi","items":[{"id":"a","st":"reply"},{"id":"b","st":"fol"low"},{"id":"c","st":"work"}]}';
    responder = () => gem(broken); const s = sb.Connectors.makeSample(); const r = await s.json("sort", { cache: false });
    assert.strictEqual(r.headline, "Hi"); assert.ok(r.items.length >= 1 && r.items[0].id === "a", JSON.stringify(r));
    assert.ok(/responseMimeType/.test(fetchLog[0].body), "JSON mode was not requested");
  });
  await t("removing the free key goes back to ChatGPT naming", () => { A.clearOpenAI(); assert.strictEqual(A.names.chatgpt, "ChatGPT"); assert.strictEqual(A.isFree("chatgpt"), false); });
  console.log(pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
})();
