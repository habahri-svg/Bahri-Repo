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

/* What Meta sends: messages people write to you, copies of messages you send from the WhatsApp Business phone app
   (Coexistence, field smb_message_echoes) and delivery updates (sent, delivered, read, failed). Media files themselves aren't downloaded. */
function textOf(m) {
  return m.text ? m.text.body : m.button ? m.button.text : m.interactive ? JSON.stringify(m.interactive).slice(0, 200)
    : m[m.type] && m[m.type].caption ? "[" + m.type + "] " + m[m.type].caption : "[" + (m.type || "message") + "]";
}
function fromMeta(body) {
  const out = { msgs: [], sts: [] };
  (body.entry || []).forEach(function (en) {
    (en.changes || []).forEach(function (ch) {
      const v = ch.value || {}, names = {};
      (v.contacts || []).forEach(function (c) { names[c.wa_id] = (c.profile && c.profile.name) || ""; });
      (v.messages || []).forEach(function (m) {
        out.msgs.push({ id: m.id, wa: m.from, name: names[m.from] || "", text: short(textOf(m), 2000), at: (+m.timestamp || Date.now() / 1000) * 1000, dir: "in" });
      });
      (v.message_echoes || []).forEach(function (m) {
        out.msgs.push({ id: m.id, wa: m.to, name: "", text: short(textOf(m), 2000), at: (+m.timestamp || Date.now() / 1000) * 1000, dir: "out", by: "phone app" });
      });
      (v.statuses || []).forEach(function (t) {
        const e = (t.errors && t.errors[0]) || null;
        out.sts.push({ id: t.id, s: String(t.status || ""), at: (+t.timestamp || Date.now() / 1000) * 1000, err: e ? short((e.code ? e.code + " " : "") + (e.title || "") + (e.message ? ": " + e.message : ""), 240) : "" });
      });
    });
  });
  return out;
}

const RANK = { sent: 1, delivered: 2, read: 3, failed: 4 };
async function save(x) {
  if (!S.store()) return;
  const cmds = [];
  (x.msgs || []).forEach(function (m) {
    cmds.push(["LPUSH", "wyz:wa", JSON.stringify(m)]);
    if (m.name) cmds.push(["HSET", "wyz:wa:names", m.wa, m.name]);
  });
  if ((x.msgs || []).length) cmds.push(["LTRIM", "wyz:wa", 0, 499]);
  /* a later "sent" must never replace "delivered" or "read", so only move forward */
  const sts = x.sts || [];
  if (sts.length) {
    const have = await S.redis([["HMGET", "wyz:wa:st"].concat(sts.map(function (t) { return t.id; }))]);
    const cur = (have && have[0]) || [];
    sts.forEach(function (t, i) {
      let old = null; try { old = cur[i] ? JSON.parse(cur[i]) : null; } catch (e) {}
      if (old && (RANK[old.s] || 0) > (RANK[t.s] || 0) && old.s !== "failed") return;
      cmds.push(["HSET", "wyz:wa:st", t.id, JSON.stringify({ s: t.s, at: t.at, err: t.err })]);
    });
    cmds.push(["EXPIRE", "wyz:wa:st", 60 * 24 * 3600]);
  }
  if (cmds.length) await S.redis(cmds);
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
    try { await save(fromMeta(body)); if (S.store()) await S.redis([["SET", "wyz:wa:hook", String(Date.now())]]); } catch (e) { /* Meta retries if we fail, so answer OK only after saving */ return res.status(500).send("storage"); }
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
      if (q.check === "1") {
        if (!base.owner) return res.status(403).json({ error: "Only the owner can check the connection." });
        const rr = await fetch(GRAPH + process.env.WHATSAPP_PHONE_ID + "?fields=display_phone_number,verified_name,quality_rating,code_verification_status,platform_type", { headers: { Authorization: "Bearer " + process.env.WHATSAPP_TOKEN } });
        const jj = await rr.json().catch(function () { return {}; });
        const hk = await S.redis([["GET", "wyz:wa:hook"]]);
        if (!rr.ok) return res.status(200).json(Object.assign(base, { check: { ok: false, error: short((jj.error && jj.error.message) || ("Meta answered " + rr.status), 200) }, hookAt: +(hk && hk[0]) || 0 }));
        return res.status(200).json(Object.assign(base, { check: { ok: true, number: jj.display_phone_number || "", name: jj.verified_name || "", quality: jj.quality_rating || "", platform: jj.platform_type || "" }, hookAt: +(hk && hk[0]) || 0 }));
      }
      const out = await S.redis([["LRANGE", "wyz:wa", 0, 499], ["HGETALL", "wyz:wa:names"], ["HGETALL", "wyz:wa:st"], ["GET", "wyz:wa:hook"]]);
      const stf = out[2] || [], stMap = {};
      for (let i = 0; i + 1 < stf.length; i += 2) { try { stMap[stf[i]] = JSON.parse(stf[i + 1]); } catch (e) {} }
      const names = {}, f = out[1] || [];
      for (let i = 0; i + 1 < f.length; i += 2) names[f[i]] = f[i + 1];
      const chats = {};
      (out[0] || []).map(function (s) { try { return JSON.parse(s); } catch (e) { return null; } }).filter(Boolean).forEach(function (m) {
        const c = chats[m.wa] = chats[m.wa] || { wa: m.wa, name: names[m.wa] || m.name || "", msgs: [], lastIn: 0 };
        if (m.dir === "out" && m.id && stMap[m.id]) m.st = stMap[m.id];
        if (c.msgs.length < 40) c.msgs.push(m);
        if (m.dir === "in") c.lastIn = Math.max(c.lastIn, m.at);
      });
      const list = Object.values(chats).map(function (c) { c.msgs.reverse(); c.last = c.msgs[c.msgs.length - 1]; c.canReply = Date.now() - c.lastIn < 24 * 3600000; return c; })
        .sort(function (a, b) { return b.last.at - a.last.at; }).slice(0, 30);
      return res.status(200).json(Object.assign(base, { chats: list, hookAt: +out[3] || 0 }));
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
      const mid = (j.messages && j.messages[0] && j.messages[0].id) || "";
      await save({ msgs: [{ id: mid, wa: to, name: "", text: text, at: Date.now(), dir: "out", by: who.email }], sts: mid ? [{ id: mid, s: "sent", at: Date.now(), err: "" }] : [] });
      return res.status(200).json({ ok: true, id: mid });
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    return res.status(502).json({ error: String((e && e.message) || "Something went wrong.").slice(0, 200) });
  }
};
