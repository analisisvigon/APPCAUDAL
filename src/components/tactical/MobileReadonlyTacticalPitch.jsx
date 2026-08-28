import { buildMobileReadonlyPitchLayout } from '../../utils/mobileReadonlyPitchLayout';

const cleanText = (value) => String(value || '').trim();

const getCompactRole = (value) => {
  const source = cleanText(value);
  const normalized = source.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (!source) return 'POS';
  if (source.length <= 4 && !source.includes(' ')) return source.toUpperCase();
  if (/^por\b/.test(normalized)) return 'POR';
  if (/^dfc\b/.test(normalized)) return 'DFC';
  if (/^mcd\b/.test(normalized)) return 'MCD';
  if (/^mc\b/.test(normalized)) return 'MC';
  if (/^mp[cdai]?\b/.test(normalized)) return 'MP';
  if (/^dc\b/.test(normalized)) return 'DC';
  if (/^(li|ld|cai|cad|ei|ed)\b/.test(normalized)) return normalized.split(/\s+/)[0].toUpperCase();
  if (/portero|guardameta/.test(normalized)) return 'POR';
  if (/carrilero/.test(normalized)) return /izquier/.test(normalized) ? 'CAI' : /derech/.test(normalized) ? 'CAD' : 'CA';
  if (/lateral/.test(normalized)) return /izquier/.test(normalized) ? 'LI' : /derech/.test(normalized) ? 'LD' : 'LAT';
  if (/central|defensa/.test(normalized)) return 'DFC';
  if (/pivote/.test(normalized)) return 'MCD';
  if (/mediapunta/.test(normalized)) return 'MP';
  if (/mediocentro|interior|medio/.test(normalized)) return 'MC';
  if (/extremo/.test(normalized)) return /izquier/.test(normalized) ? 'EI' : /derech/.test(normalized) ? 'ED' : 'EXT';
  if (/delantero|punta/.test(normalized)) return 'DC';
  return source.slice(0, 4).toUpperCase();
};

const getInitials = (slot) => cleanText(slot?.initials || slot?.name || slot?.role || 'J')
  .split(/\s+/)
  .filter(Boolean)
  .map((part) => part[0])
  .join('')
  .slice(0, 2)
  .toUpperCase();

const normalizeBenchGroups = (groups) => (Array.isArray(groups) ? groups : [])
  .map((group) => ({
    ...group,
    players: Array.isArray(group?.players) ? group.players.filter(Boolean) : [],
  }))
  .filter((group) => group.players.length);

export default function MobileReadonlyTacticalPitch({
  ariaLabel = 'Campo táctico en modo consulta',
  eyebrow = 'Vista móvil de consulta',
  system = '',
  variants = [],
  slots = [],
  benchGroups = [],
  emptyMessage = '',
  tone = 'caudal',
}) {
  const positionedSlots = buildMobileReadonlyPitchLayout(slots);
  const normalizedBenchGroups = normalizeBenchGroups(benchGroups);
  const variantItems = Array.isArray(variants) ? variants.filter(Boolean) : [];

  return (
    <section className="mobile-readonly-tactical-surface" aria-label={ariaLabel} data-mobile-readonly-pitch="true">
      <header className="mobile-readonly-pitch-summary">
        <div>
          <p>{eyebrow}</p>
          <strong>{system || 'Sistema pendiente'}</strong>
        </div>
        {variantItems.length ? (
          <div className="mobile-readonly-pitch-variants" aria-label="Variantes de sistema">
            {variantItems.map((variant) => <span key={variant}>{variant}</span>)}
          </div>
        ) : null}
      </header>

      <div className={`mobile-readonly-pitch mobile-readonly-pitch--${tone}`} role="img" aria-label={`${ariaLabel}${system ? ` · ${system}` : ''}`}>
        <span className="mobile-readonly-pitch-line mobile-readonly-pitch-line--outer" />
        <span className="mobile-readonly-pitch-line mobile-readonly-pitch-line--halfway" />
        <span className="mobile-readonly-pitch-line mobile-readonly-pitch-line--circle" />
        <span className="mobile-readonly-pitch-line mobile-readonly-pitch-line--box-top" />
        <span className="mobile-readonly-pitch-line mobile-readonly-pitch-line--box-bottom" />

        {positionedSlots.map((slot, index) => {
          const name = cleanText(slot.name) || cleanText(slot.role) || `Posición ${index + 1}`;
          const role = cleanText(slot.role) || 'POS';
          const compactRole = getCompactRole(role);
          const image = cleanText(slot.image || slot.photoUrl);
          const badgeItems = Array.isArray(slot.badges) ? slot.badges.slice(0, 3) : [];
          return (
            <span
              key={slot.id || `${role}-${index}`}
              className={`mobile-readonly-pitch-player ${slot.hasPlayer === false ? 'mobile-readonly-pitch-player--empty' : ''}`}
              style={{ left: `${slot.mobileX}%`, top: `${slot.mobileY}%` }}
              title={`${slot.number ? `#${slot.number} · ` : ''}${name} · ${role}`}
            >
              <span className="mobile-readonly-pitch-role">{compactRole}</span>
              <span className="mobile-readonly-pitch-portrait">
                <span aria-hidden="true">{getInitials(slot)}</span>
                {image ? <img src={image} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} /> : null}
                {slot.number ? <b>#{slot.number}</b> : null}
                {badgeItems.length ? (
                  <span className="mobile-readonly-pitch-badges">
                    {badgeItems.map((badge, badgeIndex) => (
                      <i key={`${cleanText(badge?.label || badge)}-${badgeIndex}`} title={cleanText(badge?.title)}>
                        {cleanText(badge?.label || badge)}
                      </i>
                    ))}
                  </span>
                ) : null}
              </span>
              <span className="mobile-readonly-pitch-name">{name}</span>
              {slot.secondaryLabel ? <span className="mobile-readonly-pitch-secondary">{slot.secondaryLabel}</span> : null}
            </span>
          );
        })}

        {!positionedSlots.length && emptyMessage ? (
          <p className="mobile-readonly-pitch-empty">{emptyMessage}</p>
        ) : null}
      </div>

      {normalizedBenchGroups.length ? (
        <section className="mobile-readonly-bench" aria-label="Banquillo">
          <div className="mobile-readonly-bench-heading">
            <p>Banquillo</p>
            <span>{normalizedBenchGroups.reduce((total, group) => total + group.players.length, 0)}</span>
          </div>
          <div className="mobile-readonly-bench-groups">
            {normalizedBenchGroups.map((group) => (
              <div key={group.label} className="mobile-readonly-bench-group">
                <h4>{group.label}</h4>
                <div>
                  {group.players.map((player, playerIndex) => {
                    const name = cleanText(player.displayName || player.name) || 'Jugador';
                    const image = cleanText(player.image || player.photoUrl);
                    return (
                      <span key={player.id || `${group.label}-${name}-${playerIndex}`} className="mobile-readonly-bench-player" title={name}>
                        <span className="mobile-readonly-bench-avatar">
                          <span aria-hidden="true">{getInitials({ ...player, name })}</span>
                          {image ? <img src={image} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} /> : null}
                        </span>
                        <span className="mobile-readonly-bench-identity">
                          <strong>{player.number ? `#${player.number} ` : ''}{name}</strong>
                          {player.position ? <small>{player.position}</small> : null}
                        </span>
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
