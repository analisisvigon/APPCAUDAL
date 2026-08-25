import { getPlayerDisplayName } from '../../utils/playerDisplayName';
import { formatPlayerNumberName, getPlayerNumberLabel } from '../../utils/playerNumberPresentation';

export default function PlayerNumberName({ player = {}, displayName, truncateName = true, className = '', nameClassName = '' }) {
  const number = getPlayerNumberLabel(player.number);
  const name = String(displayName || '').trim() || getPlayerDisplayName(player);

  return (
    <span
      className={`inline-flex min-w-0 items-center gap-1 font-black uppercase leading-none ${className}`}
      aria-label={formatPlayerNumberName(number, name)}
    >
      {number ? (
        <>
          <span className="shrink-0 font-extrabold text-caudal-electric">{number}</span>
          <span className="shrink-0 text-slate-500" aria-hidden="true">·</span>
        </>
      ) : null}
      <span className={`min-w-0 font-black text-white ${truncateName ? 'truncate' : 'whitespace-normal break-words'} ${nameClassName}`} title={name}>{name}</span>
    </span>
  );
}
