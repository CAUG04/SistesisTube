import { AppError } from './errors.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// Cliente mínimo de Gemini. La clave viaja SOLO en el header x-goog-api-key (nunca en la URL)
// y los errores del proveedor nunca se reenvían crudos al cliente.
export function createGeminiClient({ apiKey, model = 'gemini-2.5-flash', fetchImpl = fetch, timeoutMs = 60000 } = {}) {
  async function call(body) {
    if (!apiKey) {
      throw new AppError(503, 'NO_API_KEY', 'El servidor no tiene configurada GEMINI_API_KEY.');
    }
    let res;
    try {
      res = await fetchImpl(`${BASE}/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (err) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        throw new AppError(504, 'UPSTREAM_TIMEOUT', 'El modelo tardó demasiado en responder. Intenta de nuevo.');
      }
      throw new AppError(502, 'UPSTREAM_UNREACHABLE', 'No se pudo contactar al modelo.');
    }

    if (!res.ok) {
      if (res.status === 429) throw new AppError(429, 'UPSTREAM_RATE_LIMIT', 'Se alcanzó el límite de uso del modelo. Espera un momento.');
      if (res.status === 401 || res.status === 403) {
        throw new AppError(502, 'UPSTREAM_AUTH', 'El servidor no pudo autenticarse con el modelo (revisa GEMINI_API_KEY).');
      }
      throw new AppError(502, 'UPSTREAM_ERROR', 'El modelo devolvió un error.');
    }

    let json;
    try {
      json = await res.json();
    } catch {
      throw new AppError(502, 'UPSTREAM_BAD_RESPONSE', 'Respuesta inválida del modelo.');
    }

    if (json?.promptFeedback?.blockReason) {
      throw new AppError(422, 'CONTENT_BLOCKED', 'El modelo bloqueó el contenido de este video.');
    }
    const parts = json?.candidates?.[0]?.content?.parts;
    const text = Array.isArray(parts) ? parts.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('') : '';
    if (!text.trim()) {
      throw new AppError(502, 'UPSTREAM_EMPTY', 'El modelo no devolvió contenido.');
    }
    return text;
  }

  return {
    get configured() {
      return Boolean(apiKey);
    },

    // Genera JSON y lo valida con `parse` (zod). Un reintento si el JSON/estructura es inválido.
    async generateJson({ system, user, parse, attempts = 2 }) {
      let lastErr;
      for (let i = 0; i < attempts; i++) {
        const text = await call({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.3 }
        });
        try {
          return parse(extractJson(text));
        } catch (err) {
          lastErr = err;
        }
      }
      throw new AppError(502, 'BAD_MODEL_OUTPUT', 'El modelo devolvió un resultado con formato inválido. Intenta de nuevo.');
    },

    async generateChat({ system, messages }) {
      return (
        await call({
          systemInstruction: { parts: [{ text: system }] },
          contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text }] })),
          generationConfig: { temperature: 0.4, maxOutputTokens: 800 }
        })
      ).trim();
    }
  };
}

export function extractJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) return JSON.parse(fenced[1].trim());
    const a = text.indexOf('{');
    const b = text.lastIndexOf('}');
    if (a !== -1 && b > a) return JSON.parse(text.slice(a, b + 1));
    throw new Error('no-json');
  }
}
