import { detectLanguage, tokenize, isContent } from './text.js';
import { buildSentences, normalizeSegments } from './segments.js';

// Búsqueda BM25 sobre pasajes de 2 frases consecutivas. No usa ningún modelo ni servicio externo.
export function searchSegments(segments, query, { limit = 5 } = {}) {
  const segs = normalizeSegments(segments);
  const q = String(query ?? '').slice(0, 300);
  if (!segs.length || !q.trim()) return [];
  const { sentences, text } = buildSentences(segs);
  const lang = detectLanguage(text);
  const qStems = [...new Set(tokenize(q, lang).filter((t) => isContent(t, lang)).map((t) => t.stem))];
  if (!qStems.length) return [];

  const passages = sentences.map((s, i) => {
    const next = sentences[i + 1];
    return { start: s.start, from: i, text: next ? `${s.text} ${next.text}` : s.text };
  });
  const docs = passages.map((p) => {
    const tf = new Map();
    let len = 0;
    for (const t of tokenize(p.text, lang)) {
      len++;
      if (isContent(t, lang)) tf.set(t.stem, (tf.get(t.stem) || 0) + 1);
    }
    return { tf, len };
  });
  const N = docs.length;
  const avg = docs.reduce((a, d) => a + d.len, 0) / Math.max(1, N);
  const df = new Map();
  for (const st of qStems) df.set(st, docs.filter((d) => d.tf.has(st)).length);
  const k1 = 1.2;
  const b = 0.75;

  const scored = passages.map((p, i) => {
    let s = 0;
    let hits = 0;
    for (const st of qStems) {
      const f = docs[i].tf.get(st) || 0;
      if (!f) continue;
      hits++;
      const idf = Math.log(1 + (N - df.get(st) + 0.5) / (df.get(st) + 0.5));
      s += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * docs[i].len) / avg));
    }
    return { ...p, score: s * (1 + 0.25 * (hits - 1)), hits };
  }).filter((p) => p.score > 0);

  scored.sort((a, b2) => b2.score - a.score || a.from - b2.from);
  const out = [];
  for (const p of scored) {
    if (out.some((o) => Math.abs(o.from - p.from) < 2)) continue; // evita pasajes solapados
    out.push({ start: p.start, text: p.text, score: Math.round(p.score * 1000) / 1000 });
    if (out.length >= limit) break;
  }
  return out;
}
