import { vi } from 'vitest';

export const ANALYSIS = {
  tituloDetectado: 'Hábitos que funcionan',
  canalDetectado: 'Canal Demo',
  duracionEstimada: '',
  tematica: 'Productividad',
  resumenEjecutivo: 'Resumen fiel del video sobre hábitos.',
  resumenPorSecciones: [{ seccion: 'Intro', detalle: 'Presenta el tema.' }],
  ideasPrincipales: [{ titulo: 'Idea uno', explicacion: 'Explicación uno', importancia: 'Esencial' }],
  consejos: [
    { consejo: 'Empieza pequeño', comoAplicarlo: 'Dos minutos al día', categoria: 'Hábito' },
    { consejo: 'Mide tu avance', comoAplicarlo: 'Usa un calendario', categoria: 'Técnica' }
  ],
  recomendaciones: [{ recomendacion: 'Sistema sobre metas', porQueImporta: 'Porque escala', accionInmediata: 'Define un ritual' }],
  recursosMencionados: ['Libro X'],
  fraseDestacada: 'La constancia gana.'
};

export const ID_A = 'dQw4w9WgXcQ';
export const ID_B = 'aqz-KE-bpKQ';
export const URL_A = `https://www.youtube.com/watch?v=${ID_A}`;
export const URL_B = `https://www.youtube.com/watch?v=${ID_B}`;

export const ok = (data) => ({ ok: true, status: 200, json: async () => data });
export const fail = (status, code, message) => ({ ok: false, status, json: async () => ({ error: { code, message } }) });

export const analyzeResponse = (url, analysis = ANALYSIS, extra = {}) => {
  const id = (url.match(/v=([\w-]{11})/) || [])[1];
  return ok({
    meta: { id, title: 'Título oEmbed', author: 'Autor oEmbed', thumbnail: 'x', url: 'x' },
    analysis,
    source: 'youtube-captions',
    truncated: false,
    ...extra
  });
};

// fetch simulado por ruta. Cada handler recibe (body, init) y devuelve una respuesta.
export function mockFetch(handlers = {}) {
  const calls = [];
  const fn = vi.fn(async (url, init = {}) => {
    const path = new URL(url, 'http://localhost').pathname;
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url: String(url), path, method: init.method || 'GET', body, init });
    if (path === '/api/health') return (handlers.health ?? (() => ok({ ok: true, geminiConfigured: true })))(body, init);
    if (path.startsWith('/api/meta/')) {
      const id = path.split('/').pop();
      return (handlers.meta ?? (() => ok({ id, title: 'Título oEmbed', author: 'Autor oEmbed' })))(body, init);
    }
    if (path === '/api/analyze') return (handlers.analyze ?? ((b) => analyzeResponse(b.url)))(body, init);
    if (path === '/api/chat') return (handlers.chat ?? (() => ok({ reply: 'Respuesta del asistente' })))(body, init);
    throw new Error(`fetch no esperado: ${url}`);
  });
  fn.calls = calls;
  fn.callsTo = (p) => calls.filter((c) => c.path === p);
  return fn;
}

export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
