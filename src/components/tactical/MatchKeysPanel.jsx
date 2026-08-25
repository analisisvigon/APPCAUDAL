import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { moveMatchKey, normalizeMatchKeyText } from '../../utils/matchKeys';

const COLUMN_META = {
  offensive: {
    title: 'Claves ofensivas',
    empty: 'Sin claves ofensivas añadidas',
    add: '+ Añadir clave ofensiva',
    accent: 'bg-caudal-electric',
    titleClass: 'text-caudal-electric',
    borderClass: 'border-caudal-electric/15',
    surfaceClass: 'from-caudal-electric/[0.055] to-[#081422]',
    numberClass: 'border-caudal-electric/20 bg-caudal-electric/[0.08] text-caudal-electric',
  },
  defensive: {
    title: 'Claves defensivas',
    empty: 'Sin claves defensivas añadidas',
    add: '+ Añadir clave defensiva',
    accent: 'bg-rose-300',
    titleClass: 'text-rose-200',
    borderClass: 'border-rose-300/15',
    surfaceClass: 'from-rose-300/[0.045] to-[#081422]',
    numberClass: 'border-rose-300/15 bg-rose-300/[0.06] text-rose-200',
  },
};

function KeyEditor({ value, onChange, onCancel, onSave }) {
  return (
    <form onSubmit={(event) => { event.preventDefault(); onSave(); }} className="rounded-xl border border-caudal-electric/20 bg-[#07111f] p-2.5">
      <input
        autoFocus
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Escape') onCancel(); }}
        placeholder="Texto de la clave…"
        aria-label="Texto de la clave"
        className="h-10 w-full rounded-lg border border-white/10 bg-black/15 px-3 text-sm font-bold text-white outline-none focus:border-caudal-electric/45"
      />
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg border border-white/10 px-3 py-2 text-[9px] font-black uppercase text-slate-400">Cancelar</button>
        <button type="submit" disabled={!normalizeMatchKeyText(value)} className="rounded-lg bg-caudal-electric px-3 py-2 text-[9px] font-black uppercase text-slate-950 disabled:opacity-40">Guardar</button>
      </div>
    </form>
  );
}

function MatchKeyCard({ text, index, capture, meta, first, last, onEdit, onRemove, onMove }) {
  if (capture) {
    return (
      <article className={`flex min-w-0 items-start gap-3 rounded-xl border ${meta.borderClass} bg-white/[0.035] px-3 py-2.5 sm:px-4 sm:py-3`}>
        <span className={`flex h-7 w-8 shrink-0 items-center justify-center rounded-lg border text-[11px] font-black tabular-nums ${meta.numberClass}`}>{String(index + 1).padStart(2, '0')}</span>
        <p className="min-w-0 break-words pt-0.5 text-base font-black leading-snug text-white sm:text-lg">{text}</p>
      </article>
    );
  }

  return (
    <article className={`group relative min-w-0 rounded-xl border ${meta.borderClass} bg-black/15 px-2.5 py-2.5`}>
      <div className="flex min-w-0 items-start gap-2">
        <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${meta.accent}`} />
        <p className="min-w-0 flex-1 whitespace-normal text-sm font-bold leading-snug text-slate-100 [overflow-wrap:break-word] [word-break:normal]">{text}</p>
      </div>
      <div className="mt-2 flex min-w-0 flex-wrap justify-end gap-1 border-t border-white/[0.055] pt-1.5 opacity-80 transition group-hover:opacity-100">
        <button type="button" disabled={first} onClick={() => onMove(-1)} className="rounded-md px-1.5 py-1 text-[9px] font-black uppercase text-slate-400 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-25">Subir</button>
        <button type="button" disabled={last} onClick={() => onMove(1)} className="rounded-md px-1.5 py-1 text-[9px] font-black uppercase text-slate-400 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-25">Bajar</button>
        <button type="button" onClick={onEdit} className="rounded-md px-1.5 py-1 text-[9px] font-black uppercase text-slate-300 hover:bg-white/10 hover:text-white">Editar</button>
        <button type="button" onClick={onRemove} className="rounded-md px-1.5 py-1 text-[9px] font-black uppercase text-rose-200 hover:bg-rose-500/15">Eliminar</button>
      </div>
    </article>
  );
}

function MatchKeyColumn({ kind, items, capture, editable, editor, onStartAdd, onStartEdit, onEditorChange, onEditorCancel, onEditorSave, onRemove, onMove }) {
  const meta = COLUMN_META[kind];
  const editingColumn = editor?.kind === kind;
  return (
    <section className={`min-w-0 bg-gradient-to-br ${meta.surfaceClass} ${capture ? 'rounded-2xl border border-white/[0.07] p-3 sm:p-4' : 'rounded-[1.35rem] border border-white/[0.07] p-4'}`}>
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] pb-3">
        <div className="flex items-center gap-2.5">
          <span className={`h-6 w-1 rounded-full ${meta.accent}`} />
          <h3 className={`text-[10px] font-black uppercase tracking-[0.18em] sm:text-xs ${meta.titleClass}`}>{meta.title}</h3>
        </div>
        {!capture ? <span className="rounded-lg border border-white/[0.07] bg-black/15 px-2 py-1 text-[9px] font-black tabular-nums text-slate-500">{items.length}</span> : null}
      </div>
      <div className={`${capture ? 'mt-3' : 'mt-3'} space-y-2`}>
        {items.length ? items.map((text, index) => (
          editor?.kind === kind && editor.index === index ? (
            <KeyEditor key={`${kind}-${index}`} value={editor.text} onChange={onEditorChange} onCancel={onEditorCancel} onSave={onEditorSave} />
          ) : (
            <MatchKeyCard
              key={`${kind}-${text}-${index}`}
              text={text}
              index={index}
              capture={capture}
              meta={meta}
              first={index === 0}
              last={index === items.length - 1}
              onEdit={() => onStartEdit(kind, index, text)}
              onRemove={() => onRemove(kind, index)}
              onMove={(direction) => onMove(kind, index, direction)}
            />
          )
        )) : <p className={`${capture ? 'py-4 text-center text-[10px] uppercase tracking-[0.12em]' : 'rounded-xl border border-dashed border-white/[0.08] px-3 py-4 text-xs'} font-semibold text-slate-500`}>{meta.empty}</p>}
        {!capture && editingColumn && editor.index == null ? <KeyEditor value={editor.text} onChange={onEditorChange} onCancel={onEditorCancel} onSave={onEditorSave} /> : null}
      </div>
      {!capture && editable && !editingColumn ? (
        <button type="button" onClick={() => onStartAdd(kind)} className={`mt-3 w-full rounded-lg border ${meta.borderClass} bg-white/[0.02] px-3 py-2 text-[9px] font-black uppercase tracking-[0.08em] ${meta.titleClass} transition hover:bg-white/[0.06]`}>
          {meta.add}
        </button>
      ) : null}
    </section>
  );
}

export default function MatchKeysPanel({ matchId, groups, editable = true, onChange }) {
  const [editor, setEditor] = useState(null);
  const [captureMode, setCaptureMode] = useState(false);
  const normalized = {
    offensive: Array.isArray(groups?.offensive) ? groups.offensive : [],
    defensive: Array.isArray(groups?.defensive) ? groups.defensive : [],
  };

  useEffect(() => {
    setEditor(null);
    setCaptureMode(false);
  }, [matchId]);

  useEffect(() => {
    if (!captureMode) return undefined;
    const handleKeyDown = (event) => { if (event.key === 'Escape') setCaptureMode(false); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [captureMode]);

  const saveEditor = () => {
    const text = normalizeMatchKeyText(editor?.text);
    if (!editor || !text) return;
    const current = normalized[editor.kind];
    const next = editor.index == null ? [...current, text] : current.map((item, index) => index === editor.index ? text : item);
    onChange?.({ ...normalized, [editor.kind]: next });
    setEditor(null);
  };
  const removeKey = (kind, index) => {
    const text = normalized[kind][index];
    if (!text || !window.confirm(`¿Eliminar “${text}”?`)) return;
    onChange?.({ ...normalized, [kind]: normalized[kind].filter((_, itemIndex) => itemIndex !== index) });
    setEditor(null);
  };
  const moveKey = (kind, index, direction) => onChange?.({ ...normalized, [kind]: moveMatchKey(normalized[kind], index, direction) });
  const columns = (capture) => (
    <div className={`grid min-w-0 items-start gap-3 ${capture ? 'grid-cols-2' : 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'}`}>
      {['offensive', 'defensive'].map((kind) => <MatchKeyColumn key={kind} kind={kind} items={normalized[kind]} capture={capture} editable={editable} editor={editor} onStartAdd={(nextKind) => setEditor({ kind: nextKind, index: null, text: '' })} onStartEdit={(nextKind, index, text) => setEditor({ kind: nextKind, index, text })} onEditorChange={(text) => setEditor((current) => ({ ...current, text }))} onEditorCancel={() => setEditor(null)} onEditorSave={saveEditor} onRemove={removeKey} onMove={moveKey} />)}
    </div>
  );

  const captureView = captureMode && typeof document !== 'undefined' ? createPortal(
    <div className="fixed inset-0 z-[2147483000] overflow-y-auto bg-[#020812] px-4 py-5 text-white sm:px-7" data-match-keys-capture="true" role="dialog" aria-modal="true" aria-label="Claves del partido en modo captura">
      <button type="button" onClick={() => setCaptureMode(false)} className="tactical-capture-exit">Salir de captura</button>
      <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-7xl flex-col justify-center">
        <header className="border-b border-caudal-electric/25 pb-4 text-center">
          <h1 className="text-2xl font-black uppercase tracking-[0.08em] text-white sm:text-3xl">Claves del partido</h1>
          <p className="mt-1 text-xs font-black uppercase tracking-[0.2em] text-slate-400 sm:text-sm">Decisiones del cuerpo técnico</p>
        </header>
        <main className="mt-4">{columns(true)}</main>
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <section className="rounded-[1.45rem] border border-caudal-electric/[0.12] bg-gradient-to-br from-[#0c1c31] to-[#081422] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.20)]" data-testid="match-keys-panel">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-caudal-electric/75">Claves del partido</p>
            <h2 className="mt-1 text-xl font-black text-white">Decisiones del cuerpo técnico</h2>
          </div>
          <button type="button" onClick={() => { setEditor(null); setCaptureMode(true); }} className="rounded-xl border border-white/[0.09] bg-white/[0.035] px-3 py-2 text-[9px] font-black uppercase tracking-[0.1em] text-slate-300 transition hover:bg-white/[0.08] hover:text-white">Modo captura</button>
        </div>
        <div className="mt-5">{columns(false)}</div>
      </section>
      {captureView}
    </>
  );
}
