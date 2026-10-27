import {
  fetchTranscript,
  YoutubeTranscriptTooManyRequestError,
  YoutubeTranscriptNotAvailableLanguageError
} from 'youtube-transcript';
import { AppError } from './errors.js';

export const MAX_TRANSCRIPT_CHARS = 100000;

function clean(text) {
  return text.replace(/\s+/g, ' ').trim();
}

// Obtiene la transcripción real del video (subtítulos de YouTube). Prefiere es, luego en, luego cualquiera.
export async function getTranscript(videoId, { fetcher = fetchTranscript } = {}) {
  let segments = null;
  let lastErr = null;
  for (const lang of ['es', 'en', undefined]) {
    try {
      segments = await fetcher(videoId, lang ? { lang } : undefined);
      break;
    } catch (err) {
      lastErr = err;
      if (err instanceof YoutubeTranscriptNotAvailableLanguageError) continue;
      break;
    }
  }

  if (!segments) {
    if (lastErr instanceof YoutubeTranscriptTooManyRequestError) {
      throw new AppError(503, 'TRANSCRIPT_BUSY', 'YouTube limitó temporalmente las consultas. Intenta en unos minutos o pega la transcripción.');
    }
    throw new AppError(
      422,
      'NO_TRANSCRIPT',
      'No se pudo obtener la transcripción de este video (puede no tener subtítulos). Pega la transcripción en el cuadro "¿Pegar la transcripción?".'
    );
  }

  let text = clean(segments.map((s) => s?.text ?? '').join(' '));
  if (!text) {
    throw new AppError(422, 'NO_TRANSCRIPT', 'La transcripción del video está vacía. Pégala manualmente.');
  }
  const truncated = text.length > MAX_TRANSCRIPT_CHARS;
  if (truncated) text = text.slice(0, MAX_TRANSCRIPT_CHARS);
  return { text, truncated };
}

// Metadatos vía oEmbed oficial de YouTube. La URL se construye solo con un ID ya validado.
export async function getVideoMeta(videoId, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  try {
    const target = encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`);
    const res = await fetchImpl(`https://www.youtube.com/oembed?url=${target}&format=json`, {
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      title: typeof data?.title === 'string' ? data.title.slice(0, 300) : null,
      author: typeof data?.author_name === 'string' ? data.author_name.slice(0, 200) : null
    };
  } catch {
    return null;
  }
}
