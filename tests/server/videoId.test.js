import { describe, it, expect } from 'vitest';
import { extractYouTubeId, isValidVideoId } from '../../shared/videoId.js';

const ID = 'dQw4w9WgXcQ';

describe('extractYouTubeId — casos válidos (QA)', () => {
  it.each([
    [`https://www.youtube.com/watch?v=${ID}`],
    [`https://youtube.com/watch?v=${ID}&t=42s&list=PL123`],
    [`http://m.youtube.com/watch?feature=share&v=${ID}`],
    [`https://music.youtube.com/watch?v=${ID}`],
    [`https://youtu.be/${ID}`],
    [`https://youtu.be/${ID}?si=abc`],
    [`https://www.youtube.com/embed/${ID}`],
    [`https://www.youtube-nocookie.com/embed/${ID}`],
    [`https://www.youtube.com/shorts/${ID}`],
    [`https://www.youtube.com/live/${ID}?feature=share`],
    [`youtube.com/watch?v=${ID}`],
    [`  https://youtu.be/${ID}  `],
    [ID]
  ])('extrae el ID de %s', (input) => {
    expect(extractYouTubeId(input)).toBe(ID);
  });
});

describe('extractYouTubeId — entradas hostiles (seguridad)', () => {
  it.each([
    ['host falso con sufijo', `https://youtube.com.evil.com/watch?v=${ID}`],
    ['host falso con prefijo', `https://evilyoutube.com/watch?v=${ID}`],
    ['subdominio engañoso', `https://www.youtube.com@evil.com/watch?v=${ID}`],
    ['credenciales en la URL', `https://user:pass@www.youtube.com/watch?v=${ID}`],
    ['javascript:', `javascript:alert(1)//youtube.com/watch?v=${ID}`],
    ['data:', 'data:text/html,<script>alert(1)</script>'],
    ['file:', `file:///etc/passwd?v=${ID}`],
    ['ftp:', `ftp://youtube.com/watch?v=${ID}`],
    ['IP interna (SSRF)', 'http://169.254.169.254/latest/meta-data'],
    ['localhost', `http://localhost:8787/watch?v=${ID}`],
    ['ID de 10 caracteres', 'dQw4w9WgXc'],
    ['ID de 12 caracteres', 'dQw4w9WgXcQQ'],
    ['ID con caracteres inválidos', 'dQw4w9WgXc!'],
    ['ID con salto de línea', `https://youtu.be/${ID}%0A`],
    ['ID con path traversal', 'https://www.youtube.com/embed/../../etc/passwd'],
    ['v vacío', 'https://www.youtube.com/watch?v='],
    ['ruta no soportada', `https://www.youtube.com/channel/${ID}`],
    ['cadena vacía', ''],
    ['solo espacios', '   '],
    ['input demasiado largo', `https://www.youtube.com/watch?v=${ID}&x=${'a'.repeat(400)}`]
  ])('rechaza: %s', (_name, input) => {
    expect(extractYouTubeId(input)).toBeNull();
  });

  it.each([[null], [undefined], [123], [{}], [[ID]], [true]])('rechaza tipos no string: %j', (input) => {
    expect(extractYouTubeId(input)).toBeNull();
  });

  it('nunca devuelve algo que no sea un ID válido', () => {
    const inputs = ['<script>', "'; DROP TABLE--", '../../x', 'https://youtu.be/<img src=x>', '%00%00%00%00%00%00%00%00%00%00%00'];
    for (const i of inputs) {
      const r = extractYouTubeId(i);
      expect(r === null || isValidVideoId(r)).toBe(true);
    }
  });
});
