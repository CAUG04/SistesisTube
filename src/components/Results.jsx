import React from 'react';
import {
  Award, Bookmark, Check, Compass, Copy, Download, ExternalLink, FileText, Layers, Lightbulb, ListChecks,
  MessageSquare, Quote, RotateCcw, Square, Volume2, MonitorPlay
} from 'lucide-react';

const TABS = [
  { id: 'todo', label: 'Todo el Análisis', icon: Layers },
  { id: 'resumen', label: 'Resumen', icon: FileText },
  { id: 'ideas', label: 'Ideas Principales', icon: Lightbulb, key: 'ideasPrincipales' },
  { id: 'consejos', label: 'Consejos (Tips)', icon: ListChecks, key: 'consejos' },
  { id: 'recomendaciones', label: 'Recomendaciones', icon: Compass, key: 'recomendaciones' },
  { id: 'chat', label: 'Chat con el Video', icon: MessageSquare }
];

function CopyButton({ label, doneLabel, tag, copied, onCopy, text }) {
  const done = copied === tag;
  return (
    <button onClick={() => onCopy(text, tag)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition-colors">
      {done ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      <span className={done ? 'text-emerald-400' : ''}>{done ? doneLabel : label}</span>
    </button>
  );
}

function SectionHeader({ icon: Icon, color, title, subtitle, action }) {
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-lg sm:text-xl font-bold text-white">{title}</h3>
          <p className="text-xs text-slate-400">{subtitle}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

const card = 'rounded-3xl bg-slate-900/75 border border-slate-800 p-6 sm:p-7 space-y-6 shadow-xl';

export default function Results({
  analysis, meta, source, truncated, activeTab, onTab, completedTips, onToggleTip, isPlayingAudio, onToggleVoice, copied, onCopy,
  onDownload, markdown, previousEntry, onLoadPrevious, onOpenHistory, historyCount, chatSlot
}) {
  const show = (id) => activeTab === 'todo' || activeTab === id;
  const done = Object.values(completedTips).filter(Boolean).length;

  return (
    <div className="space-y-6" data-testid="results">
      {source === 'user-provided' && (
        <p className="text-xs text-slate-400 px-1">Análisis basado en la transcripción que pegaste.</p>
      )}
      {truncated && (
        <p role="status" className="text-xs text-amber-300 px-1">La transcripción era muy larga: se analizó solo la primera parte.</p>
      )}

      {previousEntry && (
        <div className="p-3.5 sm:px-5 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-[11px] font-semibold text-amber-400 block uppercase tracking-wider">Video anterior disponible</span>
            <p className="text-xs sm:text-sm text-slate-200 font-medium truncate">{previousEntry.analysis.tituloDetectado || previousEntry.meta.title}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => onLoadPrevious(previousEntry)} className="px-3.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Volver al resumen anterior</span>
            </button>
            <button onClick={onOpenHistory} className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium cursor-pointer">
              Ver historial ({historyCount})
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-slate-900/80 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl">
        <div className="lg:col-span-5 space-y-3">
          <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-lg">
            {meta?.id ? (
              <iframe
                className="w-full h-full"
                src={`https://www.youtube-nocookie.com/embed/${meta.id}`}
                title={analysis.tituloDetectado || meta.title}
                sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
                referrerPolicy="strict-origin-when-cross-origin"
                allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-500">
                <MonitorPlay className="w-12 h-12" />
              </div>
            )}
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <span className="truncate">
              Canal: <strong className="text-slate-200">{analysis.canalDetectado || meta?.author}</strong>
            </span>
            {meta?.url && (
              <a href={meta.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-rose-400 hover:text-rose-300 font-medium shrink-0">
                <span>Abrir YouTube</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>

        <div className="lg:col-span-7 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {analysis.tematica && <span className="px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">{analysis.tematica}</span>}
              {analysis.duracionEstimada && <span className="px-3 py-1 rounded-full text-xs font-medium bg-slate-800 text-slate-300">{analysis.duracionEstimada}</span>}
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                {analysis.ideasPrincipales.length} Ideas • {analysis.consejos.length} Consejos • {analysis.recomendaciones.length} Recomendaciones
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white leading-snug">{analysis.tituloDetectado || meta?.title}</h2>
            {analysis.fraseDestacada && (
              <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-start gap-3">
                <Quote className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <p className="text-xs sm:text-sm italic text-slate-300">"{analysis.fraseDestacada}"</p>
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center gap-2.5">
            <button
              onClick={onToggleVoice}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                isPlayingAudio ? 'bg-amber-500 hover:bg-amber-600 text-slate-950' : 'bg-rose-600 hover:bg-rose-500 text-white'
              }`}
            >
              {isPlayingAudio ? <Square className="w-4 h-4 fill-current" /> : <Volume2 className="w-4 h-4" />}
              <span>{isPlayingAudio ? 'Detener Voz' : 'Escuchar Resumen'}</span>
            </button>
            <button onClick={() => onCopy(markdown, 'all')} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs sm:text-sm font-medium cursor-pointer">
              {copied === 'all' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-slate-400" />}
              <span className={copied === 'all' ? 'text-emerald-400' : ''}>{copied === 'all' ? '¡Copiado!' : 'Copiar Todo'}</span>
            </button>
            <button onClick={onDownload} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs sm:text-sm font-medium cursor-pointer">
              <Download className="w-4 h-4 text-slate-400" />
              <span>Descargar (.MD)</span>
            </button>
          </div>
        </div>
      </div>

      <div role="tablist" aria-label="Secciones del análisis" className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-800">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const count = tab.key ? analysis[tab.key].length : undefined;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => onTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all cursor-pointer ${
                isActive ? 'bg-gradient-to-r from-rose-600 to-orange-500 text-white shadow-md shadow-rose-600/20' : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {count !== undefined && <span className={`px-1.5 rounded-full text-[11px] ${isActive ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400'}`}>{count}</span>}
            </button>
          );
        })}
      </div>

      {show('resumen') && (
        <section className={card} aria-label="Resumen">
          <SectionHeader
            icon={FileText}
            color="bg-rose-500/15 border-rose-500/30 text-rose-400"
            title="1. Resumen"
            subtitle="Síntesis ejecutiva y recorrido por los bloques temáticos"
            action={<CopyButton tag="resumen" label="Copiar resumen" doneLabel="Copiado" copied={copied} onCopy={onCopy} text={analysis.resumenEjecutivo} />}
          />
          <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-950 to-slate-900 border border-slate-800 space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-400">Síntesis Central</span>
            <p className="text-slate-200 text-sm sm:text-base leading-relaxed">{analysis.resumenEjecutivo}</p>
          </div>
          {analysis.resumenPorSecciones.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">Desglose Estructurado del Video</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {analysis.resumenPorSecciones.map((sec, idx) => (
                  <div key={idx} className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 flex gap-3.5">
                    <div className="w-7 h-7 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-400 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">{idx + 1}</div>
                    <div className="space-y-1">
                      <h5 className="font-semibold text-white text-sm">{sec.seccion}</h5>
                      <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">{sec.detalle}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {show('ideas') && (
        <section className={card} aria-label="Ideas principales">
          <SectionHeader
            icon={Lightbulb}
            color="bg-amber-500/15 border-amber-500/30 text-amber-400"
            title="2. Ideas Principales"
            subtitle="Los conceptos y tesis centrales del video"
            action={
              <CopyButton tag="ideas" label="Copiar ideas" doneLabel="Copiadas" copied={copied} onCopy={onCopy}
                text={analysis.ideasPrincipales.map((i, n) => `${n + 1}. ${i.titulo}: ${i.explicacion}`).join('\n')} />
            }
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {analysis.ideasPrincipales.map((idea, idx) => (
              <div key={idx} className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Idea Clave #{idx + 1}</span>
                  {idea.importancia && <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">{idea.importancia}</span>}
                </div>
                <h4 className="text-base font-bold text-white">{idea.titulo}</h4>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">{idea.explicacion}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {show('consejos') && (
        <section className={card} aria-label="Consejos prácticos">
          <SectionHeader
            icon={ListChecks}
            color="bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
            title="3. Consejos Prácticos (Tips)"
            subtitle={`Marca los que ya aplicaste (${done} de ${analysis.consejos.length})`}
            action={
              <CopyButton tag="consejos" label="Copiar tips" doneLabel="Copiados" copied={copied} onCopy={onCopy}
                text={analysis.consejos.map((c, n) => `${n + 1}. ${c.consejo} -> ${c.comoAplicarlo}`).join('\n')} />
            }
          />
          <div className="space-y-3.5">
            {analysis.consejos.map((item, idx) => {
              const isDone = !!completedTips[idx];
              return (
                <div
                  key={idx}
                  className={`p-5 rounded-2xl border transition-all flex items-start gap-4 ${isDone ? 'bg-emerald-950/20 border-emerald-500/40 opacity-80' : 'bg-slate-950/80 border-slate-800 hover:border-emerald-500/40'}`}
                >
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={isDone}
                    aria-label={`Marcar como realizado: ${item.consejo}`}
                    onClick={() => onToggleTip(idx)}
                    className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border transition-colors cursor-pointer ${
                      isDone ? 'bg-emerald-500 border-emerald-500 text-slate-950' : 'border-slate-700 bg-slate-900 text-transparent hover:border-emerald-400'
                    }`}
                  >
                    <Check className="w-4 h-4 stroke-[3]" />
                  </button>
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className={`text-sm sm:text-base font-bold ${isDone ? 'line-through text-slate-400' : 'text-white'}`}>{item.consejo}</h4>
                      {item.categoria && <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">{item.categoria}</span>}
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-xs sm:text-sm text-slate-300">
                      <strong className="text-emerald-400 font-semibold">Cómo aplicarlo: </strong>
                      {item.comoAplicarlo}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {show('recomendaciones') && (
        <section className={card} aria-label="Recomendaciones">
          <SectionHeader
            icon={Compass}
            color="bg-indigo-500/15 border-indigo-500/30 text-indigo-400"
            title="4. Recomendaciones y Plan de Acción"
            subtitle="Directrices para implementar hoy mismo"
            action={
              <CopyButton tag="recomendaciones" label="Copiar recomendaciones" doneLabel="Copiadas" copied={copied} onCopy={onCopy}
                text={analysis.recomendaciones.map((r, n) => `${n + 1}. ${r.recomendacion} | Acción: ${r.accionInmediata}`).join('\n')} />
            }
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {analysis.recomendaciones.map((rec, idx) => (
              <div key={idx} className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-300 text-xs font-bold flex items-center justify-center">{idx + 1}</span>
                    <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">Recomendación</span>
                  </div>
                  <h4 className="text-base font-bold text-white">{rec.recomendacion}</h4>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">{rec.porQueImporta}</p>
                </div>
                {rec.accionInmediata && (
                  <div className="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/25 space-y-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
                      <Award className="w-3.5 h-3.5" /> Acción Inmediata:
                    </span>
                    <p className="text-xs sm:text-sm text-indigo-100 font-medium">{rec.accionInmediata}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
          {analysis.recursosMencionados.length > 0 && (
            <div className="p-5 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-rose-400" /> Recursos y Conceptos Mencionados
              </h4>
              <div className="flex flex-wrap gap-2">
                {analysis.recursosMencionados.map((r, idx) => (
                  <span key={idx} className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700/80 text-xs sm:text-sm text-slate-200 font-medium">{r}</span>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {show('chat') && chatSlot}
    </div>
  );
}
