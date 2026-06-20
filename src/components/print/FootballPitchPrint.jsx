import PlayerShirt from './PlayerShirt';

export default function FootballPitchPrint({ players = [], coordinates = [], kit = 'home' }) {
  return (
    <div className="print-pitch" aria-label="Campo táctico">
      <div className="print-pitch-line halfway" />
      <div className="print-pitch-circle" />
      <div className="print-pitch-box top big" />
      <div className="print-pitch-box bottom big" />
      <div className="print-pitch-box top small" />
      <div className="print-pitch-box bottom small" />
      {coordinates.map((slot, index) => {
        const player = players[index] || { number: '', name: 'Sin jugador asignado' };
        const goalkeeper = index === 0 || String(player.position || '').toLowerCase().includes('portero');
        return (
          <div
            key={`${player.id || player.name || 'slot'}-${index}`}
            className={`print-player-slot ${goalkeeper ? 'goalkeeper-slot' : ''}`}
            style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
          >
            <PlayerShirt player={player} kit={kit} goalkeeper={goalkeeper} captain={Boolean(player.isCaptain)} />
          </div>
        );
      })}
    </div>
  );
}
