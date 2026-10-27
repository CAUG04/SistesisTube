import React, { useState } from 'react';
import { Loader2, MessageSquare, Send } from 'lucide-react';

export default function ChatPanel({ messages, onSend, isLoading }) {
  const [input, setInput] = useState('');

  const submit = (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    onSend(text);
  };

  return (
    <section className="rounded-3xl bg-slate-900/75 border border-slate-800 p-6 sm:p-7 space-y-5 shadow-xl" aria-label="Chat con el video">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
          <MessageSquare className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-lg sm:text-xl font-bold text-white">Pregúntale al Video</h3>
          <p className="text-xs text-slate-400">Las respuestas se basan en el análisis generado de este video</p>
        </div>
      </div>

      <div data-testid="chat-log" className="rounded-2xl bg-slate-950/90 border border-slate-800 p-4 space-y-4 max-h-80 overflow-y-auto">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              data-role={msg.role}
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words ${
                msg.role === 'user' ? 'bg-rose-600 text-white' : msg.isError ? 'bg-rose-950/50 border border-rose-500/40 text-rose-200' : 'bg-slate-900 border border-slate-800 text-slate-200'
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-4 py-3 bg-slate-900 border border-slate-800 text-slate-400 text-xs flex items-center gap-2" role="status">
              <Loader2 className="w-4 h-4 animate-spin text-rose-400" />
              <span>Pensando...</span>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={submit} className="flex gap-2.5">
        <label htmlFor="chat-input" className="sr-only">
          Tu pregunta sobre el video
        </label>
        <input
          id="chat-input"
          type="text"
          value={input}
          maxLength={2000}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ej. ¿Cómo aplico estos consejos si solo tengo 10 minutos al día?"
          className="flex-1 px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 focus:border-rose-500 text-sm text-white placeholder-slate-500 outline-none"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="px-5 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-semibold text-sm flex items-center gap-2 transition-all cursor-pointer"
        >
          <Send className="w-4 h-4" />
          <span className="hidden sm:inline">Enviar</span>
        </button>
      </form>
    </section>
  );
}
