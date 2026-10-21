import { useMemo, useRef, useState } from 'react';
import { getSpecificPositionLabel } from '../../constants/playerPositions';
import { layoutPlayerBoardCards, playerCompactLabels, overlappingZonePairs, SESSION_SYSTEMS } from '../../utils/plannedSessionDistributions';
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
  canEdit = false, onFormationChange, onPlayerMove }) {
  const fieldRef = useRef(null);
  const dragRef = useRef(null);
  const [dragPoint, setDragPoint] = useState(null);
  const labels = playerCompactLabels(roster);
  const { cards, unplaced } = useMemo(() => layoutPlayerBoardCards(
    distribution.player_layout || [], roster), [distribution.player_layout, roster]);
  const pointInField = (event) => {
    const box = fieldRef.current?.getBoundingClientRect();
    if (!box?.width || !box?.height) return null;
    return { x: Math.round((event.clientX - box.left) / box.width * 1000) / 10,
      y: Math.round((event.clientY - box.top) / box.height * 1000) / 10,
      inside: event.clientX >= box.left && event.clientX <= box.right &&
        event.clientY >= box.top && event.clientY <= box.bottom };
  };
  const startPlayerDrag = (event, player) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { id: player.player_id, pointerId: event.pointerId,
      startX: event.clientX, startY: event.clientY };
  };
  const movePlayerDrag = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4 && !drag.moved) return;
    drag.moved = true;
    const point = pointInField(event);
    setDragPoint(point ? { ...point, id: drag.id } : null);
  };
  const endPlayerDrag = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = pointInField(event);
    dragRef.current = null;
    setDragPoint(null);
    if (drag.moved && point?.inside) onPlayerMove?.(drag.id, point.x, point.y);
  };
  const playerHandlers = (player) => canEdit ? {
    onPointerDown: (event) => startPlayerDrag(event, player),
    onPointerMove: movePlayerDrag, onPointerUp: endPlayerDrag,
    onPointerCancel: () => { dragRef.current = null; setDragPoint(null); },
  } : {};
  return <div className="planned-distribution-board" aria-label="Distribución de jugadores de la sesión">
    <strong className="planned-distribution-heading">Distribución jugadores disponibles sesión</strong>
    <div className="planned-distribution-meta">{canEdit ? <label className="planned-distribution-system">Sistema
      <select value={distribution.formation_key || ''} onChange={(event) => onFormationChange(event.target.value || null)}>
        <option value="">Sin sistema</option>
        {SESSION_SYSTEMS.map((system) => <option key={system} value={system}>{system}</option>)}
      </select>
    </label> : <span className="planned-distribution-system-read">{distribution.formation_key ? `Sistema ${distribution.formation_key}` : 'Sin sistema'}</span>}</div>
    <div className="planned-distribution-field planned-distribution-player-field" ref={fieldRef}>
      <FieldLines />
      {cards.map((card) => {
        const keys = [...new Set(card.players.map((player) => positionById.get(player.player_id)).filter(Boolean))];
        return <div key={card.key} className={`planned-distribution-player-group${card.manual ? ' planned-distribution-player-manual' : ''}`}
          style={{ left: `${card.left}%`, top: `${card.top}%`, width: `${card.width}%`, height: `${card.height}%` }}>
          {!card.manual ? <b>{keys.map((key) => getSpecificPositionLabel(key) || key).join(' / ')}</b> : null}
          {card.players.map((player) => <span key={player.player_id}
            className={`${statusClass(availability[player.player_id]?.status)}${canEdit ? ' planned-distribution-player-draggable' : ''}`}
            title={player.player_name_snapshot} {...playerHandlers(player)}>
            {labels.get(player.player_id)}
          </span>)}
        </div>;
      })}
      {dragPoint?.inside ? <span className="planned-distribution-player-ghost"
        style={{ left: `${dragPoint.x}%`, top: `${dragPoint.y}%` }}>
        {labels.get(dragPoint.id)}
      </span> : null}
      {!distribution.formation_key ? <span className="planned-distribution-empty">Selecciona un sistema para situar la plantilla.</span> : null}
    </div>
    {unplaced.length ? <div className="planned-distribution-unplaced"><b>Sin ubicación automática</b>
      <span>{unplaced.map((player) => <span key={player.player_id}
        className={`${statusClass(availability[player.player_id]?.status)}${canEdit ? ' planned-distribution-player-draggable' : ''}`}
        title={player.player_name_snapshot} {...playerHandlers(player)}>
        {labels.get(player.player_id)}
      </span>)}</span>
    </div> : null}
    {distribution.formation_key && distribution.player_layout.length !== roster.length ?
      <small role="alert">La distribución no contiene toda la plantilla congelada; recarga antes de guardar.</small> : null}
    {canEdit && distribution.formation_key ?
      <small>Arrastra cualquier nombre al campo y pulsa «Guardar pizarras».</small> : null}
    {!roster.length ? <small>Congela la plantilla de la sesión antes de seleccionar un sistema.</small> : null}
  </div>;
}

const phaseLabel = (key) => PLANNED_PHASES.find((phase) => phase.key === key)?.label || key;

export function SessionSpaceDistribution({ zones = [], slots = [], canEdit = false, onZoneChange }) {
  const fieldRef = useRef(null);
  const dragRef = useRef(null);
  const ordered = PLANNED_PHASES.flatMap((phase) => slots.filter((slot) => slot.phase === phase.key));
  const slotById = new Map(ordered.map((slot, index) => [slot.id, {
    short: `E${index + 1}`, label: `${phaseLabel(slot.phase)} · Ej. ${index + 1}`,
  }]));
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
    <div className="planned-distribution-meta"><span className="planned-distribution-space-summary">
      {visibleZones.length} {visibleZones.length === 1 ? 'ejercicio' : 'ejercicios'}
    </span></div>
    <div className="planned-distribution-field planned-distribution-space-field" ref={fieldRef}>
      <FieldLines />
      {visibleZones.map((zone) => <div key={zone.slot_id}
        className={`planned-distribution-zone planned-distribution-zone-${zone.color} ${zone.provisional ? 'planned-distribution-zone-provisional' : ''} ${overlaps.some((pair) => pair.includes(zone.slot_id)) ? 'planned-distribution-zone-overlap' : ''}`}
        style={{ left: `${zone.x}%`, top: `${zone.y}%`, width: `${zone.w}%`, height: `${zone.h}%` }}
        title={`${slotById.get(zone.slot_id).label}${zone.provisional ? ' · zona provisional' : ''}`}
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
        <span>{slotById.get(zone.slot_id).short}</span>
        {canEdit ? <i data-resize="true" aria-label={`Redimensionar ${slotById.get(zone.slot_id).label}`} /> : null}
      </div>)}
    </div>
    <div className="planned-distribution-legend">
      {visibleZones.map((zone) => <span key={zone.slot_id}>
        <i className={`planned-distribution-swatch planned-distribution-zone-${zone.color}`} />
        {slotById.get(zone.slot_id).label}{zone.provisional ? ' · provisional' : ''}
      </span>)}
    </div>
    {overlaps.length ? <small>Zonas superpuestas: {overlaps.map(([left, right]) =>
      `${slotById.get(left).short} / ${slotById.get(right).short}`).join('; ')}. No implica conflicto temporal.</small> : null}
    {canEdit && visibleZones.length ? <small>Arrastra las zonas; usa la esquina para cambiar su tamaño. Las nuevas son propuestas provisionales.</small> : null}
  </div>;
}
