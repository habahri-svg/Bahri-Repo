/* Vercel serverless function: unpaid invoices and bills from Wafeq for the Follow-Up Cockpit.
   Environment variables (Vercel, Settings, Environment Variables):
     WAFEQ_API_KEY     required. Wafeq, Settings, Developers (API keys). Never sent to the browser.
     WAFEQ_VIEWERS     optional. Comma-separated Google accounts allowed to see accounting items, besides OWNER_EMAILS.
   GET returns {viewer, ready, invoices, bills}. Only owners and viewers get numbers.
   Not yet tested against a live Wafeq account. Field names are read defensively (see first/num below),
   so if Wafeq names a field differently the item still shows, just with fewer details. */
"use strict";
const S = require("./_shared");
const g = globalThis;
g.__wyzWQ = g.__wyzWQ || { cache: null, at: 0 };
const API = "https://api.wafeq.com/v1";
const CLOSED = /paid|void|cancel|draft|deleted|written/i;

async function get(path) {
  const r = await fetch(API + path, { headers: { Authorization: "Api-Key " + process.env.WAFEQ_API_KEY, Accept: "application/json" } });
  if (r.status === 401 || r.status === 403) throw new Error("Wafeq refused the API key.");
  if (!r.ok) throw new Error("Wafeq answered " + r.status + ".");
  const j = await r.json();
  return Array.isArray(j) ? j : Array.isArray(j.results) ? j.results : Array.isArray(j.data) ? j.data : [];
}
const first = function (o, keys) { for (let i = 0; i < keys.length; i++) { const v = o[keys[i]]; if (v != null && v !== "") return v; } return ""; };
const num = function (v) { const n = parseFloat(v); return isFinite(n) ? n : 0; };
function slim(r, kind) {
  const c = r.contact;
  const who = typeof c === "object" && c ? String(c.name || c.display_name || "") : String(first(r, ["contact_name", "customer_name", "supplier_name", "vendor_name"]) || (typeof c === "string" ? c : ""));
  const due = String(first(r, ["due_date", "dueDate", "payment_due_date"])).slice(0, 10);
  const total = num(first(r, ["amount_due", "balance", "total", "amount", "grand_total"]));
  const today = new Date(Date.now() + 4 * 3600000).toISOString().slice(0, 10);
  const days = due ? Math.round((Date.parse(today) - Date.parse(due)) / 86400000) : 0;
  return { id: String(r.id || ""), number: String(first(r, ["invoice_number", "bill_number", "number", "reference"]) || ""), contact: who.slice(0, 60), due: due, amount: Math.round(total * 100) / 100, currency: String(r.currency || "AED"), status: String(r.status || ""), daysLate: days, kind: kind };
}
async function numbers() {
  const out = { ready: true, invoices: [], bills: [], errors: [] };
  try { out.invoices = (await get("/invoices/?page_size=100")).filter(function (r) { return !CLOSED.test(String(r.status || "")); }).map(function (r) { return slim(r, "invoice"); }); } catch (e) { out.errors.push(String(e.message || e)); }
  try { out.bills = (await get("/bills/?page_size=100")).filter(function (r) { return !CLOSED.test(String(r.status || "")); }).map(function (r) { return slim(r, "bill"); }); } catch (e) { out.errors.push(String(e.message || e)); }
  if (out.errors.length === 2) throw new Error(out.errors[0]);
  out.invoices.sort(function (a, b) { return b.daysLate - a.daysLate; }); out.bills.sort(function (a, b) { return b.daysLate - a.daysLate; });
  out.invoices = out.invoices.slice(0, 25); out.bills = out.bills.slice(0, 25);
  return out;
}
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const token0 = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token0 || !process.env.GOOGLE_CLIENT_ID) return res.status(401).json({ error: "Sign in with Google first." });
  let who = null;
  try { who = await S.verify(token0); } catch (e) { return res.status(502).json({ error: "Couldn't check your Google sign-in." }); }
  if (!who) return res.status(401).json({ error: "Your Google sign-in isn't valid for this site." });
  const owners = S.list(process.env.OWNER_EMAILS), viewers = owners.concat(S.list(process.env.WAFEQ_VIEWERS));
  if (viewers.indexOf(who.email) < 0) return res.status(200).json({ viewer: false });
  if (!String(process.env.WAFEQ_API_KEY || "").trim()) return res.status(200).json({ viewer: true, owner: owners.indexOf(who.email) >= 0, ready: false, missing: ["WAFEQ_API_KEY"] });
  const h = g.__wyzWQ;
  try {
    if (!h.cache || Date.now() - h.at > 10 * 60000 || (req.query && req.query.fresh)) { h.cache = await numbers(); h.at = Date.now(); }
    return res.status(200).json(Object.assign({ viewer: true, owner: owners.indexOf(who.email) >= 0, at: h.at }, h.cache));
  } catch (e) {
    return res.status(502).json({ viewer: true, ready: true, owner: owners.indexOf(who.email) >= 0, error: String((e && e.message) || "Couldn't reach Wafeq.").slice(0, 200) });
  }
};
