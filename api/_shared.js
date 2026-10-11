/* Shared helpers for the AI functions (claude.js, chatgpt.js). The leading underscore keeps Vercel from exposing this file as a route. */
"use strict";
const g = globalThis;
g.__wyzTok = g.__wyzTok || new Map();
g.__wyzRate = g.__wyzRate || new Map();

const list = function (v) { return String(v || "").split(",").map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean); };
const safeParse = function (s) { try { return JSON.parse(s); } catch (e) { return {}; } };

async function verify(token) {
  const hit = g.__wyzTok.get(token);
  if (hit && hit.exp > Date.now()) return hit.who;
  const r = await fetch("https://oauth2.googleapis.com/tokeninfo?access_token=" + encodeURIComponent(token));
  if (!r.ok) return null;
  const j = await r.json();
  if (j.aud !== process.env.GOOGLE_CLIENT_ID && j.azp !== process.env.GOOGLE_CLIENT_ID) return null;
  if (!j.email || String(j.email_verified) !== "true") return null;
  const who = { email: String(j.email).toLowerCase() };
  g.__wyzTok.set(token, { who: who, exp: Date.now() + Math.min(300, +j.expires_in || 300) * 1000 });
  if (g.__wyzTok.size > 500) g.__wyzTok.clear();
  return who;
}

function allowed(email) {
  const emails = list(process.env.ALLOWED_EMAILS), domains = list(process.env.ALLOWED_DOMAINS);
  if (!emails.length && !domains.length) return true;
  return emails.indexOf(email) >= 0 || domains.indexOf(email.split("@")[1]) >= 0;
}

function makeLimiter(name) {
  return function overLimit(email) {
    const day = new Date().toISOString().slice(0, 10), key = name + "|" + email + "|" + day;
    const n = (g.__wyzRate.get(key) || 0) + 1;
    g.__wyzRate.set(key, n);
    if (g.__wyzRate.size > 2000) g.__wyzRate.clear();
    return n > (+process.env.DAILY_LIMIT || 50);
  };
}

/* Runs the checks every AI function shares. Returns {who, msgs} or sends the error response and returns null. */
const MEDIA = ["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp"];
function okContent(c, blocks) {
  if (typeof c === "string") return true;
  if (!blocks || !Array.isArray(c) || !c.length || c.length > 6) return false;
  return c.every(function (b) {
    return b && ((b.type === "text" && typeof b.text === "string") ||
      ((b.type === "document" || b.type === "image") && b.source && b.source.type === "base64" && typeof b.source.data === "string" && MEDIA.indexOf(b.source.media_type) >= 0));
  });
}
function weigh(c) {
  if (typeof c === "string") return c.length;
  return c.reduce(function (n, b) { return n + (b.text ? b.text.length : (b.source && b.source.data ? b.source.data.length : 0)); }, 0);
}

/* opts.blocks lets the caller send files (PDF and pictures) as content blocks. Only Claude's function turns this on. */
async function gate(req, res, ready, overLimit, opts) {
  const blocks = !!(opts && opts.blocks);
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET") { res.status(200).json({ ok: ready }); return null; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return null; }
  if (!ready) { res.status(503).json({ error: "This AI isn't set up on this site yet." }); return null; }
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) { res.status(401).json({ error: "Sign in with Google first." }); return null; }
  let who = null;
  try { who = await verify(token); } catch (e) { res.status(502).json({ error: "Couldn't check your Google sign-in." }); return null; }
  if (!who) { res.status(401).json({ error: "Your Google sign-in isn't valid for this site." }); return null; }
  if (!allowed(who.email)) { res.status(403).json({ error: "This AI isn't turned on for your account." }); return null; }
  if (overLimit(who.email)) { res.status(429).json({ error: "Daily limit reached. Try again tomorrow." }); return null; }
  const b = typeof req.body === "string" ? safeParse(req.body) : (req.body || {});
  const msgs = Array.isArray(b.messages) ? b.messages : [];
  const valid = msgs.length && msgs.every(function (m) { return m && (m.role === "user" || m.role === "assistant") && okContent(m.content, blocks && m.role === "user"); });
  const size = valid ? msgs.reduce(function (n, m) { return n + weigh(m.content); }, 0) : 0;
  if (!valid || size > (blocks ? 4300000 : 250000)) { res.status(400).json({ error: "Bad request." }); return null; }
  return { who: who, msgs: msgs, body: b };
}

module.exports = { list, safeParse, verify, allowed, makeLimiter, gate };
