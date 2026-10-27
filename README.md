# SíntesisTube AI

Analiza videos de YouTube a partir de su **transcripción real** y genera: resumen, ideas principales, consejos, recomendaciones y un chat para preguntarle al video. Reescritura de `analizador_de_videos_de_youtube_con_ia.tsx` con backend propio.

## Qué cambió respecto a la versión original

| Antes | Ahora |
|---|---|
| Gemini recibía solo el ID/título del video → el análisis era inventado | El servidor obtiene la **transcripción real** (o usas la que pegues) y el modelo se limita a ella |
| Si la API fallaba, se mostraba un análisis genérico "de relleno" | Si no hay transcripción o falla el modelo, se muestra un **error claro**; nunca contenido fabricado |
| Chat con una respuesta enlatada | Chat con **Gemini**, usando el análisis como contexto |
| API key en `localStorage` y en la URL (`?key=`) | La clave vive **solo en el servidor** (`.env`) y viaja en el header `x-goog-api-key` |
| 2 resúmenes "de ejemplo" precargados (contenido no verificado) | Eliminados |
| Historial sin validar (`javascript:` en URLs guardadas, etc.) | Historial validado con esquema; URLs reconstruidas desde el ID |

## Inicio rápido

Requiere Node 20+.

```bash
npm install
cp .env.example .env        # y pon tu GEMINI_API_KEY (https://aistudio.google.com/apikey)
npm run dev                 # web en http://localhost:5173, API en :8787
```

Producción (un solo proceso sirve API + web):

```bash
npm run build
npm start                   # http://localhost:8787
```

### Variables de entorno

| Variable | Descripción |
|---|---|
| `GEMINI_API_KEY` | Clave de Gemini. Sin ella, `/api/analyze` responde 503 y la UI lo avisa. |
| `GEMINI_MODEL` | Por defecto `gemini-2.5-flash`. |
| `PORT` | Por defecto `8787`. |
| `ALLOWED_ORIGIN` | Opcional. Origen exacto permitido por CORS (por defecto, solo mismo origen). |
| `TRUST_PROXY` | Si despliegas detrás de un proxy (p. ej. `1`), para que el rate limit use la IP real. |

## Scripts

| Comando | Qué hace |
|---|---|
| `npm test` | Toda la suite (264 pruebas; incluye un `vite build` para auditar el bundle) |
| `npm run test:server` / `test:client` | Solo servidor / solo cliente |
| `npm run audit` | `npm audit` (nivel high) |

## Arquitectura

```
shared/      videoId.js (extracción ESTRICTA de IDs) · analysisSchema.js (zod, usado en cliente y servidor)
server/      app.js (Express: helmet, CSP, rate limit, CORS cerrado) · gemini.js · transcript.js · prompts.js · schemas.js
src/         App.jsx + components/ · api.js · storage.js (historial validado) · format.js
tests/       server/ (API, seguridad, Gemini, transcript) · client/ (componentes, storage, bundle)
```

### API

| Ruta | Descripción |
|---|---|
| `GET /api/health` | `{ ok, geminiConfigured }` |
| `GET /api/meta/:id` | Título/canal vía oEmbed oficial de YouTube |
| `POST /api/analyze` | `{ url, focus?, transcript? }` → `{ meta, analysis, source, truncated }` |
| `POST /api/chat` | `{ videoId, analysis, messages[] }` → `{ reply }` |

Errores: `{ error: { code, message } }` (`INVALID_URL`, `NO_TRANSCRIPT`, `NO_API_KEY`, `RATE_LIMITED`, `BAD_MODEL_OUTPUT`, …).

## Modelo de seguridad

- **Clave de Gemini**: solo en el servidor, en header (no en URL); los errores del proveedor nunca se reenvían crudos; los logs no imprimen mensajes de error.
- **SSRF**: las URLs se validan contra una lista de hosts de YouTube; las peticiones salientes se construyen únicamente con el ID de 11 caracteres ya validado.
- **Inyección de prompt**: transcripción, título y canal se tratan como datos no confiables: se neutralizan `<` `>` (no pueden cerrar los delimitadores), van en el mensaje de usuario y el prompt de sistema lo declara explícitamente. *Es una mitigación, no una garantía*: por eso además la salida se valida con esquema y se renderiza solo como texto.
- **XSS**: React escapa todo; sin `dangerouslySetInnerHTML`; enlaces e iframe construidos desde el ID (nunca desde datos guardados/recibidos); iframe con `sandbox` y `youtube-nocookie`.
- **Cabeceras**: CSP sin `unsafe-inline`/`unsafe-eval`, `frame-ancestors 'none'`, `nosniff`, etc. (helmet).
- **Abuso**: rate limit por IP (10 análisis/chats por minuto, 120 peticiones/min en total), cuerpo máx. 200 KB, `Content-Type: application/json` obligatorio, CORS cerrado.
- **Datos locales**: el historial vive solo en el navegador (`localStorage`), validado al cargar. La transcripción pegada no se guarda.

## Limitaciones conocidas

- **No se probó contra YouTube ni Gemini reales** (el entorno donde se construyó solo permite tráfico a npm/GitHub). Todo el flujo está probado con dobles de prueba que reproducen la forma de las respuestas; haz una prueba manual con tu clave antes de depender de él.
- `youtube-transcript` usa una API **no oficial** de YouTube: puede romperse o ser limitada por YouTube. Cuando falla, la app pide pegar la transcripción manualmente.
- Videos sin subtítulos requieren pegar la transcripción.
- Transcripciones muy largas se recortan a 100.000 caracteres (la UI lo avisa).
- El chat responde con base en el **análisis**, no en la transcripción completa.
- El rate limit es en memoria (por proceso); para varias instancias usa un store compartido (p. ej. Redis).
- No hay autenticación: si lo expones a internet, ponlo detrás de un login o de tu proxy.

Plan de pruebas detallado: [TEST_PLAN.md](./TEST_PLAN.md).
