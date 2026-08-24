import { getPlayerNumberLabel } from '../../utils/playerNumberPresentation';

export default function PlayerNumberBadge({ number, className = '' }) {
  const label = getPlayerNumberLabel(number);
  if (!label) return null;

  return (
    <span
      className={`inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-caudal-electric px-1 text-[9px] font-black leading-none text-slate-950 shadow-[0_2px_8px_rgba(0,0,0,0.45)] ring-1 ring-white/65 ${className}`}
      aria-label={`Dorsal ${label}`}
    >
      {label}
    </span>
  );
}
