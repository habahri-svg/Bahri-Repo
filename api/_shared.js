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
  /* 3.43.2 security fix: Microsoft tokens are no longer accepted here. The old check asked Microsoft Graph for the
     "mail" field of any token, from any app or tenant, so someone could make a token that claims the owner's address.
     Only Google sign-ins are checked below. Before Microsoft sign-in is switched on, add MS_CLIENT_ID in Vercel and verify
     a Microsoft ID token (signature, audience equals MS_CLIENT_ID, verified address), never a Graph access token. */
  if (!token || /\s/.test(token)) return null;
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
  if (!emails.length && !domains.length) return false;   /* no list = nobody, so the owner's credit can't be used by strangers */
  return emails.indexOf(email) >= 0 || domains.indexOf(email.split("@")[1]) >= 0;
}

/* Optional storage: an Upstash Redis database (add it from the Vercel Marketplace, or paste its REST URL and token).
   With it, daily limits are exact, the owner can switch people off, and /admin shows who uses the AI.
   Without it everything still works, limits are just approximate and /admin explains how to switch it on. */
function store() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL, token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: String(url).replace(/\/$/, ""), token: token } : null;
}
async function redis(cmds) {
  const s = store();
  if (!s) return null;
  const r = await fetch(s.url + "/pipeline", { method: "POST", headers: { Authorization: "Bearer " + s.token, "content-type": "application/json" }, body: JSON.stringify(cmds) });
  if (!r.ok) throw new Error("storage answered " + r.status);
  return (await r.json()).map(function (x) { return x && x.result; });
}
const today = function () { return new Date().toISOString().slice(0, 10); };

function makeLimiter(name) {
  return async function overLimit(email) {
    const limit = +process.env.DAILY_LIMIT || 50;
    if (store()) {
      try {
        const key = "wyz:day:" + today() + ":" + email, out = await redis([["INCR", key], ["EXPIRE", key, 172800]]);
        return +out[0] > limit;
      } catch (e) { /* fall back to the in-memory count below */ }
    }
    const key = name + "|" + email + "|" + today();
    const n = (g.__wyzRate.get(key) || 0) + 1;
    g.__wyzRate.set(key, n);
    if (g.__wyzRate.size > 2000) g.__wyzRate.clear();
    return n > limit;
  };
}

async function isBlocked(email) {
  if (!store()) return false;
  try { return (await redis([["SISMEMBER", "wyz:blocked", email]]))[0] === 1; } catch (e) { return false; }
}

/* Best effort: never lets a storage hiccup break an answer. */
async function record(email, provider, usage) {
  if (!store()) return;
  const u = "wyz:u:" + email, now = Date.now();
  try {
    await redis([["SADD", "wyz:users", email], ["HINCRBY", u, "calls", 1], ["HINCRBY", u, "calls_" + provider, 1],
      ["HINCRBY", u, "tokens_in", Math.max(0, +(usage && usage.in) || 0)], ["HINCRBY", u, "tokens_out", Math.max(0, +(usage && usage.out) || 0)],
      ["HSET", u, "last", now], ["HSETNX", u, "first", now]]);
  } catch (e) { /* ignore */ }
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
/* Text is capped on its own, so a file never lets someone send a huge amount of text. */
function weigh(c) {
  if (typeof c === "string") return { text: c.length, files: 0 };
  return c.reduce(function (n, b) { if (b.text) n.text += b.text.length; else if (b.source && b.source.data) n.files += b.source.data.length; return n; }, { text: 0, files: 0 });
}

/* opts.blocks lets the caller send files (PDF and pictures) as content blocks. Only Claude's function turns this on. */
async function gate(req, res, ready, overLimit, opts) {
  const blocks = !!(opts && opts.blocks);
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET") { res.status(200).json({ ok: ready, missing: (opts && opts.missing) || [] }); return null; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return null; }
  if (!ready) { res.status(503).json({ error: "This AI isn't set up on this site yet. Missing in Vercel: " + (((opts && opts.missing) || []).join(", ") || "settings") + "." }); return null; }
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) { res.status(401).json({ error: "Sign in with Google first." }); return null; }
  let who = null;
  try { who = await verify(token); } catch (e) { res.status(502).json({ error: "Couldn't check your Google sign-in." }); return null; }
  if (!who) { res.status(401).json({ error: "Your Google sign-in isn't valid for this site." }); return null; }
  if (!allowed(who.email)) { res.status(403).json({ error: "This AI isn't turned on for your account." }); return null; }
  if (await isBlocked(who.email)) { res.status(403).json({ error: "The owner has switched off your access to the shared AI." }); return null; }
  const b = typeof req.body === "string" ? safeParse(req.body) : (req.body || {});
  const msgs = Array.isArray(b.messages) ? b.messages : [];
  const valid = msgs.length && msgs.every(function (m) { return m && (m.role === "user" || m.role === "assistant") && okContent(m.content, blocks && m.role === "user"); });
  const size = valid ? msgs.reduce(function (n, m) { const w = weigh(m.content); n.text += w.text; n.files += w.files; return n; }, { text: 0, files: 0 }) : { text: 0, files: 0 };
  if (!valid || size.text > 250000 || size.files > 4300000) { res.status(400).json({ error: "Bad request." }); return null; }
  if (await overLimit(who.email)) { res.status(429).json({ error: "Daily limit reached. Try again tomorrow." }); return null; }
  return { who: who, msgs: msgs, body: b };
}

/* Names (never values) of the settings a shared AI still needs in Vercel. */
function missingFor(keyName) {
  const m = [keyName, "GOOGLE_CLIENT_ID"].filter(function (k) { return !String(process.env[k] || "").trim(); });
  if (!list(process.env.ALLOWED_EMAILS).length && !list(process.env.ALLOWED_DOMAINS).length) m.push("ALLOWED_EMAILS");
  return m;
}

module.exports = { missingFor, list, safeParse, verify, allowed, makeLimiter, gate, store, redis, today, record, isBlocked };
