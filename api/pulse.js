/* Vercel serverless function: Team pulse. Each person's page sends only counts (never email text) a few times a day,
   and the owner sees who has what open. Needs the same storage as /admin (Upstash Redis from the Vercel Marketplace).
   POST {reply, follow, wait, owed, handed, overdue, open, name}  any signed-in person on the AI list, if they share.
   GET  owner only: {storage, people:[...]} */
"use strict";
const S = require("./_shared");
const KEYS = ["reply", "follow", "wait", "owed", "handed", "overdue", "open"];

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token || !process.env.GOOGLE_CLIENT_ID) return res.status(401).json({ error: "Sign in with Google first." });
  let who = null;
  try { who = await S.verify(token); } catch (e) { return res.status(502).json({ error: "Couldn't check your Google sign-in." }); }
  if (!who) return res.status(401).json({ error: "Your Google sign-in isn't valid for this site." });
  const owners = S.list(process.env.OWNER_EMAILS), isOwner = owners.indexOf(who.email) >= 0;

  if (req.method === "POST") {
    if (!S.allowed(who.email) && !isOwner) return res.status(200).json({ ok: false });
    if (!S.store()) return res.status(200).json({ ok: false, storage: false });
    const b = typeof req.body === "string" ? S.safeParse(req.body) : (req.body || {});
    const cmd = ["HSET", "wyz:pulse:" + who.email, "at", Date.now(), "name", String(b.name || "").slice(0, 60)];
    KEYS.forEach(function (k) { cmd.push(k, Math.max(0, Math.min(9999, Math.floor(+b[k] || 0)))); });
    try { await S.redis([["SADD", "wyz:pulse", who.email], cmd, ["EXPIRE", "wyz:pulse:" + who.email, 30 * 86400]]); } catch (e) { return res.status(200).json({ ok: false }); }
    return res.status(200).json({ ok: true });
  }
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!isOwner) return res.status(200).json({ owner: false });
  if (!S.store()) return res.status(200).json({ owner: true, storage: false, people: [] });
  try {
    const emails = ((await S.redis([["SMEMBERS", "wyz:pulse"]]))[0] || []).slice(0, 200);
    const rows = emails.length ? await S.redis(emails.map(function (e) { return ["HGETALL", "wyz:pulse:" + e]; })) : [];
    const people = emails.map(function (e, i) {
      const f = rows[i] || [], o = { email: e };
      for (let k = 0; k + 1 < f.length; k += 2) o[f[k]] = f[k] === "name" ? f[k + 1] : +f[k + 1] || 0;
      return o;
    }).filter(function (p) { return p.at; }).sort(function (a, b) { return (b.overdue + b.follow) - (a.overdue + a.follow) || b.at - a.at; });
    return res.status(200).json({ owner: true, storage: true, people: people });
  } catch (e) {
    return res.status(502).json({ error: "Couldn't reach the usage storage." });
  }
};
