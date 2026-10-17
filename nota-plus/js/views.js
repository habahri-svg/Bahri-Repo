import { S } from './state.js';
import { t, getLang } from './i18n.js';
import { esc, fmtClock, tokens } from './util.js';
import { TEMPLATE_IDS } from './ai.js';
import { deviceSupported } from './stt.js';

// ---------- small helpers ----------

const P = {
  wave: '<path d="M4 10v4M8 6v12M12 3v18M16 8v8M20 11v2"/>',
  mic: '<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',
  doc: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  chat: '<path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-5 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/>',
  settings: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  bookmark: '<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/>',
  share: '<path d="M12 16V4M7 9l5-5 5 5M5 14v6h14v-6"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
  translate: '<path d="M4 5h9M8.5 3v2M6 5c0 4 3 7 6 8M11 5c0 3-3 7-7 9M13 20l4-9 4 9M14.5 17h5"/>',
  more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7"/>',
  send: '<path d="M4 12l16-8-6 16-3-7z"/>'
};
const FILLED = {
  pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
  play: '<path d="M8 5v14l11-7z"/>',
  stop: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
  bookmarkF: '<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/>'
};

export function icon(name, size = 24, cls = '') {
  if (FILLED[name]) return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${FILLED[name]}</svg>`;
  return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name]}</svg>`;
}

export function fmtDur(sec) {
  sec = Math.round(sec || 0);
  if (sec < 60) return `${sec} ${t('sec')}`;
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} ${t('min')}`;
  return `${Math.floor(m / 60)} ${t('hr')} ${m % 60} ${t('min')}`;
}

export function fmtDate(ts) {
  const loc = getLang() === 'ar' ? 'ar-u-nu-latn' : undefined;
  const d = new Date(ts);
  const now = new Date();
  const same = (a, b) => a.toDateString() === b.toDateString();
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  const time = d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
  if (same(d, now)) return `${t('today')}, ${time}`;
  if (same(d, y)) return `${t('yesterday')}, ${time}`;
  return d.toLocaleDateString(loc, { weekday: 'short', day: 'numeric', month: 'short' }) + ', ' + time;
}

export const speakerName = (n, i) => (n.speakers && n.speakers[i]) || `${t('speaker')} ${i + 1}`;

const KIND = { meeting: 'meeting', sales: 'meeting', interview: 'meeting', lecture: 'lecture', study: 'lecture', memo: 'memo' };

// ---------- shell pieces ----------

export function nav(active) {
  const item = (id, ic, label, href, action) => {
    const cls = `navitem${active === id ? ' on' : ''}`;
    const cur = active === id ? ' aria-current="page"' : '';
    return href
      ? `<a class="${cls}" href="${href}"${cur}>${icon(ic, 22)}<span>${label}</span></a>`
      : `<button class="${cls}" data-action="${action}">${icon(ic, 22)}<span>${label}</span></button>`;
  };
  return `<nav class="nav" aria-label="Main">
    ${item('library', 'folder', t('navLibrary'), '#/')}
    ${item('ask', 'chat', t('navAsk'), '#/ask')}
    <span></span>
    ${item('import', 'upload', t('navImport'), '', 'import')}
    ${item('settings', 'settings', t('navSettings'), '#/settings')}
    <a class="fab" href="#/record" aria-label="${t('recordBtn')}">${icon('mic', 28)}</a>
  </nav>`;
}

function banners() {
  let h = '';
  if (S.rec && !S.rec.stopped) {
    h += `<a class="banner rec" href="#/record"><span class="dot"></span><span>${t('recordingNow')}</span><b>${t('tapReturn')}</b></a>`;
  }
  if (!S.settings.apiKey) {
    h += `<div class="banner"><div><b>${t('keyBannerTitle')}</b><p>${t('keyBannerBody')}</p></div><a class="btn small" href="#/settings">${t('openSettings')}</a></div>`;
  }
  if (S.showInstall) {
    const body = S.installEvt ? t('installAndroidBody') : t('installIosBody');
    h += `<div class="banner"><div><b>${t('installTitle')}</b><p>${body}</p></div><div class="stack-h">${
      S.installEvt ? `<button class="btn small" data-action="install">${t('installBtn')}</button>` : ''
    }<button class="btn small ghost" data-action="hide-install">${t('dismiss')}</button></div></div>`;
  }
  return h;
}

// ---------- library ----------

function haystack(n) {
  const sm = Object.values(n.summary || {}).map((x) => `${x.overview} ${(x.key_points || []).join(' ')} ${(x.topics || []).join(' ')}`).join(' ');
  return `${n.title} ${(n.segments || []).map((s) => s.text).join(' ')} ${sm}`.toLowerCase();
}

function snippet(n, q) {
  const text = (n.segments || []).map((s) => s.text).join(' ');
  if (q) {
    const first = tokens(q)[0];
    const i = first ? text.toLowerCase().indexOf(first) : -1;
    if (i >= 0) return (i > 30 ? '…' : '') + text.slice(Math.max(0, i - 30), i + 90) + '…';
  }
  const sm = n.summary?.[n.lastSummaryLang || ''];
  return (sm && sm.overview ? sm.overview : text).slice(0, 110);
}

export function noteListHtml() {
  const q = S.q.trim().toLowerCase();
  const qt = tokens(q);
  const list = S.notes.filter((n) => {
    if (S.filter !== 'all' && KIND[n.template || 'meeting'] !== S.filter) return false;
    if (!qt.length) return true;
    const h = haystack(n);
    return qt.every((w) => h.includes(w));
  });
  if (!list.length) {
    return S.notes.length
      ? `<p class="empty">${t('noMatch')}</p>`
      : `<div class="empty"><b>${t('noNotes')}</b><p>${t('noNotesHint')}</p></div>`;
  }
  return list
    .map(
      (n) => `<a class="card note" href="#/note/${n.id}">
      <span class="ico">${icon('wave', 20)}</span>
      <span class="grow"><span class="title" dir="auto">${esc(n.title)}</span>
      <span class="meta">${fmtDate(n.createdAt)} · ${fmtDur(n.duration)}</span>
      <span class="snip" dir="auto">${esc(snippet(n, q))}</span></span>
      <span class="badge">${n.lang === 'mixed' ? 'EN + AR' : (n.lang || 'en').toUpperCase()}</span></a>`
    )
    .join('');
}

export function libraryView() {
  const chips = [['all', t('all')], ['meeting', t('meetings')], ['lecture', t('lectures')], ['memo', t('memos')]]
    .map(([id, l]) => `<button class="chip${S.filter === id ? ' on' : ''}" data-action="filter" data-id="${id}" aria-pressed="${S.filter === id}">${l}</button>`)
    .join('');
  return `<div class="screen">
    <header class="top">
      <div class="brand"><span class="logo">${icon('wave', 20)}</span><span class="word" dir="ltr">Nota+</span><span class="free">${t('free')}</span></div>
      <button class="pill" data-action="toggle-ui-lang" aria-label="${t('uiLang')}">${icon('globe', 18)}<span>EN · عربي</span></button>
    </header>
    <div class="pad">
      ${banners()}
      <label class="search">${icon('search', 20)}<input id="q" type="search" value="${esc(S.q)}" placeholder="${t('searchPh')}" aria-label="${t('searchPh')}"></label>
      <div class="tiles">
        <a class="tile primary" href="#/record">${icon('mic', 24)}<span>${t('liveRecord')}</span></a>
        <button class="tile" data-action="import">${icon('upload', 24)}<span>${t('importAudio')}</span></button>
        <button class="tile" data-action="paste">${icon('doc', 24)}<span>${t('pasteText')}</span></button>
      </div>
      <div class="row between"><h2>${t('recent')}</h2><span class="muted">${t('savedHere')}</span></div>
      <div class="chips" role="group">${chips}</div>
      <div id="list" class="list">${noteListHtml()}</div>
    </div>
    ${nav('library')}
  </div>`;
}

// ---------- record ----------

function seg(items, current, action) {
  return `<div class="seg" role="group">${items
    .map(([id, label]) => `<button class="${current === id ? 'on' : ''}" data-action="${action}" data-id="${id}" aria-pressed="${current === id}">${label}</button>`)
    .join('')}</div>`;
}

function langItems(engine) {
  const a = [['en', t('english')], ['ar', t('arabic')]];
  return engine === 'cloud' ? [['auto', t('auto')], ...a] : a;
}

export function recordSetupView() {
  const u = S.setup;
  const devOk = deviceSupported();
  return `<div class="screen dark">
    <header class="top">
      <a class="iconbtn" href="#/" aria-label="${t('back')}">${icon('back', 24, 'flip')}</a>
      <h1 class="h1">${t('newRecording')}</h1><span class="iconbtn"></span>
    </header>
    <div class="pad stack">
      <section><h3>${t('engine')}</h3>
        <div class="opts">
          <button class="opt${u.engine === 'device' ? ' on' : ''}" data-action="set-engine" data-id="device" ${devOk ? '' : 'disabled'}>
            <b>${t('engineDevice')}</b><span>${devOk ? t('engineDeviceDesc') : t('notAvailable')}</span></button>
          <button class="opt${u.engine === 'cloud' ? ' on' : ''}" data-action="set-engine" data-id="cloud">
            <b>${t('engineCloud')}</b><span>${S.settings.apiKey ? t('engineCloudDesc') : t('engineCloudNoKey')}</span></button>
        </div></section>
      <section><h3>${t('spokenLang')}</h3>${seg(langItems(u.engine), u.lang, 'set-lang-setup')}</section>
      <section><h3>${t('template')}</h3>
        <select id="rec-template" class="select" aria-label="${t('template')}">${TEMPLATE_IDS.map((id) => `<option value="${id}"${u.template === id ? ' selected' : ''}>${t('tpl_' + id)}</option>`).join('')}</select></section>
      <section><h3>${t('speakersLabel')}</h3>
        <input id="rec-names" class="field" value="${esc(u.names || '')}" placeholder="${t('speakersPh')}" autocomplete="off" aria-label="${t('speakersLabel')}">
        <p class="hint">${t('speakersHint')}</p></section>
      <label class="switch"><input type="checkbox" data-setup="liveTranslate" ${u.liveTranslate ? 'checked' : ''}><span>${t('liveTranslate')}</span></label>
      ${u.engine === 'device' ? `<label class="switch"><input type="checkbox" data-setup="saveAudio" ${u.saveAudio ? 'checked' : ''}><span>${t('saveAudio')}<small>${t('saveAudioHint')}</small></span></label>` : ''}
      <button class="btn big rec" data-action="start-rec">${icon('mic', 24)}<span>${t('startRecording')}</span></button>
    </div>
  </div>`;
}

export function liveLinesHtml(r) {
  const names = { speakers: S.rec.speakerNames || {} };
  const lines = r.segments
    .map(
      (s) => `<div class="line${s.marked ? ' marked' : ''}">
      <div class="who sp${s.speaker}"><i></i><b>${esc(speakerName(names, s.speaker))}</b><time>${fmtClock(s.t)}</time>${s.marked ? `<em>${icon('bookmarkF', 14)}${t('marked')}</em>` : ''}</div>
      <div class="txt" dir="auto">${esc(s.text)}</div>
      ${s.tr ? `<div class="tr" dir="auto">${esc(s.tr)}</div>` : ''}</div>`
    )
    .join('');
  const interim = r.interim
    ? `<div class="line interim"><div class="who sp${r.speaker}"><i></i><b>${esc(speakerName(names, r.speaker))}</b></div><div class="txt" dir="auto">${esc(r.interim)}<span class="caret"></span></div></div>`
    : '';
  return lines + interim || `<p class="hint center">${t('listening')}</p>`;
}

export function recordLiveView() {
  const r = S.rec;
  const names = { speakers: r.speakerNames || {} };
  const cloud = r.kind === 'cloud';
  return `<div class="screen dark live">
    <header class="top">
      <a class="iconbtn" href="#/" aria-label="${t('back')}">${icon('back', 24, 'flip')}</a>
      <div class="grow"><div class="rtitle">${t('recording')}</div>
        <div class="rstat"><span class="dot" id="rec-dot"></span><span id="rec-status"></span><time id="rec-timer">00:00</time></div></div>
    </header>
    <div class="pad stack tight">
      ${seg(langItems(r.kind), r.lang, 'set-lang-live')}
      <div class="row between">
        <span class="hint" id="rec-hint">${cloud ? t('hintCloud') : t('hintDevice')}</span>
        <button class="chip dk${r.liveTranslate ? ' on' : ''}" data-action="toggle-translate" aria-pressed="${!!r.liveTranslate}">${icon('translate', 16)}<span>${r.liveTranslate ? t('translateOn') : t('translateOff')}</span></button>
      </div>
      <div class="bars" id="rec-bars" aria-hidden="true">${'<i></i>'.repeat(40)}</div>
    </div>
    <div class="log" id="rec-lines" role="log" aria-label="${t('tabTranscript')}">${liveLinesHtml(r)}</div>
    <div class="spk bar" id="rec-spk" role="group" aria-label="${t('speaker')}">${Array.from({ length: r.speakerCount }, (_, i) => `<button class="chip dk spc sp${i}${r.speaker === i ? ' on' : ''}" data-action="pick-speaker" data-i="${i}" aria-pressed="${r.speaker === i}"><i></i>${esc(speakerName(names, i))}</button>`).join('')}${r.speakerCount < 6 ? `<button class="chip dk" data-action="add-speaker" aria-label="${t('addSpeaker')}">+</button>` : ''}</div>
    <div class="ainotes"><div class="cap">${icon('sparkle', 14)} ${t('detectedTasks')}</div><div id="rec-ai">${detectedHtml()}</div></div>
    <div class="controls">
      <button data-action="mark"><span class="circ amber">${icon('bookmark', 24)}</span>${t('markMoment')}</button>
      <button data-action="pause-rec" id="rec-pause"><span class="circ light">${icon(r.paused ? 'play' : 'pause', 24)}</span>${r.paused ? t('resume') : t('pause')}</button>
      <button data-action="stop-rec"><span class="circ red">${icon('stop', 22)}</span>${t('stopSummarize')}</button>
    </div>
  </div>`;
}

export function detectedHtml() {
  const items = S.detected || [];
  return items.length ? items.map((x) => `<div class="det" dir="auto">${esc(x)}</div>`).join('') : `<div class="det none">${t('noneYet')}</div>`;
}

// ---------- note ----------

function list(items, dir) {
  return `<ul dir="${dir}">${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
}

function summaryHtml(n, lang) {
  const key = n.id + ':' + lang;
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  if (S.busy[key]) return `<div class="busy"><span class="spin"></span>${t('writing')}</div>`;
  const sm = n.summary?.[lang];
  if (!sm) {
    return `<div class="empty"><b>${t('noSummary')}</b><p>${S.settings.apiKey ? '' : t('offlineNote')}</p>
      <button class="btn" data-action="generate">${icon('sparkle', 18)}<span>${t('generate')}</span></button></div>`;
  }
  const sec = (title, body) => (body ? `<section><h3>${title}</h3>${body}</section>` : '');
  return `${
    sm.offline
      ? `<div class="banner"><div><b>${t('quickSummary')}</b><p>${S.settings.apiKey ? t('quickSummaryKey') : t('offlineNote')}</p></div><button class="btn small" data-action="${S.settings.apiKey ? 'generate' : 'go-settings'}">${S.settings.apiKey ? t('generate') : t('openSettings')}</button></div>`
      : ''
  }
    <div dir="${dir}" lang="${lang}" class="sum">
    ${sec(t('overview'), sm.overview ? `<p>${esc(sm.overview)}</p>` : '')}
    ${sec(t('keyPoints'), sm.key_points?.length ? list(sm.key_points, dir) : '')}
    ${sec(t('decisions'), sm.decisions?.length ? `<div class="decision">${sm.decisions.map((d) => `<p>${esc(d)}</p>`).join('')}</div>` : '')}
    ${sec(t('topics'), sm.topics?.length ? `<div class="tags">${sm.topics.map((x) => `<span>${esc(x)}</span>`).join('')}</div>` : '')}
    </div>`;
}

function actionsHtml(n, lang) {
  const sm = n.summary?.[lang];
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  if (!sm || !sm.action_items?.length) return `<p class="empty">${t('noActions')}</p>`;
  return `<div class="stack tight" dir="${dir}">${sm.action_items
    .map(
      (a, i) => `<div class="card task${a.done ? ' done' : ''}">
      <button role="checkbox" aria-checked="${!!a.done}" class="check" data-action="toggle-task" data-i="${i}" aria-label="${esc(a.text)}"><span>${a.done ? icon('check', 16) : ''}</span></button>
      <div class="grow"><div class="ttl" dir="auto">${esc(a.text)}</div>${a.owner || a.due ? `<div class="meta">${esc([a.owner, a.due].filter(Boolean).join(' · '))}</div>` : ''}</div></div>`
    )
    .join('')}<button class="btn ghost" data-action="copy-tasks">${t('copyTasks')}</button></div>`;
}

export function transcriptHtml(n) {
  const target = (x) => (x === 'ar' ? 'en' : 'ar');
  const lines = (n.segments || [])
    .map(
      (s, i) => `<div class="line light${s.marked ? ' marked' : ''}" data-t="${s.t}" data-seg="${i}">
      <div class="who sp${s.speaker}"><button class="lnk" data-action="rename-speaker" data-i="${s.speaker}"><b>${esc(speakerName(n, s.speaker))}</b></button>
      <button class="lnk" data-action="seek" data-t="${s.t}"><time>${fmtClock(s.t)}</time></button>${s.marked ? `<em>${icon('bookmarkF', 14)}</em>` : ''}<button class="lnk lspk" data-action="line-speaker" data-seg="${i}" aria-label="${t('changeSpeaker')}">${icon('user', 16)}</button></div>
      <div class="txt" dir="auto">${esc(s.text)}</div>
      ${s.tr ? `<div class="tr" dir="auto">${esc(s.tr)}</div>` : ''}</div>`
    )
    .join('');
  const busy = S.busy[n.id + ':tr'];
  const ids = [...new Set((n.segments || []).map((x) => x.speaker))].sort((a, b) => a - b);
  const detecting = S.busy[n.id + ':spk'];
  const speakers = `<div class="spk">${ids.map((i) => `<button class="chip sp${i}" data-action="rename-speaker" data-i="${i}"><i></i>${esc(speakerName(n, i))}</button>`).join('')}
    <button class="btn small ghost" data-action="detect-speakers" ${detecting ? 'disabled' : ''}>${icon('user', 16)}<span>${detecting ? t('detecting') : t('detectSpeakers')}</span></button></div>
    <p class="hint">${t('speakersAiNote')}</p>`;
  return `${speakers}<div class="row between wrap"><span class="muted">${(n.segments || []).length} ${t('lines')}</span>
    <button class="btn small ghost" data-action="translate-all" ${busy ? 'disabled' : ''}>${icon('translate', 16)}<span>${busy ? t('translating') : t('translateAll')}</span></button></div>
    <div class="stack tight">${lines || `<p class="empty">${t('noTranscript')}</p>`}</div>`;
}

export function askMessagesHtml(chat) {
  if (!chat.length) return '';
  return chat
    .map((m) => `<div class="msg ${m.role === 'user' ? 'me' : 'ai'}" dir="auto">${esc(m.content).replace(/\n/g, '<br>')}</div>`)
    .join('');
}

function askHtml(n) {
  const chat = S.chats[n.id] || [];
  return `<div class="stack tight"><div id="chat" class="chat">${askMessagesHtml(chat)}${S.busy[n.id + ':ask'] ? `<div class="msg ai"><span class="spin"></span>${t('thinking')}</div>` : ''}</div>
    ${chat.length ? '' : `<div class="tags big">${[t('sug1'), t('sug2'), t('sug3')].map((x) => `<button data-action="suggest" data-q="${esc(x)}">${esc(x)}</button>`).join('')}</div>`}
    <form class="askbar" data-form="ask"><input name="q" autocomplete="off" placeholder="${t('askPh')}" aria-label="${t('askPh')}"><button class="iconbtn send" aria-label="${t('send')}">${icon('send', 20, 'flip')}</button></form></div>`;
}

export function noteView(n) {
  const lang = S.sumLang;
  const tab = S.noteTab;
  const tabs = [['summary', t('tabSummary')], ['transcript', t('tabTranscript')], ['actions', t('tabActions')], ['ask', t('tabAsk')]]
    .map(([id, l]) => `<button role="tab" class="${tab === id ? 'on' : ''}" aria-selected="${tab === id}" data-action="tab" data-id="${id}">${l}</button>`)
    .join('');
  const body = tab === 'summary' ? summaryHtml(n, lang) : tab === 'transcript' ? transcriptHtml(n) : tab === 'actions' ? actionsHtml(n, lang) : askHtml(n);
  return `<div class="screen">
    <header class="top">
      <a class="iconbtn" href="#/" aria-label="${t('back')}">${icon('back', 24, 'flip')}</a>
      <div class="grow"><button class="ntitle lnk" data-action="rename" dir="auto">${esc(n.title)}</button>
        <div class="meta">${fmtDate(n.createdAt)} · ${fmtDur(n.duration)}</div></div>
      <button class="iconbtn" data-action="menu" aria-label="${t('more')}">${icon('more', 22)}</button>
    </header>
    <div class="pad stack tight">
      ${n.hasAudio ? `<div class="player"><audio id="player" controls preload="metadata" src="${S.audioUrl || ''}"></audio></div>` : ''}
      <div class="row gap">
        <div class="seg small" role="group" aria-label="${t('summaryLang')}">
          <button class="${lang === 'en' ? 'on' : ''}" data-action="sum-lang" data-id="en">English</button>
          <button class="${lang === 'ar' ? 'on' : ''}" data-action="sum-lang" data-id="ar">عربي</button></div>
        <select id="note-template" class="select grow" aria-label="${t('template')}">${TEMPLATE_IDS.map((id) => `<option value="${id}"${(n.template || 'meeting') === id ? ' selected' : ''}>${t('tpl_' + id)}</option>`).join('')}</select>
      </div>
      <div class="tabs" role="tablist">${tabs}</div>
      <div id="note-body" class="body">${body}</div>
    </div>
    <div class="footbar">
      <button class="btn ghost" data-action="copy">${t('copy')}</button>
      <button class="btn ghost" data-action="pdf">${t('pdf')}</button>
      <button class="btn" data-action="share">${t('share')}</button>
    </div>
  </div>`;
}

export function menuHtml() {
  const a = (id, label, cls = '') => `<button class="menuitem ${cls}" data-action="${id}">${label}</button>`;
  return `<div class="sheet" role="dialog" aria-modal="true">${a('rename', t('rename'))}${a('generate', t('regenerate'))}${a('translate-all', t('translateAll'))}${a('export-txt', t('exportTxt'))}${a('export-srt', t('exportSrt'))}${a('delete', t('delete'), 'danger')}${a('close-modal', t('cancel'))}</div>`;
}

// ---------- ask across all notes ----------

export function askAllView() {
  const chat = S.chats.all || [];
  return `<div class="screen">
    <header class="top"><h1 class="h1">${t('askAllTitle')}</h1></header>
    <div class="pad stack tight">
      <p class="muted">${t('askAllHint')}</p>
      <div id="chat" class="chat">${askMessagesHtml(chat)}${S.busy.allAsk ? `<div class="msg ai"><span class="spin"></span>${t('thinking')}</div>` : ''}</div>
      ${chat.length ? '' : `<div class="tags big">${[t('sug4'), t('sug5'), t('sug6')].map((x) => `<button data-action="suggest" data-q="${esc(x)}">${esc(x)}</button>`).join('')}</div>`}
      <form class="askbar sticky" data-form="ask"><input name="q" autocomplete="off" placeholder="${t('askPh')}" aria-label="${t('askPh')}"><button class="iconbtn send" aria-label="${t('send')}">${icon('send', 20, 'flip')}</button></form>
    </div>
    ${nav('ask')}
  </div>`;
}

// ---------- settings ----------

export function settingsView() {
  const s = S.settings;
  const opt = (v, cur, label) => `<option value="${v}"${v === cur ? ' selected' : ''}>${label}</option>`;
  const ar = [['ar-SA', 'السعودية'], ['ar-EG', 'مصر'], ['ar-AE', 'الإمارات'], ['ar-JO', 'الأردن'], ['ar-KW', 'الكويت'], ['ar-QA', 'قطر'], ['ar-IQ', 'العراق'], ['ar-MA', 'المغرب'], ['ar-DZ', 'الجزائر'], ['ar-LB', 'لبنان']];
  const en = [['en-US', 'US'], ['en-GB', 'UK'], ['en-AU', 'Australia'], ['en-IN', 'India'], ['en-CA', 'Canada']];
  return `<div class="screen">
    <header class="top"><h1 class="h1">${t('settingsTitle')}</h1></header>
    <div class="pad stack">
      <section class="card stack tight"><h3>${t('aiKey')}</h3><p class="muted">${t('aiKeyHelp')}</p>
        <a class="btn small ghost" href="https://console.groq.com/keys" target="_blank" rel="noopener">${t('getKey')}</a>
        <input class="field" type="password" data-setting="apiKey" value="${esc(s.apiKey)}" placeholder="${t('keyPlaceholder')}" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="${t('aiKey')}">
        <div class="row gap"><button class="btn small" data-action="test-key">${t('testKey')}</button><span id="key-status" class="muted"></span></div></section>
      <section class="card stack tight"><h3>${t('general')}</h3>
        <label class="lbl">${t('interfaceLang')}<select class="select" data-setting="uiLang">${opt('en', s.uiLang, 'English')}${opt('ar', s.uiLang, 'العربية')}</select></label>
        <label class="lbl">${t('summaryLang')}<select class="select" data-setting="summaryLang">${opt('en', s.summaryLang, 'English')}${opt('ar', s.summaryLang, 'العربية')}</select></label>
        <label class="lbl">${t('defaultTemplate')}<select class="select" data-setting="template">${TEMPLATE_IDS.map((id) => opt(id, s.template, t('tpl_' + id))).join('')}</select></label>
        <label class="lbl">${t('defaultEngine')}<select class="select" data-setting="engine">${opt('auto', s.engine, t('engAuto'))}${opt('device', s.engine, t('engineDevice'))}${opt('cloud', s.engine, t('engineCloud'))}</select></label>
        <label class="lbl">${t('arabicDialect')}<select class="select" data-setting="arLocale">${ar.map(([v, l]) => opt(v, s.arLocale, l)).join('')}</select></label>
        <label class="lbl">${t('englishAccent')}<select class="select" data-setting="enLocale">${en.map(([v, l]) => opt(v, s.enLocale, l)).join('')}</select></label></section>
      <details class="card"><summary>${t('advanced')}</summary><div class="stack tight">
        <label class="lbl">${t('baseUrl')}<input class="field" data-setting="baseUrl" value="${esc(s.baseUrl)}" dir="ltr" autocapitalize="off" spellcheck="false"></label>
        <label class="lbl">${t('sttModel')}<input class="field" data-setting="sttModel" value="${esc(s.sttModel)}" dir="ltr" autocapitalize="off" spellcheck="false"></label>
        <label class="lbl">${t('chatModel')}<input class="field" data-setting="chatModel" value="${esc(s.chatModel)}" dir="ltr" autocapitalize="off" spellcheck="false"></label></div></details>
      <section class="card stack tight"><h3>${t('storage')}</h3><p class="muted" id="storage-info">${S.notes.length} ${t('notesCount')}</p>
        <button class="btn small danger" data-action="delete-all">${t('deleteAll')}</button></section>
      <section class="card stack tight"><h3>${t('privacy')}</h3><p class="muted">${t('privacyBody')}</p></section>
    </div>
    ${nav('settings')}
  </div>`;
}
