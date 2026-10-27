import { z } from 'zod';

import { analysisSchema } from '../shared/analysisSchema.js';

export { analysisSchema };

export const FOCUS_VALUES = ['general', 'practico', 'ejecutivo', 'estudio'];
export const MAX_PASTED_TRANSCRIPT = 60000;

export const analyzeBodySchema = z.object({
  url: z.string().max(300),
  focus: z.enum(FOCUS_VALUES).optional().default('general'),
  transcript: z.string().max(MAX_PASTED_TRANSCRIPT).optional()
});

export const chatBodySchema = z.object({
  videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
  analysis: analysisSchema,
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().min(1).max(2000) }))
    .min(1)
    .max(20)
});
