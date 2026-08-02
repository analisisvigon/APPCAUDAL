import { useId, useState } from 'react';

import {
  RIVAL_TACTICAL_SUGGESTED_QUESTIONS,
  answerRivalTacticalQuestion,
} from '../../utils/rivalTacticalCenter.js';

const sourceTone = {
  Perfil: 'border-cyan-300/15 bg-cyan-300/[0.06] text-cyan-100',
  Evidencias: 'border-violet-300/15 bg-violet-300/[0.06] text-violet-100',
  Pizarra: 'border-blue-300/15 bg-blue-300/[0.06] text-blue-100',
  Conexiones: 'border-amber-300/15 bg-amber-300/[0.06] text-amber-100',
  Vídeo: 'border-fuchsia-300/15 bg-fuchsia-300/[0.06] text-fuchsia-100',
  Staff: 'border-emerald-300/15 bg-emerald-300/[0.06] text-emerald-100',
};

export default function RivalTacticalAssistant({ model, missingInformation }) {
  const [mode, setMode] = useState('evidence');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(null);
  const responseId = useId().replace(/:/g, '');

  const ask = (nextQuestion = question) => {
    const cleanQuestion = String(nextQuestion || '').trim();
    if (!cleanQuestion) return;
    setQuestion(cleanQuestion);
    setAnswer(answerRivalTacticalQuestion({
      question: cleanQuestion,
      mode,
      model,
      missingInformation,
    }));
  };

  const selectMode = (nextMode) => {
    setMode(nextMode);
    setAnswer(null);
  };

  return (
    <section className="rounded-[1.8rem] bg-gradient-to-br from-[#10223a] via-[#0b192c] to-[#081321] p-5 shadow-[0_24px_80px_rgba(15,76,129,0.10)] sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-caudal-electric">APPCAUDAL</p>
          <h3 className="mt-1 text-xl font-black text-white sm:text-2xl">Asistente táctico</h3>
          <p className="mt-1 text-sm font-semibold text-slate-400">Pregunta cualquier aspecto del comportamiento colectivo del rival.</p>
        </div>
        <div className="inline-flex w-full rounded-xl bg-black/20 p-1 sm:w-auto" role="radiogroup" aria-label="Modo de respuesta">
          {[
            ['evidence', 'Basado en evidencias'],
            ['coach', 'Criterio del entrenador'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              onClick={() => selectMode(value)}
              className={`min-h-10 flex-1 rounded-lg px-3 py-2 text-[9px] font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70 sm:flex-none sm:text-[10px] ${
                mode === value ? 'bg-caudal-electric text-slate-950' : 'text-slate-400 hover:bg-white/[0.05] hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <form
        className="mt-5 flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          ask();
        }}
      >
        <label className="min-w-0 flex-1">
          <span className="sr-only">Pregunta para el asistente táctico</span>
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Escribe tu pregunta..."
            aria-describedby={answer ? responseId : undefined}
            className="h-12 w-full rounded-xl border border-white/[0.09] bg-black/20 px-4 text-sm font-semibold text-white outline-none placeholder:text-slate-600 focus:border-caudal-electric/50 focus:ring-2 focus:ring-caudal-electric/20"
          />
        </label>
        <button
          type="submit"
          disabled={!question.trim()}
          className="min-h-12 rounded-xl bg-caudal-electric px-6 py-3 text-xs font-black text-slate-950 transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Preguntar
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Preguntas sugeridas">
        {RIVAL_TACTICAL_SUGGESTED_QUESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => ask(suggestion)}
            className="rounded-full border border-white/[0.07] bg-white/[0.025] px-2.5 py-1.5 text-[9px] font-bold text-slate-400 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70"
          >
            {suggestion}
          </button>
        ))}
      </div>

      {answer ? (
        <div id={responseId} aria-live="polite" className="mt-5 rounded-[1.35rem] bg-[#07111f] p-4 sm:p-5">
          {answer.disclaimer ? (
            <p className="mb-4 rounded-xl border border-amber-300/15 bg-amber-300/[0.06] px-3 py-2 text-xs font-bold leading-5 text-amber-100">
              {answer.disclaimer}
            </p>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            {[
              ['Lectura', answer.reading],
              ['Propuesta', answer.proposal],
              ['Riesgos', answer.risks],
              ['Alternativa', answer.alternative],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0">
                <p className="text-[8px] font-black uppercase tracking-[0.15em] text-slate-500">{label}</p>
                <p className="mt-1.5 text-sm font-semibold leading-6 text-slate-200">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
            <div>
              <p className="text-[8px] font-black uppercase tracking-[0.15em] text-slate-500">Evidencias utilizadas</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {answer.sources.length ? answer.sources.map((source) => (
                  <span key={source} className={`rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-[0.1em] ${sourceTone[source]}`}>
                    {source}
                  </span>
                )) : <span className="text-[10px] font-semibold text-slate-500">Sin fuentes del rival utilizadas</span>}
              </div>
            </div>
            <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[9px] font-black uppercase text-slate-300">
              Confianza {answer.confidence}
            </span>
          </div>
        </div>
      ) : null}
    </section>
  );
}

