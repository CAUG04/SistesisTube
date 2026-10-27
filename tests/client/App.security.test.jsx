// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../src/App.jsx';
import { HISTORY_KEY } from '../../src/storage.js';
import { ANALYSIS, ID_A, URL_A, analyzeResponse, fail, mockFetch, ok } from './helpers.jsx';

let user;
beforeEach(() => {
  localStorage.clear();
  delete window.__xss;
  user = userEvent.setup();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function setup(handlers) {
  const f = mockFetch(handlers);
  vi.stubGlobal('fetch', f);
  render(<App />);
  await waitFor(() => expect(f.callsTo('/api/health').length).toBe(1));
  return f;
}
async function analyze(url = URL_A) {
  await user.click(screen.getByLabelText('Enlace de YouTube'));
  await user.paste(url);
  await user.click(screen.getByRole('button', { name: /Generar Resumen y Claves/ }));
  await screen.findByTestId('results');
}

const XSS = [
  '<img src=x onerror="window.__xss=1">',
  '<script>window.__xss=1</script>',
  '"><svg onload="window.__xss=1">',
  'javascript:window.__xss=1',
  '<a href="javascript:window.__xss=1">click</a>',
  '<iframe src="javascript:window.__xss=1"></iframe>'
];

describe('SEC · XSS: la salida del modelo se renderiza SIEMPRE como texto', () => {
  const hostile = {
    ...ANALYSIS,
    tituloDetectado: XSS[0],
    canalDetectado: XSS[1],
    tematica: XSS[2],
    resumenEjecutivo: XSS[4],
    resumenPorSecciones: [{ seccion: XSS[5], detalle: XSS[0] }],
    ideasPrincipales: [{ titulo: XSS[1], explicacion: XSS[2], importancia: XSS[3] }],
    consejos: [{ consejo: XSS[0], comoAplicarlo: XSS[4], categoria: XSS[5] }],
    recomendaciones: [{ recomendacion: XSS[2], porQueImporta: XSS[0], accionInmediata: XSS[1] }],
    recursosMencionados: [XSS[4], XSS[5]],
    fraseDestacada: XSS[3]
  };

  it('no crea elementos peligrosos ni ejecuta scripts en ninguna pestaña', async () => {
    await setup({ analyze: (b) => analyzeResponse(b.url, hostile) });
    await analyze();
    const root = screen.getByTestId('results');

    for (const tab of ['Resumen', 'Ideas Principales', 'Consejos', 'Recomendaciones', 'Chat con el Video', 'Todo el Análisis']) {
      await user.click(screen.getByRole('tab', { name: new RegExp(tab) }));
      expect(document.querySelectorAll('script')).toHaveLength(0);
      expect(document.querySelector('img[src="x"]')).toBeNull();
      expect(document.querySelector('svg[onload]')).toBeNull();
      expect(document.querySelector('[onerror]')).toBeNull();
      expect(root.querySelectorAll('a[href^="javascript:"]')).toHaveLength(0);
      expect(root.querySelectorAll('iframe[src^="javascript:"]')).toHaveLength(0);
    }
    expect(window.__xss).toBeUndefined();
  });

  it('el texto hostil es visible literalmente (escapado), no interpretado', async () => {
    await setup({ analyze: (b) => analyzeResponse(b.url, { ...ANALYSIS, resumenEjecutivo: '<b>negrita</b><script>window.__xss=1</script>' }) });
    await analyze();
    await user.click(screen.getByRole('tab', { name: /Resumen/ }));
    expect(screen.getByText('<b>negrita</b><script>window.__xss=1</script>')).toBeInTheDocument();
    expect(document.querySelector('b')).toBeNull();
  });

  it('el chat también escapa las respuestas del modelo', async () => {
    await setup({ chat: () => ok({ reply: '<img src=x onerror="window.__xss=1"> hola' }) });
    await analyze();
    await user.click(screen.getByRole('tab', { name: /Chat con el Video/ }));
    await user.click(screen.getByLabelText('Tu pregunta sobre el video'));
    await user.paste('hola');
    await user.click(screen.getByRole('button', { name: /Enviar/ }));
    await screen.findByText(/<img src=x onerror=/);
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(window.__xss).toBeUndefined();
  });

  it('el mensaje de error del servidor también se escapa', async () => {
    await setup({ analyze: () => fail(500, 'X', '<img src=x onerror="window.__xss=1">') });
    await user.click(screen.getByLabelText('Enlace de YouTube'));
    await user.paste(URL_A);
    await user.click(screen.getByRole('button', { name: /Generar Resumen y Claves/ }));
    await screen.findByRole('alert');
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(window.__xss).toBeUndefined();
  });

  it('un historial persistido con payloads XSS se renderiza como texto', async () => {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify([{ videoId: ID_A, title: XSS[0], author: XSS[1], analysis: { ...ANALYSIS, tituloDetectado: XSS[0], resumenEjecutivo: XSS[0] }, completedTips: {}, chatMessages: [{ role: 'assistant', text: XSS[0] }], date: XSS[0] }])
    );
    await setup();
    await user.click(screen.getByRole('button', { name: /^Historial/ }));
    await screen.findByTestId('history-list');
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(window.__xss).toBeUndefined();
  });
});

describe('SEC · enlaces e iframe construidos solo desde el ID validado', () => {
  it('ignora meta.url/thumbnail maliciosos que envíe el servidor', async () => {
    await setup({
      analyze: () =>
        ok({ meta: { id: ID_A, title: 't', author: 'a', url: 'javascript:window.__xss=1', thumbnail: 'javascript:window.__xss=1' }, analysis: ANALYSIS, source: 'youtube-captions', truncated: false })
    });
    await analyze();
    const link = screen.getByRole('link', { name: /Abrir YouTube/ });
    expect(link).toHaveAttribute('href', `https://www.youtube.com/watch?v=${ID_A}`);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('rel')).toContain('noreferrer');
    expect(document.body.innerHTML).not.toContain('javascript:window.__xss');
  });

  it('el iframe usa youtube-nocookie, el ID validado y sandbox', async () => {
    await setup();
    await analyze();
    const frame = document.querySelector('iframe');
    expect(frame.getAttribute('src')).toBe(`https://www.youtube-nocookie.com/embed/${ID_A}`);
    const sandbox = frame.getAttribute('sandbox');
    expect(sandbox).toBeTruthy();
    expect(sandbox).not.toContain('allow-top-navigation');
    expect(sandbox).not.toContain('allow-forms');
  });

  it('todas las imágenes externas vienen de i.ytimg.com y no envían referrer', async () => {
    await setup();
    await user_pasteAndWaitPreview();
    const imgs = [...document.querySelectorAll('img')];
    expect(imgs.length).toBeGreaterThan(0);
    for (const img of imgs) {
      expect(img.getAttribute('src')).toMatch(/^https:\/\/i\.ytimg\.com\/vi\/[\w-]{11}\/hqdefault\.jpg$/);
      expect(img.getAttribute('referrerpolicy')).toBe('no-referrer');
    }
  });

  async function user_pasteAndWaitPreview() {
    await user.click(screen.getByLabelText('Enlace de YouTube'));
    await user.paste(URL_A);
    await screen.findByTestId('video-preview');
  }
});

describe('SEC · almacenamiento local', () => {
  it('localStorage corrupto no rompe la app', async () => {
    localStorage.setItem(HISTORY_KEY, '{{{ no json');
    await setup();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('entradas manipuladas (ID inválido, URLs peligrosas) se descartan o sanean', async () => {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify([
        { videoId: 'javascript:alert(1)', analysis: ANALYSIS },
        { videoId: ID_A, title: 'ok', analysis: ANALYSIS, thumbnail: 'javascript:alert(1)', meta: { url: 'javascript:alert(2)', thumbnail: 'javascript:alert(3)' } }
      ])
    );
    await setup();
    expect(screen.getByRole('button', { name: /^Historial/ })).toHaveTextContent('1');
    await user.click(screen.getByRole('button', { name: /^Historial/ }));
    const list = await screen.findByTestId('history-list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(document.body.innerHTML).not.toContain('javascript:');
  });

  it('elimina una API key heredada de la versión anterior al arrancar', async () => {
    localStorage.setItem('yt_ai_gemini_key', 'AIzaSyVIEJA-CLAVE-EXPUESTA');
    await setup();
    expect(localStorage.getItem('yt_ai_gemini_key')).toBeNull();
  });

  it('tras usar la app, localStorage no contiene claves ni la transcripción pegada', async () => {
    await setup();
    await user.click(screen.getByRole('button', { name: /Pegar la transcripción/ }));
    await user.click(screen.getByLabelText(/Transcripción del video/));
    await user.paste('TRANSCRIPCION-PRIVADA-123');
    await analyze();
    const all = Object.keys(localStorage).map((k) => `${k}=${localStorage.getItem(k)}`).join('\n');
    expect(all).not.toMatch(/AIza|api[_-]?key/i);
    expect(all).not.toContain('TRANSCRIPCION-PRIVADA-123');
  });
});

describe('SEC · el navegador nunca habla con Gemini ni maneja claves', () => {
  it('todas las peticiones van a rutas relativas /api y sin credenciales', async () => {
    const f = await setup();
    await analyze();
    await user.click(screen.getByRole('tab', { name: /Chat con el Video/ }));
    await user.click(screen.getByLabelText('Tu pregunta sobre el video'));
    await user.paste('hola');
    await user.click(screen.getByRole('button', { name: /Enviar/ }));
    await screen.findByText('Respuesta del asistente');

    expect(f.calls.length).toBeGreaterThanOrEqual(3); // health + analyze + chat (meta tiene debounce)
    for (const c of f.calls) {
      expect(c.url.startsWith('/api/')).toBe(true);
      expect(c.url).not.toMatch(/googleapis|key=|AIza/i);
      const headers = JSON.stringify(c.init.headers || {}).toLowerCase();
      expect(headers).not.toMatch(/x-goog-api-key|authorization|api[_-]?key/);
      expect(JSON.stringify(c.body ?? {})).not.toMatch(/AIza|api[_-]?key/i);
    }
  });

  it('no existe ya el modal ni el campo para introducir una API key en el navegador', async () => {
    await setup();
    expect(screen.queryByPlaceholderText(/AIza/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Gemini API Key/i)).not.toBeInTheDocument();
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });

  it('el chat sólo envía lo necesario: sin transcripción pegada ni datos del historial', async () => {
    const f = await setup();
    await user.click(screen.getByRole('button', { name: /Pegar la transcripción/ }));
    await user.click(screen.getByLabelText(/Transcripción del video/));
    await user.paste('TRANSCRIPCION-PRIVADA-123');
    await analyze();
    await user.click(screen.getByRole('tab', { name: /Chat con el Video/ }));
    await user.click(screen.getByLabelText('Tu pregunta sobre el video'));
    await user.paste('hola');
    await user.click(screen.getByRole('button', { name: /Enviar/ }));
    await screen.findByText('Respuesta del asistente');
    expect(Object.keys(f.callsTo('/api/chat')[0].body).sort()).toEqual(['analysis', 'messages', 'videoId']);
    expect(JSON.stringify(f.callsTo('/api/chat')[0].body)).not.toContain('TRANSCRIPCION-PRIVADA-123');
  });
});

describe('SEC · robustez ante entradas extremas', () => {
  it('el campo de enlace limita la longitud (300) y el de transcripción (60.000)', async () => {
    await setup();
    expect(screen.getByLabelText('Enlace de YouTube')).toHaveAttribute('maxlength', '300');
    await user.click(screen.getByRole('button', { name: /Pegar la transcripción/ }));
    expect(screen.getByLabelText(/Transcripción del video/)).toHaveAttribute('maxlength', '60000');
  });

  it('un enlace con payloads de inyección solo muestra el error de enlace inválido', async () => {
    const f = await setup();
    for (const evil of ['javascript:alert(1)', '"><script>alert(1)</script>', 'http://169.254.169.254/latest/meta-data', 'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ']) {
      await user.clear(screen.getByLabelText('Enlace de YouTube'));
      await user.click(screen.getByLabelText('Enlace de YouTube'));
      await user.paste(evil);
      await user.click(screen.getByRole('button', { name: /Generar Resumen y Claves/ }));
      expect(await screen.findByRole('alert')).toHaveTextContent('enlace válido de YouTube');
    }
    expect(f.callsTo('/api/analyze')).toHaveLength(0);
    expect(f.calls.some((c) => c.path.startsWith('/api/meta/'))).toBe(false);
  });
});
