import { DeviceEngine, CloudEngine, pickMime } from './stt.js';
import { transcribeBlob } from './ai.js';
import { isAndroid, langOf } from './util.js';

// One recording session. Owns the microphone, the speech engine and the live transcript.

export class Recorder {
  constructor(opts) {
    this.opts = opts; // { settings, onChange, onSegment, onError, onEngineSwitch }
    this.segments = [];
    this.bookmarks = [];
    this.interim = '';
    this.speaker = 0;
    this.paused = false;
    this.pausedTotal = 0;
    this.pausedAt = 0;
    this.t0 = 0;
    this.phraseStart = null;
    this.stream = null;
    this.audioChunks = [];
    this.audioRec = null;
    this.audioMime = '';
    this.engine = null;
    this.ac = null;
    this.analyser = null;
    this.wake = null;
    this._vis = () => {
      if (document.visibilityState === 'visible' && !this.stopped) this._wake();
    };
  }

  elapsed() {
    const now = this.paused ? this.pausedAt : Date.now();
    return Math.max(0, (now - this.t0 - this.pausedTotal) / 1000);
  }

  _chg() {
    this.opts.onChange && this.opts.onChange();
  }

  async start({ kind, lang, saveAudio }) {
    this.kind = kind; // device | cloud
    this.lang = lang; // auto | en | ar
    if (kind === 'cloud' || saveAudio) {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
      } catch (e) {
        if (kind === 'cloud') throw e;
      }
    }
    this.t0 = Date.now();
    if (this.stream) this._startAudio();
    this._startEngine();
    this._wake();
    document.addEventListener('visibilitychange', this._vis);
  }

  _startAudio() {
    const mime = pickMime();
    try {
      this.audioRec = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
      this.audioMime = this.audioRec.mimeType || mime || 'audio/webm';
      this.audioRec.ondataavailable = (e) => {
        if (e.data && e.data.size) this.audioChunks.push(e.data);
      };
      this.audioRec.start(5000);
    } catch {
      this.audioRec = null;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ac = new AC();
      const src = this.ac.createMediaStreamSource(this.stream);
      this.analyser = this.ac.createAnalyser();
      this.analyser.fftSize = 256;
      src.connect(this.analyser);
    } catch {
      this.analyser = null;
    }
  }

  _locale(lang) {
    const s = this.opts.settings;
    if (lang === 'ar') return s.arLocale;
    if (lang === 'en') return s.enLocale;
    return s.uiLang === 'ar' ? s.arLocale : s.enLocale;
  }

  _startEngine() {
    if (this.kind === 'device') {
      this.engine = new DeviceEngine({
        locale: this._locale(this.lang),
        continuous: !isAndroid(),
        onFinal: (text) => {
          const t = this.phraseStart ?? this.elapsed();
          this.phraseStart = null;
          this._add(text, t, null, true);
        },
        onInterim: (text) => {
          if (text && this.phraseStart == null) this.phraseStart = this.elapsed();
          this.interim = text;
          this._chg();
        },
        onError: (code) => this._deviceError(code)
      });
    } else {
      this.engine = new CloudEngine({
        stream: this.stream,
        lang: this.lang,
        elapsed: () => this.elapsed(),
        transcribe: (blob, lang) => transcribeBlob(this.opts.settings, blob, { lang }),
        onSegments: (segs) => segs.forEach((x) => this._add(x.text, x.t, x.lang, false)),
        onError: (e) => this.opts.onError(e)
      });
    }
    this.engine.start();
  }

  async _deviceError(code) {
    const fatal = ['service-not-allowed', 'not-allowed', 'language-not-supported', 'network', 'audio-capture'];
    if (!fatal.includes(code)) return;
    if (this.opts.settings.apiKey) {
      try {
        await this.engine.stop();
        if (!this.stream) {
          this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
          this._startAudio();
        }
        this.kind = 'cloud';
        this._startEngine();
        this.opts.onEngineSwitch && this.opts.onEngineSwitch('cloud', code);
        this._chg();
        return;
      } catch {}
    }
    this.opts.onError({ code });
  }

  _add(text, t, lang, merge) {
    text = (text || '').trim();
    if (!text) return;
    lang = lang || langOf(text);
    const last = this.segments[this.segments.length - 1];
    if (merge && !this.liveTranslate && last && last.speaker === this.speaker && last.lang === lang && last.text.length < 220 && t - (last.lastT ?? last.t) < 5) {
      last.text += ' ' + text;
      last.lastT = t;
      this._chg();
      return last;
    }
    const seg = { t, lastT: t, speaker: this.speaker, text, lang };
    let i = this.segments.length;
    while (i > 0 && this.segments[i - 1].t > t) i--;
    this.segments.splice(i, 0, seg);
    this.opts.onSegment && this.opts.onSegment(seg);
    this._chg();
    return seg;
  }

  setLang(lang) {
    this.lang = lang;
    if (!this.engine) return;
    if (this.kind === 'device') this.engine.setLocale(this._locale(lang));
    else this.engine.setLang(lang);
    this._chg();
  }

  nextSpeaker() {
    this.speaker = (this.speaker + 1) % 4;
    this._chg();
  }

  mark() {
    const last = this.segments[this.segments.length - 1];
    this.bookmarks.push({ t: this.elapsed(), text: last ? last.text.slice(0, 80) : '' });
    if (last) last.marked = true;
    this._chg();
  }

  pause() {
    if (this.paused) return;
    this.paused = true;
    this.pausedAt = Date.now();
    this.engine && this.engine.pause();
    try {
      this.audioRec && this.audioRec.state === 'recording' && this.audioRec.pause();
    } catch {}
    this.interim = '';
    this._chg();
  }

  resume() {
    if (!this.paused) return;
    this.pausedTotal += Date.now() - this.pausedAt;
    this.paused = false;
    this.engine && this.engine.resume();
    try {
      this.audioRec && this.audioRec.state === 'paused' && this.audioRec.resume();
    } catch {}
    this._chg();
  }

  async _wake() {
    try {
      if (navigator.wakeLock && !this.wake) {
        this.wake = await navigator.wakeLock.request('screen');
        this.wake.addEventListener('release', () => (this.wake = null));
      }
    } catch {}
  }

  async stop() {
    this.stopped = true;
    const duration = this.elapsed();
    document.removeEventListener('visibilitychange', this._vis);
    try {
      this.engine && (await this.engine.stop());
    } catch {}
    await new Promise((res) => {
      if (!this.audioRec || this.audioRec.state === 'inactive') return res();
      this.audioRec.onstop = res;
      try {
        this.audioRec.stop();
      } catch {
        res();
      }
    });
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    try {
      this.ac && this.ac.close();
    } catch {}
    try {
      this.wake && this.wake.release();
    } catch {}
    const audio = this.audioChunks.length ? new Blob(this.audioChunks, { type: this.audioMime || 'audio/webm' }) : null;
    return { segments: this.segments, bookmarks: this.bookmarks, duration, audio };
  }
}
