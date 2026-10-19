import { t } from './i18n.js';
import { esc, fmtClock } from './util.js';
import { fmtDate, fmtDur, speakerName } from './views.js';

export function noteToText(n, lang) {
  const sm = n.summary?.[lang];
  const out = [n.title, `${fmtDate(n.createdAt)} · ${fmtDur(n.duration)}`, ''];
  if (sm) {
    if (sm.overview) out.push(t('overview').toUpperCase(), sm.overview, '');
    if (sm.key_points?.length) out.push(t('keyPoints').toUpperCase(), ...sm.key_points.map((x) => '- ' + x), '');
    if (sm.decisions?.length) out.push(t('decisions').toUpperCase(), ...sm.decisions.map((x) => '- ' + x), '');
    if (sm.action_items?.length) {
      out.push(
        t('tabActions').toUpperCase(),
        ...sm.action_items.map((a) => `[${a.done ? 'x' : ' '}] ${a.text}${a.owner || a.due ? ' (' + [a.owner, a.due].filter(Boolean).join(', ') + ')' : ''}`),
        ''
      );
    }
  }
  out.push(t('tabTranscript').toUpperCase());
  for (const s of n.segments || []) {
    out.push(`[${fmtClock(s.t)}] ${speakerName(n, s.speaker)}: ${s.text}`);
    if (s.tr) out.push(`    ${s.tr}`);
  }
  return out.join('\n');
}

function srtTime(sec) {
  const ms = Math.round(sec * 1000);
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor((ms % 3600000) / 60000))}:${p(Math.floor((ms % 60000) / 1000))},${p(ms % 1000, 3)}`;
}

export function noteToSrt(n) {
  const segs = n.segments || [];
  return segs
    .map((s, i) => {
      const next = segs[i + 1] ? segs[i + 1].t : s.t + 4;
      const end = Math.min(next, s.t + 8);
      return `${i + 1}\n${srtTime(s.t)} --> ${srtTime(Math.max(end, s.t + 1))}\n${s.text}\n`;
    })
    .join('\n');
}

export function printHtml(n, lang) {
  const sm = n.summary?.[lang];
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const ul = (a) => `<ul>${a.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
  let h = `<h1 dir="auto">${esc(n.title)}</h1><p class="m">${esc(fmtDate(n.createdAt))} · ${esc(fmtDur(n.duration))}</p>`;
  if (sm) {
    h += `<div dir="${dir}">`;
    if (sm.overview) h += `<h2>${t('overview')}</h2><p>${esc(sm.overview)}</p>`;
    if (sm.key_points?.length) h += `<h2>${t('keyPoints')}</h2>${ul(sm.key_points)}`;
    if (sm.decisions?.length) h += `<h2>${t('decisions')}</h2>${ul(sm.decisions)}`;
    if (sm.action_items?.length) h += `<h2>${t('tabActions')}</h2>${ul(sm.action_items.map((a) => `${a.done ? '✓ ' : ''}${a.text}${a.owner || a.due ? ' (' + [a.owner, a.due].filter(Boolean).join(', ') + ')' : ''}`))}`;
    h += '</div>';
  }
  h += `<h2>${t('tabTranscript')}</h2>`;
  for (const s of n.segments || []) {
    h += `<p class="l"><b>${esc(speakerName(n, s.speaker))}</b> <span class="m">${fmtClock(s.t)}</span><br><span dir="auto">${esc(s.text)}</span>${s.tr ? `<br><span dir="auto" class="m">${esc(s.tr)}</span>` : ''}</p>`;
  }
  return h;
}

export function noteToMarkdown(n, lang) {
  const sm = n.summary?.[lang];
  const out = [`# ${n.title}`, `${fmtDate(n.createdAt)} · ${fmtDur(n.duration)}`, ''];
  if (sm) {
    if (sm.overview) out.push(`## ${t('overview')}`, sm.overview, '');
    if (sm.key_points?.length) out.push(`## ${t('keyPoints')}`, ...sm.key_points.map((x) => '- ' + x), '');
    if (sm.decisions?.length) out.push(`## ${t('decisions')}`, ...sm.decisions.map((x) => '- ' + x), '');
    if (sm.chapters?.length) out.push(`## ${t('outline')}`, ...sm.chapters.map((c) => `- [${fmtClock(c.t)}] ${c.title}`), '');
    if (sm.action_items?.length) {
      out.push(`## ${t('tabActions')}`, ...sm.action_items.map((a) => `- [${a.done ? 'x' : ' '}] ${a.text}${a.owner || a.due ? ' (' + [a.owner, a.due || a.iso].filter(Boolean).join(', ') + ')' : ''}`), '');
    }
  }
  out.push(`## ${t('tabTranscript')}`);
  for (const sg of n.segments || []) out.push(`**${speakerName(n, sg.speaker)}** [${fmtClock(sg.t)}]: ${sg.text}`, '');
  return out.join('\n');
}

// Word opens an HTML file saved as .doc, so no library is needed.
export function noteToDoc(n, lang) {
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${esc(n.title)}</title></head><body dir="${lang === 'ar' ? 'rtl' : 'ltr'}" style="font-family:Calibri,Arial,sans-serif">${printHtml(n, lang)}</body></html>`;
}

const icsEsc = (x) =>
  String(x || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');

// Calendar file with one all-day event per action item that has a real date.
export function actionsToIcs(n, lang) {
  const items = (n.summary?.[lang]?.action_items || []).filter((a) => a.iso);
  if (!items.length) return '';
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Nota+//EN', 'CALSCALE:GREGORIAN'];
  items.forEach((a, i) => {
    const next = new Date(a.iso + 'T00:00:00Z');
    next.setUTCDate(next.getUTCDate() + 1);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${n.id}-${i}@nota-plus`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${a.iso.replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${next.toISOString().slice(0, 10).replace(/-/g, '')}`,
      `SUMMARY:${icsEsc(a.text)}`,
      `DESCRIPTION:${icsEsc([a.owner ? 'Owner: ' + a.owner : '', n.title].filter(Boolean).join(' - '))}`,
      'END:VEVENT'
    );
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
