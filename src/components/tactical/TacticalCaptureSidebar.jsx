import React from 'react';
import { getTacticalCaptureVisualIdentity } from '../../utils/tacticalCapturePresentation';

export default function TacticalCaptureSidebar({
  phase = '',
  transitionType = '',
  presentation = {},
}) {
  const identity = getTacticalCaptureVisualIdentity({ phase, transitionType });

  return (
    <aside
      className="tactical-capture-sidebar"
      data-capture-phase={identity.key}
      aria-label={identity.accessibleLabel}
    >
      <section className="tactical-capture-phase-block">
        <p className="tactical-capture-eyebrow">FASE DEL JUEGO</p>
        <h2 className="tactical-capture-phase">{identity.macroLabel}</h2>
        {identity.directionLabel ? (
          <p className="tactical-capture-direction" aria-label={identity.accessibleLabel}>
            {identity.directionLabel}
          </p>
        ) : null}
        {presentation.situation ? (
          <p className="tactical-capture-situation">{presentation.situation}</p>
        ) : null}
        {presentation.playStyle ? (
          <p className="tactical-capture-play-style">{presentation.playStyle}</p>
        ) : null}
      </section>
      {presentation.description ? (
        <section className="tactical-capture-description-block">
          <div className="tactical-capture-divider" />
          <p className="tactical-capture-description-title">Descripción</p>
          <p className="tactical-capture-description">{presentation.description}</p>
        </section>
      ) : null}
    </aside>
  );
}
