// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { buildApp } from '../server/helpers.js';

const root = path.resolve(import.meta.dirname, '../..');
const dist = path.join(root, 'dist');

function walk(dir, exts) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p, exts) : exts.some((e) => p.endsWith(e)) ? [p] : [];
  });
}

beforeAll(() => {
  execSync('npx vite build', { cwd: root, stdio: 'pipe' });
}, 120000);

describe('SEC · bundle de producción', () => {
  const js = () => walk(dist, ['.js']).map((f) => fs.readFileSync(f, 'utf8')).join('\n');

  it('no contiene referencias a la API de Gemini ni cabeceras de clave', () => {
    const code = js();
    expect(code).not.toMatch(/generativelanguage\.googleapis\.com/);
    expect(code).not.toMatch(/x-goog-api-key/i);
  });

  it('no incrusta variables de entorno con la clave (ni VITE_GEMINI*, ni asignaciones GEMINI_API_KEY=valor)', () => {
    const code = js();
    // El NOMBRE "GEMINI_API_KEY" sí aparece a propósito en el mensaje de ayuda de la UI; un secreto no.
    expect(code).not.toMatch(/VITE_GEMINI/i);
    expect(code).not.toMatch(/GEMINI_API_KEY\s*[=:]\s*["'`]?[A-Za-z0-9_-]{8,}/);
    expect(code).not.toMatch(/import\.meta\.env\.[A-Z_]*KEY/);
  });

  it('no contiene nada con forma de clave de Google (AIza...)', () => {
    expect(js()).not.toMatch(/AIza[0-9A-Za-z_-]{20,}/);
  });

  it('no incluye código de servidor (express, helmet, dotenv)', () => {
    const code = js();
    expect(code).not.toMatch(/express-rate-limit|helmet|dotenv|youtube-transcript/);
  });

  it('index.html no tiene scripts en línea ni manejadores onclick (compatible con CSP script-src self)', () => {
    const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
    expect(scripts.length).toBeGreaterThan(0);
    for (const [, attrs, inner] of scripts) {
      expect(attrs).toMatch(/src="/);
      expect(inner.trim()).toBe('');
    }
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html).not.toMatch(/<style\b/i);
  });
});

describe('SEC · código fuente del cliente', () => {
  const files = walk(path.join(root, 'src'), ['.js', '.jsx']);
  const src = files.map((f) => ({ f: path.relative(root, f), c: fs.readFileSync(f, 'utf8') }));

  it.each([
    ['dangerouslySetInnerHTML', /dangerouslySetInnerHTML/],
    ['innerHTML', /\.innerHTML\s*=/],
    ['eval', /\beval\s*\(/],
    ['new Function', /new Function\s*\(/],
    ['document.write', /document\.write/],
    ['llamadas directas a Gemini', /generativelanguage|x-goog-api-key/],
    ['claves en localStorage', /setItem\(\s*['"][^'"]*(api|key)/i]
  ])('no usa %s', (_n, re) => {
    for (const { f, c } of src) expect(c, f).not.toMatch(re);
  });
});

describe('SEC · servidor sirviendo el build', () => {
  it('sirve index.html con CSP y hace fallback SPA, sin interferir con /api', async () => {
    const { app } = buildApp({ staticDir: dist });
    const home = await request(app).get('/');
    expect(home.status).toBe(200);
    expect(home.headers['content-type']).toMatch(/html/);
    expect(home.headers['content-security-policy']).toContain("script-src 'self'");

    const spa = await request(app).get('/historial');
    expect(spa.status).toBe(200);
    expect(spa.text).toContain('<div id="root">');

    const api = await request(app).get('/api/no-existe');
    expect(api.status).toBe(404);
    expect(api.headers['content-type']).toMatch(/json/);
  });

  it.each(['/.env', '/server/index.js', '/package.json', '/%2e%2e/package.json', '/..%2f..%2fpackage.json', '/assets/../../package.json'])(
    'no expone archivos fuera de dist: %s',
    async (p) => {
      const { app } = buildApp({ staticDir: dist });
      const res = await request(app).get(p);
      expect(res.text).not.toContain('"scripts"');
      expect(res.text).not.toContain('GEMINI_API_KEY=');
      expect(res.text).not.toContain('createGeminiClient');
    }
  );

  it('los assets JS y CSS se sirven con nosniff', async () => {
    const { app } = buildApp({ staticDir: dist });
    const asset = walk(path.join(dist, 'assets'), ['.js'])[0];
    const res = await request(app).get('/assets/' + path.basename(asset));
    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
