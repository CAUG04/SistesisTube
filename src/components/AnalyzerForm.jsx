import React from 'react';
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, FileText, Loader2, SlidersHorizontal, Sparkles, Trash2, MonitorPlay } from 'lucide-react';

const FOCUS_OPTIONS = [
  { id: 'general', label: 'Completo (Estándar)' },
  { id: 'practico', label: '100% Tips y Práctica' },
  { id: 'ejecutivo', label: 'Ejecutivo / Directivo' },
  { id: 'estudio', label: 'Estudio y Apuntes' }
];

export default function AnalyzerForm({
  videoUrl, onUrlChange, onClearUrl, previewMeta, showPreview, focus, onFocusChange,
  transcript, onTranscriptChange, showAdvanced, onToggleAdvanced, isLoading, loadingStage, errorMessage, serverReady, onSubmit
}) {
  return (
    <section className="relative rounded-3xl bg-gradient-to-b from-slate-900/90 to-slate-900/50 border border-slate-800/90 p-6 sm:p-8 shadow-2xl overflow-hidden">
      <div className="absolute -top-24 -right-24 w-96 h-96 bg-rose-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="relative max-w-3xl mx-auto text-center space-y-3 mb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-medium">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Síntesis con IA a partir de la transcripción real</span>
        </div>
        <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white">
          Resumen fiel, ideas clave,{' '}
          <span className="bg-gradient-to-r from-rose-500 to-orange-400 bg-clip-text text-transparent">consejos y recomendaciones</span>
        </h1>
        <p className="text-slate-400 text-sm sm:text-base">Pega un video de YouTube con subtítulos y obtén un informe estructurado y accionable.</p>
      </div>

      {serverReady === false && (
        <div role="alert" className="relative max-w-4xl mx-auto mb-4 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <span>El servidor no tiene configurada la clave de Gemini. Define GEMINI_API_KEY en el archivo .env y reinicia.</span>
        </div>
      )}

      <form onSubmit={onSubmit} className="relative max-w-4xl mx-auto space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <MonitorPlay className="w-5 h-5 text-rose-500" />
            </div>
            <label htmlFor="video-url" className="sr-only">
              Enlace de YouTube
            </label>
            <input
              id="video-url"
              type="text"
              value={videoUrl}
              maxLength={300}
              onChange={(e) => onUrlChange(e.target.value)}
              placeholder="Pega el enlace de YouTube (ej. https://www.youtube.com/watch?v=...)"
              autoComplete="off"
              className="w-full pl-12 pr-10 py-4 bg-slate-950/90 border border-slate-700/80 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 rounded-2xl text-white placeholder-slate-500 text-sm sm:text-base outline-none transition-all"
            />
            {videoUrl && (
              <button type="button" aria-label="Borrar enlace" onClick={onClearUrl} className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="px-7 py-4 rounded-2xl bg-gradient-to-r from-rose-600 to-orange-500 hover:from-rose-500 hover:to-orange-400 disabled:opacity-60 text-white font-semibold text-sm sm:text-base shadow-lg shadow-rose-600/25 flex items-center justify-center gap-2.5 transition-all cursor-pointer shrink-0"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Analizando...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                <span>Generar Resumen y Claves</span>
              </>
            )}
          </button>
        </div>

        {showPreview && previewMeta && (
          <div className="flex items-center gap-4 p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 text-left" data-testid="video-preview">
            <img src={previewMeta.thumbnail} alt="" className="w-24 h-14 object-cover rounded-xl border border-slate-800 shrink-0" referrerPolicy="no-referrer" />
            <div className="min-w-0 flex-1">
              <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Video listo para procesar
              </span>
              <h3 className="text-sm font-semibold text-white truncate">{previewMeta.title}</h3>
              <p className="text-xs text-slate-400 truncate">Canal: {previewMeta.author}</p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Enfoque del análisis">
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <SlidersHorizontal className="w-3.5 h-3.5 text-rose-400" /> Enfoque:
            </span>
            {FOCUS_OPTIONS.map((mode) => (
              <button
                key={mode.id}
                type="button"
                aria-pressed={focus === mode.id}
                onClick={() => onFocusChange(mode.id)}
                className={`px-3 py-1 rounded-xl text-xs font-medium transition-all ${
                  focus === mode.id ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' : 'bg-slate-950/60 text-slate-400 border border-slate-800 hover:text-slate-200'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={onToggleAdvanced} aria-expanded={showAdvanced} className="text-xs text-slate-400 hover:text-rose-400 flex items-center gap-1.5 transition-colors">
            <FileText className="w-3.5 h-3.5" />
            <span>{showAdvanced ? 'Ocultar transcripción manual' : '¿Pegar la transcripción? (opcional)'}</span>
            {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {showAdvanced && (
          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2 text-left">
            <label htmlFor="transcript" className="text-xs font-semibold text-slate-300 block">
              Transcripción del video (si el video no tiene subtítulos o quieres máxima exactitud):
            </label>
            <textarea
              id="transcript"
              rows={4}
              value={transcript}
              maxLength={60000}
              onChange={(e) => onTranscriptChange(e.target.value)}
              placeholder="Pega aquí la transcripción de YouTube..."
              className="w-full p-3 rounded-xl bg-slate-900 border border-slate-800 focus:border-rose-500 text-xs sm:text-sm text-slate-200 outline-none resize-y"
            />
            <p className="text-[11px] text-slate-500">{transcript.length.toLocaleString('es-CO')} / 60.000 caracteres</p>
          </div>
        )}
      </form>

      {isLoading && (
        <p role="status" className="relative max-w-4xl mx-auto mt-4 text-sm text-rose-300 text-center">
          {loadingStage}
        </p>
      )}

      {errorMessage && (
        <div role="alert" className="mt-4 max-w-4xl mx-auto p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-200 text-sm">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1">{errorMessage}</div>
        </div>
      )}
    </section>
  );
}
