/* Vercel serverless function: the page calls this once after someone signs in, so the owner's /admin page can show who uses it.
   It only records the Google email and the time. It needs the same storage as /admin, and does nothing without it. */
"use strict";
const S = require("./_shared");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token || !process.env.GOOGLE_CLIENT_ID) return res.status(401).json({ error: "Sign in with Google first." });
  let who = null;
  try { who = await S.verify(token); } catch (e) { return res.status(502).json({ error: "Couldn't check your Google sign-in." }); }
  if (!who) return res.status(401).json({ error: "Your Google sign-in isn't valid for this site." });
  if (!S.allowed(who.email)) return res.status(403).json({ error: "This site isn't turned on for your account." });
  const blocked = await S.isBlocked(who.email);
  if (S.store() && !blocked) {
    const u = "wyz:u:" + who.email, now = Date.now();
    try { await S.redis([["SADD", "wyz:users", who.email], ["HSET", u, "last", now, "seen", now], ["HSETNX", u, "first", now]]); } catch (e) { /* ignore */ }
  }
  return res.status(200).json({ ok: true, blocked: blocked });
};
