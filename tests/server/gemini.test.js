import { describe, it, expect, vi } from 'vitest';
import { createGeminiClient, extractJson } from '../../server/gemini.js';
import { API_KEY, geminiReply, body } from './helpers.js';

const call = (client) =>
  client.generateJson({ system: 's', user: 'u', parse: (j) => j });

describe('cliente Gemini — seguridad de la clave', () => {
  it('envía la clave en el header x-goog-api-key y NUNCA en la URL', async () => {
    const fetchImpl = vi.fn(async () => geminiReply({ ok: 1 }));
    await call(createGeminiClient({ apiKey: API_KEY, fetchImpl }));
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).not.toContain(API_KEY);
    expect(url).not.toContain('key=');
    expect(init.headers['x-goog-api-key']).toBe(API_KEY);
  });

  it('no incluye la clave en el cuerpo enviado', async () => {
    const fetchImpl = vi.fn(async () => geminiReply({ ok: 1 }));
    await call(createGeminiClient({ apiKey: API_KEY, fetchImpl }));
    expect(fetchImpl.mock.calls[0][1].body).not.toContain(API_KEY);
  });

  it('sin clave: lanza NO_API_KEY y no hace ninguna petición', async () => {
    const fetchImpl = vi.fn();
    const client = createGeminiClient({ apiKey: '', fetchImpl });
    expect(client.configured).toBe(false);
    await expect(call(client)).rejects.toMatchObject({ status: 503, code: 'NO_API_KEY' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('el modelo se codifica en la ruta (no permite inyectar segmentos)', async () => {
    const fetchImpl = vi.fn(async () => geminiReply({ ok: 1 }));
    await call(createGeminiClient({ apiKey: API_KEY, model: '../evil?x=1', fetchImpl }));
    const url = fetchImpl.mock.calls[0][0];
    expect(url.startsWith('https://generativelanguage.googleapis.com/v1beta/models/')).toBe(true);
    expect(url).not.toContain('/../');
    expect(url).not.toContain('?x=1');
  });
});

describe('cliente Gemini — manejo de errores (QA)', () => {
  const errClient = (res) => createGeminiClient({ apiKey: API_KEY, fetchImpl: vi.fn(async () => res) });

  it.each([
    [429, 429, 'UPSTREAM_RATE_LIMIT'],
    [401, 502, 'UPSTREAM_AUTH'],
    [403, 502, 'UPSTREAM_AUTH'],
    [500, 502, 'UPSTREAM_ERROR'],
    [400, 502, 'UPSTREAM_ERROR']
  ])('HTTP %i del proveedor → %i %s', async (upstream, status, code) => {
    const client = errClient({ ok: false, status: upstream, json: async () => ({ error: { message: `detalle con ${API_KEY}` } }) });
    const err = await call(client).catch((e) => e);
    expect(err).toMatchObject({ status, code });
    expect(err.message).not.toContain(API_KEY);
    expect(err.message).not.toContain('detalle');
  });

  it('timeout → 504', async () => {
    const e = Object.assign(new Error('t'), { name: 'TimeoutError' });
    const client = createGeminiClient({ apiKey: API_KEY, fetchImpl: vi.fn(async () => { throw e; }) });
    await expect(call(client)).rejects.toMatchObject({ status: 504, code: 'UPSTREAM_TIMEOUT' });
  });

  it('error de red cuyo mensaje contiene la clave no la filtra', async () => {
    const client = createGeminiClient({ apiKey: API_KEY, fetchImpl: vi.fn(async () => { throw new Error(`fail ${API_KEY}`); }) });
    const err = await call(client).catch((e) => e);
    expect(err).toMatchObject({ status: 502, code: 'UPSTREAM_UNREACHABLE' });
    expect(err.message).not.toContain(API_KEY);
  });

  it('contenido bloqueado → 422', async () => {
    const client = errClient({ ok: true, status: 200, json: async () => ({ promptFeedback: { blockReason: 'SAFETY' } }) });
    await expect(call(client)).rejects.toMatchObject({ status: 422, code: 'CONTENT_BLOCKED' });
  });

  it('respuesta vacía → 502', async () => {
    const client = errClient({ ok: true, status: 200, json: async () => ({ candidates: [] }) });
    await expect(call(client)).rejects.toMatchObject({ status: 502, code: 'UPSTREAM_EMPTY' });
  });

  it('JSON inválido: reintenta una vez y luego falla con BAD_MODEL_OUTPUT', async () => {
    const fetchImpl = vi.fn(async () => geminiReply('esto no es json'));
    const client = createGeminiClient({ apiKey: API_KEY, fetchImpl });
    await expect(call(client)).rejects.toMatchObject({ status: 502, code: 'BAD_MODEL_OUTPUT' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('el reintento recupera una respuesta válida', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(geminiReply('basura')).mockResolvedValueOnce(geminiReply({ ok: 2 }));
    const out = await call(createGeminiClient({ apiKey: API_KEY, fetchImpl }));
    expect(out).toEqual({ ok: 2 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('solicita JSON y usa systemInstruction separado del contenido', async () => {
    const fetchImpl = vi.fn(async () => geminiReply({ ok: 1 }));
    await createGeminiClient({ apiKey: API_KEY, fetchImpl }).generateJson({ system: 'SYS', user: 'USR', parse: (j) => j });
    const b = body(fetchImpl.mock.calls[0]);
    expect(b.generationConfig.responseMimeType).toBe('application/json');
    expect(b.systemInstruction.parts[0].text).toBe('SYS');
    expect(b.contents[0].parts[0].text).toBe('USR');
  });
});

describe('extractJson', () => {
  it('JSON directo', () => expect(extractJson('{"a":1}')).toEqual({ a: 1 }));
  it('JSON en bloque de código', () => expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 }));
  it('JSON rodeado de texto', () => expect(extractJson('Claro: {"a":1} listo')).toEqual({ a: 1 }));
  it('lanza si no hay JSON', () => expect(() => extractJson('nada')).toThrow());
});
