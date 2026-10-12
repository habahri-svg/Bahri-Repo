/* Vercel serverless function: WhatsApp Business messages next to your email (Meta WhatsApp Cloud API).
   Environment variables (Vercel, Settings, Environment Variables):
     WHATSAPP_TOKEN            required. A permanent access token from Meta (System user token with whatsapp_business_messaging).
     WHATSAPP_PHONE_ID         required. The Phone number ID from Meta, WhatsApp, API Setup.
     WHATSAPP_VERIFY_TOKEN     required. Any secret word you choose. Paste the same word in Meta when you add the webhook.
     WHATSAPP_APP_SECRET       recommended. Meta app secret, used to check that messages really come from Meta.
     WHATSAPP_VIEWERS          optional. Comma-separated Google accounts allowed to read and answer, besides OWNER_EMAILS.
     Storage: the same Upstash Redis as /admin keeps the last 500 messages.
   Meta calls GET (to verify) and POST (new messages) on /api/whatsapp. The page calls it with a Google sign-in. */
"use strict";
const crypto = require("crypto");
const S = require("./_shared");
const NEED = ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_ID", "WHATSAPP_VERIFY_TOKEN"];
const GRAPH = "https://graph.facebook.com/v21.0/";

/* Reads the request exactly as Meta sent it (needed to check the signature). Never touch req.body before this. */
function rawBody(req) {
  return new Promise(function (resolve) {
    const chunks = [];
    let done = false;
    const end = function () { if (!done) { done = true; resolve(Buffer.concat(chunks).toString("utf8")); } };
    try {
      if (req.readableEnded) return end();
      req.on("data", function (c) { chunks.push(Buffer.from(c)); }); req.on("end", end); req.on("error", end); setTimeout(end, 3000);
    } catch (e) { end(); }
  });
}
const short = function (s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n) : s; };

/* Messages Meta sends: text, buttons, media captions. Media files themselves aren't downloaded. */
function fromMeta(body) {
  const out = [];
  (body.entry || []).forEach(function (en) {
    (en.changes || []).forEach(function (ch) {
      const v = ch.value || {}, names = {};
      (v.contacts || []).forEach(function (c) { names[c.wa_id] = (c.profile && c.profile.name) || ""; });
      (v.messages || []).forEach(function (m) {
        const text = m.text ? m.text.body : m.button ? m.button.text : m.interactive ? JSON.stringify(m.interactive).slice(0, 200)
          : m[m.type] && m[m.type].caption ? "[" + m.type + "] " + m[m.type].caption : "[" + (m.type || "message") + "]";
        out.push({ id: m.id, wa: m.from, name: names[m.from] || "", text: short(text, 2000), at: (+m.timestamp || Date.now() / 1000) * 1000, dir: "in" });
      });
    });
  });
  return out;
}

async function save(msgs) {
  if (!msgs.length || !S.store()) return;
  const cmds = [];
  msgs.forEach(function (m) {
    cmds.push(["LPUSH", "wyz:wa", JSON.stringify(m)]);
    if (m.name) cmds.push(["HSET", "wyz:wa:names", m.wa, m.name]);
  });
  cmds.push(["LTRIM", "wyz:wa", 0, 499]);
  await S.redis(cmds);
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const q = req.query || {};
  /* 1. Meta checks the webhook address once */
  if (req.method === "GET" && q["hub.mode"] === "subscribe") {
    if (process.env.WHATSAPP_VERIFY_TOKEN && q["hub.verify_token"] === process.env.WHATSAPP_VERIFY_TOKEN) return res.status(200).send(String(q["hub.challenge"] || ""));
    return res.status(403).send("Wrong verify token");
  }
  const auth = String(req.headers.authorization || "");
  /* 2. Meta sends new messages */
  if (req.method === "POST" && !/^Bearer\s+/i.test(auth)) {
    const raw = await rawBody(req);
    const secret = process.env.WHATSAPP_APP_SECRET;
    if (secret) {
      const sig = String(req.headers["x-hub-signature-256"] || ""), want = "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
      if (!raw || sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return res.status(401).send("Bad signature");
    }
    let body = {}; try { body = raw ? JSON.parse(raw) : (req.body && typeof req.body === "object" ? req.body : S.safeParse(req.body)); } catch (e) {}
    if (body.object !== "whatsapp_business_account") return res.status(200).send("ignored");
    try { await save(fromMeta(body)); } catch (e) { /* Meta retries if we fail, so answer OK only after saving */ return res.status(500).send("storage"); }
    return res.status(200).send("ok");
  }
  /* 3. The page, with a Google sign-in */
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token || !process.env.GOOGLE_CLIENT_ID) return res.status(401).json({ error: "Sign in with Google first." });
  let who = null;
  try { who = await S.verify(token); } catch (e) { return res.status(502).json({ error: "Couldn't check your Google sign-in." }); }
  if (!who) return res.status(401).json({ error: "Your Google sign-in isn't valid for this site." });
  const owners = S.list(process.env.OWNER_EMAILS), viewers = owners.concat(S.list(process.env.WHATSAPP_VIEWERS));
  if (viewers.indexOf(who.email) < 0) return res.status(200).json({ viewer: false });
  const missing = NEED.filter(function (k) { return !String(process.env[k] || "").trim(); });
  if (!S.store()) missing.push("Upstash Redis storage");
  const base = { viewer: true, owner: owners.indexOf(who.email) >= 0, ready: !missing.length, missing: missing };
  if (missing.length) return res.status(200).json(base);

  try {
    if (req.method === "GET") {
      const out = await S.redis([["LRANGE", "wyz:wa", 0, 499], ["HGETALL", "wyz:wa:names"]]);
      const names = {}, f = out[1] || [];
      for (let i = 0; i + 1 < f.length; i += 2) names[f[i]] = f[i + 1];
      const chats = {};
      (out[0] || []).map(function (s) { try { return JSON.parse(s); } catch (e) { return null; } }).filter(Boolean).forEach(function (m) {
        const c = chats[m.wa] = chats[m.wa] || { wa: m.wa, name: names[m.wa] || m.name || "", msgs: [], lastIn: 0 };
        if (c.msgs.length < 40) c.msgs.push(m);
        if (m.dir === "in") c.lastIn = Math.max(c.lastIn, m.at);
      });
      const list = Object.values(chats).map(function (c) { c.msgs.reverse(); c.last = c.msgs[c.msgs.length - 1]; c.canReply = Date.now() - c.lastIn < 24 * 3600000; return c; })
        .sort(function (a, b) { return b.last.at - a.last.at; }).slice(0, 30);
      return res.status(200).json(Object.assign(base, { chats: list }));
    }
    if (req.method === "POST") {
      const b = typeof req.body === "string" ? S.safeParse(req.body) : (req.body || {});
      const to = String(b.to || "").replace(/\D/g, ""), text = short(String(b.text || "").trim(), 4000);
      if (!to || !text) return res.status(400).json({ error: "Bad request." });
      const r = await fetch(GRAPH + process.env.WHATSAPP_PHONE_ID + "/messages", { method: "POST", headers: { Authorization: "Bearer " + process.env.WHATSAPP_TOKEN, "content-type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: to, type: "text", text: { preview_url: false, body: text } }) });
      const j = await r.json().catch(function () { return {}; });
      if (!r.ok) {
        const m = (j.error && j.error.message) || "";
        return res.status(502).json({ error: /24 hour|re-engage|131047/i.test(m + (j.error && j.error.code)) ? "WhatsApp only allows a free reply within 24 hours of their last message. After that it needs an approved template." : "WhatsApp refused it (" + r.status + ")" + (m ? ": " + m.slice(0, 140) : "") + "." });
      }
      await save([{ id: (j.messages && j.messages[0] && j.messages[0].id) || "", wa: to, name: "", text: text, at: Date.now(), dir: "out", by: who.email }]);
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    return res.status(502).json({ error: String((e && e.message) || "Something went wrong.").slice(0, 200) });
  }
};
