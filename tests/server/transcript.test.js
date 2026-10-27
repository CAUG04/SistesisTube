import { describe, it, expect, vi } from 'vitest';
import {
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptNotAvailableLanguageError,
  YoutubeTranscriptTooManyRequestError
} from 'youtube-transcript';
import { getTranscript, getVideoMeta, MAX_TRANSCRIPT_CHARS } from '../../server/transcript.js';

const seg = (text) => ({ text, duration: 1, offset: 0 });

describe('getTranscript (QA)', () => {
  it('une los segmentos y normaliza espacios', async () => {
    const fetcher = vi.fn(async () => [seg('Hola  mundo'), seg('\nsegunda   línea')]);
    const r = await getTranscript('dQw4w9WgXcQ', { fetcher });
    expect(r).toEqual({ text: 'Hola mundo segunda línea', truncated: false });
  });

  it('prefiere español; si no existe prueba inglés; luego cualquier idioma', async () => {
    const langErr = () => new YoutubeTranscriptNotAvailableLanguageError('x', ['fr'], 'id');
    const fetcher = vi.fn().mockRejectedValueOnce(langErr()).mockRejectedValueOnce(langErr()).mockResolvedValueOnce([seg('bonjour')]);
    const r = await getTranscript('dQw4w9WgXcQ', { fetcher });
    expect(r.text).toBe('bonjour');
    expect(fetcher.mock.calls.map((c) => c[1]?.lang)).toEqual(['es', 'en', undefined]);
  });

  it('subtítulos desactivados → NO_TRANSCRIPT (422)', async () => {
    const fetcher = vi.fn(async () => { throw new YoutubeTranscriptDisabledError('dQw4w9WgXcQ'); });
    await expect(getTranscript('dQw4w9WgXcQ', { fetcher })).rejects.toMatchObject({ status: 422, code: 'NO_TRANSCRIPT' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('demasiadas solicitudes → TRANSCRIPT_BUSY (503)', async () => {
    const fetcher = vi.fn(async () => { throw new YoutubeTranscriptTooManyRequestError(); });
    await expect(getTranscript('dQw4w9WgXcQ', { fetcher })).rejects.toMatchObject({ status: 503, code: 'TRANSCRIPT_BUSY' });
  });

  it('transcripción vacía → NO_TRANSCRIPT', async () => {
    const fetcher = vi.fn(async () => [seg('   '), seg('')]);
    await expect(getTranscript('dQw4w9WgXcQ', { fetcher })).rejects.toMatchObject({ code: 'NO_TRANSCRIPT' });
  });

  it('recorta transcripciones enormes y marca truncated', async () => {
    const fetcher = vi.fn(async () => [seg('a'.repeat(MAX_TRANSCRIPT_CHARS + 5000))]);
    const r = await getTranscript('dQw4w9WgXcQ', { fetcher });
    expect(r.truncated).toBe(true);
    expect(r.text.length).toBe(MAX_TRANSCRIPT_CHARS);
  });

  it('un error desconocido no filtra su mensaje', async () => {
    const fetcher = vi.fn(async () => { throw new Error('SECRETO-INTERNO'); });
    const err = await getTranscript('dQw4w9WgXcQ', { fetcher }).catch((e) => e);
    expect(err.code).toBe('NO_TRANSCRIPT');
    expect(err.message).not.toContain('SECRETO-INTERNO');
  });
});

describe('getVideoMeta', () => {
  it('consulta solo el oEmbed oficial de YouTube con el ID codificado', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ title: 'T', author_name: 'A' }) }));
    const m = await getVideoMeta('dQw4w9WgXcQ', { fetchImpl });
    expect(m).toEqual({ title: 'T', author: 'A' });
    const url = new URL(fetchImpl.mock.calls[0][0]);
    expect(url.origin).toBe('https://www.youtube.com');
    expect(url.pathname).toBe('/oembed');
  });

  it('devuelve null (sin lanzar) si falla la red o la respuesta no es ok', async () => {
    expect(await getVideoMeta('dQw4w9WgXcQ', { fetchImpl: vi.fn(async () => { throw new Error('x'); }) })).toBeNull();
    expect(await getVideoMeta('dQw4w9WgXcQ', { fetchImpl: vi.fn(async () => ({ ok: false })) })).toBeNull();
  });

  it('recorta títulos desproporcionados e ignora tipos inesperados', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ title: 'x'.repeat(5000), author_name: { evil: true } }) }));
    const m = await getVideoMeta('dQw4w9WgXcQ', { fetchImpl });
    expect(m.title.length).toBe(300);
    expect(m.author).toBeNull();
  });
});
