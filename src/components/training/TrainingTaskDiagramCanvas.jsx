import { useId, useMemo, useRef, useState } from 'react';
import { clampDiagramCoordinate } from '../../utils/diagramScene';
import { getSetPieceCurveControlPoint } from '../../utils/setPieceEditorInteractions';
import {
  adaptLegacyTrainingBoardElement,
  getTrainingBoardColor,
  moveTrainingBoardElement,
  resizeTrainingBoardZone,
  sortTrainingBoardElements,
} from '../../utils/trainingTaskBoardElements';
import { resolveTrainingTaskPlayerRef } from '../../utils/trainingTaskRoster';

const TRACE_TYPES = new Set(['arrow', 'curved_arrow', 'dashed_arrow', 'double_arrow', 'line', 'dashed_line']);
const DRAW_TOOLS = new Set(['arrow', 'curved_arrow', 'dashed_arrow', 'line', 'dashed_line', 'zone']);
const snapValue = (value, snap) => snap ? Math.round(value / 4) * 4 : value;
const clamp = (value, axis) => clampDiagramCoordinate(value, axis) ?? 0;

function TrainingPitch({ pitchType }) {
  const line = { fill: 'none', stroke: 'rgba(255,255,255,.82)', strokeWidth: 0.48 };
  return <>
    <rect width="100" height="72" rx="2.5" fill="#176b3a" />
    {[0, 1, 2, 3, 4, 5, 6, 7].map((stripe) => <rect key={stripe} x={stripe * 12.5} width="12.5" height="72" fill={stripe % 2 ? '#ffffff' : '#071f14'} opacity={stripe % 2 ? 0.025 : 0.035} />)}
    {pitchType === 'blank' ? null : pitchType === 'half' ? <g {...line}>
      <rect x="1" y="1" width="98" height="70" rx="1.5" />
      <line x1="1" y1="1" x2="1" y2="71" />
      <path d="M1 27 A9 9 0 0 1 1 45" />
      <rect x="79" y="17" width="20" height="38" />
      <rect x="92" y="27" width="7" height="18" />
      <rect x="98" y="30" width="2" height="12" />
      <circle cx="87" cy="36" r="0.8" fill="rgba(255,255,255,.86)" stroke="none" />
      <path d="M79 29 A10 10 0 0 0 79 43" />
    </g> : <g {...line}>
      <rect x="1" y="1" width="98" height="70" rx="1.5" />
      <line x1="50" y1="1" x2="50" y2="71" />
      <circle cx="50" cy="36" r="9" />
      <circle cx="50" cy="36" r="0.7" fill="rgba(255,255,255,.86)" stroke="none" />
      <rect x="1" y="17" width="19" height="38" /><rect x="1" y="27" width="7" height="18" />
      <rect x="80" y="17" width="19" height="38" /><rect x="92" y="27" width="7" height="18" />
      <rect x="0" y="30" width="2" height="12" /><rect x="98" y="30" width="2" height="12" />
      <path d="M20 29 A10 10 0 0 1 20 43 M80 29 A10 10 0 0 0 80 43" />
    </g>}
  </>;
}

function Ball({ x, y }) {
  return <g><circle cx={x} cy={y} r="1.35" fill="#fff" stroke="#111827" strokeWidth=".35" /><path d={`M${x} ${y - .65}l.55 .4-.22 .65h-.66l-.22-.65Z`} fill="#111827" /></g>;
}

function TraceHandle({ x, y, filled = false, onPointerDown }) {
  return <g onPointerDown={onPointerDown} className="diagram-draggable"><circle cx={x} cy={y} r="2.8" fill="transparent" /><circle cx={x} cy={y} r="1.15" fill={filled ? '#38bdf8' : '#fff'} stroke={filled ? '#fff' : '#38bdf8'} strokeWidth=".35" pointerEvents="none" /></g>;
}

function Material({ element, color }) {
  const { x, y, type } = element;
  const transform = `rotate(${Number(element.rotation) || 0} ${x} ${y})`;
  if (type === 'ball') return <Ball x={x} y={y} />;
  if (type === 'cone') return <g transform={transform}><path d={`M${x} ${y - 1.5}L${x - 1.35} ${y + 1.15}H${x + 1.35}Z`} fill={color} stroke="rgba(255,255,255,.8)" strokeWidth=".28" /><line x1={x - 1.8} y1={y + 1.3} x2={x + 1.8} y2={y + 1.3} stroke="#172033" strokeWidth=".4" /></g>;
  if (type === 'pole') return <g transform={transform}><line x1={x - 3} y1={y} x2={x + 3} y2={y} stroke={color} strokeWidth=".75" strokeLinecap="round" /><circle cx={x - 3} cy={y} r=".45" fill="#fff" /><circle cx={x + 3} cy={y} r=".45" fill="#fff" /></g>;
  if (type === 'mannequin') return <g transform={transform} fill="none" stroke={color} strokeWidth=".65" strokeLinecap="round" strokeLinejoin="round"><circle cx={x} cy={y - 2.2} r=".8" /><path d={`M${x - 1.5} ${y - .8}Q${x} ${y - 1.8} ${x + 1.5} ${y - .8}M${x} ${y - 1.4}V${y + 2}M${x - 1.5} ${y + 2}H${x + 1.5}`} /></g>;
  if (type === 'hoop') return <circle cx={x} cy={y} r="2.1" fill="none" stroke={color} strokeWidth=".65" />;
  if (type === 'block') return <g stroke={color} strokeWidth="1.1" strokeLinecap="round"><line x1={x - 2.2} y1={y - 2.2} x2={x + 2.2} y2={y + 2.2} /><line x1={x + 2.2} y1={y - 2.2} x2={x - 2.2} y2={y + 2.2} /></g>;
  if (['goal', 'mini_goal'].includes(type)) {
    const width = Number(element.width) || (type === 'goal' ? 10 : 6);
    const depth = Number(element.height) || (type === 'goal' ? 4.5 : 3);
    const left = x - width / 2; const right = x + width / 2; const front = y - depth / 2; const back = y + depth / 2;
    const inset = Math.min(width * .16, 1.4); const backLeft = left + inset; const backRight = right - inset;
    const netLines = type === 'goal' ? [0.25, 0.5, 0.75] : [0.5];
    return <g transform={transform} fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round"><path d={`M${left} ${front}H${right}`} strokeWidth=".9" /><path d={`M${left} ${front}L${backLeft} ${back}H${backRight}L${right} ${front}`} strokeWidth=".42" opacity=".9" />{netLines.map((ratio) => <line key={ratio} x1={left + width * ratio} y1={front} x2={backLeft + (backRight - backLeft) * ratio} y2={back} strokeWidth=".25" opacity=".5" />)}<path d={`M${backLeft} ${back}H${backRight}`} strokeWidth=".3" opacity=".55" /></g>;
  }
  return null;
}

export default function TrainingTaskDiagramCanvas({ elements = [], pitchType = 'full', selectedId = '', activeTool = 'select', onSelect, onChange, onInsert, readOnly = false, snap = false, players = [] }) {
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const insertionRef = useRef(null);
  const [insertionDraft, setInsertionDraft] = useState(null);
  const markerId = `training-arrow-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const rendered = useMemo(() => sortTrainingBoardElements(elements), [elements]);
  const selected = elements.find((element) => element.id === selectedId) || null;

  const pointFromEvent = (event) => {
    const rect = svgRef.current.getBoundingClientRect();
    return { x: clamp(((event.clientX - rect.left) / rect.width) * 100, 'x'), y: clamp(((event.clientY - rect.top) / rect.height) * 72, 'y') };
  };
  const updateElement = (id, fields) => {
    const nextElements = elements.map((element) => element.id === id ? { ...element, ...fields } : element);
    if (dragRef.current) {
      dragRef.current.moved = true;
      dragRef.current.latestElements = nextElements;
    }
    onChange(nextElements, { recordHistory: false });
  };
  const startDrag = (event, element, mode = 'move') => {
    if (readOnly || activeTool !== 'select') return;
    event.stopPropagation(); event.preventDefault(); onSelect(element.id);
    svgRef.current?.setPointerCapture?.(event.pointerId);
    const control = element.type === 'curved_arrow' ? getSetPieceCurveControlPoint(element) : null;
    dragRef.current = { element, mode, pointerId: event.pointerId, start: pointFromEvent(event), origin: control ? { ...element, controlX: control.x, controlY: control.y } : { ...element }, moved: false, latestElements: elements };
  };
  const move = (event) => {
    if (insertionRef.current) {
      const end = pointFromEvent(event);
      insertionRef.current = { ...insertionRef.current, end };
      setInsertionDraft(insertionRef.current);
      return;
    }
    const drag = dragRef.current;
    if (!drag || readOnly) return;
    const point = pointFromEvent(event);
    const dx = point.x - drag.start.x; const dy = point.y - drag.start.y;
    const x = (value) => snapValue(clamp(Number(value) + dx, 'x'), snap);
    const y = (value) => snapValue(clamp(Number(value) + dy, 'y'), snap);
    if (drag.mode === 'start') return updateElement(drag.element.id, { x1: x(drag.origin.x1), y1: y(drag.origin.y1) });
    if (drag.mode === 'end') return updateElement(drag.element.id, { x2: x(drag.origin.x2), y2: y(drag.origin.y2) });
    if (drag.mode === 'control') return updateElement(drag.element.id, { controlX: x(drag.origin.controlX), controlY: y(drag.origin.controlY) });
    if (drag.mode === 'resize') return updateElement(drag.element.id, resizeTrainingBoardZone(drag.origin, dx, dy));
    const anchorX = TRACE_TYPES.has(drag.element.type) ? drag.origin.x1 : drag.origin.x;
    const anchorY = TRACE_TYPES.has(drag.element.type) ? drag.origin.y1 : drag.origin.y;
    const movementDx = snap ? snapValue(Number(anchorX) + dx, true) - Number(anchorX) : dx;
    const movementDy = snap ? snapValue(Number(anchorY) + dy, true) - Number(anchorY) : dy;
    return updateElement(drag.element.id, moveTrainingBoardElement(drag.origin, movementDx, movementDy));
  };
  const stop = (event) => {
    if (insertionRef.current) {
      const insertion = insertionRef.current;
      const end = pointFromEvent(event);
      insertionRef.current = null;
      setInsertionDraft(null);
      if (insertion.pointerId != null && svgRef.current?.hasPointerCapture?.(insertion.pointerId)) svgRef.current.releasePointerCapture(insertion.pointerId);
      onInsert?.(insertion.tool, { start: insertion.start, end });
      return;
    }
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.pointerId != null && svgRef.current?.hasPointerCapture?.(drag.pointerId)) svgRef.current.releasePointerCapture(drag.pointerId);
    if (drag?.moved) onChange(drag.latestElements, { recordHistory: true });
  };

  const onBoardPointerDown = (event) => {
    if (readOnly) return;
    if (activeTool === 'select') {
      onSelect('');
      return;
    }
    event.preventDefault();
    const point = pointFromEvent(event);
    if (!DRAW_TOOLS.has(activeTool)) {
      onInsert?.(activeTool, { point });
      return;
    }
    event.currentTarget.setPointerCapture?.(event.pointerId);
    insertionRef.current = { tool: activeTool, pointerId: event.pointerId, start: point, end: point };
    setInsertionDraft(insertionRef.current);
  };

  const renderElement = (raw) => {
    const element = adaptLegacyTrainingBoardElement(raw);
    const palette = getTrainingBoardColor(element, element.type === 'text' ? 'white' : 'blue');
    const color = palette.value;
    if (TRACE_TYPES.has(element.type)) {
      const curved = element.type === 'curved_arrow';
      const control = getSetPieceCurveControlPoint(element);
      const path = curved ? `M${element.x1} ${element.y1} Q${control.x} ${control.y} ${element.x2} ${element.y2}` : `M${element.x1} ${element.y1} L${element.x2} ${element.y2}`;
      const arrow = !['line', 'dashed_line'].includes(element.type);
      const dashed = ['dashed_arrow', 'dashed_line'].includes(element.type) || element.dashed;
      return <g key={element.id} className={readOnly ? '' : 'diagram-draggable'} onPointerDown={(event) => startDrag(event, raw)}><path d={path} fill="none" stroke="transparent" strokeWidth="3.5" /><path d={path} fill="none" stroke={color} strokeWidth=".55" strokeDasharray={dashed ? '2 1.6' : undefined} markerEnd={arrow ? `url(#${markerId})` : undefined} pointerEvents="none" /></g>;
    }
    if (element.type === 'zone') {
      return <g key={element.id} onPointerDown={(event) => startDrag(event, raw)} className={readOnly ? '' : 'diagram-draggable'}><rect x={element.x} y={element.y} width={element.width || 22} height={element.height || 12} rx=".8" fill={color} fillOpacity={Number(element.opacity) || .18} stroke={color} strokeWidth=".38" strokeDasharray={element.borderStyle === 'dashed' ? '2 1.5' : undefined} />{element.label ? <text x={Number(element.x) + 1.4} y={Number(element.y) + 3} fontSize="1.8" fontWeight="700" fill="#fff" paintOrder="stroke" stroke="#123522" strokeWidth=".35">{element.label}</text> : null}</g>;
    }
    if (element.type === 'participant') {
      const role = element.role || 'player';
      const resolvedPlayer = element.playerRef ? resolveTrainingTaskPlayerRef(element.playerRef, players) : null;
      const participantLabel = resolvedPlayer?.display.number || element.label || (role === 'goalkeeper' ? 'P' : role === 'neutral' ? 'C' : '');
      const participantTitle = resolvedPlayer ? `${resolvedPlayer.display.name}${resolvedPlayer.unavailable ? ' · no disponible' : ''}` : '';
      if (role === 'coach') return <g key={element.id} onPointerDown={(event) => startDrag(event, raw)} className={readOnly ? '' : 'diagram-draggable'}><circle cx={element.x} cy={element.y} r="3.4" fill="transparent" /><rect x={element.x - 2.1} y={element.y - 1.7} width="4.2" height="3.4" rx=".7" fill={color} stroke="rgba(255,255,255,.85)" strokeWidth=".35" pointerEvents="none" /><text x={element.x} y={element.y + .55} textAnchor="middle" fontSize="1.55" fontWeight="900" fill={palette.contrast} pointerEvents="none">{element.label || 'E'}</text></g>;
      const goalkeeper = role === 'goalkeeper';
      return <g key={element.id} onPointerDown={(event) => startDrag(event, raw)} className={readOnly ? '' : 'diagram-draggable'}>{participantTitle ? <title>{participantTitle}</title> : null}<circle cx={element.x} cy={element.y} r="3.2" fill="transparent" /><circle cx={element.x} cy={element.y} r="1.85" fill={color} stroke="rgba(255,255,255,.9)" strokeWidth=".38" pointerEvents="none" /><circle cx={element.x} cy={element.y} r="2.25" fill="none" stroke={goalkeeper ? '#fef08a' : 'transparent'} strokeWidth=".35" pointerEvents="none" /><text x={element.x} y={element.y + .52} textAnchor="middle" fontSize="1.65" fontWeight="900" fill={palette.contrast} pointerEvents="none">{participantLabel}</text></g>;
    }
    if (['ball', 'cone', 'pole', 'mannequin', 'hoop', 'goal', 'mini_goal', 'block'].includes(element.type)) {
      const goal = ['goal', 'mini_goal'].includes(element.type);
      const hitRadius = element.type === 'pole' ? 3.5 : element.type === 'mannequin' ? 3.2 : 2.8;
      const width = Number(element.width) || (element.type === 'goal' ? 10 : 6);
      const height = Number(element.height) || (element.type === 'goal' ? 4.5 : 3);
      return <g key={element.id} onPointerDown={(event) => startDrag(event, raw)} className={readOnly ? '' : 'diagram-draggable'}>{goal ? <rect x={element.x - width / 2 - 1} y={element.y - height / 2 - 1} width={width + 2} height={height + 2} transform={`rotate(${Number(element.rotation) || 0} ${element.x} ${element.y})`} fill="transparent" /> : <circle cx={element.x} cy={element.y} r={hitRadius} fill="transparent" />}<g pointerEvents="none"><Material element={element} color={color} /></g></g>;
    }
    if (element.type === 'text' || element.type === 'text_box') {
      const label = element.label || 'Texto'; const hitWidth = Math.max(6, label.length * 1.7);
      return <g key={element.id} onPointerDown={(event) => startDrag(event, raw)} className={readOnly ? '' : 'diagram-draggable'}><rect x={element.x - hitWidth / 2} y={element.y - 3.2} width={hitWidth} height="4.5" fill="transparent" /><text x={element.x} y={element.y} textAnchor="middle" fontSize="3" fontWeight="900" fill={color} paintOrder="stroke" stroke="#123522" strokeWidth=".7" pointerEvents="none">{label}</text></g>;
    }
    return null;
  };

  const adaptedSelected = selected ? adaptLegacyTrainingBoardElement(selected) : null;
  const draftPath = insertionDraft && TRACE_TYPES.has(insertionDraft.tool)
    ? `M${insertionDraft.start.x} ${insertionDraft.start.y} L${insertionDraft.end.x} ${insertionDraft.end.y}`
    : '';
  const draftZone = insertionDraft?.tool === 'zone' ? {
    x: Math.min(insertionDraft.start.x, insertionDraft.end.x),
    y: Math.min(insertionDraft.start.y, insertionDraft.end.y),
    width: Math.abs(insertionDraft.end.x - insertionDraft.start.x),
    height: Math.abs(insertionDraft.end.y - insertionDraft.start.y),
  } : null;
  return <svg ref={svgRef} viewBox="0 0 100 72" role="img" aria-label={readOnly ? 'Pizarra de entrenamiento' : 'Editor de pizarra de entrenamiento'} data-interaction-mode={readOnly ? 'readonly' : activeTool === 'select' ? 'select' : 'insert'} className={`training-task-diagram-canvas block h-auto w-full select-none ${activeTool !== 'select' ? 'cursor-crosshair' : ''}`} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} onPointerDown={onBoardPointerDown}>
    <defs><marker id={markerId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="2.7" markerHeight="2.7" orient="auto"><path d="M0 0L10 5L0 10Z" fill="context-stroke" /></marker></defs>
    <TrainingPitch pitchType={pitchType} />
    {rendered.map(renderElement)}
    {draftPath ? <path d={draftPath} fill="none" stroke="#38bdf8" strokeWidth=".8" strokeDasharray="2 1.5" pointerEvents="none" /> : null}
    {draftZone ? <rect {...draftZone} fill="#38bdf8" fillOpacity=".14" stroke="#38bdf8" strokeWidth=".45" strokeDasharray="2 1.5" pointerEvents="none" /> : null}
    {adaptedSelected && !readOnly ? <g className="training-board-selection">
      {TRACE_TYPES.has(adaptedSelected.type) ? <>{(() => { const control = getSetPieceCurveControlPoint(adaptedSelected); return <><TraceHandle x={adaptedSelected.x1} y={adaptedSelected.y1} onPointerDown={(event) => startDrag(event, selected, 'start')} /><TraceHandle x={adaptedSelected.x2} y={adaptedSelected.y2} onPointerDown={(event) => startDrag(event, selected, 'end')} />{adaptedSelected.type === 'curved_arrow' ? <TraceHandle x={control.x} y={control.y} filled onPointerDown={(event) => startDrag(event, selected, 'control')} /> : null}</>; })()}</> : adaptedSelected.type === 'zone' ? <><rect x={adaptedSelected.x - .45} y={adaptedSelected.y - .45} width={(adaptedSelected.width || 22) + .9} height={(adaptedSelected.height || 12) + .9} rx="1" fill="none" stroke="#38bdf8" strokeWidth=".45" pointerEvents="none" />{[[adaptedSelected.x, adaptedSelected.y], [Number(adaptedSelected.x) + Number(adaptedSelected.width || 22), adaptedSelected.y], [adaptedSelected.x, Number(adaptedSelected.y) + Number(adaptedSelected.height || 12)]].map(([x, y], index) => <rect key={index} x={Number(x) - .8} y={Number(y) - .8} width="1.6" height="1.6" rx=".3" fill="#fff" stroke="#38bdf8" strokeWidth=".3" pointerEvents="none" />)}<rect x={Number(adaptedSelected.x) + Number(adaptedSelected.width || 22) - 1.2} y={Number(adaptedSelected.y) + Number(adaptedSelected.height || 12) - 1.2} width="2.4" height="2.4" rx=".4" fill="#fff" stroke="#38bdf8" strokeWidth=".35" onPointerDown={(event) => startDrag(event, selected, 'resize')} /></> : <circle cx={adaptedSelected.x} cy={adaptedSelected.y} r={adaptedSelected.type === 'participant' ? '2.65' : '3.2'} fill="none" stroke="#38bdf8" strokeWidth=".45" pointerEvents="none" />}
    </g> : null}
  </svg>;
}
