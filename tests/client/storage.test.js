// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HISTORY_KEY, MAX_HISTORY, buildMeta, loadHistory, persistHistory, sanitizeHistory, toApiMessages, upsertHistory } from '../../src/storage.js';
import { ANALYSIS, ID_A, ID_B } from './helpers.jsx';

const entry = (videoId = ID_A, over = {}) => ({ videoId, title: 'T', author: 'A', analysis: ANALYSIS, completedTips: {}, chatMessages: [], date: '2026-01-01T00:00:00.000Z', ...over });

beforeEach(() => localStorage.clear());

describe('storage · sanitizeHistory (seguridad)', () => {
  it('descarta entradas con videoId inválido', () => {
    const out = sanitizeHistory([entry('javascript:1'), entry('<script>'), entry(ID_A)]);
    expect(out.map((e) => e.videoId)).toEqual([ID_A]);
  });

  it('reconstruye thumbnail y url desde el ID: ignora valores maliciosos guardados', () => {
    const evil = { ...entry(ID_A), meta: { thumbnail: 'javascript:alert(1)', url: 'javascript:alert(2)' }, thumbnail: 'javascript:alert(1)', url: 'https://evil.example' };
    const [e] = sanitizeHistory([evil]);
    expect(e.meta.thumbnail).toBe(`https://i.ytimg.com/vi/${ID_A}/hqdefault.jpg`);
    expect(e.meta.url).toBe(`https://www.youtube.com/watch?v=${ID_A}`);
    expect(JSON.stringify(e)).not.toContain('javascript:');
    expect(JSON.stringify(e)).not.toContain('evil.example');
  });

  it.each([[null], [undefined], ['texto'], [42], [{}], [{ a: 1 }]])('entrada no-array %j → []', (raw) => {
    expect(sanitizeHistory(raw)).toEqual([]);
  });

  it('descarta entradas sin análisis válido o con tipos incorrectos', () => {
    const out = sanitizeHistory([entry(ID_A, { analysis: { resumenEjecutivo: '' } }), entry(ID_B, { analysis: 'nope' }), entry(ID_A, { completedTips: { 0: 'sí' } }), null, 7, 'x']);
    expect(out).toEqual([]);
  });

  it('limita el tamaño del historial', () => {
    const many = Array.from({ length: 60 }, () => entry(ID_A));
    expect(sanitizeHistory(many).length).toBeLessThanOrEqual(MAX_HISTORY);
  });

  it('descarta claves desconocidas (no se propagan)', () => {
    const [e] = sanitizeHistory([{ ...entry(), isAdmin: true, __proto__x: 1 }]);
    expect(e.isAdmin).toBeUndefined();
  });
});

describe('storage · loadHistory / persistHistory', () => {
  it('JSON corrupto en localStorage → historial vacío sin lanzar', () => {
    localStorage.setItem(HISTORY_KEY, '{no es json');
    expect(loadHistory()).toEqual([]);
  });

  it('borra la API key y el historial del modelo antiguo (migración segura)', () => {
    localStorage.setItem('yt_ai_gemini_key', 'AIzaSyOLD-KEY');
    localStorage.setItem('yt_ai_history_v2', '[{"contenido":"inventado"}]');
    loadHistory();
    expect(localStorage.getItem('yt_ai_gemini_key')).toBeNull();
    expect(localStorage.getItem('yt_ai_history_v2')).toBeNull();
  });

  it('ida y vuelta: lo guardado se recupera igual', () => {
    const [e] = sanitizeHistory([entry()]);
    persistHistory([e]);
    const back = loadHistory();
    expect(back).toHaveLength(1);
    expect(back[0].analysis.resumenEjecutivo).toBe(ANALYSIS.resumenEjecutivo);
    expect(back[0].meta.url).toContain(ID_A);
  });

  it('historial vacío elimina la clave', () => {
    localStorage.setItem(HISTORY_KEY, '[]');
    persistHistory([]);
    expect(localStorage.getItem(HISTORY_KEY)).toBeNull();
  });

  it('no lanza si localStorage está lleno o bloqueado', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    const [e] = sanitizeHistory([entry()]);
    expect(() => persistHistory([e])).not.toThrow();
    spy.mockRestore();
  });

  it('no lanza si getItem falla', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadHistory()).toEqual([]);
    spy.mockRestore();
  });

  it('nunca guarda claves de API en el almacenamiento', () => {
    const [e] = sanitizeHistory([entry()]);
    persistHistory([e]);
    const all = Object.keys(localStorage).map((k) => `${k}=${localStorage.getItem(k)}`).join('\n');
    expect(all).not.toMatch(/AIza|api[_-]?key/i);
  });
});

describe('storage · upsertHistory (QA)', () => {
  const mk = (id, date) => ({ videoId: id, meta: buildMeta(id), analysis: ANALYSIS, completedTips: {}, chatMessages: [], ...(date ? { date } : {}) });

  it('inserta primero y no duplica el mismo video', () => {
    let h = upsertHistory([], mk(ID_A, 'd1'));
    h = upsertHistory(h, mk(ID_B, 'd2'));
    h = upsertHistory(h, mk(ID_A));
    expect(h.map((x) => x.videoId)).toEqual([ID_A, ID_B]);
  });

  it('conserva la fecha original al actualizar', () => {
    const h = upsertHistory([], mk(ID_A, '2026-01-01T00:00:00.000Z'));
    const h2 = upsertHistory(h, { ...mk(ID_A), completedTips: { 0: true } });
    expect(h2[0].date).toBe('2026-01-01T00:00:00.000Z');
    expect(h2[0].completedTips).toEqual({ 0: true });
  });

  it('respeta el máximo', () => {
    let h = [];
    for (let i = 0; i < MAX_HISTORY + 5; i++) h = upsertHistory(h, mk(`${String(i).padStart(11, 'a')}`, `d${i}`));
    expect(h).toHaveLength(MAX_HISTORY);
  });
});

describe('storage · toApiMessages', () => {
  it('descarta el saludo inicial del asistente', () => {
    const out = toApiMessages([{ role: 'assistant', text: 'hola' }, { role: 'user', text: 'pregunta' }]);
    expect(out).toEqual([{ role: 'user', text: 'pregunta' }]);
  });

  it('fusiona mensajes consecutivos del mismo rol para alternar turnos', () => {
    const out = toApiMessages([{ role: 'user', text: 'a' }, { role: 'user', text: 'b' }, { role: 'assistant', text: 'c' }, { role: 'user', text: 'd' }]);
    expect(out.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(out[0].text).toBe('a\nb');
  });

  it('máximo 20 mensajes, empezando por el usuario, y recorta textos', () => {
    const chat = Array.from({ length: 50 }, (_, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', text: 'x'.repeat(3000) }));
    const out = toApiMessages(chat);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out[0].role).toBe('user');
    expect(out.every((m) => m.text.length <= 2000)).toBe(true);
  });
});
