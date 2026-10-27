// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { copyToClipboard, formatDate, generateMarkdownReport, safeFileName } from '../../src/format.js';
import { buildMeta } from '../../src/storage.js';
import { analysisSchema } from '../../shared/analysisSchema.js';
import { ANALYSIS, ID_A } from './helpers.jsx';

afterEach(() => vi.restoreAllMocks());

describe('safeFileName (seguridad)', () => {
  it.each([
    ['../../etc/passwd', 'resumen-etc-passwd.md'],
    ['C:\\Windows\\System32', 'resumen-c-windows-system32.md'],
    ['<script>alert(1)</script>', 'resumen-script-alert-1-script.md'],
    ['', 'resumen-video.md'],
    [undefined, 'resumen-video.md'],
    ['Hábitos Atómicos: ¡Cambia tu vida!', 'resumen-habitos-atomicos-cambia-tu-vida.md']
  ])('%j → %s', (input, expected) => {
    expect(safeFileName(input)).toBe(expected);
  });

  it('nunca contiene separadores de ruta ni caracteres raros y se limita en longitud', () => {
    const name = safeFileName('a/b\\c:d*e?f"g<h>i|j'.repeat(10));
    expect(name).toMatch(/^resumen-[a-z0-9-]+\.md$/);
    expect(name.length).toBeLessThanOrEqual(60);
  });
});

describe('generateMarkdownReport (QA)', () => {
  const report = generateMarkdownReport(analysisSchema.parse(ANALYSIS), buildMeta(ID_A, 'T', 'A'));

  it('incluye todas las secciones y el enlace canónico', () => {
    for (const s of ['# RESUMEN DE VIDEO: Hábitos que funcionan', '## 1. RESUMEN', '## 2. IDEAS PRINCIPALES', '## 3. CONSEJOS PRÁCTICOS', '## 4. RECOMENDACIONES', '## FRASE CLAVE']) {
      expect(report).toContain(s);
    }
    expect(report).toContain(`https://www.youtube.com/watch?v=${ID_A}`);
    expect(report).toContain('Empieza pequeño');
  });

  it('devuelve cadena vacía sin análisis', () => {
    expect(generateMarkdownReport(null, null)).toBe('');
  });

  it('omite secciones opcionales vacías (sin frase destacada)', () => {
    const r = generateMarkdownReport(analysisSchema.parse({ ...ANALYSIS, fraseDestacada: '' }), buildMeta(ID_A));
    expect(r).not.toContain('FRASE CLAVE');
  });
});

describe('formatDate', () => {
  it('maneja fechas inválidas o vacías', () => {
    expect(formatDate('')).toBe('');
    expect(formatDate('no-fecha')).toBe('');
    expect(formatDate('2026-01-15T10:30:00.000Z')).not.toBe('');
  });
});

describe('copyToClipboard', () => {
  it('usa navigator.clipboard cuando existe', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    expect(await copyToClipboard('hola')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hola');
  });

  it('cae a execCommand si clipboard falla', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(async () => { throw new Error('denied'); }) }, configurable: true });
    document.execCommand = vi.fn(() => true);
    expect(await copyToClipboard('hola')).toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith('copy');
    expect(document.querySelectorAll('textarea')).toHaveLength(0); // limpia el textarea temporal
  });

  it('devuelve false si ambos métodos fallan', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    document.execCommand = vi.fn(() => { throw new Error('nope'); });
    expect(await copyToClipboard('x')).toBe(false);
  });
});
