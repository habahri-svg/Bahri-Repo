import { langOf, tokens, fmtClock, sleep } from './util.js';
import { saveSettings } from './store.js';

// Works with any OpenAI-compatible API. Defaults point at Groq's free tier.

export class AiError extends Error {
  constructor(status, message, retryAfter) {
    super(message || 'AI request failed');
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

async function callOnce(cfg, path, init = {}, timeoutMs = 120000) {
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

// The free tier answers 429 or 503 when it is busy, waiting a few seconds and asking again usually works.
async function call(cfg, path, init = {}, timeoutMs = 120000, retries = 2) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await callOnce(cfg, path, init, timeoutMs);
    } catch (e) {
      const again = e instanceof AiError && (e.status === 429 || e.status === 503) && attempt < retries;
      if (!again) throw e;
      await sleep(Math.min(Number(e.retryAfter) || 4 * (attempt + 1), 20) * 1000);
    }
  }
}

export class BadReply extends Error {
  constructor() {
    super('The AI reply could not be read');
    this.name = 'BadReply';
  }
}

export function friendlyError(err, t) {
  const ver = typeof window !== 'undefined' && window.NOTA_VERSION ? ` [Nota+ ${window.NOTA_VERSION}]` : '';
  if (err instanceof AiError && isModelError(err)) return `${t('errModel')} (${err.message})${ver}`;
  if (err instanceof AiError) {
    if (err.status === 401 || err.status === 403) return err.message && err.message !== 'No API key' ? `${t('errKey')} (${err.message})` : t('errKey');
    if (err.status === 429) return t('errRate');
    if (err.status === 413) return t('errBig');
  }
  if (err && err.name === 'BadReply') return t('errBadReply');
  if (err && (err.name === 'AbortError' || (err.name === 'TypeError' && /fetch|network|load failed|failed to/i.test(err.message || '')))) return t('errNet');
  return ((err && err.message) || t('errGeneric')) + ver;
}

// ---------- model auto-detection (providers rename and retire models) ----------

const CHAT_PREF = [
  'llama-3.3-70b-versatile', 'llama-3.1-8b-instant',
  'meta-llama/llama-4-maverick-17b-128e-instruct', 'meta-llama/llama-4-scout-17b-16e-instruct',
  'openai/gpt-oss-120b', 'openai/gpt-oss-20b'
];
const NOT_CHAT = /whisper|guard|tts|embed|playai|orpheus|safeguard|distil/i;
// Tried when the provider's own model list is empty or unavailable.
const CHAT_FALLBACK = [
  'llama-3.1-8b-instant', 'openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta-llama/llama-4-maverick-17b-128e-instruct', 'qwen/qwen3-32b', 'moonshotai/kimi-k2-instruct', 'gemma2-9b-it', 'llama3-70b-8192', 'llama3-8b-8192'
];
const STT_FALLBACK = ['whisper-large-v3-turbo', 'whisper-large-v3'];

async function listModels(cfg) {
  const res = await call(cfg, '/models', {}, 15000);
  const j = await res.json();
  return (j.data || []).map((m) => m.id).filter(Boolean);
}

function chatCandidates(ids) {
  const ok = ids.filter((id) => !NOT_CHAT.test(id));
  return [...CHAT_PREF.filter((p) => ok.includes(p)), ...ok.filter((id) => !CHAT_PREF.includes(id))];
}

function sttCandidates(ids) {
  const w = ids.filter((id) => /whisper/i.test(id));
  return [...w.filter((id) => /turbo/i.test(id)), ...w.filter((id) => !/turbo/i.test(id))];
}

const pickChat = (ids) => chatCandidates(ids)[0];
const pickStt = (ids) => sttCandidates(ids)[0];

const MODEL_GONE = /(not found|does not exist|decommission|deprecat|no longer|unsupported|not supported|no access|do not have access|permission|blocked)/i;
const isModelError = (e) =>
  e instanceof AiError && (e.status === 404 || ((e.status === 400 || e.status === 403) && /model/i.test(e.message) && MODEL_GONE.test(e.message) && !/context|token|length/i.test(e.message)));

// Runs `run(model)`. If the provider refuses the model, really tries the other models the key can see, one by one,
// and remembers the first that works. A model can be listed yet blocked for an account, so listing alone is not enough.
async function withModel(cfg, field, run, preferred) {
  const tried = new Set();
  const attempt = async (m) => {
    tried.add(m);
    return run(m);
  };
  if (preferred && preferred !== cfg[field]) {
    try {
      return await attempt(preferred); // e.g. the larger Arabic speech model, quietly falls back if the key cannot use it
    } catch (e) {
      if (!isModelError(e)) throw e;
    }
  }
  try {
    return await attempt(cfg[field]);
  } catch (e) {
    if (!isModelError(e)) throw e;
    let ids = [];
    try {
      ids = await listModels(cfg);
    } catch (le) {
      if (le instanceof AiError && (le.status === 401 || le.status === 403)) throw le; // the key itself is the problem
    }
    const known = field === 'sttModel' ? sttCandidates(ids) : chatCandidates(ids);
    const extra = (field === 'sttModel' ? STT_FALLBACK : CHAT_FALLBACK).filter((m) => !known.includes(m));
    const list = [...known, ...extra];
    let last = e;
    for (const m of list) {
      if (tried.has(m)) continue;
      try {
        const out = await attempt(m);
        cfg[field] = m;
        saveSettings(cfg);
        return out;
      } catch (err) {
        if (!isModelError(err)) throw err;
        last = err;
        if (tried.size >= 12) break;
      }
    }
    throw last;
  }
}

export async function testKey(cfg) {
  const ids = await listModels(cfg); // a wrong key stops here with 401
  if (ids.length && !ids.includes(cfg.sttModel)) cfg.sttModel = pickStt(ids) || cfg.sttModel;
  await ping(cfg); // a real request, this also finds a chat model the key is allowed to use
  saveSettings(cfg);
  return { chat: cfg.chatModel, stt: cfg.sttModel };
}

// ---------- speech to text ----------

const EXT = { 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'video/mp4': 'mp4', 'video/webm': 'webm', 'audio/x-m4a': 'm4a', 'audio/aac': 'm4a' };

const AR_PROMPT = 'مرحباً. هذا حديث باللغة العربية.';

async function transcribeOnce(cfg, blob, { lang, name, retries, hint }) {
  const base = (blob.type || 'audio/webm').split(';')[0];
  const res = await withModel(
    cfg,
    'sttModel',
    (model) => {
      const fd = new FormData();
      fd.append('file', blob, name || `audio.${EXT[base] || 'webm'}`);
      fd.append('model', model);
      fd.append('response_format', 'verbose_json');
      fd.append('temperature', '0');
      if (lang && lang !== 'auto') fd.append('language', lang);
      // The prompt steers spelling and style: an Arabic cue for Arabic, then the names and the last words said.
      const prompt = [lang === 'ar' ? AR_PROMPT : '', hint || ''].filter(Boolean).join(' ').slice(-220);
      if (prompt) fd.append('prompt', prompt);
      return call(cfg, '/audio/transcriptions', { method: 'POST', body: fd }, 300000, retries);
    },
    cfg.sttQuality === 'fast' ? undefined : 'whisper-large-v3' // the larger model is clearly more accurate, esp. for Arabic
  );
  const j = await res.json();
  return {
    text: (j.text || '').trim(),
    detected: String(j.language || '').toLowerCase(),
    segments: (j.segments || []).map((s) => ({
      start: s.start || 0,
      end: s.end || 0,
      text: (s.text || '').trim(),
      nsp: s.no_speech_prob ?? 0,
      lp: s.avg_logprob ?? 0
    }))
  };
}

export async function transcribeBlob(cfg, blob, { lang, name, retries = 2, hint } = {}) {
  const r = await transcribeOnce(cfg, blob, { lang, name, retries, hint });
  // Auto mode sometimes calls an Arabic dialect Persian, Urdu or Malay. Only Arabic and English matter here, so redo it as Arabic.
  if ((!lang || lang === 'auto') && r.text && !['english', 'arabic', 'en', 'ar'].includes(r.detected)) {
    try {
      const again = await transcribeOnce(cfg, blob, { lang: 'ar', name, retries, hint });
      if (again.text) return again;
    } catch {}
  }
  return r;
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
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(text.slice(a, b + 1));
      } catch {}
    }
    throw new BadReply();
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
  const lines = body.split('\n').flatMap((l) => (l.length > 8000 ? l.match(/[\s\S]{1,8000}/g) : [l]));
  const pieces = [];
  let cur = '';
  for (const l of lines) {
    if (cur && cur.length + l.length > 9000) {
      pieces.push(cur);
      cur = '';
    }
    cur += l + '\n';
  }
  if (cur.trim()) pieces.push(cur);
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

export async function translateTexts(cfg, texts, target, onBatch) {
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
    const tj = parseJson(raw).translations;
    const arr = Array.isArray(tj) ? tj.map((x) => String(x ?? '').trim()) : [];
    const got = part.map((_, k) => arr[k] || '');
    out.push(...got);
    if (onBatch) onBatch(i, got); // hand over each batch as it arrives so a later failure keeps earlier work
  }
  return out;
}

export async function ping(cfg) {
  return chat(cfg, [{ role: 'user', content: 'Reply with the single word OK.' }], { temperature: 0 });
}

// Fixes misheard words, spelling and punctuation line by line. Never translates or shortens.
export async function polishTexts(cfg, texts, names = [], onBatch) {
  const out = [];
  for (let i = 0; i < texts.length; i += 25) {
    const part = texts.slice(i, i + 25);
    const who = names.length ? ` People in the conversation: ${names.join(', ')}.` : '';
    const raw = await chat(
      cfg,
      [
        {
          role: 'system',
          content: `You correct speech-recognition mistakes in transcript lines. Keep each line in its own language, keep its meaning and keep it about the same length. Fix words that were clearly misheard (use the surrounding lines for context), plus spelling and punctuation. Never translate, summarise, add or remove information.${who} Reply with one JSON object {"lines": [...]} holding exactly ${part.length} strings in the same order.`
        },
        { role: 'user', content: JSON.stringify(part) }
      ],
      { json: true, temperature: 0 }
    );
    const lj = parseJson(raw).lines;
    const arr = Array.isArray(lj) ? lj.map((x) => String(x ?? '').trim()) : [];
    const got = part.map((orig, k) => {
      const n = arr[k];
      if (!n) return orig;
      const ratio = n.length / Math.max(1, orig.length);
      return ratio < 0.5 || ratio > 2 ? orig : n; // a rewrite that changes the length a lot is not a correction, keep the original
    });
    out.push(...got);
    if (onBatch) onBatch(i, got);
  }
  return out;
}

export async function answer(cfg, context, question, history = []) {
  const system = `You answer questions about recorded conversations using only the transcript excerpts below. If the answer is not in them, say so plainly. Reply in the same language as the question. Mention moments like [12:40] when they help. Be concise.\n\n${context}`;
  const msgs = [{ role: 'system', content: system }, ...history.slice(-8), { role: 'user', content: question }];
  return chat(cfg, msgs, { temperature: 0.2 });
}

// ---------- who is speaking (an AI guess from the conversation) ----------

export async function detectSpeakers(cfg, note, preset = {}) {
  const segs = note.segments || [];
  const turns = new Array(segs.length).fill(-1);
  const known = Object.entries(preset)
    .filter(([id, name]) => Number(id) >= 0 && Number(id) <= 5 && name)
    .map(([id, name]) => ({ id: Number(id), name: String(name) }));
  const CH = 60;
  for (let i = 0; i < segs.length; i += CH) {
    const part = segs.slice(i, i + CH);
    const lines = part.map((s, k) => `${i + k}: ${s.text.slice(0, 300)}`).join('\n');
    const prior = known.length
      ? `Speakers found so far: ${JSON.stringify(known)}. Reuse these ids for the same people and add a new id only for a new person.`
      : '';
    const raw = await chat(
      cfg,
      [
        {
          role: 'system',
          content: `You label who is speaking in the transcript of a conversation between several people. Use only conversational cues: questions and answers, people addressing each other by name, topic changes and language switches. ${prior} Use at most 6 speakers with ids 0 to 5. If someone's name is said in the conversation, give it as the name, otherwise leave the name empty. Reply with one JSON object {"speakers":[{"id":0,"name":""}],"turns":[{"i":0,"s":0}]} where "turns" has one entry for every line number you were given.`
        },
        { role: 'user', content: lines }
      ],
      { json: true, temperature: 0 }
    );
    const j = parseJson(raw);
    for (const sp of j.speakers || []) {
      const id = Number(sp.id);
      if (!Number.isInteger(id) || id < 0 || id > 5) continue;
      const name = String(sp.name || '').trim();
      const have = known.find((k) => k.id === id);
      if (!have) known.push({ id, name });
      else if (!have.name && name) have.name = name;
    }
    for (const t of j.turns || []) {
      const idx = Number(t.i);
      const sp = Number(t.s);
      if (Number.isInteger(idx) && idx >= i && idx < i + part.length && Number.isInteger(sp) && sp >= 0 && sp <= 5) turns[idx] = sp;
    }
  }
  for (let i = 0; i < turns.length; i++) if (turns[i] < 0) turns[i] = i ? turns[i - 1] : 0;
  const names = {};
  for (const k of known) if (k.name) names[k.id] = k.name;
  return { turns, names };
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
