import { langOf, tokens, fmtClock } from './util.js';
import { saveSettings } from './store.js';

// Works with any OpenAI-compatible API. Defaults point at Groq's free tier.

export class AiError extends Error {
  constructor(status, message, retryAfter) {
    super(message || 'AI request failed');
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

async function call(cfg, path, init = {}, timeoutMs = 120000) {
  if (!cfg.apiKey) throw new AiError(401, 'No API key');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(cfg.baseUrl.replace(/\/+$/, '') + path, {
      ...init,
      headers: { Authorization: `Bearer ${cfg.apiKey}`, ...(init.headers || {}) },
      signal: ctl.signal
    });
    if (!res.ok) {
      let msg = '';
      try {
        msg = (await res.json()).error?.message || '';
      } catch {}
      throw new AiError(res.status, msg, res.headers.get('retry-after'));
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export function friendlyError(err, t) {
  if (err instanceof AiError) {
    if (err.status === 401 || err.status === 403) return t('errKey');
    if (err.status === 429) return t('errRate');
    if (err.status === 413) return t('errBig');
  }
  if (err && (err.name === 'TypeError' || err.name === 'AbortError')) return t('errNet');
  return (err && err.message) || t('errGeneric');
}

// ---------- model auto-detection (providers rename and retire models) ----------

const CHAT_PREF = [
  'llama-3.3-70b-versatile', 'llama-3.1-8b-instant',
  'meta-llama/llama-4-maverick-17b-128e-instruct', 'meta-llama/llama-4-scout-17b-16e-instruct',
  'openai/gpt-oss-120b', 'openai/gpt-oss-20b'
];
const NOT_CHAT = /whisper|guard|tts|embed|playai|orpheus|safeguard|distil/i;

async function listModels(cfg) {
  const res = await call(cfg, '/models', {}, 15000);
  const j = await res.json();
  return (j.data || []).map((m) => m.id).filter(Boolean);
}

function pickChat(ids) {
  const ok = ids.filter((id) => !NOT_CHAT.test(id));
  return CHAT_PREF.find((p) => ok.includes(p)) || ok[0];
}

function pickStt(ids) {
  const w = ids.filter((id) => /whisper/i.test(id));
  return w.find((id) => /turbo/i.test(id)) || w[0];
}

const isModelError = (e) => e instanceof AiError && (e.status === 404 || (e.status === 400 && /model/i.test(e.message)));

// Runs `run(model)`. If the provider says the model is gone, finds a working one, retries, and remembers it.
async function withModel(cfg, field, run) {
  try {
    return await run(cfg[field]);
  } catch (e) {
    if (!isModelError(e)) throw e;
    const ids = await listModels(cfg);
    const m = field === 'sttModel' ? pickStt(ids) : pickChat(ids);
    if (!m || m === cfg[field]) throw e;
    const out = await run(m);
    cfg[field] = m;
    saveSettings(cfg);
    return out;
  }
}

export async function testKey(cfg) {
  const ids = await listModels(cfg);
  if (ids.length) {
    if (!ids.includes(cfg.chatModel) || NOT_CHAT.test(cfg.chatModel)) cfg.chatModel = pickChat(ids) || cfg.chatModel;
    if (!ids.includes(cfg.sttModel)) cfg.sttModel = pickStt(ids) || cfg.sttModel;
    saveSettings(cfg);
  }
  return { chat: cfg.chatModel, stt: cfg.sttModel };
}

// ---------- speech to text ----------

const EXT = { 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'video/mp4': 'mp4', 'video/webm': 'webm', 'audio/x-m4a': 'm4a', 'audio/aac': 'm4a' };

export async function transcribeBlob(cfg, blob, { lang, name } = {}) {
  const base = (blob.type || 'audio/webm').split(';')[0];
  const res = await withModel(cfg, 'sttModel', (model) => {
    const fd = new FormData();
    fd.append('file', blob, name || `audio.${EXT[base] || 'webm'}`);
    fd.append('model', model);
    fd.append('response_format', 'verbose_json');
    fd.append('temperature', '0');
    if (lang && lang !== 'auto') fd.append('language', lang);
    return call(cfg, '/audio/transcriptions', { method: 'POST', body: fd }, 300000);
  });
  const j = await res.json();
  return {
    text: (j.text || '').trim(),
    segments: (j.segments || []).map((s) => ({
      start: s.start || 0,
      end: s.end || 0,
      text: (s.text || '').trim(),
      nsp: s.no_speech_prob ?? 0,
      lp: s.avg_logprob ?? 0
    }))
  };
}

// ---------- chat helpers ----------

async function chat(cfg, messages, { json = false, temperature = 0.2 } = {}) {
  const send = (model, useJson) => {
    const body = { model, messages, temperature };
    if (useJson) body.response_format = { type: 'json_object' };
    return call(cfg, '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  };
  const res = await withModel(cfg, 'chatModel', async (model) => {
    try {
      return await send(model, json);
    } catch (e) {
      // some models reject JSON mode, the prompt already asks for JSON so retry plain
      if (json && e instanceof AiError && e.status === 400 && /response_format|json/i.test(e.message)) return send(model, false);
      throw e;
    }
  });
  const j = await res.json();
  return (j.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const a = text.indexOf('{');
    const b = text.lastIndexOf('}');
    if (a >= 0 && b > a) return JSON.parse(text.slice(a, b + 1));
    throw new Error('Bad AI response');
  }
}

export const TEMPLATE_IDS = ['meeting', 'lecture', 'interview', 'sales', 'study', 'memo'];

const TEMPLATE_HINT = {
  meeting: 'a meeting. Focus on decisions, owners and next steps.',
  lecture: 'a lecture or class. Focus on the main concepts, definitions and examples a student should remember.',
  interview: 'an interview. Focus on the questions asked, the key answers and notable quotes.',
  sales: 'a sales or client call. Focus on needs, objections, pricing, commitments and follow-ups.',
  study: 'a study session. Write revision-ready notes, with key terms and likely exam questions as key points.',
  memo: 'a personal voice memo. Capture the ideas, tasks and reminders.'
};

export function transcriptText(note) {
  const names = note.speakers || {};
  return (note.segments || [])
    .map((s) => `[${fmtClock(s.t)}] ${names[s.speaker] || 'S' + ((s.speaker || 0) + 1)}: ${s.text}`)
    .join('\n');
}

async function condense(cfg, body) {
  const lines = body.split('\n');
  const pieces = [];
  let cur = '';
  for (const l of lines) {
    if (cur.length + l.length > 9000) {
      pieces.push(cur);
      cur = '';
    }
    cur += l + '\n';
  }
  if (cur) pieces.push(cur);
  const out = [];
  for (const p of pieces) {
    out.push(
      await chat(cfg, [
        {
          role: 'system',
          content:
            'Condense this transcript excerpt into detailed bullet notes in the language it was spoken. Keep names, numbers, dates, decisions and tasks exact. Maximum 250 words. Output the bullets only.'
        },
        { role: 'user', content: p }
      ])
    );
  }
  return out.join('\n');
}

function asList(v) {
  return Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];
}

export async function summarize(cfg, note, { lang, template }) {
  const langName = lang === 'ar' ? 'Arabic (clear, natural Modern Standard Arabic)' : 'English';
  let body = transcriptText(note);
  if (body.length > 14000) body = await condense(cfg, body);
  const system = `You are an expert note-taker. The text below is the transcript of ${TEMPLATE_HINT[template] || TEMPLATE_HINT.meeting} It may mix Arabic and English and may contain speech recognition errors. Write everything in ${langName}, even if the speakers used another language. Keep names, numbers and dates exact. Never invent facts that are not in the transcript. Reply with one JSON object only, using exactly these keys: "title" (at most 8 words), "overview" (2 to 4 sentences), "key_points" (array of 3 to 8 short strings), "decisions" (array of strings, may be empty), "action_items" (array of objects with "text", "owner" and "due", using an empty string when unknown), "topics" (array of 2 to 6 short keywords).`;
  const raw = await chat(cfg, [{ role: 'system', content: system }, { role: 'user', content: body }], { json: true });
  const j = parseJson(raw);
  return {
    title: String(j.title || '').trim(),
    overview: String(j.overview || '').trim(),
    key_points: asList(j.key_points),
    decisions: asList(j.decisions),
    action_items: (Array.isArray(j.action_items) ? j.action_items : [])
      .map((a) => (typeof a === 'string' ? { text: a } : a))
      .filter((a) => a && a.text)
      .map((a) => ({ text: String(a.text).trim(), owner: String(a.owner || '').trim(), due: String(a.due || '').trim(), done: false })),
    topics: asList(j.topics),
    at: Date.now(),
    offline: false
  };
}

export async function translateTexts(cfg, texts, target) {
  const langName = target === 'ar' ? 'Arabic' : 'English';
  const out = [];
  for (let i = 0; i < texts.length; i += 30) {
    const part = texts.slice(i, i + 30);
    const raw = await chat(
      cfg,
      [
        {
          role: 'system',
          content: `Translate every item of the JSON array into ${langName}. Keep the meaning, names and numbers. Reply with one JSON object {"translations": [...]} holding exactly ${part.length} strings in the same order.`
        },
        { role: 'user', content: JSON.stringify(part) }
      ],
      { json: true, temperature: 0 }
    );
    const arr = asList(parseJson(raw).translations);
    for (let k = 0; k < part.length; k++) out.push(arr[k] || '');
  }
  return out;
}

export async function answer(cfg, context, question, history = []) {
  const system = `You answer questions about recorded conversations using only the transcript excerpts below. If the answer is not in them, say so plainly. Reply in the same language as the question. Mention moments like [12:40] when they help. Be concise.\n\n${context}`;
  const msgs = [{ role: 'system', content: system }, ...history.slice(-8), { role: 'user', content: question }];
  return chat(cfg, msgs, { temperature: 0.2 });
}

// ---------- retrieval for "ask across all notes" ----------

export function buildGlobalContext(notes, question, fmtDate) {
  const q = new Set(tokens(question));
  const scored = [];
  for (const n of notes) {
    for (const s of n.segments || []) {
      const tk = tokens(s.text);
      let score = 0;
      for (const w of tk) if (q.has(w)) score++;
      if (score) scored.push({ n, s, score: score / Math.sqrt(tk.length + 4) });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  const picks = scored.slice(0, 14);
  let ctx = '';
  const seen = new Set();
  for (const p of picks) {
    if (!seen.has(p.n.id)) {
      seen.add(p.n.id);
      const ov = p.n.summary?.[p.n.lastSummaryLang || 'en']?.overview || '';
      ctx += `\n## ${p.n.title} (${fmtDate(p.n.createdAt)})${ov ? '\nSummary: ' + ov : ''}\n`;
    }
    ctx += `[${fmtClock(p.s.t)}] ${p.s.text}\n`;
  }
  if (!ctx) {
    for (const n of notes.slice(0, 4)) {
      const sm = n.summary?.[n.lastSummaryLang || 'en'];
      ctx += `\n## ${n.title} (${fmtDate(n.createdAt)})\n${sm ? sm.overview : (n.segments || []).slice(0, 6).map((s) => s.text).join(' ')}\n`;
    }
  }
  return ctx.slice(0, 14000);
}

// ---------- offline fallback (no key needed) ----------

const STOP = new Set(
  'the and for are but not you all can had her was one our out has have that this with from they will would there their what about which when your said each she how than them these then been were into more some could other also just like very over such only its who any too did get got let may use way'.split(' ').concat(
    'في من على إلى عن مع هذا هذه ذلك التي الذي أن إن كان كانت ما لا هو هي نحن هم كل بعد قبل بين حتى أو ثم قد لقد لكن عند أي إذا كما'.split(' ')
  )
);

const ACTION_RE =
  /\b(will|need to|needs to|must|should|have to|going to|deadline|follow up|action item|by (monday|tuesday|wednesday|thursday|friday|tomorrow|next week))\b|(سأ|سوف|يجب|لازم|علينا|ينبغي|بحلول|غدا|غداً|متابعة|موعد)/i;

export function quickSummary(note) {
  const text = (note.segments || []).map((s) => s.text).join(' ');
  const sentences = text
    .split(/(?<=[.!?؟])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);
  const freq = {};
  for (const w of tokens(text)) if (w.length > 2 && !STOP.has(w)) freq[w] = (freq[w] || 0) + 1;
  const scored = sentences.map((s, i) => {
    const tk = tokens(s);
    const score = tk.reduce((a, w) => a + (freq[w] || 0), 0) / Math.sqrt(tk.length + 1);
    return { s, i, score };
  });
  const top = [...scored].sort((a, b) => b.score - a.score).slice(0, 6).sort((a, b) => a.i - b.i);
  const actions = sentences.filter((s) => ACTION_RE.test(s)).slice(0, 6);
  const topics = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map((e) => e[0]);
  const first = (note.segments || [])[0]?.text || '';
  return {
    title: first.split(/\s+/).slice(0, 7).join(' '),
    overview: top.slice(0, 3).map((x) => x.s).join(' '),
    key_points: top.slice(3).map((x) => x.s),
    decisions: [],
    action_items: actions.map((a) => ({ text: a, owner: '', due: '', done: false })),
    topics,
    at: Date.now(),
    offline: true
  };
}

export function detectActions(segments) {
  return segments.filter((s) => ACTION_RE.test(s.text)).slice(-2).map((s) => s.text);
}

export { langOf };
