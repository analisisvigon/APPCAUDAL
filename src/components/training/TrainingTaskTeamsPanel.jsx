import { useMemo, useState } from 'react';
import { TRAINING_BOARD_PALETTE } from '../../utils/trainingTaskBoardElements';
import {
  createTrainingTaskPlayerRef, getTrainingTaskAssignment, getTrainingTaskPlayerRefKey,
  isTrainingTaskPlayerPlaced, normalizeTrainingTaskAssignments, resolveTrainingTaskPlayerRef,
  TRAINING_TASK_TEAM_KEYS,
} from '../../utils/trainingTaskRoster';

const TEAM_LABELS = { 'team-1': 'Equipo 1', 'team-2': 'Equipo 2', 'team-3': 'Equipo 3', neutral: 'Comodines' };
const text = (value) => String(value ?? '').trim();

export function TrainingTaskRosterToolbar({ assignments, players, elements, activeTool, onToolChange }) {
  const normalized = normalizeTrainingTaskAssignments(assignments);
  if (!normalized.players.length) return null;
  return <div className="mt-2 rounded-xl border border-white/10 bg-black/20 p-2" aria-label="Jugadores asignados a la tarea">
    <div className="flex flex-wrap gap-1.5">{normalized.players.map((assignment) => {
      const key = getTrainingTaskPlayerRefKey(assignment.playerRef);
      const resolved = resolveTrainingTaskPlayerRef(assignment.playerRef, players);
      const placed = isTrainingTaskPlayerPlaced(elements, assignment.playerRef);
      return <button key={key} type="button" disabled={placed} title={placed ? 'Ya está colocado en el campo' : `Colocar a ${resolved.display.name}`} onClick={() => onToolChange(`roster:${key}`)} className={`min-h-9 rounded-lg border px-2.5 text-[10px] font-black ${activeTool === `roster:${key}` ? 'border-caudal-electric bg-caudal-electric/15 text-caudal-electric' : 'border-white/10 bg-white/[0.05] text-slate-300'} disabled:opacity-35`}>
        {resolved.display.number ? `${resolved.display.number} · ` : ''}{resolved.display.name}{placed ? ' ✓' : ''}
      </button>;
    })}</div>
  </div>;
}

export default function TrainingTaskTeamsPanel({ players = [], assignments, elements = [], readOnly = false, onAssign, onRemove, onTeamColor }) {
  const normalized = normalizeTrainingTaskAssignments(assignments);
  const [activeTeam, setActiveTeam] = useState('team-1');
  const [search, setSearch] = useState('');
  const visible = useMemo(() => players.filter((player) => {
    const haystack = `${player.name || ''} ${player.shirtName || ''} ${player.number || ''} ${player.position || ''} ${player.specificPosition || ''}`.toLocaleLowerCase('es');
    return haystack.includes(search.trim().toLocaleLowerCase('es'));
  }), [players, search]);
  const counts = Object.fromEntries(TRAINING_TASK_TEAM_KEYS.map((teamKey) => [teamKey, normalized.players.filter((entry) => entry.teamKey === teamKey).length]));
  const cards = readOnly ? normalized.players.map((assignment) => ({ assignment, resolved: resolveTrainingTaskPlayerRef(assignment.playerRef, players) })) : visible.map((player) => {
    const ref = createTrainingTaskPlayerRef(player); return { player, assignment: getTrainingTaskAssignment(normalized, ref), resolved: resolveTrainingTaskPlayerRef(ref, players) };
  });
  return <section className="mt-3 rounded-xl border border-white/10 bg-[#071526]/80 p-3" aria-label="Equipos de la tarea">
    <div className="flex flex-wrap items-center gap-2">{TRAINING_TASK_TEAM_KEYS.map((teamKey) => <button key={teamKey} type="button" disabled={readOnly} aria-pressed={activeTeam === teamKey} onClick={() => setActiveTeam(teamKey)} className={`min-h-10 rounded-xl border px-3 text-xs font-black ${activeTeam === teamKey ? 'border-caudal-electric bg-caudal-electric/15 text-white' : 'border-white/10 bg-white/[0.04] text-slate-400'}`}><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: TRAINING_BOARD_PALETTE[normalized.teamColors[teamKey]]?.value }} />{TEAM_LABELS[teamKey]} · {counts[teamKey]}</button>)}</div>
    {!readOnly ? <div className="mt-3 flex flex-wrap items-center gap-2"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar jugador, dorsal o posición" className="min-h-10 min-w-64 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none" /><span className="text-[10px] font-black uppercase text-slate-500">Color {TEAM_LABELS[activeTeam]}</span>{Object.values(TRAINING_BOARD_PALETTE).slice(0, 7).map((color) => <button key={color.key} type="button" aria-label={`Color ${color.label}`} onClick={() => onTeamColor(activeTeam, color.key)} className={`h-8 w-8 rounded-full border-2 ${normalized.teamColors[activeTeam] === color.key ? 'border-caudal-electric ring-2 ring-caudal-electric/30' : 'border-white/30'}`} style={{ backgroundColor: color.value }} />)}</div> : null}
    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{cards.map(({ player, assignment, resolved }) => {
      const ref = assignment?.playerRef || createTrainingTaskPlayerRef(player);
      const key = getTrainingTaskPlayerRefKey(ref);
      const assignedColor = assignment ? TRAINING_BOARD_PALETTE[assignment.colorKey]?.value : null;
      return <article key={key} className="flex min-w-0 items-center gap-2 rounded-xl border bg-white/[0.035] p-2" style={{ borderColor: assignedColor || 'rgba(255,255,255,.1)' }}>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10 text-xs font-black text-white">{resolved.display.image ? <img src={resolved.display.image} alt="" className="h-full w-full object-cover" /> : resolved.display.number || resolved.display.name.slice(0, 2).toUpperCase()}</div>
        <div className="min-w-0 flex-1"><p className="truncate text-xs font-black text-white">{resolved.display.name}{resolved.unavailable ? ' · no disponible' : ''}</p><p className="truncate text-[10px] text-slate-500">{resolved.display.number ? `#${resolved.display.number} · ` : ''}{resolved.display.specificPosition || resolved.display.position || 'Sin posición'}{assignment && isTrainingTaskPlayerPlaced(elements, ref) ? ' · en campo' : ''}</p></div>
        {!readOnly ? <div className="flex shrink-0 flex-col gap-1"><button type="button" onClick={() => onAssign(player, activeTeam)} className="rounded-lg bg-white/[0.08] px-2 py-1 text-[9px] font-black text-slate-200">{assignment ? activeTeam === assignment.teamKey ? 'Asignado' : 'Mover' : 'Añadir'}</button>{assignment ? <button type="button" onClick={() => onRemove(assignment)} className="rounded-lg px-2 py-1 text-[9px] font-black text-red-200">Quitar</button> : null}</div> : null}
      </article>;
    })}</div>
    {!cards.length ? <p className="py-6 text-center text-xs text-slate-500">{players.length ? 'No hay coincidencias.' : 'La plantilla activa no contiene jugadores.'}</p> : null}
  </section>;
}
