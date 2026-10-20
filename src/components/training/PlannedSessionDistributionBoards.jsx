import { useRef } from 'react';
import { getSpecificPositionLabel } from '../../constants/playerPositions';
import { playerCompactLabels, overlappingZonePairs, SESSION_SYSTEMS } from '../../utils/plannedSessionDistributions';
import { PLANNED_PHASES } from '../../utils/plannedSessions';

function FieldLines() {
  return <svg className="planned-distribution-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <rect x="1" y="1" width="98" height="98" fill="none" stroke="currentColor" />
    <path d="M1 50h98M24 1v15h52V1M24 99V84h52v15" fill="none" stroke="currentColor" />
    <circle cx="50" cy="50" r="11" fill="none" stroke="currentColor" />
  </svg>;
}

const statusClass = (status) => ['absent', 'injured'].includes(status)
  ? 'planned-distribution-player-out' : status === 'adapted'
    ? 'planned-distribution-player-adapted' : '';

export function SessionPlayerDistribution({ distribution, roster, availability, positionById,
  canEdit = false, onFormationChange }) {
  const labels = playerCompactLabels(roster);
  const rosterById = new Map(roster.map((row) => [row.player_id, row]));
  const groups = new Map();
  const unplaced = [];
  for (const item of distribution.player_layout || []) {
    const player = rosterById.get(item.player_id);
    if (!player) continue;
    if (item.placement === 'unplaced' || item.x == null || item.y == null) {
      unplaced.push(player); continue;
    }
    const key = `${item.x}:${item.y}`;
    const group = groups.get(key) || { x: item.x, y: item.y, players: [] };
    group.players.push(player);
    groups.set(key, group);
  }
  return <div className="planned-distribution-board" aria-label="Distribución de jugadores de la sesión">
    <strong className="planned-distribution-heading">Distribución jugadores disponibles sesión</strong>
    {canEdit ? <label className="planned-distribution-system">Sistema
      <select value={distribution.formation_key || ''} onChange={(event) => onFormationChange(event.target.value || null)}>
        <option value="">Sin sistema</option>
        {SESSION_SYSTEMS.map((system) => <option key={system} value={system}>{system}</option>)}
      </select>
    </label> : distribution.formation_key ? <span className="planned-distribution-system-read">{distribution.formation_key}</span> : null}
    <div className="planned-distribution-field planned-distribution-player-field">
      <FieldLines />
      {[...groups.values()].map((group) => {
        const keys = [...new Set(group.players.map((player) => positionById.get(player.player_id)).filter(Boolean))];
        const halfHeight = Math.min(44, 4 + group.players.length * 1.7);
        const displayY = Math.max(halfHeight, Math.min(100 - halfHeight, group.y));
        return <div key={`${group.x}:${group.y}`} className="planned-distribution-player-group"
          style={{ left: `${group.x}%`, top: `${displayY}%` }}>
          <b>{keys.map((key) => getSpecificPositionLabel(key) || key).join(' / ')}</b>
          {group.players.map((player) => <span key={player.player_id}
            className={statusClass(availability[player.player_id]?.status)} title={player.player_name_snapshot}>
            {labels.get(player.player_id)}
          </span>)}
        </div>;
      })}
      {!distribution.formation_key ? <span className="planned-distribution-empty">Selecciona un sistema para situar la plantilla.</span> : null}
    </div>
    {unplaced.length ? <div className="planned-distribution-unplaced"><b>Sin ubicación automática</b>
      <span>{unplaced.map((player) => <span key={player.player_id}
        className={statusClass(availability[player.player_id]?.status)} title={player.player_name_snapshot}>
        {labels.get(player.player_id)}
      </span>)}</span>
    </div> : null}
    {distribution.formation_key && distribution.player_layout.length !== roster.length ?
      <small role="alert">La distribución no contiene toda la plantilla congelada; recarga antes de guardar.</small> : null}
    {!roster.length ? <small>Congela la plantilla de la sesión antes de seleccionar un sistema.</small> : null}
  </div>;
}

const phaseLabel = (key) => PLANNED_PHASES.find((phase) => phase.key === key)?.label || key;

export function SessionSpaceDistribution({ zones = [], slots = [], canEdit = false, onZoneChange }) {
  const fieldRef = useRef(null);
  const dragRef = useRef(null);
  const ordered = PLANNED_PHASES.flatMap((phase) => slots.filter((slot) => slot.phase === phase.key));
  const slotById = new Map(ordered.map((slot, index) => [slot.id,
    `${phaseLabel(slot.phase)} · Ej. ${index + 1}`]));
  const visibleZones = zones.filter((zone) => slotById.has(zone.slot_id));
  const overlaps = overlappingZonePairs(visibleZones);
  const move = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !fieldRef.current) return;
    const box = fieldRef.current.getBoundingClientRect();
    const dx = (event.clientX - drag.clientX) / box.width * 100;
    const dy = (event.clientY - drag.clientY) / box.height * 100;
    if (Math.abs(dx) < 0.2 && Math.abs(dy) < 0.2) return;
    drag.moved = true;
    const round = (value) => Math.round(value * 10) / 10;
    const source = drag.zone;
    if (drag.resize) {
      onZoneChange(source.slot_id, { w: round(Math.max(4, Math.min(100 - source.x, source.w + dx))),
        h: round(Math.max(4, Math.min(100 - source.y, source.h + dy))) });
    } else {
      onZoneChange(source.slot_id, { x: round(Math.max(0, Math.min(100 - source.w, source.x + dx))),
        y: round(Math.max(0, Math.min(100 - source.h, source.y + dy))) });
    }
  };
  return <div className="planned-distribution-board" aria-label="Distribución del espacio por ejercicio">
    <strong className="planned-distribution-heading">Distribución del espacio</strong>
    <div className="planned-distribution-field planned-distribution-space-field" ref={fieldRef}>
      <FieldLines />
      {visibleZones.map((zone) => <div key={zone.slot_id}
        className={`planned-distribution-zone planned-distribution-zone-${zone.color} ${zone.provisional ? 'planned-distribution-zone-provisional' : ''} ${overlaps.some((pair) => pair.includes(zone.slot_id)) ? 'planned-distribution-zone-overlap' : ''}`}
        style={{ left: `${zone.x}%`, top: `${zone.y}%`, width: `${zone.w}%`, height: `${zone.h}%` }}
        title={`${slotById.get(zone.slot_id)}${zone.provisional ? ' · zona provisional' : ''}`}
        onPointerDown={canEdit ? (event) => {
          event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY,
            zone, resize: event.target.dataset.resize === 'true' };
        } : undefined}
        onPointerMove={canEdit ? move : undefined}
        onPointerUp={canEdit ? (event) => {
          if (dragRef.current?.pointerId === event.pointerId) {
            if (dragRef.current.moved) onZoneChange(zone.slot_id, { provisional: false });
            dragRef.current = null;
          }
        } : undefined}
        onPointerCancel={canEdit ? () => { dragRef.current = null; } : undefined}>
        <span>{slotById.get(zone.slot_id)}</span>
        {canEdit ? <i data-resize="true" aria-label={`Redimensionar ${slotById.get(zone.slot_id)}`} /> : null}
      </div>)}
    </div>
    <div className="planned-distribution-legend">
      {visibleZones.map((zone) => <span key={zone.slot_id}>
        <i className={`planned-distribution-swatch planned-distribution-zone-${zone.color}`} />
        {slotById.get(zone.slot_id)}{zone.provisional ? ' · provisional' : ''}
      </span>)}
    </div>
    {overlaps.length ? <small>Zonas superpuestas: {overlaps.map(([left, right]) =>
      `${slotById.get(left)} / ${slotById.get(right)}`).join('; ')}. No implica conflicto temporal.</small> : null}
    {canEdit && visibleZones.length ? <small>Arrastra las zonas; usa la esquina para cambiar su tamaño. Las nuevas son propuestas provisionales.</small> : null}
  </div>;
}
