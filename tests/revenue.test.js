/* Tests for api/revenue.js. Run with: node tests/revenue.test.js  (no packages needed) */
"use strict";
const assert = require("assert");
process.env.GOOGLE_CLIENT_ID = "cid"; process.env.OWNER_EMAILS = "boss@wyzrent.com"; process.env.HOSTAWAY_ACCOUNT_ID = "1"; process.env.HOSTAWAY_API_KEY = "k";
const H = require("../api/revenue.js");
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log("PASS " + name); } catch (e) { fail++; console.log("FAIL " + name + ": " + e.message); } };
const row = (o) => Object.assign({ status: "confirmed", listingMapId: 1, reservationId: Math.random() }, o);

(async () => {
  await t("a stay across two months is split by nights", () => {
    const m = H.allocate([row({ arrivalDate: "2026-01-30", departureDate: "2026-02-02", rentalRevenue: 300, propertyManagerPayout: 90 })], 2026);
    assert.strictEqual(m[0].revenue, 200); assert.strictEqual(m[1].revenue, 100); assert.strictEqual(m[0].net, 60); assert.strictEqual(m[1].net, 30);
    assert.strictEqual(m[0].bookedNights, 2); assert.strictEqual(m[1].bookedNights, 1);
  });
  await t("only nights inside the year count (stay from the year before)", () => {
    const m = H.allocate([row({ arrivalDate: "2025-12-30", departureDate: "2026-01-03", rentalRevenue: 400 })], 2026);
    assert.strictEqual(m[0].revenue, 200); assert.strictEqual(m[0].bookedNights, 2);
    const p = H.allocate([row({ arrivalDate: "2025-12-30", departureDate: "2026-01-03", rentalRevenue: 400 })], 2025);
    assert.strictEqual(p[11].revenue, 200);
  });
  await t("cancelled, declined, inquiry, pending bookings are left out", () => {
    const rows = ["cancelled", "declined", "expired", "inquiry", "pending", "awaitingPayment", "unknown"].map((s) => row({ status: s, arrivalDate: "2026-03-01", departureDate: "2026-03-03", rentalRevenue: 1000 }));
    assert.strictEqual(H.allocate(rows, 2026)[2].revenue, 0);
  });
  await t("the same reservation seen in two report windows counts once", () => {
    const r = row({ reservationId: 7, arrivalDate: "2026-04-10", departureDate: "2026-04-12", rentalRevenue: 100 });
    assert.strictEqual(H.allocate([r, Object.assign({}, r)], 2026)[3].revenue, 100);
  });
  await t("missing payout is counted as missing, never guessed", () => {
    const m = H.allocate([row({ arrivalDate: "2026-05-01", departureDate: "2026-05-04", rentalRevenue: 300 })], 2026);
    assert.strictEqual(m[4].net, 0); assert.strictEqual(m[4].netMissingNights, 3); assert.strictEqual(m[4].revenue, 300);
  });
  await t("a same-day stay counts as one night; bad dates are skipped", () => {
    const m = H.allocate([row({ arrivalDate: "2026-06-05", departureDate: "2026-06-05", rentalRevenue: 50 }), row({ arrivalDate: "garbage", departureDate: "2026-06-05", rentalRevenue: 999 })], 2026);
    assert.strictEqual(m[5].revenue, 50);
  });
  await t("listing count per month", () => {
    const m = H.allocate([row({ listingMapId: 1, arrivalDate: "2026-07-01", departureDate: "2026-07-02", rentalRevenue: 1 }), row({ listingMapId: 2, arrivalDate: "2026-07-01", departureDate: "2026-07-02", rentalRevenue: 1 })], 2026);
    assert.strictEqual(m[6].listings, 2);
  });
  await t("rows are found whatever the report wraps them in", () => {
    const r = [{ arrivalDate: "2026-01-01" }];
    assert.strictEqual(H.rowsOf({ result: r }).length, 1); assert.strictEqual(H.rowsOf({ result: { rows: r } }).length, 1); assert.strictEqual(H.rowsOf(r).length, 1); assert.strictEqual(H.rowsOf({ result: [] }).length, 0);
  });

  /* the handler, with Google and Hostaway mocked */
  const realFetch = global.fetch; let hostawayFail = 0, calls = 0, reportCalls = [];
  global.fetch = async (url, opt) => {
    url = String(url); const json = (o, s) => ({ ok: !s || s < 400, status: s || 200, json: async () => o });
    if (url.indexOf("oauth2.googleapis.com/tokeninfo") >= 0) { const tok = decodeURIComponent(url.split("access_token=")[1]); const e = tok === "ya29.boss" ? "boss@wyzrent.com" : "viewer@x.com"; return json({ aud: "cid", email: e, email_verified: "true", expires_in: 300 }); }
    if (url.endsWith("/accessTokens")) return json({ access_token: "HT", expires_in: 3600 });
    if (url.endsWith("/finance/report/consolidated")) {
      calls++; const b = JSON.parse(opt.body); reportCalls.push(b);
      if (hostawayFail) return json({}, 500);
      return json({ result: [{ reservationId: b.fromDate, listingMapId: 1, status: "confirmed", arrivalDate: b.fromDate, departureDate: b.fromDate.slice(0, 8) + "03", rentalRevenue: 200, propertyManagerPayout: 50 }] });
    }
    throw new Error("unexpected fetch " + url);
  };
  const call = (tok, q) => new Promise((ok) => { const res = { h: {}, setHeader() {}, status(s) { this.s = s; return this; }, json(o) { ok({ s: this.s || 200, o }); } }; H({ headers: { authorization: "Bearer " + tok }, query: q || {} }, res); });

  await t("someone who is not on the list gets nothing", async () => { const r = await call("ya29.viewer", { year: 2026 }); assert.strictEqual(r.o.viewer, false); assert.ok(!r.o.months); });
  await t("an owner gets 12 months from 13 report calls, one year", async () => {
    const r = await call("ya29.boss", { year: 2026 }); assert.strictEqual(r.s, 200); assert.strictEqual(r.o.months.length, 12); assert.strictEqual(calls, 13);
    assert.ok(reportCalls.every((b) => b.dateType === "arrivalDate" && b.format === "json")); assert.strictEqual(reportCalls[0].fromDate, "2025-12-01");
    assert.strictEqual(r.o.months[0].revenue, 2 * 100);
  });
  await t("the second request within ten minutes uses the cache", async () => { const before = calls; await call("ya29.boss", { year: 2026 }); assert.strictEqual(calls, before); });
  await t("a failed Hostaway month makes the whole year unavailable, never partial", async () => { hostawayFail = 1; const r = await call("ya29.boss", { year: 2024 }); assert.strictEqual(r.s, 502); assert.ok(!r.o.months); hostawayFail = 0; });
  await t("a failed refresh keeps the last good result", async () => { hostawayFail = 1; const r = await call("ya29.boss", { year: 2026, fresh: 1 }); assert.strictEqual(r.s, 200); assert.strictEqual(r.o.stale, true); assert.strictEqual(r.o.months.length, 12); hostawayFail = 0; });
  await t("a silly year is refused", async () => { const r = await call("ya29.boss", { year: 1999 }); assert.strictEqual(r.s, 400); });
  await t("no sign-in, no data", async () => { const r = await call("", {}); assert.strictEqual(r.s, 401); });
  global.fetch = realFetch;
  console.log("\n" + pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
})();
