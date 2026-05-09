import { useRef, useState } from 'react';

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));

const getPoint = (event, svg) => {
  const rect = svg.getBoundingClientRect();
  return {
    x: clamp(((event.clientX - rect.left) / rect.width) * 100),
    y: clamp(((event.clientY - rect.top) / rect.height) * 100),
  };
};

export default function SetPieceDiagramCanvas({ elements = [], selectedId, onSelect, onChange, readOnly = false }) {
  const svgRef = useRef(null);
  const [drag, setDrag] = useState(null);

  const updateElement = (id, fields) => {
    onChange(elements.map((element) => (element.id === id ? { ...element, ...fields } : element)));
  };

  const handlePointerMove = (event) => {
    if (!drag || readOnly || !svgRef.current) return;
    const point = getPoint(event, svgRef.current);
    const dx = point.x - drag.start.x;
    const dy = point.y - drag.start.y;
    const next = { x: clamp(drag.origin.x + dx), y: clamp(drag.origin.y + dy) };
    if (drag.element.type === 'arrow' || drag.element.type === 'dashed_arrow') {
      updateElement(drag.element.id, {
        x1: clamp(drag.origin.x1 + dx),
        y1: clamp(drag.origin.y1 + dy),
        x2: clamp(drag.origin.x2 + dx),
        y2: clamp(drag.origin.y2 + dy),
      });
    } else {
      updateElement(drag.element.id, next);
    }
  };

  const startDrag = (event, element) => {
    if (readOnly) return;
    event.stopPropagation();
    onSelect(element.id);
    const point = getPoint(event, svgRef.current);
    setDrag({ element, start: point, origin: { ...element } });
  };

  const stopDrag = () => setDrag(null);

  return (
    <svg
      ref={svgRef}
      className="set-piece-diagram-canvas"
      viewBox="0 0 100 72"
      role="img"
      aria-label="Editor táctico ABP"
      onPointerMove={handlePointerMove}
      onPointerUp={stopDrag}
      onPointerLeave={stopDrag}
      onPointerDown={() => !readOnly && onSelect('')}
    >
      <defs>
        <marker id="diagram-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
        </marker>
      </defs>
      <rect x="1" y="1" width="98" height="70" fill="white" stroke="currentColor" strokeWidth="0.8" />
      <rect x="22" y="1" width="56" height="21" fill="none" stroke="currentColor" strokeWidth="0.7" />
      <rect x="36" y="1" width="28" height="9" fill="none" stroke="currentColor" strokeWidth="0.7" />
      <rect x="42" y="1" width="16" height="2.5" fill="none" stroke="currentColor" strokeWidth="0.9" />
      <path d="M38 22 Q50 30 62 22" fill="none" stroke="currentColor" strokeWidth="0.6" />
      <path d="M1 1 Q7 7 1 13" fill="none" stroke="currentColor" strokeWidth="0.6" />
      <path d="M99 1 Q93 7 99 13" fill="none" stroke="currentColor" strokeWidth="0.6" />

      {elements.map((element) => {
        const selected = selectedId === element.id;
        if (element.type === 'arrow' || element.type === 'dashed_arrow') {
          return (
            <g key={element.id} onPointerDown={(event) => startDrag(event, element)} className={readOnly ? '' : 'diagram-draggable'}>
              <line
                x1={element.x1}
                y1={element.y1}
                x2={element.x2}
                y2={element.y2}
                stroke="currentColor"
                strokeWidth={selected ? 1.8 : 1.2}
                strokeDasharray={element.type === 'dashed_arrow' || element.dashed ? '4 3' : ''}
                markerEnd="url(#diagram-arrow)"
              />
            </g>
          );
        }
        if (element.type === 'zone') {
          return (
            <g key={element.id} onPointerDown={(event) => startDrag(event, element)} className={readOnly ? '' : 'diagram-draggable'}>
              <rect
                x={element.x}
                y={element.y}
                width={element.width || 18}
                height={element.height || 10}
                fill="none"
                stroke="currentColor"
                strokeWidth={selected ? 1.2 : 0.8}
                strokeDasharray="3 2"
              />
              {element.label ? <text x={element.x + 2} y={element.y + 6} fontSize="3.2" fontWeight="700">{element.label}</text> : null}
            </g>
          );
        }
        if (element.type === 'ball') {
          return (
            <g key={element.id} onPointerDown={(event) => startDrag(event, element)} className={readOnly ? '' : 'diagram-draggable'}>
              <circle cx={element.x} cy={element.y} r={selected ? 2.8 : 2.2} fill="white" stroke="currentColor" strokeWidth="0.8" />
              <path d={`M${element.x - 1.5} ${element.y}h3M${element.x} ${element.y - 1.5}v3`} stroke="currentColor" strokeWidth="0.45" />
            </g>
          );
        }
        const isOpponent = element.type === 'opponent';
        return (
          <g key={element.id} onPointerDown={(event) => startDrag(event, element)} className={readOnly ? '' : 'diagram-draggable'}>
            <circle cx={element.x} cy={element.y} r={selected ? 4.3 : 3.8} fill={isOpponent ? 'white' : 'currentColor'} stroke="currentColor" strokeWidth="0.8" />
            <text
              x={element.x}
              y={element.y + 1.2}
              textAnchor="middle"
              fontSize="3.6"
              fontWeight="900"
              fill={isOpponent ? 'currentColor' : 'white'}
            >
              {element.label || ''}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
