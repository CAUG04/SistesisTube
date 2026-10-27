import { z } from 'zod';

// Texto saneado: recorta espacios y limita largo (nunca falla por longitud).
const str = (max) => z.string().transform((s) => s.trim().slice(0, max));
const strOpt = (max) => z.string().optional().default('').transform((s) => s.trim().slice(0, max));
const nonEmpty = (max) => str(max).pipe(z.string().min(1));
const list = (schema, max) => z.array(schema).max(40).optional().default([]).transform((a) => a.slice(0, max));

export const analysisSchema = z.object({
  tituloDetectado: strOpt(300),
  canalDetectado: strOpt(200),
  duracionEstimada: strOpt(60),
  tematica: strOpt(120),
  resumenEjecutivo: nonEmpty(4000),
  resumenPorSecciones: list(z.object({ seccion: strOpt(200), detalle: strOpt(1200) }), 12),
  ideasPrincipales: list(
    z.object({ titulo: strOpt(200), explicacion: strOpt(1200), importancia: strOpt(30) }),
    12
  ),
  consejos: list(
    z.object({ consejo: strOpt(300), comoAplicarlo: strOpt(1200), categoria: strOpt(40) }),
    15
  ),
  recomendaciones: list(
    z.object({ recomendacion: strOpt(300), porQueImporta: strOpt(1000), accionInmediata: strOpt(600) }),
    10
  ),
  recursosMencionados: list(str(200), 20),
  fraseDestacada: strOpt(500)
});
