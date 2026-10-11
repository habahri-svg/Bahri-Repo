/* Vercel serverless function: lets signed-in Google users use the site owner's ChatGPT (OpenAI), with no key on their side.
   Environment variables (Vercel, Settings, Environment Variables):
     OPENAI_API_KEY         required. The owner's OpenAI API key. Never sent to the browser.
     GOOGLE_CLIENT_ID       required. The same Client ID as docs/config.js.
     ALLOWED_EMAILS / ALLOWED_DOMAINS / DAILY_LIMIT   same as the Claude function.
     OPENAI_MODEL           optional. The standard model. Defaults to gpt-5.6-terra (change it if OpenAI renames it).
     ALLOWED_OPENAI_MODELS  optional. Models people may choose. Defaults to the standard model only.
   The answer is returned in the same shape as the Claude function, so the page treats both alike. */
"use strict";
const S = require("./_shared");
const overLimit = S.makeLimiter("chatgpt");

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-5.6-terra";
const allowedModels = function () { return S.list(process.env.ALLOWED_OPENAI_MODELS || DEFAULT_MODEL); };

module.exports = async function handler(req, res) {
  const ready = !!(process.env.OPENAI_API_KEY && process.env.GOOGLE_CLIENT_ID);
  const ctx = await S.gate(req, res, ready, overLimit);
  if (!ctx) return;
  const b = ctx.body;
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
