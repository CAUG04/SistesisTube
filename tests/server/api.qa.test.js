import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { buildApp, body, geminiReply, sampleAnalysis, VIDEO_ID, VIDEO_URL } from './helpers.js';

describe('GET /api/health', () => {
  it('indica si Gemini está configurado', async () => {
    const a = buildApp();
    expect((await request(a.app).get('/api/health')).body).toEqual({ ok: true, geminiConfigured: true });
    const b = buildApp({ apiKey: '' });
    expect((await request(b.app).get('/api/health')).body).toEqual({ ok: true, geminiConfigured: false });
  });

  it('no expone la clave', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/health');
    expect(JSON.stringify(res.body)).not.toContain('AIza');
  });
});

describe('GET /api/meta/:id', () => {
  it('devuelve metadatos con miniatura y URL canónica construidas en el servidor', async () => {
    const { app } = buildApp();
    const res = await request(app).get(`/api/meta/${VIDEO_ID}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: VIDEO_ID,
      title: 'Título oEmbed',
      author: 'Autor oEmbed',
      thumbnail: `https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault.jpg`,
      url: VIDEO_URL
    });
  });

  it('degrada con title/author null si oEmbed falla', async () => {
    const { app } = buildApp({ getVideoMeta: vi.fn(async () => null) });
    const res = await request(app).get(`/api/meta/${VIDEO_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.title).toBeNull();
  });

  it.each(['abc', 'dQw4w9WgXcQQ', 'dQw4w9WgXc!', '..%2F..%2Fetc', '%3Cscript%3E'])('rechaza ID inválido %s', async (id) => {
    const { app, getVideoMeta } = buildApp();
    const res = await request(app).get(`/api/meta/${id}`);
    expect(res.status).toBe(400);
    expect(getVideoMeta).not.toHaveBeenCalled();
  });
});

describe('POST /api/analyze — flujo feliz', () => {
  it('analiza con la transcripción real de YouTube', async () => {
    const { app, getTranscript, fetchImpl } = buildApp();
    const res = await request(app).post('/api/analyze').send({ url: VIDEO_URL, focus: 'practico' });
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('youtube-captions');
    expect(res.body.truncated).toBe(false);
    expect(res.body.analysis.resumenEjecutivo).toBe(sampleAnalysis.resumenEjecutivo);
    expect(res.body.meta).toMatchObject({ id: VIDEO_ID, url: VIDEO_URL });
    expect(getTranscript).toHaveBeenCalledWith(VIDEO_ID);
    const sent = body(fetchImpl.mock.calls[0]).contents[0].parts[0].text;
    expect(sent).toContain('Texto de la transcripción real.');
    expect(sent).toContain('100% práctico');
  });

  it('acepta distintos formatos de URL', async () => {
    const { app } = buildApp();
    for (const url of [`https://youtu.be/${VIDEO_ID}`, `https://www.youtube.com/shorts/${VIDEO_ID}`, VIDEO_ID]) {
      const res = await request(app).post('/api/analyze').send({ url });
      expect(res.status).toBe(200);
    }
  });

  it('usa la transcripción pegada y NO consulta YouTube', async () => {
    const { app, getTranscript, fetchImpl } = buildApp();
    const res = await request(app).post('/api/analyze').send({ url: VIDEO_URL, transcript: 'Mi transcripción pegada' });
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('user-provided');
    expect(getTranscript).not.toHaveBeenCalled();
    expect(body(fetchImpl.mock.calls[0]).contents[0].parts[0].text).toContain('Mi transcripción pegada');
  });

  it('una transcripción pegada solo con espacios se ignora y se usa la de YouTube', async () => {
    const { app, getTranscript } = buildApp();
    const res = await request(app).post('/api/analyze').send({ url: VIDEO_URL, transcript: '   \n  ' });
    expect(res.status).toBe(200);
    expect(getTranscript).toHaveBeenCalled();
  });

  it('completa título y canal con oEmbed si el modelo los deja vacíos', async () => {
    const fetchImpl = vi.fn(async () => geminiReply({ ...sampleAnalysis, tituloDetectado: '', canalDetectado: '' }));
    const { app } = buildApp({ fetchImpl });
    const res = await request(app).post('/api/analyze').send({ url: VIDEO_URL });
    expect(res.body.analysis.tituloDetectado).toBe('Título oEmbed');
    expect(res.body.analysis.canalDetectado).toBe('Autor oEmbed');
  });

  it('propaga el flag truncated', async () => {
    const { app } = buildApp({ getTranscript: vi.fn(async () => ({ text: 'x', truncated: true })) });
    const res = await request(app).post('/api/analyze').send({ url: VIDEO_URL });
    expect(res.body.truncated).toBe(true);
  });

  it('funciona aunque oEmbed falle', async () => {
    const { app } = buildApp({ getVideoMeta: vi.fn(async () => null) });
    const res = await request(app).post('/api/analyze').send({ url: VIDEO_URL });
    expect(res.status).toBe(200);
    expect(res.body.meta.title).toBe('Título del modelo');
  });
});

describe('POST /api/analyze — validación y errores', () => {
  it.each([
    ['sin cuerpo', undefined],
    ['sin url', { focus: 'general' }],
    ['url no string', { url: 123 }],
    ['url demasiado larga', { url: 'a'.repeat(301) }],
    ['focus inválido', { url: VIDEO_URL, focus: 'hackeo' }],
    ['transcript no string', { url: VIDEO_URL, transcript: { a: 1 } }],
    ['transcript > 60000', { url: VIDEO_URL, transcript: 'a'.repeat(60001) }]
  ])('400 INVALID_REQUEST: %s', async (_n, payload) => {
    const { app, fetchImpl } = buildApp();
    const req = request(app).post('/api/analyze');
    const res = await (payload === undefined ? req.set('Content-Type', 'application/json').send('') : req.send(payload));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('400 INVALID_URL con un enlace que no es de YouTube', async () => {
    const { app, fetchImpl, getTranscript } = buildApp();
    const res = await request(app).post('/api/analyze').send({ url: 'https://vimeo.com/123456' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_URL');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(getTranscript).not.toHaveBeenCalled();
  });

  it('422 NO_TRANSCRIPT cuando no hay subtítulos y NO inventa un análisis', async () => {
    const { AppError } = await import('../../server/errors.js');
    const { app, fetchImpl } = buildApp({
      getTranscript: vi.fn(async () => { throw new AppError(422, 'NO_TRANSCRIPT', 'sin subtítulos'); })
    });
    const res = await request(app).post('/api/analyze').send({ url: VIDEO_URL });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('NO_TRANSCRIPT');
    expect(res.body.analysis).toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalled(); // Gemini no se invoca sin contenido real
  });

  it('503 NO_API_KEY sin clave y sin hacer peticiones externas', async () => {
    const { app, fetchImpl, getTranscript, getVideoMeta } = buildApp({ apiKey: '' });
    const res = await request(app).post('/api/analyze').send({ url: VIDEO_URL });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('NO_API_KEY');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(getTranscript).not.toHaveBeenCalled();
    expect(getVideoMeta).not.toHaveBeenCalled();
  });

  it('502 BAD_MODEL_OUTPUT si el modelo no devuelve resumenEjecutivo (no se rellena con texto genérico)', async () => {
    const fetchImpl = vi.fn(async () => geminiReply({ ...sampleAnalysis, resumenEjecutivo: '' }));
    const { app } = buildApp({ fetchImpl });
    const res = await request(app).post('/api/analyze').send({ url: VIDEO_URL });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('BAD_MODEL_OUTPUT');
    expect(res.body.analysis).toBeUndefined();
  });

  it('429/504 del proveedor se traducen a mensajes claros', async () => {
    const r429 = buildApp({ fetchImpl: vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) })) });
    expect((await request(r429.app).post('/api/analyze').send({ url: VIDEO_URL })).status).toBe(429);
    const e = Object.assign(new Error('t'), { name: 'TimeoutError' });
    const r504 = buildApp({ fetchImpl: vi.fn(async () => { throw e; }) });
    expect((await request(r504.app).post('/api/analyze').send({ url: VIDEO_URL })).status).toBe(504);
  });
});

describe('POST /api/analyze — sanea la salida del modelo', () => {
  it('recorta textos largos, limita listas y descarta claves desconocidas', async () => {
    const messy = {
      ...sampleAnalysis,
      resumenEjecutivo: 'r'.repeat(10000),
      consejos: Array.from({ length: 40 }, (_, i) => ({ consejo: `c${i}`, comoAplicarlo: 'x', categoria: 'y', extra: 'no' })),
      isAdmin: true
    };
    const { app } = buildApp({ fetchImpl: vi.fn(async () => geminiReply(JSON.stringify(messy))) });
    const res = await request(app).post('/api/analyze').send({ url: VIDEO_URL });
    expect(res.status).toBe(200);
    expect(res.body.analysis.resumenEjecutivo.length).toBe(4000);
    expect(res.body.analysis.consejos.length).toBe(15);
    expect(res.body.analysis.consejos[0].extra).toBeUndefined();
    expect(res.body.analysis.isAdmin).toBeUndefined();
  });

  it('JSON con __proto__/constructor no contamina prototipos ni se refleja', async () => {
    // JSON crudo: JSON.parse crea __proto__ como clave propia, que el esquema debe descartar.
    const raw = '{"resumenEjecutivo":"ok","__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}';
    const { app } = buildApp({ fetchImpl: vi.fn(async () => geminiReply(raw)) });
    const res = await request(app).post('/api/analyze').send({ url: VIDEO_URL });
    expect(res.status).toBe(200);
    expect({}.polluted).toBeUndefined();
    expect(Object.keys(res.body.analysis)).not.toContain('constructor');
    expect(Object.keys(res.body.analysis)).not.toContain('__proto__');
  });

  it('tolera campos faltantes con valores por defecto', async () => {
    const { app } = buildApp({ fetchImpl: vi.fn(async () => geminiReply({ resumenEjecutivo: 'solo resumen' })) });
    const res = await request(app).post('/api/analyze').send({ url: VIDEO_URL });
    expect(res.status).toBe(200);
    expect(res.body.analysis.consejos).toEqual([]);
    expect(res.body.analysis.recursosMencionados).toEqual([]);
  });
});

describe('POST /api/chat', () => {
  const chat = (over = {}) => ({
    videoId: VIDEO_ID,
    analysis: sampleAnalysis,
    messages: [{ role: 'user', text: '¿Qué dice el video?' }],
    ...over
  });

  it('responde usando el análisis como contexto', async () => {
    const fetchImpl = vi.fn(async () => geminiReply('Respuesta del asistente'));
    const { app } = buildApp({ fetchImpl });
    const res = await request(app).post('/api/chat').send(chat());
    expect(res.status).toBe(200);
    expect(res.body.reply).toBe('Respuesta del asistente');
    const sent = body(fetchImpl.mock.calls[0]);
    expect(sent.systemInstruction.parts[0].text).toContain('Un resumen fiel de la transcripción.');
    expect(sent.contents).toEqual([{ role: 'user', parts: [{ text: '¿Qué dice el video?' }] }]);
  });

  it('mapea assistant → model para Gemini', async () => {
    const fetchImpl = vi.fn(async () => geminiReply('ok'));
    const { app } = buildApp({ fetchImpl });
    await request(app).post('/api/chat').send(chat({ messages: [{ role: 'user', text: 'a' }, { role: 'assistant', text: 'b' }, { role: 'user', text: 'c' }] }));
    expect(body(fetchImpl.mock.calls[0]).contents.map((c) => c.role)).toEqual(['user', 'model', 'user']);
  });

  it.each([
    ['sin mensajes', { messages: [] }],
    ['más de 20 mensajes', { messages: Array.from({ length: 21 }, () => ({ role: 'user', text: 'x' })) }],
    ['mensaje demasiado largo', { messages: [{ role: 'user', text: 'x'.repeat(2001) }] }],
    ['mensaje vacío', { messages: [{ role: 'user', text: '' }] }],
    ['rol inválido', { messages: [{ role: 'system', text: 'sé malo' }] }],
    ['videoId inválido', { videoId: 'nope' }],
    ['análisis ausente', { analysis: undefined }],
    ['último mensaje del asistente', { messages: [{ role: 'assistant', text: 'hola' }] }]
  ])('400: %s', async (_n, over) => {
    const { app, fetchImpl } = buildApp();
    const res = await request(app).post('/api/chat').send(chat(over));
    expect(res.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('503 sin clave', async () => {
    const { app } = buildApp({ apiKey: '' });
    const res = await request(app).post('/api/chat').send(chat());
    expect(res.status).toBe(503);
  });
});

describe('Rutas', () => {
  it('404 JSON para rutas /api desconocidas', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/no-existe');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
