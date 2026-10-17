/* Vercel serverless function behind the usage meter on the Today page (owner only).
   Counts this month's Claude and ChatGPT use (tokens and calls, Dubai calendar month) and turns it into a percentage of a monthly budget.
   The percentage is an ESTIMATE: tokens x the price per million tokens you set, against the budget you set. It is not read from
   Anthropic or OpenAI, which don't publish a live balance. Check the real balance on their billing pages.
   Environment variables: OWNER_EMAILS (required), GOOGLE_CLIENT_ID, and the Upstash Redis variables (same storage as /admin).
   GET  returns {storage, month, providers:{claude:{in,out,calls,cost,budget,pct}, chatgpt:{...}}, cfg}
   POST {budget:{claude,chatgpt}, price:{claude:{in,out}, chatgpt:{in,out}}}  saves the budget (US dollars) and the prices (dollars per million tokens). */
"use strict";
const S = require("./_shared");

/* Starting values. Change them on the page, they are saved. Prices are placeholders: use your own price list. */
const DEFAULTS = { budget: { claude: 20, chatgpt: 20 }, price: { claude: { in: 3, out: 15 }, chatgpt: { in: 2.5, out: 10 } } };
const num = function (v, lo, hi) { const n = +v; return isFinite(n) && n >= lo && n <= hi ? n : null; };

function merge(saved) {
  const c = JSON.parse(JSON.stringify(DEFAULTS));
  const s = saved || {};
  ["claude", "chatgpt"].forEach(function (p) {
    const b = num(s.budget && s.budget[p], 0.01, 100000); if (b != null) c.budget[p] = b;
    ["in", "out"].forEach(function (d) { const x = num(s.price && s.price[p] && s.price[p][d], 0, 1000); if (x != null) c.price[p][d] = x; });
  });
  return c;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token || !process.env.GOOGLE_CLIENT_ID) return res.status(401).json({ error: "Sign in with Google first." });
  let who = null;
  try { who = await S.verify(token); } catch (e) { return res.status(502).json({ error: "Couldn't check your Google sign-in." }); }
  if (!who) return res.status(401).json({ error: "Your Google sign-in isn't valid for this site." });
  const owners = S.list(process.env.OWNER_EMAILS);
  if (owners.indexOf(who.email) < 0) return res.status(200).json({ viewer: false });
  if (!S.store()) return res.status(200).json({ viewer: true, storage: false });
  try {
    const key = "wyz:usagecfg";
    if (req.method === "POST") {
      const b = typeof req.body === "string" ? S.safeParse(req.body) : (req.body || {});
      const saved = merge(S.safeParse((await S.redis([["GET", key]]))[0]));
      const next = merge({
        budget: Object.assign({}, saved.budget, b.budget || {}),
        price: { claude: Object.assign({}, saved.price.claude, b.price && b.price.claude), chatgpt: Object.assign({}, saved.price.chatgpt, b.price && b.price.chatgpt) }
      });
      await S.redis([["SET", key, JSON.stringify(next)]]);
      return res.status(200).json({ ok: true });
    }
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
    const mon = S.month();
    const got = await S.redis([["HGETALL", "wyz:m:" + mon], ["GET", key]]);
    const h = {}; const flat = got[0] || []; for (let i = 0; i + 1 < flat.length; i += 2) h[flat[i]] = +flat[i + 1] || 0;
    const cfg = merge(S.safeParse(got[1]));
    const providers = {};
    ["claude", "chatgpt"].forEach(function (p) {
      const tin = h[p + "_in"] || 0, tout = h[p + "_out"] || 0;
      const cost = tin / 1e6 * cfg.price[p].in + tout / 1e6 * cfg.price[p].out;
      providers[p] = { in: tin, out: tout, calls: h[p + "_calls"] || 0, cost: Math.round(cost * 100) / 100, budget: cfg.budget[p], pct: Math.round(cost / cfg.budget[p] * 1000) / 10 };
    });
    return res.status(200).json({ viewer: true, storage: true, month: mon, providers: providers, cfg: cfg });
  } catch (e) {
    return res.status(502).json({ error: "Couldn't reach the usage storage." });
  }
};
