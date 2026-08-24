import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  MAX_RIVAL_SCOUTING_POINTS,
  RIVAL_SCOUTING_POINT_CATEGORIES,
  RIVAL_SCOUTING_POINT_CATEGORY_LABELS,
  addRivalScoutingPoint,
  moveRivalScoutingPoint,
  normalizeRivalScoutingPoints,
  removeRivalScoutingPoint,
  updateRivalScoutingPoint,
} from '../../utils/rivalStrengthsWeaknesses.js';

const emptyDraft = { title: '', description: '', category: '' };

function PointEditor({ draft, tone, onChange, onCancel, onSave }) {
  return (
    <div className={`rounded-xl border p-3 ${tone === 'strength' ? 'border-emerald-300/15 bg-emerald-300/[0.035]' : 'border-rose-300/15 bg-rose-300/[0.035]'}`}>
      <div className="grid gap-2 sm:grid-cols-[150px_1fr]">
        <select
          value={draft.category}
          onChange={(event) => onChange({ ...draft, category: event.target.value })}
          aria-label="Categoría opcional"
          className="h-10 rounded-lg border border-white/10 bg-[#07111f] px-3 text-[10px] font-black uppercase text-slate-200 outline-none focus:border-caudal-electric/50"
        >
          <option value="">Sin categoría</option>
          {RIVAL_SCOUTING_POINT_CATEGORIES.map((category) => (
            <option key={category} value={category}>{RIVAL_SCOUTING_POINT_CATEGORY_LABELS[category]}</option>
          ))}
        </select>
        <input
          autoFocus
          value={draft.title}
          maxLength={90}
          onChange={(event) => onChange({ ...draft, title: event.target.value })}
          placeholder={tone === 'strength' ? 'Título de la fortaleza' : 'Título de la debilidad'}
          className="h-10 min-w-0 rounded-lg border border-white/10 bg-[#07111f] px-3 text-sm font-bold text-white outline-none placeholder:text-slate-600 focus:border-caudal-electric/50"
        />
      </div>
      <textarea
        value={draft.description}
        maxLength={240}
        rows={2}
        onChange={(event) => onChange({ ...draft, description: event.target.value })}
        placeholder="Explicación opcional"
        className="mt-2 min-h-[64px] w-full resize-y rounded-lg border border-white/10 bg-[#07111f] px-3 py-2 text-xs font-semibold leading-5 text-slate-200 outline-none placeholder:text-slate-600 focus:border-caudal-electric/50"
      />
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg border border-white/10 px-3 py-2 text-[9px] font-black uppercase text-slate-400">Cancelar</button>
        <button type="button" disabled={!draft.title.trim()} onClick={onSave} className="rounded-lg bg-caudal-electric px-3 py-2 text-[9px] font-black uppercase text-slate-950 disabled:opacity-35">Guardar</button>
      </div>
    </div>
  );
}

function PointCard({ point, tone, capture, editable, first, last, onEdit, onRemove, onMove }) {
  const accent = tone === 'strength' ? 'border-l-emerald-300/65' : 'border-l-rose-300/65';
  const badge = tone === 'strength'
    ? 'border-emerald-300/15 bg-emerald-300/[0.055] text-emerald-100'
    : 'border-rose-300/15 bg-rose-300/[0.055] text-rose-100';
  return (
    <article className={`border-l-2 ${accent} bg-white/[0.022] ${capture ? 'px-3 py-2.5' : 'px-3.5 py-3'}`}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          {point.category ? <span className={`inline-flex rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-[0.11em] ${badge}`}>{RIVAL_SCOUTING_POINT_CATEGORY_LABELS[point.category]}</span> : null}
          <h4 className={`${point.category ? 'mt-2' : ''} text-sm font-black leading-5 text-white sm:text-[15px]`}>{point.title}</h4>
          {point.description ? <p className="mt-1 text-xs font-semibold leading-5 text-slate-300">{point.description}</p> : null}
        </div>
        {!capture && editable ? (
          <div className="flex shrink-0 flex-wrap justify-end gap-1">
            <button type="button" disabled={first} onClick={() => onMove('up')} aria-label={`Subir ${point.title}`} className="rounded-md border border-white/[0.07] px-2 py-1 text-[8px] font-black uppercase text-slate-500 disabled:opacity-25">Subir</button>
            <button type="button" disabled={last} onClick={() => onMove('down')} aria-label={`Bajar ${point.title}`} className="rounded-md border border-white/[0.07] px-2 py-1 text-[8px] font-black uppercase text-slate-500 disabled:opacity-25">Bajar</button>
            <button type="button" onClick={onEdit} className="rounded-md border border-white/[0.07] px-2 py-1 text-[8px] font-black uppercase text-slate-400">Editar</button>
            <button type="button" onClick={onRemove} className="rounded-md border border-rose-300/10 px-2 py-1 text-[8px] font-black uppercase text-rose-200/75">Eliminar</button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function PointColumn({ kind, title, items, capture, editable, editor, onStartAdd, onStartEdit, onEditorChange, onEditorCancel, onEditorSave, onRemove, onMove }) {
  const tone = kind === 'strengths' ? 'strength' : 'weakness';
  const isEditingThisColumn = editor?.kind === kind;
  const emptyText = tone === 'strength' ? 'No hay fortalezas registradas.' : 'No hay debilidades registradas.';
  return (
    <section className={`min-w-0 ${capture ? 'bg-[#091525]/88 p-4 sm:p-5' : 'rounded-[1.4rem] border border-white/[0.07] bg-black/10 p-4 sm:p-5'}`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className={`text-[10px] font-black uppercase tracking-[0.2em] ${tone === 'strength' ? 'text-emerald-200' : 'text-rose-200'}`}>{title}</h3>
        {!capture ? <span className="text-[8px] font-black uppercase tracking-[0.12em] text-slate-600">{items.length}/{MAX_RIVAL_SCOUTING_POINTS}</span> : null}
      </div>
      <div className={`${capture ? 'mt-3' : 'mt-4'} space-y-2`}>
        {items.length ? items.map((point, index) => (
          editor?.id === point.id ? (
            <PointEditor key={point.id} draft={editor.draft} tone={tone} onChange={onEditorChange} onCancel={onEditorCancel} onSave={onEditorSave} />
          ) : (
            <PointCard
              key={point.id}
              point={point}
              tone={tone}
              capture={capture}
              editable={editable}
              first={index === 0}
              last={index === items.length - 1}
              onEdit={() => onStartEdit(kind, point)}
              onRemove={() => onRemove(kind, point.id)}
              onMove={(direction) => onMove(kind, point.id, direction)}
            />
          )
        )) : (
          <p className={`${capture ? 'py-5 text-[10px] uppercase tracking-[0.14em]' : 'rounded-xl border border-dashed border-white/[0.07] px-3 py-4 text-xs'} font-semibold text-slate-500`}>
            {capture ? 'Sin información registrada' : emptyText}
          </p>
        )}
        {!capture && isEditingThisColumn && !editor.id ? <PointEditor draft={editor.draft} tone={tone} onChange={onEditorChange} onCancel={onEditorCancel} onSave={onEditorSave} /> : null}
      </div>
      {!capture && editable && !isEditingThisColumn && items.length < MAX_RIVAL_SCOUTING_POINTS ? (
        <button type="button" onClick={() => onStartAdd(kind)} className={`mt-3 rounded-lg border px-3 py-2 text-[9px] font-black uppercase ${tone === 'strength' ? 'border-emerald-300/15 text-emerald-200' : 'border-rose-300/15 text-rose-200'}`}>
          + Añadir {tone === 'strength' ? 'fortaleza' : 'debilidad'}
        </button>
      ) : null}
    </section>
  );
}

export default function RivalStrengthsWeaknesses({ rivalName, strengths, weaknesses, editable = true, onChange }) {
  const [editor, setEditor] = useState(null);
  const [captureMode, setCaptureMode] = useState(false);
  const normalized = {
    strengths: normalizeRivalScoutingPoints(strengths, 'strength'),
    weaknesses: normalizeRivalScoutingPoints(weaknesses, 'weakness'),
  };

  useEffect(() => {
    if (!captureMode) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setCaptureMode(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [captureMode]);

  const startAdd = (kind) => setEditor({ kind, id: '', draft: { ...emptyDraft } });
  const startEdit = (kind, point) => setEditor({ kind, id: point.id, draft: { ...point } });
  const saveEditor = () => {
    if (!editor?.draft.title.trim()) return;
    const current = normalized[editor.kind];
    const next = editor.id
      ? updateRivalScoutingPoint(current, editor.id, editor.draft, editor.kind)
      : addRivalScoutingPoint(current, editor.draft, editor.kind);
    onChange?.(editor.kind, next);
    setEditor(null);
  };
  const removePoint = (kind, pointId) => {
    const point = normalized[kind].find((item) => item.id === pointId);
    if (!point || !window.confirm(`¿Eliminar “${point.title}”?`)) return;
    onChange?.(kind, removeRivalScoutingPoint(normalized[kind], pointId, kind));
    if (editor?.id === pointId) setEditor(null);
  };
  const movePoint = (kind, pointId, direction) => {
    onChange?.(kind, moveRivalScoutingPoint(normalized[kind], pointId, direction, kind));
  };

  const columns = (capture) => (
    <div className={`grid items-start gap-3 ${capture ? 'md:grid-cols-2' : 'lg:grid-cols-2'}`}>
      <PointColumn kind="strengths" title="Puntos fuertes" items={normalized.strengths} capture={capture} editable={editable} editor={editor} onStartAdd={startAdd} onStartEdit={startEdit} onEditorChange={(draft) => setEditor((current) => ({ ...current, draft }))} onEditorCancel={() => setEditor(null)} onEditorSave={saveEditor} onRemove={removePoint} onMove={movePoint} />
      <PointColumn kind="weaknesses" title="Puntos débiles" items={normalized.weaknesses} capture={capture} editable={editable} editor={editor} onStartAdd={startAdd} onStartEdit={startEdit} onEditorChange={(draft) => setEditor((current) => ({ ...current, draft }))} onEditorCancel={() => setEditor(null)} onEditorSave={saveEditor} onRemove={removePoint} onMove={movePoint} />
    </div>
  );

  const captureView = captureMode && typeof document !== 'undefined' ? createPortal(
    <div className="fixed inset-0 z-[2147483000] overflow-y-auto bg-[#020812] px-4 py-5 text-white sm:px-7" data-rival-strengths-capture="true" role="dialog" aria-modal="true" aria-label="Fortalezas y debilidades del rival">
      <button type="button" onClick={() => setCaptureMode(false)} className="tactical-capture-exit">Salir de captura</button>
      <div className="mx-auto w-full max-w-6xl">
        <header className="border-b border-caudal-electric/25 pb-4 pr-28">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-caudal-electric sm:text-base">{rivalName || 'Rival'}</p>
          <h1 className="mt-1 text-2xl font-black uppercase tracking-[0.06em] text-white sm:text-3xl">Fortalezas y debilidades</h1>
        </header>
        <main className="mt-4">{columns(true)}</main>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <section className="rounded-[1.8rem] border border-white/[0.07] bg-gradient-to-br from-[#0c1c31] to-[#081422] p-5 shadow-[0_22px_70px_rgba(0,0,0,0.16)] sm:p-6" data-testid="rival-strengths-weaknesses">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-caudal-electric">Scouting colectivo</p>
            <h2 className="mt-1 text-xl font-black text-white sm:text-2xl">Fortalezas y debilidades</h2>
          </div>
          <button type="button" onClick={() => { setEditor(null); setCaptureMode(true); }} className="rounded-xl border border-white/[0.09] bg-white/[0.035] px-3 py-2 text-[9px] font-black uppercase tracking-[0.1em] text-slate-300 transition hover:bg-white/[0.08] hover:text-white">
            Modo captura
          </button>
        </div>
        <div className="mt-5">{columns(false)}</div>
        {!editable ? <p className="mt-3 text-[10px] font-semibold text-amber-100/80">Asocia un equipo rival real al partido para editar este perfil colectivo.</p> : null}
      </section>
      {captureView}
    </>
  );
}
