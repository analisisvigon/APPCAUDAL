import { useMemo, useRef, useState } from 'react';

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const snapValue = (value, enabled) => (enabled ? Math.round(value / 2) * 2 : value);
const isArrow = (element) => ['arrow', 'dashed_arrow', 'curved_arrow', 'double_arrow'].includes(element?.type);
const isResizableBox = (element) => ['zone', 'block', 'text_box'].includes(element?.type);

const getPoint = (event, svg) => {
  const rect = svg.getBoundingClientRect();
  return {
    x: clamp(((event.clientX - rect.left) / rect.width) * 100),
    y: clamp(((event.clientY - rect.top) / rect.height) * 72, 0, 72),
  };
};

const getPlayerName = (element, playersById) => {
  const player = playersById.get(element.player_id);
  return element.name || player?.shirt_name || player?.shirtName || player?.shortName || player?.name || '';
};

const splitLines = (value) => String(value || '').split('\n').slice(0, 12);

const BallIcon = ({ x, y, selected }) => (
  <g>
    <circle cx={x} cy={y} r={selected ? 3.7 : 3} fill="white" stroke="currentColor" strokeWidth="1.2" />
    <path d={`M${x} ${y - 1.45}l1.25.9-.48 1.45h-1.54l-.48-1.45Z`} fill="currentColor" />
    <path d={`M${x - 2.25} ${y - 1.05}l1.28.55.15 1.4-1.08.95-.95-.9.12-1.35Z`} fill="currentColor" />
    <path d={`M${x + 2.25} ${y - 1.05}l-1.28.55-.15 1.4 1.08.95.95-.9-.12-1.35Z`} fill="currentColor" />
    <path d={`M${x - 1.15} ${y + 2.1}l1.15-.85 1.15.85-.42 1.05h-1.66Z`} fill="currentColor" />
    <path d={`M${x - 1.95} ${y - 1.05}Q${x - 0.95} ${y - 2.35} ${x} ${y - 1.45}Q${x + 0.95} ${y - 2.35} ${x + 1.95} ${y - 1.05}`} fill="none" stroke="currentColor" strokeWidth="0.38" />
    <path d={`M${x - 2.1} ${y + 1.75}Q${x - 1.15} ${y + 1.05} ${x - 0.77} ${y - 0.1}M${x + 2.1} ${y + 1.75}Q${x + 1.15} ${y + 1.05} ${x + 0.77} ${y - 0.1}`} fill="none" stroke="currentColor" strokeWidth="0.38" />
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
      <line x1="1" y1="36" x2="99" y2="36" stroke="currentColor" strokeWidth="0.45" strokeDasharray="2 2" />
      <rect x="22" y="1" width="56" height="21" fill="none" stroke="currentColor" strokeWidth="0.7" />
      <rect x="36" y="1" width="28" height="9" fill="none" stroke="currentColor" strokeWidth="0.7" />
      <rect x="42" y="1" width="16" height="2.5" fill="none" stroke="currentColor" strokeWidth="0.9" />
      <path d="M38 22 Q50 30 62 22" fill="none" stroke="currentColor" strokeWidth="0.6" />
      <path d="M1 1 Q7 7 1 13" fill="none" stroke="currentColor" strokeWidth="0.6" />
      <path d="M99 1 Q93 7 99 13" fill="none" stroke="currentColor" strokeWidth="0.6" />
    </>
  );
}

export default function SetPieceDiagramCanvas({ elements = [], selectedId, onSelect, onChange, readOnly = false, players = [], snap = false, fullField = false }) {
  const svgRef = useRef(null);
  const [drag, setDrag] = useState(null);
  const playersById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);

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
    if (drag.mode === 'resize' && drag.element.type === 'block') {
      updateElement(drag.element.id, { width: snapValue(clamp((drag.origin.width || 8) + dx, 5, 16), snap) });
      return;
    }
    if (drag.mode === 'resize') {
      updateElement(drag.element.id, {
        width: snapValue(clamp((drag.origin.width || 18) + dx, 4, 90), snap),
        height: snapValue(clamp((drag.origin.height || 10) + dy, 4, 60), snap),
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
    if (readOnly || element.locked) return;
    event.stopPropagation();
    onSelect(element.id);
    const point = getPoint(event, svgRef.current);
    setDrag({ element, mode, start: point, origin: { ...element } });
  };

  const stopDrag = () => setDrag(null);

  return (
    <svg
      ref={svgRef}
      className="set-piece-diagram-canvas"
      viewBox="0 0 100 72"
      role="img"
      aria-label="Editor tactico ABP"
      onPointerMove={handlePointerMove}
      onPointerUp={stopDrag}
      onPointerLeave={stopDrag}
      onPointerDown={() => !readOnly && onSelect('')}
    >
      <defs>
        <marker id="diagram-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
        </marker>
        <marker id="diagram-arrow-start" viewBox="0 0 10 10" refX="2" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 10 0 L 0 5 L 10 10 z" fill="currentColor" />
        </marker>
      </defs>
      <PitchLines fullField={fullField} />

      {elements.map((element) => {
        const selected = selectedId === element.id;
        if (isArrow(element)) {
          const dashed = element.type === 'dashed_arrow' || element.dashed;
          const curved = element.type === 'curved_arrow';
          const double = element.type === 'double_arrow';
          const midX = ((element.x1 || 0) + (element.x2 || 0)) / 2;
          const midY = ((element.y1 || 0) + (element.y2 || 0)) / 2 - 12;
          const path = curved ? `M${element.x1} ${element.y1} Q${midX} ${midY} ${element.x2} ${element.y2}` : `M${element.x1} ${element.y1} L${element.x2} ${element.y2}`;
          return (
            <g key={element.id} onPointerDown={(event) => startDrag(event, element)} className={readOnly ? '' : 'diagram-draggable'}>
              <path d={path} fill="none" stroke="currentColor" strokeWidth={selected ? 1.6 : 1.05} strokeDasharray={dashed ? '4 3' : ''} markerEnd="url(#diagram-arrow)" markerStart={double ? 'url(#diagram-arrow-start)' : ''} />
              {selected && !readOnly ? (
                <>
                  <circle cx={element.x1} cy={element.y1} r="2" fill="white" stroke="currentColor" strokeWidth="0.7" onPointerDown={(event) => startDrag(event, element, 'arrow-start')} />
                  <circle cx={element.x2} cy={element.y2} r="2" fill="white" stroke="currentColor" strokeWidth="0.7" onPointerDown={(event) => startDrag(event, element, 'arrow-end')} />
                </>
              ) : null}
            </g>
          );
        }
        if (element.type === 'block') {
          const radius = Math.max(2.5, Math.min(8, (element.width || 8) / 2));
          return (
            <g key={element.id} onPointerDown={(event) => startDrag(event, element)} className={readOnly ? '' : 'diagram-draggable'}>
              <circle cx={element.x} cy={element.y} r={radius} fill="white" stroke="currentColor" strokeWidth={selected ? 1.3 : 1} />
              <path d={`M${element.x - radius * 0.55} ${element.y - radius * 0.55}L${element.x + radius * 0.55} ${element.y + radius * 0.55}M${element.x + radius * 0.55} ${element.y - radius * 0.55}L${element.x - radius * 0.55} ${element.y + radius * 0.55}`} stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" />
              {element.label ? <text x={element.x} y={element.y + radius + 4} textAnchor="middle" fontSize="2.6" fontWeight="900">{element.label}</text> : null}
              {selected && !readOnly ? (
                <rect x={element.x + radius - 1.5} y={element.y + radius - 1.5} width="3.5" height="3.5" fill="white" stroke="currentColor" strokeWidth="0.7" onPointerDown={(event) => startDrag(event, element, 'resize')} />
              ) : null}
            </g>
          );
        }
        if (isResizableBox(element)) {
          const width = element.width || (element.type === 'text_box' ? 30 : 18);
          const height = element.height || (element.type === 'text_box' ? 18 : 10);
          const lines = splitLines(element.label || (element.type === 'block' ? 'BLOQUEO' : ''));
          return (
            <g key={element.id} onPointerDown={(event) => startDrag(event, element)} className={readOnly ? '' : 'diagram-draggable'}>
              <rect x={element.x} y={element.y} width={width} height={height} fill="white" stroke="currentColor" strokeWidth={selected ? 1.2 : 0.85} strokeDasharray={element.type === 'zone' ? '3 2' : ''} />
              {lines.map((line, index) => (
                <text key={`${element.id}-${index}`} x={(element.x || 0) + 2} y={(element.y || 0) + 5 + index * 4} fontSize={element.type === 'text_box' ? '2.8' : '3.1'} fontWeight={index === 0 ? '900' : '700'} fill="currentColor">
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
              <BallIcon x={element.x} y={element.y} selected={selected} />
            </g>
          );
        }
        if (element.type === 'text') {
          return (
            <g key={element.id} onPointerDown={(event) => startDrag(event, element)} className={readOnly ? '' : 'diagram-draggable'}>
              <text x={element.x} y={element.y} textAnchor="middle" fontSize={selected ? '4.4' : '3.8'} fontWeight="900" fill="currentColor">
                {element.label || 'Texto'}
              </text>
            </g>
          );
        }
        const isOpponent = element.type === 'opponent';
        const name = getPlayerName(element, playersById);
        return (
          <g key={element.id} onPointerDown={(event) => startDrag(event, element)} className={readOnly ? '' : 'diagram-draggable'}>
            <circle cx={element.x} cy={element.y} r={selected ? 3.6 : 3.2} fill={isOpponent ? 'white' : 'currentColor'} stroke="currentColor" strokeWidth="0.8" />
            <text x={element.x} y={element.y + 1.15} textAnchor="middle" fontSize="3" fontWeight="900" fill={isOpponent ? 'currentColor' : 'white'}>
              {element.label || ''}
            </text>
            {name ? (
              <text x={element.x} y={element.y + 7.2} textAnchor="middle" fontSize="2.4" fontWeight="800" fill="currentColor">
                {name.split(' ').slice(0, 2).join(' ').toUpperCase()}
              </text>
            ) : null}
            {element.locked && !readOnly ? <text x={element.x + 4.2} y={element.y - 3.5} fontSize="2.6" fontWeight="900">L</text> : null}
          </g>
        );
      })}
    </svg>
  );
}
