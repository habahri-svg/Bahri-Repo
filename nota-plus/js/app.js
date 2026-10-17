import { S } from './state.js';
import { t, setLang, getLang } from './i18n.js';
import { $, esc, uid, fmtClock, langOf, arabicRatio, download, copyText, isIOS, isStandalone } from './util.js';
import { loadSettings, saveSettings, notesDb, audioDb, requestPersistence, storageEstimate, saveDraft, loadDraft, clearDraft } from './store.js';
import { runChecks, reportText } from './selfcheck.js';
import { summarize, quickSummary, translateTexts, answer, buildGlobalContext, transcribeBlob, testKey, friendlyError, detectActions, detectSpeakers, transcriptText } from './ai.js';
import { deviceSupported } from './stt.js';
import { Recorder } from './recorder.js';
import * as V from './views.js';
import { noteToText, noteToSrt, printHtml } from './export.js';

const app = $('#app');
const paint = (html) => (app.innerHTML = html);
const HIDE_INSTALL = 'nota-plus.hideInstall';
const WELCOME_DONE = 'nota-plus.welcomeDone';
let routing = Promise.resolve();

// ---------- small UI helpers ----------

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 4000);
}

function wait(msg) {
  const el = $('#wait');
  if (msg) {
    el.querySelector('span.msg').textContent = msg;
    el.hidden = false;
  } else el.hidden = true;
}

function modal(html, { sticky = false } = {}) {
  const m = $('#modal');
  m.innerHTML = `<div class="scrim"${sticky ? '' : ' data-action="close-modal"'}></div>${html}`;
  const box = m.querySelector('.dialog, .sheet');
  if (box) {
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
  }
  m.hidden = false;
}

let promptResolve = null;
function closeModal(value = null) {
  const m = $('#modal');
  m.hidden = true;
  m.innerHTML = '';
  if (promptResolve) {
    const r = promptResolve;
    promptResolve = null;
    r(value);
  }
}

// Translation, summaries, Ask AI and the best Arabic accuracy all need the free key, so say so clearly and offer the setup.
function needKey() {
  modal(`<div class="dialog"><h3>${t('needKeyTitle')}</h3><p>${t('needKeyBody')}</p>
    <div class="row gap end"><button type="button" class="btn ghost" data-action="close-modal">${t('cancel')}</button><a class="btn" href="#/welcome">${t('setupKey')}</a></div></div>`);
}

function promptModal({ title, value = '', multiline = false, ok, placeholder = '' }) {
  return new Promise((resolve) => {
    promptResolve = resolve;
    const field = multiline
      ? `<textarea name="v" rows="9" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`
      : `<input name="v" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off">`;
    modal(`<form class="dialog" data-form="prompt"><h3>${title}</h3>${field}
      <div class="row gap end"><button type="button" class="btn ghost" data-action="close-modal">${t('cancel')}</button><button class="btn">${ok || t('ok')}</button></div></form>`);
    setTimeout(() => $('#modal [name=v]')?.focus(), 60);
  });
}

// ---------- rendering ----------

function render(scrollTop) {
  if (S.view === 'record') {
    paint(S.rec && !S.rec.stopped ? V.recordLiveView() : V.recordSetupView());
    if (S.rec && !S.rec.stopped) paintLive(true);
  } else if (S.view === 'note') {
    renderNote();
  } else if (S.view === 'welcome') paint(V.welcomeView());
  else if (S.view === 'ask') paint(V.askAllView());
  else if (S.view === 'settings') {
    paint(V.settingsView());
    paintChecks();
    storageEstimate().then((e) => {
      const el = $('#storage-info');
      if (e && el) el.textContent = `${S.notes.length} ${t('notesCount')} · ${(e.used / 1048576).toFixed(1)} MB`;
    });
  } else paint(V.libraryView());
  if (scrollTop) window.scrollTo(0, 0);
}

function renderNote() {
  if (!S.note) return;
  const old = $('#player');
  const y = window.scrollY;
  const q = $('form[data-form=ask] input[name=q]');
  const typed = q ? q.value : null;
  const focused = !!q && document.activeElement === q;
  paint(V.noteView(S.note));
  const nu = $('#player');
  if (old && nu) nu.replaceWith(old); // keep playback going across re-renders
  const q2 = $('form[data-form=ask] input[name=q]');
  if (q2 && typed) {
    q2.value = typed; // a background job finishing must not wipe a half-typed question
    if (focused) q2.focus();
  }
  window.scrollTo(0, y);
  const chat = $('#chat');
  if (chat) chat.lastElementChild?.scrollIntoView({ block: 'nearest' });
}

// ---------- routing ----------

function leaveNote() {
  if (S.audioUrl) URL.revokeObjectURL(S.audioUrl);
  S.audioUrl = '';
  S.note = null;
}

async function route() {
  const [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
  leaveNote();
  closeModal();
  if (name === 'record') {
    S.view = 'record';
    if (!S.rec || S.rec.stopped) initSetup();
  } else if (name === 'note') {
    S.view = 'note';
    await openNote(arg);
    return;
  } else if (name === 'ask') S.view = 'ask';
  else if (name === 'welcome') S.view = 'welcome';
  else if (name === 'settings') S.view = 'settings';
  else S.view = 'library';
  render(true);
}

async function openNote(id) {
  const n = S.notes.find((x) => x.id === id);
  if (!n) {
    location.hash = '#/';
    return;
  }
  S.note = n;
  S.noteTab = 'summary';
  S.sumLang = n.lastSummaryLang || S.settings.summaryLang;
  if (n.hasAudio) {
    try {
      const a = await audioDb.get(n.id);
      if (a && a.blob && S.note === n) S.audioUrl = URL.createObjectURL(a.blob);
    } catch {}
  }
  if (S.note === n && S.view === 'note') render(true);
}

// ---------- recording ----------

function initSetup() {
  const s = S.settings;
  let engine = s.engine === 'auto' ? (s.apiKey ? 'cloud' : deviceSupported() ? 'device' : 'cloud') : s.engine;
  if (engine === 'device' && !deviceSupported()) engine = 'cloud';
  S.setup = {
    engine,
    lang: engine === 'cloud' ? 'auto' : s.uiLang === 'ar' ? 'ar' : 'en',
    template: s.template,
    saveAudio: engine === 'cloud' ? true : s.saveAudio,
    liveTranslate: s.liveTranslate && !!s.apiKey,
    names: ''
  };
}

let lastErr = 0;
function onRecError(e) {
  if (Date.now() - lastErr < 6000) return;
  lastErr = Date.now();
  const code = e && e.code;
  if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') toast(t('errBlocked'));
  else toast(friendlyError(e, t));
}

async function startRec() {
  if (S.starting || (S.rec && !S.rec.stopped)) return; // a second tap must not start a second recorder
  S.starting = true;
  try {
    await startRecInner();
  } finally {
    S.starting = false;
  }
}

async function startRecInner() {
  const u = S.setup;
  if (u.engine === 'cloud' && !S.settings.apiKey) return needKey();
  if (u.engine === 'device' && !deviceSupported()) {
    toast(t('errBlocked'));
    return;
  }
  const rec = new Recorder({
    settings: S.settings,
    onChange: scheduleLive,
    onSegment: onSegment,
    onError: onRecError,
    onEngineSwitch: () => toast(t('engineSwitched'))
  });
  rec.template = u.template;
  rec.liveTranslate = u.liveTranslate && !!S.settings.apiKey;
  const names = (u.names || '').split(/[,،;\n]+/).map((x) => x.trim()).filter(Boolean).slice(0, 6);
  rec.speakerNames = Object.fromEntries(names.map((n, i) => [i, n]));
  rec.speakerCount = Math.max(2, names.length);
  try {
    await rec.start({ kind: u.engine, lang: u.lang, saveAudio: u.saveAudio });
  } catch {
    toast(t('errMic'));
    return;
  }
  S.rec = rec;
  S.detected = [];
  startTicker();
  startDraftTimer();
  render();
}

let trChain = Promise.resolve();
function onSegment(seg) {
  const r = S.rec;
  if (!r) return;
  S.detected = detectActions(r.segments);
  if (r.liveTranslate) {
    trChain = trChain.then(async () => {
      try {
        const [tr] = await translateTexts(S.settings, [seg.text], seg.lang === 'ar' ? 'en' : 'ar');
        seg.tr = tr;
        scheduleLive();
      } catch {}
    });
  }
}

let liveQueued = false;
function scheduleLive() {
  if (liveQueued) return;
  liveQueued = true;
  requestAnimationFrame(() => {
    liveQueued = false;
    paintLive();
  });
}

function paintLive(forceScroll) {
  const r = S.rec;
  if (!r || S.view !== 'record') return;
  const log = $('#rec-lines');
  if (!log) return;
  const nearBottom = forceScroll || log.scrollHeight - log.scrollTop - log.clientHeight < 80;
  log.innerHTML = V.liveLinesHtml(r);
  if (nearBottom) log.scrollTop = log.scrollHeight;
  const ai = $('#rec-ai');
  if (ai) ai.innerHTML = V.detectedHtml();
  const sp = $('#rec-speaker');
  if (sp) sp.textContent = V.speakerName({ speakers: r.speakerNames || {} }, r.speaker);
  paintTimer();
}

let tick = null;
let raf = null;
let frame = 0;
const levels = new Array(40).fill(0);

function startTicker() {
  stopTicker();
  tick = setInterval(paintTimer, 500);
  const loop = () => {
    paintBars();
    raf = requestAnimationFrame(loop);
  };
  loop();
}

function stopTicker() {
  clearInterval(tick);
  cancelAnimationFrame(raf);
}

function paintTimer() {
  const r = S.rec;
  if (!r || S.view !== 'record') return;
  const el = $('#rec-timer');
  if (el) el.textContent = fmtClock(r.elapsed());
  const st = $('#rec-status');
  if (st) st.textContent = r.paused ? t('paused') : r.interrupted ? t('micLost') : r.dead ? t('notCapturing') : t('live');
  const d = $('#rec-dot');
  if (d) d.classList.toggle('off', r.paused || !!r.dead);
}

function paintBars() {
  const wrap = $('#rec-bars');
  const r = S.rec;
  if (!wrap || !r) return;
  if (++frame % 4) return;
  let lvl = 0;
  if (r.analyser && !r.paused) {
    const buf = new Uint8Array(r.analyser.fftSize);
    r.analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) {
      const d = (v - 128) / 128;
      sum += d * d;
    }
    lvl = Math.min(1, Math.sqrt(sum / buf.length) * 4);
  }
  wrap.classList.toggle('pulse', !r.analyser && !r.paused);
  levels.push(lvl);
  levels.shift();
  const kids = wrap.children;
  for (let i = 0; i < kids.length; i++) kids[i].style.height = 4 + levels[i] * 44 + 'px';
}

function dominantLang(segments) {
  const all = segments.map((s) => s.text).join(' ');
  const r = arabicRatio(all);
  return r > 0.8 ? 'ar' : r < 0.2 ? 'en' : 'mixed';
}

function newNote({ title, segments, duration, template, bookmarks = [], hasAudio = false, speakers = {} }) {
  return {
    id: uid(),
    title,
    autoTitle: true,
    createdAt: Date.now(),
    duration,
    template: template || S.settings.template,
    lang: dominantLang(segments),
    segments: segments.map(({ t, speaker, text, lang, marked, tr }) => ({ t, speaker: speaker || 0, text, lang, marked: !!marked, tr })),
    bookmarks,
    speakers,
    summary: {},
    lastSummaryLang: S.settings.summaryLang,
    hasAudio
  };
}

const defaultTitle = () => `${t('defaultTitle')} ${new Date().toLocaleDateString(getLang() === 'ar' ? 'ar-u-nu-latn' : undefined, { day: 'numeric', month: 'short' })}`;

// Writes the note first and its audio second, so a full disk can cost the audio but never the transcript.
async function persistNew(note, audioBlob) {
  try {
    await notesDb.put(note);
  } catch (e) {
    try {
      download(`${note.title}.txt`, noteToText(note, S.sumLang)); // last resort, hand the text to the user
    } catch {}
    toast(t('saveFailed'));
    throw e;
  }
  if (audioBlob) {
    try {
      await audioDb.put(note.id, audioBlob);
    } catch {
      note.hasAudio = false;
      await notesDb.put(note).catch(() => {});
      toast(t('audioNotSaved'));
    }
  }
  S.notes.unshift(note);
}

async function saveNew(note, audioBlob) {
  await persistNew(note, audioBlob);
  location.hash = '#/note/' + note.id;
  generateSummary(note, note.lastSummaryLang);
}

const nameField = (i, val = '') =>
  `<label class="namefield sp${i}"><i></i><input name="sp${i}" value="${esc(val)}" placeholder="${t('speaker')} ${i + 1}" autocomplete="off" aria-label="${t('speaker')} ${i + 1}"></label>`;

// Shown after a recording: type who was speaking, optionally let AI assign the lines.
function askSpeakerNames(note) {
  const used = [...new Set(note.segments.map((s) => s.speaker))];
  const preset = note.speakers || {};
  const count = Math.min(6, Math.max(2, ...used.map((i) => i + 1), ...Object.keys(preset).map((i) => +i + 1)));
  const aiDefault = used.length <= 1 && note.segments.length >= 2;
  return new Promise((resolve) => {
    promptResolve = resolve;
    modal(`<form class="dialog speakers" data-form="speakers"><h3>${t('whoSpoke')}</h3><p class="muted">${t('whoSpokeHint')}</p>
      <div id="name-fields" class="stack tight">${Array.from({ length: count }, (_, i) => nameField(i, preset[i] || '')).join('')}</div>
      <button type="button" class="btn small ghost" data-action="add-name-field">+ ${t('addPerson')}</button>
      ${S.settings.apiKey ? `<label class="switch lt"><input type="checkbox" name="ai"${aiDefault ? ' checked' : ''}><span>${t('aiAssign')}</span></label>` : ''}
      <div class="row gap end"><button type="button" class="btn ghost" data-action="close-modal">${t('skip')}</button><button class="btn">${t('saveSummarize')}</button></div></form>`, { sticky: true });
    setTimeout(() => $('#modal input[name=sp0]')?.focus(), 60);
  });
}

// The note is already saved when this runs, so closing the page here loses nothing.
async function openAndName(note) {
  location.hash = '#/note/' + note.id;
  await new Promise((r) => setTimeout(r, 0));
  await routing;
  const ans = await askSpeakerNames(note);
  if (ans) {
    note.speakers = { ...note.speakers, ...ans.names };
    if (ans.ai && S.settings.apiKey && note.segments.length > 1) {
      wait(t('detecting'));
      try {
        const d = await detectSpeakers(S.settings, note, note.speakers);
        note.segments.forEach((x, i) => (x.speaker = d.turns[i]));
        for (const [id, nm] of Object.entries(d.names)) if (!note.speakers[id]) note.speakers[id] = nm;
      } catch (e) {
        toast(friendlyError(e, t));
      } finally {
        wait(null);
      }
    }
    await persist(note);
    refreshNote(note);
  }
  generateSummary(note, note.lastSummaryLang);
}

async function finishRecording() {
  const r = S.rec;
  if (!r || S.stopping) return; // a double tap on Stop does nothing
  S.stopping = true;
  stopTicker();
  stopDraftTimer();
  wait(t('writing'));
  let note;
  try {
    const res = await r.stop();
    const text = res.segments.map((s) => s.text).join(' ').trim();
    if (!text) {
      S.rec = null;
      S.detected = [];
      clearDraft();
      toast(t('emptyRecording'));
      location.hash = '#/';
      render();
      return;
    }
    note = newNote({ title: defaultTitle(), segments: res.segments, duration: res.duration, template: r.template, bookmarks: res.bookmarks, hasAudio: !!res.audio, speakers: { ...r.speakerNames } });
    await persistNew(note, res.audio); // saved before anything else is asked
    S.rec = null;
    S.detected = [];
    clearDraft();
  } catch (e) {
    S.rec = null;
    S.detected = [];
    toast(friendlyError(e, t));
    location.hash = '#/';
    render();
    return;
  } finally {
    wait(null);
    S.stopping = false;
  }
  await openAndName(note);
}

// ---------- draft autosave and recovery ----------

let draftTimer = null;
function saveDraftNow() {
  const r = S.rec;
  if (r && !r.stopped && r.segments.length) saveDraft(r.snapshot());
}
function startDraftTimer() {
  stopDraftTimer();
  draftTimer = setInterval(saveDraftNow, 8000);
}
function stopDraftTimer() {
  clearInterval(draftTimer);
  draftTimer = null;
}

async function recoverDraft() {
  const d = loadDraft();
  if (!d) return;
  if (!d.segments || !d.segments.length) return clearDraft();
  const note = newNote({ title: `${defaultTitle()} (${t('recoveredTag')})`, segments: d.segments, duration: d.duration || 0, template: d.template, bookmarks: d.bookmarks || [], speakers: d.speakers || {} });
  note.createdAt = d.at || note.createdAt;
  try {
    await persistNew(note, null);
    clearDraft();
    toast(t('recoveredToast'));
  } catch {}
}

// ---------- import and paste ----------

async function importFile(file) {
  if (!S.settings.apiKey) return needKey();
  if (file.size > 24 * 1048576) {
    toast(t('importTooBig'));
    return;
  }
  wait(t('importing'));
  try {
    const r = await transcribeBlob(S.settings, file, { lang: 'auto', name: file.name });
    const segs = r.segments.filter((s) => s.text && s.nsp < 0.6).map((s) => ({ t: s.start, text: s.text, lang: langOf(s.text), speaker: 0 }));
    if (!segs.length && r.text) segs.push({ t: 0, text: r.text, lang: langOf(r.text), speaker: 0 });
    if (!segs.length) {
      toast(t('emptyRecording'));
      return;
    }
    const dur = r.segments.length ? r.segments[r.segments.length - 1].end : 0;
    const note = newNote({ title: file.name.replace(/\.[^.]+$/, '') || defaultTitle(), segments: segs, duration: dur, hasAudio: true });
    wait(null);
    await persistNew(note, file);
    await openAndName(note);
  } catch (e) {
    toast(friendlyError(e, t));
  } finally {
    wait(null);
  }
}

async function pasteText() {
  const text = await promptModal({ title: t('pasteTitle'), multiline: true, ok: t('summarize'), placeholder: t('pastePh') });
  if (!text || !text.trim()) return;
  const parts = [];
  for (const para of text.split(/\n+/).map((x) => x.trim()).filter(Boolean)) {
    if (para.length <= 500) parts.push(para);
    else {
      // a long block with no line breaks becomes sentence-sized lines of at most about 500 characters
      const sentences = para.match(/[^.!?؟۔]+[.!?؟۔]*\s*/g) || [para];
      let cur = '';
      for (const sn of sentences) {
        if (cur && cur.length + sn.length > 500) {
          parts.push(cur.trim());
          cur = '';
        }
        cur += sn;
      }
      if (cur.trim()) parts.push(cur.trim());
    }
  }
  const segs = parts.map((p, i) => ({ t: i, text: p, lang: langOf(p), speaker: 0 }));
  const note = newNote({ title: defaultTitle(), segments: segs, duration: 0 });
  await saveNew(note, null);
}

// ---------- AI actions ----------

async function persist(n) {
  if (!S.notes.includes(n)) return; // deleted while a job was running, never bring it back
  try {
    await notesDb.put(n);
  } catch {
    toast(t('saveFailed'));
  }
}

function refreshNote(n) {
  if (S.view === 'note' && S.note && S.note.id === n.id) renderNote();
}

async function generateSummary(n, lang) {
  lang = lang || S.sumLang;
  const key = n.id + ':' + lang;
  if (S.busy[key]) {
    S.rerun[key] = true; // a new template or names arrived mid-run, go again when this one ends
    return;
  }
  S.busy[key] = true;
  refreshNote(n);
  try {
    n.summary = n.summary || {};
    const before = n.summary[lang]?.action_items || [];
    if (S.settings.apiKey) {
      const sm = await summarize(S.settings, n, { lang, template: n.template || 'meeting' });
      for (const a of sm.action_items) {
        // keep the ticks the user already made
        if (before.some((o) => o.done && o.text.trim().toLowerCase() === a.text.trim().toLowerCase())) a.done = true;
      }
      n.summary[lang] = sm;
      if (n.autoTitle && sm.title) n.title = sm.title;
    } else {
      n.summary[lang] = quickSummary(n);
    }
    n.lastSummaryLang = lang;
  } catch (e) {
    toast(friendlyError(e, t));
    n.summary = n.summary || {};
    if (!n.summary[lang]) n.summary[lang] = quickSummary(n);
  } finally {
    delete S.busy[key];
    await persist(n);
    refreshNote(n);
    if (S.rerun[key]) {
      delete S.rerun[key];
      generateSummary(n, lang);
    }
  }
}

async function translateTranscript(n) {
  if (!S.settings.apiKey) return needKey();
  const key = n.id + ':tr';
  if (S.busy[key]) return;
  S.busy[key] = true;
  renderNote();
  try {
    for (const target of ['en', 'ar']) {
      const ids = n.segments.map((s, i) => i).filter((i) => !n.segments[i].tr && (n.segments[i].lang === 'ar' ? 'en' : 'ar') === target);
      if (!ids.length) continue;
      await translateTexts(S.settings, ids.map((i) => n.segments[i].text), target, (start, got) => {
        got.forEach((tr, k) => (n.segments[ids[start + k]].tr = tr));
      });
    }
    toast(t('translatedDone'));
  } catch (e) {
    toast(friendlyError(e, t));
  } finally {
    delete S.busy[key];
    await persist(n);
    S.noteTab = 'transcript';
    refreshNote(n);
  }
}

async function ask(scope, q) {
  q = q.trim();
  if (!q) return;
  const id = scope === 'all' ? 'all' : scope.id;
  const busyKey = scope === 'all' ? 'allAsk' : id + ':ask';
  const chat = (S.chats[id] = S.chats[id] || []);
  chat.push({ role: 'user', content: q });
  S.busy[busyKey] = true;
  scope === 'all' ? render() : renderNote();
  try {
    if (!S.settings.apiKey) throw Object.assign(new Error(t('errNeedKey')), { name: 'Plain' });
    let ctx;
    if (scope === 'all') ctx = buildGlobalContext(S.notes, q, V.fmtDate);
    else {
      const sm = scope.summary?.[S.sumLang];
      ctx = `Note "${scope.title}"${sm ? '\nSummary: ' + sm.overview : ''}\n\n${transcriptText(scope).slice(0, 24000)}`;
    }
    const a = await answer(S.settings, ctx, q, chat.slice(0, -1));
    chat.push({ role: 'assistant', content: a });
  } catch (e) {
    chat.push({ role: 'assistant', content: e.name === 'Plain' ? e.message : friendlyError(e, t) });
  } finally {
    delete S.busy[busyKey];
    scope === 'all' ? render() : renderNote();
    $('#chat')?.lastElementChild?.scrollIntoView({ block: 'nearest' });
  }
}

// ---------- actions (click delegation) ----------

const N = () => S.note;

const A = {
  'toggle-ui-lang'() {
    S.settings.uiLang = getLang() === 'ar' ? 'en' : 'ar';
    saveSettings(S.settings);
    setLang(S.settings.uiLang);
    render();
  },
  filter(el) {
    S.filter = el.dataset.id;
    render();
  },
  import() {
    $('#file').click();
  },
  paste: pasteText,
  install: async () => {
    if (!S.installEvt) return;
    S.installEvt.prompt();
    await S.installEvt.userChoice;
    S.installEvt = null;
    S.showInstall = false;
    render();
  },
  'hide-install'() {
    S.showInstall = false;
    try {
      localStorage.setItem(HIDE_INSTALL, '1');
    } catch {}
    render();
  },
  'go-settings'() {
    location.hash = '#/settings';
  },
  'close-modal'() {
    closeModal(null);
  },

  // record
  'set-engine'(el) {
    S.setup.engine = el.dataset.id;
    if (S.setup.engine === 'device' && S.setup.lang === 'auto') S.setup.lang = S.settings.uiLang === 'ar' ? 'ar' : 'en';
    if (S.setup.engine === 'cloud') S.setup.lang = 'auto';
    S.setup.saveAudio = S.setup.engine === 'cloud' ? true : S.settings.saveAudio;
    render();
  },
  'set-lang-setup'(el) {
    S.setup.lang = el.dataset.id;
    render();
  },
  'start-rec': startRec,
  'set-lang-live'(el) {
    S.rec.setLang(el.dataset.id);
    render();
  },
  'toggle-translate'() {
    if (!S.settings.apiKey) return needKey();
    S.rec.liveTranslate = !S.rec.liveTranslate;
    render();
  },
  mark() {
    S.rec.mark();
    navigator.vibrate?.(30);
    paintLive();
  },
  async 'pick-speaker'(el) {
    const r = S.rec;
    const i = +el.dataset.i;
    if (r.speaker === i) {
      const v = await promptModal({ title: t('rename'), value: V.speakerName({ speakers: r.speakerNames }, i) });
      if (v && v.trim()) r.renameSpeaker(i, v.trim());
    } else r.setSpeaker(i);
    render();
  },
  'add-name-field'() {
    const box = $('#name-fields');
    if (!box || box.children.length >= 6) return;
    box.insertAdjacentHTML('beforeend', nameField(box.children.length));
    box.lastElementChild.querySelector('input').focus();
  },
  'add-speaker'() {
    S.rec.addSpeaker();
    render();
  },
  'pause-rec'() {
    S.rec.paused ? S.rec.resume() : S.rec.pause();
    render();
  },
  'stop-rec': finishRecording,

  // note
  tab(el) {
    S.noteTab = el.dataset.id;
    renderNote();
  },
  'sum-lang'(el) {
    S.sumLang = el.dataset.id;
    N().lastSummaryLang = S.sumLang;
    persist(N());
    renderNote();
    if (!N().summary?.[S.sumLang] && S.settings.apiKey && N().segments.length) generateSummary(N(), S.sumLang);
  },
  generate() {
    closeModal();
    generateSummary(N(), S.sumLang);
  },
  'toggle-task'(el) {
    const a = N().summary?.[S.sumLang]?.action_items?.[+el.dataset.i];
    if (!a) return;
    a.done = !a.done;
    persist(N());
    renderNote();
  },
  async 'copy-tasks'() {
    const items = N().summary?.[S.sumLang]?.action_items || [];
    await copyText(items.map((a) => `- ${a.text}${a.owner || a.due ? ' (' + [a.owner, a.due].filter(Boolean).join(', ') + ')' : ''}`).join('\n'));
    toast(t('copied'));
  },
  seek(el) {
    const p = $('#player');
    if (!p) return;
    p.currentTime = +el.dataset.t;
    p.play().catch(() => {});
  },
  async 'rename-speaker'(el) {
    const i = +el.dataset.i;
    const v = await promptModal({ title: t('rename'), value: V.speakerName(N(), i) });
    if (v && v.trim()) {
      N().speakers = { ...N().speakers, [i]: v.trim() };
      await persist(N());
      renderNote();
    }
  },
  'line-speaker'(el) {
    const n = N();
    const seg = n.segments[+el.dataset.seg];
    const count = Math.min(6, Math.max(...n.segments.map((x) => x.speaker)) + 2);
    seg.speaker = (seg.speaker + 1) % count;
    persist(n);
    renderNote();
  },
  async 'detect-speakers'() {
    const n = N();
    if (!S.settings.apiKey) return needKey();
    const key = n.id + ':spk';
    if (S.busy[key]) return;
    S.busy[key] = true;
    renderNote();
    try {
      const r = await detectSpeakers(S.settings, n, n.speakers);
      n.segments.forEach((x, i) => (x.speaker = r.turns[i]));
      const sp = { ...n.speakers };
      for (const [id, name] of Object.entries(r.names)) if (!sp[id]) sp[id] = name;
      n.speakers = sp;
      toast(t('speakersDone'));
      await persist(n);
      if (Object.keys(n.summary || {}).length) generateSummary(n, S.sumLang);
    } catch (e) {
      toast(friendlyError(e, t));
    } finally {
      delete S.busy[key];
      await persist(n);
      S.noteTab = 'transcript';
      refreshNote(n);
    }
  },
  async rename() {
    closeModal();
    const v = await promptModal({ title: t('renameTitle'), value: N().title });
    if (v && v.trim()) {
      N().title = v.trim();
      N().autoTitle = false;
      await persist(N());
      renderNote();
    }
  },
  menu() {
    modal(V.menuHtml());
  },
  'translate-all'() {
    closeModal();
    translateTranscript(N());
  },
  async delete() {
    closeModal();
    if (!confirm(t('confirmDelete'))) return;
    const id = N().id;
    await notesDb.del(id);
    await audioDb.del(id).catch(() => {});
    S.notes = S.notes.filter((x) => x.id !== id);
    location.hash = '#/';
  },
  async copy() {
    toast((await copyText(noteToText(N(), S.sumLang))) ? t('copied') : t('errGeneric'));
  },
  pdf() {
    $('#print').innerHTML = printHtml(N(), S.sumLang);
    const prev = document.title;
    document.title = N().title;
    window.print();
    setTimeout(() => (document.title = prev), 1500);
  },
  async share() {
    const text = noteToText(N(), S.sumLang);
    if (navigator.share) {
      try {
        await navigator.share({ title: N().title, text });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
    }
    toast((await copyText(text)) ? t('copied') : t('errGeneric'));
  },
  'export-txt'() {
    closeModal();
    download((N().title || 'note').replace(/[\\/:*?"<>|]+/g, '-') + '.txt', noteToText(N(), S.sumLang));
  },
  'export-srt'() {
    closeModal();
    download((N().title || 'note').replace(/[\\/:*?"<>|]+/g, '-') + '.srt', noteToSrt(N()));
  },
  suggest(el) {
    const input = $('form[data-form=ask] input[name=q]');
    if (input) input.value = el.dataset.q;
    submitAsk();
  },

  // first run and self-check
  'welcome-skip'() {
    markWelcomeDone();
    location.hash = '#/';
  },
  async 'run-checks'() {
    if (S.checking) return;
    S.checking = true;
    S.checks = [];
    paintChecks();
    try {
      S.checks = await runChecks((r) => {
        S.checks = r.slice();
        paintChecks();
      });
    } finally {
      S.checking = false;
      paintChecks();
    }
  },
  async 'copy-report'() {
    toast((await copyText(reportText(S.checks || [], (id) => t('chk_' + id)))) ? t('copied') : t('errGeneric'));
  },

  // settings
  async 'test-key'() {
    const el = $('#key-status');
    if (/groq\.com/.test(S.settings.baseUrl) && !S.settings.apiKey.startsWith('gsk_')) {
      el.textContent = t('keyFormat');
      return;
    }
    el.textContent = '…';
    try {
      const m = await testKey(S.settings);
      el.textContent = `${t('keyOk')} (${m.chat})`;
    } catch (e) {
      el.textContent = friendlyError(e, t);
    }
  },
  async 'delete-all'() {
    if (!confirm(t('deleteAllConfirm'))) return;
    await notesDb.clear();
    await audioDb.clear();
    S.notes = [];
    S.chats = {};
    render();
  }
};

function paintChecks() {
  const el = $('#checks');
  if (el) el.innerHTML = V.checksHtml();
}

function markWelcomeDone() {
  try {
    localStorage.setItem(WELCOME_DONE, '1');
  } catch {}
}

async function welcomeSave(raw) {
  const el = $('#welcome-status');
  const key = String(raw || '').replace(/[^\x21-\x7E]/g, '');
  if (!key) {
    el.textContent = t('keyEmpty');
    return;
  }
  if (/groq\.com/.test(S.settings.baseUrl) && !key.startsWith('gsk_')) {
    el.textContent = t('keyFormat');
    return;
  }
  S.settings.apiKey = key;
  saveSettings(S.settings);
  el.textContent = '…';
  try {
    const m = await testKey(S.settings);
    markWelcomeDone();
    toast(`${t('keyOk')} (${m.chat})`);
    location.hash = '#/';
  } catch (e) {
    S.settings.apiKey = '';
    saveSettings(S.settings);
    el.textContent = friendlyError(e, t);
  }
}

function submitAsk() {
  const form = $('form[data-form=ask]');
  if (!form) return;
  const q = form.q.value;
  form.q.value = '';
  ask(S.view === 'ask' ? 'all' : S.note, q);
}

function onClick(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = A[el.dataset.action];
  if (!fn) return;
  if (el.tagName === 'A') e.preventDefault();
  fn(el, e);
}

function onSubmit(e) {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  if (form.dataset.form === 'ask') submitAsk();
  else if (form.dataset.form === 'welcome') welcomeSave(form.key.value);
  else if (form.dataset.form === 'prompt') closeModal(form.v.value);
  else if (form.dataset.form === 'speakers') {
    const names = {};
    form.querySelectorAll('input[name^=sp]').forEach((inp) => {
      const v = inp.value.trim();
      if (v) names[+inp.name.slice(2)] = v;
    });
    closeModal({ names, ai: !!(form.elements.ai && form.elements.ai.checked) });
  }
}

function onChange(e) {
  const el = e.target;
  if (el.dataset.setting) {
    const key = el.dataset.setting;
    if (key === 'apiKey') {
      el.value = el.value.replace(/[^\x21-\x7E]/g, ''); // pasted keys often carry spaces or hidden characters
      S.settings[key] = el.value;
    } else S.settings[key] = el.value;
    saveSettings(S.settings);
    if (key === 'uiLang') {
      setLang(el.value);
      render();
    }
  } else if (el.dataset.setup) {
    const key = el.dataset.setup;
    if (key === 'liveTranslate' && el.checked && !S.settings.apiKey) {
      el.checked = false;
      return needKey();
    }
    S.setup[key] = el.checked;
  } else if (el.id === 'rec-template') S.setup.template = el.value;
  else if (el.id === 'note-template') {
    N().template = el.value;
    persist(N());
    if (S.settings.apiKey && Object.keys(N().summary || {}).length) generateSummary(N(), S.sumLang);
  }
}

function onInput(e) {
  const el = e.target;
  if (el.id === 'q') {
    S.q = el.value;
    $('#list').innerHTML = V.noteListHtml();
  } else if (el.id === 'rec-names') {
    S.setup.names = el.value;
  } else if (el.dataset.setting === 'apiKey') {
    S.settings.apiKey = el.value.replace(/[^\x21-\x7E]/g, '');
    saveSettings(S.settings);
  } else if (el.dataset.setting === 'baseUrl' || el.dataset.setting === 'sttModel' || el.dataset.setting === 'chatModel') {
    S.settings[el.dataset.setting] = el.value.trim();
    saveSettings(S.settings);
  }
}

// ---------- boot ----------

async function boot() {
  S.settings = loadSettings();
  setLang(S.settings.uiLang);
  S.view = 'library';
  try {
    S.notes = (await notesDb.all()).sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    S.notes = [];
  }
  await recoverDraft();
  requestPersistence();

  S.errors = [];
  const logErr = (m) => {
    S.errors.push(`${new Date().toISOString()} ${m}`);
    if (S.errors.length > 30) S.errors.shift();
  };
  let lastCrash = 0;
  const crash = () => {
    if (Date.now() - lastCrash > 10000) {
      lastCrash = Date.now();
      toast(t('errUnexpected'));
    }
  };
  window.addEventListener('error', (e) => {
    logErr(`${e.message} @${(e.filename || '').split('/').pop()}:${e.lineno}`);
    crash();
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    logErr(`unhandled: ${(r && r.message) || r}`);
    crash();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveDraftNow();
  });
  window.addEventListener('pagehide', saveDraftNow);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#modal').hidden) closeModal(null);
  });

  let hidden = false;
  try {
    hidden = !!localStorage.getItem(HIDE_INSTALL);
  } catch {}
  if (!hidden && isIOS() && !isStandalone()) S.showInstall = true;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    S.installEvt = e;
    if (!hidden) {
      S.showInstall = true;
      if (S.view === 'library') render();
    }
  });
  window.addEventListener('appinstalled', () => {
    S.showInstall = false;
    S.installEvt = null;
  });

  document.addEventListener('click', onClick);
  document.addEventListener('submit', onSubmit);
  document.addEventListener('change', onChange);
  document.addEventListener('input', onInput);
  $('#file').addEventListener('change', (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) importFile(f);
  });
  window.addEventListener('hashchange', () => {
    routing = route();
  });
  window.addEventListener('beforeunload', (e) => {
    if (S.rec && !S.rec.stopped) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  let welcomed = false;
  try {
    welcomed = !!localStorage.getItem(WELCOME_DONE);
  } catch {}
  if (!S.settings.apiKey && !welcomed && !location.hash.replace('#', '')) location.hash = '#/welcome';
  routing = route();
}

boot();
