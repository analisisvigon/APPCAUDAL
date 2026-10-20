import { groupSessionPlayers, PLAYER_STATUSES, sessionPlayerCounts } from '../../utils/plannedSessionPlayers';

const statusLabel = (status) => PLAYER_STATUSES.find((item) => item.key === status)?.label || status;

export default function PlannedSessionRoster({ roster = [], frozen = false, selectedIds = [],
  availability = {}, onSelect, onAvailability, canEdit = false, print = false }) {
  const selected = frozen ? roster : roster.filter((row) => selectedIds.includes(row.id));
  const counts = sessionPlayerCounts(selected, frozen ? availability : {});
  const groups = groupSessionPlayers(roster, frozen);
  return <div className={print ? 'planned-print-roster' : 'planned-sheet-roster'}>
    {groups.map((group) => <div className="planned-roster-group" key={group.key || 'unknown'}>
      <b>{group.label}</b>
      {group.players.map((player) => {
        const checked = frozen || selectedIds.includes(player.id);
        const name = frozen ? player.player_name_snapshot : player.name;
        const state = availability[player.player_id] || { status: 'available', observation: '' };
        if (!checked && print) return null;
        return <div className={`planned-roster-player ${!checked ? 'planned-roster-player-unselected' : ''}`} key={frozen ? player.player_id : player.id}>
          {!frozen && !print && canEdit ? <input type="checkbox" checked={checked}
            aria-label={`Incorporar ${name}`} onChange={(event) => onSelect(player.id, event.target.checked)} /> : null}
          <span className="planned-roster-name">{name}</span>
          {frozen ? <>
            {canEdit && !print ? <select aria-label={`Disponibilidad de ${name}`} value={state.status}
              onChange={(event) => onAvailability(player.player_id, 'status', event.target.value)}>
              {PLAYER_STATUSES.map((option) => <option value={option.key} key={option.key}>{option.label}</option>)}
            </select> : <span className="planned-roster-status">{statusLabel(state.status)}</span>}
            {canEdit && !print ? <details className="planned-roster-observation-editor">
              <summary aria-label={`Editar observación de ${name}`}>{state.observation ? 'Nota' : '+ Nota'}</summary>
              <input className="planned-roster-observation" type="text" maxLength={1000}
                aria-label={`Observación de ${name}`} placeholder="Observación opcional" value={state.observation || ''}
                onChange={(event) => onAvailability(player.player_id, 'observation', event.target.value)} />
            </details>
              : state.observation ? <small className="planned-roster-observation-text">{state.observation}</small> : null}
          </> : null}
        </div>;
      })}
    </div>)}
    {!groups.length ? <p className="planned-roster-empty">{frozen ? 'Plantilla sin jugadores.' : 'No hay jugadores candidatos para esta fecha.'}</p> : null}
    <div className="planned-roster-counts">
      {print && !roster.length ? 'Plantilla de sesión no incorporada' : <>
        {!frozen ? 'Propuesta sin guardar · ' : null}
        Nº jugadores {counts.participants} · Total {counts.total} · Disponibles {counts.available} · Ausentes {counts.absent} · Lesionados {counts.injured} · Trabajo adaptado {counts.adapted}
      </>}
    </div>
  </div>;
}
