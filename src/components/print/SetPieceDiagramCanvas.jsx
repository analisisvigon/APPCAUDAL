import { useMemo, useRef, useState } from 'react';

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const snapValue = (value, enabled) => (enabled ? Math.round(value / 4) * 4 : value);
const isArrow = (element) => ['arrow', 'dashed_arrow', 'curved_arrow', 'double_arrow', 'pass', 'long_pass', 'carry', 'press', 'cover', 'watch'].includes(element?.type);
const isResizableBox = (element) => ['zone', 'block', 'text_box', 'rectangle', 'circle', 'oval'].includes(element?.type);

const getPoint = (event, svg, maxX = 100, maxY = 72) => {
  const rect = svg.getBoundingClientRect();
  return {
    x: clamp(((event.clientX - rect.left) / rect.width) * maxX, 0, maxX),
    y: clamp(((event.clientY - rect.top) / rect.height) * maxY, 0, maxY),
  };
};

const getPlayerName = (element, playersById) => {
  const player = playersById.get(element.player_id);
  return element.name || player?.shirt_name || player?.shirtName || player?.shortName || player?.name || '';
};

const splitLines = (value) => String(value || '').split('\n').slice(0, 12);
const compactDiagramLabel = (value, max = 14) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const parts = text.split(' ').filter(Boolean);
  const compact = parts.length > 1 ? `${parts[0][0]}. ${parts.slice(-1)[0]}` : text;
  return compact.length <= max ? compact : `${compact.slice(0, Math.max(3, max - 1))}.`;
};

const BallIcon = ({ x, y, selected }) => (
  <g>
    <circle cx={x} cy={y} r={selected ? 2.8 : 2.35} fill="white" stroke="currentColor" strokeWidth="0.9" />
    <path d={`M${x} ${y - 1.05}l1 .72-.38 1.18h-1.24l-.38-1.18Z`} fill="currentColor" />
    {[270, 342, 54, 126, 198].map((angle) => {
      const radians = (angle * Math.PI) / 180;
      const x2 = x + Math.cos(radians) * 2.05;
      const y2 = y + Math.sin(radians) * 2.05;
      return <line key={angle} x1={x} y1={y} x2={x2} y2={y2} stroke="currentColor" strokeWidth="0.36" />;
    })}
  </g>
);

function PitchLines({ fullField = false, verticalPitch = false, rivalSystem = '', caudalSystem = '' }) {
  if (verticalPitch) {
    return (
      <>
        <rect x="1" y="1" width="70" height="98" rx="0.8" fill="#0b4a36" stroke="white" strokeWidth="0.8" />
        {[1, 15, 29, 43, 57].map((x, index) => (
          <rect key={x} x={x} y="1" width="14" height="98" fill={index % 2 ? '#0d523c' : '#0b4935'} opacity="0.62" />
        ))}
        <rect x="1" y="1" width="70" height="98" rx="0.8" fill="none" stroke="white" strokeWidth="0.8" />
        <line x1="1" y1="50" x2="71" y2="50" stroke="white" strokeWidth="0.55" />
        <circle cx="36" cy="50" r="8.5" fill="none" stroke="white" strokeWidth="0.55" />
        <circle cx="36" cy="50" r="0.7" fill="white" />
        <rect x="18" y="1" width="36" height="17" fill="none" stroke="white" strokeWidth="0.65" />
        <rect x="27" y="1" width="18" height="7" fill="none" stroke="white" strokeWidth="0.65" />
        <rect x="31" y="-1.2" width="10" height="2.4" fill="none" stroke="white" strokeWidth="0.7" />
        <path d="M28 18 Q36 25 44 18" fill="none" stroke="white" strokeWidth="0.55" />
        <rect x="18" y="82" width="36" height="17" fill="none" stroke="white" strokeWidth="0.65" />
        <rect x="27" y="92" width="18" height="7" fill="none" stroke="white" strokeWidth="0.65" />
        <rect x="31" y="98.8" width="10" height="2.4" fill="none" stroke="white" strokeWidth="0.7" />
        <path d="M28 82 Q36 75 44 82" fill="none" stroke="white" strokeWidth="0.55" />
        <text x="3" y="5" fontSize="1.75" fontWeight="900" fill="rgba(255,255,255,.8)">RIVAL {rivalSystem}</text>
        <text x="69" y="96.5" textAnchor="end" fontSize="1.75" fontWeight="900" fill="rgba(255,255,255,.8)">CAUDAL {caudalSystem}</text>
      </>
    );
  }
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

export default function SetPieceDiagramCanvas({ elements = [], selectedId, onSelect, onChange, readOnly = false, players = [], snap = false, fullField = false, verticalPitch = false, rivalSystem = '', caudalSystem = '' }) {
  const svgRef = useRef(null);
  const [drag, setDrag] = useState(null);
  const playersById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);
  const maxX = verticalPitch ? 72 : 100;
  const maxY = verticalPitch ? 100 : 72;

  const updateElement = (id, fields) => {
    onChange(elements.map((element) => (element.id === id ? { ...element, ...fields } : element)));
  };

  const handlePointerMove = (event) => {
    if (!drag || readOnly || !svgRef.current) return;
    const point = getPoint(event, svgRef.current, maxX, maxY);
    const dx = point.x - drag.start.x;
    const dy = point.y - drag.start.y;

    if (drag.mode === 'arrow-start') {
      updateElement(drag.element.id, { x1: snapValue(clamp(drag.origin.x1 + dx, 0, maxX), snap), y1: snapValue(clamp(drag.origin.y1 + dy, 0, maxY), snap) });
      return;
    }
    if (drag.mode === 'arrow-end') {
      updateElement(drag.element.id, { x2: snapValue(clamp(drag.origin.x2 + dx, 0, maxX), snap), y2: snapValue(clamp(drag.origin.y2 + dy, 0, maxY), snap) });
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
        x1: snapValue(clamp(drag.origin.x1 + dx, 0, maxX), snap),
        y1: snapValue(clamp(drag.origin.y1 + dy, 0, maxY), snap),
        x2: snapValue(clamp(drag.origin.x2 + dx, 0, maxX), snap),
        y2: snapValue(clamp(drag.origin.y2 + dy, 0, maxY), snap),
      });
      return;
    }
    updateElement(drag.element.id, {
      x: snapValue(clamp(drag.origin.x + dx, 0, maxX), snap),
      y: snapValue(clamp(drag.origin.y + dy, 0, maxY), snap),
    });
  };

  const startDrag = (event, element, mode = 'move') => {
    if (readOnly || element.locked) return;
    event.stopPropagation();
    onSelect(element.id);
    const point = getPoint(event, svgRef.current, maxX, maxY);
    setDrag({ element, mode, start: point, origin: { ...element } });
  };

  const stopDrag = () => setDrag(null);

  return (
    <svg
      ref={svgRef}
      className="set-piece-diagram-canvas"
      viewBox={verticalPitch ? '0 0 72 100' : '0 0 100 72'}
      role="img"
      aria-label="Editor tactico ABP"
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
      <PitchLines fullField={fullField} verticalPitch={verticalPitch} rivalSystem={rivalSystem} caudalSystem={caudalSystem} />

      {elements.map((element) => {
        if (element.hidden) return null;
        const selected = selectedId === element.id;
        if (isArrow(element)) {
          const dashed = ['dashed_arrow', 'long_pass', 'watch'].includes(element.type) || element.dashed;
          const curved = element.type === 'curved_arrow';
          const double = element.type === 'double_arrow';
          const midX = ((element.x1 || 0) + (element.x2 || 0)) / 2;
          const midY = ((element.y1 || 0) + (element.y2 || 0)) / 2 - 12;
          const path = curved ? `M${element.x1} ${element.y1} Q${midX} ${midY} ${element.x2} ${element.y2}` : `M${element.x1} ${element.y1} L${element.x2} ${element.y2}`;
          const markerId = `diagram-arrow-${String(element.id).replace(/[^a-zA-Z0-9_-]/g, '')}`;
          const markerStartId = `${markerId}-start`;
          return (
            <g key={element.id} onPointerDown={(event) => startDrag(event, element)} className={readOnly ? '' : 'diagram-draggable'}>
              <defs>
                <marker id={markerId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="3.8" markerHeight="3.8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill={element.color || '#ef4444'} /></marker>
                <marker id={markerStartId} viewBox="0 0 10 10" refX="2" refY="5" markerWidth="3.8" markerHeight="3.8" orient="auto-start-reverse"><path d="M 10 0 L 0 5 L 10 10 z" fill={element.color || '#ef4444'} /></marker>
              </defs>
              <path d={path} fill="none" stroke={element.color || '#ef4444'} strokeWidth={selected ? Math.max(1.15, element.strokeWidth || 1) : element.strokeWidth || 1} strokeDasharray={element.type === 'carry' ? '1 1.4' : dashed ? '3 2.4' : ''} markerEnd={`url(#${markerId})`} markerStart={double ? `url(#${markerStartId})` : ''} />
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
          const radius = Math.max(1.9, Math.min(5.2, (element.width || 7) / 2));
          return (
            <g key={element.id} onPointerDown={(event) => startDrag(event, element)} className={readOnly ? '' : 'diagram-draggable'}>
              <circle cx={element.x} cy={element.y} r={radius} fill="white" stroke="currentColor" strokeWidth={selected ? 1.3 : 1} />
              <path d={`M${element.x - radius * 0.55} ${element.y - radius * 0.55}L${element.x + radius * 0.55} ${element.y + radius * 0.55}M${element.x + radius * 0.55} ${element.y - radius * 0.55}L${element.x - radius * 0.55} ${element.y + radius * 0.55}`} stroke="currentColor" strokeWidth="0.65" strokeLinecap="round" />
              {selected && !readOnly ? (
                <rect x={element.x + radius - 1.5} y={element.y + radius - 1.5} width="3.5" height="3.5" fill="white" stroke="currentColor" strokeWidth="0.7" onPointerDown={(event) => startDrag(event, element, 'resize')} />
              ) : null}
            </g>
          );
        }
        if (isResizableBox(element)) {
          const width = element.width || (element.type === 'text_box' ? 30 : 18);
          const height = element.height || (element.type === 'text_box' ? 18 : 10);
          const lines = splitLines(element.label || (element.type === 'block' ? 'BLOQUEO' : ''))
            .map((line) => (readOnly ? compactDiagramLabel(line, element.type === 'text_box' ? 24 : 18) : line));
          return (
            <g key={element.id} onPointerDown={(event) => startDrag(event, element)} className={readOnly ? '' : 'diagram-draggable'}>
              {['circle', 'oval'].includes(element.type)
                ? <ellipse cx={(element.x || 0) + width / 2} cy={(element.y || 0) + height / 2} rx={width / 2} ry={height / 2} fill="rgba(250,204,21,0.16)" stroke={element.color || 'currentColor'} strokeWidth={selected ? 1.2 : 0.85} />
                : <rect x={element.x} y={element.y} width={width} height={height} fill={element.type === 'zone' ? 'rgba(250,204,21,0.16)' : 'rgba(255,255,255,0.12)'} stroke={element.color || 'currentColor'} strokeWidth={selected ? 1.2 : 0.85} strokeDasharray={element.type === 'zone' ? '3 2' : ''} />}
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
        const linkedPlayer = playersById.get(element.player_id);
        const photo = linkedPlayer?.image || linkedPlayer?.image_url || linkedPlayer?.photo_url || '';
        const name = compactDiagramLabel(getPlayerName(element, playersById), readOnly ? 12 : 18);
        return (
          <g key={element.id} onPointerDown={(event) => startDrag(event, element)} className={readOnly ? '' : 'diagram-draggable'}>
            {photo && !element.numbersOnly ? <><circle cx={element.x} cy={element.y} r="3.7" fill={isOpponent ? '#f8fafc' : '#111827'} stroke={isOpponent ? '#f8fafc' : '#facc15'} strokeWidth="0.7" /><image href={photo} x={element.x - 3.2} y={element.y - 3.2} width="6.4" height="6.4" preserveAspectRatio="xMidYMid slice" /></> : <circle cx={element.x} cy={element.y} r={selected ? 3.1 : 2.75} fill={isOpponent ? 'white' : '#111827'} stroke={isOpponent ? '#111827' : '#facc15'} strokeWidth="0.75" />}
            <text x={element.x} y={element.y + 0.9} textAnchor="middle" fontSize="2.25" fontWeight="900" fill={isOpponent ? 'currentColor' : 'white'}>
              {element.label || ''}
            </text>
            {name ? (
              <text x={element.x} y={element.y + 5.9} textAnchor="middle" fontSize={readOnly ? '1.45' : '1.75'} fontWeight="900" fill={verticalPitch ? 'white' : 'currentColor'} stroke={verticalPitch ? 'rgba(0,0,0,.65)' : 'none'} strokeWidth={verticalPitch ? '.25' : '0'} paintOrder="stroke">
                {name.toUpperCase()}
              </text>
            ) : null}
            {element.locked && !readOnly ? <text x={element.x + 4.2} y={element.y - 3.5} fontSize="2.6" fontWeight="900">L</text> : null}
          </g>
        );
      })}
    </svg>
  );
}
