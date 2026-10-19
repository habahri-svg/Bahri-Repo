// End-to-end test for Nota+. Drives the real app in headless Chromium with a fake microphone,
// a scripted speech recognizer and a mocked AI API, so it needs no network and no keys.
//
//   cd tests/nota-plus && node e2e.mjs            (needs `playwright` resolvable, see README)
//
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_PATH || '/opt/node22/lib/node_modules', 'playwright')));
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../nota-plus');
const OUT = process.env.NOTA_TEST_OUT || '/tmp/nota-test-out';
fs.mkdirSync(OUT, { recursive: true });

// ---------- tiny static server ----------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404);
    return res.end('nf');
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

// ---------- assertions ----------
const results = [];
let currentGroup = '';
function check(name, ok, detail = '') {
  results.push({ group: currentGroup, name, ok: !!ok, detail });
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${ok || !detail ? '' : '  -> ' + detail}`);
}
function group(name) {
  currentGroup = name;
  console.log(`\n== ${name}`);
}

// ---------- mocks ----------
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 10; HONOR V5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

// Scripted speech recognizer. Android Chrome ends each session after one phrase, so we mimic that.
const SPEECH_MOCK = `
(() => {
  const state = (window.__sr = { queue: [], starts: 0, locales: [], mode: 'ok', instances: [] });
  class MockSR {
    constructor() { state.instances.push(this); this.running = false; }
    start() {
      state.starts++; state.locales.push(this.lang);
      if (state.mode === 'denied') { setTimeout(() => { this.onerror && this.onerror({ error: 'not-allowed' }); this.onend && this.onend(); }, 30); return; }
      if (state.mode === 'network') { setTimeout(() => { this.onerror && this.onerror({ error: 'network' }); this.onend && this.onend(); }, 30); return; }
      this.running = true;
      const phrase = state.queue.shift();
      if (phrase === undefined) {
        this.timer = setTimeout(() => { this.running = false; this.onerror && this.onerror({ error: 'no-speech' }); this.onend && this.onend(); }, 1200);
        return;
      }
      if (typeof phrase === 'object') {
        this.timer = setTimeout(() => {
          if (!this.running) return;
          this.onresult && this.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: phrase.interim }], { isFinal: false })] });
          this.timer = setTimeout(() => { this.running = false; this.onend && this.onend(); }, 250);
        }, 150);
        return;
      }
      this.timer = setTimeout(() => {
        if (!this.running) return;
        this.onresult && this.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: phrase.slice(0, Math.ceil(phrase.length / 2)) }], { isFinal: false })] });
        this.timer = setTimeout(() => {
          if (!this.running) return;
          this.onresult && this.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: phrase }], { isFinal: true })] });
          this.running = false;
          this.onend && this.onend();
        }, 250);
      }, 150);
    }
    stop() { clearTimeout(this.timer); const was = this.running; this.running = false; setTimeout(() => this.onend && this.onend(), 5); }
    abort() { this.stop(); }
  }
  window.SpeechRecognition = MockSR;
  window.webkitSpeechRecognition = MockSR;
})();`;

let apiMode = 'ok'; // ok | 401 | 429 | down
const apiLog = [];
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };

async function installApiMock(context) {
  await context.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await context.route('https://fonts.gstatic.com/**', (r) => r.abort());
  await context.route('https://api.groq.com/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const url = new URL(req.url());
    const p = url.pathname.replace('/openai/v1', '');
    apiLog.push(`${req.method()} ${p}`);
    if (apiMode === 'down') return route.abort('failed');
    if (apiMode === '401') return route.fulfill({ status: 401, headers: CORS, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Invalid API Key' } }) });
    if (apiMode === '429') return route.fulfill({ status: 429, headers: { ...CORS, 'retry-after': '1' }, contentType: 'application/json', body: JSON.stringify({ error: { message: 'rate limit' } }) });
    const json = (o) => route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(o) });
    if (p === '/models') return json({ data: [{ id: 'llama-3.3-70b-versatile' }, { id: 'whisper-large-v3-turbo' }] });
    if (p === '/audio/transcriptions') {
      if (apiMode === 'empty') return json({ language: 'english', text: '', segments: [] });
      if (apiMode === 'lowconf') return json({ language: 'english', text: 'Hello team we need the budget', segments: [{ start: 0, end: 3, text: ' Hello team we need the budget', no_speech_prob: 0.7, avg_logprob: -0.2 }] });
      if (apiMode === 'hallu') return json({ language: 'english', text: 'Something odd', segments: [{ start: 0, end: 3, text: ' Something odd', no_speech_prob: 0.95, avg_logprob: -1.5 }] });
      return json({
        language: 'english',
        text: 'Hello team. We need to send the budget by Friday. شكرا لكم جميعا',
        segments: [
          { start: 0, end: 3, text: ' Hello team.', no_speech_prob: 0.01, avg_logprob: -0.2 },
          { start: 3, end: 7, text: ' We need to send the budget by Friday.', no_speech_prob: 0.02, avg_logprob: -0.2 },
          { start: 7, end: 9, text: ' شكرا لكم جميعا', no_speech_prob: 0.02, avg_logprob: -0.2 }
        ]
      });
    }
    if (p === '/chat/completions') {
      const body = JSON.parse(req.postData() || '{}');
      const sys = body.messages?.[0]?.content || '';
      const content = (o) => json({ choices: [{ message: { content: typeof o === 'string' ? o : JSON.stringify(o) } }] });
      if (/Translate every item/.test(sys)) {
        const arr = JSON.parse(body.messages[1].content);
        return content({ translations: arr.map((x) => 'TR:' + x) });
      }
      if (/label who is speaking/.test(sys)) {
        const lines = body.messages[1].content.split('\n');
        return content({ speakers: [{ id: 0, name: 'Dana' }, { id: 1, name: 'Omar' }], turns: lines.map((_, i) => ({ i, s: i % 2 })) });
      }
      if (/answer questions about recorded conversations/.test(sys)) return content('The budget is due on Friday [00:03].');
      if (/expert note-taker/.test(sys)) {
        const ar = /Write everything in Arabic/.test(sys);
        return content({
          title: ar ? 'اجتماع الميزانية' : 'Budget kickoff',
          overview: ar ? 'ناقش الفريق موعد تسليم الميزانية.' : 'The team agreed to send the budget by Friday.',
          key_points: ar ? ['تسليم الميزانية يوم الجمعة'] : ['Budget due Friday', 'Team greeted'],
          decisions: ar ? [] : ['Send the budget on Friday'],
          action_items: [{ text: ar ? 'إرسال الميزانية' : 'Send the budget', owner: 'Dana', due: 'Friday' }],
          topics: ['budget']
        });
      }
      return content('ok');
    }
    return route.fulfill({ status: 404, headers: CORS, body: '' });
  });
}

// ---------- helpers ----------
const consoleProblems = [];
async function newPage(context, { speech = true } = {}) {
  const page = await context.newPage();
  page.on('pageerror', (e) => consoleProblems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource|net::ERR|favicon/.test(m.text())) consoleProblems.push(`console.error: ${m.text()}`);
  });
  page.on('dialog', (d) => d.accept());
  if (speech) await page.addInitScript(SPEECH_MOCK);
  return page;
}
const text = (page, sel) => page.locator(sel).first().innerText();
const exists = async (page, sel) => (await page.locator(sel).count()) > 0;
const toastText = (page) => page.locator('#toast').innerText();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 8000, step = 100) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      if (await fn()) return true;
    } catch {}
    await sleep(step);
  }
  return false;
}
const goHome = (page) => page.evaluate(() => (location.hash = '#/')).then(() => sleep(150));
async function setKey(page, key) {
  await page.evaluate((k) => {
    const s = JSON.parse(localStorage.getItem('nota-plus.settings') || '{}');
    s.apiKey = k;
    localStorage.setItem('nota-plus.settings', JSON.stringify(s));
  }, key);
}

// ======================================================================
const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  executablePath: process.env.CHROMIUM_PATH || undefined
});

const ctxOpts = {
  viewport: { width: 360, height: 760 },
  userAgent: ANDROID_UA,
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
  acceptDownloads: true,
  permissions: ['microphone', 'clipboard-read', 'clipboard-write']
};

try {
  const context = await browser.newContext(ctxOpts);
  await installApiMock(context);
  const page = await newPage(context);

  // -------------------------------------------------------------- 1 first run
  group('1. First run: welcome screen and boot');
  await page.goto(BASE);
  await page.waitForSelector('form[data-form=welcome]');
  check('first run opens the welcome / key setup screen', await exists(page, 'form[data-form=welcome]'));
  await page.screenshot({ path: `${OUT}/01-welcome.png` });
  await page.click('form[data-form=welcome] .btn');
  check('empty key shows a hint, does not crash', (await text(page, '#welcome-status')).length > 0, await text(page, '#welcome-status'));
  await page.fill('form[data-form=welcome] [name=key]', 'notakey');
  await page.click('form[data-form=welcome] .btn');
  check('key that does not start with gsk_ is rejected without a request', /gsk_/.test(await text(page, '#welcome-status')), await text(page, '#welcome-status'));
  apiMode = '401';
  await page.fill('form[data-form=welcome] [name=key]', 'gsk_badbadbad');
  await page.click('form[data-form=welcome] .btn');
  check('a refused key shows a friendly error', await waitFor(async () => /key/i.test(await text(page, '#welcome-status')), 4000), await text(page, '#welcome-status'));
  const keptBad = await page.evaluate(() => JSON.parse(localStorage.getItem('nota-plus.settings') || '{}').apiKey || '');
  check('a refused key is not kept', keptBad === '', keptBad);
  apiMode = 'ok';
  await page.click('[data-action=welcome-skip]');
  await page.waitForSelector('#list');
  check('skipping goes to the library', (await text(page, '.brand .word')) === 'Nota+');
  check('empty state shown', await exists(page, '#list .empty'));
  check('record button (FAB) present', await exists(page, 'a.fab'));
  check('banner offers the key setup', (await page.locator('.banner a[href="#/welcome"]').count()) === 1);
  check('no horizontal scroll at 360px', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  const manifestOk = await page.evaluate(async () => {
    const m = await (await fetch(document.querySelector('link[rel=manifest]').href)).json();
    const imgs = await Promise.all(m.icons.map((i) => fetch(new URL(i.src, document.baseURI)).then((r) => r.ok)));
    return m.display === 'standalone' && imgs.every(Boolean);
  });
  check('manifest valid and icons load', manifestOk);
  await page.screenshot({ path: `${OUT}/02-library-empty.png` });
  check('service worker registers', await waitFor(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())), 6000));
  await page.reload();
  await page.waitForSelector('#list');
  check('welcome is not shown again after skipping', !(await exists(page, 'form[data-form=welcome]')));

  // -------------------------------------------------------------- 2 device recording
  group('2. Record with the phone speech engine (no key, Android style)');
  await page.click('a.fab');
  await page.waitForSelector('[data-action=start-rec]');
  check('record setup defaults to On this device', await page.locator('[data-action=set-engine][data-id=device].on').count() === 1);
  check('setup screen offers the key setup', await exists(page, '.banner.keycta'));
  await page.screenshot({ path: `${OUT}/03-record-setup.png` });
  await page.fill('#rec-names', 'Ali, Sara');
  await page.evaluate(() => (window.__sr.queue = ['Hello everyone welcome to the meeting']));
  await page.click('[data-action=start-rec]');
  check('live recording screen opens', await waitFor(() => exists(page, '#rec-timer')));
  check('live transcript shows first phrase', await waitFor(async () => (await page.locator('#rec-lines .line:not(.interim)').count()) >= 1, 6000));
  await sleep(1800);
  const timer = await text(page, '#rec-timer');
  check('timer is counting', timer !== '00:00', timer);
  check('status says live', /live/i.test(await text(page, '#rec-status')), await text(page, '#rec-status'));
  check('pause control shows "Pause"', /pause/i.test(await text(page, '#rec-pause')));
  await page.click('[data-action=mark]');
  check('bookmark marks the line', await waitFor(() => exists(page, '#rec-lines .line.marked'), 3000));
  await page.click('[data-action=pick-speaker][data-i="1"]');
  check('can switch to the second speaker', await page.locator('[data-action=pick-speaker][data-i="1"].on').count() === 1);
  await page.click('[data-action=pick-speaker][data-i="1"]'); // tap the active one again to rename
  await waitFor(() => exists(page, '#modal form'), 2000);
  await page.fill('#modal [name=v]', 'Sara K');
  await page.click('#modal .btn:not(.ghost)');
  check('renaming current speaker works', (await text(page, '#rec-spk')).includes('Sara K'));
  await page.evaluate(() => window.__sr.queue.push('Okay that sounds good to me'));
  check('second speaker line appears separately', await waitFor(async () => (await page.locator('#rec-lines .line:not(.interim)').count()) >= 2, 6000));
  check('no tasks detected yet', await exists(page, '#rec-ai .det.none'));
  await page.evaluate(() => window.__sr.queue.push('Sara will book the room tomorrow morning'));
  check('a later phrase that merges into the line still updates detected tasks', await waitFor(async () => !(await exists(page, '#rec-ai .det.none')), 6000));
  await page.click('[data-action=add-speaker]');
  check('can add a third speaker', await page.locator('[data-action=pick-speaker][data-i="2"]').count() === 1);
  await page.click('#rec-pause');
  check('pause switches to "Resume"', await waitFor(async () => /resume/i.test(await text(page, '#rec-pause')), 2000));
  check('status says paused', /paus/i.test(await text(page, '#rec-status')), await text(page, '#rec-status'));
  const t1 = await text(page, '#rec-timer');
  await sleep(1600);
  const t2 = await text(page, '#rec-timer');
  check('timer is frozen while paused', t1 === t2, `${t1} vs ${t2}`);
  const startsPaused = await page.evaluate(() => window.__sr.starts);
  await sleep(1600);
  check('recognizer is not restarted while paused', (await page.evaluate(() => window.__sr.starts)) === startsPaused);
  await page.click('#rec-pause');
  await sleep(500);
  check('resume goes back to recording', /pause/i.test(await text(page, '#rec-pause')));
  await page.screenshot({ path: `${OUT}/04-recording-live.png` });
  check('recognizer restarts itself between phrases (Android)', (await page.evaluate(() => window.__sr.starts)) >= 3);
  await page.click('[data-action=stop-rec]');
  check('note opens at once after Stop (saved first)', await waitFor(() => exists(page, '.tabs'), 8000));
  check('"who spoke" dialog appears after stopping', await waitFor(() => exists(page, 'form[data-form=speakers]'), 8000));
  await page.screenshot({ path: `${OUT}/05-who-spoke.png` });
  const prefilled = await page.locator('form[data-form=speakers] input[name=sp0]').inputValue();
  check('speaker names typed before recording are prefilled', prefilled === 'Ali', prefilled);
  check('no AI-assign box without a key', !(await exists(page, 'form[data-form=speakers] input[name=ai]')));
  await page.click('form[data-form=speakers] .btn:not(.ghost)');
  check('offline summary is written without a key', await waitFor(async () => (await page.locator('.sum').count()) > 0, 6000));
  await page.screenshot({ path: `${OUT}/06-note-summary.png` });
  check('overview has text', (await text(page, '.sum')).length > 30);
  check('offline-summary banner offers key setup', await exists(page, '.banner [data-action=go-settings], .banner a'));

  // -------------------------------------------------------------- 3 note features
  group('3. Note screen');
  await page.click('[data-action=tab][data-id=transcript]');
  check('transcript tab lists lines', (await page.locator('#tr-lines .line').count()) >= 2);
  const speakersInTranscript = await page.locator('#tr-lines .who b').allInnerTexts();
  check('speaker names appear in transcript', speakersInTranscript.includes('Ali') && speakersInTranscript.some((s) => s.startsWith('Sara')), speakersInTranscript.join('|'));
  check('bookmarked line is marked', await exists(page, '#tr-lines .line.marked'));
  check('marked moments list shows the bookmark', (await page.locator('.marks .ts').count()) === 1);
  await page.click('.marks .ts');
  check('tapping a marked moment jumps to that line', await waitFor(() => exists(page, '#tr-lines .line.cur'), 3000));
  const whoBefore = await page.locator('#tr-lines .line').first().locator('.who b').innerText();
  await page.click('#tr-lines .line >> nth=0 >> [data-action=line-speaker]');
  const whoAfter = await page.locator('#tr-lines .line').first().locator('.who b').innerText();
  check('tapping the person icon re-assigns a line to the next speaker', whoBefore !== whoAfter, `${whoBefore} -> ${whoAfter}`);
  await page.click('#tr-lines .line >> nth=0 >> [data-action=seek]');
  check('tapping a time with no saved audio says so', await waitFor(async () => (await toastText(page)).length > 0, 2000), await toastText(page));
  await page.click('[data-action=tab][data-id=actions]');
  const tasks = await page.locator('.card.task').count();
  check('actions tab lists detected tasks', tasks >= 1, `tasks=${tasks}`);
  if (tasks) {
    await page.click('.card.task [data-action=toggle-task]');
    check('checking a task marks it done', await exists(page, '.card.task.done'));
    await page.click('.card.task [data-action=toggle-task]');
    check('unchecking works', !(await exists(page, '.card.task.done')));
    await page.click('.card.task [data-action=toggle-task]');
  }
  await page.click('[data-action=copy-tasks]');
  check('copy tasks confirms', await waitFor(async () => /cop/i.test(await toastText(page)), 3000), await toastText(page));
  await page.click('[data-action=tab][data-id=ask]');
  check('ask tab with no key shows suggestions', (await page.locator('[data-action=suggest]').count()) === 3);
  await page.click('[data-action=suggest]');
  check('asking without a key explains what is needed', await waitFor(async () => (await page.locator('#chat .msg.ai').count()) >= 1, 3000));
  await page.screenshot({ path: `${OUT}/07-note-ask-nokey.png` });

  await page.click('[data-action=menu]');
  await page.click('.menuitem[data-action=rename]');
  await page.fill('#modal [name=v]', 'Team sync');
  await page.click('#modal .btn:not(.ghost)');
  check('rename updates the title', await waitFor(async () => (await text(page, '.ntitle')) === 'Team sync', 3000));

  await page.click('.footbar [data-action=copy]');
  await sleep(200);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  check('copy puts the note on the clipboard', clip.includes('Team sync') && clip.includes('TRANSCRIPT'), clip.slice(0, 60));
  await page.evaluate(() => navigator.clipboard.writeText('x'));
  await page.evaluate(() => Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }));
  await page.click('.footbar [data-action=share]');
  await sleep(300);
  check('share falls back to copying when Web Share is missing', (await page.evaluate(() => navigator.clipboard.readText())).includes('Team sync'));
  await page.evaluate(() => Object.defineProperty(navigator, 'share', { value: async (d) => { window.__shared = d; }, configurable: true }));
  await page.click('.footbar [data-action=share]');
  await sleep(200);
  check('share uses the phone share sheet when available', (await page.evaluate(() => window.__shared?.title)) === 'Team sync');

  await page.click('[data-action=menu]');
  const [dl1] = await Promise.all([page.waitForEvent('download'), page.click('.menuitem[data-action=export-txt]')]);
  const txtBody = fs.readFileSync(await dl1.path(), 'utf8');
  check('export .txt downloads with the note', dl1.suggestedFilename() === 'Team sync.txt' && txtBody.includes('Hello everyone'), dl1.suggestedFilename());
  await page.click('[data-action=menu]');
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('.menuitem[data-action=export-srt]')]);
  const srtBody = fs.readFileSync(await dl2.path(), 'utf8');
  check('export .srt is valid subtitles', /^1\n00:00:\d\d,\d{3} --> 00:00:\d\d,\d{3}\n/.test(srtBody), srtBody.slice(0, 50));

  await goHome(page);
  check('note appears in the library', (await page.locator('#list .card.note').count()) === 1);
  check('library shows the new title', (await text(page, '#list .card.note .title')) === 'Team sync');
  await page.reload();
  await page.waitForSelector('#list');
  check('note survives a page reload (saved on device)', (await page.locator('#list .card.note').count()) === 1);
  await page.click('#list .card.note');
  await page.waitForSelector('.tabs');
  await page.click('[data-action=tab][data-id=actions]');
  check('task "done" state survived reload', await exists(page, '.card.task.done'));
  await goHome(page);

  await page.fill('#q', 'room');
  check('search finds words inside the transcript', (await page.locator('#list .card.note').count()) === 1);
  check('search result shows a timestamped snippet', /\[\d\d:\d\d\]/.test(await text(page, '#list .card.note .snip')), await text(page, '#list .card.note .snip'));
  await page.click('#list .card.note');
  check('opening a search result goes to the transcript with the match highlighted', await waitFor(async () => (await page.locator('#tr-lines .line.hit mark').count()) >= 1, 4000));
  check('find box is prefilled with the search', (await page.locator('#find').inputValue()) === 'room');
  await goHome(page);
  await page.fill('#q', 'zzzznotthere');
  check('search with no match says so', await exists(page, '#list p.empty'));
  await page.fill('#q', '');
  await page.click('.chip[data-id=lecture]');
  check('lecture filter hides a meeting note', await exists(page, '#list p.empty'));
  await page.click('.chip[data-id=meeting]');
  check('meeting filter shows it', (await page.locator('#list .card.note').count()) === 1);
  await page.click('.chip[data-id=all]');

  // -------------------------------------------------------------- 4 paste + find
  group('4. Paste text, find and jump inside a transcript');
  await page.click('[data-action=paste]');
  await page.waitForSelector('#modal textarea');
  await page.click('#modal .btn:not(.ghost)');
  check('empty paste does nothing', (await page.locator('#list .card.note').count()) === 1);
  await page.click('[data-action=paste]');
  await page.fill('#modal textarea', 'Hello team. We must finish the design review by Monday.\nأحتاج إلى متابعة العميل غداً.\nLong sentence about the project timeline and the budget for next quarter.');
  await page.click('#modal .btn:not(.ghost)');
  check('pasted text becomes a note', await waitFor(() => exists(page, '.tabs'), 5000));
  await page.click('[data-action=tab][data-id=transcript]');
  check('3 pasted lines became 3 transcript lines', (await page.locator('#tr-lines .txt').count()) === 3);
  await page.fill('#find', 'budget');
  check('find counts matches', (await text(page, '#find-count')) === '1 / 1', await text(page, '#find-count'));
  check('find highlights the match', (await page.locator('#tr-lines mark').count()) === 1);
  check('find marks the current line', await exists(page, '#tr-lines .line.cur'));
  await page.fill('#find', 'e');
  const total = Number((await text(page, '#find-count')).split('/')[1]);
  check('a single letter finds many lines', total >= 2, await text(page, '#find-count'));
  await page.click('[data-action=find-next]');
  check('next moves to the second match', (await text(page, '#find-count')).startsWith('2 /'), await text(page, '#find-count'));
  await page.click('[data-action=find-prev]');
  await page.click('[data-action=find-prev]');
  check('previous wraps around to the last match', (await text(page, '#find-count')).startsWith(`${total} /`), await text(page, '#find-count'));
  await page.fill('#find', 'احتاج');
  check('Arabic search ignores hamza (احتاج finds أحتاج)', (await text(page, '#find-count')) === '1 / 1', await text(page, '#find-count'));
  await page.fill('#find', 'zzzz');
  check('no match says "No matches"', /no match/i.test(await text(page, '#find-count')), await text(page, '#find-count'));
  await page.fill('#find', '');
  await page.fill('#jump', '0:02');
  await page.press('#jump', 'Enter');
  check('jump to a time selects the nearest line', await waitFor(async () => (await page.locator('#tr-lines .line.cur').getAttribute('data-seg')) === '2', 3000));
  await page.fill('#jump', 'abc');
  await page.press('#jump', 'Enter');
  check('bad time shows a hint', await waitFor(async () => /time like/i.test(await toastText(page)), 3000), await toastText(page));
  await goHome(page);
  await page.fill('#q', 'أحتاج');
  check('library search finds Arabic text', (await page.locator('#list .card.note').count()) === 1);
  await page.fill('#q', 'احتاج');
  check('library search ignores Arabic hamza too', (await page.locator('#list .card.note').count()) === 1);
  await page.fill('#q', '');
  // long paste without line breaks is cut into sentence lines
  await page.click('[data-action=paste]');
  const long = Array.from({ length: 40 }, (_, i) => `This is sentence number ${i + 1} of a very long pasted block.`).join(' ');
  await page.fill('#modal textarea', long);
  await page.click('#modal .btn:not(.ghost)');
  await waitFor(() => exists(page, '.tabs'), 5000);
  await page.click('[data-action=tab][data-id=transcript]');
  const longLines = await page.locator('#tr-lines .txt').allInnerTexts();
  check('a long block is split into lines of at most ~500 characters', longLines.length >= 4 && longLines.every((l) => l.length <= 520), `${longLines.length} lines, longest ${Math.max(...longLines.map((l) => l.length))}`);
  await goHome(page);

  // -------------------------------------------------------------- 5 settings
  group('5. Settings, key setup, self-check, updates, Arabic interface');
  await page.click('.nav a[href="#/settings"]');
  await page.waitForSelector('[data-setting=apiKey]');
  await page.fill('[data-setting=apiKey]', '  gsk_test key\u200b123 ');
  await page.dispatchEvent('[data-setting=apiKey]', 'change');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('nota-plus.settings')).apiKey);
  check('pasted key is cleaned of spaces and hidden characters', stored === 'gsk_testkey123', stored);
  await page.fill('[data-setting=apiKey]', 'notakey');
  await page.click('[data-action=test-key]');
  check('wrong-format key is rejected before any request', /gsk_/.test(await text(page, '#key-status')), await text(page, '#key-status'));
  await page.fill('[data-setting=apiKey]', 'gsk_validkey123');
  apiMode = '401';
  await page.click('[data-action=test-key]');
  check('401 shows a friendly key error', await waitFor(async () => /key/i.test(await text(page, '#key-status')), 3000), await text(page, '#key-status'));
  apiMode = 'ok';
  await page.click('[data-action=test-key]');
  check('good key shows OK and the model', await waitFor(async () => /llama/.test(await text(page, '#key-status')), 3000), await text(page, '#key-status'));
  check('storage info shows note count', /\d+/.test(await text(page, '#storage-info')), await text(page, '#storage-info'));
  check('version is shown', (await text(page, '#app-version')).includes('v11'), await text(page, '#app-version'));
  await page.click('[data-action=run-checks]');
  check('self-check finishes all steps', await waitFor(async () => (await page.locator('.checks .chk').count()) >= 9 && (await page.locator('.checks .chk.run').count()) === 0, 15000));
  const failed = await page.locator('.checks .chk.fail').allInnerTexts();
  check('self-check reports no failures with a working key and mic', failed.length === 0, failed.join(' | ').replace(/\n/g, ' '));
  await page.screenshot({ path: `${OUT}/08-selfcheck.png`, fullPage: true });
  await page.click('[data-action=copy-report]');
  await sleep(300);
  check('self-check report can be copied', (await page.evaluate(() => navigator.clipboard.readText())).startsWith('Nota+ self-check'));
  apiMode = '401';
  await page.click('[data-action=run-checks]');
  await waitFor(async () => (await page.locator('.checks .chk.run').count()) === 0 && (await page.locator('.checks .chk').count()) >= 9, 15000);
  check('self-check with a refused key flags the key and skips speech/AI steps', (await page.locator('.checks .chk.fail').count()) >= 1 && (await page.locator('.checks .chk.skip').count()) === 2, `fail=${await page.locator('.checks .chk.fail').count()} skip=${await page.locator('.checks .chk.skip').count()}`);
  apiMode = 'ok';
  await page.click('[data-action=check-update]');
  check('"check for update" answers', await waitFor(async () => /updat|latest|version/i.test(await toastText(page)), 4000), await toastText(page));

  await page.selectOption('[data-setting=uiLang]', 'ar');
  await sleep(200);
  check('Arabic UI flips to right-to-left', await page.evaluate(() => document.documentElement.dir === 'rtl' || !!document.querySelector('[dir=rtl]')));
  await page.screenshot({ path: `${OUT}/09-settings-ar.png` });
  check('no horizontal scroll in Arabic', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await page.selectOption('[data-setting=uiLang]', 'en');
  await goHome(page);
  check('English UI restored', (await text(page, '.top .pill')).includes('EN'));
  await page.click('[data-action=toggle-ui-lang]');
  await sleep(150);
  check('language pill toggles to Arabic', await page.evaluate(() => JSON.parse(localStorage.getItem('nota-plus.settings')).uiLang === 'ar'));
  await page.click('[data-action=toggle-ui-lang]');
  // the welcome screen's key setup with a good key
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('nota-plus.settings')); s.apiKey = ''; localStorage.setItem('nota-plus.settings', JSON.stringify(s)); });
  await page.reload();
  await page.waitForSelector('#list');
  await page.click('.banner a[href="#/welcome"]');
  await page.waitForSelector('form[data-form=welcome]');
  await page.fill('form[data-form=welcome] [name=key]', ' gsk_goodkey123 ');
  await page.click('form[data-form=welcome] .btn');
  check('welcome: a good key is saved and returns to the library', await waitFor(async () => (await exists(page, '#list')) && (await page.evaluate(() => JSON.parse(localStorage.getItem('nota-plus.settings')).apiKey)) === 'gsk_goodkey123', 6000));
  check('key banner is gone once a key works', !(await exists(page, '.banner a[href="#/welcome"]')));

  // -------------------------------------------------------------- 6 AI paths
  group('6. AI summary, ask, translate, speakers (mock API)');
  await goHome(page);
  await page.locator('#list .card.note', { hasText: 'Team sync' }).click();
  await page.waitForSelector('.tabs');
  await page.click('[data-action=menu]');
  await page.click('.menuitem[data-action=generate]');
  check('AI summary replaces the quick one', await waitFor(async () => (await text(page, '.sum')).includes('send the budget by Friday'), 6000));
  check('key points, decisions and topics render', (await page.locator('.sum li').count()) >= 2 && (await exists(page, '.sum .decision')) && (await exists(page, '.sum .tags span')));
  await page.click('[data-action=tab][data-id=actions]');
  check('AI action item has owner and due date', (await text(page, '.card.task')).includes('Dana'));
  await page.click('.card.task [data-action=toggle-task]');
  await page.click('[data-action=tab][data-id=summary]');
  await page.click('[data-action=menu]');
  await page.click('.menuitem[data-action=generate]');
  await waitFor(async () => !(await exists(page, '.busy')), 6000);
  await page.click('[data-action=tab][data-id=actions]');
  check('regenerating keeps the tasks you already ticked', await exists(page, '.card.task.done'));
  await page.click('[data-action=tab][data-id=summary]');
  await page.click('[data-action=sum-lang][data-id=ar]');
  check('Arabic summary is generated on demand', await waitFor(async () => (await text(page, '.sum')).includes('الميزانية'), 6000));
  check('Arabic summary is right-to-left', (await page.locator('.sum').getAttribute('dir')) === 'rtl');
  await page.screenshot({ path: `${OUT}/10-summary-ar.png` });
  await page.click('[data-action=sum-lang][data-id=en]');
  await page.click('[data-action=tab][data-id=ask]');
  await page.fill('form[data-form=ask] input[name=q]', 'When is the budget due?');
  await page.press('form[data-form=ask] input[name=q]', 'Enter');
  check('ask AI answers about this note', await waitFor(async () => (await page.locator('#chat .msg.ai').allInnerTexts()).some((x) => x.includes('Friday')), 5000));
  check('time stamps in answers become tappable', (await page.locator('#chat .msg.ai .ts').count()) >= 1);
  await page.click('#chat .msg.ai .ts');
  check('tapping a time stamp in an answer jumps to the transcript line', await waitFor(async () => (await exists(page, '#tr-lines .line.cur')), 3000));
  await page.click('[data-action=translate-all]');
  check('translate transcript adds translations', await waitFor(async () => (await page.locator('#tr-lines .tr').count()) >= 2, 6000));
  await page.fill('#find', 'TR:');
  check('find also searches the translations', !/no match/i.test(await text(page, '#find-count')), await text(page, '#find-count'));
  await page.fill('#find', '');
  await page.click('[data-action=detect-speakers]');
  check('AI speaker detection finishes and says so', await waitFor(async () => /speaker|detect|done|assign/i.test(await toastText(page)), 6000), await toastText(page));
  await page.screenshot({ path: `${OUT}/11-transcript-translated.png` });
  await goHome(page);
  await page.click('.nav a[href="#/ask"]');
  await page.waitForSelector('form[data-form=ask]');
  await page.click('[data-action=suggest]');
  check('ask across all notes answers', await waitFor(async () => (await page.locator('#chat .msg.ai').count()) >= 1, 5000));
  await page.screenshot({ path: `${OUT}/12-ask-all.png` });

  // -------------------------------------------------------------- 7 errors
  group('7. Error handling');
  apiMode = '429';
  await goHome(page);
  await page.locator('#list .card.note', { hasText: 'Team sync' }).click();
  await page.waitForSelector('.tabs');
  await page.click('[data-action=menu]');
  await page.click('.menuitem[data-action=generate]');
  check('rate limit shows a friendly message (after retrying)', await waitFor(async () => /many|limit|wait|rate|busy/i.test(await toastText(page)), 15000), await toastText(page));
  apiMode = 'down';
  await page.click('[data-action=menu]');
  await page.click('.menuitem[data-action=generate]');
  check('network failure shows a friendly message', await waitFor(async () => /connect|network|internet|offline/i.test(await toastText(page)), 6000), await toastText(page));
  check('existing summary is kept after a failed regenerate', await waitFor(async () => (await text(page, '.sum')).length > 20, 4000));
  apiMode = 'ok';

  // -------------------------------------------------------------- 8 cloud engine
  group('8. Record with Cloud Whisper (mock API, fake microphone)');
  await goHome(page);
  await page.click('a.fab');
  await page.waitForSelector('[data-action=start-rec]');
  check('with a key, Cloud Whisper is the default engine', await page.locator('[data-action=set-engine][data-id=cloud].on').count() === 1);
  check('audio saving is on for Cloud Whisper', await page.locator('[data-setup=saveAudio]').isChecked());
  await page.click('[data-action=start-rec]');
  check('cloud recording starts with the fake mic', await waitFor(() => exists(page, '#rec-timer'), 5000));
  check('level bars react to microphone audio', await waitFor(() => page.evaluate(() => [...document.querySelectorAll('#rec-bars i')].some((i) => parseFloat(i.style.height) > 4.5)), 4000));
  check('cloud transcript lines appear (after the first 10s chunk)', await waitFor(async () => (await page.locator('#rec-lines .line:not(.interim)').count()) >= 2, 20000));
  check('mixed English and Arabic both show', (await text(page, '#rec-lines')).includes('شكرا'));
  await page.click('#rec-pause');
  await sleep(1000);
  await page.click('#rec-pause');
  check('cloud recording can pause and resume', await waitFor(async () => /pause/i.test(await text(page, '#rec-pause')), 3000));
  await page.click('[data-action=set-lang-live][data-id=ar]');
  check('can change language while recording', await page.locator('[data-action=set-lang-live][data-id=ar].on').count() === 1);
  await page.click('[data-action=toggle-translate]');
  check('live translate toggles on', await page.locator('[data-action=toggle-translate].on').count() === 1);
  await page.screenshot({ path: `${OUT}/13-cloud-live.png` });
  await page.click('[data-action=stop-rec]');
  check('AI-assign checkbox shows when a key exists', await waitFor(() => exists(page, 'form[data-form=speakers] input[name=ai]'), 12000));
  await page.click('form[data-form=speakers] .btn:not(.ghost)');
  check('cloud note saved with audio player', await waitFor(() => exists(page, '#player'), 8000));
  check('AI summary arrives for the cloud note', await waitFor(async () => (await text(page, '#note-body')).includes('Budget'), 8000));
  check('AI title replaced the default title', await waitFor(async () => (await text(page, '.ntitle')) === 'Budget kickoff', 5000), await text(page, '.ntitle'));
  const audioSize = await page.evaluate(async () => (await (await fetch(document.querySelector('#player').src)).blob()).size);
  check('saved audio blob is not empty', audioSize > 1000, String(audioSize));
  const dur = await page.evaluate(() => new Promise((res) => { const a = document.querySelector('#player'); if (a.duration) return res(a.duration); a.onloadedmetadata = () => res(a.duration); setTimeout(() => res(0), 4000); }));
  check('audio file is playable (has a duration)', dur > 0 || dur === Infinity, String(dur));
  await page.click('[data-action=tab][data-id=transcript]');
  await page.click('#tr-lines .line >> nth=1 >> [data-action=seek]');
  check('tapping a time seeks the audio', await page.evaluate(() => document.querySelector('#player').currentTime >= 0));
  await goHome(page);

  // -------------------------------------------------------------- 9 audio on device
  group('9. On-device recording that also saves audio');
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('nota-plus.settings')); s.engine = 'device'; localStorage.setItem('nota-plus.settings', JSON.stringify(s)); });
  await page.reload();
  await page.waitForSelector('#list');
  await page.click('a.fab');
  await page.waitForSelector('[data-action=start-rec]');
  await page.check('[data-setup=saveAudio]');
  await page.evaluate(() => (window.__sr.queue = ['Quick voice memo about the garden']));
  await page.click('[data-action=start-rec]');
  check('recording with saved audio starts', await waitFor(() => exists(page, '#rec-timer'), 5000));
  await waitFor(async () => (await page.locator('#rec-lines .line:not(.interim)').count()) >= 1, 6000);
  await sleep(1500);
  await page.click('[data-action=stop-rec]');
  await waitFor(() => exists(page, 'form[data-form=speakers]'), 8000);
  await page.click('form[data-form=speakers] [data-action=close-modal]');
  check('"Skip" in the who-spoke dialog still keeps the note', await waitFor(() => exists(page, '.tabs'), 8000));
  check('note has an audio player', await waitFor(() => exists(page, '#player'), 4000));
  await goHome(page);

  // -------------------------------------------------------------- 10 edge cases
  group('10. Edge cases');
  const count = () => page.evaluate(async () => (await new Promise((res) => { const r = indexedDB.open('nota-plus'); r.onsuccess = () => { const q = r.result.transaction('notes').objectStore('notes').count(); q.onsuccess = () => res(q.result); }; })));
  await page.click('a.fab');
  await page.waitForSelector('[data-action=start-rec]');
  await page.evaluate(() => { window.__sr.queue = ['Double tap test phrase here']; window.__sr.instances.length = 0; });
  await page.evaluate(() => { const b = document.querySelector('[data-action=start-rec]'); b.click(); b.click(); });
  await waitFor(() => exists(page, '#rec-timer'), 5000);
  await sleep(1500);
  const live = await page.evaluate(() => window.__sr.instances.filter((i) => i.running).length);
  check('double-tapping Start creates only one listening recognizer', live <= 1, `running=${live}`);
  const notesBefore = await count();
  await page.evaluate(() => { const b = document.querySelector('[data-action=stop-rec]'); b.click(); b.click(); });
  await waitFor(() => exists(page, 'form[data-form=speakers]'), 8000);
  await page.click('form[data-form=speakers] .btn:not(.ghost)');
  await waitFor(() => exists(page, '.tabs'), 6000);
  await sleep(500);
  const notesAfter = await count();
  check('double-tapping Stop saves exactly one note', notesAfter === notesBefore + 1, `${notesBefore} -> ${notesAfter}`);
  check('no recognizer keeps listening after stopping', (await page.evaluate(() => window.__sr.instances.filter((i) => i.running).length)) === 0);
  await goHome(page);

  // crash recovery: the page dies in the middle of a recording
  await page.click('a.fab');
  await page.waitForSelector('[data-action=start-rec]');
  await page.evaluate(() => (window.__sr.queue = ['This sentence was said right before the phone killed the page']));
  await page.click('[data-action=start-rec]');
  await waitFor(async () => (await page.locator('#rec-lines .line:not(.interim)').count()) >= 1, 6000);
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  const draft = await page.evaluate(() => localStorage.getItem('nota-plus.draft'));
  check('an unsaved recording is copied to a draft when the page is hidden', !!draft && draft.includes('phone killed the page'));
  const countBeforeCrash = await count();
  await page.reload(); // beforeunload dialog is auto-accepted
  await page.waitForSelector('#app .screen');
  await goHome(page);
  await page.waitForSelector('#list');
  check('after the crash the recording comes back as a note', await waitFor(async () => (await count()) === countBeforeCrash + 1, 5000), `${countBeforeCrash} -> ${await count()}`);
  check('the recovered note is labelled', await waitFor(async () => /recover/i.test(await text(page, '#list')), 3000), (await text(page, '#list')).slice(0, 80));
  check('the draft is cleared after recovery', (await page.evaluate(() => localStorage.getItem('nota-plus.draft'))) === null);

  await page.click('a.fab');
  await page.waitForSelector('[data-action=start-rec]');
  await page.evaluate(() => (window.__sr.queue = []));
  await page.click('[data-action=start-rec]');
  await sleep(1500);
  const beforeSilent = await count();
  await page.click('[data-action=stop-rec]');
  check('an empty recording with no audio explains why in a dialog (not a quick toast)', await waitFor(() => exists(page, '#modal .dialog h3'), 6000));
  check('the dialog gives tips and a Try again button', (await text(page, '#modal .dialog')).includes('Tips') && (await exists(page, '#modal .dialog a[href="#/record"]')));
  await page.screenshot({ path: `${OUT}/16-no-words.png` });
  await page.click('#modal [data-action=close-modal]');
  await waitFor(() => exists(page, '#list'), 4000);
  check('an empty recording with no audio saves no note', (await count()) === beforeSilent);
  const before = await page.locator('#list .card.note').count();
  await page.click('a.fab');
  await page.waitForSelector('[data-action=start-rec]');
  await page.evaluate(() => (window.__sr.queue = ['Keep going after I leave the screen']));
  await page.click('[data-action=start-rec]');
  await waitFor(() => exists(page, '#rec-timer'), 4000);
  await goHome(page);
  check('recording banner shows while browsing other screens', await exists(page, '.banner.rec'));
  await page.click('.banner.rec');
  check('tapping the banner returns to the live screen', await waitFor(() => exists(page, '#rec-timer'), 3000));
  await waitFor(async () => (await page.locator('#rec-lines .line:not(.interim)').count()) >= 1, 5000);
  await page.click('[data-action=stop-rec]');
  await waitFor(() => exists(page, 'form[data-form=speakers]'), 8000);
  await page.click('form[data-form=speakers] .btn:not(.ghost)');
  await waitFor(() => exists(page, '.tabs'), 6000);
  await page.press('body', 'Escape');
  await page.click('[data-action=menu]');
  await page.press('body', 'Escape');
  check('Escape closes the menu', await page.locator('#modal').isHidden());
  await page.click('[data-action=menu]');
  await page.click('.menuitem[data-action=delete]');
  check('delete returns to the library and removes the note', await waitFor(async () => (await page.locator('#list .card.note').count()) === before, 4000));
  await page.reload();
  await page.waitForSelector('#list');
  check('deleted note stays deleted after reload', (await page.locator('#list .card.note').count()) === before);
  await page.click('.nav a[href="#/settings"]');
  await page.click('[data-action=delete-all]');
  await goHome(page);
  check('"Delete all" empties the library', await exists(page, '#list .empty'));


  // -------------------------------------------------------------- 10b never lose a recording
  group('10b. A recording you spoke into is never lost');
  const setEngine = (pg, engine) => pg.evaluate((e) => { const s = JSON.parse(localStorage.getItem('nota-plus.settings')); s.engine = e; localStorage.setItem('nota-plus.settings', JSON.stringify(s)); }, engine);
  await setEngine(page, 'cloud');
  await page.reload();
  await page.waitForSelector('#list');
  // the speech service answers, but with no words
  apiMode = 'empty';
  const notesBeforeEmpty = await count();
  await page.click('a.fab');
  await page.waitForSelector('[data-action=start-rec]');
  await page.click('[data-action=start-rec]');
  await waitFor(() => exists(page, '#rec-timer'), 5000);
  await sleep(3500);
  await page.click('[data-action=stop-rec]');
  check('no words but audio recorded: the note is kept', await waitFor(async () => (await count()) === notesBeforeEmpty + 1, 8000), `${notesBeforeEmpty} -> ${await count()}`);
  check('it opens on an explanation, not on a blank page', await waitFor(async () => /No words were recognised/.test(await text(page, '#note-body')), 6000), await text(page, '#note-body').catch(() => ''));
  check('the explanation says sound was recorded but no words came back', /no words came back/i.test(await text(page, '#note-body')), await text(page, '#note-body'));
  check('no "who spoke" dialog for a note with no transcript', !(await exists(page, 'form[data-form=speakers]')));
  check('the audio is saved with the note', await exists(page, '#player'));
  await page.screenshot({ path: `${OUT}/17-empty-note.png` });
  await goHome(page);
  check('the library shows it as "No transcript yet"', (await text(page, '#list .card.note .snip')).includes('No transcript yet'), await text(page, '#list .card.note .snip'));
  await page.click('#list .card.note');
  await page.waitForSelector('.tabs');
  apiMode = 'ok';
  await page.click('[data-action=retranscribe]');
  check('"Transcribe again" turns the saved audio into a transcript', await waitFor(async () => (await page.evaluate(async () => { const n = await new Promise((res) => { const r = indexedDB.open('nota-plus'); r.onsuccess = () => { const q = r.result.transaction('notes').objectStore('notes').getAll(); q.onsuccess = () => res(q.result); }; }); return n.some((x) => x.hasAudio && (x.segments || []).length >= 2); })), 10000));
  check('and writes the summary for it', await waitFor(async () => (await exists(page, '.sum')) && (await text(page, '.sum')).includes('budget'), 8000));
  await page.click('[data-action=tab][data-id=transcript]');
  check('the transcript shows the recovered lines', (await page.locator('#tr-lines .line').count()) >= 2);
  await page.click('[data-action=menu]');
  check('the menu offers "Transcribe the saved audio again" for any note with audio', await exists(page, '.menuitem[data-action=retranscribe]'));
  await page.press('body', 'Escape');
  await goHome(page);

  // real speech with a high "no speech" score is kept when Whisper is sure of its words
  apiMode = 'lowconf';
  await page.click('a.fab');
  await page.waitForSelector('[data-action=start-rec]');
  await page.click('[data-action=start-rec]');
  await waitFor(() => exists(page, '#rec-timer'), 5000);
  await sleep(3000);
  await page.click('[data-action=stop-rec]');
  check('speech Whisper is sure about is kept even when the room is noisy', await waitFor(() => exists(page, 'form[data-form=speakers]'), 10000));
  await page.click('form[data-form=speakers] .btn:not(.ghost)');
  await page.click('[data-action=tab][data-id=transcript]');
  check('and appears in the transcript', (await text(page, '#tr-lines')).includes('Hello team we need the budget'));
  await goHome(page);

  // doubtful, silence-like pieces are still dropped, and the audio is kept
  apiMode = 'hallu';
  const beforeHallu = await count();
  await page.click('a.fab');
  await page.waitForSelector('[data-action=start-rec]');
  await page.click('[data-action=start-rec]');
  await waitFor(() => exists(page, '#rec-timer'), 5000);
  await sleep(3000);
  await page.click('[data-action=stop-rec]');
  check('a made-up phrase on silence is dropped but the recording is kept', await waitFor(async () => (await count()) === beforeHallu + 1 && /No words were recognised/.test(await text(page, '#note-body').catch(() => '')), 10000));
  apiMode = 'ok';
  await goHome(page);

  // the phone gives the growing start of a sentence again and again
  await setEngine(page, 'device');
  await page.reload();
  await page.waitForSelector('#list');
  await page.click('a.fab');
  await page.waitForSelector('[data-action=start-rec]');
  await page.evaluate(() => (window.__sr.queue = [{ interim: 'hello' }, { interim: 'hello this' }, { interim: 'hello this is' }, { interim: 'hello this is your test' }]));
  await page.click('[data-action=start-rec]');
  await waitFor(async () => (await text(page, '#rec-lines')).includes('your test'), 8000);
  await sleep(800);
  const liveText = (await page.locator('#rec-lines .txt').allInnerTexts()).join(' | ');
  check('growing interim text is saved once, not repeated', liveText === 'hello this is your test', liveText);
  await page.evaluate(() => window.__sr.queue.push('Same words here', 'Same words here'));
  await waitFor(async () => (await text(page, '#rec-lines')).includes('Same words here'), 6000);
  await sleep(2500);
  const rep = (await page.locator('#rec-lines .txt').allInnerTexts()).join(' | ');
  check('the same phrase handed over twice at once is saved once', (rep.match(/Same words here/g) || []).length === 1, rep);
  await page.click('[data-action=stop-rec]');
  await waitFor(() => exists(page, 'form[data-form=speakers]'), 8000);
  await page.click('form[data-form=speakers] [data-action=close-modal]');
  await waitFor(() => exists(page, '.tabs'), 6000);
  await goHome(page);

  // the microphone delivers only silence (another app or a call has it)
  const ctx6 = await browser.newContext(ctxOpts);
  await installApiMock(ctx6);
  const p6 = await newPage(ctx6);
  await p6.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const ac = new AudioContext();
      const o = ac.createOscillator();
      const g = ac.createGain();
      g.gain.value = 0;
      const d = ac.createMediaStreamDestination();
      o.connect(g);
      g.connect(d);
      o.start();
      return d.stream;
    };
  });
  await p6.goto(BASE);
  await p6.evaluate(() => { localStorage.setItem('nota-plus.settings', JSON.stringify({ engine: 'cloud', apiKey: 'gsk_validkey123' })); localStorage.setItem('nota-plus.welcomeDone', '1'); });
  await p6.reload();
  await p6.waitForSelector('#app .screen');
  await p6.evaluate(() => (location.hash = '#/'));
  await p6.waitForSelector('a.fab');
  apiMode = 'empty';
  await p6.click('a.fab');
  await p6.waitForSelector('[data-action=start-rec]');
  await p6.click('[data-action=start-rec]');
  check('a silent microphone is flagged while recording', await waitFor(async () => /silent/i.test(await p6.locator('#rec-status').innerText()), 14000), await p6.locator('#rec-status').innerText());
  check('and the screen says what to do', await waitFor(async () => /almost nothing/i.test(await p6.locator('#rec-hint').innerText()), 4000), await p6.locator('#rec-hint').innerText());
  await p6.screenshot({ path: `${OUT}/18-mic-silent.png` });
  await p6.click('[data-action=stop-rec]');
  check('after stopping, the note says the microphone heard almost nothing', await waitFor(async () => /heard almost nothing/i.test(await p6.locator('#note-body').innerText()), 10000), await p6.locator('#note-body').innerText().catch(() => ''));
  apiMode = 'ok';
  await ctx6.close();

  // -------------------------------------------------------------- 11 import
  group('11. Import audio');
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('nota-plus.settings')); s.apiKey = ''; localStorage.setItem('nota-plus.settings', JSON.stringify(s)); });
  await page.reload();
  await page.waitForSelector('#list');
  const wav = Buffer.alloc(44 + 16000, 0);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + 16000, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(16000, 40);
  fs.writeFileSync(`${OUT}/clip.wav`, wav);
  await page.setInputFiles('#file', `${OUT}/clip.wav`);
  check('import without a key explains and offers key setup', await waitFor(async () => (await exists(page, '#modal .dialog a[href="#/welcome"]')), 3000));
  await page.screenshot({ path: `${OUT}/14-need-key.png` });
  await page.click('#modal [data-action=close-modal]');
  await setKey(page, 'gsk_validkey123');
  await page.reload();
  await page.waitForSelector('#list');
  await page.setInputFiles('#file', `${OUT}/clip.wav`);
  check('AI-assign box is ticked by default for a single-speaker import', await waitFor(async () => (await exists(page, 'form[data-form=speakers] input[name=ai]')) && (await page.locator('form[data-form=speakers] input[name=ai]').isChecked()), 8000));
  await page.click('form[data-form=speakers] .btn:not(.ghost)');
  check('imported audio becomes a note', await waitFor(() => exists(page, '.tabs'), 8000));
  await page.click('[data-action=tab][data-id=transcript]');
  check('AI speaker assignment on import names the speakers', await waitFor(async () => (await text(page, '#note-body .spk')).includes('Dana'), 6000), await text(page, '#note-body .spk'));
  check('note is titled after the file or its AI title', await waitFor(async () => ['clip', 'Budget kickoff'].includes(await text(page, '.ntitle')), 4000), await text(page, '.ntitle'));
  await goHome(page);

  // -------------------------------------------------------------- 12 offline
  group('12. Offline');
  await page.reload();
  await page.waitForSelector('#list');
  await waitFor(() => page.evaluate(async () => (await caches.keys()).length > 0), 5000);
  await context.setOffline(true);
  await page.reload();
  check('app opens with no internet', await waitFor(() => exists(page, '.brand .word'), 8000));
  check('saved notes are still there offline', (await page.locator('#list .card.note').count()) >= 1);
  await page.click('a.fab');
  check('recording screen works offline', await waitFor(() => exists(page, '[data-action=start-rec]'), 3000));
  await goHome(page);
  await context.setOffline(false);

  // -------------------------------------------------------------- 13 real failures
  group('13. Real-device failures');
  const ctx2 = await browser.newContext(ctxOpts);
  await installApiMock(ctx2);
  const p2 = await newPage(ctx2, { speech: false });
  await p2.goto(BASE);
  await p2.waitForSelector('[data-action=welcome-skip]');
  await p2.click('[data-action=welcome-skip]');
  await p2.waitForSelector('.brand .word');
  await p2.click('a.fab');
  await p2.waitForSelector('[data-action=start-rec]');
  console.log(`  info: browser exposes SpeechRecognition = ${await p2.evaluate(() => !!(window.SpeechRecognition || window.webkitSpeechRecognition))}`);
  await p2.click('[data-action=start-rec]');
  await sleep(4000);
  const state = await p2.evaluate(() => ({ live: !!document.querySelector('#rec-timer'), toast: document.querySelector('#toast').textContent, status: document.querySelector('#rec-status')?.textContent }));
  console.log(`  info: ${JSON.stringify(state)}`);
  check('failure of the real recognizer is reported or recording stays usable', state.live || state.toast.length > 0, JSON.stringify(state));
  await ctx2.close();

  const ctx3 = await browser.newContext({ ...ctxOpts, permissions: [] });
  await installApiMock(ctx3);
  const p3 = await newPage(ctx3);
  await p3.addInitScript(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError')); });
  await p3.goto(BASE);
  await p3.evaluate(() => { localStorage.setItem('nota-plus.settings', JSON.stringify({ engine: 'cloud', apiKey: 'gsk_validkey123' })); });
  await p3.reload();
  await p3.waitForSelector('#app .screen');
  await p3.evaluate(() => (location.hash = '#/'));
  await p3.waitForSelector('a.fab');
  await p3.click('a.fab');
  await p3.waitForSelector('[data-action=start-rec]');
  await p3.click('[data-action=start-rec]');
  await sleep(1200);
  check('mic permission denied shows a clear message', /microphone|mic/i.test(await toastText(p3)), await toastText(p3));
  check('stays on the setup screen after a mic error', await exists(p3, '[data-action=start-rec]'));
  await ctx3.close();

  // device engine fails (network) and a key exists: switches to Cloud Whisper by itself
  const ctx4 = await browser.newContext(ctxOpts);
  await installApiMock(ctx4);
  const p4 = await newPage(ctx4);
  await p4.goto(BASE);
  await p4.evaluate(() => { localStorage.setItem('nota-plus.settings', JSON.stringify({ engine: 'device', apiKey: 'gsk_validkey123' })); });
  await p4.reload();
  await p4.waitForSelector('#app .screen');
  await p4.evaluate(() => (location.hash = '#/'));
  await p4.waitForSelector('a.fab');
  await p4.evaluate(() => (window.__sr.mode = 'network'));
  await p4.click('a.fab');
  await p4.waitForSelector('[data-action=start-rec]');
  await p4.click('[data-action=start-rec]');
  check('when the phone recognizer fails, Nota+ switches to Cloud Whisper', await waitFor(async () => /cloud|whisper|switch/i.test(await p4.locator('#toast').innerText()), 6000), await p4.locator('#toast').innerText());
  check('cloud transcript arrives after the switch', await waitFor(async () => (await p4.locator('#rec-lines .line:not(.interim)').count()) >= 1, 20000));
  await ctx4.close();

  // device engine fails and there is no key: tells the user instead of silently recording nothing
  const ctx5 = await browser.newContext(ctxOpts);
  await installApiMock(ctx5);
  const p5 = await newPage(ctx5);
  await p5.goto(BASE);
  await p5.evaluate(() => { localStorage.setItem('nota-plus.settings', JSON.stringify({ engine: 'device' })); localStorage.setItem('nota-plus.welcomeDone', '1'); });
  await p5.reload();
  await p5.waitForSelector('#app .screen');
  await p5.evaluate(() => (location.hash = '#/'));
  await p5.waitForSelector('a.fab');
  await p5.evaluate(() => (window.__sr.mode = 'denied'));
  await p5.click('a.fab');
  await p5.waitForSelector('[data-action=start-rec]');
  await p5.click('[data-action=start-rec]');
  check('speech blocked and no key: a clear message is shown', await waitFor(async () => (await p5.locator('#toast').innerText()).length > 0, 5000), await p5.locator('#toast').innerText());
  check('and the recording screen says it is not capturing', await waitFor(async () => /not capturing|stopped|no|lost|blocked/i.test(await p5.locator('#rec-status').innerText()), 4000), await p5.locator('#rec-status').innerText());
  await p5.screenshot({ path: `${OUT}/15-not-capturing.png` });
  await ctx5.close();

  // -------------------------------------------------------------- 14 refresh
  group('14. App update button');
  await page.click('.nav a[href="#/settings"]');
  await page.click('[data-action=force-refresh]');
  check('"Force refresh" reloads and the app comes back', await waitFor(() => exists(page, '.brand .word, .screen'), 8000));
  await page.waitForSelector('.screen');
  check('notes still present after force refresh', (await page.evaluate(async () => (await new Promise((res) => { const r = indexedDB.open('nota-plus'); r.onsuccess = () => { const q = r.result.transaction('notes').objectStore('notes').count(); q.onsuccess = () => res(q.result); }; })))) >= 1);

  console.log('\n== Console problems seen during the run');
  if (!consoleProblems.length) console.log('  none');
  consoleProblems.forEach((p) => console.log('  ' + p));
  check('no uncaught errors or console errors', consoleProblems.length === 0, consoleProblems.join(' | '));
} catch (e) {
  console.error('\nTEST RUN CRASHED:', e);
  results.push({ group: currentGroup, name: 'test run crashed: ' + e.message, ok: false });
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('\nFailures:');
  failed.forEach((f) => console.log(`  [${f.group}] ${f.name}${f.detail ? ' -> ' + f.detail : ''}`));
}
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
