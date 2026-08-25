import { buildPrintPlayerShirtModel } from '../../utils/printPlayerShirt';

export default function PlayerShirt({ player, teamType = 'own', kit = 'home', assigned, goalkeeper = false, compact = false, captain = false, protocolPrimary = false }) {
  const model = buildPrintPlayerShirtModel({ player, teamType, kit, assigned });

  return (
    <div
      className={`print-player-shirt ${model.teamType} ${model.kit} ${model.assigned ? 'assigned' : 'unassigned'} ${goalkeeper ? 'goalkeeper' : ''} ${compact ? 'compact' : ''}`}
      data-team-type={model.teamType}
      data-assigned={model.assigned ? 'true' : 'false'}
      role="img"
      aria-label={`${model.teamType === 'opponent' ? 'Rival' : 'Jugador propio'} · ${model.number} · ${model.identity}`}
    >
      <svg className="print-shirt-shape" viewBox="0 0 100 88" aria-hidden="true">
        <path
          className="shirt-body"
          d="M32 8 19 14 7 34l17 9 6-10v47h40V33l6 10 17-9-12-20-13-6-8 11H40L32 8Z"
        />
        <path className="shirt-sleeve-panel" d="M19 14 7 34l17 9 6-10-5-10ZM81 14l12 20-17 9-6-10 5-10Z" />
        <path className="shirt-opponent-mark" d="M31 18 39 13 70 63v17h-6L30 24Z" />
        <path className="shirt-neck" d="M40 19h20l-5 7H45l-5-7Z" />
      </svg>
      <span className="print-shirt-number">{model.number}</span>
      <span className="print-shirt-name">{model.identity}</span>
      {captain ? <span className="print-captain-badge">C</span> : null}
      {protocolPrimary ? <span className="print-protocol-badge">1'</span> : null}
    </div>
  );
}
