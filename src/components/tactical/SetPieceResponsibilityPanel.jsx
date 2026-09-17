import PlayerAvatar from '../player/PlayerAvatar';
import { getPlayerDisplayName } from '../../utils/playerDisplayName';
import {
  getSetPieceResponsibility,
  getSetPieceResponsibilitiesForPhase,
} from '../../utils/setPieceResponsibilities';
import { RIVAL_CORNER_REFERENCE_ROLES } from '../../utils/setPieceRivalCornerReferences';

export function SetPieceResponsibilityBadge({ responsibilityId, phase, placement = 'below', capture = false }) {
  const definition = getSetPieceResponsibility(responsibilityId);
  if (!definition || definition.phase !== phase) return null;
  const placementClass = {
    above: 'absolute bottom-[calc(100%+2px)] left-1/2 -translate-x-1/2',
    left: 'absolute right-[calc(50%+22px)] top-3',
    right: 'absolute left-[calc(50%+22px)] top-3',
  }[placement] || '';
  return <span role="img" aria-label={definition.label} data-abp-responsibility-badge="true" className={`pointer-events-none inline-flex min-w-6 items-center justify-center rounded-md border border-caudal-electric/45 bg-caudal-950/90 px-1.5 py-0.5 text-[10px] font-black leading-none tracking-[0.03em] text-white shadow-sm ${capture ? 'tactical-abp-capture-badge' : ''} ${placementClass}`}>{definition.abbreviation}</span>;
}

export default function SetPieceResponsibilityPanel({
  player,
  phase,
  responsibilityId = '',
  canAssign = true,
  feedback = '',
  onAssign,
  onRemove,
  showCornerReferences = false,
  cornerReferenceRoleIds = [],
  onToggleCornerReference,
}) {
  const playerName = getPlayerDisplayName(player);
  const accessiblePlayerName = String(player?.name || '').trim() || playerName;
  const current = getSetPieceResponsibility(responsibilityId);
  const activeId = current?.phase === phase ? current.id : '';
  const options = [...getSetPieceResponsibilitiesForPhase(phase)].sort((left, right) => left.order - right.order);

  return (
    <section aria-label={`Responsabilidad ABP de ${playerName}`} data-abp-responsibility-panel="true" className="min-w-0">
      <div className="flex min-w-0 items-center gap-2.5">
        <PlayerAvatar player={player} className="h-10 w-10 shrink-0 rounded-lg" imgClassName="h-full w-full" fallbackTextClassName="text-[10px]" />
        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-[0.12em] text-caudal-electric">Responsabilidad ABP</p>
          <p className="truncate text-xs font-black text-white">{playerName}</p>
          <p className="truncate text-[10px] font-semibold text-slate-300">{activeId ? `Actual: ${current.label}` : 'Sin responsabilidad'}</p>
        </div>
      </div>
      {showCornerReferences ? (
        <fieldset className="mt-3 border-t border-white/10 pt-2.5">
          <legend className="px-1 text-[9px] font-black uppercase tracking-[0.12em] text-amber-200">Referencia en córner</legend>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            {RIVAL_CORNER_REFERENCE_ROLES.map((role) => {
              const checked = cornerReferenceRoleIds.includes(role.id);
              return (
                <label key={role.id} className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-2 text-[10px] font-black ${checked ? 'border-amber-300/45 bg-amber-300/15 text-white' : 'border-white/10 bg-white/[0.04] text-slate-200'} ${canAssign ? '' : 'cursor-not-allowed opacity-40'}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!canAssign}
                    onChange={() => onToggleCornerReference?.(role.id)}
                    aria-label={`${role.label} para ${accessiblePlayerName}`}
                    className="h-4 w-4 shrink-0 accent-amber-300"
                  />
                  {role.label}
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}
      {!canAssign ? <p className="mt-2 text-[10px] font-semibold text-amber-100">Este jugador ya no ocupa el puesto seleccionado. Revisa el XI.</p> : null}
      <div className="mt-3 grid min-w-0 grid-cols-2 gap-1.5" aria-label="Asignar responsabilidad ABP">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            disabled={!canAssign}
            aria-label={`Asignar ${option.label} a ${accessiblePlayerName}`}
            aria-pressed={activeId === option.id}
            onClick={() => onAssign(option.id)}
            className={`flex min-h-11 min-w-0 items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-caudal-electric disabled:cursor-not-allowed disabled:opacity-40 ${activeId === option.id ? 'border-caudal-electric bg-caudal-electric/20 text-white' : 'border-white/10 bg-white/[0.05] text-slate-200 hover:bg-white/[0.1]'}`}
          >
            <strong className="shrink-0 text-[11px] font-black text-caudal-electric">{option.abbreviation}</strong>
            <span className="min-w-0 text-[10px] font-semibold leading-tight">{option.label}</span>
          </button>
        ))}
      </div>
      <button type="button" disabled={!activeId} aria-label={`Quitar responsabilidad ABP a ${accessiblePlayerName}`} onClick={onRemove} className="mt-2 min-h-10 w-full rounded-lg border border-white/10 bg-white/[0.035] px-2 text-[10px] font-black text-slate-300 outline-none hover:bg-white/[0.09] focus-visible:ring-2 focus-visible:ring-caudal-electric disabled:cursor-not-allowed disabled:opacity-35">Quitar responsabilidad</button>
      {feedback ? <p role="status" aria-live="polite" className="mt-2 rounded-lg border border-amber-300/20 bg-amber-300/10 px-2 py-1.5 text-[10px] font-semibold text-amber-100">{feedback}</p> : null}
    </section>
  );
}
