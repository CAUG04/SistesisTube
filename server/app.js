import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import { extractYouTubeId, isValidVideoId, canonicalUrl } from '../shared/videoId.js';
import { AppError } from './errors.js';
import { analysisSchema, analyzeBodySchema, chatBodySchema } from './schemas.js';
import { ANALYSIS_SYSTEM, buildAnalysisPrompt, buildChatSystem } from './prompts.js';
import { MAX_TRANSCRIPT_CHARS } from './transcript.js';

// Express 4 no captura rechazos de handlers async: este wrapper los envía al manejador de errores.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const thumbnail = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

function limiter(limit, message) {
  return rateLimit({
    windowMs: 60_000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ error: { code: 'RATE_LIMITED', message } });
    }
  });
}

export function createApp({
  gemini,
  getTranscript,
  getVideoMeta,
  allowedOrigin = '',
  limits = { general: 120, heavy: 10 },
  staticDir = null,
  trustProxy = false
}) {
  const app = express();
  app.set('trust proxy', trustProxy);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          'style-src': ["'self'"],
          'img-src': ["'self'", 'data:', 'https://i.ytimg.com'],
          'frame-src': ['https://www.youtube-nocookie.com'],
          'connect-src': ["'self'"],
          'object-src': ["'none'"],
          'base-uri': ["'self'"],
          'form-action': ["'self'"],
          'frame-ancestors': ["'none'"]
        }
      },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
    })
  );

  // CORS cerrado por defecto (mismo origen). Solo se abre para un origen explícito.
  app.use('/api', (req, res, next) => {
    const origin = req.headers.origin;
    if (allowedOrigin && origin === allowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') return res.sendStatus(204);
    }
    next();
  });

  app.use('/api', limiter(limits.general, 'Demasiadas solicitudes. Espera un momento.'));
  const heavy = limiter(limits.heavy, 'Demasiados análisis seguidos. Espera un minuto.');

  app.use('/api', (req, res, next) => {
    if (req.method === 'POST' && !req.is('application/json')) {
      return next(new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type debe ser application/json.'));
    }
    next();
  });
  app.use('/api', express.json({ limit: '200kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, geminiConfigured: Boolean(gemini?.configured) });
  });

  app.get('/api/meta/:id', wrap(async (req, res) => {
    const id = req.params.id;
    if (!isValidVideoId(id)) throw new AppError(400, 'INVALID_ID', 'ID de video inválido.');
    const meta = await getVideoMeta(id);
    res.json({
      id,
      title: meta?.title ?? null,
      author: meta?.author ?? null,
      thumbnail: thumbnail(id),
      url: canonicalUrl(id)
    });
  }));

  app.post('/api/analyze', heavy, wrap(async (req, res) => {
    const parsed = analyzeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_REQUEST', 'Solicitud inválida: revisa el enlace, el enfoque y la transcripción.');
    }
    const { url, focus, transcript: pasted } = parsed.data;
    const id = extractYouTubeId(url);
    if (!id) throw new AppError(400, 'INVALID_URL', 'Ingresa un enlace válido de YouTube.');
    if (!gemini?.configured) {
      throw new AppError(503, 'NO_API_KEY', 'El servidor no tiene configurada GEMINI_API_KEY.');
    }

    const meta = await getVideoMeta(id);

    let text;
    let truncated = false;
    let source;
    if (pasted && pasted.trim()) {
      source = 'user-provided';
      text = pasted.trim();
      if (text.length > MAX_TRANSCRIPT_CHARS) {
        text = text.slice(0, MAX_TRANSCRIPT_CHARS);
        truncated = true;
      }
    } else {
      source = 'youtube-captions';
      ({ text, truncated } = await getTranscript(id));
    }

    const analysis = await gemini.generateJson({
      system: ANALYSIS_SYSTEM,
      user: buildAnalysisPrompt({ videoId: id, title: meta?.title, author: meta?.author, focus, transcript: text }),
      parse: (json) => analysisSchema.parse(json)
    });

    if (!analysis.tituloDetectado && meta?.title) analysis.tituloDetectado = meta.title;
    if (!analysis.canalDetectado && meta?.author) analysis.canalDetectado = meta.author;

    res.json({
      meta: {
        id,
        title: meta?.title ?? analysis.tituloDetectado ?? `Video ${id}`,
        author: meta?.author ?? analysis.canalDetectado ?? 'YouTube',
        thumbnail: thumbnail(id),
        url: canonicalUrl(id)
      },
      analysis,
      source,
      truncated
    });
  }));

  app.post('/api/chat', heavy, wrap(async (req, res) => {
    const parsed = chatBodySchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, 'INVALID_REQUEST', 'Solicitud de chat inválida.');
    const { analysis, messages } = parsed.data;
    if (messages[messages.length - 1].role !== 'user') {
      throw new AppError(400, 'INVALID_REQUEST', 'El último mensaje debe ser del usuario.');
    }
    if (!gemini?.configured) {
      throw new AppError(503, 'NO_API_KEY', 'El servidor no tiene configurada GEMINI_API_KEY.');
    }
    const reply = await gemini.generateChat({ system: buildChatSystem(analysis), messages });
    res.json({ reply: reply.slice(0, 4000) });
  }));

  app.use('/api', (_req, _res, next) => next(new AppError(404, 'NOT_FOUND', 'Ruta no encontrada.')));

  if (staticDir && fs.existsSync(staticDir)) {
    app.use(express.static(staticDir, { index: false }));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(staticDir, 'index.html')));
  }

  // Manejo de errores: nunca expone stack, claves ni cuerpos del proveedor.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof AppError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message } });
    }
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'La solicitud es demasiado grande.' } });
    }
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'JSON inválido.' } });
    }
    console.error('[error]', err?.name || 'Error');
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Error interno del servidor.' } });
  });

  return app;
}
