import { langOf, sleep } from './util.js';

export function pickMime() {
  if (!window.MediaRecorder) return '';
  const list = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return list.find((m) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || '';
}

export function deviceSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

// ---------- Engine 1: the phone's built-in speech recognition (free, live) ----------

export class DeviceEngine {
  constructor({ locale, continuous, onFinal, onInterim, onError }) {
    Object.assign(this, { locale, continuous, onFinal, onInterim, onError });
    this.running = false;
    this.rec = null;
  }

  start() {
    this.running = true;
    this._begin();
  }

  _begin() {
    const R = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new R();
    this.rec = r;
    r.lang = this.locale;
    r.interimResults = true;
    r.continuous = this.continuous;
    r.maxAlternatives = 1;
    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0].transcript;
        if (res.isFinal) this.onFinal(text.trim());
        else interim += text;
      }
      this.onInterim(interim.trim());
    };
    r.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') this.running = false;
      this.onError(e.error);
    };
    r.onend = () => {
      this.onInterim('');
      if (this.running) {
        setTimeout(() => {
          if (this.running) {
            try {
              this._begin();
            } catch {}
          }
        }, 200);
      }
    };
    try {
      r.start();
    } catch {}
  }

  setLocale(locale) {
    this.locale = locale;
    if (this.running && this.rec) {
      try {
        this.rec.abort(); // onend restarts with the new locale
      } catch {}
    }
  }

  pause() {
    this.stop();
  }

  resume() {
    this.start();
  }

  async stop() {
    this.running = false;
    try {
      this.rec && this.rec.stop();
    } catch {}
  }
}

// ---------- Engine 2: Whisper in the cloud, in short chunks (best for mixed Arabic and English) ----------

const GHOSTS = [
  'thank you', 'thanks for watching', 'thank you for watching', 'you', 'bye',
  'شكرا', 'شكرا للمشاهدة', 'اشتركوا في القناة', 'ترجمة نانسي قنقر', 'تمت الترجمة', 'موسيقى'
];
const isGhost = (text) => GHOSTS.includes(text.toLowerCase().replace(/[.!?،,؟\s]+/g, ' ').trim());

export class CloudEngine {
  constructor({ stream, lang, chunkMs = 10000, elapsed, transcribe, onSegments, onError }) {
    Object.assign(this, { stream, lang, chunkMs, elapsed, transcribe, onSegments, onError });
    this.running = false;
    this.pending = new Set();
    this.cur = null;
    this.timer = null;
  }

  setLang(l) {
    this.lang = l;
  }

  start() {
    this.running = true;
    this._cycle();
  }

  pause() {
    this.running = false;
    this._flush();
  }

  resume() {
    this.running = true;
    this._cycle();
  }

  async stop() {
    this.running = false;
    this._flush();
    await Promise.allSettled([...this.pending]);
  }

  _flush() {
    clearTimeout(this.timer);
    if (this.cur && this.cur.state !== 'inactive') {
      try {
        this.cur.stop();
      } catch {}
    }
    this.cur = null;
  }

  _cycle() {
    if (!this.running) return;
    const mime = pickMime();
    let rec;
    try {
      rec = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
    } catch (e) {
      this.onError({ code: 'recorder', message: e.message });
      return;
    }
    const parts = [];
    const t0 = this.elapsed();
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) parts.push(e.data);
    };
    rec.onstop = () => {
      const blob = new Blob(parts, { type: rec.mimeType || mime || 'audio/webm' });
      const p = this._handle(blob, t0).finally(() => this.pending.delete(p));
      this.pending.add(p);
    };
    rec.start();
    this.cur = rec;
    this.timer = setTimeout(() => {
      try {
        rec.stop();
      } catch {}
      this._cycle();
    }, this.chunkMs);
  }

  async _handle(blob, t0) {
    if (blob.size < 4000) return;
    let r;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        r = await this.transcribe(blob, this.lang);
        break;
      } catch (e) {
        if (e.status === 429 && attempt === 0) {
          await sleep(Math.min(Number(e.retryAfter) || 5, 20) * 1000);
          continue;
        }
        this.onError(e);
        return;
      }
    }
    if (!r) return;
    const out = [];
    for (const s of r.segments) {
      if (!s.text || s.nsp > 0.6) continue;
      if (s.nsp > 0.25 && isGhost(s.text)) continue;
      out.push({ t: t0 + s.start, text: s.text, lang: langOf(s.text) });
    }
    if (!r.segments.length && r.text && !isGhost(r.text)) out.push({ t: t0, text: r.text, lang: langOf(r.text) });
    if (out.length) this.onSegments(out);
  }
}
