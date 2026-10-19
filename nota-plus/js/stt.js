import { langOf, sleep } from './util.js';

export function pickMime() {
  if (!window.MediaRecorder) return '';
  const list = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return list.find((m) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || '';
}

export function deviceSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

const FATAL = ['not-allowed', 'service-not-allowed', 'language-not-supported', 'network', 'audio-capture'];

// ---------- Engine 1: the phone's built-in speech recognition (free, live) ----------

export class DeviceEngine {
  constructor({ locale, continuous, onFinal, onInterim, onError }) {
    Object.assign(this, { locale, continuous, onFinal, onInterim, onError });
    this.running = false;
    this.rec = null;
    this.gen = 0; // each recognizer gets a number so a stale one can never restart or duplicate text
    this.alive = false;
    this.timer = null;
    this.emptyRuns = 0;
    this.failures = 0;
    this.waiters = [];
  }

  start() {
    this.running = true;
    this.failures = 0;
    this._begin();
  }

  _begin() {
    clearTimeout(this.timer);
    this.timer = null;
    const R = window.SpeechRecognition || window.webkitSpeechRecognition;
    const gen = ++this.gen;
    const r = new R();
    this.rec = r;
    let pending = ''; // interim text of this session that never became final
    let got = false;
    r.lang = this.locale;
    r.interimResults = true;
    r.continuous = this.continuous;
    r.maxAlternatives = 1;
    r.onstart = () => {
      if (gen === this.gen) {
        this.alive = true;
        this.failures = 0;
      }
    };
    r.onresult = (e) => {
      if (gen !== this.gen) return;
      got = true;
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0].transcript;
        if (res.isFinal) {
          pending = '';
          this.onFinal(text.trim());
        } else interim += text;
      }
      pending = interim.trim();
      this.onInterim(pending);
    };
    r.onerror = (e) => {
      if (gen !== this.gen) return;
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      if (FATAL.includes(e.error)) this.running = false; // stop the restart loop, the owner decides what to do
      this.onError(e.error);
    };
    r.onend = () => {
      if (gen === this.gen) this.alive = false;
      if (pending) {
        const p = pending;
        pending = '';
        this.onFinal(p); // the session ended before the last words were marked final
      }
      if (gen === this.gen) this.onInterim('');
      this.waiters.splice(0).forEach((f) => f());
      if (this.running && gen === this.gen) {
        this.emptyRuns = got ? 0 : this.emptyRuns + 1;
        const delay = this.emptyRuns > 3 ? Math.min(1500, 200 * (this.emptyRuns - 2)) : 200; // calm down after repeated silence
        this.timer = setTimeout(() => {
          this.timer = null;
          if (this.running && gen === this.gen) this._begin();
        }, delay);
      }
    };
    try {
      r.start();
    } catch {
      this.failures++;
      if (this.failures >= 3) {
        this.running = false;
        this.onError('audio-capture');
      } else {
        this.timer = setTimeout(() => {
          this.timer = null;
          if (this.running && gen === this.gen) this._begin();
        }, 400);
      }
    }
  }

  // Called when the page comes back to the foreground, a locked screen silently ends recognition.
  ensure() {
    if (this.running && !this.alive && !this.timer) this._begin();
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

  // Resolves once the recognizer has delivered its last words.
  stop() {
    this.running = false;
    clearTimeout(this.timer);
    this.timer = null;
    const r = this.rec;
    return new Promise((res) => {
      if (!r) return res();
      if (this.alive) {
        this.waiters.push(res);
        setTimeout(res, 2000);
      } else res();
      try {
        r.stop();
      } catch {
        res();
      }
    });
  }
}

// ---------- Engine 2: Whisper in the cloud, in short chunks (best for mixed Arabic and English) ----------

const GHOSTS = [
  'thank you', 'thanks for watching', 'thank you for watching', 'you', 'bye',
  'شكرا', 'شكرا للمشاهدة', 'اشتركوا في القناة', 'ترجمة نانسي قنقر', 'تمت الترجمة', 'موسيقى'
];
const isGhost = (text) => GHOSTS.includes(text.toLowerCase().replace(/[.!?،,؟\s]+/g, ' ').trim());
const MIN_BYTES = 1500; // a fraction of a second of speech is already bigger than this

export class CloudEngine {
  // chunkMs is the longest a piece may get. With a level meter, pieces are cut in a pause between sentences,
  // not in the middle of a word, once they are at least minMs long.
  constructor({ stream, lang, chunkMs = 15000, minMs = 5000, level, hint, elapsed, transcribe, onSegments, onError }) {
    Object.assign(this, { stream, lang, chunkMs, minMs, level, hint, elapsed, transcribe, onSegments, onError });
    this.hist = [];
    this.watch = null;
    this.running = false;
    this.pending = new Set();
    this.failed = [];
    this.cur = null;
    this.timer = null;
    this.dead = false;
  }

  setLang(l) {
    this.lang = l;
  }

  // The microphone was lost and got back, carry on with the new stream.
  setStream(stream) {
    this.stream = stream;
    if (this.running) {
      this._stopCur(false);
      this.dead = false;
      this._cycle();
    }
  }

  start() {
    this.running = true;
    this._cycle();
  }

  pause() {
    this.running = false;
    this._stopCur(false);
  }

  resume() {
    this.running = true;
    this._cycle();
  }

  // Waits for the last chunk too, so the final seconds of speech are never lost.
  async stop() {
    this.running = false;
    await this._stopCur(true);
    await Promise.allSettled([...this.pending]);
    const again = this.failed.splice(0);
    for (const f of again) await this._handle(f.blob, f.t0, true);
  }

  _stopCur(wait) {
    clearTimeout(this.timer);
    clearInterval(this.watch);
    const cur = this.cur;
    this.cur = null;
    if (!cur || cur.state === 'inactive') return Promise.resolve();
    return new Promise((res) => {
      const prev = cur.onstop;
      cur.onstop = (e) => {
        try {
          prev && prev(e);
        } finally {
          res();
        }
      };
      try {
        cur.stop();
      } catch {
        res();
      }
      if (!wait) res();
    });
  }

  _cycle() {
    if (!this.running) return;
    const mime = pickMime();
    let rec;
    try {
      rec = new MediaRecorder(this.stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 64000 });
    } catch (e) {
      this.dead = true;
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
    try {
      rec.start();
    } catch (e) {
      this.dead = true;
      this.onError({ code: 'recorder', message: e.message });
      return;
    }
    this.cur = rec;
    const born = Date.now();
    const rotate = () => {
      if (!this.running || this.cur !== rec) return;
      clearInterval(this.watch);
      clearTimeout(this.timer);
      this._cycle(); // start the next recorder before stopping this one so no audio falls in a gap
      try {
        rec.stop();
      } catch {}
    };
    this.timer = setTimeout(rotate, this.chunkMs); // never longer than chunkMs
    if (this.level) {
      let quietSince = 0;
      this.hist = [];
      this.watch = setInterval(() => {
        const v = this.level();
        if (v == null) return;
        this.hist.push(v);
        if (this.hist.length > 40) this.hist.shift();
        const floor = Math.min(...this.hist); // the room's background level
        const quiet = v < Math.max(0.012, floor * 2.2);
        const now = Date.now();
        if (quiet) quietSince = quietSince || now;
        else quietSince = 0;
        if (now - born >= this.minMs && quietSince && now - quietSince >= 650) rotate();
      }, 150);
    }
  }

  async _handle(blob, t0, last = false) {
    if (blob.size < MIN_BYTES) return;
    const hint = this.hint ? this.hint() : '';
    let r;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        r = await this.transcribe(blob, this.lang, hint);
        break;
      } catch (e) {
        const rate = e.status === 429;
        const offline = e.name === 'TypeError' || e.name === 'AbortError' || e.status >= 500;
        if ((rate || offline) && attempt < 2 && !last) {
          await sleep(rate ? Math.min(Number(e.retryAfter) || 5, 20) * 1000 : 3000);
          continue;
        }
        if (offline || rate) {
          this.failed.push({ blob, t0 }); // try once more when the recording ends
          if (!last) this.onError(e);
        } else this.onError(e);
        return;
      }
    }
    if (!r) return;
    const out = [];
    for (const s of r.segments) {
      if (!s.text || s.nsp > 0.6) continue;
      if (s.nsp > 0.25 && isGhost(s.text)) continue;
      if (hint && s.nsp > 0.15 && s.text.length > 8 && hint.includes(s.text)) continue; // the model echoing its hint on silence
      out.push({ t: t0 + s.start, text: s.text, lang: langOf(s.text) });
    }
    if (!r.segments.length && r.text && !isGhost(r.text)) out.push({ t: t0, text: r.text, lang: langOf(r.text) });
    if (out.length) this.onSegments(out);
  }
}
