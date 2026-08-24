import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const createCollectiveProfileDraft = (profile = {}) => ({
  buildUp: String(profile.buildUp || ''),
  blockHeight: String(profile.blockHeight || ''),
  pressureType: String(profile.pressureType || ''),
  attackingRhythm: String(profile.attackingRhythm || ''),
  preferredAttack: String(profile.preferredAttack || ''),
  strengths: Array.isArray(profile.strengths) ? [...profile.strengths] : [],
  weaknesses: Array.isArray(profile.weaknesses) ? [...profile.weaknesses] : [],
});

export default function CollectiveProfileEditorModal({
  open,
  rivalName,
  profile,
  options,
  onCancel,
  onSave,
}) {
  const [draft, setDraft] = useState(() => createCollectiveProfileDraft(profile));
  const firstFieldRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setDraft(createCollectiveProfileDraft(profile));
    const focusTimer = window.setTimeout(() => firstFieldRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onCancel]);

  if (!open || typeof document === 'undefined') return null;

  const updateField = (field, value) => setDraft((current) => ({ ...current, [field]: value }));
  const scalarFields = [
    ['Salida de balón', 'buildUp', options.buildUp],
    ['Altura del bloque', 'blockHeight', options.blockHeight],
    ['Tipo de presión', 'pressureType', options.pressureType],
    ['Ritmo ofensivo', 'attackingRhythm', options.attackingRhythm],
    ['Ataque preferente', 'preferredAttack', options.preferredAttack],
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-[10060] flex items-end justify-center bg-slate-950/85 p-0 backdrop-blur-sm sm:items-center sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="collective-profile-editor-title"
        className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[1.75rem] border border-white/10 bg-[#091527] shadow-[0_30px_100px_rgba(0,0,0,0.65)] sm:max-w-3xl sm:rounded-[1.75rem]"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/[0.07] px-5 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-caudal-electric">Perfil colectivo</p>
            <h2 id="collective-profile-editor-title" className="mt-1 truncate text-xl font-black text-white">Editar {rivalName || 'rival'}</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">Actualiza únicamente comportamientos colectivos observados.</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cerrar editor del perfil colectivo"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-lg font-black text-slate-300 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70"
          >
            ×
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-2">
            {scalarFields.map(([label, field, fieldOptions], index) => (
              <label key={field} className="grid gap-2 text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">
                <span>{label}</span>
                <select
                  ref={index === 0 ? firstFieldRef : undefined}
                  value={draft[field]}
                  onChange={(event) => updateField(field, event.target.value)}
                  className="h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm font-bold normal-case tracking-normal text-white outline-none transition focus:border-caudal-electric/50 focus:ring-2 focus:ring-caudal-electric/20"
                >
                  <option value="">Sin información registrada</option>
                  {fieldOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
            ))}
          </div>

          <p className="mt-6 rounded-xl border border-white/[0.07] bg-white/[0.025] px-4 py-3 text-xs font-semibold leading-5 text-slate-400">
            Las fortalezas y debilidades se gestionan en su bloque específico de la pestaña Rival para conservar título, descripción, categoría y orden.
          </p>
        </div>

        <footer className="grid shrink-0 grid-cols-2 gap-3 border-t border-white/[0.07] bg-[#081321] px-5 py-4 sm:flex sm:justify-end sm:px-6">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-xl border border-white/10 bg-white/[0.035] px-5 py-2.5 text-xs font-black text-slate-300 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onSave(createCollectiveProfileDraft(draft))}
            className="min-h-11 rounded-xl bg-caudal-electric px-5 py-2.5 text-xs font-black text-slate-950 transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
          >
            Guardar perfil
          </button>
        </footer>
      </section>
    </div>,
    document.body
  );
}
