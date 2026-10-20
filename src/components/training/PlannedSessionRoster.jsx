import { groupSessionPlayers, PLAYER_STATUSES, sessionPlayerCounts } from '../../utils/plannedSessionPlayers';

const statusLabel = (status) => PLAYER_STATUSES.find((item) => item.key === status)?.label || status;
const visualStatus = (status) => status === 'absent' || status === 'injured'
  ? 'planned-roster-player-no-training' : status === 'adapted' ? 'planned-roster-player-adapted' : '';

export default function PlannedSessionRoster({ roster = [], frozen = false, selectedIds = [],
  availability = {}, onSelect, onAvailability, canEdit = false, print = false }) {
  const selected = frozen ? roster : roster.filter((row) => selectedIds.includes(row.id));
  const counts = sessionPlayerCounts(selected, frozen ? availability : {});
  const groups = groupSessionPlayers(roster, frozen);
  return <div className={print ? 'planned-print-roster' : 'planned-sheet-roster'}>
    {groups.map((group) => <div className={`planned-roster-group ${group.players.length > 4 ? 'planned-roster-group-two-columns' : ''}`} key={group.key || 'unknown'}>
      <b>{group.label}</b>
      <div className="planned-roster-players" style={group.players.length > 4
        ? { '--roster-rows': Math.ceil(group.players.length / 2) } : undefined}>
      {group.players.map((player) => {
        const checked = frozen || selectedIds.includes(player.id);
        const name = frozen ? player.player_name_snapshot : player.name;
        const state = availability[player.player_id] || { status: 'available', observation: '' };
        if (!checked && print) return null;
        return <div className={`planned-roster-player ${!checked ? 'planned-roster-player-unselected' : ''} ${frozen ? visualStatus(state.status) : ''}`} key={frozen ? player.player_id : player.id}>
          {!frozen && !print && canEdit ? <input type="checkbox" checked={checked}
            aria-label={`Incorporar ${name}`} onChange={(event) => onSelect(player.id, event.target.checked)} /> : null}
          <span className="planned-roster-name" aria-label={frozen && state.status !== 'available'
            ? `${name}, ${statusLabel(state.status)}` : name}>{name}</span>
          {frozen ? <>
            {canEdit && !print ? <select aria-label={`Disponibilidad de ${name}`} value={state.status}
              onChange={(event) => onAvailability(player.player_id, 'status', event.target.value)}>
              {PLAYER_STATUSES.map((option) => <option value={option.key} key={option.key}>{option.label}</option>)}
            </select> : null}
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
      </div>
    </div>)}
    {!groups.length ? <p className="planned-roster-empty">{frozen ? 'Plantilla sin jugadores.' : 'No hay jugadores candidatos para esta fecha.'}</p> : null}
    <div className="planned-roster-counts">
      {print && !roster.length ? 'Plantilla de sesión no incorporada' : <>
        {!frozen ? 'Propuesta sin guardar · ' : null}
        <span>Nº jugadores <strong>{counts.participants}</strong></span>
        <span>Total <strong>{counts.total}</strong></span>
        <span>Disponibles <strong>{counts.available}</strong></span>
        <span>Ausentes <strong>{counts.absent}</strong></span>
        <span>Lesionados <strong>{counts.injured}</strong></span>
        <span>Trabajo adaptado <strong>{counts.adapted}</strong></span>
      </>}
    </div>
  </div>;
}
