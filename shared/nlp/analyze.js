import { fold, detectLanguage, wordCount, tokenize } from './text.js';
import { normalizeSegments, buildSentences, formatDuration } from './segments.js';
import { prepare, cosine, sumVectors, centrality, mmr, extractPhrases, pickPhrases } from './rank.js';
import {
  BOILERPLATE, ADVICE_STRONG, ADVICE_COND, NEG_IMPERATIVE, IMPERATIVES_ES, IMPERATIVES_EN, LEADING_FILLERS,
  RECOMMEND_CUES, CAUSAL, SUMMARY_CUES, CATEGORIES
} from './lexicon.js';

export class AnalysisError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AnalysisError';
    this.code = code;
  }
}

export const MIN_WORDS = 25;
const FOCUS = {
  general: { summary: 1, ideas: 1, tips: 1, recs: 1, sections: 1 },
  practico: { summary: 0.8, ideas: 0.8, tips: 1.7, recs: 1, sections: 1 },
  ejecutivo: { summary: 0.8, ideas: 0.7, tips: 0.7, recs: 1.6, sections: 0.8 },
  estudio: { summary: 1.2, ideas: 1.5, tips: 0.9, recs: 0.8, sections: 1.3 }
};
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const truncate = (s, n) => {
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  const i = Math.max(cut.lastIndexOf(' '), n - 25);
  return cut.slice(0, i).replace(/[,;:\s]+$/, '') + '…';
};

function cleanLead(text) {
  let t = text.trim();
  for (let i = 0; i < 3; i++) {
    const n = t.replace(new RegExp(LEADING_FILLERS.source, 'i'), '');
    if (n === t) break;
    t = n;
  }
  return cap(t);
}

function features(sentences, lang) {
  return sentences.map((s) => {
    const f = fold(s.text);
    const wc = wordCount(s.text);
    const boiler = BOILERPLATE.some((b) => f.includes(b));
    const question = /\?\s*["”»)]*$/.test(s.text.trim());
    const stripped = f.replace(new RegExp(LEADING_FILLERS.source), '').replace(/^[^a-zñ0-9]+/, '');
    const first = (stripped.match(/^[a-zñ']+/) || [''])[0];
    const imperative = (lang === 'en' ? IMPERATIVES_EN : IMPERATIVES_ES).has(first) && wc >= 4;
    const negImp = NEG_IMPERATIVE.test(stripped) && wc >= 4;
    let advice = 0;
    if (ADVICE_STRONG.some((r) => r.test(f))) advice = 1;
    else if (imperative) advice = 0.85;
    else if (negImp) advice = 0.7;
    else if (ADVICE_COND.some((r) => r.test(f))) advice = 0.5;
    if (wc < 4 || wc > 48) advice = 0;
    if (question && advice < 1) advice *= 0.4;
    if (boiler) advice = 0;
    return { f, wc, boiler, question, imperative, advice, rec: RECOMMEND_CUES.some((r) => r.test(f)), summaryCue: SUMMARY_CUES.some((r) => r.test(f)), causal: CAUSAL.test(f) };
  });
}

function categoryOf(f) {
  for (const [name, re] of CATEGORIES) if (re.test(f)) return name;
  return 'General';
}

// Segmenta en temas: busca los valles de cohesión léxica entre ventanas adyacentes.
function segmentTopics(vectors, sections) {
  const N = vectors.length;
  if (sections <= 1) return [0];
  const w = clamp(Math.round(N / (sections * 3)), 3, 8);
  const gaps = [];
  for (let i = w - 1; i < N - w; i++) {
    const left = sumVectors(vectors.slice(i - w + 1, i + 1));
    const right = sumVectors(vectors.slice(i + 1, i + 1 + w));
    gaps.push({ at: i + 1, sim: cosine(left, right) });
  }
  const minGap = Math.max(4, Math.floor(N / (sections * 2)));
  const bounds = [0];
  const sorted = [...gaps].sort((a, b) => a.sim - b.sim || a.at - b.at);
  const chosen = [];
  for (const g of sorted) {
    if (chosen.length >= sections - 1) break;
    if (g.at < minGap || N - g.at < minGap) continue;
    if (chosen.some((c) => Math.abs(c - g.at) < minGap)) continue;
    chosen.push(g.at);
  }
  // Si no hay suficientes valles claros, completa con cortes uniformes.
  for (let s = 1; chosen.length < sections - 1 && s < sections; s++) {
    const at = Math.round((N * s) / sections);
    if (!chosen.some((c) => Math.abs(c - at) < minGap)) chosen.push(at);
  }
  return bounds.concat(chosen.sort((a, b) => a - b));
}

function extractResources(sentences) {
  const found = new Map();
  const add = (s) => {
    const t = s.replace(/\s+/g, ' ').replace(/^[\s"“«'(]+|[\s"”»'),.;:!?]+$/g, '').trim();
    if (t.length < 3 || t.length > 80 || wordCount(t) > 7) return;
    const k = fold(t);
    if (!found.has(k)) found.set(k, t);
  };
  const cues = /\b(libro|book|app|aplicaci[oó]n|herramienta|podcast|curso|m[eé]todo|t[eé]cnica|regla|ley|principio|efecto|modelo|teor[ií]a|framework|plataforma|programa|metodolog[ií]a|sistema)\s+(?:de\s+(?:los|las|la|el)\s+|de\s+|llamad[oa]\s+|titulad[oa]\s+|conocid[oa]\s+como\s+|called\s+)?((?:\p{Lu}[\p{L}\p{N}'’-]*|\d+)(?:\s+(?:de|del|la|el|of|the|y|and)?\s*(?:\p{Lu}[\p{L}\p{N}'’-]*|\d+|\p{Ll}[\p{L}]*)){0,3})/gu;
  const caps = new Map();
  for (const { text } of sentences) {
    for (const m of text.matchAll(/[“"«]([^”"»]{3,60})[”"»]/g)) if (wordCount(m[1]) >= 2) add(m[1]);
    for (const m of text.matchAll(cues)) add(`${m[1]} ${m[2]}`.replace(/^(\p{L}+)/u, (x) => x.toLowerCase()).replace(/^\p{L}/u, (c) => c));
    const toks = text.match(/[\p{L}\p{N}'’-]+/gu) || [];
    let run = [];
    const flush = () => {
      if (run.length >= 2) {
        const phrase = run.join(' ');
        caps.set(fold(phrase), { phrase, n: (caps.get(fold(phrase))?.n || 0) + 1 });
      }
      run = [];
    };
    toks.forEach((tk, i) => {
      const isCap = /^\p{Lu}[\p{L}\p{N}'’-]*$/u.test(tk) && tk.length >= 3;
      const joiner = /^(de|del|of|the|la|y)$/i.test(tk) && run.length > 0;
      if (i > 0 && (isCap || joiner)) run.push(tk);
      else flush();
    });
    flush();
  }
  for (const { phrase } of caps.values()) add(phrase.replace(/(\s+(de|del|of|the|la|y))+$/i, ''));
  return [...found.values()].slice(0, 12);
}

export function analyzeTranscript({ segments, title = '', author = '', durationSec = null, focus = 'general' }) {
  const segs = normalizeSegments(segments);
  if (!segs.length) throw new AnalysisError('EMPTY', 'No hay texto para analizar.');
  const built = buildSentences(segs);
  const { sentences, lowPunctuation, words, text } = built;
  if (words < MIN_WORDS || sentences.length < 3) {
    throw new AnalysisError('TOO_SHORT', `El contenido es demasiado corto para resumirlo (mínimo ${MIN_WORDS} palabras).`);
  }
  const cfg = FOCUS[focus] ?? FOCUS.general;
  const lang = detectLanguage(text);
  const N = sentences.length;
  const prep = prepare(sentences, lang);
  const cent = centrality(prep.vectors);
  const feat = features(sentences, lang);
  const sim = (i, j) => cosine(prep.vectors[i], prep.vectors[j]);

  // Puntuación base de "relevancia para el resumen"
  const score = sentences.map((_, i) => {
    const f = feat[i];
    let s = 0.55 * cent[i].text + 0.3 * cent[i].centroid + (f.summaryCue ? 0.15 : 0);
    if (f.wc < 6) s *= 0.4;
    else if (f.wc < 9) s *= 0.8;
    else if (f.wc > 45) s *= 0.7;
    const pos = i / N;
    if (pos < 0.06) s *= 0.85;
    if (pos > 0.9) s *= 1.1;
    if (f.boiler) s *= 0.05;
    if (f.question) s *= 0.6;
    return s;
  });
  const byScore = [...score.keys()].sort((a, b) => score[b] - score[a] || a - b);

  // ---- Secciones (temas) ----
  const nSections = N >= 9 ? clamp(Math.round((N / 16) * cfg.sections), 2, 8) : 1;
  const bounds = segmentTopics(prep.vectors, nSections);
  const sections = [];
  const sectionOf = new Array(N).fill(0);
  bounds.forEach((b0, s0) => {
    const end = s0 + 1 < bounds.length ? bounds[s0 + 1] : N;
    for (let i = b0; i < end; i++) sectionOf[i] = s0;
    sections.push({ from: b0, to: end });
  });
  const minCount = N < 40 ? 1 : 2;
  const globalPhrases = extractPhrases({ tokens: prep.tokens, idf: prep.idf, minCount });

  // ---- Resumen: una frase por tema como mínimo (cobertura) + relleno por relevancia ----
  const kSummary = clamp(Math.round((2 + 1.4 * Math.log(N)) * cfg.summary), 3, 10);
  const okSummary = (i) => !feat[i].boiler && feat[i].wc >= 8 && !feat[i].question;
  const firstPick = sections
    .map(({ from, to }) => {
      let best = -1;
      for (let i = from; i < to; i++) if (okSummary(i) && (best === -1 || score[i] > score[best])) best = i;
      return best;
    })
    .filter((i) => i >= 0)
    .sort((x, y) => score[y] - score[x] || x - y)
    .slice(0, Math.min(kSummary, N));
  const rest = byScore.filter((i) => okSummary(i) && !firstPick.includes(i)).slice(0, 150);
  const extra = kSummary > firstPick.length
    ? mmr({ candidates: rest, score: (i) => score[i], sim: (i, j) => Math.max(sim(i, j), firstPick.includes(j) ? sim(i, j) : 0), k: kSummary - firstPick.length, lambda: 0.7 })
    : [];
  const summaryIdx = [...firstPick, ...extra].sort((x, y) => x - y);
  let resumen = '';
  for (const i of summaryIdx) {
    const next = (resumen ? resumen + ' ' : '') + cleanLead(sentences[i].text);
    if (next.length > 3800) break;
    resumen = next;
  }

  // ---- Consejos y recomendaciones (se calculan antes que las ideas para no repetir frases) ----
  const tipScore = sentences.map((_, i) => (feat[i].advice > 0 ? feat[i].advice * (0.7 + 0.3 * cent[i].text) : 0));
  const recScore = sentences.map((_, i) => {
    const f = feat[i];
    if (f.boiler || f.wc < 5 || f.wc > 50) return 0;
    let w = f.rec ? 1 : 0;
    if (f.summaryCue) w += 0.25;
    if (w > 0 && i / N > 0.85) w += 0.2;
    return w > 0 ? Math.min(1.2, w) * (0.55 + 0.45 * cent[i].text) * (f.question ? 0.5 : 1) : 0;
  });
  const tipPool = [];
  const recPool = [];
  for (let i = 0; i < N; i++) {
    if (tipScore[i] >= 0.5 && tipScore[i] >= recScore[i]) tipPool.push(i);
    else if (recScore[i] >= 0.5) recPool.push(i);
  }
  const nTips = clamp(Math.round((4 + 1.2 * Math.log(N)) * cfg.tips), 3, 15);
  const nRecs = clamp(Math.round((2 + 0.6 * Math.log(N)) * cfg.recs), 2, 8);
  const tipIdx = mmr({ candidates: tipPool.sort((x, y) => tipScore[y] - tipScore[x] || x - y).slice(0, 120), score: (i) => tipScore[i], sim, k: nTips, lambda: 0.8 }).sort((x, y) => x - y);
  const tipSet = new Set(tipIdx);
  const recIdx = mmr({ candidates: recPool.sort((x, y) => recScore[y] - recScore[x] || x - y).slice(0, 120), score: (i) => recScore[i], sim, k: nRecs, lambda: 0.75 }).sort((x, y) => x - y);
  const recSet = new Set(recIdx);
  const usable = (j) => j >= 0 && j < N && !feat[j].boiler && feat[j].wc >= 5 && !tipSet.has(j) && !recSet.has(j);

  const catOf = (f, ctx) => {
    const both = `${f} ${fold(ctx)}`;
    for (const [name, re] of CATEGORIES) {
      const hits = new Set(both.match(new RegExp(re.source, 'g')) || []);
      if (hits.size >= 2) return name;
    }
    return 'General';
  };
  const consejos = tipIdx.map((i) => {
    let ctx = '';
    for (const j of [i + 1, i + 2]) {
      if (usable(j) && ctx.length < 220 && !feat[j].question) ctx += (ctx ? ' ' : '') + sentences[j].text;
      else break;
    }
    return {
      consejo: truncate(cleanLead(sentences[i].text), 300),
      comoAplicarlo: truncate(ctx, 400),
      categoria: catOf(feat[i].f, ctx),
      tiempo: sentences[i].start
    };
  });
  const recomendaciones = recIdx.map((i) => {
    let why = '';
    for (const j of [i + 1, i - 1, i + 2]) if (usable(j) && feat[j].causal) { why = sentences[j].text; break; }
    if (!why && usable(i + 1)) why = sentences[i + 1].text;
    let action = '';
    for (let d = 1; d <= 3 && !action; d++) {
      for (const j of [i + d, i - d]) {
        if (j >= 0 && j < N && j !== i && feat[j].advice >= 0.8 && !feat[j].boiler) { action = cleanLead(sentences[j].text); break; }
      }
    }
    return {
      recomendacion: truncate(cleanLead(sentences[i].text), 300),
      porQueImporta: truncate(why, 500),
      accionInmediata: truncate(action, 300),
      tiempo: sentences[i].start
    };
  });

  // ---- Secciones: título y detalle ----
  const resumenPorSecciones = N >= 9
    ? sections.map(({ from, to }, s0) => {
        const idxs = [];
        for (let i = from; i < to; i++) idxs.push(i);
        let top = pickPhrases(extractPhrases({ tokens: prep.tokens, idf: prep.idf, minCount: 2, only: idxs }).filter((p) => p.n <= 2), 2);
        if (!top.length) {
          const inSec = new Set(idxs);
          top = pickPhrases(
            globalPhrases
              .map((p) => ({ p, ov: [...p.ids].filter((x) => inSec.has(x)).length }))
              .filter((x) => x.ov > 0)
              .sort((x, y) => y.ov * y.p.score - x.ov * x.p.score)
              .map((x) => x.p),
            2
          );
        }
        const best = idxs.filter(okSummary).sort((x, y) => score[y] - score[x] || x - y).slice(0, 2).sort((x, y) => x - y);
        const names = top.map((p) => cap(p.surface));
        return {
          seccion: `${s0 + 1}. ${names.length ? names.join(' y ') : `Parte ${s0 + 1}`}`,
          detalle: truncate(best.map((i) => cleanLead(sentences[i].text)).join(' '), 600),
          tiempo: sentences[from].start
        };
      })
    : [];

  // ---- Ideas principales (sin repetir lo ya usado como consejo/recomendación) ----
  const mIdeas = clamp(Math.round((2 + 1.2 * Math.log(N)) * cfg.ideas), 3, 10);
  const perSection = new Map();
  const ideaCands = byScore.filter((i) => !feat[i].boiler && feat[i].wc >= 7 && !feat[i].question && !tipSet.has(i) && !recSet.has(i)).slice(0, 200);
  let ideaIdx = mmr({ candidates: ideaCands, score: (i) => score[i], sim, k: Math.min(mIdeas * 2, ideaCands.length), lambda: 0.6 });
  const maxPerSection = Math.max(2, Math.ceil(mIdeas / Math.max(1, sections.length)));
  ideaIdx = ideaIdx.filter((i) => {
    const c = perSection.get(sectionOf[i]) || 0;
    if (c >= maxPerSection) return false;
    perSection.set(sectionOf[i], c + 1);
    return true;
  }).slice(0, mIdeas);
  const rankOfIdea = new Map(ideaIdx.map((i, r) => [i, r]));
  const ideaTitle = (i) => {
    const inSentence = new Set(prep.content[i].map((t) => t.stem));
    const multi = globalPhrases.find((p) => p.n >= 2 && p.count >= 2 && p.stems.every((st) => inSentence.has(st)));
    if (multi) return cap(multi.surface);
    const head = cleanLead(sentences[i].text).split(/[,:;]| porque | pero | aunque | because | but /i)[0].split(/\s+/).slice(0, 8).join(' ');
    return truncate(head.replace(/[,.;:!?]+$/, ''), 70);
  };
  const ideasPrincipales = [...ideaIdx].sort((x, y) => x - y).map((i) => {
    const r = rankOfIdea.get(i);
    return {
      titulo: ideaTitle(i),
      explicacion: truncate(cleanLead(sentences[i].text), 600),
      importancia: r < 2 ? 'Esencial' : r < 4 ? 'Alta' : 'Clave',
      tiempo: sentences[i].start
    };
  });

  // ---- Frase destacada ----
  let quote = '';
  let bestQ = -1;
  sentences.forEach((s, i) => {
    const f = feat[i];
    if (f.boiler || f.question || f.wc < 8 || f.wc > 28) return;
    const v = score[i] * (1 + (f.summaryCue ? 0.4 : 0) + (f.rec ? 0.2 : 0));
    if (v > bestQ) { bestQ = v; quote = s.text; }
  });

  const topPhrases = pickPhrases(globalPhrases, 3).map((p) => p.surface);
  const lastEnd = Math.max(0, ...segs.map((s) => s.end ?? s.start ?? 0));
  const dur = durationSec && durationSec > 0 ? durationSec : lastEnd > 0 ? lastEnd : null;

  const analysis = {
    tituloDetectado: title || (topPhrases[0] ? `Video sobre ${topPhrases[0]}` : ''),
    canalDetectado: author || '',
    duracionEstimada: dur ? formatDuration(dur) : '',
    tematica: cap(topPhrases.join(', ')),
    resumenEjecutivo: resumen,
    resumenPorSecciones,
    ideasPrincipales,
    consejos,
    recomendaciones,
    recursosMencionados: extractResources(sentences),
    fraseDestacada: truncate(quote, 220)
  };
  return {
    analysis,
    stats: { sentences: N, words, language: lang, lowPunctuation, durationSec: dur, engine: 'local-extractivo' }
  };
}

export { tokenize };
