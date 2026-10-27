import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { History, Key, RotateCcw, MonitorPlay } from 'lucide-react';
import { extractYouTubeId } from '../shared/videoId.js';
import { analysisSchema } from '../shared/analysisSchema.js';
import { analyzeVideo, ApiError, getHealth, getMeta, sendChat } from './api.js';
import { buildMeta, loadHistory, persistHistory, toApiMessages, upsertHistory } from './storage.js';
import { copyToClipboard, generateMarkdownReport, safeFileName } from './format.js';
import AnalyzerForm from './components/AnalyzerForm.jsx';
import Results from './components/Results.jsx';
import ChatPanel from './components/ChatPanel.jsx';
import HistoryView from './components/HistoryView.jsx';

const speech = () => (typeof window !== 'undefined' ? window.speechSynthesis : undefined);

export default function App() {
  const [serverReady, setServerReady] = useState(null);

  const [videoUrl, setVideoUrl] = useState('');
  const [previewMeta, setPreviewMeta] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [focus, setFocus] = useState('general');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const [current, setCurrent] = useState(null); // { meta, analysis, source, truncated }
  const [activeTab, setActiveTab] = useState('todo');
  const [completedTips, setCompletedTips] = useState({});
  const [chatMessages, setChatMessages] = useState([]);
  const [isChatLoading, setIsChatLoading] = useState(false);

  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [copied, setCopied] = useState(null);
  const [history, setHistory] = useState(() => loadHistory());
  const [view, setView] = useState('analizador');

  const requestRef = useRef(0);
  const currentIdRef = useRef(null);
  currentIdRef.current = current?.meta.id ?? null;

  // Estado del servidor (¿hay clave de Gemini?)
  useEffect(() => {
    const ctrl = new AbortController();
    getHealth(ctrl.signal)
      .then((h) => setServerReady(Boolean(h.geminiConfigured)))
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    persistHistory(history);
  }, [history]);

  useEffect(() => () => speech()?.cancel(), []);

  // Vista previa del video al pegar un enlace (con debounce)
  useEffect(() => {
    const id = extractYouTubeId(videoUrl);
    if (!id) {
      setPreviewMeta(null);
      return undefined;
    }
    setPreviewMeta(buildMeta(id));
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      getMeta(id, ctrl.signal)
        .then((m) => setPreviewMeta(buildMeta(id, m.title, m.author)))
        .catch(() => {});
    }, 400);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [videoUrl]);

  const stopVoice = useCallback(() => {
    speech()?.cancel();
    setIsPlayingAudio(false);
  }, []);

  const commit = useCallback((meta, analysis, tips, chat, date) => {
    const entry = {
      videoId: meta.id,
      meta,
      analysis,
      completedTips: tips,
      chatMessages: chat.filter((m) => !m.isError).map(({ role, text }) => ({ role, text })),
      ...(date ? { date } : {})
    };
    setHistory((prev) => upsertHistory(prev, entry));
  }, []);

  const handleAnalyze = async (e) => {
    if (e) e.preventDefault();
    const id = extractYouTubeId(videoUrl);
    if (!id) {
      setErrorMessage('Por favor ingresa un enlace válido de YouTube (ej. https://www.youtube.com/watch?v=...).');
      return;
    }
    stopVoice();
    setErrorMessage('');
    setIsLoading(true);
    setLoadingStage('Obteniendo la transcripción y analizando el contenido...');
    const myRequest = ++requestRef.current;

    try {
      const data = await analyzeVideo({ url: videoUrl, focus, transcript });
      if (myRequest !== requestRef.current) return;
      const analysis = analysisSchema.parse(data.analysis);
      const meta = buildMeta(id, data.meta?.title || analysis.tituloDetectado, data.meta?.author || analysis.canalDetectado);
      const greeting = [
        { role: 'assistant', text: `Listo: analicé "${analysis.tituloDetectado || meta.title}". Pregúntame lo que quieras sobre este video.` }
      ];
      setCurrent({ meta, analysis, source: data.source ?? null, truncated: Boolean(data.truncated) });
      setCompletedTips({});
      setChatMessages(greeting);
      setActiveTab('todo');
      setView('analizador');
      commit(meta, analysis, {}, greeting, new Date().toISOString());
    } catch (err) {
      if (myRequest !== requestRef.current) return;
      setErrorMessage(err instanceof ApiError ? err.message : 'Ocurrió un inconveniente al procesar el video. Intenta nuevamente.');
      if (err instanceof ApiError && err.code === 'NO_TRANSCRIPT') setShowAdvanced(true);
    } finally {
      if (myRequest === requestRef.current) {
        setIsLoading(false);
        setLoadingStage('');
      }
    }
  };

  const loadHistoryEntry = (entry) => {
    if (!entry) return;
    stopVoice();
    // Cargar un resumen guardado cancela cualquier análisis en curso (su resultado tardío se ignora).
    requestRef.current += 1;
    setIsLoading(false);
    setLoadingStage('');
    setErrorMessage('');
    setVideoUrl(entry.meta.url);
    setCurrent({ meta: entry.meta, analysis: entry.analysis, source: null, truncated: false });
    setCompletedTips(entry.completedTips || {});
    setChatMessages(
      entry.chatMessages.length > 0
        ? entry.chatMessages
        : [{ role: 'assistant', text: `Restauré el análisis de "${entry.analysis.tituloDetectado || entry.meta.title}". Pregúntame lo que quieras.` }]
    );
    setActiveTab('todo');
    setView('analizador');
  };

  const previousEntry = useMemo(() => {
    if (history.length === 0) return null;
    if (!current) return history[0];
    return history.find((h) => h.videoId !== current.meta.id) || null;
  }, [history, current]);

  const handleToggleVoice = () => {
    const synth = speech();
    if (!synth || !current) return;
    if (isPlayingAudio) return stopVoice();
    synth.cancel();
    const { analysis } = current;
    const tips = analysis.consejos.map((c, i) => `Consejo ${i + 1}: ${c.consejo}.`).join(' ');
    const u = new SpeechSynthesisUtterance(`Resumen del video: ${analysis.tituloDetectado}. ${analysis.resumenEjecutivo} Principales consejos: ${tips}`);
    u.lang = 'es-ES';
    u.rate = 1.05;
    u.onend = () => setIsPlayingAudio(false);
    u.onerror = () => setIsPlayingAudio(false);
    setIsPlayingAudio(true);
    synth.speak(u);
  };

  const markdown = useMemo(() => (current ? generateMarkdownReport(current.analysis, current.meta) : ''), [current]);

  const handleCopy = async (text, tag) => {
    if (await copyToClipboard(text)) {
      setCopied(tag);
      setTimeout(() => setCopied(null), 2500);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = safeFileName(current?.analysis.tituloDetectado);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleToggleTip = (idx) => {
    const next = { ...completedTips, [idx]: !completedTips[idx] };
    setCompletedTips(next);
    if (current) commit(current.meta, current.analysis, next, chatMessages);
  };

  const handleSendChat = async (text) => {
    if (!current) return;
    const { meta, analysis } = current;
    const outgoing = [...chatMessages, { role: 'user', text }];
    setChatMessages(outgoing);
    setIsChatLoading(true);
    try {
      const { reply } = await sendChat({
        videoId: meta.id,
        analysis,
        messages: toApiMessages(outgoing.filter((m) => !m.isError))
      });
      if (currentIdRef.current !== meta.id) return; // el usuario cambió de video mientras tanto
      const done = [...outgoing, { role: 'assistant', text: reply }];
      setChatMessages(done);
      commit(meta, analysis, completedTips, done);
    } catch (err) {
      if (currentIdRef.current !== meta.id) return;
      const message = err instanceof ApiError ? err.message : 'No pude responder en este momento.';
      setChatMessages([...outgoing, { role: 'assistant', text: message, isError: true }]);
    } finally {
      if (currentIdRef.current === meta.id) setIsChatLoading(false);
    }
  };

  const handleClearHistory = () => {
    if (typeof window !== 'undefined' && !window.confirm('¿Borrar todo el historial de este navegador?')) return;
    setHistory([]);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-rose-500 selection:text-white">
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <button onClick={() => setView('analizador')} className="flex items-center gap-3 select-none cursor-pointer text-left" aria-label="Ir al analizador">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-600 to-orange-500 flex items-center justify-center shadow-lg shadow-rose-600/30">
              <MonitorPlay className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-rose-300 bg-clip-text text-transparent">SíntesisTube AI</span>
              <p className="text-[11px] text-slate-400 hidden sm:block">Resúmenes fieles a la transcripción, ideas, tips y plan de acción</p>
            </div>
          </button>

          <div className="flex items-center gap-2">
            {previousEntry && (
              <button
                onClick={() => loadHistoryEntry(previousEntry)}
                title={`Volver a: ${previousEntry.analysis.tituloDetectado || previousEntry.meta.title}`}
                className="hidden md:flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-xs font-medium cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                <span className="max-w-[170px] truncate">Anterior: {previousEntry.analysis.tituloDetectado || previousEntry.meta.title}</span>
              </button>
            )}
            <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800">
              {['analizador', 'historial'].map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  aria-pressed={view === v}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${view === v ? 'bg-rose-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  {v === 'historial' && <History className="w-4 h-4" />}
                  <span>{v === 'analizador' ? 'Analizador' : 'Historial'}</span>
                  {v === 'historial' && history.length > 0 && <span className="px-1.5 text-[11px] rounded-full font-bold bg-white/20 text-white">{history.length}</span>}
                </button>
              ))}
            </div>
            <span
              title={serverReady === null ? 'Comprobando servidor...' : serverReady ? 'Gemini configurado en el servidor' : 'Falta GEMINI_API_KEY en el servidor'}
              className={`p-2 rounded-xl border ${serverReady ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : serverReady === false ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-slate-900 border-slate-800 text-slate-500'}`}
            >
              <Key className="w-4 h-4" aria-label={serverReady ? 'Servidor listo' : 'Servidor sin clave o sin comprobar'} />
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {view === 'historial' ? (
          <HistoryView history={history} currentId={current?.meta.id} onLoad={loadHistoryEntry} onClear={handleClearHistory} onBack={() => setView('analizador')} />
        ) : (
          <>
            <AnalyzerForm
              videoUrl={videoUrl}
              onUrlChange={setVideoUrl}
              onClearUrl={() => setVideoUrl('')}
              previewMeta={previewMeta}
              showPreview={!current || current.meta.id !== previewMeta?.id}
              focus={focus}
              onFocusChange={setFocus}
              transcript={transcript}
              onTranscriptChange={setTranscript}
              showAdvanced={showAdvanced}
              onToggleAdvanced={() => setShowAdvanced((v) => !v)}
              isLoading={isLoading}
              loadingStage={loadingStage}
              errorMessage={errorMessage}
              serverReady={serverReady}
              onSubmit={handleAnalyze}
            />

            {current && !isLoading && (
              <Results
                analysis={current.analysis}
                meta={current.meta}
                source={current.source}
                truncated={current.truncated}
                activeTab={activeTab}
                onTab={setActiveTab}
                completedTips={completedTips}
                onToggleTip={handleToggleTip}
                isPlayingAudio={isPlayingAudio}
                onToggleVoice={handleToggleVoice}
                copied={copied}
                onCopy={handleCopy}
                onDownload={handleDownload}
                markdown={markdown}
                previousEntry={previousEntry}
                onLoadPrevious={loadHistoryEntry}
                onOpenHistory={() => setView('historial')}
                historyCount={history.length}
                chatSlot={<ChatPanel messages={chatMessages} onSend={handleSendChat} isLoading={isChatLoading} />}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
