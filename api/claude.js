/* Vercel serverless function: lets signed-in Google users use the site owner's Claude, with no key on their side.
   Environment variables (Vercel, Settings, Environment Variables):
     ANTHROPIC_API_KEY   required. The owner's Claude API key. Never sent to the browser.
     GOOGLE_CLIENT_ID    required. The same Client ID as docs/config.js. Tokens issued to any other app are refused.
     ALLOWED_EMAILS      optional. Comma-separated list. If set, only these Google accounts can use Claude.
     ALLOWED_DOMAINS     optional. Comma-separated list such as wyzrent.com.
     DAILY_LIMIT         optional. Calls per person per day (default 150).
   GET returns {ok:true} when the function is configured, so the page knows to switch Claude on automatically. */
"use strict";

const MODELS = { quick: "claude-haiku-5-5", "default": "claude-sonnet-5-5", complex: "claude-opus-5-5" };
const MAX_CHARS = 250000;
const g = globalThis;
g.__wyzTok = g.__wyzTok || new Map();
g.__wyzRate = g.__wyzRate || new Map();

const list = function (v) { return String(v || "").split(",").map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean); };

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

function overLimit(email) {
  const day = new Date().toISOString().slice(0, 10), key = email + "|" + day;
  const n = (g.__wyzRate.get(key) || 0) + 1;
  g.__wyzRate.set(key, n);
  if (g.__wyzRate.size > 2000) g.__wyzRate.clear();
  return n > (+process.env.DAILY_LIMIT || 150);
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const ready = !!(process.env.ANTHROPIC_API_KEY && process.env.GOOGLE_CLIENT_ID);
  if (req.method === "GET") return res.status(200).json({ ok: ready });
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!ready) return res.status(503).json({ error: "Claude isn't set up on this site yet." });

  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Sign in with Google first." });
  let who = null;
  try { who = await verify(token); } catch (e) { return res.status(502).json({ error: "Couldn't check your Google sign-in." }); }
  if (!who) return res.status(401).json({ error: "Your Google sign-in isn't valid for this site." });
  if (!allowed(who.email)) return res.status(403).json({ error: "Claude isn't turned on for your account." });
  if (overLimit(who.email)) return res.status(429).json({ error: "Daily Claude limit reached. Try again tomorrow." });

  const b = typeof req.body === "string" ? safeParse(req.body) : (req.body || {});
  const msgs = Array.isArray(b.messages) ? b.messages : [];
  const valid = msgs.length && msgs.every(function (m) { return m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string"; });
  const size = msgs.reduce(function (n, m) { return n + (m && m.content ? m.content.length : 0); }, 0);
  if (!valid || size > MAX_CHARS) return res.status(400).json({ error: "Bad request." });

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODELS[b.tier] || MODELS["default"], max_tokens: Math.min(+b.max_tokens || 4000, 8000), messages: msgs })
    });
    const out = await r.text();
    res.status(r.ok ? 200 : (r.status === 429 || r.status === 529 ? 429 : 502)).setHeader("content-type", "application/json");
    return res.send(r.ok ? out : JSON.stringify({ error: "Claude couldn't answer (" + r.status + ")." }));
  } catch (e) {
    return res.status(502).json({ error: "Couldn't reach Claude." });
  }
};

function safeParse(s) { try { return JSON.parse(s); } catch (e) { return {}; } }
