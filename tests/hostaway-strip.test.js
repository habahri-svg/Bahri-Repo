/* Tests for api/hostaway.js strip numbers. Run with: node tests/hostaway-strip.test.js */
"use strict";
const assert = require("assert");
process.env.GOOGLE_CLIENT_ID = "cid"; process.env.OWNER_EMAILS = "boss@wyzrent.com"; process.env.HOSTAWAY_ACCOUNT_ID = "1"; process.env.HOSTAWAY_API_KEY = "k";
const S = require("../api/_shared"); S.verify = async () => ({ email: "boss@wyzrent.com" });
const day = (o) => new Date(Date.now() + 4 * 3600000 + o * 86400000).toISOString().slice(0, 10);
const today = day(0), ly = (+today.slice(0, 4) - 1) + today.slice(4, 8) + "15";
global.fetch = async (url) => {
  const j = (x) => ({ ok: true, status: 200, json: async () => x });
  if (/accessTokens/.test(url)) return j({ access_token: "t", expires_in: 1000 });
  if (/listings/.test(url)) return j({ result: [{ id: 1, city: "Dubai" }, { id: 2, city: "Dubai" }] });
  if (/reservations/.test(url)) {
    const m = /departureStartDate=([\d-]+)/.exec(url)[1];
    if (m.slice(0, 4) < today.slice(0, 4)) return j({ result: [{ id: 9, listingMapId: 1, status: "confirmed", arrivalDate: ly, departureDate: ly.slice(0, 8) + "17", nights: 2, totalPrice: 1000, currency: "AED" }] });
    return j({ result: [{ id: 1, listingMapId: 1, status: "confirmed", arrivalDate: day(-1), departureDate: day(2), nights: 3, totalPrice: 3000, currency: "AED" }] });
  }
  return j({ result: [] });
};
const H = require("../api/hostaway.js");
(async () => {
  let out; const res = { setHeader() {}, status(c) { this.c = c; return this; }, json(b) { out = b; return this; } };
  await H({ headers: { authorization: "Bearer x" }, query: { fresh: 1 } }, res);
  assert.strictEqual(out.ready, true); assert.strictEqual(out.occToday, 50);   // 1 of 2 units in house
  assert.strictEqual(out.occ30, Math.round(100 * 2 / 60));                     // nights today and tomorrow of 60 unit-nights
  assert.strictEqual(out.lastYear, 1000);
  console.log("PASS hostaway strip: occupied today, next 30 days, last year"); 
})().catch((e) => { console.log("FAIL " + e.message); process.exit(1); });
