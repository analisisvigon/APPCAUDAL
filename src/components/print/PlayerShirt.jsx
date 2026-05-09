const getDisplayName = (player) =>
  player?.shirtName || player?.shirt_name || player?.shortName || player?.name || player?.label || '';

export default function PlayerShirt({ player, kit = 'home', goalkeeper = false, compact = false, captain = false }) {
  const number = player?.number || player?.dorsal || '';
  const name = getDisplayName(player);
  const kitClass = goalkeeper ? 'goalkeeper' : kit === 'away' ? 'away' : 'home';

  return (
    <div className={`print-player-shirt ${kitClass} ${compact ? 'compact' : ''}`}>
      <svg className="print-shirt-shape" viewBox="0 0 100 92" aria-hidden="true">
        <path
          className="shirt-body"
          d="M31 8 18 14 6 36l17 9 5-9v48h44V36l5 9 17-9-12-22-13-6-8 12H39L31 8Z"
        />
        {kitClass === 'away' ? (
          <>
            <path className="shirt-stripe" d="M34 21h8v63h-8z" />
            <path className="shirt-stripe" d="M50 21h8v63h-8z" />
            <path className="shirt-stripe" d="M66 21h6v63h-6z" />
          </>
        ) : null}
        <path className="shirt-neck" d="M39 20h22l-5 8H44l-5-8Z" />
      </svg>
      <span className="print-shirt-number">{number || '-'}</span>
      <span className="print-shirt-name">{name || 'Jugador'}</span>
      {captain ? <span className="print-captain-badge">C</span> : null}
    </div>
  );
}
