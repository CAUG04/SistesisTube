import { tokenize, isContent } from './text.js';

// Vectores TF-IDF dispersos por frase.
export function prepare(sentences, lang) {
  const N = sentences.length;
  const tokens = sentences.map((s) => tokenize(s.text, lang).map((t) => ({ ...t, content: isContent(t, lang) })));
  const content = tokens.map((ts) => ts.filter((t) => t.content));
  const df = new Map();
  for (const ts of content) for (const st of new Set(ts.map((t) => t.stem))) df.set(st, (df.get(st) || 0) + 1);
  const idf = (st) => Math.log((N + 1) / ((df.get(st) || 0) + 0.5));
  const vectors = content.map((ts) => {
    const tf = new Map();
    for (const t of ts) tf.set(t.stem, (tf.get(t.stem) || 0) + 1);
    const v = new Map();
    let sq = 0;
    for (const [st, c] of tf) {
      const w = (1 + Math.log(c)) * idf(st);
      v.set(st, w);
      sq += w * w;
    }
    return { v, norm: Math.sqrt(sq) };
  });
  return { tokens, content, vectors, idf, df, N };
}

export function cosine(a, b) {
  if (!a.norm || !b.norm) return 0;
  const [small, big] = a.v.size <= b.v.size ? [a.v, b.v] : [b.v, a.v];
  let dot = 0;
  for (const [k, w] of small) {
    const o = big.get(k);
    if (o) dot += w * o;
  }
  return dot / (a.norm * b.norm);
}

export function sumVectors(list) {
  const v = new Map();
  let sq = 0;
  for (const x of list) for (const [k, w] of x.v) v.set(k, (v.get(k) || 0) + w);
  for (const w of v.values()) sq += w * w;
  return { v, norm: Math.sqrt(sq) };
}

const MAX_GRAPH = 900;

// TextRank + similitud al centroide, normalizados a 0..1.
export function centrality(vectors) {
  const N = vectors.length;
  const centroid = sumVectors(vectors);
  const cen = vectors.map((x) => cosine(x, centroid));
  const maxC = Math.max(...cen, 1e-9);

  // Candidatas al grafo: todas si N es razonable; si no, las más cercanas al centroide.
  let nodes = vectors.map((_, i) => i);
  if (N > MAX_GRAPH) nodes = nodes.sort((a, b) => cen[b] - cen[a] || a - b).slice(0, MAX_GRAPH);
  const m = nodes.length;
  const adj = Array.from({ length: m }, () => []);
  const outSum = new Array(m).fill(0);
  for (let a = 0; a < m; a++) {
    for (let b = a + 1; b < m; b++) {
      const s = cosine(vectors[nodes[a]], vectors[nodes[b]]);
      if (s > 0.04) {
        adj[a].push([b, s]);
        adj[b].push([a, s]);
        outSum[a] += s;
        outSum[b] += s;
      }
    }
  }
  let pr = new Array(m).fill(1 / m);
  const d = 0.85;
  for (let it = 0; it < 50; it++) {
    const next = new Array(m).fill((1 - d) / m);
    for (let a = 0; a < m; a++) {
      for (const [b, s] of adj[a]) next[b] += (d * pr[a] * s) / (outSum[a] || 1);
    }
    let diff = 0;
    for (let a = 0; a < m; a++) diff += Math.abs(next[a] - pr[a]);
    pr = next;
    if (diff < 1e-6) break;
  }
  const maxPr = Math.max(...pr, 1e-9);
  const rank = new Array(N).fill(0);
  nodes.forEach((idx, a) => {
    rank[idx] = pr[a] / maxPr;
  });
  return vectors.map((_, i) => ({ text: rank[i] || 0.3 * (cen[i] / maxC), centroid: cen[i] / maxC }));
}

// Máxima relevancia marginal: elige k elementos relevantes y poco redundantes entre sí.
export function mmr({ candidates, score, sim, k, lambda = 0.7 }) {
  const chosen = [];
  const pool = [...candidates];
  while (chosen.length < k && pool.length) {
    let bestIdx = -1;
    let best = -Infinity;
    for (let p = 0; p < pool.length; p++) {
      const i = pool[p];
      let red = 0;
      for (const j of chosen) red = Math.max(red, sim(i, j));
      const val = lambda * score(i) - (1 - lambda) * red;
      if (val > best + 1e-12 || (Math.abs(val - best) <= 1e-12 && i < pool[bestIdx])) {
        best = val;
        bestIdx = p;
      }
    }
    chosen.push(pool[bestIdx]);
    pool.splice(bestIdx, 1);
  }
  return chosen;
}

// Frases clave (1-3 palabras) con su forma de superficie más frecuente.
export function extractPhrases({ tokens, idf, minCount = 2, only = null }) {
  const map = new Map();
  const idxs = only ?? tokens.map((_, i) => i);
  for (const si of idxs) {
    const seen = new Set();
    let run = [];
    const flush = () => {
      for (let n = 1; n <= 3; n++) {
        for (let i = 0; i + n <= run.length; i++) {
          const slice = run.slice(i, i + n);
          const key = slice.map((t) => t.stem).join(' ');
          const surface = slice.map((t) => t.raw.toLowerCase()).join(' ');
          let e = map.get(key);
          if (!e) {
            e = { key, n, sentences: new Set(), surfaces: new Map(), idf: slice.reduce((a, t) => a + Math.max(0, idf(t.stem)), 0) / n, stems: slice.map((t) => t.stem) };
            map.set(key, e);
          }
          if (!seen.has(key)) {
            e.sentences.add(si);
            seen.add(key);
          }
          e.surfaces.set(surface, (e.surfaces.get(surface) || 0) + 1);
        }
      }
      run = [];
    };
    for (const t of tokens[si]) {
      if (t.content) run.push(t);
      else flush();
    }
    flush();
  }
  const out = [];
  for (const e of map.values()) {
    const c = e.sentences.size;
    if (c < (e.n === 1 ? minCount : Math.max(2, minCount))) continue;
    const score = Math.pow(c, 0.7) * e.idf * (1 + 0.35 * (e.n - 1));
    let surface = '';
    let best = 0;
    for (const [s, cnt] of e.surfaces) if (cnt > best || (cnt === best && s < surface)) { best = cnt; surface = s; }
    out.push({ key: e.key, n: e.n, count: c, score, surface, stems: e.stems, ids: e.sentences });
  }
  out.sort((a, b) => b.score - a.score || (a.key < b.key ? -1 : 1));
  return out;
}

// Elige las mejores frases evitando solapamientos de raíces.
export function pickPhrases(phrases, limit) {
  const used = new Set();
  const picked = [];
  for (const p of phrases) {
    if (p.stems.some((s) => used.has(s))) continue;
    picked.push(p);
    p.stems.forEach((s) => used.add(s));
    if (picked.length >= limit) break;
  }
  return picked;
}
