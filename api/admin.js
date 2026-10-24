/* Vercel serverless function behind the owner's /admin page.
   Environment variables:
     OWNER_EMAILS   required. Comma-separated Google accounts that may open /admin (for example habahri@gmail.com).
     KV_REST_API_URL and KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN)
                    needed to remember usage. Add "Upstash Redis" from the Vercel Marketplace and these are filled in for you.
   GET returns the list of people with their usage. POST {action:"block"|"unblock", email} switches one person's shared AI off or on. */
"use strict";
const S = require("./_shared");

const pairs = function (flat) { const o = {}; for (let i = 0; i + 1 < (flat || []).length; i += 2) o[flat[i]] = flat[i + 1]; return o; };

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token || !process.env.GOOGLE_CLIENT_ID) return res.status(401).json({ error: "Sign in with Google first." });
  let who = null;
  try { who = await S.verify(token); } catch (e) { return res.status(502).json({ error: "Couldn't check your Google sign-in." }); }
  if (!who) return res.status(401).json({ error: "Your Google sign-in isn't valid for this site." });
  const owners = S.list(process.env.OWNER_EMAILS);
  if (!owners.length) return res.status(503).json({ error: "OWNER_EMAILS isn't set in Vercel yet.", setup: "owner" });
  if (owners.indexOf(who.email) < 0) return res.status(403).json({ error: "This page is only for the owner." });
  const limit = +process.env.DAILY_LIMIT || 50;
  if (!S.store()) return res.status(200).json({ storage: false, limit: limit, users: [], me: who.email });

  try {
    if (req.method === "POST") {
      const b = typeof req.body === "string" ? S.safeParse(req.body) : (req.body || {});
      const email = String(b.email || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (b.action !== "block" && b.action !== "unblock")) return res.status(400).json({ error: "Bad request." });
      if (b.action === "block" && owners.indexOf(email) >= 0) return res.status(400).json({ error: "You can't switch off an owner account." });
      await S.redis([[b.action === "block" ? "SADD" : "SREM", "wyz:blocked", email]]);
      return res.status(200).json({ ok: true });
    }
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
    const base = await S.redis([["SMEMBERS", "wyz:users"], ["SMEMBERS", "wyz:blocked"]]);
    const emails = (base[0] || []).slice(0, 500), blocked = new Set(base[1] || []);
    const cmds = [];
    emails.forEach(function (e) { cmds.push(["HGETALL", "wyz:u:" + e]); cmds.push(["GET", "wyz:day:" + S.today() + ":" + e]); });
    const out = emails.length ? await S.redis(cmds) : [];
    const users = emails.map(function (e, i) {
      const h = pairs(out[i * 2]);
      return { email: e, calls: +h.calls || 0, claude: +h.calls_claude || 0, chatgpt: +h.calls_chatgpt || 0, tokensIn: +h.tokens_in || 0, tokensOut: +h.tokens_out || 0,
        first: +h.first || 0, last: Math.max(+h.last || 0, +h.seen || 0), today: +out[i * 2 + 1] || 0, blocked: blocked.has(e) };
    }).sort(function (a, b) { return b.last - a.last; });
    return res.status(200).json({ storage: true, limit: limit, users: users, me: who.email });
  } catch (e) {
    return res.status(502).json({ error: "Couldn't reach the usage storage." });
  }
};
