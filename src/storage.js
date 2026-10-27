import { z } from 'zod';
import { analysisSchema } from '../shared/analysisSchema.js';
import { isValidVideoId, canonicalUrl } from '../shared/videoId.js';

export const HISTORY_KEY = 'yt_ai_history_v3';
export const MAX_HISTORY = 25;
const LEGACY_KEYS = ['yt_ai_gemini_key', 'yt_ai_history_v2'];

const chatMsg = z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(4000) });
const entrySchema = z.object({
  videoId: z.string().refine(isValidVideoId),
  title: z.string().max(300).optional().default(''),
  author: z.string().max(200).optional().default(''),
  analysis: analysisSchema,
  completedTips: z.record(z.string(), z.boolean()).optional().default({}),
  chatMessages: z.array(chatMsg).max(60).optional().default([]),
  date: z.string().max(40).optional().default('')
});

// Reconstruye meta SOLO a partir del ID validado: nunca se confía en URLs guardadas.
export function buildMeta(id, title, author) {
  return {
    id,
    title: title || `Video de YouTube (${id})`,
    author: author || 'YouTube',
    thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    url: canonicalUrl(id)
  };
}

export function sanitizeHistory(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    const r = entrySchema.safeParse(item);
    if (!r.success) continue;
    const e = r.data;
    out.push({
      id: e.videoId,
      videoId: e.videoId,
      meta: buildMeta(e.videoId, e.title, e.author),
      analysis: e.analysis,
      completedTips: e.completedTips,
      chatMessages: e.chatMessages,
      date: e.date
    });
    if (out.length >= MAX_HISTORY) break;
  }
  return out;
}

export function upsertHistory(history, entry) {
  const existing = history.find((h) => h.videoId === entry.videoId);
  const withDate = { ...entry, id: entry.videoId, date: entry.date || existing?.date || new Date().toISOString() };
  return [withDate, ...history.filter((h) => h.videoId !== entry.videoId)].slice(0, MAX_HISTORY);
}

function serialize(history) {
  return history.map((h) => ({
    videoId: h.videoId,
    title: h.meta.title,
    author: h.meta.author,
    analysis: h.analysis,
    completedTips: h.completedTips,
    chatMessages: h.chatMessages,
    date: h.date
  }));
}

export function loadHistory() {
  try {
    for (const k of LEGACY_KEYS) localStorage.removeItem(k); // borra la API key y datos del modelo antiguo
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? sanitizeHistory(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function persistHistory(history) {
  try {
    if (history.length === 0) localStorage.removeItem(HISTORY_KEY);
    else localStorage.setItem(HISTORY_KEY, JSON.stringify(serialize(history)));
  } catch {
    /* almacenamiento lleno o bloqueado */
  }
}

// Mensajes para la API: sin saludo inicial del asistente, alternando roles y máx. 20.
export function toApiMessages(chat) {
  const msgs = [];
  for (const m of chat) {
    if (msgs.length === 0 && m.role === 'assistant') continue;
    const last = msgs[msgs.length - 1];
    if (last && last.role === m.role) last.text += `\n${m.text}`;
    else msgs.push({ role: m.role, text: m.text });
  }
  const tail = msgs.slice(-20);
  while (tail.length && tail[0].role === 'assistant') tail.shift();
  return tail.map((m) => ({ ...m, text: m.text.slice(0, 2000) }));
}
