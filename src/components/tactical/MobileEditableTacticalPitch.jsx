import { buildMobileReadonlyPitchLayout } from '../../utils/mobileReadonlyPitchLayout';

const cleanText = (value) => String(value || '').trim();

const getInitials = (slot) => cleanText(slot?.name || slot?.role || 'J')
  .split(/\s+/)
  .filter(Boolean)
  .map((part) => part[0])
  .join('')
  .slice(0, 2)
  .toUpperCase();

const compactRole = (value) => {
  const source = cleanText(value);
  if (!source) return 'POS';
  if (source.length <= 4 && !source.includes(' ')) return source.toUpperCase();
  return source.split(/\s+/).map((part) => part[0]).join('').slice(0, 4).toUpperCase();
};

export default function MobileEditableTacticalPitch({
  ariaLabel = 'Campo táctico editable',
  eyebrow = 'Edición táctil',
  system = '',
  slots = [],
  selectedPlayerKey = '',
  selectedPlayerName = '',
  feedback = '',
  busy = false,
  tone = 'caudal',
  onSelectPlayer,
  onSelectTarget,
  onCancelSelection,
}) {
  const positionedSlots = buildMobileReadonlyPitchLayout(slots);
  const selectionActive = Boolean(selectedPlayerKey);

  return (
    <section className="mobile-edit-tactical-surface" aria-label={ariaLabel} data-mobile-editable-pitch="true">
      <header className="mobile-edit-pitch-summary">
        <div>
          <p>{eyebrow}</p>
          <strong>{system || 'Sistema pendiente'}</strong>
        </div>
        {selectionActive ? (
          <button type="button" onClick={onCancelSelection} disabled={busy} className="mobile-edit-cancel">
            Cancelar
          </button>
        ) : null}
      </header>

      <div className={`mobile-edit-selection ${selectionActive ? 'mobile-edit-selection--active' : ''}`} role="status" aria-live="polite">
        {selectionActive ? <><span aria-hidden="true">✓</span> Moviendo a <strong>{selectedPlayerName}</strong>. Toca un destino.</> : 'Toca un jugador y después su destino.'}
      </div>

      <div className={`mobile-edit-pitch mobile-edit-pitch--${tone}`} aria-label={`${ariaLabel}${system ? ` · ${system}` : ''}`}>
        <span className="mobile-edit-pitch-line mobile-edit-pitch-line--outer" />
        <span className="mobile-edit-pitch-line mobile-edit-pitch-line--halfway" />
        <span className="mobile-edit-pitch-line mobile-edit-pitch-line--circle" />
        <span className="mobile-edit-pitch-line mobile-edit-pitch-line--box-top" />
        <span className="mobile-edit-pitch-line mobile-edit-pitch-line--box-bottom" />

        {positionedSlots.map((slot, index) => {
          const playerKey = cleanText(slot.playerKey);
          const hasPlayer = slot.hasPlayer === false ? false : Boolean(playerKey || cleanText(slot.name));
          const isSelected = Boolean(playerKey && playerKey === selectedPlayerKey);
          const isDestination = selectionActive && !isSelected;
          const label = hasPlayer
            ? `${isSelected ? 'Cancelar selección de' : selectionActive ? 'Intercambiar con' : 'Seleccionar'} ${slot.name}`
            : selectionActive
              ? `Mover ${selectedPlayerName} a ${slot.role || `posición ${index + 1}`}`
              : `${slot.role || `Posición ${index + 1}`} vacía`;
          return (
            <button
              key={slot.id || `${slot.role}-${index}`}
              type="button"
              aria-label={label}
              aria-pressed={isSelected}
              disabled={busy || (!hasPlayer && !selectionActive)}
              onClick={() => {
                if (isSelected) onCancelSelection?.();
                else if (selectionActive) onSelectTarget?.(slot, index);
                else if (hasPlayer) onSelectPlayer?.(slot, index);
              }}
              className={`mobile-edit-pitch-slot ${hasPlayer ? 'mobile-edit-pitch-slot--occupied' : 'mobile-edit-pitch-slot--empty'} ${isSelected ? 'mobile-edit-pitch-slot--selected' : ''} ${isDestination ? 'mobile-edit-pitch-slot--destination' : ''}`}
              style={{ left: `${slot.mobileX}%`, top: `${slot.mobileY}%` }}
            >
              <span className="mobile-edit-pitch-role">{compactRole(slot.role)}</span>
              <span className="mobile-edit-pitch-portrait">
                {slot.image ? <img src={slot.image} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} /> : null}
                <span aria-hidden="true">{hasPlayer ? getInitials(slot) : '+'}</span>
                {slot.number ? <b>#{slot.number}</b> : null}
                {isSelected ? <i aria-hidden="true">✓</i> : null}
              </span>
              <span className="mobile-edit-pitch-name">{hasPlayer ? slot.name : selectionActive ? 'Mover aquí' : slot.role}</span>
            </button>
          );
        })}
      </div>

      {feedback ? <p className="mobile-edit-feedback" role="status" aria-live="polite">✓ {feedback}</p> : null}
    </section>
  );
}
