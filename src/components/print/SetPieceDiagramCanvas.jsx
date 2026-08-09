import { useMemo, useRef, useState } from 'react';
import { getPlayerDisplayName } from '../../utils/playerDisplayName';
import {
  normalizeSetPieceDimensionValue,
  normalizeSetPieceElementDimensions,
} from '../../utils/setPieceElementDimensions';
import { getSetPieceElementInteraction } from '../../utils/setPieceEditorInteractions';
import {
  getDrawableSetPieceElements,
  optimizeSetPieceElementsForPrint,
} from '../../utils/setPieceProfessional';

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const snapValue = (value, enabled) => (enabled ? Math.round(value / 4) * 4 : value);
const isArrow = (element) => ['arrow', 'dashed_arrow', 'curved_arrow', 'double_arrow'].includes(element?.type);
const isResizableBox = (element) => ['zone', 'block', 'text_box'].includes(element?.type);

export const SET_PIECE_CANVAS_TOKENS = Object.freeze({
  editor: Object.freeze({
    playerRadius: 2.1,
    selectedPlayerRadius: 2.4,
    responsibilityRadius: 2.85,
    ballRadius: 1.8,
    blockRadius: 1.7,
    arrowWidth: 0.55,
    dorsalSize: 1.9,
    abbreviationSize: 1.55,
    stepRadius: 1.4,
    stepSize: 1.35,
    roleSize: 1.2,
    annotationSize: 2.8,
    zoneSize: 2.35,
  }),
  print: Object.freeze({
    playerRadius: 2.05,
    selectedPlayerRadius: 2.05,
    responsibilityRadius: 2.65,
    ballRadius: 1.55,
    blockRadius: 1.45,
    arrowWidth: 0.5,
    dorsalSize: 2.35,
    abbreviationSize: 2.4,
    stepRadius: 1.42,
    stepSize: 1.55,
    roleSize: 1.2,
    annotationSize: 2.45,
    zoneSize: 2.15,
  }),
});

const getPoint = (event, svg) => {
  const rect = svg.getBoundingClientRect();
  return {
    x: clamp(((event.clientX - rect.left) / rect.width) * 100),
    y: clamp(((event.clientY - rect.top) / rect.height) * 72, 0, 72),
  };
};

const getPlayerName = (element, playersById) => {
  const player = playersById.get(element.player_id);
  return player ? getPlayerDisplayName(player) : element.name || '';
};

const splitLines = (value) => String(value || '').split('\n').slice(0, 12);
const getCurveControlPoint = (element) => {
  const x = Number.isFinite(Number(element?.controlX)) ? Number(element.controlX) : ((Number(element?.x1) || 0) + (Number(element?.x2) || 0)) / 2;
  const y = Number.isFinite(Number(element?.controlY)) ? Number(element.controlY) : ((Number(element?.y1) || 0) + (Number(element?.y2) || 0)) / 2 + (Number.isFinite(Number(element?.curvature)) ? Number(element.curvature) : -12);
  return { x, y };
};
const compactDiagramLabel = (value, max = 14) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const parts = text.split(' ').filter(Boolean);
  const compact = parts.length > 1 ? `${parts[0][0]}. ${parts.slice(-1)[0]}` : text;
  return compact.length <= max ? compact : `${compact.slice(0, Math.max(3, max - 1))}.`;
};

const BallIcon = ({ x, y, selected, radius }) => (
  <g>
    {selected ? <circle cx={x} cy={y} r={radius + 1.05} fill="none" stroke="#3DD9FF" strokeWidth="0.75" opacity="0.8" /> : null}
    <circle cx={x} cy={y} r={selected ? radius + 0.35 : radius} fill="white" stroke="currentColor" strokeWidth="0.65" />
    <path d={`M${x} ${y - radius * 0.45}l${radius * 0.45} ${radius * 0.32}-.17 ${radius * 0.52}h-${radius * 0.56}l-.17-${radius * 0.52}Z`} fill="currentColor" />
    {[270, 342, 54, 126, 198].map((angle) => {
      const radians = (angle * Math.PI) / 180;
      const x2 = x + Math.cos(radians) * radius * 0.86;
      const y2 = y + Math.sin(radians) * radius * 0.86;
      return <line key={angle} x1={x} y1={y} x2={x2} y2={y2} stroke="currentColor" strokeWidth="0.28" />;
    })}
  </g>
);

function PitchLines({ fullField = false }) {
  if (fullField) {
    return (
      <>
        <rect x="1" y="1" width="98" height="70" fill="white" stroke="currentColor" strokeWidth="0.8" />
        <line x1="50" y1="1" x2="50" y2="71" stroke="currentColor" strokeWidth="0.55" />
        <circle cx="50" cy="36" r="9" fill="none" stroke="currentColor" strokeWidth="0.55" />
        <rect x="1" y="18" width="18" height="36" fill="none" stroke="currentColor" strokeWidth="0.7" />
        <rect x="1" y="27" width="7" height="18" fill="none" stroke="currentColor" strokeWidth="0.7" />
        <rect x="81" y="18" width="18" height="36" fill="none" stroke="currentColor" strokeWidth="0.7" />
        <rect x="92" y="27" width="7" height="18" fill="none" stroke="currentColor" strokeWidth="0.7" />
        <rect x="0.5" y="31" width="2.5" height="10" fill="none" stroke="currentColor" strokeWidth="0.75" />
        <rect x="97" y="31" width="2.5" height="10" fill="none" stroke="currentColor" strokeWidth="0.75" />
      </>
    );
  }
  return (
    <>
      <rect x="1" y="1" width="98" height="70" fill="white" stroke="currentColor" strokeWidth="0.8" />
      <rect x="22" y="1" width="56" height="21" fill="none" stroke="currentColor" strokeWidth="0.7" />
      <rect x="36" y="1" width="28" height="9" fill="none" stroke="currentColor" strokeWidth="0.7" />
      <rect x="42" y="1" width="16" height="2.5" fill="none" stroke="currentColor" strokeWidth="0.9" />
      <path d="M38 22 Q50 30 62 22" fill="none" stroke="currentColor" strokeWidth="0.6" />
      <path d="M1 1 Q7 7 1 13" fill="none" stroke="currentColor" strokeWidth="0.6" />
      <path d="M99 1 Q93 7 99 13" fill="none" stroke="currentColor" strokeWidth="0.6" />
    </>
  );
}

export default function SetPieceDiagramCanvas({ elements = [], selectedId, onSelect, onChange, readOnly = false, players = [], snap = false, fullField = false, printOptimized = false, preparedForPrint = false, identityMode = 'number-and-abbreviation', visibleLayers = {} }) {
  const svgRef = useRef(null);
  const [drag, setDrag] = useState(null);
  const playersById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);
  const normalizedVisibleLayers = useMemo(() => ({
    numbers: visibleLayers?.numbers ?? true,
    abbreviations: visibleLayers?.abbreviations ?? true,
    roles: visibleLayers?.roles ?? true,
    chronology: visibleLayers?.chronology ?? true,
    zones: visibleLayers?.zones ?? true,
    texts: visibleLayers?.texts ?? true,
  }), [visibleLayers]);
  const renderedElements = useMemo(() => {
    const baseElements = printOptimized && !preparedForPrint
      ? optimizeSetPieceElementsForPrint(elements, players)
      : getDrawableSetPieceElements(elements);
    return baseElements.filter((element) => {
      if (!normalizedVisibleLayers.zones && element.type === 'zone') return false;
      if (!normalizedVisibleLayers.texts && ['text', 'text_box'].includes(element.type)) return false;
      return true;
    });
  }, [elements, players, printOptimized, preparedForPrint, normalizedVisibleLayers]);
  const tokens = printOptimized ? SET_PIECE_CANVAS_TOKENS.print : SET_PIECE_CANVAS_TOKENS.editor;

  const updateElement = (id, fields) => {
    onChange(elements.map((element) => (element.id === id ? { ...element, ...fields } : element)));
  };

  const handlePointerMove = (event) => {
    if (!drag || readOnly || !svgRef.current) return;
    const point = getPoint(event, svgRef.current);
    const dx = point.x - drag.start.x;
    const dy = point.y - drag.start.y;

    if (drag.mode === 'arrow-start') {
      updateElement(drag.element.id, { x1: snapValue(clamp(drag.origin.x1 + dx), snap), y1: snapValue(clamp(drag.origin.y1 + dy, 0, 72), snap) });
      return;
    }
    if (drag.mode === 'arrow-end') {
      updateElement(drag.element.id, { x2: snapValue(clamp(drag.origin.x2 + dx), snap), y2: snapValue(clamp(drag.origin.y2 + dy, 0, 72), snap) });
      return;
    }
    if (drag.mode === 'curve-control' && drag.element.type === 'curved_arrow') {
      updateElement(drag.element.id, {
        controlX: clamp(drag.origin.controlX + dx, 0, 100),
        controlY: clamp(drag.origin.controlY + dy, 0, 72),
      });
      return;
    }
    if (drag.mode === 'resize' && drag.element.type === 'block') {
      updateElement(drag.element.id, {
        width: normalizeSetPieceDimensionValue(
          drag.origin,
          'width',
          snapValue((drag.origin.width || 8) + dx, snap),
          drag.origin.width
        ),
      });
      return;
    }
    if (drag.mode === 'resize') {
      updateElement(drag.element.id, {
        width: normalizeSetPieceDimensionValue(
          drag.origin,
          'width',
          snapValue((drag.origin.width || 18) + dx, snap),
          drag.origin.width
        ),
        height: normalizeSetPieceDimensionValue(
          drag.origin,
          'height',
          snapValue((drag.origin.height || 10) + dy, snap),
          drag.origin.height
        ),
      });
      return;
    }
    if (isArrow(drag.element)) {
      updateElement(drag.element.id, {
        x1: snapValue(clamp(drag.origin.x1 + dx), snap),
        y1: snapValue(clamp(drag.origin.y1 + dy, 0, 72), snap),
        x2: snapValue(clamp(drag.origin.x2 + dx), snap),
        y2: snapValue(clamp(drag.origin.y2 + dy, 0, 72), snap),
      });
      return;
    }
    updateElement(drag.element.id, {
      x: snapValue(clamp(drag.origin.x + dx), snap),
      y: snapValue(clamp(drag.origin.y + dy, 0, 72), snap),
    });
  };

  const startDrag = (event, element, mode = 'move') => {
    const interaction = getSetPieceElementInteraction({ readOnly, locked: element.locked });
    if (!interaction.selectable) return;
    event.stopPropagation();
    onSelect(element.id);
    if (!interaction.draggable) return;
    const point = getPoint(event, svgRef.current);
    setDrag({ element, mode, start: point, origin: { ...element } });
  };

  const stopDrag = () => setDrag(null);

  return (
    <svg
      ref={svgRef}
      className={`set-piece-diagram-canvas ${readOnly ? 'set-piece-diagram-preview-canvas' : 'set-piece-diagram-editor-canvas'}`}
      viewBox="0 0 100 72"
      role="img"
      aria-label={readOnly ? 'Diagrama táctico ABP' : 'Editor táctico ABP'}
      onPointerMove={handlePointerMove}
      onPointerUp={stopDrag}
      onPointerLeave={stopDrag}
      onPointerDown={() => !readOnly && onSelect('')}
    >
      <defs>
        <marker id="diagram-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="3.6" markerHeight="3.6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
        </marker>
        <marker id="diagram-arrow-start" viewBox="0 0 10 10" refX="2" refY="5" markerWidth="3.6" markerHeight="3.6" orient="auto-start-reverse">
          <path d="M 10 0 L 0 5 L 10 10 z" fill="currentColor" />
        </marker>
      </defs>
      <PitchLines fullField={fullField} />

      {renderedElements.map((element) => {
        const selected = selectedId === element.id;
        const renderedElement = normalizeSetPieceElementDimensions(element);
        if (isArrow(element)) {
          const dashed = element.type === 'dashed_arrow' || element.dashed;
          const curved = element.type === 'curved_arrow';
          const double = element.type === 'double_arrow';
          const controlPoint = getCurveControlPoint(element);
          const path = curved ? `M${element.x1} ${element.y1} Q${controlPoint.x} ${controlPoint.y} ${element.x2} ${element.y2}` : `M${element.x1} ${element.y1} L${element.x2} ${element.y2}`;
          return (
            <g key={element.id} onPointerDown={(event) => startDrag(event, element)} className={readOnly ? '' : 'diagram-draggable'}>
              {selected && !readOnly ? <path d={path} fill="none" stroke="#3DD9FF" strokeWidth={tokens.arrowWidth + 1.25} strokeDasharray={dashed ? '2.2 1.8' : ''} opacity="0.38" /> : null}
              <path d={path} fill="none" stroke="currentColor" strokeWidth={selected ? tokens.arrowWidth + 0.28 : tokens.arrowWidth} strokeDasharray={dashed ? '2.2 1.8' : ''} markerEnd="url(#diagram-arrow)" markerStart={double ? 'url(#diagram-arrow-start)' : ''} />
              {selected && !readOnly ? (
                <>
                  <circle cx={element.x1} cy={element.y1} r="2" fill="white" stroke="currentColor" strokeWidth="0.7" onPointerDown={(event) => startDrag(event, element, 'arrow-start')} />
                  <circle cx={element.x2} cy={element.y2} r="2" fill="white" stroke="currentColor" strokeWidth="0.7" onPointerDown={(event) => startDrag(event, element, 'arrow-end')} />
                  {curved ? <circle cx={controlPoint.x} cy={controlPoint.y} r="1.8" fill="#3DD9FF" stroke="white" strokeWidth="0.55" onPointerDown={(event) => startDrag(event, element, 'curve-control')} /> : null}
                </>
              ) : null}
            </g>
          );
        }
        if (element.type === 'block') {
          const radius = tokens.blockRadius;
          return (
            <g key={element.id} onPointerDown={(event) => startDrag(event, element)} className={readOnly ? '' : 'diagram-draggable'}>
              {selected && !readOnly ? <circle cx={element.x} cy={element.y} r={radius + 1.05} fill="none" stroke="#3DD9FF" strokeWidth="0.75" opacity="0.8" /> : null}
              <circle cx={element.x} cy={element.y} r={radius} fill="white" stroke="currentColor" strokeWidth={selected ? 0.85 : 0.62} />
              <path d={`M${element.x - radius * 0.58} ${element.y - radius * 0.58}L${element.x + radius * 0.58} ${element.y + radius * 0.58}M${element.x + radius * 0.58} ${element.y - radius * 0.58}L${element.x - radius * 0.58} ${element.y + radius * 0.58}`} stroke="currentColor" strokeWidth="0.48" strokeLinecap="round" />
              {selected && !readOnly ? (
                <rect x={element.x + radius - 1.5} y={element.y + radius - 1.5} width="3.5" height="3.5" fill="white" stroke="currentColor" strokeWidth="0.7" onPointerDown={(event) => startDrag(event, element, 'resize')} />
              ) : null}
            </g>
          );
        }
        if (isResizableBox(element)) {
          const width = renderedElement.width || (element.type === 'text_box' ? 30 : 18);
          const height = renderedElement.height || (element.type === 'text_box' ? 18 : 10);
          const hasPrintLabel = printOptimized && Number.isFinite(Number(element.printLabelX)) && Number.isFinite(Number(element.printLabelY));
          const printLabelX = hasPrintLabel ? Number(element.printLabelX) : Number(element.x || 0) + 2;
          const printLabelY = hasPrintLabel ? Number(element.printLabelY) : Number(element.y || 0) + 4;
          const lines = splitLines(element.label || (element.type === 'block' ? 'BLOQUEO' : ''))
            .map((line) => (readOnly ? compactDiagramLabel(line, element.type === 'text_box' ? 24 : 18) : line));
          return (
            <g key={element.id} onPointerDown={(event) => startDrag(event, element)} className={readOnly ? '' : 'diagram-draggable'}>
              {selected && !readOnly ? <rect x={Number(element.x) - 0.9} y={Number(element.y) - 0.9} width={width + 1.8} height={height + 1.8} rx="1" fill="none" stroke="#3DD9FF" strokeWidth="0.7" opacity="0.82" /> : null}
              <rect x={element.x} y={element.y} width={width} height={height} fill="white" stroke="currentColor" strokeWidth={selected ? 1.2 : 0.85} strokeDasharray={element.type === 'zone' ? '3 2' : ''} />
              {hasPrintLabel && element.printLabelLeader ? (
                <line x1={Number(element.x || 0) + width / 2} y1={Number(element.y || 0) + 2} x2={printLabelX} y2={printLabelY - 1.2} stroke="currentColor" strokeWidth="0.24" opacity="0.58" />
              ) : null}
              {lines.map((line, index) => (
                <text key={`${element.id}-${index}`} x={printLabelX} y={printLabelY + index * 3.3} textAnchor={hasPrintLabel ? 'middle' : 'start'} fontSize={element.type === 'text_box' ? tokens.annotationSize : tokens.zoneSize} fontWeight={index === 0 ? '900' : '700'} fill="currentColor" paintOrder="stroke" stroke="white" strokeWidth={hasPrintLabel ? '0.6' : '0'}>
                  {line}
                </text>
              ))}
              {selected && !readOnly ? (
                <rect x={(element.x || 0) + width - 2} y={(element.y || 0) + height - 2} width="4" height="4" fill="white" stroke="currentColor" strokeWidth="0.7" onPointerDown={(event) => startDrag(event, element, 'resize')} />
              ) : null}
            </g>
          );
        }
        if (element.type === 'ball') {
          return (
            <g key={element.id} onPointerDown={(event) => startDrag(event, element)} className={readOnly ? '' : 'diagram-draggable'}>
              <BallIcon x={element.x} y={element.y} selected={selected} radius={tokens.ballRadius} />
            </g>
          );
        }
        if (element.type === 'text') {
          const labelX = printOptimized && Number.isFinite(Number(element.printLabelX)) ? Number(element.printLabelX) : Number(element.x || 0);
          const labelY = printOptimized && Number.isFinite(Number(element.printLabelY)) ? Number(element.printLabelY) : Number(element.y || 0);
          return (
            <g key={element.id} onPointerDown={(event) => startDrag(event, element)} className={readOnly ? '' : 'diagram-draggable'}>
              {selected && !readOnly ? <circle cx={labelX} cy={labelY - 0.9} r="4.4" fill="#3DD9FF" opacity="0.16" stroke="#3DD9FF" strokeWidth="0.55" /> : null}
              {printOptimized && element.printLabelLeader ? (
                <line x1={element.x} y1={element.y} x2={labelX} y2={labelY - 1.2} stroke="currentColor" strokeWidth="0.24" opacity="0.58" />
              ) : null}
              <text x={labelX} y={labelY} textAnchor="middle" fontSize={selected ? tokens.annotationSize + 0.35 : tokens.annotationSize} fontWeight="900" fill="currentColor" paintOrder="stroke" stroke="white" strokeWidth={printOptimized ? '0.7' : '0.45'}>
                {element.label || 'Texto'}
              </text>
            </g>
          );
        }
        const isOpponent = element.type === 'opponent';
        const name = compactDiagramLabel(element.printName || getPlayerName(element, playersById), readOnly ? 12 : 18);
        const labelX = Number.isFinite(Number(element.printLabelX)) ? Number(element.printLabelX) : Number(element.x || 0) + Number(element.printLabelOffsetX || 0);
        const labelY = Number.isFinite(Number(element.printLabelY)) ? Number(element.printLabelY) : Number(element.y || 0) + 5.2 + Number(element.printLabelOffsetY || 0);
        const role = Array.isArray(element.roles) ? element.roles[0] : '';
        const roleCode = String(role || '').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
        const showDorsal = normalizedVisibleLayers.numbers && identityMode !== 'abbreviation';
        const showAbbreviation = normalizedVisibleLayers.abbreviations && identityMode !== 'number';
        const showRoleCode = normalizedVisibleLayers.roles && roleCode;
        const showSequenceNumber = normalizedVisibleLayers.chronology && Number(element.sequenceOrder) > 0;
        return (
          <g key={element.id} onPointerDown={(event) => startDrag(event, element)} className={readOnly ? '' : 'diagram-draggable'}>
            {printOptimized && showAbbreviation && element.printLabelLeader ? (
              <line x1={element.x} y1={element.y} x2={labelX} y2={labelY - 1.2} stroke="currentColor" strokeWidth="0.24" opacity="0.58" />
            ) : null}
            {selected && !readOnly ? (
              <>
                <circle cx={element.x} cy={element.y} r={tokens.selectedPlayerRadius + 0.95} fill="none" stroke="#3DD9FF" strokeWidth="0.9" opacity="0.72" />
                <circle cx={element.x} cy={element.y} r={tokens.selectedPlayerRadius + 1.3} fill="none" stroke="white" strokeWidth="0.26" opacity="0.95" />
              </>
            ) : null}
            <circle cx={element.x} cy={element.y} r={selected ? tokens.selectedPlayerRadius : tokens.playerRadius} fill={isOpponent ? 'white' : 'currentColor'} stroke="currentColor" strokeWidth="0.55" />
            {element.primaryResponsibility ? <circle cx={element.x} cy={element.y} r={tokens.responsibilityRadius} fill="none" stroke="currentColor" strokeWidth="0.48" /> : null}
            <text x={element.x} y={element.y + tokens.dorsalSize * 0.34} textAnchor="middle" dominantBaseline="middle" fontSize={tokens.dorsalSize} fontWeight="900" fill={isOpponent ? 'currentColor' : 'white'}>
              {showDorsal ? element.label || '' : ''}
            </text>
            {name && showAbbreviation ? (
              <text x={labelX} y={labelY} textAnchor="middle" dominantBaseline="middle" fontSize={tokens.abbreviationSize} fontWeight="900" fill="currentColor" paintOrder="stroke" stroke="white" strokeWidth={printOptimized ? '0.75' : '0.45'}>
                {name.toUpperCase()}
              </text>
            ) : null}
            {showSequenceNumber ? (
              <g>
                <circle cx={Number(element.x) + 2.8} cy={Number(element.y) - 2.8} r={tokens.stepRadius} fill="currentColor" />
                <text x={Number(element.x) + 2.8} y={Number(element.y) - 2.8 + tokens.stepSize * 0.34} textAnchor="middle" fontSize={tokens.stepSize} fontWeight="900" fill="white">{Number(element.sequenceOrder)}</text>
              </g>
            ) : null}
            {showRoleCode ? (
              <text x={Number(element.x) - 3} y={Number(element.y) - 2.8} textAnchor="middle" fontSize={tokens.roleSize} fontWeight="900" fill="currentColor" paintOrder="stroke" stroke="white" strokeWidth="0.45">{roleCode}</text>
            ) : null}
            {element.locked && !readOnly ? <text x={element.x + 4.2} y={element.y - 3.5} fontSize="2.6" fontWeight="900">L</text> : null}
          </g>
        );
      })}
    </svg>
  );
}
