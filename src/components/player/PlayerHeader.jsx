import PlayerAvatar from './PlayerAvatar';

export default function PlayerHeader({ profile }) {
  const shirtName = String(profile?.shirt_name || '').trim();
  const fullName = String(profile?.name || '').trim() || 'Jugador';
  const dorsal = Number.isInteger(profile?.number) && profile.number > 0 ? `#${profile.number}` : '';
  const playerPosition = String(profile?.player_position || '').trim();
  const displayName = shirtName || fullName;
  const showFullName = shirtName && shirtName.toLocaleLowerCase('es') !== fullName.toLocaleLowerCase('es');

  return (
    <header className="relative overflow-hidden rounded-[1.35rem] border border-white/10 bg-[#0b1220] shadow-[0_16px_48px_rgba(0,0,0,0.24)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_20%,rgba(79,140,255,0.18),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.045),transparent_48%)]" />
      <div className="relative flex min-w-0 items-center gap-3 p-3.5 sm:gap-5 sm:p-5">
        <PlayerAvatar
          player={profile}
          alt={fullName}
          className="h-[76px] w-[76px] shrink-0 rounded-[1.15rem] border border-white/15 shadow-[0_12px_30px_rgba(0,0,0,0.32)] sm:h-24 sm:w-24 sm:rounded-[1.35rem]"
          fallbackTextClassName="text-lg sm:text-xl"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-caudal-electric/85 sm:text-[10px] sm:tracking-[0.22em]">
            Jugador · C.D. Caudal de Mieres
          </p>
          <h1 className="mt-1 truncate text-2xl font-black tracking-tight text-white sm:text-4xl" title={displayName}>
            {displayName}
          </h1>
          {showFullName ? <p className="mt-0.5 truncate text-xs font-semibold text-slate-400 sm:text-sm">{fullName}</p> : null}
          {dorsal || playerPosition ? (
            <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs font-black text-slate-200 sm:text-sm">
              {dorsal ? <span>{dorsal}</span> : null}
              {dorsal && playerPosition ? <span aria-hidden="true" className="text-slate-600">·</span> : null}
              {playerPosition ? <span>{playerPosition}</span> : null}
            </p>
          ) : null}
        </div>
      </div>
    </header>
  );
}
