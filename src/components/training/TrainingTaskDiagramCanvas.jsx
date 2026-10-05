import { useId, useMemo, useRef } from 'react';
import { clampDiagramCoordinate } from '../../utils/diagramScene';
import { getSetPieceCurveControlPoint } from '../../utils/setPieceEditorInteractions';
import {
  adaptLegacyTrainingBoardElement,
  getTrainingBoardColor,
  resizeTrainingBoardZone,
  sortTrainingBoardElements,
} from '../../utils/trainingTaskBoardElements';

const TRACE_TYPES = new Set(['arrow', 'curved_arrow', 'dashed_arrow', 'double_arrow', 'line', 'dashed_line']);
const snapValue = (value, snap) => snap ? Math.round(value / 4) * 4 : value;
const clamp = (value, axis) => clampDiagramCoordinate(value, axis) ?? 0;

function TrainingPitch({ pitchType }) {
  const line = { fill: 'none', stroke: 'rgba(255,255,255,.86)', strokeWidth: 0.65 };
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
  return <g><circle cx={x} cy={y} r="2.2" fill="#fff" stroke="#111827" strokeWidth=".5" /><path d={`M${x} ${y - 1}l.9 .65-.35 1.05h-1.1l-.35-1.05Z`} fill="#111827" /></g>;
}

function Material({ element, color }) {
  const { x, y, type } = element;
  const transform = `rotate(${Number(element.rotation) || 0} ${x} ${y})`;
  if (type === 'ball') return <Ball x={x} y={y} />;
  if (type === 'cone') return <g transform={transform}><path d={`M${x} ${y - 2.5}L${x - 2.3} ${y + 2}H${x + 2.3}Z`} fill={color} stroke="#fff" strokeWidth=".45" /><line x1={x - 3} y1={y + 2.2} x2={x + 3} y2={y + 2.2} stroke="#172033" strokeWidth=".7" /></g>;
  if (type === 'pole') return <g transform={transform}><line x1={x - 4} y1={y} x2={x + 4} y2={y} stroke={color} strokeWidth="1.25" strokeLinecap="round" /><circle cx={x - 4} cy={y} r=".8" fill="#fff" /><circle cx={x + 4} cy={y} r=".8" fill="#fff" /></g>;
  if (type === 'mannequin') return <g transform={transform} fill={color} stroke="#172033" strokeWidth=".35"><circle cx={x} cy={y - 3.2} r="1.3" /><path d={`M${x - 2.2} ${y - 1.7}Q${x} ${y - 3} ${x + 2.2} ${y - 1.7}L${x + 1.5} ${y + 2.2}H${x + 3}V${y + 3.1}H${x - 3}V${y + 2.2}H${x - 1.5}Z`} /></g>;
  if (type === 'hoop') return <circle cx={x} cy={y} r="3.2" fill="none" stroke={color} strokeWidth="1.1" />;
  if (type === 'block') return <g stroke={color} strokeWidth="1.1" strokeLinecap="round"><line x1={x - 2.2} y1={y - 2.2} x2={x + 2.2} y2={y + 2.2} /><line x1={x + 2.2} y1={y - 2.2} x2={x - 2.2} y2={y + 2.2} /></g>;
  if (['goal', 'mini_goal'].includes(type)) {
    const width = Number(element.width) || (type === 'goal' ? 14 : 8);
    const height = Number(element.height) || (type === 'goal' ? 6 : 4);
    return <g transform={transform} fill="none" stroke={color} strokeWidth=".75"><rect x={x - width / 2} y={y - height / 2} width={width} height={height} rx=".7" /><path d={`M${x - width / 2} ${y - height / 2}L${x + width / 2} ${y + height / 2}M${x + width / 2} ${y - height / 2}L${x - width / 2} ${y + height / 2}`} opacity=".45" /></g>;
  }
  return null;
}

export default function TrainingTaskDiagramCanvas({ elements = [], pitchType = 'full', selectedId = '', onSelect, onChange, readOnly = false, snap = false }) {
  const svgRef = useRef(null);
  const dragRef = useRef(null);
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
    if (readOnly) return;
    event.stopPropagation(); event.preventDefault(); onSelect(element.id);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const control = element.type === 'curved_arrow' ? getSetPieceCurveControlPoint(element) : null;
    dragRef.current = { element, mode, start: pointFromEvent(event), origin: control ? { ...element, controlX: control.x, controlY: control.y } : { ...element }, moved: false, latestElements: elements };
  };
  const move = (event) => {
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
    if (TRACE_TYPES.has(drag.element.type)) {
      const fields = { x1: x(drag.origin.x1), y1: y(drag.origin.y1), x2: x(drag.origin.x2), y2: y(drag.origin.y2) };
      if (drag.element.type === 'curved_arrow') { fields.controlX = x(drag.origin.controlX); fields.controlY = y(drag.origin.controlY); }
      return updateElement(drag.element.id, fields);
    }
    return updateElement(drag.element.id, { x: x(drag.origin.x), y: y(drag.origin.y) });
  };
  const stop = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.moved) onChange(drag.latestElements, { recordHistory: true });
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
      return <g key={element.id} className={readOnly ? '' : 'diagram-draggable'} onPointerDown={(event) => startDrag(event, raw)}><path d={path} fill="none" stroke="transparent" strokeWidth="6" /><path d={path} fill="none" stroke={color} strokeWidth="1" strokeDasharray={dashed ? '3 2' : undefined} markerEnd={arrow ? `url(#${markerId})` : undefined} /></g>;
    }
    if (element.type === 'zone') {
      return <g key={element.id} onPointerDown={(event) => startDrag(event, raw)} className={readOnly ? '' : 'diagram-draggable'}><rect x={element.x} y={element.y} width={element.width || 22} height={element.height || 12} rx="1.5" fill={color} fillOpacity={Number(element.opacity) || .22} stroke={color} strokeWidth=".7" />{element.label ? <text x={Number(element.x) + 2} y={Number(element.y) + 4} fontSize="2.4" fontWeight="800" fill="#fff">{element.label}</text> : null}</g>;
    }
    if (element.type === 'participant') {
      const role = element.role || 'player';
      if (role === 'coach') return <g key={element.id} onPointerDown={(event) => startDrag(event, raw)} className={readOnly ? '' : 'diagram-draggable'}><circle cx={element.x} cy={element.y} r="5" fill="transparent" /><rect x={element.x - 3} y={element.y - 2.5} width="6" height="5" rx="1.2" fill={color} stroke="#fff" strokeWidth=".55" /><text x={element.x} y={element.y + .8} textAnchor="middle" fontSize="2.3" fontWeight="900" fill={palette.contrast}>{element.label || 'E'}</text></g>;
      const goalkeeper = role === 'goalkeeper';
      return <g key={element.id} onPointerDown={(event) => startDrag(event, raw)} className={readOnly ? '' : 'diagram-draggable'}><circle cx={element.x} cy={element.y} r="5.2" fill="transparent" /><circle cx={element.x} cy={element.y} r="3.15" fill={color} stroke={goalkeeper ? '#fef08a' : '#fff'} strokeWidth={goalkeeper ? '1.05' : '.65'} /><text x={element.x} y={element.y + .75} textAnchor="middle" fontSize="2.5" fontWeight="900" fill={palette.contrast}>{element.label || (role === 'neutral' ? 'C' : '')}</text></g>;
    }
    if (['ball', 'cone', 'pole', 'mannequin', 'hoop', 'goal', 'mini_goal', 'block'].includes(element.type)) return <g key={element.id} onPointerDown={(event) => startDrag(event, raw)} className={readOnly ? '' : 'diagram-draggable'}><circle cx={element.x} cy={element.y} r="5" fill="transparent" /><Material element={element} color={color} /></g>;
    if (element.type === 'text' || element.type === 'text_box') return <text key={element.id} x={element.x} y={element.y} textAnchor="middle" fontSize="3" fontWeight="900" fill={color} paintOrder="stroke" stroke="#123522" strokeWidth=".7" onPointerDown={(event) => startDrag(event, raw)}>{element.label || 'Texto'}</text>;
    return null;
  };

  const adaptedSelected = selected ? adaptLegacyTrainingBoardElement(selected) : null;
  return <svg ref={svgRef} viewBox="0 0 100 72" role="img" aria-label={readOnly ? 'Pizarra de entrenamiento' : 'Editor de pizarra de entrenamiento'} className="block h-auto w-full touch-none select-none" onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} onPointerLeave={stop} onPointerDown={() => !readOnly && onSelect('')}>
    <defs><marker id={markerId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L10 5L0 10Z" fill="context-stroke" /></marker></defs>
    <TrainingPitch pitchType={pitchType} />
    {rendered.map(renderElement)}
    {adaptedSelected && !readOnly ? <g className="training-board-selection">
      {TRACE_TYPES.has(adaptedSelected.type) ? <>{(() => { const control = getSetPieceCurveControlPoint(adaptedSelected); return <><circle cx={adaptedSelected.x1} cy={adaptedSelected.y1} r="2" fill="#fff" stroke="#38bdf8" onPointerDown={(event) => startDrag(event, selected, 'start')} /><circle cx={adaptedSelected.x2} cy={adaptedSelected.y2} r="2" fill="#fff" stroke="#38bdf8" onPointerDown={(event) => startDrag(event, selected, 'end')} />{adaptedSelected.type === 'curved_arrow' ? <circle cx={control.x} cy={control.y} r="2" fill="#38bdf8" stroke="#fff" onPointerDown={(event) => startDrag(event, selected, 'control')} /> : null}</>; })()}</> : adaptedSelected.type === 'zone' ? <><rect x={adaptedSelected.x - .8} y={adaptedSelected.y - .8} width={(adaptedSelected.width || 22) + 1.6} height={(adaptedSelected.height || 12) + 1.6} rx="1.5" fill="none" stroke="#38bdf8" strokeWidth=".8" /><rect x={Number(adaptedSelected.x) + Number(adaptedSelected.width || 22) - 2} y={Number(adaptedSelected.y) + Number(adaptedSelected.height || 12) - 2} width="4" height="4" rx=".7" fill="#fff" stroke="#38bdf8" onPointerDown={(event) => startDrag(event, selected, 'resize')} /></> : <circle cx={adaptedSelected.x} cy={adaptedSelected.y} r="4.4" fill="none" stroke="#38bdf8" strokeWidth=".9" />}
    </g> : null}
  </svg>;
}
