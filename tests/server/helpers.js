import { vi } from 'vitest';
import { createApp } from '../../server/app.js';
import { createGeminiClient } from '../../server/gemini.js';

export const API_KEY = 'AIzaSyTEST-SECRET-KEY-1234567890';
export const VIDEO_ID = 'dQw4w9WgXcQ';
export const VIDEO_URL = `https://www.youtube.com/watch?v=${VIDEO_ID}`;

export const sampleAnalysis = {
  tituloDetectado: 'Título del modelo',
  canalDetectado: 'Canal del modelo',
  duracionEstimada: '',
  tematica: 'Productividad',
  resumenEjecutivo: 'Un resumen fiel de la transcripción.',
  resumenPorSecciones: [{ seccion: 'Intro', detalle: 'Presenta el tema.' }],
  ideasPrincipales: [{ titulo: 'Idea 1', explicacion: 'Explicación 1', importancia: 'Esencial' }],
  consejos: [{ consejo: 'Consejo 1', comoAplicarlo: 'Hazlo así', categoria: 'Hábito' }],
  recomendaciones: [{ recomendacion: 'Rec 1', porQueImporta: 'Porque sí', accionInmediata: 'Hoy' }],
  recursosMencionados: ['Libro X'],
  fraseDestacada: 'Una frase.'
};

// Respuesta con la forma real de la API de Gemini.
export const geminiReply = (payload) => ({
  ok: true,
  status: 200,
  json: async () => ({
    candidates: [{ content: { parts: [{ text: typeof payload === 'string' ? payload : JSON.stringify(payload) }] } }]
  })
});

export function buildApp({
  fetchImpl = vi.fn(async () => geminiReply(sampleAnalysis)),
  apiKey = API_KEY,
  getTranscript = vi.fn(async () => ({ text: 'Texto de la transcripción real.', truncated: false })),
  getVideoMeta = vi.fn(async () => ({ title: 'Título oEmbed', author: 'Autor oEmbed' })),
  ...rest
} = {}) {
  const gemini = createGeminiClient({ apiKey, fetchImpl });
  const app = createApp({ gemini, getTranscript, getVideoMeta, limits: { general: 1000, heavy: 1000 }, ...rest });
  return { app, gemini, fetchImpl, getTranscript, getVideoMeta };
}

export const body = (call) => JSON.parse(call[1].body);
