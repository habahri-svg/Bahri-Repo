/* Vercel serverless function: lets signed-in Google users use the site owner's second AI, with no key on their side.
   It is a FREE AI when GEMINI_API_KEY is set (Google's free Gemini tier, no card needed, get a key at https://aistudio.google.com/apikey).
   It uses OpenAI (paid) only when there is no Gemini key and OPENAI_API_KEY is set. It never switches from the free AI to the paid one by itself.
   Environment variables (Vercel, Settings, Environment Variables):
     GEMINI_API_KEY         the free AI. If it is set, it is used.
     OPENAI_API_KEY         optional and paid. Used only when GEMINI_API_KEY is not set.
     GOOGLE_CLIENT_ID       required. The same Client ID as docs/config.js.
     ALLOWED_EMAILS / ALLOWED_DOMAINS (one is required) / DAILY_LIMIT   same as the Claude function.
     GEMINI_MODEL           optional. Defaults to gemini-3.6-flash (it has a free tier).
     OPENAI_MODEL           optional. Defaults to gpt-5.6-terra.
     ALLOWED_OPENAI_MODELS  optional. Models people may choose when OpenAI is used.
   The answer is returned in the same shape as the Claude function, so the page treats both alike.
   Note: on Google's free tier, prompts may be used to improve Google's products. Keep confidential matters out of it. */
"use strict";
const S = require("./_shared");
const overLimit = S.makeLimiter("chatgpt");

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-5.6-terra";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const useGemini = function () { return !!String(process.env.GEMINI_API_KEY || "").trim(); };
const allowedModels = function () { return S.list(process.env.ALLOWED_OPENAI_MODELS || DEFAULT_MODEL); };


/* The free AI: Google Gemini, called from the server so the key never reaches the browser. */
const textOf = function (c) { return typeof c === "string" ? c : (Array.isArray(c) ? c.map(function (x) { return x && x.text ? x.text : ""; }).join("\n") : ""); };
async function gemini(ctx, res) {
  const wanted = String(ctx.body.model || "").toLowerCase();
  const model = /^gemini-[a-z0-9.-]+$/.test(wanted) ? wanted : GEMINI_MODEL;
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent", {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify({ contents: ctx.msgs.map(function (m) { return { role: m.role === "assistant" ? "model" : "user", parts: [{ text: textOf(m.content) }] }; }), generationConfig: ctx.body.json ? { responseMimeType: "application/json" } : undefined })
    });
    const out = await r.text();
    if (!r.ok) {
      let e = {}; try { e = JSON.parse(out).error || {}; } catch (x) {}
      const m = String(e.message || "");
      const nice = r.status === 429 ? "The free AI is at its free limit for now. Try again in a minute, or use the free chat." :
        r.status === 400 && /API key/i.test(m) || r.status === 403 ? "Google rejected the free AI key. Check GEMINI_API_KEY in Vercel." :
        r.status === 404 ? "The free AI model " + model + " isn't available. Set GEMINI_MODEL in Vercel." :
        "The free AI couldn't answer (" + r.status + ")." + (m ? " " + m.slice(0, 120) : "");
      return res.status(r.status === 429 ? 429 : 502).json({ error: nice });
    }
    const j = JSON.parse(out), u = j.usageMetadata || {};
    try { await S.record(ctx.who.email, "free", { in: u.promptTokenCount, out: u.candidatesTokenCount }); } catch (e) {}
    const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
    const text = parts.map(function (p) { return p.text || ""; }).join("");
    if (!text) return res.status(502).json({ error: "The free AI sent back nothing. Try again." });
    return res.status(200).json({ content: [{ type: "text", text: text }] });
  } catch (e) {
    return res.status(502).json({ error: "Couldn't reach the free AI." });
  }
}

module.exports = async function handler(req, res) {
  const missing = S.missingFor(useGemini() || !process.env.OPENAI_API_KEY ? "GEMINI_API_KEY" : "OPENAI_API_KEY");
  const ready = !missing.length;
  const ctx = await S.gate(req, res, ready, overLimit, { missing: missing, label: useGemini() ? "Free AI (Gemini)" : "ChatGPT" });
  if (!ctx) return;
  const b = ctx.body;
  if (useGemini()) return gemini(ctx, res);
  const wanted = String(b.model || "").toLowerCase();
  const model = allowedModels().indexOf(wanted) >= 0 ? wanted : DEFAULT_MODEL;
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: "Bearer " + process.env.OPENAI_API_KEY },
      body: JSON.stringify({ model: model, messages: ctx.msgs })
    });
    const out = await r.text();
    if (!r.ok) {
      let e = {}; try { e = JSON.parse(out).error || {}; } catch (x) {}
      const m = String(e.message || ""), code = String(e.code || e.type || "");
      const nice = /insufficient_quota/i.test(code) || /quota|billing/i.test(m) ? "ChatGPT has no credit left. The owner needs to add credit at platform.openai.com." :
        /model/i.test(m) && /not.?found|does not exist|access/i.test(m) ? "The ChatGPT model " + model + " isn't available on the owner's account." :
        "ChatGPT couldn't answer (" + r.status + ")." + (m ? " " + m.slice(0, 120) : "");
      return res.status(r.status === 429 ? 429 : 502).json({ error: nice });
    }
    const j = JSON.parse(out);
    try { await S.record(ctx.who.email, "chatgpt", { in: j.usage && j.usage.prompt_tokens, out: j.usage && j.usage.completion_tokens }); } catch (e) {}
    const text = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "";
    return res.status(200).json({ content: [{ type: "text", text: String(text) }] });
  } catch (e) {
    return res.status(502).json({ error: "Couldn't reach ChatGPT." });
  }
};
