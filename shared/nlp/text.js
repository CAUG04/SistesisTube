import { STOP_ES, STOP_EN } from './lexicon.js';

// minúsculas + sin tildes (conserva la ñ)
export function fold(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/ñ/g, '\u0001')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\u0001/g, 'ñ');
}

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ' };
export function decodeEntities(s) {
  return s.replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (m) => ENTITIES[m] ?? m);
}

// Limpia texto de transcripción: control chars, etiquetas de sonido, marcadores de hablante.
export function cleanText(s) {
  return decodeEntities(String(s ?? ''))
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏﻿]/g, '')
    .replace(/[\[(【]\s*(m[uú]sica|music|aplausos|applause|risas|laughter|silencio|silence|ruido|noise|inaudible|__+)\s*[\])】]/gi, ' ')
    .replace(/[♪♫]+/g, ' ')
    .replace(/(^|\s)>>+\s*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function wordCount(s) {
  const m = String(s).match(/[\p{L}\p{N}]+/gu);
  return m ? m.length : 0;
}

export function detectLanguage(text) {
  const toks = fold(text).match(/[a-zñ]+/g) || [];
  let es = 0;
  let en = 0;
  for (const t of toks.slice(0, 4000)) {
    if (STOP_ES.has(t)) es++;
    if (STOP_EN.has(t)) en++;
  }
  return en > es * 1.15 ? 'en' : 'es';
}

const SUF_ES = ['amientos', 'imientos', 'amiento', 'imiento', 'aciones', 'adores', 'idades', 'acion', 'ador', 'idad', 'mente', 'ando', 'iendo', 'ados', 'adas', 'idos', 'idas', 'ado', 'ada', 'ido', 'ida', 'ar', 'er', 'ir', 'os', 'as', 'es', 's', 'a', 'o', 'e'];
const SUF_EN = ['ations', 'ation', 'ments', 'ment', 'ness', 'ingly', 'ing', 'ies', 'ied', 'ed', 'ly', 'es', 's'];
export function stem(tok, lang) {
  const list = lang === 'en' ? SUF_EN : SUF_ES;
  for (const suf of list) {
    if (tok.length - suf.length >= 4 && tok.endsWith(suf)) return tok.slice(0, -suf.length);
  }
  return tok;
}

// Tokens con forma original (raw), plegada (norm) y raíz (stem).
export function tokenize(text, lang) {
  const out = [];
  const re = /[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu;
  let m;
  while ((m = re.exec(text))) {
    const raw = m[0];
    const norm = fold(raw);
    out.push({ raw, norm, stem: stem(norm, lang), pos: m.index });
  }
  return out;
}

export const isStop = (norm, lang) => (lang === 'en' ? STOP_EN : STOP_ES).has(norm);
export const isContent = (t, lang) => t.norm.length >= 3 && !isStop(t.norm, lang) && !/^\d+$/.test(t.norm);

const ABBR = new Set(['sr', 'sra', 'srta', 'dr', 'dra', 'prof', 'ud', 'uds', 'etc', 'vs', 'mr', 'mrs', 'ms', 'jr', 'ej', 'aprox', 'pag', 'pp', 'fig', 'cap', 'vol', 'inc', 'ltd', 'st', 'no', 'num', 'tel', 'dept', 'gral']);

// Devuelve [{ text, index }] donde index es la posición de la frase dentro de `text`.
export function splitSentences(text) {
  const out = [];
  const n = text.length;
  let start = 0;
  const push = (end) => {
    const raw = text.slice(start, end);
    const lead = raw.length - raw.trimStart().length;
    const t = raw.trim();
    if (t) out.push({ text: t, index: start + lead });
    start = end;
  };
  for (let i = 0; i < n; i++) {
    const c = text[i];
    if (c !== '.' && c !== '!' && c !== '?' && c !== '…') continue;
    let j = i + 1;
    while (j < n && /[.!?…]/.test(text[j])) j++;
    while (j < n && /["'”’)\]»]/.test(text[j])) j++;
    if (j < n && !/\s/.test(text[j])) {
      i = j - 1;
      continue; // "3.5", "u.s.a", urls
    }
    let k = j;
    while (k < n && /\s/.test(text[k])) k++;
    const next = text[k];
    const endsText = k >= n;
    if (c === '.') {
      const before = text.slice(Math.max(0, i - 6), i).match(/([\p{L}]+)$/u);
      if (before && ABBR.has(fold(before[1])) && !endsText) {
        i = j - 1;
        continue;
      }
      if (/^[a-zñ]/.test(next ?? '') && !endsText) {
        i = j - 1;
        continue; // sigue en minúscula: no es fin de frase
      }
    }
    if (!endsText && !/[\p{Lu}\p{N}¿¡"“«(\[]/u.test(next) && c !== '?' && c !== '!') {
      i = j - 1;
      continue;
    }
    push(j);
    i = j - 1;
  }
  push(n);
  return out;
}

// Para texto sin puntuación: trozos de ~targetWords palabras, cortando preferentemente en comas/conectores.
export function chunkByWords(text, targetWords = 24) {
  const words = text.split(/\s+/).filter(Boolean);
  const out = [];
  let i = 0;
  let idx = 0;
  while (i < words.length) {
    let end = Math.min(words.length, i + targetWords);
    if (end < words.length) {
      for (let k = end; k > i + Math.floor(targetWords * 0.6); k--) {
        if (/[,;:]$/.test(words[k - 1]) || /^(y|pero|porque|entonces|que|and|but|because|so|then)$/i.test(words[k] ?? '')) {
          end = k;
          break;
        }
      }
    }
    const t = words.slice(i, end).join(' ');
    out.push({ text: t, index: text.indexOf(words[i], idx) });
    idx = out[out.length - 1].index + 1;
    i = end;
  }
  return out;
}
