/* Vercel serverless function: today's WYZ numbers from Hostaway for the strip at the top of the page.
   Environment variables (Vercel, Settings, Environment Variables):
     HOSTAWAY_ACCOUNT_ID   required. Hostaway, Settings, Hostaway API: the Account ID.
     HOSTAWAY_API_KEY      required. Same page: the API key (secret). Never sent to the browser.
     HOSTAWAY_VIEWERS      optional. Comma-separated Google accounts allowed to see the numbers, besides OWNER_EMAILS.
     HOSTAWAY_CITY         optional. Only count listings in this city, for example Dubai.
   GET returns {viewer, ready, ...numbers}. Only owners and viewers get numbers. */
"use strict";
const S = require("./_shared");
const g = globalThis;
g.__wyzHA = g.__wyzHA || { token: "", exp: 0, cache: null, at: 0 };

const API = "https://api.hostaway.com/v1";
const SKIP = /cancel|declin|expir|inquir|pending|unknown/i;

function dubaiDay(offset) {
  const d = new Date(Date.now() + 4 * 3600000 + (offset || 0) * 86400000);
  return d.toISOString().slice(0, 10);
}
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
async function get(path) {
  const r = await fetch(API + path, { headers: { Authorization: "Bearer " + (await token()), "Cache-control": "no-cache" } });
  if (r.status === 403 || r.status === 401) { g.__wyzHA.token = ""; throw new Error("Hostaway refused the request. Check the API key."); }
  if (!r.ok) throw new Error("Hostaway answered " + r.status + ".");
  const j = await r.json();
  return Array.isArray(j.result) ? j.result : [];
}
async function all(path) {
  let out = [], off = 0;
  for (let i = 0; i < 10; i++) {
    const page = await get(path + (path.indexOf("?") >= 0 ? "&" : "?") + "limit=500&offset=" + off);
    out = out.concat(page);
    if (page.length < 500) break;
    off += 500;
  }
  return out;
}
const nightsIn = function (a, d, from, to) {   /* nights of a stay [a, d) inside [from, to] */
  const s = Math.max(Date.parse(a), Date.parse(from)), e = Math.min(Date.parse(d), Date.parse(to) + 86400000);
  return Math.max(0, Math.round((e - s) / 86400000));
};

async function numbers() {
  const today = dubaiDay(0), m0 = today.slice(0, 8) + "01";
  const end = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7), 0)).toISOString().slice(0, 10);
  const days = +end.slice(8, 10);
  const city = String(process.env.HOSTAWAY_CITY || "").trim().toLowerCase();
  const listings = (await all("/listings")).filter(function (l) { return !city || String(l.city || "").toLowerCase().indexOf(city) >= 0; });
  const ids = new Set(listings.map(function (l) { return l.id; }));
  const raw = (await all("/reservations?arrivalEndDate=" + end + "&departureStartDate=" + m0 + "&sortOrder=arrivalDate"))
    .filter(function (r) { return !city || ids.has(r.listingMapId); });
  const res = raw.filter(function (r) { return !SKIP.test(String(r.status || "")); });
  const pick = function (r) { return { guest: String(r.guestName || r.guestFirstName || "Guest").slice(0, 40), place: String(r.listingName || r.listingMapId || "").slice(0, 60), from: r.arrivalDate, to: r.departureDate, nights: r.nights || nightsIn(r.arrivalDate, r.departureDate, r.arrivalDate, r.departureDate) }; };
  const paid = res.filter(function (r) { return !/owner/i.test(String(r.status || "")); });
  const ins = res.filter(function (r) { return r.arrivalDate === today; }), outs = res.filter(function (r) { return r.departureDate === today; });
  const house = res.filter(function (r) { return r.arrivalDate <= today && r.departureDate > today; });
  let booked = 0;
  res.forEach(function (r) { booked += nightsIn(r.arrivalDate, r.departureDate, m0, end); });
  const byCur = {};
  paid.forEach(function (r) {
    const total = +r.totalPrice || 0, n = Math.max(1, +r.nights || nightsIn(r.arrivalDate, r.departureDate, r.arrivalDate, r.departureDate)), c = r.currency || "AED";
    byCur[c] = (byCur[c] || 0) + total * nightsIn(r.arrivalDate, r.departureDate, m0, end) / n;
  });
  const cur = Object.keys(byCur).sort(function (a, b) { return byCur[b] - byCur[a]; })[0] || "AED", revenue = byCur[cur] || 0;
  const occ = listings.length ? Math.round(100 * booked / (listings.length * days)) : 0;
  /* for the Follow-Up Cockpit: arrivals tomorrow, and bookings still pending or unconfirmed that arrive within a week */
  const tomorrow = dubaiDay(1), week = dubaiDay(7);
  const tomorrowIns = res.filter(function (r) { return r.arrivalDate === tomorrow; });
  const attention = raw.filter(function (r) { return /pending|inquir|awaiting|hold|unconfirmed/i.test(String(r.status || "")) && r.arrivalDate >= today && r.arrivalDate <= week; })
    .map(function (r) { const o = pick(r); o.status = String(r.status || ""); return o; }).slice(0, 15);
  return { ready: true, date: today, listings: listings.length, checkIns: ins.map(pick), checkOuts: outs.map(pick), tomorrowIns: tomorrowIns.map(pick), attention: attention, inHouse: house.length, occupancy: occ, revenue: Math.round(revenue), currency: cur || "AED", month: today.slice(0, 7), city: city || "", at: Date.now() };
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const token0 = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token0 || !process.env.GOOGLE_CLIENT_ID) return res.status(401).json({ error: "Sign in with Google first." });
  let who = null;
  try { who = await S.verify(token0); } catch (e) { return res.status(502).json({ error: "Couldn't check your Google sign-in." }); }
  if (!who) return res.status(401).json({ error: "Your Google sign-in isn't valid for this site." });
  const owners = S.list(process.env.OWNER_EMAILS), viewers = owners.concat(S.list(process.env.HOSTAWAY_VIEWERS));
  if (viewers.indexOf(who.email) < 0) return res.status(200).json({ viewer: false });
  const missing = ["HOSTAWAY_ACCOUNT_ID", "HOSTAWAY_API_KEY"].filter(function (k) { return !String(process.env[k] || "").trim(); });
  if (missing.length) return res.status(200).json({ viewer: true, owner: owners.indexOf(who.email) >= 0, ready: false, missing: missing });
  const h = g.__wyzHA;
  try {
    if (!h.cache || Date.now() - h.at > 10 * 60000 || req.query && req.query.fresh) { h.cache = await numbers(); h.at = Date.now(); }
    return res.status(200).json(Object.assign({ viewer: true, owner: owners.indexOf(who.email) >= 0 }, h.cache));
  } catch (e) {
    return res.status(502).json({ viewer: true, ready: true, error: String((e && e.message) || "Couldn't reach Hostaway.").slice(0, 200) });
  }
};
