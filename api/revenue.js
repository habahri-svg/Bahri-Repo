/* Vercel serverless function: monthly revenue for one year, from Hostaway's consolidated finance report.
   It is the same method as the Revenue Hub's "Monthly Revenue Comparison": for each month it asks Hostaway for the
   consolidated report (by arrival date, starting one month early so long stays are counted), then spreads each stay's
   rental revenue evenly over its nights. "Company net" is the property manager payout, spread the same way.
   Nothing is estimated: a night with no payout value is counted as missing, and if Hostaway fails for any month the
   whole year is reported as unavailable rather than drawn from partial months.
   Environment variables (Vercel, Settings, Environment Variables):
     HOSTAWAY_ACCOUNT_ID, HOSTAWAY_API_KEY   the same two as the Hostaway strip.
     REVENUE_VIEWERS   optional. Comma-separated Google accounts allowed to see revenue, besides OWNER_EMAILS.
                       Revenue is more sensitive than the daily strip, so HOSTAWAY_VIEWERS does NOT grant it.
   GET /api/revenue?year=2026  (add &fresh=1 to skip the 10 minute cache)
   Not yet checked against a live Hostaway account: compare the year totals with the Revenue Hub chart before relying on it. */
"use strict";
const S = require("./_shared");
const g = globalThis;
g.__wyzHA = g.__wyzHA || { token: "", exp: 0, cache: null, at: 0 };
g.__wyzRV = g.__wyzRV || new Map();

const API = "https://api.hostaway.com/v1";
const SKIP = /cancel|declin|expir|inquir|pending|unknown|awaiting/i;
const CACHE_MS = 10 * 60000;

const dubaiYear = function () { return new Date(Date.now() + 4 * 3600000).getUTCFullYear(); };
async function token() {
  const h = g.__wyzHA;
  if (h.token && h.exp > Date.now()) return h.token;
  const body = "grant_type=client_credentials&client_id=" + encodeURIComponent(process.env.HOSTAWAY_ACCOUNT_ID) + "&client_secret=" + encodeURIComponent(process.env.HOSTAWAY_API_KEY) + "&scope=general";
  const r = await fetch(API + "/accessTokens", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "Cache-control": "no-cache" }, body: body });
  if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? "Hostaway refused the Account ID or API key." : "Hostaway answered " + r.status + ".");
  const j = await r.json();
  h.token = j.access_token; h.exp = Date.now() + Math.min(+j.expires_in || 86400, 30 * 86400) * 1000 - 60000;
  return h.token;
}
const first = function (o, keys) { for (let i = 0; i < keys.length; i++) { const v = o[keys[i]]; if (v != null && v !== "") return v; } return null; };
const num = function (v) { if (v == null) return null; const n = parseFloat(v); return isFinite(n) ? n : null; };

/* find the list of reservation rows, whatever the report wraps them in */
function rowsOf(j) {
  let best = [];
  (function walk(x, d) {
    if (d > 4 || !x) return;
    if (Array.isArray(x)) {
      if (x.length && x[0] && typeof x[0] === "object" && ("arrivalDate" in x[0] || "checkInDate" in x[0] || "reservationId" in x[0])) { if (x.length > best.length) best = x; return; }
      x.forEach(function (v) { walk(v, d + 1); });
      return;
    }
    if (typeof x === "object") Object.keys(x).forEach(function (k) { walk(x[k], d + 1); });
  })(j, 0);
  return best;
}

/* Spread every stay over its nights and add the nights that fall in `year`, month by month. */
function allocate(rows, year) {
  const months = Array.from({ length: 12 }, function () { return { revenue: 0, net: 0, netMissingNights: 0, bookedNights: 0, listings: new Set() }; });
  const seen = new Set(), y0 = Date.UTC(year, 0, 1) / 86400000, y1 = Date.UTC(year + 1, 0, 1) / 86400000;
  rows.forEach(function (raw) {
    if (SKIP.test(String(raw.status || ""))) return;
    const ci = String(first(raw, ["arrivalDate", "checkInDate"]) || ""), co = String(first(raw, ["departureDate", "checkOutDate"]) || "");
    if (!/^\d{4}-\d{2}-\d{2}/.test(ci) || !/^\d{4}-\d{2}-\d{2}/.test(co)) return;
    const a = Date.parse(ci.slice(0, 10)) / 86400000, b = Date.parse(co.slice(0, 10)) / 86400000;
    const listing = String(first(raw, ["listingMapId", "listingId"]) || "");
    const id = String(first(raw, ["reservationId", "id"]) || listing + ":" + ci + ":" + co);
    if (seen.has(id)) return; seen.add(id);
    const n = Math.max(1, b - a);
    const rental = num(first(raw, ["rentalRevenue", "rental_revenue", "totalPrice", "total_price", "totalRevenue"])) || 0;
    const pm = num(first(raw, ["propertyManagerPayout", "property_manager_payout", "managerPayout", "manager_payout", "pmPayout"]));
    for (let d = a; d < a + n; d++) {
      if (d < y0 || d >= y1) continue;
      const m = new Date(d * 86400000).getUTCMonth(), M = months[m];
      M.revenue += rental / n; M.bookedNights++; M.listings.add(listing);
      if (pm == null) M.netMissingNights++; else M.net += pm / n;
    }
  });
  return months.map(function (m) { return { revenue: Math.round(m.revenue * 100) / 100, net: Math.round(m.net * 100) / 100, netMissingNights: m.netMissingNights, bookedNights: m.bookedNights, listings: m.listings.size }; });
}

async function fetchWindow(win, tok) {
  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, 15000);
    try {
      const r = await fetch(API + "/finance/report/consolidated", { method: "POST", signal: ctl.signal,
        headers: { Authorization: "Bearer " + tok, "content-type": "application/json", "Cache-control": "no-cache" },
        body: JSON.stringify({ format: "json", fromDate: win.from, toDate: win.to, dateType: "arrivalDate" }) });
      clearTimeout(t);
      if (r.status === 401 || r.status === 403) { g.__wyzHA.token = ""; throw new Error("Hostaway refused the request. Check the API key."); }
      if (r.ok) return rowsOf(await r.json());
      lastErr = "Hostaway answered " + r.status + ".";
    } catch (e) { clearTimeout(t); lastErr = e && e.name === "AbortError" ? "Hostaway was too slow." : String((e && e.message) || e); if (/refused/.test(lastErr)) throw e; }
  }
  throw new Error(lastErr || "Hostaway did not answer.");
}
async function compute(year) {
  const tok = await token(), windows = [];
  for (let k = -1; k < 12; k++) windows.push({ from: new Date(Date.UTC(year, k, 1)).toISOString().slice(0, 10), to: new Date(Date.UTC(year, k + 1, 0)).toISOString().slice(0, 10) });
  const out = new Array(windows.length); let next = 0;
  await Promise.all([0, 1, 2, 3].map(async function () { while (next < windows.length) { const i = next++; out[i] = await fetchWindow(windows[i], tok); } }));
  const rows = [].concat.apply([], out);
  if (!rows.length) throw new Error("Hostaway returned no reservations for " + year + ".");
  return { year: year, months: allocate(rows, year), at: Date.now() };
}

async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const token0 = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token0 || !process.env.GOOGLE_CLIENT_ID) return res.status(401).json({ error: "Sign in with Google first." });
  let who = null;
  try { who = await S.verify(token0); } catch (e) { return res.status(502).json({ error: "Couldn't check your Google sign-in." }); }
  if (!who) return res.status(401).json({ error: "Your Google sign-in isn't valid for this site." });
  const owners = S.list(process.env.OWNER_EMAILS), viewers = owners.concat(S.list(process.env.REVENUE_VIEWERS));
  if (viewers.indexOf(who.email) < 0) return res.status(200).json({ viewer: false, email: who.email, listed: { owners: owners.length, viewers: viewers.length - owners.length } });
  const isOwner = owners.indexOf(who.email) >= 0;
  const missing = ["HOSTAWAY_ACCOUNT_ID", "HOSTAWAY_API_KEY"].filter(function (k) { return !String(process.env[k] || "").trim(); });
  if (missing.length) return res.status(200).json({ viewer: true, owner: isOwner, ready: false, missing: missing });
  const q = req.query || {}, cur = dubaiYear(), year = +q.year || cur;
  if (!(year >= 2015 && year <= cur + 1)) return res.status(400).json({ error: "Bad year." });
  const hit = g.__wyzRV.get(year);
  try {
    if (!hit || Date.now() - hit.at > CACHE_MS || q.fresh) { const d = await compute(year); g.__wyzRV.set(year, d); return res.status(200).json(Object.assign({ viewer: true, owner: isOwner, ready: true }, d)); }
    return res.status(200).json(Object.assign({ viewer: true, owner: isOwner, ready: true }, hit));
  } catch (e) {
    /* a failed refresh never replaces a good earlier result with anything else */
    if (hit) return res.status(200).json(Object.assign({ viewer: true, owner: isOwner, ready: true, stale: true }, hit));
    return res.status(502).json({ viewer: true, owner: isOwner, ready: true, error: String((e && e.message) || "Couldn't reach Hostaway.").slice(0, 200) });
  }
}
module.exports = handler;
module.exports.allocate = allocate;
module.exports.rowsOf = rowsOf;
