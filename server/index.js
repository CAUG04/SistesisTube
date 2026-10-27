import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { createGeminiClient } from './gemini.js';
import { getTranscript, getVideoMeta } from './transcript.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT) || 8787;

const gemini = createGeminiClient({
  apiKey: process.env.GEMINI_API_KEY || '',
  model: process.env.GEMINI_MODEL || 'gemini-2.5-flash'
});

if (!gemini.configured) {
  console.warn('⚠️  GEMINI_API_KEY no está definida: /api/analyze responderá 503 hasta que la configures en .env');
}

const app = createApp({
  gemini,
  getTranscript,
  getVideoMeta,
  allowedOrigin: process.env.ALLOWED_ORIGIN || '',
  staticDir: path.join(root, 'dist'),
  trustProxy: process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY : false
});

app.listen(port, () => console.log(`SíntesisTube escuchando en http://localhost:${port}`));
