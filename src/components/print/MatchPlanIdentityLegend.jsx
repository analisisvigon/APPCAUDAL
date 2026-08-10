export default function MatchPlanIdentityLegend({ compact = false }) {
  return (
    <p className={`match-plan-identity-legend ${compact ? 'match-plan-identity-legend-compact' : ''}`} aria-label="Leyenda: nuestro equipo, rival y balón">
      <span><i className="match-plan-legend-own" aria-hidden="true" />Nuestro equipo</span>
      <span><i className="match-plan-legend-rival" aria-hidden="true" />Rival</span>
      <span><i className="match-plan-legend-ball" aria-hidden="true">⚽</i>Balón</span>
    </p>
  );
}
