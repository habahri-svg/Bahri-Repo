/* Vercel serverless function: phone notifications for the 8am and 6pm brief (3.48).
   Privacy: the server keeps only each device's push address. It never sees emails, tasks or My Life items.
   The notification carries no data; the phone shows "Your morning brief" or "Your evening brief" and opens the page.
   Needs Upstash Redis (the same storage as /admin and Team pulse). The push keys (VAPID) are made once and kept there,
   or set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY_JWK yourself.
   GET                       signed in: {ready, key}
   POST {action:"subscribe", sub} | {action:"unsubscribe", endpoint} | {action:"test"}   signed in
   GET ?cron=morning|evening  Vercel Cron only (CRON_SECRET, or the Vercel cron agent with a once-a-day lock) */
"use strict";
const crypto = require("crypto");
const S = require("./_shared");

const b64u = function (buf) { return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const dubaiDay = function () { return new Date(Date.now() + 4 * 3600000).toISOString().slice(0, 10); };

async function keys() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY_JWK) return { pub: process.env.VAPID_PUBLIC_KEY, jwk: S.safeParse(process.env.VAPID_PRIVATE_KEY_JWK) };
  if (!S.store()) return null;
  const got = (await S.redis([["GET", "wyz:vapid"]]))[0];
  if (got) return S.safeParse(got);
  const kp = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = kp.privateKey.export({ format: "jwk" });
  const raw = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, "base64"), Buffer.from(jwk.y, "base64")]);
  const k = { pub: b64u(raw), jwk: jwk };
  await S.redis([["SET", "wyz:vapid", JSON.stringify(k), "NX"]]);
  return S.safeParse((await S.redis([["GET", "wyz:vapid"]]))[0]) || k;   /* if two requests raced, everyone uses the stored pair */
}
function vapidJwt(aud, jwk) {
  const head = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const body = b64u(JSON.stringify({ aud: aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: "mailto:" + (process.env.OWNER_EMAIL || "habahri@gmail.com") }));
  const key = crypto.createPrivateKey({ key: jwk, format: "jwk" });
  const sig = crypto.sign("sha256", Buffer.from(head + "." + body), { key: key, dsaEncoding: "ieee-p1363" });
  return head + "." + body + "." + b64u(sig);
}
/* a push with no payload: nothing to encrypt, nothing private travels */
async function sendOne(sub, k) {
  const u = new URL(sub.endpoint);
  const r = await fetch(sub.endpoint, { method: "POST", headers: { TTL: "21600", Urgency: "normal", "Content-Length": "0", Authorization: "vapid t=" + vapidJwt(u.origin, k.jwk) + ", k=" + k.pub } });
  return r.status;
}
const okEndpoint = function (e) { try { const u = new URL(String(e)); return u.protocol === "https:" && /(^|\.)(googleapis\.com|mozilla\.com|mozaws\.net|push\.apple\.com|notify\.windows\.com)$/.test(u.hostname); } catch (x) { return false; } };

async function sendTo(email, k) {
  const subs = ((await S.redis([["SMEMBERS", "wyz:push:" + email]]))[0] || []).map(S.safeParse).filter(function (s) { return s && s.endpoint; });
  let sent = 0;
  for (const s of subs) {
    try {
      const st = await sendOne(s, k);
      if (st === 404 || st === 410) await S.redis([["SREM", "wyz:push:" + email, JSON.stringify(s)]]);
      else if (st < 300) sent++;
    } catch (e) { /* one bad device doesn't stop the rest */ }
  }
  return sent;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const q = req.query || {};

  /* Vercel Cron at 08:00 and 18:00 Dubai time */
  if (req.method === "GET" && (q.cron === "morning" || q.cron === "evening")) {
    const secret = String(process.env.CRON_SECRET || "");
    const auth = String(req.headers.authorization || "");
    const agent = String(req.headers["user-agent"] || "");
    if (secret ? auth !== "Bearer " + secret : !/vercel-cron/i.test(agent)) return res.status(401).json({ error: "Not allowed." });
    if (!S.store()) return res.status(200).json({ ok: false, storage: false });
    const lock = (await S.redis([["SET", "wyz:push:sent:" + dubaiDay() + ":" + q.cron, "1", "NX", "EX", 86400]]))[0];
    if (lock !== "OK") return res.status(200).json({ ok: true, already: true });
    const k = await keys(); if (!k) return res.status(200).json({ ok: false });
    const people = (await S.redis([["SMEMBERS", "wyz:pushusers"]]))[0] || [];
    let sent = 0; for (const e of people) sent += await sendTo(e, k);
    return res.status(200).json({ ok: true, sent: sent });
  }

  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token || !process.env.GOOGLE_CLIENT_ID) return res.status(401).json({ error: "Sign in with Google first." });
  let who = null;
  try { who = await S.verify(token); } catch (e) { return res.status(502).json({ error: "Couldn't check your Google sign-in." }); }
  if (!who) return res.status(401).json({ error: "Your Google sign-in isn't valid for this site." });
  const owners = S.list(process.env.OWNER_EMAILS).concat([String(process.env.OWNER_EMAIL || "habahri@gmail.com").toLowerCase()]);
  if (!S.allowed(who.email) && owners.indexOf(who.email) < 0) return res.status(403).json({ error: "This site isn't turned on for your account." });
  if (!S.store()) return res.status(200).json({ ready: false, storage: false });
  let k = null; try { k = await keys(); } catch (e) { return res.status(200).json({ ready: false, error: "Couldn't make the notification keys." }); }
  if (req.method === "GET") return res.status(200).json({ ready: !!k, key: k && k.pub });
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const b = typeof req.body === "string" ? S.safeParse(req.body) : (req.body || {});
  const key = "wyz:push:" + who.email;
  if (b.action === "subscribe") {
    const s = b.sub || {};
    if (!okEndpoint(s.endpoint)) return res.status(400).json({ error: "That device address isn't a known push service." });
    const clean = JSON.stringify({ endpoint: String(s.endpoint) });
    const all = ((await S.redis([["SMEMBERS", key]]))[0] || []);
    const cmds = [["SADD", key, clean], ["SADD", "wyz:pushusers", who.email], ["EXPIRE", key, 180 * 86400]];
    if (all.length >= 6 && all.indexOf(clean) < 0) cmds.unshift(["SREM", key, all[0]]);
    await S.redis(cmds);
    return res.status(200).json({ ok: true });
  }
  if (b.action === "unsubscribe") {
    await S.redis([["SREM", key, JSON.stringify({ endpoint: String(b.endpoint || "") })]]);
    return res.status(200).json({ ok: true });
  }
  if (b.action === "test") {
    const n = await sendTo(who.email, k);
    return res.status(200).json({ ok: n > 0, sent: n });
  }
  return res.status(400).json({ error: "Bad request." });
};
