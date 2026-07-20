import React, { memo, useEffect, useMemo, useState } from 'react';

import {
  NATURAL_POSITION_OPTIONS,
  SPECIFIC_POSITION_CATALOG,
  getNaturalPositionForSpecific,
  getNaturalPositionLabel,
  getPlayerPositionModel,
  getSpecificPositionLabel,
} from '../../constants/playerPositions';
import {
  calculateGlobalPlayerProfileCompletion,
  filterGlobalPlayers,
} from '../../utils/globalPlayerStore';

const VIEW_STORAGE_KEY = 'caudal-global-player-database-view-v1';
const EMPTY_FILTERS = {
  naturalPosition: '',
  specificPosition: '',
  teamId: '',
  trait: '',
  ageMin: '',
  ageMax: '',
  foot: '',
  heightMin: '',
  heightMax: '',
  observed: false,
  isKey: false,
  captain: false,
  injured: false,
  suspended: false,
  hasHistory: false,
  missingPhoto: false,
  incomplete: false,
};
const COMPLETION_FIELD_LABELS = {
  photo: 'foto',
  age: 'edad',
  height: 'altura',
  foot: 'pierna',
  naturalPosition: 'posición natural',
  specificPosition: 'posición específica',
  traits: 'características',
  team: 'equipo actual',
  source: 'fuente',
  scoutingSummary: 'observaciones',
};

const safeArray = (value) => Array.isArray(value) ? value : [];
const normalizeText = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

const getInitials = (name) => String(name || '?')
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0])
  .join('')
  .toUpperCase();

const getAge = (player) => {
  if (player?.dob) {
    const birthDate = new Date(`${player.dob}T00:00:00`);
    if (!Number.isNaN(birthDate.getTime())) {
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      if (today.getMonth() < birthDate.getMonth()
        || (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate())) age -= 1;
      return age;
    }
  }
  const parsed = Number.parseInt(String(player?.age || '').replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('es-ES').format(date);
};

const formatYear = (membership) => {
  const date = membership?.start_date || membership?.created_at;
  if (date) return String(date).slice(0, 4);
  return membership?.season || '—';
};

const getTeamCategory = (team) => team?.category || team?.division || team?.competition || team?.league || '';

function TeamIdentity({ team, compact = false }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className={`${compact ? 'h-7 w-7 rounded-lg text-[9px]' : 'h-9 w-9 rounded-xl text-[10px]'} relative flex shrink-0 items-center justify-center overflow-hidden border border-slate-200 bg-white p-1 font-black text-slate-700 shadow-sm`}>
        <span>{getInitials(team?.name || 'Sin equipo')}</span>
        {team?.crest ? <img src={team.crest} alt={`Escudo de ${team.name}`} onError={(event) => { event.currentTarget.style.display = 'none'; }} className="absolute inset-0 h-full w-full object-contain p-1" /> : null}
      </span>
      <span className="min-w-0">
        <span className={`${compact ? 'text-[11px]' : 'text-xs'} block truncate font-black text-slate-100`}>{team?.name || 'Sin equipo'}</span>
        {getTeamCategory(team) ? <span className="block truncate text-[9px] font-semibold text-slate-500">{getTeamCategory(team)}</span> : null}
      </span>
    </span>
  );
}

function PlayerPhoto({ player, size = 'large' }) {
  const sizeClass = size === 'list' ? 'h-12 w-12 rounded-xl' : size === 'preview' ? 'h-32 w-32 rounded-[1.75rem]' : 'h-24 w-24 rounded-[1.4rem]';
  return (
    <span className={`${sizeClass} relative flex shrink-0 items-center justify-center overflow-hidden border border-white/10 bg-gradient-to-br from-slate-700 to-slate-950 text-xl font-black text-white shadow-[0_14px_28px_rgba(0,0,0,0.24)]`}>
      <span>{getInitials(player.name)}</span>
      {player.photoUrl || player.image ? <img src={player.photoUrl || player.image} alt={player.name} onError={(event) => { event.currentTarget.style.display = 'none'; }} className="absolute inset-0 h-full w-full object-cover" /> : null}
    </span>
  );
}

function CompletionIndicator({ player, compact = false }) {
  const completion = calculateGlobalPlayerProfileCompletion(player);
  const color = completion.percentage === 100
    ? 'text-emerald-200 bg-emerald-300/10 border-emerald-300/20'
    : completion.percentage >= 70
      ? 'text-sky-200 bg-sky-300/10 border-sky-300/20'
      : 'text-amber-100 bg-amber-300/10 border-amber-300/20';
  return (
    <span title={`Campos pendientes: ${completion.missing.map((field) => COMPLETION_FIELD_LABELS[field] || field).join(', ') || 'ninguno'}`} className={`${compact ? 'px-2 py-1' : 'px-2.5 py-1.5'} inline-flex items-center gap-1.5 rounded-xl border ${color}`}>
      <span className="text-xs font-black">{completion.percentage}%</span>
      {!compact ? <span className="text-[8px] font-black uppercase tracking-[0.12em]">{completion.label}</span> : null}
    </span>
  );
}

function PlayerStatusBadges({ player }) {
  const currentMembership = safeArray(player.memberships).find((membership) => membership.is_current) || player.membership || {};
  const badges = [
    [player.captain || currentMembership.captain, 'CAP', 'Capitán', 'border-blue-300/20 bg-blue-300/10 text-blue-100'],
    [player.isKey || currentMembership.is_key, 'DEST', 'Destacado', 'border-amber-300/25 bg-amber-300/10 text-amber-100'],
    [player.injured || player.injuredAlert, 'LES', 'Lesionado', 'border-red-300/25 bg-red-300/10 text-red-100'],
    [player.suspended || player.suspendedAlert || player.sentOffAlert, 'SAN', 'Sancionado', 'border-orange-300/25 bg-orange-300/10 text-orange-100'],
    [player.observed || currentMembership.observed, 'OBS', 'Observado', 'border-violet-300/20 bg-violet-300/10 text-violet-100'],
  ].filter(([visible]) => visible);
  if (!badges.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {badges.map(([, label, title, className]) => <span key={label} title={title} className={`rounded-md border px-1.5 py-0.5 text-[8px] font-black tracking-[0.08em] ${className}`}>{label}</span>)}
    </span>
  );
}

function PlayerTraits({ player, limit = 3 }) {
  const traits = safeArray(player.traits).slice(0, limit);
  if (!traits.length) return null;
  return (
    <span className="flex flex-wrap gap-1.5">
      {traits.map((trait) => (
        <span key={`${trait.category}-${trait.label}`} className={`rounded-lg border px-2 py-1 text-[9px] font-bold ${trait.category === 'strength' ? 'border-emerald-300/15 bg-emerald-300/[0.08] text-emerald-100' : trait.category === 'vulnerability' ? 'border-red-300/15 bg-red-300/[0.08] text-red-100' : 'border-sky-300/15 bg-sky-300/[0.08] text-sky-100'}`}>
          {trait.label}
        </span>
      ))}
    </span>
  );
}

const buildPlayerPresentation = (player, teamById) => {
  const memberships = safeArray(player.memberships);
  const currentMembership = memberships.find((membership) => membership.is_current) || null;
  const currentTeam = currentMembership ? teamById.get(String(currentMembership.team_id)) || null : null;
  const positionModel = getPlayerPositionModel(player);
  const naturalPosition = getNaturalPositionLabel(positionModel.primaryNaturalPosition) || player.position || '';
  const specificPositions = [positionModel.primarySpecificPosition, ...positionModel.secondarySpecificPositions]
    .filter(Boolean)
    .map((key) => getSpecificPositionLabel(key) || key)
    .filter((value, index, array) => array.indexOf(value) === index)
    .slice(0, 2);
  return { memberships, currentMembership, currentTeam, positionModel, naturalPosition, specificPositions };
};

function QuickActions({ player, currentTeam, onEdit, onOpenProfile, onManageTeam, onDuplicate, onOpenTeam, list = false }) {
  const buttonClass = list
    ? 'rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-[9px] font-black text-slate-300 transition hover:border-caudal-electric/30 hover:text-white'
    : 'rounded-lg border border-white/10 bg-slate-950/90 px-2 py-1.5 text-[9px] font-black text-slate-200 shadow transition hover:border-caudal-electric/35 hover:text-white';
  const run = (event, callback) => {
    event.stopPropagation();
    callback?.(player);
  };
  return (
    <span className={`flex flex-wrap gap-1 ${list ? '' : 'pointer-events-none absolute right-3 top-3 z-20 opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100'}`}>
      <button type="button" onClick={(event) => run(event, onEdit)} className={buttonClass}>Editar</button>
      <button type="button" onClick={(event) => run(event, onOpenProfile)} className={buttonClass}>Abrir ficha</button>
      <button type="button" onClick={(event) => run(event, onManageTeam)} className={buttonClass}>Mover</button>
      <button type="button" onClick={(event) => run(event, onDuplicate)} className={buttonClass}>Duplicar</button>
      {currentTeam ? <button type="button" onClick={(event) => { event.stopPropagation(); onOpenTeam?.(currentTeam); }} className={buttonClass}>Abrir equipo</button> : null}
    </span>
  );
}

function PlayerGridCard({ player, teamById, onSelect, ...actions }) {
  const presentation = buildPlayerPresentation(player, teamById);
  const age = getAge(player);
  const unavailable = player.injured || player.injuredAlert || player.suspended || player.suspendedAlert;
  return (
    <article role="button" tabIndex={0} onClick={() => onSelect(player)} onKeyDown={(event) => { if (event.key === 'Enter') onSelect(player); }} className="group relative min-h-[25rem] overflow-hidden rounded-[1.45rem] border border-white/10 bg-[#091428]/90 p-4 text-left shadow-[0_16px_42px_rgba(0,0,0,0.22)] transition duration-200 hover:-translate-y-1 hover:border-caudal-electric/35 hover:shadow-[0_20px_50px_rgba(0,0,0,0.28)]">
      <QuickActions player={player} currentTeam={presentation.currentTeam} {...actions} />
      <div className="flex items-start gap-4">
        <PlayerPhoto player={player} />
        <div className="min-w-0 flex-1 pt-1">
          <div className="flex items-center gap-2">
            <span title={unavailable ? 'No disponible' : 'Disponible'} className={`h-2 w-2 shrink-0 rounded-full ${unavailable ? 'bg-red-400' : 'bg-emerald-400'}`} />
            <h3 className="truncate text-lg font-black leading-tight text-white">{player.name}</h3>
          </div>
          <div className="mt-2"><TeamIdentity team={presentation.currentTeam} compact /></div>
        </div>
      </div>

      <div className="mt-4 min-h-[5.2rem] rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3">
        {presentation.naturalPosition ? <p className="text-sm font-black text-white">{presentation.naturalPosition}</p> : null}
        {presentation.specificPositions.length ? <div className="mt-1.5 flex flex-wrap gap-1">{presentation.specificPositions.map((position) => <span key={position} className="rounded-lg border border-caudal-electric/15 bg-caudal-electric/[0.07] px-2 py-1 text-[9px] font-bold text-caudal-electric">{position}</span>)}</div> : null}
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-semibold text-slate-400">
          {age !== null ? <span>{age} años</span> : null}
          {player.height ? <span>{player.height}</span> : null}
          {player.foot ? <span>Pie {player.foot}</span> : null}
        </div>
      </div>

      <div className="mt-3 min-h-[3.4rem]"><PlayerTraits player={player} /></div>
      <div className="mt-3 flex min-h-7 items-center justify-between gap-2 border-t border-white/[0.07] pt-3">
        <PlayerStatusBadges player={player} />
        <CompletionIndicator player={player} />
      </div>
    </article>
  );
}

function PlayerListRow({ player, teamById, onSelect, ...actions }) {
  const presentation = buildPlayerPresentation(player, teamById);
  const age = getAge(player);
  return (
    <article role="button" tabIndex={0} onClick={() => onSelect(player)} onKeyDown={(event) => { if (event.key === 'Enter') onSelect(player); }} className="group grid gap-3 rounded-2xl border border-white/[0.08] bg-[#091428]/78 p-3 transition hover:border-caudal-electric/30 md:grid-cols-[minmax(220px,1.35fr)_minmax(170px,1fr)_minmax(170px,1fr)_auto] md:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <PlayerPhoto player={player} size="list" />
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-white">{player.name}</p>
          <div className="mt-1"><PlayerStatusBadges player={player} /></div>
        </div>
      </div>
      <TeamIdentity team={presentation.currentTeam} compact />
      <div className="min-w-0">
        {presentation.naturalPosition ? <p className="truncate text-xs font-black text-slate-200">{presentation.naturalPosition}</p> : null}
        {presentation.specificPositions.length ? <p className="mt-0.5 truncate text-[10px] font-semibold text-caudal-electric">{presentation.specificPositions.join(' · ')}</p> : null}
        <p className="mt-0.5 truncate text-[9px] font-semibold text-slate-500">{[age !== null ? `${age} años` : '', player.height, player.foot ? `Pie ${player.foot}` : ''].filter(Boolean).join(' · ')}</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 md:justify-end">
        <CompletionIndicator player={player} compact />
        <QuickActions player={player} currentTeam={presentation.currentTeam} {...actions} list />
      </div>
    </article>
  );
}

function PlayerQuickView({ player, teamById, onClose, onOpenProfile, onManageTeam }) {
  const presentation = buildPlayerPresentation(player, teamById);
  const age = getAge(player);
  const history = [...presentation.memberships].sort((left, right) => String(right.start_date || right.created_at || '').localeCompare(String(left.start_date || left.created_at || '')));
  const strengths = safeArray(player.traits).filter((trait) => trait.category === 'strength');
  const vulnerabilities = safeArray(player.traits).filter((trait) => trait.category === 'vulnerability');
  const teamCount = new Set(presentation.memberships.map((membership) => membership.team_id).filter(Boolean)).size;
  const reportsCount = Number(player.reportsCount || player.reportCount || safeArray(player.reports).length || 0);
  const matchesCount = Number(player.matchesAnalyzed || player.matchCount || safeArray(player.analyzedMatches).length || 0);
  return (
    <div className="fixed inset-0 z-[130] bg-slate-950/65 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="absolute inset-y-0 right-0 w-full max-w-xl overflow-y-auto border-l border-white/10 bg-[#071225] shadow-[-24px_0_70px_rgba(0,0,0,0.45)]">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#071225]/95 px-5 py-4 backdrop-blur">
          <div><p className="text-[9px] font-black uppercase tracking-[0.2em] text-caudal-electric">Vista rápida</p><p className="mt-0.5 text-xs font-semibold text-slate-500">Perfil global de scouting</p></div>
          <button type="button" onClick={onClose} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-slate-300 hover:bg-white/[0.06]">Cerrar</button>
        </div>
        <div className="p-5">
          <div className="flex flex-col gap-5 sm:flex-row">
            <PlayerPhoto player={player} size="preview" />
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-black text-white">{player.name}</h2>
              <div className="mt-3"><TeamIdentity team={presentation.currentTeam} /></div>
              <div className="mt-3 flex flex-wrap gap-2"><PlayerStatusBadges player={player} /><CompletionIndicator player={player} /></div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ['Edad', age !== null ? `${age} años` : '—'],
              ['Altura', player.height || '—'],
              ['Pie', player.foot || '—'],
              ['Posición', presentation.naturalPosition || '—'],
            ].map(([label, value]) => <div key={label} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3"><p className="text-[8px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p><p className="mt-1 text-xs font-black text-white">{value}</p></div>)}
          </div>

          {presentation.specificPositions.length ? <section className="mt-5"><p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">Posiciones específicas</p><div className="mt-2 flex flex-wrap gap-2">{presentation.specificPositions.map((position) => <span key={position} className="rounded-xl border border-caudal-electric/20 bg-caudal-electric/[0.08] px-3 py-1.5 text-[10px] font-bold text-caudal-electric">{position}</span>)}</div></section> : null}

          <section className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ['Equipos', teamCount],
              ['Partidos', matchesCount],
              ['Informes', reportsCount],
              ['Actualizado', player.updatedAt ? formatDate(player.updatedAt) : '—'],
            ].map(([label, value]) => <div key={label} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3 text-center"><p className="text-lg font-black text-white">{value}</p><p className="mt-0.5 text-[8px] font-black uppercase tracking-[0.13em] text-slate-500">{label}</p></div>)}
          </section>

          {history.length ? <section className="mt-6"><p className="text-[9px] font-black uppercase tracking-[0.17em] text-slate-500">Historial de equipos</p><div className="mt-2 space-y-2">{history.map((membership) => { const team = teamById.get(String(membership.team_id)); return <div key={membership.id || `${membership.team_id}-${membership.start_date}`} className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3"><TeamIdentity team={team} compact /><div className="text-right"><p className="text-[10px] font-black text-white">{formatYear(membership)}</p><p className={`text-[8px] font-bold ${membership.is_current ? 'text-emerald-300' : 'text-slate-500'}`}>{membership.is_current ? `Desde ${formatDate(membership.start_date) || 'fecha no registrada'}` : `Hasta ${formatDate(membership.end_date) || 'fecha no registrada'}`}</p></div></div>; })}</div></section> : null}

          {strengths.length || vulnerabilities.length ? <section className="mt-6 grid gap-3 sm:grid-cols-2">{strengths.length ? <div className="rounded-2xl border border-emerald-300/10 bg-emerald-300/[0.04] p-4"><p className="text-[9px] font-black uppercase tracking-[0.15em] text-emerald-200">Fortalezas</p><div className="mt-2"><PlayerTraits player={{ ...player, traits: strengths }} limit={6} /></div></div> : null}{vulnerabilities.length ? <div className="rounded-2xl border border-red-300/10 bg-red-300/[0.04] p-4"><p className="text-[9px] font-black uppercase tracking-[0.15em] text-red-200">Debilidades</p><div className="mt-2"><PlayerTraits player={{ ...player, traits: vulnerabilities }} limit={6} /></div></div> : null}</section> : null}

          {player.scoutingSummary ? <section className="mt-6 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4"><p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">Observaciones</p><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{player.scoutingSummary}</p></section> : null}
          <section className="mt-4 rounded-2xl border border-dashed border-white/[0.08] p-4"><p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">Último informe</p><p className="mt-2 text-xs font-semibold text-slate-500">{player.lastReport?.title || 'Sin informes vinculados al perfil global.'}</p></section>

          <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-white/10 pt-4">
            <button type="button" onClick={() => { onClose(); onManageTeam(player); }} className="rounded-xl border border-white/10 px-4 py-2 text-xs font-black text-slate-200">Gestionar equipo</button>
            <button type="button" onClick={() => { onClose(); onOpenProfile(player); }} className="rounded-xl bg-caudal-electric px-4 py-2 text-xs font-black text-slate-950">Abrir ficha completa</button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function ToggleFilter({ active, label, onClick }) {
  return <button type="button" aria-pressed={active} onClick={onClick} className={`rounded-xl border px-3 py-2 text-[9px] font-black uppercase tracking-[0.08em] transition ${active ? 'border-caudal-electric/30 bg-caudal-electric/12 text-caudal-electric' : 'border-white/[0.08] bg-white/[0.025] text-slate-400 hover:text-slate-200'}`}>{label}</button>;
}

function GlobalPlayerDatabase({
  players = [],
  teams = [],
  loading = false,
  available = true,
  error = '',
  status = '',
  onCreate,
  onEdit,
  onOpenProfile,
  onManageTeam,
  onDuplicate,
  onOpenTeam,
}) {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [filterNotice, setFilterNotice] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [viewMode, setViewMode] = useState(() => {
    if (typeof window === 'undefined') return 'grid';
    return window.localStorage.getItem(VIEW_STORAGE_KEY) === 'list' ? 'list' : 'grid';
  });
  const [visibleLimit, setVisibleLimit] = useState(120);

  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem(VIEW_STORAGE_KEY, viewMode);
  }, [viewMode]);

  useEffect(() => {
    setVisibleLimit(viewMode === 'list' ? 200 : 120);
  }, [search, filters, viewMode]);

  const teamById = useMemo(() => new Map(teams.map((team) => [String(team.id), team])), [teams]);
  const traitOptions = useMemo(() => Array.from(new Set(players.flatMap((player) => safeArray(player.traits).map((trait) => trait.label)).filter(Boolean))).sort((left, right) => left.localeCompare(right, 'es')), [players]);
  const specificPositionGroups = useMemo(() => filters.naturalPosition
    ? [[filters.naturalPosition, SPECIFIC_POSITION_CATALOG[filters.naturalPosition] || []]]
    : Object.entries(SPECIFIC_POSITION_CATALOG), [filters.naturalPosition]);
  const filteredPlayers = useMemo(() => filterGlobalPlayers(players, { ...filters, search, teams }), [players, filters, search, teams]);
  const selectedPlayer = useMemo(() => players.find((player) => String(player.id) === String(selectedPlayerId)) || null, [players, selectedPlayerId]);
  const renderedPlayers = filteredPlayers.slice(0, visibleLimit);
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const changeNaturalPosition = (value) => {
    setFilters((current) => {
      if (current.specificPosition && value && getNaturalPositionForSpecific(current.specificPosition) !== value) {
        setFilterNotice('La posición específica se ha restablecido para mantener filtros coherentes.');
        return { ...current, naturalPosition: value, specificPosition: '' };
      }
      setFilterNotice('');
      return { ...current, naturalPosition: value };
    });
  };
  const clearFilters = () => {
    setSearch('');
    setFilters(EMPTY_FILTERS);
    setFilterNotice('');
  };

  return (
    <main className="space-y-4">
      <section className="rounded-[1.5rem] border border-white/10 bg-[#091428]/90 p-5 shadow-[0_20px_55px_rgba(0,0,0,0.24)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-caudal-electric">Scouting · conocimiento global</p>
            <h2 className="mt-1 text-2xl font-black text-white sm:text-3xl">Base de datos de jugadores</h2>
            <p className="mt-1 max-w-2xl text-sm font-semibold text-slate-500">Perfiles únicos, historial de clubes y conocimiento acumulado del cuerpo técnico.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs font-black text-slate-300">{filteredPlayers.length} jugadores</span>
            <div className="flex rounded-xl border border-white/[0.08] bg-slate-950/30 p-1">
              <button type="button" aria-pressed={viewMode === 'grid'} onClick={() => setViewMode('grid')} className={`rounded-lg px-3 py-1.5 text-[10px] font-black ${viewMode === 'grid' ? 'bg-caudal-electric text-slate-950' : 'text-slate-400'}`}>Cuadrícula</button>
              <button type="button" aria-pressed={viewMode === 'list'} onClick={() => setViewMode('list')} className={`rounded-lg px-3 py-1.5 text-[10px] font-black ${viewMode === 'list' ? 'bg-caudal-electric text-slate-950' : 'text-slate-400'}`}>Lista</button>
            </div>
            <button type="button" onClick={onCreate} disabled={!available} className="rounded-xl bg-caudal-electric px-4 py-2.5 text-xs font-black text-slate-950 transition hover:bg-[#7aacff] disabled:opacity-50">Nuevo jugador</button>
          </div>
        </div>

        <div className="mt-5 grid gap-2 md:grid-cols-2 xl:grid-cols-6">
          <label className="relative md:col-span-2 xl:col-span-2"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">⌕</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} className="field-input pl-9" placeholder="Nombre, equipo, posición, característica, observación…" /></label>
          <select aria-label="Posición natural" value={filters.naturalPosition} onChange={(event) => changeNaturalPosition(event.target.value)} className="field-input"><option value="">Posición natural</option>{NATURAL_POSITION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
          <select aria-label="Posición específica" value={filters.specificPosition} onChange={(event) => { setFilter('specificPosition', event.target.value); setFilterNotice(''); }} className="field-input"><option value="">Posición específica</option>{specificPositionGroups.map(([naturalKey, options]) => <optgroup key={naturalKey} label={getNaturalPositionLabel(naturalKey)}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</optgroup>)}</select>
          <select value={filters.teamId} onChange={(event) => setFilter('teamId', event.target.value)} className="field-input"><option value="">Equipo actual</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}<option value="__without_team__">Sin equipo</option></select>
          <select value={filters.trait} onChange={(event) => setFilter('trait', event.target.value)} className="field-input"><option value="">Característica</option>{traitOptions.map((trait) => <option key={trait} value={trait}>{trait}</option>)}</select>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={() => setAdvancedOpen((current) => !current)} className="rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-[10px] font-black text-slate-300">{advancedOpen ? 'Ocultar filtros avanzados' : 'Más filtros'}{activeFilterCount ? ` · ${activeFilterCount} activos` : ''}</button>
          {(search || activeFilterCount) ? <button type="button" onClick={clearFilters} className="text-[10px] font-black uppercase tracking-[0.12em] text-caudal-electric underline decoration-caudal-electric/30 underline-offset-4">Limpiar filtros</button> : null}
        </div>

        {advancedOpen ? <div className="mt-3 rounded-2xl border border-white/[0.07] bg-slate-950/20 p-3"><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5"><div className="grid grid-cols-2 gap-2"><input type="number" min="14" max="60" value={filters.ageMin} onChange={(event) => setFilter('ageMin', event.target.value)} className="field-input" placeholder="Edad mín." /><input type="number" min="14" max="60" value={filters.ageMax} onChange={(event) => setFilter('ageMax', event.target.value)} className="field-input" placeholder="Edad máx." /></div><select value={filters.foot} onChange={(event) => setFilter('foot', event.target.value)} className="field-input"><option value="">Cualquier pierna</option><option value="derech">Derecha</option><option value="izquierd">Izquierda</option><option value="ambid">Ambidiestro</option></select><div className="grid grid-cols-2 gap-2"><input type="number" min="140" max="220" value={filters.heightMin} onChange={(event) => setFilter('heightMin', event.target.value)} className="field-input" placeholder="Altura mín." /><input type="number" min="140" max="220" value={filters.heightMax} onChange={(event) => setFilter('heightMax', event.target.value)} className="field-input" placeholder="Altura máx." /></div></div><div className="mt-3 flex flex-wrap gap-2"><ToggleFilter active={filters.observed} label="Observado" onClick={() => setFilter('observed', !filters.observed)} /><ToggleFilter active={filters.isKey} label="Destacado" onClick={() => setFilter('isKey', !filters.isKey)} /><ToggleFilter active={filters.captain} label="Capitán" onClick={() => setFilter('captain', !filters.captain)} /><ToggleFilter active={filters.injured} label="Lesionado" onClick={() => setFilter('injured', !filters.injured)} /><ToggleFilter active={filters.suspended} label="Sancionado" onClick={() => setFilter('suspended', !filters.suspended)} /><ToggleFilter active={filters.hasHistory} label="Con historial" onClick={() => setFilter('hasHistory', !filters.hasHistory)} /><ToggleFilter active={filters.missingPhoto} label="Sin foto" onClick={() => setFilter('missingPhoto', !filters.missingPhoto)} /><ToggleFilter active={filters.incomplete} label="Perfil incompleto" onClick={() => setFilter('incomplete', !filters.incomplete)} /></div></div> : null}

        {filterNotice ? <p className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.07] px-3 py-2 text-xs font-bold text-amber-100">{filterNotice}</p> : null}
        {error ? <p className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.08] px-3 py-2 text-xs font-bold text-amber-100">{error}</p> : null}
        {status ? <p className="mt-3 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.08] px-3 py-2 text-xs font-bold text-emerald-100">{status}</p> : null}
      </section>

      {loading ? <div className="empty-state">Cargando base global…</div> : renderedPlayers.length ? (
        <>
          <section className={viewMode === 'grid' ? 'grid gap-4 md:grid-cols-2 2xl:grid-cols-3' : 'space-y-2'}>
            {renderedPlayers.map((player) => viewMode === 'grid'
              ? <PlayerGridCard key={player.id} player={player} teamById={teamById} onSelect={(item) => setSelectedPlayerId(item.id)} onEdit={onEdit} onOpenProfile={onOpenProfile} onManageTeam={onManageTeam} onDuplicate={onDuplicate} onOpenTeam={onOpenTeam} />
              : <PlayerListRow key={player.id} player={player} teamById={teamById} onSelect={(item) => setSelectedPlayerId(item.id)} onEdit={onEdit} onOpenProfile={onOpenProfile} onManageTeam={onManageTeam} onDuplicate={onDuplicate} onOpenTeam={onOpenTeam} />)}
          </section>
          {visibleLimit < filteredPlayers.length ? <div className="flex justify-center"><button type="button" onClick={() => setVisibleLimit((current) => current + (viewMode === 'list' ? 200 : 120))} className="rounded-xl border border-white/10 bg-white/[0.04] px-5 py-2.5 text-xs font-black text-slate-200">Mostrar más · {filteredPlayers.length - visibleLimit} pendientes</button></div> : null}
        </>
      ) : <div className="empty-state">No hay jugadores que coincidan con los filtros.</div>}

      {selectedPlayer ? <PlayerQuickView player={selectedPlayer} teamById={teamById} onClose={() => setSelectedPlayerId('')} onOpenProfile={onOpenProfile} onManageTeam={onManageTeam} /> : null}
    </main>
  );
}

export default memo(GlobalPlayerDatabase);
