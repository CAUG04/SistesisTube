// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../src/App.jsx';
import { HISTORY_KEY } from '../../src/storage.js';
import { ANALYSIS, ID_A, ID_B, URL_A, URL_B, analyzeResponse, deferred, fail, mockFetch, ok } from './helpers.jsx';

let user;
beforeEach(() => {
  localStorage.clear();
  user = userEvent.setup();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function setup(handlers) {
  const fetchMock = mockFetch(handlers);
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);
  await waitFor(() => expect(fetchMock.callsTo('/api/health').length).toBe(1));
  return fetchMock;
}
const urlInput = () => screen.getByLabelText('Enlace de YouTube');
const submit = () => user.click(screen.getByRole('button', { name: /Generar Resumen y Claves/ }));
async function analyze(url = URL_A) {
  await user.click(urlInput());
  await user.paste(url);
  await submit();
  await screen.findByTestId('results');
}
const stored = () => JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');

describe('QA · estado inicial', () => {
  it('muestra el formulario, sin resultados ni historial', async () => {
    await setup();
    expect(screen.getByRole('heading', { level: 1, name: /Resumen fiel/ })).toBeInTheDocument();
    expect(screen.queryByTestId('results')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Historial/ })).toBeInTheDocument();
  });

  it('avisa cuando el servidor no tiene GEMINI_API_KEY', async () => {
    await setup({ health: () => ok({ ok: true, geminiConfigured: false }) });
    expect(await screen.findByRole('alert')).toHaveTextContent('GEMINI_API_KEY');
  });

  it('no muestra aviso si el servidor está configurado', async () => {
    await setup();
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});

describe('QA · vista previa del enlace', () => {
  it('al pegar un enlace válido muestra miniatura y título del servidor', async () => {
    await setup();
    await user.click(urlInput());
    await user.paste(URL_A);
    const preview = await screen.findByTestId('video-preview');
    await waitFor(() => expect(within(preview).getByText('Título oEmbed')).toBeInTheDocument(), { timeout: 2000 });
    expect(within(preview).getByRole('presentation', { hidden: true }) ?? preview.querySelector('img')).toBeTruthy();
    expect(preview.querySelector('img').getAttribute('src')).toBe(`https://i.ytimg.com/vi/${ID_A}/hqdefault.jpg`);
  });

  it('con un enlace inválido no hay vista previa ni peticiones de meta', async () => {
    const f = await setup();
    await user.click(urlInput());
    await user.paste('https://vimeo.com/123');
    await new Promise((r) => setTimeout(r, 600));
    expect(screen.queryByTestId('video-preview')).not.toBeInTheDocument();
    expect(f.calls.some((c) => c.path.startsWith('/api/meta/'))).toBe(false);
  });

  it('el botón de borrar limpia el campo', async () => {
    await setup();
    await user.click(urlInput());
    await user.paste(URL_A);
    await user.click(screen.getByRole('button', { name: 'Borrar enlace' }));
    expect(urlInput()).toHaveValue('');
  });
});

describe('QA · análisis', () => {
  it('flujo feliz: llama a /api/analyze, muestra todas las secciones y guarda en el historial', async () => {
    const f = await setup();
    await analyze();

    const req = f.callsTo('/api/analyze')[0];
    expect(req.method).toBe('POST');
    expect(req.body).toEqual({ url: URL_A, focus: 'general' }); // sin transcript si está vacío
    expect(req.init.headers['Content-Type']).toBe('application/json');

    expect(screen.getByRole('heading', { level: 2, name: 'Hábitos que funcionan' })).toBeInTheDocument();
    expect(screen.getByText('Resumen fiel del video sobre hábitos.')).toBeInTheDocument();
    expect(screen.getByText('Idea uno')).toBeInTheDocument();
    expect(screen.getByText('Empieza pequeño')).toBeInTheDocument();
    expect(screen.getByText('Sistema sobre metas')).toBeInTheDocument();
    expect(screen.getByText('Libro X')).toBeInTheDocument();
    expect(screen.getByText(/La constancia gana/)).toBeInTheDocument();

    expect(stored()).toHaveLength(1);
    expect(stored()[0].videoId).toBe(ID_A);
  });

  it('envía el enfoque elegido', async () => {
    const f = await setup();
    await user.click(screen.getByRole('button', { name: '100% Tips y Práctica' }));
    expect(screen.getByRole('button', { name: '100% Tips y Práctica' })).toHaveAttribute('aria-pressed', 'true');
    await analyze();
    expect(f.callsTo('/api/analyze')[0].body.focus).toBe('practico');
  });

  it('envía la transcripción pegada', async () => {
    const f = await setup();
    await user.click(screen.getByRole('button', { name: /Pegar la transcripción/ }));
    await user.click(screen.getByLabelText(/Transcripción del video/));
    await user.paste('Esta es mi transcripción');
    await analyze();
    expect(f.callsTo('/api/analyze')[0].body.transcript).toBe('Esta es mi transcripción');
  });

  it('enlace inválido: muestra error y NO llama a /api/analyze', async () => {
    const f = await setup();
    await user.click(urlInput());
    await user.paste('esto no es un enlace');
    await submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('enlace válido de YouTube');
    expect(f.callsTo('/api/analyze')).toHaveLength(0);
  });

  it('muestra "Analizando..." y bloquea el botón mientras carga', async () => {
    const d = deferred();
    await setup({ analyze: () => d.promise });
    await user.click(urlInput());
    await user.paste(URL_A);
    await submit();
    const btn = await screen.findByRole('button', { name: /Analizando/ });
    expect(btn).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(/transcripción/);
    d.resolve(analyzeResponse(URL_A));
    await screen.findByTestId('results');
    expect(screen.getByRole('button', { name: /Generar Resumen y Claves/ })).toBeEnabled();
  });

  it('NO_TRANSCRIPT: muestra el error, abre el cuadro de transcripción y NO muestra resultados inventados', async () => {
    await setup({ analyze: () => fail(422, 'NO_TRANSCRIPT', 'No se pudo obtener la transcripción de este video.') });
    await user.click(urlInput());
    await user.paste(URL_A);
    await submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo obtener la transcripción');
    expect(screen.getByLabelText(/Transcripción del video/)).toBeInTheDocument();
    expect(screen.queryByTestId('results')).not.toBeInTheDocument();
    expect(stored()).toHaveLength(0);
  });

  it.each([
    ['503 sin clave', () => fail(503, 'NO_API_KEY', 'El servidor no tiene configurada GEMINI_API_KEY.'), 'GEMINI_API_KEY'],
    ['429 límite', () => fail(429, 'RATE_LIMITED', 'Demasiados análisis seguidos. Espera un minuto.'), 'Demasiados análisis'],
    ['502 modelo', () => fail(502, 'BAD_MODEL_OUTPUT', 'El modelo devolvió un resultado con formato inválido.'), 'formato inválido']
  ])('error del servidor (%s): muestra el mensaje y no deja resultados', async (_n, handler, text) => {
    await setup({ analyze: handler });
    await user.click(urlInput());
    await user.paste(URL_A);
    await submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(screen.queryByTestId('results')).not.toBeInTheDocument();
  });

  it('error de red: mensaje claro, la UI sigue usable', async () => {
    await setup({ analyze: () => { throw new TypeError('Failed to fetch'); } });
    await user.click(urlInput());
    await user.paste(URL_A);
    await submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(/No se pudo conectar/);
    expect(screen.getByRole('button', { name: /Generar Resumen y Claves/ })).toBeEnabled();
  });

  it('respuesta con análisis malformado del servidor → error, no pantalla en blanco', async () => {
    await setup({ analyze: () => ok({ meta: {}, analysis: { resumenEjecutivo: '' } }) });
    await user.click(urlInput());
    await user.paste(URL_A);
    await submit();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByTestId('results')).not.toBeInTheDocument();
  });

  it('si cargas un resumen guardado mientras analizas, el resultado tardío no lo pisa', async () => {
    // Historial previo con el video B
    const seeded = [{ videoId: ID_B, title: 'Guardado B', author: 'Autor B', analysis: { ...ANALYSIS, tituloDetectado: 'Video B guardado' }, completedTips: {}, chatMessages: [], date: '2026-01-01T00:00:00.000Z' }];
    localStorage.setItem(HISTORY_KEY, JSON.stringify(seeded));
    const slow = deferred();
    await setup({ analyze: () => slow.promise });

    await user.click(urlInput());
    await user.paste(URL_A);
    await submit(); // A queda pendiente
    expect(await screen.findByRole('button', { name: /Analizando/ })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /Anterior: Video B guardado/ }));
    await screen.findByRole('heading', { level: 2, name: 'Video B guardado' });
    expect(screen.getByRole('button', { name: /Generar Resumen y Claves/ })).toBeEnabled(); // ya no está "Analizando"

    slow.resolve(analyzeResponse(URL_A, { ...ANALYSIS, tituloDetectado: 'Video A (tardío)' }));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText('Video A (tardío)', { selector: 'h2' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Video B guardado' })).toBeInTheDocument();
    expect(stored().map((e) => e.videoId)).toEqual([ID_B]); // el análisis cancelado no se guarda
  });

  it('indica cuando la transcripción fue recortada o pegada por el usuario', async () => {
    await setup({ analyze: (b) => analyzeResponse(b.url, ANALYSIS, { truncated: true, source: 'user-provided' }) });
    await analyze();
    expect(screen.getByText(/solo la primera parte/)).toBeInTheDocument();
    expect(screen.getByText(/transcripción que pegaste/)).toBeInTheDocument();
  });
});

describe('QA · pestañas, consejos y exportación', () => {
  it('las pestañas filtran las secciones', async () => {
    await setup();
    await analyze();
    await user.click(screen.getByRole('tab', { name: /Ideas Principales/ }));
    expect(screen.getByText('Idea uno')).toBeInTheDocument();
    expect(screen.queryByText('Empieza pequeño')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Ideas Principales/ })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: /Consejos/ }));
    expect(screen.getByText('Empieza pequeño')).toBeInTheDocument();
    expect(screen.queryByText('Idea uno')).not.toBeInTheDocument();
  });

  it('marcar un consejo lo persiste en el historial y se puede desmarcar', async () => {
    await setup();
    await analyze();
    const box = screen.getByRole('checkbox', { name: /Empieza pequeño/ });
    expect(box).toHaveAttribute('aria-checked', 'false');
    await user.click(box);
    expect(box).toHaveAttribute('aria-checked', 'true');
    await waitFor(() => expect(stored()[0].completedTips).toEqual({ 0: true }));
    await user.click(box);
    await waitFor(() => expect(stored()[0].completedTips).toEqual({ 0: false }));
  });

  it('"Copiar Todo" copia el informe en Markdown', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await setup();
    await analyze();
    await user.click(screen.getByRole('button', { name: /Copiar Todo/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0][0]).toContain('# RESUMEN DE VIDEO: Hábitos que funcionan');
    expect(await screen.findByText('¡Copiado!')).toBeInTheDocument();
  });

  it('"Descargar (.MD)" crea un Blob y un nombre de archivo seguro', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const names = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { names.push(this.download); });
    await setup();
    await analyze();
    await user.click(screen.getByRole('button', { name: /Descargar/ }));
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect(names[0]).toBe('resumen-habitos-que-funcionan.md');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
    click.mockRestore();
  });

  it('lectura en voz alta: inicia y detiene', async () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    vi.stubGlobal('speechSynthesis', { speak, cancel });
    window.speechSynthesis = { speak, cancel };
    vi.stubGlobal('SpeechSynthesisUtterance', function (t) { this.text = t; });
    await setup();
    await analyze();
    await user.click(screen.getByRole('button', { name: /Escuchar Resumen/ }));
    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak.mock.calls[0][0].text).toContain('Hábitos que funcionan');
    expect(speak.mock.calls[0][0].lang).toBe('es-ES');
    await user.click(screen.getByRole('button', { name: /Detener Voz/ }));
    expect(cancel).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Escuchar Resumen/ })).toBeInTheDocument();
  });

  it('sin soporte de voz el botón no rompe la app', async () => {
    delete window.speechSynthesis;
    await setup();
    await analyze();
    await user.click(screen.getByRole('button', { name: /Escuchar Resumen/ }));
    expect(screen.getByTestId('results')).toBeInTheDocument();
  });
});

describe('QA · chat con el modelo', () => {
  async function openChat(handlers) {
    const f = await setup(handlers);
    await analyze();
    await user.click(screen.getByRole('tab', { name: /Chat con el Video/ }));
    return f;
  }
  const ask = async (text) => {
    await user.click(screen.getByLabelText('Tu pregunta sobre el video'));
    await user.paste(text);
    await user.click(screen.getByRole('button', { name: /Enviar/ }));
  };

  it('envía el análisis y los mensajes al servidor (sin el saludo) y muestra la respuesta REAL', async () => {
    const f = await openChat({ chat: () => ok({ reply: 'Porque la constancia compone.' }) });
    await ask('¿Por qué importa la constancia?');
    expect(await screen.findByText('Porque la constancia compone.')).toBeInTheDocument();
    const req = f.callsTo('/api/chat')[0];
    expect(req.body.videoId).toBe(ID_A);
    expect(req.body.analysis.resumenEjecutivo).toBe(ANALYSIS.resumenEjecutivo);
    expect(req.body.messages).toEqual([{ role: 'user', text: '¿Por qué importa la constancia?' }]);
  });

  it('no es una respuesta enlatada: distintas preguntas → distintas respuestas del servidor', async () => {
    let n = 0;
    await openChat({ chat: () => ok({ reply: `respuesta-${++n}` }) });
    await ask('primera');
    await screen.findByText('respuesta-1');
    await ask('segunda');
    await screen.findByText('respuesta-2');
  });

  it('en el segundo turno envía el historial alternado', async () => {
    const f = await openChat();
    await ask('uno');
    await screen.findByText('Respuesta del asistente');
    await ask('dos');
    await waitFor(() => expect(f.callsTo('/api/chat')).toHaveLength(2));
    expect(f.callsTo('/api/chat')[1].body.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
  });

  it('muestra el error del servidor en el chat y no lo guarda en el historial', async () => {
    await openChat({ chat: () => fail(429, 'RATE_LIMITED', 'Demasiados análisis seguidos. Espera un minuto.') });
    await ask('hola');
    expect(await screen.findByText(/Demasiados análisis seguidos/)).toBeInTheDocument();
    await waitFor(() => expect(stored()[0].chatMessages.some((m) => /Demasiados/.test(m.text))).toBe(false));
  });

  it('un error no rompe el siguiente turno (no envía el mensaje fallido como asistente)', async () => {
    let n = 0;
    const f = await openChat({ chat: () => (++n === 1 ? fail(502, 'UPSTREAM_ERROR', 'El modelo devolvió un error.') : ok({ reply: 'ya funciona' })) });
    await ask('uno');
    await screen.findByText('El modelo devolvió un error.');
    await ask('dos');
    await screen.findByText('ya funciona');
    expect(f.callsTo('/api/chat')[1].body.messages).toEqual([{ role: 'user', text: 'uno\ndos' }]);
  });

  it('no envía mensajes vacíos y deshabilita el botón', async () => {
    const f = await openChat();
    const btn = screen.getByRole('button', { name: /Enviar/ });
    expect(btn).toBeDisabled();
    await user.click(screen.getByLabelText('Tu pregunta sobre el video'));
    await user.paste('   ');
    expect(btn).toBeDisabled();
    expect(f.callsTo('/api/chat')).toHaveLength(0);
  });

  it('el chat se guarda en el historial y se restaura', async () => {
    await openChat({ chat: () => ok({ reply: 'respuesta guardada' }) });
    await ask('pregunta guardada');
    await screen.findByText('respuesta guardada');
    await waitFor(() => expect(stored()[0].chatMessages.map((m) => m.text)).toContain('respuesta guardada'));
  });

  it('si el usuario cambia de video mientras se responde, la respuesta tardía no se mezcla', async () => {
    const slow = deferred();
    let call = 0;
    await openChat({ chat: () => (++call === 1 ? slow.promise : ok({ reply: 'x' })) });
    await ask('pregunta de A');
    // Analiza el video B mientras el chat de A sigue pendiente
    await user.clear(urlInput());
    await user.paste(URL_B);
    await submit();
    await screen.findByTestId('results');
    slow.resolve(ok({ reply: 'RESPUESTA TARDÍA DE A' }));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText('RESPUESTA TARDÍA DE A')).not.toBeInTheDocument();
  });
});

describe('QA · historial', () => {
  const twoVideos = async () => {
    const f = await setup({
      analyze: (b) => analyzeResponse(b.url, { ...ANALYSIS, tituloDetectado: b.url.includes(ID_A) ? 'Video Alfa' : 'Video Beta', tematica: b.url.includes(ID_A) ? 'Ciencia' : 'Cocina' })
    });
    await analyze(URL_A);
    await user.clear(urlInput());
    await analyze(URL_B);
    return f;
  };

  it('acumula videos, el más reciente primero, con contador en la cabecera', async () => {
    await twoVideos();
    expect(stored().map((e) => e.videoId)).toEqual([ID_B, ID_A]);
    await user.click(screen.getByRole('button', { name: /Historial/ }));
    const list = await screen.findByTestId('history-list');
    const titles = within(list).getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(titles).toEqual(['Video Beta', 'Video Alfa']);
  });

  it('re-analizar el mismo video no duplica la entrada', async () => {
    await setup();
    await analyze(URL_A);
    await submit();
    await screen.findByTestId('results');
    expect(stored()).toHaveLength(1);
  });

  it('busca por título, temática y texto; sin coincidencias lo indica', async () => {
    await twoVideos();
    await user.click(screen.getByRole('button', { name: /Historial/ }));
    const search = await screen.findByLabelText('Buscar en el historial');
    await user.type(search, 'cocina');
    expect(within(screen.getByTestId('history-list')).getAllByRole('heading', { level: 3 })).toHaveLength(1);
    expect(screen.getByText('Video Beta')).toBeInTheDocument();
    await user.clear(search);
    await user.type(search, 'zzz-nada');
    expect(screen.getByText(/No se encontraron videos/)).toBeInTheDocument();
  });

  it('la búsqueda con caracteres de regex no falla', async () => {
    await twoVideos();
    await user.click(screen.getByRole('button', { name: /Historial/ }));
    await user.click(await screen.findByLabelText('Buscar en el historial'));
    await user.paste('([.*+?');
    expect(screen.getByText(/No se encontraron videos/)).toBeInTheDocument();
  });

  it('cargar una entrada restaura análisis, consejos marcados y enlace', async () => {
    await twoVideos();
    await user.click(screen.getByRole('checkbox', { name: /Empieza pequeño/ })); // marca en B
    await user.click(screen.getByRole('button', { name: /Historial/ }));
    await user.click(within(await screen.findByTestId('history-list')).getByRole('button', { name: /Video Alfa/ }));
    await screen.findByRole('heading', { level: 2, name: 'Video Alfa' });
    expect(urlInput()).toHaveValue(URL_A);
    expect(screen.getByRole('checkbox', { name: /Empieza pequeño/ })).toHaveAttribute('aria-checked', 'false');
    // volver a B conserva lo marcado
    await user.click(screen.getByRole('button', { name: /Volver al resumen anterior/ }));
    await screen.findByRole('heading', { level: 2, name: 'Video Beta' });
    expect(screen.getByRole('checkbox', { name: /Empieza pequeño/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('"Volver al resumen anterior" aparece con 2+ videos y carga el previo', async () => {
    await twoVideos();
    const back = screen.getByRole('button', { name: /Volver al resumen anterior/ });
    await user.click(back);
    expect(await screen.findByRole('heading', { level: 2, name: 'Video Alfa' })).toBeInTheDocument();
  });

  it('un historial persistido se recarga al abrir la app', async () => {
    await twoVideos();
    cleanup();
    await setup();
    expect(screen.getByRole('button', { name: /Historial/ })).toHaveTextContent('2');
    expect(screen.getByRole('button', { name: /Anterior: Video Beta/ })).toBeInTheDocument();
  });

  it('"Limpiar todo" pide confirmación y borra también el almacenamiento', async () => {
    await twoVideos();
    await user.click(screen.getByRole('button', { name: /Historial/ }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    await user.click(await screen.findByRole('button', { name: /Limpiar todo/ }));
    expect(stored()).toHaveLength(2); // canceló
    await user.click(screen.getByRole('button', { name: /Limpiar todo/ }));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(await screen.findByText(/historial aún está vacío/)).toBeInTheDocument();
    expect(localStorage.getItem(HISTORY_KEY)).toBeNull();
  });

  it('historial vacío ofrece volver al analizador', async () => {
    await setup();
    await user.click(screen.getByRole('button', { name: /Historial/ }));
    await user.click(await screen.findByRole('button', { name: /Analizar un video ahora/ }));
    expect(screen.getByLabelText('Enlace de YouTube')).toBeInTheDocument();
  });
});
