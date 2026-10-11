/* Vercel serverless function: lets signed-in Google users use the site owner's Claude, with no key on their side.
   Environment variables (Vercel, Settings, Environment Variables):
     ANTHROPIC_API_KEY   required. The owner's Claude API key. Never sent to the browser.
     GOOGLE_CLIENT_ID    required. The same Client ID as docs/config.js. Tokens issued to any other app are refused.
     ALLOWED_EMAILS      optional. Comma-separated list. If set, only these Google accounts can use it.
     ALLOWED_DOMAINS     optional. Comma-separated list such as wyzrent.com.
     DAILY_LIMIT         optional. Calls per person per day (default 50).
     CLAUDE_MODEL        optional. The standard model. Defaults to claude-sonnet-5-5.
     ALLOWED_MODELS      optional. Models people may choose. Defaults to Sonnet 5.5, Haiku 5.5 and Haiku 4.5.
   GET returns {ok:true} when the function is configured, so the page knows to switch Claude on automatically. */
"use strict";
const S = require("./_shared");
const overLimit = S.makeLimiter("claude");

/* Standard model is Sonnet 5.5. People may pick another from the allowed list. Add Opus with
   ALLOWED_MODELS=claude-sonnet-5-5,claude-haiku-5-5,claude-haiku-4-5-20251001,claude-opus-5-5 */
const DEFAULT_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";
const allowedModels = function () { return S.list(process.env.ALLOWED_MODELS || "claude-sonnet-5-5,claude-haiku-5-5,claude-haiku-4-5-20251001"); };

module.exports = async function handler(req, res) {
  const missing = ["ANTHROPIC_API_KEY", "GOOGLE_CLIENT_ID"].filter(function (k) { return !String(process.env[k] || "").trim(); });
  const ready = !missing.length;
  const ctx = await S.gate(req, res, ready, overLimit, { blocks: true, missing: missing });
  if (!ctx) return;
  const b = ctx.body;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: allowedModels().indexOf(String(b.model || "").toLowerCase()) >= 0 ? String(b.model).toLowerCase() : DEFAULT_MODEL, max_tokens: Math.min(+b.max_tokens || 4000, 8000), messages: ctx.msgs })
    });
    const out = await r.text();
    let msg = "";
    if (!r.ok) { try { msg = (JSON.parse(out).error || {}).message || ""; } catch (e) {} }
    const nice = /credit balance/i.test(msg) ? "Claude has no credit left. The owner needs to add credit in the Anthropic console." : "Claude couldn't answer (" + r.status + ")." + (msg ? " " + String(msg).slice(0, 120) : "");
    if (r.ok) { try { const u = JSON.parse(out).usage || {}; await S.record(ctx.who.email, "claude", { in: u.input_tokens, out: u.output_tokens }); } catch (e) {} }
    res.status(r.ok ? 200 : (r.status === 429 || r.status === 529 ? 429 : 502)).setHeader("content-type", "application/json");
    return res.send(r.ok ? out : JSON.stringify({ error: nice }));
  } catch (e) {
    return res.status(502).json({ error: "Couldn't reach Claude." });
  }
};
