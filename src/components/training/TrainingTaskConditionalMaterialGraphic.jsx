import { getTrainingConditionalMaterial } from '../../utils/trainingTaskBoardElements';

const svgColors = (color, monochrome) => ({
  primary: monochrome ? '#374151' : color,
  ink: monochrome ? '#1f2937' : '#10291d',
  paper: '#f8fafc',
  accent: monochrome ? '#d1d5db' : '#facc15',
  turf: monochrome ? '#ffffff' : '#176b3a',
});

const resolveColor = (value, colors) => (
  value === 'none' ? 'none' : colors[value] || value
);

function VectorShape({ shape, colors }) {
  const stroke = resolveColor(shape.stroke || 'primary', colors);
  const fill = resolveColor(shape.fill || 'none', colors);
  const common = {
    stroke,
    strokeWidth: shape.strokeWidth,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };
  if (shape.type === 'line') {
    return <line x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} {...common} />;
  }
  if (shape.type === 'polyline') {
    return <polyline points={shape.points.map((point) => point.join(',')).join(' ')} fill="none" {...common} />;
  }
  if (shape.type === 'rect') {
    return <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.radius || undefined}
      fill={fill} {...common} />;
  }
  if (shape.type === 'ellipse') {
    return <ellipse cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} fill={fill} {...common} />;
  }
  return null;
}

export default function TrainingTaskConditionalMaterialGraphic({
  materialKey,
  color = 'currentColor',
  monochrome = false,
  className = '',
  x,
  y,
  width,
  height,
}) {
  const material = getTrainingConditionalMaterial(materialKey);
  const hasPosition = x !== undefined && y !== undefined;
  const colors = svgColors(color, monochrome);
  return <svg
    viewBox="0 0 24 24"
    preserveAspectRatio="xMidYMid meet"
    className={className}
    data-training-material={materialKey}
    aria-hidden="true"
    focusable="false"
    pointerEvents={hasPosition ? 'none' : undefined}
    x={hasPosition ? x - (width || 10) / 2 : undefined}
    y={hasPosition ? y - (height || 8) / 2 : undefined}
    width={hasPosition ? width || 10 : undefined}
    height={hasPosition ? height || 8 : undefined}
  >
    {material ? material.icon.shapes.map((shape, index) => (
      <VectorShape key={`${material.id}-${index}`} shape={shape} colors={colors} />
    )) : <>
      <circle cx="12" cy="12" r="8" fill="none" stroke={colors.primary} strokeWidth="1.8" />
      <text x="12" y="16" textAnchor="middle" fill={colors.primary} fontSize="11" fontWeight="700">?</text>
    </>}
  </svg>;
}
