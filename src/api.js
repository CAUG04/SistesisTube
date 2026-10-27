export class ApiError extends Error {
  constructor(message, code = 'UNKNOWN', status = 0) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError('No se pudo conectar con el servidor. ¿Está corriendo?', 'NETWORK', 0);
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* respuesta sin JSON */
  }
  if (!res.ok) {
    throw new ApiError(data?.error?.message || 'Ocurrió un error inesperado.', data?.error?.code || 'UNKNOWN', res.status);
  }
  return data;
}

export const getHealth = (signal) => request('/api/health', { signal });
export const getMeta = (id, signal) => request(`/api/meta/${encodeURIComponent(id)}`, { signal });
export const analyzeVideo = ({ url, focus, transcript }) =>
  request('/api/analyze', { method: 'POST', body: { url, focus, ...(transcript?.trim() ? { transcript } : {}) } });
export const sendChat = ({ videoId, analysis, messages }) =>
  request('/api/chat', { method: 'POST', body: { videoId, analysis, messages } });
