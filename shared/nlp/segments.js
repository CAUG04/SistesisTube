import { cleanText, decodeEntities, splitSentences, chunkByWords, wordCount } from './text.js';

export const MAX_TEXT_CHARS = 300_000;
export const MAX_SEGMENTS = 6000;

export function formatTime(sec) {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return '';
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = (x) => String(x).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}

export function formatDuration(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return '';
  const m = Math.round(sec / 60);
  if (m < 1) return `${Math.round(sec)} s`;
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

const TS = /(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;
function toSec(m) {
  return (Number(m[1] || 0) * 3600) + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, '0')) / 1000;
}

// Convierte SRT, VTT o texto plano en segmentos [{ start, end, text }].
export function parseTranscriptText(raw) {
  const input = String(raw ?? '').slice(0, MAX_TEXT_CHARS * 2).replace(/\r\n?/g, '\n');
  const isTimed = /-->/.test(input) && TS.test(input);
  const segments = [];

  if (isTimed) {
    const blocks = input.split(/\n{2,}/);
    for (const block of blocks) {
      const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
      if (!lines.length || /^(WEBVTT|NOTE|STYLE|REGION)\b/.test(lines[0])) continue;
      const i = lines.findIndex((l) => l.includes('-->'));
      if (i === -1) continue;
      const [a, b] = lines[i].split('-->');
      const ma = a.match(TS);
      const mb = (b || '').match(TS);
      if (!ma) continue;
      const text = cleanText(lines.slice(i + 1).join(' ').replace(/<[^>]*>/g, ' ').replace(/\{\\[^}]*\}/g, ' '));
      if (!text) continue;
      segments.push({ start: toSec(ma), end: mb ? toSec(mb) : null, text });
    }
    // Los subtítulos automáticos de YouTube repiten líneas: se eliminan duplicados consecutivos / solapados.
    const dedup = [];
    for (const s of segments) {
      const prev = dedup[dedup.length - 1];
      if (prev && (prev.text === s.text || prev.text.endsWith(s.text))) continue;
      if (prev && s.text.startsWith(prev.text) && s.text.length > prev.text.length) {
        prev.text = s.text;
        prev.end = s.end;
        continue;
      }
      dedup.push(s);
    }
    return normalizeSegments(dedup);
  }

  for (const para of input.split(/\n+/)) {
    const text = cleanText(para);
    if (text) segments.push({ start: null, end: null, text });
  }
  return normalizeSegments(segments);
}

// Sanea segmentos venidos de cualquier fuente (Whisper, subtítulos, cliente).
export function normalizeSegments(segments) {
  const out = [];
  let chars = 0;
  for (const s of Array.isArray(segments) ? segments : []) {
    const text = cleanText(s?.text);
    if (!text) continue;
    const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e6 ? v : null);
    chars += text.length;
    if (chars > MAX_TEXT_CHARS || out.length >= MAX_SEGMENTS) break;
    out.push({ start: num(s.start), end: num(s.end), text });
  }
  return out;
}

// Construye frases con su tiempo de inicio a partir de los segmentos.
export function buildSentences(segments) {
  let joined = '';
  const starts = []; // posición de cada segmento dentro de `joined`
  for (const seg of segments) {
    starts.push(joined.length);
    joined += (joined ? ' ' : '') + seg.text;
    starts[starts.length - 1] = joined.length - seg.text.length;
  }
  const segAt = (pos) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  const words = wordCount(joined);
  let parts = splitSentences(joined);
  // Sin puntuación (subtítulos automáticos pegados): trocea por palabras para tener "frases" utilizables.
  const avg = parts.length ? words / parts.length : words;
  const lowPunctuation = words >= 40 && avg > 45;
  if (lowPunctuation) {
    parts = [];
    for (const [i, seg] of segments.entries()) {
      const base = starts[i];
      for (const c of chunkByWords(seg.text, 24)) parts.push({ text: c.text, index: base + Math.max(0, c.index) });
    }
    // une trozos muy cortos consecutivos
    const merged = [];
    for (const p of parts) {
      const prev = merged[merged.length - 1];
      if (prev && wordCount(prev.text) < 8) {
        prev.text += ' ' + p.text;
      } else merged.push({ ...p });
    }
    parts = merged;
  }

  const sentences = parts.map((p, i) => {
    const seg = segments[segAt(p.index)];
    return { id: i, text: p.text, start: seg?.start ?? null, end: seg?.end ?? null };
  });
  return { sentences, lowPunctuation, words, text: joined };
}
