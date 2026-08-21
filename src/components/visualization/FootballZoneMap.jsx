const safeRows = (value) => Array.isArray(value) ? value : [];

const normalizeZone = (zone) => typeof zone === 'string'
  ? { value: zone, label: zone }
  : { value: String(zone?.value || ''), label: zone?.shortLabel || zone?.label || zone?.value || '', count: zone?.count };

export default function FootballZoneMap({ zones = [], counts = {}, variant = 'screen', emptyLabel = 'Sin datos registrados' }) {
  const normalized = safeRows(zones).map(normalizeZone);
  const resolved = normalized.map((zone) => ({
    ...zone,
    count: Number(zone.count ?? counts?.[zone.value] ?? 0) || 0,
  }));
  const hasData = resolved.some((zone) => zone.count > 0);

  return (
    <div className={`football-zone-map is-${variant}`} data-zone-orientation="attack-top">
      <svg className="football-zone-map-markings" viewBox="0 0 68 105" preserveAspectRatio="none" aria-hidden="true">
        <rect className="pitch-boundary" x="2" y="2" width="64" height="101" rx="1.5" />
        <line x1="2" y1="52.5" x2="66" y2="52.5" />
        <circle cx="34" cy="52.5" r="9.15" />
        <circle className="pitch-spot" cx="34" cy="52.5" r="0.75" />

        <rect x="14" y="2" width="40" height="17" />
        <rect x="24" y="2" width="20" height="6" />
        <circle className="pitch-spot" cx="34" cy="12" r="0.7" />
        <path d="M 27 19 A 9.15 9.15 0 0 0 41 19" />
        <rect className="pitch-goal" x="28" y="0.3" width="12" height="1.7" />

        <rect x="14" y="86" width="40" height="17" />
        <rect x="24" y="97" width="20" height="6" />
        <circle className="pitch-spot" cx="34" cy="93" r="0.7" />
        <path d="M 27 86 A 9.15 9.15 0 0 1 41 86" />
        <rect className="pitch-goal" x="28" y="103" width="12" height="1.7" />
      </svg>

      <span className="football-zone-map-direction">ATAQUE ↑</span>
      <div className="football-zone-map-cells">
        {resolved.map((zone) => (
          <div key={zone.value} data-zone={zone.value} className={zone.count > 0 ? 'has-value' : ''}>
            {zone.count > 0 ? <><span>{zone.label}</span><strong>{zone.count}</strong></> : null}
          </div>
        ))}
      </div>
      {!hasData ? <p className="football-zone-map-empty">{emptyLabel}</p> : null}
    </div>
  );
}
