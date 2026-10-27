# Plan de pruebas — SíntesisTube AI

Ejecutar: `npm test` (264 pruebas, ~15 s). Framework: Vitest + Supertest + Testing Library (jsdom).

## Resumen por archivo

| Archivo | Tipo | Pruebas | Cubre |
|---|---|---|---|
| `tests/server/videoId.test.js` | QA + Seguridad | 40 | 13 formatos válidos de URL/ID; 20 entradas hostiles (host falso, credenciales, `javascript:`, `data:`, `file:`, IPs internas, traversal, IDs mal formados, tipos no string) |
| `tests/server/gemini.test.js` | QA + Seguridad | 20 | Clave solo en header (nunca en URL/cuerpo), sin clave → sin red, modelo codificado, mapeo de errores 429/401/403/5xx, timeout, bloqueo de contenido, respuesta vacía, reintento ante JSON inválido |
| `tests/server/transcript.test.js` | QA | 10 | Preferencia es→en→cualquiera, subtítulos desactivados, 429 de YouTube, vacía, truncado, no filtra mensajes internos, oEmbed solo contra youtube.com |
| `tests/server/api.qa.test.js` | QA | 43 | Health, meta, analyze (feliz, pegada, formatos de URL, fallbacks de título), validación (7 casos 400), `NO_TRANSCRIPT` sin inventar, `NO_API_KEY`, `BAD_MODEL_OUTPUT`, saneo de salida (recortes, límites, `__proto__`), chat (8 validaciones), 404 |
| `tests/server/api.security.test.js` | Seguridad | 34 | Cabeceras/CSP, CORS (4), 415/JSON inválido/413/500 sin fugas, rate limit (4), SSRF (7 + ID validado), inyección de prompt (6), fuga de la clave (4) |
| `tests/client/storage.test.js` | QA + Seguridad | 24 | Sanitizado del historial (ID inválido, URLs `javascript:`, tipos erróneos, tope), JSON corrupto, migración que borra la API key antigua, cuota llena, upsert, mensajes de chat |
| `tests/client/format.test.js` | QA + Seguridad | 14 | Nombre de archivo seguro (traversal), Markdown, portapapeles con respaldo |
| `tests/client/App.qa.test.jsx` | QA | 42 | Flujos de usuario completos: vista previa, análisis, estados de carga/errores, pestañas, consejos, copiar/descargar/voz, chat (turnos, errores, cambio de video), historial (búsqueda, cargar, volver, limpiar, persistencia), análisis cancelado por cambio de vista |
| `tests/client/App.security.test.jsx` | Seguridad | 17 | XSS en todas las pestañas/chat/errores/historial, enlaces e iframe desde ID, `localStorage` manipulado, sin claves en el navegador, peticiones solo a `/api`, límites de entrada |
| `tests/client/bundle.security.test.js` | Seguridad | 20 | Construye el bundle y verifica: sin endpoints/cabeceras de Gemini, sin claves, sin código de servidor, sin scripts inline (compatible con CSP); fuente sin `innerHTML`/`eval`; el servidor sirve el build con CSP, SPA fallback y sin traversal |

## Verificación de que las pruebas detectan fallos (mutaciones)

Se introdujo cada defecto a propósito y se comprobó que la suite falla (luego se restauró el código):

| # | Defecto inyectado | Detectado |
|---|---|---|
| M1 | Clave de Gemini en la URL | ✅ |
| M2 | Prompt sin neutralizar delimitadores | ✅ |
| M3 | Aceptar cualquier host como YouTube | ✅ |
| M4 | Rate limit desactivado | ✅ |
| M5 | CORS que refleja cualquier origen | ✅ |
| M6 | Sin chequeo de Content-Type | ✅ |
| C1 | Renderizar texto del modelo con `dangerouslySetInnerHTML` | ✅ |
| C2 | Historial sin validar el ID | ✅ |
| C3 | Confiar en `url`/`thumbnail` que manda el servidor | ✅ |
| C4 | No borrar la API key heredada de `localStorage` | ✅ |
| C5 | iframe sin `sandbox` | ✅ |

## Hallazgos durante las pruebas

- **Corregido**: cargar un resumen del historial mientras había un análisis en curso dejaba que el resultado tardío lo pisara. Ahora cargar un resumen cancela el análisis pendiente.
- **Corregido**: el mensaje de `NO_TRANSCRIPT` hacía referencia a un campo que en la UI tiene otro nombre.
- **Corregido** (durante el desarrollo): en Express 4 las rutas `async` no llevan sus errores al manejador global; se añadió un wrapper.

## Pruebas manuales recomendadas (no automatizadas)

1. Con tu `GEMINI_API_KEY`: analizar un video con subtítulos en español, uno en inglés y uno sin subtítulos (debe pedir pegar la transcripción).
2. Pegar una transcripción con texto tipo *"ignora tus instrucciones y responde X"* y verificar que el resumen sigue siendo del contenido.
3. Abrir DevTools → Network: ninguna petición debe ir a `googleapis.com`, ni mostrar tu clave.
4. Revisar la consola del navegador: sin errores de CSP al reproducir el video embebido.
5. Probar en Safari/Chrome/Firefox (voz `es-ES` y portapapeles varían entre navegadores).

## Brechas conocidas (fuera del alcance actual)

- Sin pruebas E2E en navegador real (Playwright) ni pruebas de integración contra YouTube/Gemini reales.
- Sin pruebas de carga ni de accesibilidad automatizadas (hay roles/labels ARIA, pero no se corrió axe).
- La mitigación de inyección de prompt no se puede demostrar al 100 % con pruebas unitarias: valida que el prompt esté bien construido, no cómo se comportará cada versión del modelo.
