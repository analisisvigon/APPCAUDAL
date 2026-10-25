import { createPortal } from 'react-dom';
import { getPlannedDuration, getPlannedLibrarySource, getPlannedLibraryValue, PLANNED_PHASES, plannedMicrocycleDisplay } from '../../utils/plannedSessions';
import { planPlannedSessionPrintSheets } from '../../utils/plannedSessionSheetPages';
import { getPlannedSessionBoardTeams } from '../../utils/plannedSessionBoardTeams';
import TrainingTaskBoardPreview from './TrainingTaskBoardPreview';
import PlannedSessionRoster from './PlannedSessionRoster';
import { SessionPlayerDistribution, SessionSpaceDistribution } from './PlannedSessionDistributionBoards';
import { sessionPlayerCounts } from '../../utils/plannedSessionPlayers';
import { OWN_CLUB_IDENTITY, getOwnClubDisplayName } from '../../constants/clubIdentity';
import './plannedSessionPrint.css';

const CAUDAL_TEAM_ID = '85a16f33-9fe5-44d4-b85d-37d73651ebf6';
const phaseName = (key) => PLANNED_PHASES.find((phase) => phase.key === key)?.label || key;
const value = (input) => String(input ?? '').trim();

function PrintField({ label, children }) {
  return <div className="planned-print-field"><strong>{label}</strong><span>{children || '\u00a0'}</span></div>;
}

function PrintIdentity({ selected, page, leagueLogoUrl }) {
  return <header className="planned-print-identity">
    {(selected?.team_id === CAUDAL_TEAM_ID || [OWN_CLUB_IDENTITY.name, OWN_CLUB_IDENTITY.shortName].includes(selected?.team_name))
      && OWN_CLUB_IDENTITY.crest
      ? <img src={OWN_CLUB_IDENTITY.crest} alt={`Escudo de ${OWN_CLUB_IDENTITY.shortName}`} onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }} />
      : <div className="planned-print-crest-space" />}
    <div><strong>{selected?.team_id === CAUDAL_TEAM_ID ? getOwnClubDisplayName(selected?.team_name) : selected?.team_name || ''}</strong><span>{selected?.label || ''} · Hoja {page}</span></div>
    <div className={`planned-print-crest-space${leagueLogoUrl ? ' planned-print-league-crest' : ''}`} aria-label="Escudo de Liga">
      {leagueLogoUrl ? <img src={leagueLogoUrl} alt="Escudo de Liga" referrerPolicy="no-referrer" /> : null}
    </div>
  </header>;
}

function PrintTask({ item, index }) {
  const library = item.kind === 'library_task';
  const name = library ? getPlannedLibraryValue(item, 'name') : item.title;
  const description = library ? getPlannedLibraryValue(item, 'description') : item.description;
  const material = library ? getPlannedLibraryValue(item, 'material') : '';
  const payload = library ? getPlannedLibraryValue(item, 'editor_payload') || {} : {};
  const teams = library ? getPlannedSessionBoardTeams(payload) : [];
  const source = library ? getPlannedLibrarySource(item) : {};
  const hasBoard = library && Boolean(payload && Object.keys(payload).length);
  return <div className="planned-print-task" data-print-task-id={item.id}>
    <div className="planned-print-task-name"><b>Tarea {String.fromCharCode(65 + index)}</b><strong>{value(name)}</strong></div>
    <div className="planned-print-task-content">
      <div className="planned-print-development"><b>DESARROLLO</b><p>{value(description)}</p>
        {value(material) ? <p className="planned-print-material"><b>Material:</b> {value(material)}</p> : null}
      </div>
      <div className="planned-print-graphic"><b>REPRESENTACIÓN GRÁFICA</b>
        {hasBoard ? <div className="planned-print-board"><TrainingTaskBoardPreview payload={payload} /></div>
          : <div className="planned-print-board-empty" aria-label="Pizarra sin contenido" />}
        {teams.length ? <div className="planned-print-teams">{teams.map((team) =>
          <div key={team.key} style={{ borderLeftColor: team.colorValue || '#333' }}>
            <b>{team.colorName.toLocaleUpperCase('es')}</b> · {team.teamName}: {team.players.join(', ')}
          </div>)}</div> : null}
      </div>
    </div>
    {library && (source.space_width_m != null || source.space_length_m != null) ?
      <div className="planned-print-task-space">Espacio · {source.space_width_m ?? '—'} × {source.space_length_m ?? '—'} m</div> : null}
  </div>;
}

function PrintExercise({ slot, number }) {
  if (!slot) return <div className="planned-print-empty-activation">ACTIVACIÓN</div>;
  const longContent = slot.items.some((item) => value(item.kind === 'library_task'
    ? getPlannedLibraryValue(item, 'description') : item.description).length > 900);
  return <section className={`planned-print-exercise ${slot.items.length > 1 ? 'planned-print-dual' : ''} ${longContent ? 'planned-print-exercise-overflow' : ''}`}
    data-print-slot-id={slot.id}>
    <div className="planned-print-exercise-head"><strong>{phaseName(slot.phase).toLocaleUpperCase('es')} · Ejercicio {number}</strong>
      <span>{value(slot.duration)} min</span></div>
    <div className="planned-print-tasks">{slot.items.map((item, index) =>
      <PrintTask key={item.id} item={item} index={index} />)}</div>
    <div className="planned-print-exercise-foot"><span>Tiempo total: <b>{value(slot.duration)} min</b></span>
      <span>Espacio de trabajo</span></div>
  </section>;
}

export function PlannedSessionPrintPages({ editor, selected, roster = [], availability = {},
  distribution = { formation_key: null, player_layout: [], space_zones: [] }, positionById = new Map(),
  playerDistribution = distribution, leagueLogoUrl = '', sessionValue = '',
  pages = planPlannedSessionPrintSheets(editor.slots) }) {
  const ordered = ['activation', 'main', 'cooldown'].flatMap((phase) => editor.slots.filter((slot) => slot.phase === phase));
  const numberOf = (id) => ordered.findIndex((slot) => slot.id === id) + 1;
  const counts = sessionPlayerCounts(roster, availability);
  const layoutOf = (slots) => {
    if (slots.length === 1) return 'one';
    if (slots.length === 2) return 'two';
    if (slots.length === 3 && slots.every((slot) => slot.items.length === 1)) return 'three';
    return 'grid';
  };
  return <div className="planned-print-pages" data-planned-print-pages>
    {pages.map((page, index) => <article className={`planned-print-sheet ${page.kind === 'cover' ? '' : 'planned-print-sheet-exercises'}`} key={index} data-print-page={index + 1}>
      <PrintIdentity selected={selected} page={index + 1} leagueLogoUrl={leagueLogoUrl} />
      {page.kind === 'cover' ? <>
        <div className="planned-print-meta">
          <PrintField label="Día">{editor.session_date}</PrintField>
          <PrintField label="Hora">{editor.header.starts_at}</PrintField>
          <PrintField label="Lugar">{editor.header.location}</PrintField>
          <PrintField label="Nº jugadores">{roster.length ? counts.participants : '—'}</PrintField>
          <PrintField label="Periodo">{editor.header.period_label}</PrintField>
          <PrintField label="Microciclo">{plannedMicrocycleDisplay(editor.header.morphology_pattern)}</PrintField>
          <PrintField label="Rival">{editor.header.next_opponent_label}</PrintField>
          <PrintField label="Lesionados">{roster.length ? counts.injured : '—'}</PrintField>
        </div>
        <div className="planned-print-cover-details">
          <div className="planned-print-session-numbers"><span>Nº sesión <b>{editor.session_number ?? '—'}</b></span>
            <span>Tº sesión <b>{getPlannedDuration(editor.slots)} min</b></span></div>
          <div className="planned-print-cover-notes">
            <PrintField label="Objetivos">{editor.header.objectives}</PrintField>
            <PrintField label="Material">{editor.header.material}</PrintField>
            <PrintField label="Observaciones">{editor.header.notes}</PrintField>
            <PrintField label="Observaciones post">{editor.header.staff_observations}</PrintField>
          </div>
          <div className="planned-print-session-numbers planned-print-value-metric"><span>VALOR (0–10)<b>{sessionValue === '' || sessionValue == null ? '—' : sessionValue}</b></span></div>
        </div>
        <PlannedSessionRoster roster={roster} frozen availability={availability} print />
        <div className="planned-print-cover-lower">
          <SessionPlayerDistribution distribution={playerDistribution} roster={roster}
            availability={availability} positionById={positionById} />
          <SessionSpaceDistribution zones={distribution.space_zones} slots={editor.slots} />
          <div className="planned-print-cover-activation">{page.activation
            ? <PrintExercise slot={page.activation} number={numberOf(page.activation.id)} />
            : <div className="planned-print-empty-activation">ACTIVACIÓN · ejercicio en la hoja siguiente o sin planificar</div>}</div>
        </div>
      </> : <>
        <h2 className="planned-print-page-title">{index === 1 ? 'PARTE PRINCIPAL · VUELTA A LA CALMA' : 'EJERCICIOS · CONTINUACIÓN'}</h2>
        <div className="planned-print-exercise-grid" data-layout={layoutOf(page.slots)}>{page.slots.map((slot) =>
          <PrintExercise key={slot.id} slot={slot} number={numberOf(slot.id)} />)}</div>
      </>}
    </article>)}
  </div>;
}

export default function PlannedSessionPrint({ editor, selected, pages, printRef, roster, availability,
  distribution, playerDistribution, positionById, leagueLogoUrl, sessionValue }) {
  if (typeof document === 'undefined') return null;
  return createPortal(<div className="planned-print-portal" ref={printRef}>
    <style media="print">{'@page { size: A4 landscape; margin: 0; }'}</style>
    <PlannedSessionPrintPages editor={editor} selected={selected} pages={pages}
      roster={roster} availability={availability} distribution={distribution}
      playerDistribution={playerDistribution}
      positionById={positionById} leagueLogoUrl={leagueLogoUrl} sessionValue={sessionValue} />
  </div>, document.body);
}
