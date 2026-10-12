/* Vercel serverless function: listings that need a pricing look, from PriceLabs, for the Follow-Up Cockpit.
   Environment variables (Vercel, Settings, Environment Variables):
     PRICELABS_API_KEY   required. PriceLabs, Account Settings, API Details. Never sent to the browser.
     PRICELABS_VIEWERS   optional. Comma-separated Google accounts allowed to see pricing alerts, besides OWNER_EMAILS.
   GET returns {viewer, ready, listings, alerts:[{id,name,reason,detail}]}. Only owners and viewers get numbers.
   Not yet tested against a live PriceLabs account. Fields are read defensively, so an alert is only raised
   when the field it depends on is present. */
"use strict";
const S = require("./_shared");
const g = globalThis;
g.__wyzPL = g.__wyzPL || { cache: null, at: 0 };
const API = "https://api.pricelabs.co/v1";

async function listings() {
  const r = await fetch(API + "/listings", { headers: { "X-API-Key": process.env.PRICELABS_API_KEY, Accept: "application/json" } });
  if (r.status === 401 || r.status === 403) throw new Error("PriceLabs refused the API key.");
  if (!r.ok) throw new Error("PriceLabs answered " + r.status + ".");
  const j = await r.json();
  return Array.isArray(j) ? j : Array.isArray(j.listings) ? j.listings : [];
}
const n = function (v) { const x = parseFloat(v); return isFinite(x) ? x : null; };
async function numbers() {
  const ls = await listings(), alerts = [], now = Date.now();
  ls.forEach(function (l) {
    const name = String(l.name || l.id || "Listing").slice(0, 70), id = String(l.id || "");
    const push = function (reason, detail) { alerts.push({ id: id, name: name, reason: reason, detail: detail }); };
    if (l.push_enabled === false) push("Price updates are off", "PriceLabs is not sending new prices to the booking channels for this unit.");
    const lp = l.last_date_pushed ? Date.parse(l.last_date_pushed) : 0;
    if (lp && now - lp > 3 * 86400000) push("Prices not updated for " + Math.floor((now - lp) / 86400000) + " days", "The last price update was " + String(l.last_date_pushed).slice(0, 10) + ".");
    const o7 = n(l.occupancy_next_7), m7 = n(l.market_occupancy_next_7);
    if (o7 != null && m7 != null && m7 - o7 >= 20) push("Next 7 days well below the market", "Your occupancy " + Math.round(o7) + "% against the market " + Math.round(m7) + "%.");
    const o30 = n(l.occupancy_next_30), m30 = n(l.market_occupancy_next_30);
    if (o30 != null && m30 != null && m30 - o30 >= 20) push("Next 30 days well below the market", "Your occupancy " + Math.round(o30) + "% against the market " + Math.round(m30) + "%.");
    if (o7 != null && o7 >= 95) push("Almost full next 7 days", "Occupancy " + Math.round(o7) + "%. Prices may be too low.");
  });
  return { ready: true, listings: ls.length, alerts: alerts.slice(0, 30) };
}
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const token0 = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token0 || !process.env.GOOGLE_CLIENT_ID) return res.status(401).json({ error: "Sign in with Google first." });
  let who = null;
  try { who = await S.verify(token0); } catch (e) { return res.status(502).json({ error: "Couldn't check your Google sign-in." }); }
  if (!who) return res.status(401).json({ error: "Your Google sign-in isn't valid for this site." });
  const owners = S.list(process.env.OWNER_EMAILS), viewers = owners.concat(S.list(process.env.PRICELABS_VIEWERS));
  if (viewers.indexOf(who.email) < 0) return res.status(200).json({ viewer: false });
  if (!String(process.env.PRICELABS_API_KEY || "").trim()) return res.status(200).json({ viewer: true, owner: owners.indexOf(who.email) >= 0, ready: false, missing: ["PRICELABS_API_KEY"] });
  const h = g.__wyzPL;
  try {
    if (!h.cache || Date.now() - h.at > 30 * 60000 || (req.query && req.query.fresh)) { h.cache = await numbers(); h.at = Date.now(); }
    return res.status(200).json(Object.assign({ viewer: true, owner: owners.indexOf(who.email) >= 0, at: h.at }, h.cache));
  } catch (e) {
    return res.status(502).json({ viewer: true, ready: true, owner: owners.indexOf(who.email) >= 0, error: String((e && e.message) || "Couldn't reach PriceLabs.").slice(0, 200) });
  }
};
