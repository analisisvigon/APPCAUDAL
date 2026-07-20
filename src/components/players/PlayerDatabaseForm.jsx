import { useEffect, useMemo, useState } from 'react';
import {
  NATURAL_POSITION_OPTIONS,
  getNaturalPositionForSpecific,
  getSpecificOptionsForNaturalPositions,
} from '../../constants/playerPositions';
import { PLAYER_TRAIT_CATEGORIES, getPlayerTraitOptions } from '../../constants/playerScoutingCatalog';
import { searchGlobalPlayersForTeam } from '../../utils/globalPlayerStore';

const sourceNames = ['Transfermarkt', 'BeSoccer', 'Web del club', 'Otro'];

export default function PlayerDatabaseForm({
  draft,
  mode = 'create',
  teams = [],
  saving = false,
  error = '',
  photoUploading = false,
  photoError = '',
  matches = [],
  globalPlayers = [],
  onChange,
  onSubmit,
  onCancel,
  onPhotoChange,
  onLinkExisting,
  onAllowDuplicate,
  onDelete,
  onManageTeam,
  onMergeDuplicate,
  sourceAnalysis,
  analyzingSourceUrl = '',
  onAnalyzeSource,
  onApplySourceAnalysis,
  onCloseSourceAnalysis,
}) {
  const [sourceDraft, setSourceDraft] = useState({ url: '', sourceName: 'Otro' });
  const [customTraits, setCustomTraits] = useState({ strength: '', vulnerability: '', trend: '' });
  const [teamEntryMode, setTeamEntryMode] = useState(mode === 'create' && draft.teamId ? 'search' : 'create');
  const [databaseSearch, setDatabaseSearch] = useState('');
  const [sourceFieldSelection, setSourceFieldSelection] = useState({});
  const showTeamEntryChoice = mode === 'create' && Boolean(draft.teamId);
  const databaseResults = useMemo(
    () => searchGlobalPlayersForTeam(globalPlayers, teams, databaseSearch).slice(0, 12),
    [globalPlayers, teams, databaseSearch],
  );
  const getCurrentTeams = (player) => (player.memberships || [])
    .filter((membership) => membership.is_current)
    .map((membership) => teams.find((team) => String(team.id) === String(membership.team_id)))
    .filter(Boolean);
  const naturalKeys = [draft.primaryNaturalPosition, ...(draft.secondaryNaturalPositions || [])].filter(Boolean);
  const specificOptions = useMemo(() => getSpecificOptionsForNaturalPositions(naturalKeys), [naturalKeys.join('|')]);
  const selectedSpecific = [draft.primarySpecificPosition, ...(draft.secondarySpecificPositions || [])].filter(Boolean);
  const incompatibleSpecific = selectedSpecific.filter((key) => {
    const natural = getNaturalPositionForSpecific(key);
    return natural && !naturalKeys.includes(natural);
  });
  const traitOptions = (category) => getPlayerTraitOptions({
    specificPosition: draft.primarySpecificPosition,
    naturalPosition: draft.primaryNaturalPosition,
    category,
  });
  const traitsByCategory = (category) => (draft.traits || []).filter((trait) => trait.category === category);
  const addTrait = (category, label) => {
    const clean = String(label || '').trim();
    if (!clean || (draft.traits || []).some((trait) => trait.category === category && trait.label.toLowerCase() === clean.toLowerCase())) return;
    onChange('traits', [...(draft.traits || []), { category, label: clean }]);
    setCustomTraits((current) => ({ ...current, [category]: '' }));
  };
  const removeTrait = (category, label) => onChange('traits', (draft.traits || []).filter((trait) => !(trait.category === category && trait.label === label)));
  const addSource = () => {
    const url = sourceDraft.url.trim();
    if (!url || (draft.sources || []).some((source) => source.url === url)) return;
    const detectedSourceName = /transfermarkt\./i.test(url) ? 'Transfermarkt' : /besoccer\./i.test(url) ? 'BeSoccer' : sourceDraft.sourceName;
    onChange('sources', [...(draft.sources || []), { ...sourceDraft, sourceName: detectedSourceName, url, isPrimary: !(draft.sources || []).length, analysisStatus: 'not_analyzed', analyzedAt: '', analysisError: '', analysisSummary: {} }]);
    setSourceDraft({ url: '', sourceName: 'Otro' });
  };
  const removeSource = (url) => onChange('sources', (draft.sources || []).filter((source) => source.url !== url).map((source, index) => ({ ...source, isPrimary: index === 0 })));
  const markPrimarySource = (url) => onChange('sources', (draft.sources || []).map((source) => ({ ...source, isPrimary: source.url === url })));

  const getCurrentSourceFieldValue = (field) => {
    if (field === 'rawPosition') return draft.primarySpecificPosition || draft.specificPosition || draft.primaryNaturalPosition || draft.position || '';
    if (field === 'secondaryPositions') return (draft.secondarySpecificPositions || []).join(', ');
    if (field === 'currentTeam') return getCurrentTeams(draft).map((team) => team.name).join(' · ');
    if (field === 'nationality' || field === 'canonicalUrl') return '';
    return draft[field] || (field === 'photoUrl' ? draft.image : '') || '';
  };
  const sourceFieldKey = (field) => field === 'rawPosition' || field === 'secondaryPositions' ? 'position' : field;
  const hasManualSource = (field) => ['manual', 'manual_upload', 'manual_url'].includes(draft.fieldSources?.[sourceFieldKey(field)]?.source);

  useEffect(() => {
    if (!sourceAnalysis?.fields) {
      setSourceFieldSelection({});
      return;
    }
    setSourceFieldSelection(Object.fromEntries(sourceAnalysis.fields.map((field) => [
      field.field,
      !getCurrentSourceFieldValue(field.field) && !hasManualSource(field.field) && !['nationality', 'canonicalUrl'].includes(field.field),
    ])));
  }, [sourceAnalysis]);
  const toggleSecondaryNatural = (key) => onChange(
    'secondaryNaturalPositions',
    (draft.secondaryNaturalPositions || []).includes(key)
      ? draft.secondaryNaturalPositions.filter((item) => item !== key)
      : [...(draft.secondaryNaturalPositions || []), key].filter((item) => item !== draft.primaryNaturalPosition)
  );
  const toggleSecondarySpecific = (key) => onChange(
    'secondarySpecificPositions',
    (draft.secondarySpecificPositions || []).includes(key)
      ? draft.secondarySpecificPositions.filter((item) => item !== key)
      : [...(draft.secondarySpecificPositions || []), key].filter((item) => item !== draft.primarySpecificPosition)
  );

  return (
    <form onSubmit={onSubmit} className="mx-auto max-h-[92vh] max-w-4xl overflow-y-auto rounded-3xl border border-white/10 bg-caudal-950 p-5 shadow-[0_24px_90px_rgba(0,0,0,0.45)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-caudal-electric">Base de datos de jugadores</p>
          <h3 className="mt-1 text-xl font-black text-white">{mode === 'edit' ? 'Editar jugador global' : 'Nuevo jugador global'}</h3>
          <p className="mt-1 text-xs font-semibold text-slate-500">El mismo perfil se utiliza en Equipos, Sistemas Enfrentados, PRE y Lito.</p>
        </div>
        <button type="button" onClick={onCancel} className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm font-bold text-slate-300">Cerrar</button>
      </div>

      {showTeamEntryChoice ? (
        <section className="mt-5 rounded-2xl border border-caudal-electric/20 bg-caudal-electric/[0.05] p-4">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setTeamEntryMode('search')} className={`rounded-xl px-3 py-2 text-xs font-black ${teamEntryMode === 'search' ? 'bg-caudal-electric text-slate-950' : 'border border-white/10 bg-white/[0.04] text-slate-300'}`}>Buscar en base de datos</button>
            <button type="button" onClick={() => setTeamEntryMode('create')} className={`rounded-xl px-3 py-2 text-xs font-black ${teamEntryMode === 'create' ? 'bg-caudal-electric text-slate-950' : 'border border-white/10 bg-white/[0.04] text-slate-300'}`}>Crear jugador nuevo</button>
          </div>
          {teamEntryMode === 'search' ? (
            <div className="mt-4">
              <input type="search" value={databaseSearch} onChange={(event) => setDatabaseSearch(event.target.value)} className="field-input" placeholder="Nombre, posición, equipo actual o anterior" autoFocus />
              <div className="mt-3 max-h-[56vh] space-y-2 overflow-y-auto">
                {databaseResults.length ? databaseResults.map((player) => {
                  const currentTeams = getCurrentTeams(player);
                  const alreadyInTarget = currentTeams.some((team) => String(team.id) === String(draft.teamId));
                  const belongsElsewhere = currentTeams.length && !alreadyInTarget;
                  const specificPosition = player.specificPosition || 'Sin posición específica';
                  const canLink = Boolean(player.globalPlayerId);
                  return (
                    <article key={player.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-black text-white">{player.name}</p>
                          <p className="mt-1 text-xs font-semibold text-slate-400">{specificPosition}</p>
                          <p className="mt-1 text-[10px] font-bold text-caudal-electric">Equipo actual: {currentTeams.length ? currentTeams.map((team) => team.name).join(' · ') : 'Sin equipo'}</p>
                          {belongsElsewhere ? <p className="mt-2 text-[10px] font-bold text-amber-100">Este jugador ya pertenece a {currentTeams.map((team) => team.name).join(' · ')}.</p> : null}
                          {!canLink ? <p className="mt-2 text-[10px] font-bold text-amber-100">Perfil legacy pendiente de convertir. Abre la ficha antes de vincularlo.</p> : null}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {!alreadyInTarget && canLink ? <button type="button" onClick={() => onLinkExisting(player, 'replace')} className="rounded-lg bg-caudal-electric px-2.5 py-1.5 text-[10px] font-black text-slate-950">{belongsElsewhere ? 'Mover a este equipo' : 'Vincular'}</button> : null}
                          {belongsElsewhere ? <button type="button" disabled title="El proyecto permite un único equipo actual" className="cursor-not-allowed rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] font-black text-slate-600">Mantener ambas relaciones</button> : null}
                          {alreadyInTarget ? <span className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1.5 text-[10px] font-black text-emerald-100">Ya vinculado</span> : null}
                          <button type="button" onClick={() => onLinkExisting(player, 'review')} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] font-black text-white">Ver ficha</button>
                        </div>
                      </div>
                    </article>
                  );
                }) : <p className="rounded-xl border border-dashed border-white/10 px-3 py-5 text-center text-xs font-semibold text-slate-500">No hay jugadores que coincidan.</p>}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className={showTeamEntryChoice && teamEntryMode === 'search' ? 'hidden' : ''}>

      <section className="mt-5 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
        <h4 className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Identidad</h4>
        <div className="mt-3 grid gap-4 md:grid-cols-[120px_1fr]">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-white/10 bg-black/20 p-3 text-center text-[10px] font-bold text-slate-400">
            <span className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-white/[0.07] text-lg font-black text-white">
              {draft.photoUrl || draft.image ? <img src={draft.photoUrl || draft.image} alt="" className="h-full w-full object-cover" /> : String(draft.name || 'JG').split(/\s+/).map((part) => part[0]).join('').slice(0, 2)}
            </span>
            {photoUploading ? 'Subiendo…' : 'Cambiar foto'}
            <input type="file" accept="image/*" onChange={onPhotoChange} disabled={photoUploading || saving} className="hidden" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2"><span className="field-label">Nombre</span><input required value={draft.name || ''} onChange={(event) => onChange('name', event.target.value)} className="field-input" placeholder="Nombre del futbolista" /></label>
            <label><span className="field-label">Fecha de nacimiento</span><input type="date" value={draft.dob || ''} onChange={(event) => onChange('dob', event.target.value)} className="field-input" /></label>
            <label><span className="field-label">Edad si no hay fecha</span><input value={draft.age || ''} onChange={(event) => onChange('age', event.target.value)} className="field-input" placeholder="Ej. 24" /></label>
            <label><span className="field-label">Dorsal</span><input value={draft.number || ''} onChange={(event) => onChange('number', event.target.value)} className="field-input" placeholder="Opcional" /></label>
            <label><span className="field-label">Pierna</span><select value={draft.foot || ''} onChange={(event) => onChange('foot', event.target.value)} className="field-input"><option value="">Sin registrar</option><option value="Derecha">Derecha</option><option value="Izquierda">Izquierda</option><option value="Ambas">Ambas</option></select></label>
            <label><span className="field-label">Altura</span><input value={draft.height || ''} onChange={(event) => onChange('height', event.target.value)} className="field-input" placeholder="Ej. 1,82 m" /></label>
            {mode === 'edit' ? (
              <div className="sm:col-span-2">
                <span className="field-label">Equipo actual</span>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
                  <span className="text-sm font-bold text-white">{getCurrentTeams(draft).map((team) => team.name).join(' · ') || 'Sin equipo'}</span>
                  {onManageTeam && draft.globalPlayerId ? <button type="button" onClick={onManageTeam} className="rounded-lg border border-caudal-electric/25 bg-caudal-electric/10 px-3 py-1.5 text-[10px] font-black text-caudal-electric">Gestionar equipo</button> : null}
                </div>
              </div>
            ) : <label className="sm:col-span-2"><span className="field-label">Equipo actual</span><select value={draft.teamId || ''} onChange={(event) => onChange('teamId', event.target.value)} className="field-input"><option value="">Sin equipo asignado</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>}
          </div>
        </div>
        {photoError ? <p className="mt-2 text-xs font-bold text-red-200">{photoError}</p> : null}
      </section>

      {draft.name?.trim() && matches.length ? (
        <section className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/[0.07] p-4">
          <h4 className="text-xs font-black text-amber-100">Posibles jugadores existentes</h4>
          <p className="mt-1 text-[10px] font-semibold text-amber-100/65">No se une automáticamente solo por nombre.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {matches.slice(0, 6).map(({ player, confidence, reason }) => {
              const currentTeams = getCurrentTeams(player);
              const alreadyInTarget = currentTeams.some((team) => String(team.id) === String(draft.teamId));
              const belongsElsewhere = currentTeams.length && !alreadyInTarget;
              const canLink = Boolean(player.globalPlayerId);
              return (
                <div key={player.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="text-[9px] font-black uppercase tracking-[0.12em] text-amber-100">{confidence === 'exact' ? 'Este jugador ya existe' : 'Posible duplicado'}</p>
                  <p className="mt-1 font-black text-white">{player.name}</p>
                  <p className="mt-1 text-[10px] text-slate-400">{player.specificPosition || player.position || 'Sin posición'} · {player.age ? `${player.age} años · ` : ''}{currentTeams.length ? currentTeams.map((team) => team.name).join(' · ') : 'Sin equipo'} ({reason})</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {draft.teamId && !alreadyInTarget && canLink ? <button type="button" onClick={() => onLinkExisting(player, 'replace')} className="rounded-lg bg-caudal-electric px-2.5 py-1.5 text-[10px] font-black text-slate-950">{belongsElsewhere ? 'Mover al equipo actual' : confidence === 'exact' ? 'Vincular al equipo actual' : 'Es el mismo jugador'}</button> : null}
                    {alreadyInTarget ? <span className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1.5 text-[10px] font-black text-emerald-100">Ya vinculado</span> : null}
                    {belongsElsewhere ? <button type="button" disabled title="Solo se permite un equipo actual" className="cursor-not-allowed rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] font-black text-slate-600">Mantener ambas relaciones</button> : null}
                    {mode === 'edit' && canLink && onMergeDuplicate ? <button type="button" onClick={() => onMergeDuplicate(player)} className="rounded-lg border border-red-300/20 bg-red-400/10 px-2.5 py-1.5 text-[10px] font-black text-red-100">Fusionar manualmente</button> : null}
                    <button type="button" onClick={() => onLinkExisting(player, 'review')} className="rounded-lg border border-amber-200/20 px-2.5 py-1.5 text-[10px] font-black text-amber-100">Abrir ficha</button>
                  </div>
                </div>
              );
            })}
          </div>
          {mode === 'create' && !matches.some((match) => match.confidence === 'exact') && onAllowDuplicate ? <button type="button" onClick={onAllowDuplicate} className="mt-3 text-[10px] font-black text-amber-100 underline decoration-amber-200/30 underline-offset-4">He revisado las coincidencias: crear un jugador distinto</button> : null}
        </section>
      ) : null}

      <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
        <h4 className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Posiciones</h4>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div>
            <label><span className="field-label">Posición natural principal</span><select value={draft.primaryNaturalPosition || ''} onChange={(event) => { onChange('primaryNaturalPosition', event.target.value); onChange('secondaryNaturalPositions', (draft.secondaryNaturalPositions || []).filter((key) => key !== event.target.value)); }} className="field-input"><option value="">Sin registrar</option>{NATURAL_POSITION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <p className="mt-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">También puede jugar como</p>
            <div className="mt-2 flex flex-wrap gap-2">{NATURAL_POSITION_OPTIONS.filter((option) => option.value !== draft.primaryNaturalPosition).map((option) => <button key={option.value} type="button" onClick={() => toggleSecondaryNatural(option.value)} className={`rounded-xl border px-3 py-2 text-xs font-bold ${(draft.secondaryNaturalPositions || []).includes(option.value) ? 'border-caudal-electric/40 bg-caudal-electric/15 text-caudal-electric' : 'border-white/10 bg-white/[0.04] text-slate-400'}`}>{(draft.secondaryNaturalPositions || []).includes(option.value) ? '✓ ' : ''}{option.label}</button>)}</div>
          </div>
          <div>
            <label><span className="field-label">Posición específica principal</span><select value={draft.primarySpecificPosition || ''} onChange={(event) => { onChange('primarySpecificPosition', event.target.value); onChange('secondarySpecificPositions', (draft.secondarySpecificPositions || []).filter((key) => key !== event.target.value)); }} className="field-input"><option value="">Sin registrar</option>{specificOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <p className="mt-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Posiciones específicas secundarias</p>
            <div className="mt-2 flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">{specificOptions.filter((option) => option.value !== draft.primarySpecificPosition).map((option) => <button key={option.value} type="button" onClick={() => toggleSecondarySpecific(option.value)} className={`rounded-lg border px-2 py-1.5 text-[10px] font-bold ${(draft.secondarySpecificPositions || []).includes(option.value) ? 'border-caudal-electric/35 bg-caudal-electric/12 text-caudal-electric' : 'border-white/10 bg-white/[0.035] text-slate-400'}`}>{(draft.secondarySpecificPositions || []).includes(option.value) ? '✓ ' : ''}{option.label}</button>)}</div>
          </div>
        </div>
        {incompatibleSpecific.length ? <p className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.07] px-3 py-2 text-xs font-bold text-amber-100">Hay posiciones específicas guardadas fuera de las naturales seleccionadas. No se han borrado; revisa antes de guardar.</p> : null}
      </section>

      <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
        <h4 className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Etiquetas y alertas rápidas</h4>
        <div className="mt-3 flex flex-wrap gap-2">{[['captain', 'Capitán'], ['isKey', 'Jugador destacado'], ['cardAlert', 'Riesgo de sanción'], ['sentOffAlert', 'Expulsado'], ['suspendedAlert', 'Sancionado / no disponible'], ['injuredAlert', 'Lesionado']].map(([field, label]) => <label key={field} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold text-slate-200"><input type="checkbox" checked={Boolean(draft[field])} onChange={(event) => onChange(field, event.target.checked)} className="accent-[#4f8cff]" />{label}</label>)}</div>
      </section>

      <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
        <h4 className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Perfil futbolístico</h4>
        <label className="mt-3 block max-w-xs"><span className="field-label">Prioridad de scouting</span><select value={draft.scoutingPriority || ''} onChange={(event) => onChange('scoutingPriority', event.target.value)} className="field-input"><option value="">Sin priorizar</option><option value="very_high">Muy alta</option><option value="high">Alta</option><option value="medium">Media</option><option value="low">Baja</option></select></label>
        <div className="mt-3 grid gap-4 lg:grid-cols-3">
          {PLAYER_TRAIT_CATEGORIES.map((category) => <div key={category.value} className="rounded-xl border border-white/[0.08] bg-black/15 p-3"><p className="text-xs font-black uppercase text-white">{category.label}</p><div className="mt-2 flex flex-wrap gap-1.5">{traitsByCategory(category.value).map((trait) => <button key={trait.label} type="button" onClick={() => removeTrait(category.value, trait.label)} title="Quitar" className="rounded-lg border border-caudal-electric/20 bg-caudal-electric/10 px-2 py-1 text-[10px] font-bold text-caudal-electric">{trait.label} ×</button>)}</div><select value="" onChange={(event) => addTrait(category.value, event.target.value)} className="field-input mt-3"><option value="">Añadir característica…</option>{traitOptions(category.value).filter((label) => !traitsByCategory(category.value).some((trait) => trait.label === label)).map((label) => <option key={label} value={label}>{label}</option>)}</select><div className="mt-2 flex gap-1"><input value={customTraits[category.value]} onChange={(event) => setCustomTraits((current) => ({ ...current, [category.value]: event.target.value }))} className="field-input min-w-0" placeholder="Etiqueta observable" /><button type="button" onClick={() => addTrait(category.value, customTraits[category.value])} className="rounded-xl border border-white/10 px-3 text-sm font-black text-white">+</button></div></div>)}
        </div>
        <label className="mt-4 block"><span className="field-label">Lectura del cuerpo técnico</span><textarea maxLength={500} value={draft.scoutingSummary || ''} onChange={(event) => onChange('scoutingSummary', event.target.value)} className="field-input min-h-24" placeholder="Resumen breve, observable y útil para preparar el partido" /><span className="mt-1 block text-right text-[9px] font-bold text-slate-600">{String(draft.scoutingSummary || '').length}/500</span></label>
      </section>

      <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
        <h4 className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Fuentes</h4>
        <p className="mt-1 text-[10px] font-semibold text-slate-500">Guardar un enlace no modifica la ficha. Utiliza “Analizar fuente” para extraer datos y revisarlos antes de aplicarlos.</p>
        <div className="mt-3 space-y-2">{(draft.sources || []).map((source) => {
          const status = analyzingSourceUrl === source.url ? 'analyzing' : source.analysisStatus || 'not_analyzed';
          const statusPresentation = {
            not_analyzed: ['Sin analizar', 'text-slate-500'],
            analyzing: ['Analizando…', 'text-caudal-electric'],
            data_found: ['Datos encontrados', 'text-emerald-300'],
            no_data: ['Sin datos compatibles', 'text-amber-200'],
            access_error: ['Error de acceso', 'text-red-200'],
            not_player: ['No parece una ficha de jugador', 'text-orange-200'],
          }[status] || ['Sin analizar', 'text-slate-500'];
          return (
            <div key={source.url} className="rounded-xl border border-white/[0.08] bg-black/15 px-3 py-3">
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black text-white">{source.sourceName || 'Otro'}{source.isPrimary ? ' · Principal' : ''}</p>
                  <p className="truncate text-[10px] text-slate-500">{source.url}</p>
                  <p className={`mt-1 text-[9px] font-black ${statusPresentation[1]}`}>{statusPresentation[0]}</p>
                  {source.analysisError ? <p className="mt-1 text-[9px] font-semibold text-red-200/80">{source.analysisError}</p> : null}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <a href={source.url} target="_blank" rel="noreferrer" className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[9px] font-black text-slate-300">Abrir enlace</a>
                  <button type="button" onClick={() => onAnalyzeSource?.(source)} disabled={Boolean(analyzingSourceUrl)} className="rounded-lg border border-caudal-electric/25 bg-caudal-electric/10 px-2.5 py-1.5 text-[9px] font-black text-caudal-electric disabled:opacity-50">{status === 'analyzing' ? 'Analizando…' : 'Analizar fuente'}</button>
                  {!source.isPrimary ? <button type="button" onClick={() => markPrimarySource(source.url)} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[9px] font-black text-slate-300">Marcar principal</button> : null}
                  <button type="button" onClick={() => removeSource(source.url)} className="rounded-lg border border-red-300/15 px-2.5 py-1.5 text-[9px] font-black text-red-200">Quitar</button>
                </div>
              </div>
            </div>
          );
        })}</div>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_160px_auto]"><input type="url" value={sourceDraft.url} onChange={(event) => setSourceDraft((current) => ({ ...current, url: event.target.value }))} className="field-input" placeholder="https://…" /><select value={sourceDraft.sourceName} onChange={(event) => setSourceDraft((current) => ({ ...current, sourceName: event.target.value }))} className="field-input">{sourceNames.map((name) => <option key={name}>{name}</option>)}</select><button type="button" onClick={addSource} className="rounded-xl border border-caudal-electric/25 bg-caudal-electric/10 px-3 py-2 text-xs font-black text-caudal-electric">Añadir fuente</button></div>
      </section>

      {sourceAnalysis ? (
        <section className="mt-4 rounded-2xl border border-caudal-electric/20 bg-caudal-electric/[0.045] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-caudal-electric">Datos encontrados</p>
              <p className="mt-1 text-xs font-semibold text-slate-400">{sourceAnalysis.sourceType === 'transfermarkt' ? 'Transfermarkt' : sourceAnalysis.sourceType === 'besoccer' ? 'BeSoccer' : 'Analizador genérico'} · {sourceAnalysis.pageType || 'tipo desconocido'}</p>
            </div>
            <button type="button" onClick={onCloseSourceAnalysis} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[9px] font-black text-slate-300">Cerrar revisión</button>
          </div>
          {sourceAnalysis.status === 'not_player' ? <p className="mt-3 rounded-xl border border-orange-300/20 bg-orange-300/[0.08] px-3 py-2 text-xs font-bold text-orange-100">La página no parece ser una ficha individual de jugador. Se conserva como referencia, pero no se aplicarán datos dudosos.</p> : null}
          {sourceAnalysis.status === 'no_data' ? <p className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.08] px-3 py-2 text-xs font-bold text-amber-100">No se han podido extraer datos automáticamente de esta página. La fuente queda guardada como referencia.</p> : null}
          {sourceAnalysis.fields?.length ? (
            <div className="mt-3 space-y-2">
              {sourceAnalysis.fields.map((field) => {
                const labels = { name: 'Nombre', photoUrl: 'Fotografía', dob: 'Fecha de nacimiento', age: 'Edad', rawPosition: 'Posición', secondaryPositions: 'Posiciones secundarias', height: 'Altura', foot: 'Pierna dominante', number: 'Dorsal', currentTeam: 'Equipo actual', nationality: 'Nacionalidad', canonicalUrl: 'Enlace canónico' };
                const currentValue = getCurrentSourceFieldValue(field.field);
                const foundValue = Array.isArray(field.value) ? field.value.join(', ') : field.value;
                const informationalOnly = ['nationality', 'canonicalUrl'].includes(field.field);
                const manualProtected = hasManualSource(field.field);
                return (
                  <article key={field.field} className="rounded-xl border border-white/[0.08] bg-black/20 p-3">
                    <div className="grid gap-3 sm:grid-cols-[130px_1fr_auto] sm:items-center">
                      <div><p className="text-[10px] font-black text-white">{labels[field.field] || field.field}</p><p className={`mt-1 text-[8px] font-black uppercase ${field.confidence === 'high' ? 'text-emerald-300' : 'text-amber-200'}`}>Confianza {field.confidence === 'high' ? 'alta' : 'media'}</p></div>
                      <div className="min-w-0 text-[10px]"><p className="text-slate-500">Actual: <span className="font-bold text-slate-300">{currentValue || 'Sin información'}</span></p>{field.field === 'photoUrl' ? <img src={field.value} alt="Vista previa encontrada" className="mt-2 h-20 w-20 rounded-xl border border-white/10 object-cover" /> : <p className="mt-1 break-words text-slate-500">Encontrado: <span className="font-bold text-white">{String(foundValue)}</span></p>}<p className="mt-1 line-clamp-2 text-[8px] italic text-slate-600">Evidencia: {field.evidence || 'Dato estructurado'}</p>{manualProtected ? <p className="mt-1 text-[8px] font-black text-amber-200">Dato manual protegido: se mantiene por defecto.</p> : null}</div>
                      {!informationalOnly ? <div className="flex gap-1 sm:flex-col"><button type="button" onClick={() => setSourceFieldSelection((current) => ({ ...current, [field.field]: false }))} className={`rounded-lg border px-2 py-1.5 text-[8px] font-black ${!sourceFieldSelection[field.field] ? 'border-white/20 bg-white/10 text-white' : 'border-white/10 text-slate-500'}`}>Mantener actual</button><button type="button" onClick={() => setSourceFieldSelection((current) => ({ ...current, [field.field]: true }))} className={`rounded-lg border px-2 py-1.5 text-[8px] font-black ${sourceFieldSelection[field.field] ? 'border-caudal-electric/30 bg-caudal-electric/15 text-caudal-electric' : 'border-white/10 text-slate-500'}`}>Usar encontrado</button></div> : <span className="text-[8px] font-black uppercase text-slate-600">Informativo</span>}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
          {sourceAnalysis.status === 'data_found' ? <div className="mt-4 flex justify-end"><button type="button" onClick={() => onApplySourceAnalysis?.(sourceAnalysis, sourceFieldSelection)} className="rounded-xl bg-caudal-electric px-4 py-2 text-xs font-black text-slate-950">Aplicar selección a la ficha</button></div> : null}
        </section>
      ) : null}

      {draft.memberships?.length ? <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.025] p-4"><h4 className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Historial de equipos</h4><div className="mt-3 space-y-2">{draft.memberships.map((membership) => { const team = teams.find((item) => item.id === membership.team_id); return <div key={membership.id} className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-black/15 px-3 py-2 text-xs"><span className="font-bold text-white">{membership.season || 'Temporada sin indicar'} · {team?.name || 'Equipo'}</span><span className={membership.is_current ? 'font-black text-emerald-300' : 'text-slate-500'}>{membership.is_current ? 'Actual' : membership.end_date || 'Finalizada'}</span></div>; })}</div></section> : null}

      {error ? <p className="mt-4 rounded-xl border border-red-300/20 bg-red-400/10 px-3 py-2 text-sm font-bold text-red-100">{error}</p> : null}
      <div className="mt-5 flex flex-wrap justify-between gap-2">
        <div>{mode === 'edit' && onDelete ? <button type="button" onClick={onDelete} disabled={saving} className="rounded-xl border border-red-300/20 bg-red-400/10 px-4 py-2 text-sm font-bold text-red-100">Eliminar perfil</button> : null}</div>
        <div className="flex gap-2"><button type="button" onClick={onCancel} className="rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-bold text-slate-200">Cancelar</button><button type="submit" disabled={saving || photoUploading} className="rounded-xl bg-caudal-electric px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar jugador'}</button></div>
      </div>
      </div>
    </form>
  );
}
