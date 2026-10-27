// Extracción ESTRICTA de IDs de YouTube. Se usa en cliente y servidor.
// Solo acepta hosts de YouTube conocidos; nunca devuelve algo que no sea un ID de 11 caracteres.
const ID_RE = /^[A-Za-z0-9_-]{11}$/;
const YT_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com'
]);
const PATH_PREFIXES = new Set(['embed', 'shorts', 'live', 'v']);

export function isValidVideoId(value) {
  return typeof value === 'string' && ID_RE.test(value);
}

export function extractYouTubeId(input) {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  if (!s || s.length > 300) return null;
  if (isValidVideoId(s)) return s;

  let url;
  try {
    url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password) return null;

  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean);
  let candidate = null;

  if (host === 'youtu.be') {
    candidate = parts[0];
  } else if (YT_HOSTS.has(host)) {
    if (parts[0] === 'watch') candidate = url.searchParams.get('v');
    else if (PATH_PREFIXES.has(parts[0])) candidate = parts[1];
  }
  return isValidVideoId(candidate) ? candidate : null;
}

export function canonicalUrl(id) {
  return `https://www.youtube.com/watch?v=${id}`;
}
