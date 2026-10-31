import { useMemo, useRef, useState } from 'react';
import { layoutPlayerBoardCards, playerCompactLabels, overlappingZonePairs,
  resolvePlayerBoardDrop, SESSION_SYSTEMS } from '../../utils/plannedSessionDistributions';
import { PLANNED_PHASES } from '../../utils/plannedSessions';
import { fieldIsMeasured, metresFromZone, validMetres } from '../../utils/plannedSessionFieldScale';

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
  canEdit = false, onFormationChange, onPlayerMove, onFixDefault, defaultButtonDisabled = false }) {
  const fieldRef = useRef(null);
  const unplacedRef = useRef(null);
  const dragRef = useRef(null);
  const [dragPoint, setDragPoint] = useState(null);
  const labels = playerCompactLabels(roster);
  const { cards, unplaced, legacy } = useMemo(() => layoutPlayerBoardCards(
    distribution.player_layout || [], roster, positionById, distribution.formation_key),
  [distribution.player_layout, roster, positionById, distribution.formation_key]);
  const dropTarget = dragPoint?.inside ? resolvePlayerBoardDrop(cards, dragPoint) : null;
  const overUnplaced = (event) => {
    const box = unplacedRef.current?.getBoundingClientRect();
    return box && event.clientX >= box.left && event.clientX <= box.right &&
      event.clientY >= box.top && event.clientY <= box.bottom;
  };
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
    setDragPoint(point ? { ...point, id: drag.id, unplaced: overUnplaced(event) } : null);
  };
  const endPlayerDrag = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = pointInField(event);
    dragRef.current = null;
    setDragPoint(null);
    if (!drag.moved) return;
    if (overUnplaced(event)) onPlayerMove?.(drag.id, null);
    else if (point?.inside) {
      const target = resolvePlayerBoardDrop(cards, point);
      if (target) onPlayerMove?.(drag.id, target);
    }
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
        return <div key={card.key} className={`planned-distribution-player-group${card.compact ? ' planned-distribution-player-group-compact' : ''}${card.manual ? ' planned-distribution-player-manual' : ''}${dropTarget?.groupKey === card.key ? ' planned-distribution-player-drop-target' : ''}`}
          style={{ left: `${card.left}%`, top: `${card.top}%`, width: `${card.width}%`, minHeight: `${card.height}%` }}
          title={`${card.title} · ${card.players.length} jugadores`}>
          <b>{card.shortTitle}</b>
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
    {canEdit && distribution.formation_key ? <button type="button"
      className="planned-distribution-reset" onClick={() => onFormationChange?.(distribution.formation_key)}>
      Restablecer distribución automática</button> : null}
    {unplaced.length || (canEdit && distribution.formation_key) ? <div ref={unplacedRef}
      className={`planned-distribution-unplaced${dragPoint?.unplaced ? ' planned-distribution-unplaced-target' : ''}`}>
      <b>Sin ubicación automática</b>
      <span>{unplaced.map((player) => <span key={player.player_id}
        className={`${statusClass(availability[player.player_id]?.status)}${canEdit ? ' planned-distribution-player-draggable' : ''}`}
        title={player.player_name_snapshot} {...playerHandlers(player)}>
        {labels.get(player.player_id)}
      </span>)}</span>
    </div> : null}
    {canEdit && onFixDefault ? <button type="button" className="planned-board-default-button"
      disabled={defaultButtonDisabled || !distribution.formation_key || !roster.length}
      onClick={onFixDefault}>Fijar distribución habitual</button> : null}
    {legacy.length ? <small role="alert">{legacy.length} jugadores tienen coordenadas anteriores sin demarcación. Asígnalos a un puesto o restablece la distribución; no se han cambiado sus datos guardados.</small> : null}
    {distribution.formation_key && distribution.player_layout.length !== roster.length ?
      <small role="alert">La distribución no contiene toda la plantilla congelada; recarga antes de guardar.</small> : null}
    {canEdit && distribution.formation_key ?
      <small>Arrastra cada nombre a una demarcación o a «Sin ubicación automática» y pulsa «Guardar pizarras». Fuera de esas zonas se cancela el movimiento.</small> : null}
    {!roster.length ? <small>Congela la plantilla de la sesión antes de seleccionar un sistema.</small> : null}
  </div>;
}

const phaseLabel = (key) => PLANNED_PHASES.find((phase) => phase.key === key)?.label || key;

export function SessionSpaceDistribution({ zones = [], slots = [], canEdit = false, onZoneChange,
  fieldDimensions, onFieldDimensionsChange, onZoneMetresChange, onFixDefault,
  defaultButtonDisabled = false }) {
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
    {fieldDimensions && (canEdit ? <div className="planned-board-field-controls">
      <label>Largo (m)<input type="number" min="0.01" max="500" step="0.1"
        value={fieldDimensions.length_m} onChange={(event) => onFieldDimensionsChange?.('length_m', event.target.value)} /></label>
      <label>Ancho (m)<input type="number" min="0.01" max="500" step="0.1"
        value={fieldDimensions.width_m} onChange={(event) => onFieldDimensionsChange?.('width_m', event.target.value)} /></label>
      {onFixDefault ? <button type="button" className="planned-board-default-button"
        disabled={defaultButtonDisabled || !fieldIsMeasured(fieldDimensions)}
        onClick={onFixDefault}>Fijar dimensiones habituales</button> : null}
    </div> : fieldIsMeasured(fieldDimensions)
      ? <small>{fieldDimensions.length_m} × {fieldDimensions.width_m} m</small> : null)}
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
    {canEdit && fieldIsMeasured(fieldDimensions) && onZoneMetresChange ? <div className="planned-board-zone-metres">
      {visibleZones.map((zone) => {
        const metres = metresFromZone(zone, fieldDimensions);
        return <div key={zone.slot_id}>
          <strong>{slotById.get(zone.slot_id).short}</strong>
          <label>Largo (m)<input key={`${zone.slot_id}-length-${metres.length_m}`} type="number"
            min="0.01" max={fieldDimensions.length_m} step="0.1" defaultValue={metres.length_m}
            onBlur={(event) => { if (validMetres(event.target.value)) onZoneMetresChange(zone.slot_id,
              { ...metres, length_m: Number(event.target.value) }); }} /></label>
          <label>Ancho (m)<input key={`${zone.slot_id}-width-${metres.width_m}`} type="number"
            min="0.01" max={fieldDimensions.width_m} step="0.1" defaultValue={metres.width_m}
            onBlur={(event) => { if (validMetres(event.target.value)) onZoneMetresChange(zone.slot_id,
              { ...metres, width_m: Number(event.target.value) }); }} /></label>
        </div>;
      })}
    </div> : null}
    {overlaps.length ? <small>Zonas superpuestas: {overlaps.map(([left, right]) =>
      `${slotById.get(left).short} / ${slotById.get(right).short}`).join('; ')}. No implica conflicto temporal.</small> : null}
    {canEdit && visibleZones.length ? <small>Arrastra las zonas; usa la esquina para cambiar su tamaño. Las nuevas son propuestas provisionales.</small> : null}
  </div>;
}
