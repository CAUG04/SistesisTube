import React, { useMemo, useState } from 'react';
import { ArrowLeft, Clock, Eye, History, Search, Sparkles, Trash2 } from 'lucide-react';
import { formatDate } from '../format.js';

export default function HistoryView({ history, currentId, onLoad, onClear, onBack }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return history;
    return history.filter((item) =>
      [item.analysis.tituloDetectado, item.meta.title, item.analysis.canalDetectado, item.meta.author, item.analysis.tematica, item.analysis.resumenEjecutivo]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [history, query]);

  return (
    <section className="space-y-6" aria-label="Historial">
      <div className="rounded-3xl bg-slate-900/90 border border-slate-800 p-6 sm:p-8 shadow-2xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <History className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white">Historial</h1>
              <p className="text-xs sm:text-sm text-slate-400">Revisa, busca o vuelve a cargar tus resúmenes anteriores</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <button onClick={onBack} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs sm:text-sm font-semibold cursor-pointer">
              <ArrowLeft className="w-4 h-4" />
              <span>Volver al Analizador</span>
            </button>
            {history.length > 0 && (
              <button onClick={onClear} className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs sm:text-sm font-medium cursor-pointer">
                <Trash2 className="w-4 h-4" />
                <span>Limpiar todo</span>
              </button>
            )}
          </div>
        </div>

        {history.length > 0 && (
          <div className="relative max-w-xl">
            <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <label htmlFor="history-search" className="sr-only">
              Buscar en el historial
            </label>
            <input
              id="history-search"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por título, canal, temática o palabra clave..."
              className="w-full pl-11 pr-4 py-3 rounded-2xl bg-slate-950 border border-slate-800 focus:border-rose-500 text-sm text-white placeholder-slate-500 outline-none"
            />
          </div>
        )}

        {history.length === 0 ? (
          <div className="rounded-2xl bg-slate-950/60 border border-slate-800/80 p-12 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-500">
              <Clock className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-white">Tu historial aún está vacío</h3>
            <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">Los videos que analices se guardan aquí, solo en este navegador.</p>
            <button onClick={onBack} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-orange-500 text-white text-xs sm:text-sm font-semibold cursor-pointer">
              <Sparkles className="w-4 h-4" />
              <span>Analizar un video ahora</span>
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm bg-slate-950/50 rounded-2xl border border-slate-800">
            No se encontraron videos que coincidan con "{query}".
          </div>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="history-list">
            {filtered.map((item, index) => {
              const isCurrent = currentId === item.videoId;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onLoad(item)}
                    className={`group w-full text-left rounded-2xl p-5 border transition-all cursor-pointer flex flex-col justify-between gap-4 ${
                      isCurrent ? 'bg-rose-950/25 border-rose-500/60' : 'bg-slate-950/80 hover:bg-slate-900 border-slate-800/90 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="relative w-32 aspect-video rounded-xl overflow-hidden bg-slate-900 border border-slate-800 shrink-0">
                        <img src={item.meta.thumbnail} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        {index === 0 && !query && (
                          <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-rose-600 text-[10px] font-bold text-white">Último</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <span className="text-[11px] font-medium text-rose-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {formatDate(item.date)}
                        </span>
                        <h3 className="text-sm font-bold text-white line-clamp-2">{item.analysis.tituloDetectado || item.meta.title}</h3>
                        <p className="text-xs text-slate-400 truncate">Canal: {item.analysis.canalDetectado || item.meta.author}</p>
                      </div>
                    </div>
                    {item.analysis.resumenEjecutivo && (
                      <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed bg-slate-900/80 p-3 rounded-xl border border-slate-800/70">
                        {item.analysis.resumenEjecutivo}
                      </p>
                    )}
                    <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2 text-[11px] text-slate-400">
                      <span>
                        {item.analysis.ideasPrincipales.length} ideas • {item.analysis.consejos.length} consejos
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600/20 text-rose-300 text-xs font-semibold">
                        <Eye className="w-3.5 h-3.5" />
                        {isCurrent ? 'Viendo ahora' : 'Ver resumen'}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
