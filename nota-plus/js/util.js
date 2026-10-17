export const $ = (sel, root = document) => root.querySelector(sel);

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function fmtClock(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

export function arabicRatio(text) {
  const letters = (String(text).match(/\p{L}/gu) || []).length;
  if (!letters) return 0;
  const ar = (String(text).match(/[؀-ۿݐ-ݿ]/g) || []).length;
  return ar / letters;
}

export const langOf = (text) => (arabicRatio(text) > 0.5 ? 'ar' : 'en');

export function download(name, data, type = 'text/plain') {
  const blob = data instanceof Blob ? data : new Blob([data], { type: type + ';charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1500);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;top:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {}
    ta.remove();
    return ok;
  }
}

export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isAndroid = () => /Android/i.test(navigator.userAgent);
export const isStandalone = () =>
  (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;

export const tokens = (s) => String(s || '').toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [];

export function debounce(fn, ms) {
  let id;
  return (...a) => {
    clearTimeout(id);
    id = setTimeout(() => fn(...a), ms);
  };
}

// ---------- searching inside text ----------
// Arabic search should ignore diacritics and the different ways of writing alef, ya and ta marbuta.
const DIACRITICS = /[\u064B-\u0652\u0670\u0640]/;

export function normMap(text) {
  let norm = '';
  const map = []; // map[i] is the index in the original text of norm[i]
  const src = String(text || '');
  for (let i = 0; i < src.length; i++) {
    let c = src[i];
    if (DIACRITICS.test(c)) continue;
    if ('أإآٱ'.includes(c)) c = 'ا';
    else if (c === 'ى') c = 'ي';
    else if (c === 'ة') c = 'ه';
    for (const ch of c.toLowerCase()) {
      norm += ch;
      map.push(i);
    }
  }
  return { norm, map };
}

export const normText = (text) => normMap(text).norm;

export function findRanges(text, q) {
  const nq = normText(String(q || '').trim());
  if (!nq) return [];
  const { norm, map } = normMap(text);
  const out = [];
  for (let from = 0; ; ) {
    const k = norm.indexOf(nq, from);
    if (k < 0) break;
    out.push([map[k], map[k + nq.length - 1] + 1]);
    from = k + nq.length;
  }
  return out;
}

// "12:40", "1:02:03" or plain seconds
export function parseClock(str) {
  const parts = String(str || '').trim().split(':');
  if (!parts.length || parts.length > 3 || parts.some((x) => !/^\d+(\.\d+)?$/.test(x.trim()))) return NaN;
  return parts.map(Number).reduce((a, b) => a * 60 + b, 0);
}
