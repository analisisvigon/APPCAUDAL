import { useState } from 'react';
import { groupSessionPlayers, PLAYER_GROUPS, PLAYER_STATUSES, sessionPlayerCounts } from '../../utils/plannedSessionPlayers';

const statusLabel = (status) => PLAYER_STATUSES.find((item) => item.key === status)?.label || status;
const visualStatus = (status) => status === 'first_team' ? 'planned-roster-player-first-team' : ['absent', 'injured'].includes(status)
  ? 'planned-roster-player-no-training' : status === 'adapted' ? 'planned-roster-player-adapted' : '';
const statusAbbreviations = { injured: 'LES', first_team: '1EQ', adapted: 'ADAP', absent: 'AUS' };

const createGuestId = () => {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  if (!cryptoApi?.getRandomValues) throw new Error('Este navegador no permite crear identificadores seguros para invitados.');
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

function GuestAdder({ group, disabled, onAdd }) {
  const [name, setName] = useState('');
  const [origin, setOrigin] = useState('');
  const [status, setStatus] = useState('available');
  const [error, setError] = useState('');
  return <details className="planned-roster-guest-adder">
    <summary>+ Añadir invitado</summary>
    <form onSubmit={(event) => {
      event.preventDefault();
      const cleanName = name.trim();
      if (!cleanName) { setError('El nombre es obligatorio.'); return; }
      if (cleanName.length > 300 || origin.trim().length > 120) {
        setError('El nombre admite hasta 300 caracteres y el equipo hasta 120.'); return;
      }
      try {
        onAdd({ id: createGuestId(), name: cleanName, origin_team: origin.trim(),
          position_group: group.key, status, is_guest: true });
        setName(''); setOrigin(''); setStatus('available'); setError('');
        event.currentTarget.closest('details').open = false;
      } catch (cause) {
        setError(cause?.message || 'No se pudo crear el identificador del invitado.');
      }
    }}>
      <label>Nombre del jugador <input autoComplete="off" maxLength={300} value={name}
        onChange={(event) => setName(event.target.value)} disabled={disabled} required /></label>
      <label>Equipo de procedencia (opcional) <input autoComplete="off" maxLength={120} value={origin}
        onChange={(event) => setOrigin(event.target.value)} disabled={disabled} /></label>
      <label>Disponibilidad <select value={status} onChange={(event) => setStatus(event.target.value)} disabled={disabled}>
        {PLAYER_STATUSES.map((option) => <option value={option.key} key={option.key}>{option.label}</option>)}
      </select></label>
      {error ? <small role="alert">{error}</small> : null}
      <button type="submit" disabled={disabled}>Añadir</button>
    </form>
  </details>;
}

export default function PlannedSessionRoster({ roster = [], guests = [], frozen = false, selectedIds = [],
  availability = {}, positionById = new Map(), onSelect, onAvailability, onGuestsChange,
  canEdit = false, canEditGuests = false, print = false }) {
  const selected = frozen ? roster : roster.filter((row) => selectedIds.includes(row.id));
  const visibleGuests = guests.filter((guest) => guest.id);
  const counts = sessionPlayerCounts(selected, frozen ? availability : {}, visibleGuests);
  const groupedPlayers = groupSessionPlayers([...roster, ...visibleGuests], frozen, positionById);
  const groups = !print && canEditGuests ? [
    ...PLAYER_GROUPS.filter((group) => group.key).map((group) =>
      groupedPlayers.find((entry) => entry.key === group.key) || { ...group, players: [] }),
    ...groupedPlayers.filter((group) => !group.key),
  ] : groupedPlayers;
  const updateGuest = (guestId, field, value) => onGuestsChange?.(guests.map((guest) =>
    guest.id === guestId ? { ...guest, [field]: value } : guest));

  return <div className={print ? 'planned-print-roster' : 'planned-sheet-roster'}>
    {groups.map((group) => <div className={`planned-roster-group planned-roster-group-${group.key || 'unassigned'} ${group.players.length > 4 ? 'planned-roster-group-two-columns' : ''}`} key={group.key || 'unknown'}>
      <b>{group.label}</b>
      <div className="planned-roster-players" style={group.players.length > 4
        ? { '--roster-rows': Math.ceil(group.players.length / 2) } : undefined}>
      {group.players.map((player) => {
        const isGuest = Boolean(player.is_guest);
        const checked = isGuest || frozen || selectedIds.includes(player.id);
        const name = isGuest ? player.name : frozen ? player.player_name_snapshot : player.name;
        const state = isGuest ? { status: player.status || 'available' }
          : availability[player.player_id] || { status: 'available', observation: '' };
        if (!checked && print) return null;
        const displayName = isGuest && print && player.origin_team
          ? `${name} (${player.origin_team})` : name;
        return <div className={`planned-roster-player ${!checked ? 'planned-roster-player-unselected' : ''} ${frozen || isGuest ? visualStatus(state.status) : ''}`}
          key={isGuest ? `guest-${player.id}` : frozen ? player.player_id : player.id}>
          {!isGuest && !frozen && !print && canEdit ? <input type="checkbox" checked={checked}
            aria-label={`Incorporar ${name}`} onChange={(event) => onSelect(player.id, event.target.checked)} /> : null}
          <span className="planned-roster-name" aria-label={(frozen || isGuest) && state.status !== 'available'
            ? `${displayName}, ${statusLabel(state.status)}` : displayName}>{displayName}</span>
          {isGuest ? <small className="planned-roster-guest-badge">INV</small> : null}
          {(frozen || isGuest) && statusAbbreviations[state.status] ?
            <small className="planned-roster-status-abbreviation" aria-hidden="true">{statusAbbreviations[state.status]}</small> : null}
          {isGuest && !print && canEditGuests ? <>
            <details className="planned-roster-guest-editor">
              <summary aria-label={`Editar invitado ${name}`}>Editar</summary>
              <label>Nombre <input maxLength={300} value={player.name}
                onChange={(event) => updateGuest(player.id, 'name', event.target.value)} /></label>
              <label>Equipo de procedencia <input maxLength={120} value={player.origin_team || ''}
                onChange={(event) => updateGuest(player.id, 'origin_team', event.target.value)} /></label>
              <label>Disponibilidad <select aria-label={`Disponibilidad de invitado ${name}`} value={state.status}
                onChange={(event) => updateGuest(player.id, 'status', event.target.value)}>
                {PLAYER_STATUSES.map((option) => <option value={option.key} key={option.key}>{option.label}</option>)}
              </select></label>
              <button type="button" onClick={() => onGuestsChange?.(guests.filter((guest) => guest.id !== player.id))}>
                Quitar invitado</button>
            </details>
          </> : null}
          {!isGuest && frozen ? <>
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
      {!print && canEditGuests && group.key ? <GuestAdder group={group} disabled={!canEditGuests}
        onAdd={(guest) => onGuestsChange?.([...guests, guest])} /> : null}
    </div>)}
    {!groups.length ? <p className="planned-roster-empty">{frozen ? 'Plantilla sin jugadores.' : 'No hay jugadores candidatos para esta fecha.'}</p> : null}
    <div className="planned-roster-counts">
      {print && !roster.length && !visibleGuests.length ? 'Plantilla de sesión no incorporada' : <>
        {!frozen ? 'Propuesta sin guardar · ' : null}
        <span>Plantilla <strong>{counts.template}</strong></span>
        <span>Invitados <strong>{counts.guests}</strong></span>
        <span>Participantes <strong>{counts.participants}</strong></span>
        <span>Total sesión <strong>{counts.total}</strong></span>
        <span>Disponibles <strong>{counts.available}</strong></span>
        <span>Ausentes <strong>{counts.absent}</strong></span>
        <span>Lesionados <strong>{counts.injured}</strong></span>
        <span>Trabajo adaptado <strong>{counts.adapted}</strong></span>
        {counts.first_team > 0 ? <span>Primer equipo <strong>{counts.first_team}</strong></span> : null}
      </>}
    </div>
  </div>;
}
