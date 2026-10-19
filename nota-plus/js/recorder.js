import { DeviceEngine, CloudEngine, pickMime } from './stt.js';
import { transcribeBlob } from './ai.js';
import { isAndroid, langOf, sleep } from './util.js';

// One clean mono channel at a high sample rate, with the phone's own echo and noise handling.
const MIC = { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1, sampleRate: { ideal: 48000 } } };

// One recording session. Owns the microphone, the speech engine and the live transcript.

export class Recorder {
  constructor(opts) {
    this.opts = opts; // { settings, onChange, onSegment, onError, onEngineSwitch }
    this.segments = [];
    this.bookmarks = [];
    this.interim = '';
    this.speaker = 0;
    this.speakerCount = 2;
    this.speakerNames = {};
    this.speakerLog = [{ t: 0, s: 0 }];
    this.paused = false;
    this.pausedTotal = 0;
    this.pausedAt = 0;
    this.t0 = 0;
    this.phraseStart = null;
    this.stream = null;
    this.audioChunks = [];
    this.audioRec = null;
    this.audioMime = '';
    this.saveAudio = false;
    this.engine = null;
    this.ac = null;
    this.analyser = null;
    this.wake = null;
    this.stopped = false;
    this.dead = ''; // reason the transcript stopped growing, shown on screen
    this.health = { heard: 0, sent: 0, answered: 0, silent: 0, empty: 0, lastText: 0 }; // live counters for the status line
    this.interrupted = false; // the microphone was taken away (call, Bluetooth switch, lock)
    this.errors = []; // what went wrong while recording, used to explain an empty result
    this.maxPeak = 0; // loudest sound the microphone delivered, 0 to 1
    this.result = null;
    this._vis = () => {
      if (document.visibilityState === 'visible' && !this.stopped) {
        this._wake();
        this._checkAlive();
      }
    };
  }

  elapsed() {
    const now = this.paused ? this.pausedAt : Date.now();
    return Math.max(0, (now - this.t0 - this.pausedTotal) / 1000);
  }

  _chg() {
    this.opts.onChange && this.opts.onChange();
  }

  // Current microphone level from 0 to 1, or null when there is no level meter.
  readLevel() {
    if (!this.analyser || this.paused) return null;
    const buf = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(buf);
    let sum = 0;
    let peak = 0;
    for (const v of buf) {
      const d = Math.abs(v - 128) / 128;
      sum += d * d;
      if (d > peak) peak = d;
    }
    this.peak = peak;
    if (peak > this.maxPeak) this.maxPeak = peak;
    const rms = Math.sqrt(sum / buf.length);
    if (rms > 0.02) this.health.heard++;
    return rms;
  }

  // Which explanation fits a recording that produced no words.
  whyEmpty() {
    if (this.kind === 'device' && this.dead) return 'whyBlocked';
    if (this.analyser && this.maxPeak < 0.03) return 'whySilent';
    if (this.errors.length) return 'whyError';
    if (this.kind === 'cloud' && this.engine && this.engine.stats && this.engine.stats.sent) return 'whyNoWords';
    return 'whyGeneric';
  }

  // Names and the end of what was just said, given to the speech model so spelling and style stay consistent between pieces.
  promptHint() {
    const names = [...Object.values(this.speakerNames || {}), ...String(this.opts.settings.vocab || '').split(/[,،\n]+/).map((x) => x.trim())].filter(Boolean);
    const list = names.join(', ').slice(0, 70); // names and special words first, they matter most
    const tail = this.segments.slice(-3).map((s) => s.text).join(' ').slice(-90); // then the last words said
    return [list ? `${list}.` : '', tail].filter(Boolean).join(' ');
  }

  async start({ kind, lang, saveAudio }) {
    this.kind = kind; // device | cloud
    this.lang = lang; // auto | en | ar
    this.saveAudio = !!saveAudio;
    if (kind === 'cloud' || saveAudio) {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia(MIC);
      } catch (e) {
        if (kind === 'cloud') throw e;
      }
    }
    this.t0 = Date.now();
    if (this.stream) this._attachStream();
    this._startEngine();
    this._wake();
    document.addEventListener('visibilitychange', this._vis);
  }

  _attachStream() {
    const track = this.stream.getAudioTracks()[0];
    if (track) track.onended = () => this._trackEnded();
    this._startAudioRec();
    try {
      this.ac && this.ac.close();
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

  _startAudioRec() {
    if (!this.saveAudio) return; // cloud transcription needs the stream, not a stored copy
    const mime = pickMime();
    try {
      this.audioRec = new MediaRecorder(this.stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 64000 });
      this.audioMime = this.audioRec.mimeType || mime || 'audio/webm';
      this.audioRec.ondataavailable = (e) => {
        if (e.data && e.data.size) this.audioChunks.push(e.data);
      };
      this.audioRec.start(5000);
    } catch {
      this.audioRec = null;
    }
  }

  _trackEnded() {
    if (this.stopped || this.paused) return;
    this.interrupted = true;
    this._chg();
    this._reacquire();
  }

  // After a phone call or an audio route change, keep trying to get the microphone back.
  async _reacquire() {
    if (this.reacquiring) return;
    this.reacquiring = true;
    for (let i = 0; i < 60 && !this.stopped; i++) {
      if (this.paused) {
        await sleep(1500);
        continue;
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia(MIC);
        if (this.stopped) {
          s.getTracks().forEach((t) => t.stop());
          break;
        }
        this.stream = s;
        this._attachStream(); // a new stored audio part starts here, the transcript carries on seamlessly
        if (this.kind === 'cloud' && this.engine) this.engine.setStream(s);
        this.interrupted = false;
        this._chg();
        break;
      } catch {
        await sleep(3000);
      }
    }
    this.reacquiring = false;
  }

  // The screen was locked or the app was in the background, check that listening carried on.
  _checkAlive() {
    if (this.paused || this.dead) return;
    if (this.kind === 'device' && this.engine) this.engine.ensure();
    if (this.kind === 'cloud' && this.stream) {
      const t = this.stream.getAudioTracks()[0];
      if (t && t.readyState === 'ended') this._trackEnded();
    }
  }

  _locale(lang) {
    const s = this.opts.settings;
    if (lang === 'ar') return s.arLocale;
    if (lang === 'en') return s.enLocale;
    return s.uiLang === 'ar' ? s.arLocale : s.enLocale;
  }

  _startEngine() {
    this.dead = '';
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
        level: () => this.readLevel(),
        hint: () => this.promptHint(),
        transcribe: (blob, lang, hint) => transcribeBlob(this.opts.settings, blob, { lang, retries: 0, hint }),
        onBeat: (what) => {
          if (what === 'sending') this.health.sent++;
          else if (what === 'answered') this.health.answered++;
          else if (what === 'silent') this.health.silent++;
          else if (what === 'empty') this.health.empty++;
          this._chg();
        },
        onSegments: (segs) => segs.forEach((x) => this._add(x.text, x.t, x.lang, false)),
        onError: (e) => {
          if (e && e.code === 'recorder') this.dead = 'recorder';
          this.errors.push(e);
          this._chg();
          this.opts.onError(e);
        }
      });
    }
    this.engine.start();
  }

  async _deviceError(code) {
    if (this.stopped || this.paused) return;
    const fatal = ['service-not-allowed', 'not-allowed', 'language-not-supported', 'network', 'audio-capture'];
    if (!fatal.includes(code)) return;
    if (this.opts.settings.apiKey && !this.switching) {
      this.switching = true;
      try {
        await this.engine.stop();
        if (this.stopped) return;
        if (!this.stream) {
          const s = await navigator.mediaDevices.getUserMedia(MIC);
          if (this.stopped) {
            s.getTracks().forEach((t) => t.stop());
            return;
          }
          this.stream = s;
          this._attachStream();
        }
        this.kind = 'cloud';
        this._startEngine();
        this.opts.onEngineSwitch && this.opts.onEngineSwitch('cloud', code);
        this._chg();
        return;
      } catch {
        // fall through and report
      } finally {
        this.switching = false;
      }
    }
    this.dead = code;
    this.errors.push({ code });
    this._chg();
    this.opts.onError({ code });
  }

  _add(text, t, lang, merge) {
    text = (text || '').trim();
    if (!text) return;
    lang = lang || langOf(text);
    const last = this.segments[this.segments.length - 1];
    const sp = this._speakerAt(t);
    if (merge && !this.liveTranslate && last && last.speaker === sp && last.lang === lang && last.text.length < 220 && t - (last.lastT ?? last.t) < 5) {
      last.text += ' ' + text;
      last.lastT = t;
      this.opts.onSegment && this.opts.onSegment(last); // keeps the live "detected tasks" box in step
      this._chg();
      return last;
    }
    this.health.lastText = Date.now();
    const seg = { t, lastT: t, speaker: sp, text, lang };
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

  // Cloud text arrives seconds late, so each line is credited to whoever was marked as talking at its start time.
  _speakerAt(t) {
    let s = this.speakerLog[0].s;
    for (const e of this.speakerLog) if (e.t <= t) s = e.s;
    return s;
  }

  setSpeaker(i) {
    this.speaker = i;
    this.speakerLog.push({ t: this.elapsed(), s: i });
    this._chg();
  }

  addSpeaker() {
    if (this.speakerCount >= 6) return;
    this.speakerCount++;
    this.speaker = this.speakerCount - 1;
    this.speakerLog.push({ t: this.elapsed(), s: this.speaker });
    this._chg();
  }

  renameSpeaker(i, name) {
    this.speakerNames = { ...this.speakerNames, [i]: name };
    this._chg();
  }

  mark() {
    const last = this.segments[this.segments.length - 1];
    this.bookmarks.push({ t: this.elapsed(), text: last ? last.text.slice(0, 80) : '' });
    if (last) last.marked = true;
    this._chg();
  }

  pause() {
    if (this.paused || this.stopped) return;
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
    if (!this.paused || this.stopped) return;
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
      if (navigator.wakeLock && !this.wake && !this.stopped) {
        const w = await navigator.wakeLock.request('screen');
        if (this.stopped) return w.release();
        this.wake = w;
        w.addEventListener('release', () => (this.wake = null));
      }
    } catch {}
  }

  // A one-word verdict of the capture pipeline for the live status line.
  healthState() {
    if (this.stopped || this.paused) return '';
    if (this.dead) return 'dead';
    if (this.interrupted) return 'mic';
    const age = Date.now() - this.t0 - this.pausedTotal;
    if (age < 9000) return ''; // give it a few seconds before judging
    const h = this.health;
    const noTextFor = Date.now() - (h.lastText || 0);
    if (this.kind === 'cloud') {
      if (this.analyser && h.heard < 4) return 'noSound'; // mic is open but nothing arrives from it
      if (h.sent === 0 && age > 20000) return 'notSending';
      if (h.sent > 0 && h.answered === 0 && age > 25000) return 'noAnswer'; // requests leave but nothing comes back
      if (h.answered >= 2 && this.segments.length === 0 && h.silent >= 2) return 'silentAudio'; // service hears no speech in the audio
    } else {
      if ((!h.lastText && age > 15000) || (h.lastText && noTextFor > 20000 && this.engine && !this.engine.alive)) return 'deviceQuiet';
    }
    return '';
  }

  // Everything said up to the moment of Stop ends up in the result, including the last phrase.
  async stop() {
    if (this.stopped) return this.result;
    this.stopped = true;
    const duration = this.elapsed();
    document.removeEventListener('visibilitychange', this._vis);
    try {
      this.engine && (await this.engine.stop());
    } catch {}
    if (this.interim.trim()) {
      this._add(this.interim, this.phraseStart ?? Math.max(0, duration - 2), null, true);
    }
    this.interim = '';
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
    this.result = { segments: this.segments, bookmarks: this.bookmarks, duration, audio };
    return this.result;
  }

  // Unsaved work, small enough to keep in localStorage in case the phone kills the page.
  snapshot() {
    return {
      at: Date.now(),
      duration: this.elapsed(),
      template: this.template,
      speakers: this.speakerNames,
      bookmarks: this.bookmarks,
      segments: this.segments.map(({ t, speaker, text, lang, marked, tr }) => ({ t, speaker, text, lang, marked: !!marked, tr }))
    };
  }
}
