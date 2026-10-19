import { S } from './state.js';
import { t } from './i18n.js';
import { deviceSupported, pickMime } from './stt.js';
import { testKey, transcribeBlob, ping } from './ai.js';
import { notesDb } from './store.js';
import { isIOS, isStandalone, isAndroid } from './util.js';

// One-tap health check for the things that differ between phones. Each step reports ok, warn or fail.

function silentWav(seconds = 1.5, rate = 16000) {
  const n = Math.floor(seconds * rate);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  w(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, n * 2, true);
  return new Blob([buf], { type: 'audio/wav' });
}

const msg = (e) => (e && (e.message || e.name)) || String(e);

// Can the browser reach the wider internet at all? A no-cors ping resolves whenever the network lets it through.
async function webReachable() {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 5000);
    await fetch('https://www.gstatic.com/generate_204', { mode: 'no-cors', cache: 'no-store', signal: ctl.signal });
    clearTimeout(timer);
    return true;
  } catch {
    return false;
  }
}

export const CHECKS = [
  {
    id: 'device',
    run: async () => {
      const where = isStandalone() ? 'installed app' : 'browser tab';
      const os = isIOS() ? 'iPhone or iPad' : isAndroid() ? 'Android' : 'computer';
      // the browser's online flag is often wrong (VPNs, firewalls), so really try the network
      let real = false;
      try {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 5000);
        const res = await fetch('manifest.webmanifest?ping=' + Date.now(), { cache: 'no-store', signal: ctl.signal });
        clearTimeout(timer);
        real = res.ok;
      } catch {}
      if (real) return { s: 'ok', d: `${os}, ${where}, connected${navigator.onLine ? '' : ' (the browser says offline but the connection works)'}` };
      return { s: 'warn', d: `${os}, ${where}, no internet connection. Transcription, summaries and translation need it. Check Wi-Fi or VPN.` };
    }
  },
  {
    id: 'mic',
    run: async () => {
      if (!navigator.mediaDevices?.getUserMedia) return { s: 'fail', d: 'This browser has no microphone access. Open the app in Chrome or Safari over https.' };
      try {
        const st = await navigator.mediaDevices.getUserMedia({ audio: true });
        st.getTracks().forEach((t) => t.stop());
        return { s: 'ok', d: 'Microphone allowed' };
      } catch (e) {
        return { s: 'fail', d: `${e.name}. Allow the microphone for this site in your browser or phone settings.` };
      }
    }
  },
  {
    id: 'rec',
    run: async () => {
      if (!window.MediaRecorder) return { s: 'fail', d: 'Audio recording is not supported here, so Cloud Whisper cannot work.' };
      return { s: 'ok', d: `Recording format ${pickMime() || 'default'}` };
    }
  },
  {
    id: 'speech',
    run: async () => {
      if (!deviceSupported()) return { s: 'warn', d: 'No on-device speech recognition here. Use Cloud Whisper.' };
      if (isIOS() && isStandalone()) return { s: 'warn', d: 'Present, but iOS often blocks it in an installed app. Prefer Cloud Whisper on this device.' };
      return { s: 'ok', d: 'On-device speech recognition available' };
    }
  },
  {
    id: 'wake',
    run: async () => ('wakeLock' in navigator ? { s: 'ok', d: 'Screen can stay awake while recording' } : { s: 'warn', d: 'Cannot keep the screen awake. Keep the app open and the screen on while recording.' })
  },
  {
    id: 'store',
    run: async () => {
      try {
        const probe = { id: '__selfcheck__', createdAt: 0 };
        await notesDb.put(probe);
        const back = await notesDb.get('__selfcheck__');
        await notesDb.del('__selfcheck__');
        if (!back) throw new Error('read back failed');
        const persisted = (await navigator.storage?.persisted?.()) ? 'persistent' : 'may be cleared by the browser when space is low';
        return { s: 'ok', d: `Notes can be saved (${persisted})` };
      } catch (e) {
        return { s: 'fail', d: `Cannot save notes: ${msg(e)}. Private browsing blocks storage.` };
      }
    }
  },
  {
    id: 'sw',
    run: async () => {
      if (!('serviceWorker' in navigator)) return { s: 'warn', d: 'No offline support in this browser' };
      return navigator.serviceWorker.controller ? { s: 'ok', d: 'Offline support active' } : { s: 'warn', d: 'Offline support starts after the next reload' };
    }
  },
  {
    id: 'key',
    run: async () => {
      const k = S.settings.apiKey;
      if (!k) return { s: 'fail', d: 'No AI key saved yet', stop: true };
      if (/groq\.com/.test(S.settings.baseUrl) && !k.startsWith('gsk_')) return { s: 'fail', d: 'Groq keys start with gsk_', stop: true };
      try {
        const m = await testKey(S.settings);
        return { s: 'ok', d: `Key accepted. Chat model ${m.chat}, speech model ${m.stt}` };
      } catch (e) {
        // "Failed to fetch" means the request never arrived. Find out whether the whole internet is down or only the AI service is blocked.
        if (e && (e.name === 'TypeError' || e.name === 'AbortError')) {
          const web = await webReachable();
          return { s: 'fail', d: web ? t('keyBlockedNet') : t('errNet'), stop: true };
        }
        return { s: 'fail', d: `${e.status || ''} ${msg(e)}`.trim(), stop: true };
      }
    }
  },
  {
    id: 'stt',
    run: async () => {
      try {
        const r = await transcribeBlob(S.settings, silentWav(), { lang: 'en', name: 'check.wav' });
        return { s: 'ok', d: `Transcription works (${r.segments.length} segments from silence, expected 0)` };
      } catch (e) {
        return { s: 'fail', d: `${e.status || ''} ${msg(e)}`.trim() };
      }
    }
  },
  {
    id: 'llm',
    run: async () => {
      try {
        const out = await ping(S.settings);
        return { s: out ? 'ok' : 'warn', d: out ? `Summaries work, model replied "${out.slice(0, 30)}"` : 'The model returned an empty reply' };
      } catch (e) {
        return { s: 'fail', d: `${e.status || ''} ${msg(e)}`.trim() };
      }
    }
  }
];

export async function runChecks(onUpdate) {
  const results = CHECKS.map((c) => ({ id: c.id, s: 'run', d: '' }));
  onUpdate(results);
  let stop = false;
  for (let i = 0; i < CHECKS.length; i++) {
    if (stop && ['stt', 'llm'].includes(CHECKS[i].id)) {
      results[i] = { id: CHECKS[i].id, s: 'skip', d: 'Skipped until the key works' };
    } else {
      try {
        const r = await CHECKS[i].run();
        results[i] = { id: CHECKS[i].id, s: r.s, d: r.d };
        if (r.stop) stop = true;
      } catch (e) {
        results[i] = { id: CHECKS[i].id, s: 'fail', d: msg(e) };
      }
    }
    onUpdate(results);
  }
  return results;
}

export function reportText(results, labelOf) {
  const lines = [`Nota+ self-check ${new Date().toISOString()}`, `UA: ${navigator.userAgent}`];
  for (const r of results) lines.push(`${r.s.toUpperCase().padEnd(5)} ${labelOf(r.id)}: ${r.d}`);
  if (S.errors && S.errors.length) lines.push('', 'Recent errors:', ...S.errors.slice(-8));
  return lines.join('\n');
}
