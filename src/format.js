export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function safeFileName(title) {
  const base = String(title || 'video')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `resumen-${base || 'video'}.md`;
}

export function generateMarkdownReport(analysis, meta) {
  if (!analysis) return '';
  const lines = [];
  lines.push(`# RESUMEN DE VIDEO: ${analysis.tituloDetectado || meta?.title || ''}`);
  lines.push(`**Canal:** ${analysis.canalDetectado || meta?.author || ''}`);
  lines.push(`**Enlace:** ${meta?.url || ''}`);
  if (analysis.tematica) lines.push(`**Temática:** ${analysis.tematica}`);
  lines.push('', '---', '', '## 1. RESUMEN', analysis.resumenEjecutivo, '');
  if (analysis.resumenPorSecciones.length) {
    lines.push('### Desglose por partes:');
    analysis.resumenPorSecciones.forEach((s, i) => lines.push(`${i + 1}. **${s.seccion}**: ${s.detalle}`));
    lines.push('');
  }
  lines.push('---', '', '## 2. IDEAS PRINCIPALES');
  analysis.ideasPrincipales.forEach((x, i) => lines.push(`${i + 1}. **[${x.importancia}] ${x.titulo}**\n   ${x.explicacion}`, ''));
  lines.push('---', '', '## 3. CONSEJOS PRÁCTICOS');
  analysis.consejos.forEach((c, i) => lines.push(`${i + 1}. **${c.consejo}** (${c.categoria})\n   - Cómo aplicarlo: ${c.comoAplicarlo}`, ''));
  lines.push('---', '', '## 4. RECOMENDACIONES Y PLAN DE ACCIÓN');
  analysis.recomendaciones.forEach((r, i) =>
    lines.push(`${i + 1}. **${r.recomendacion}**\n   - Importancia: ${r.porQueImporta}\n   - Acción hoy: ${r.accionInmediata}`, '')
  );
  if (analysis.fraseDestacada) lines.push('---', '', '## FRASE CLAVE', `> "${analysis.fraseDestacada}"`);
  return lines.join('\n');
}

export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* cae al método alterno */
  }
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}
