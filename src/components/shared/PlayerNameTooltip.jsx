import React, { cloneElement, isValidElement, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getPlayerTooltipText } from '../../utils/playerDisplayName';

const INTERACTIVE_ELEMENTS = new Set(['a', 'button', 'input', 'select', 'textarea', 'summary']);
const HOVER_DELAY_MS = 320;
const VIEWPORT_MARGIN = 12;
const OPEN_TOOLTIP_EVENT = 'appcaudal:open-player-name-tooltip';

const mergeHandler = (originalHandler, tooltipHandler) => (event) => {
  originalHandler?.(event);
  tooltipHandler(event);
};

export default function PlayerNameTooltip({ player, children, hoverDelay = HOVER_DELAY_MS }) {
  const text = getPlayerTooltipText(player);
  const tooltipId = useId();
  const timerRef = useRef(null);
  const [position, setPosition] = useState(null);

  const clearTimer = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const hideTooltip = () => {
    clearTimer();
    setPosition(null);
  };

  const showTooltip = (event, delay) => {
    if (!text || typeof window === 'undefined') return;
    clearTimer();
    const target = event.currentTarget;
    timerRef.current = window.setTimeout(() => {
      if (!target?.isConnected) return;
      const rect = target.getBoundingClientRect();
      const estimatedWidth = Math.min(320, Math.max(88, text.length * 7.4 + 28));
      const halfWidth = estimatedWidth / 2;
      const left = Math.min(
        window.innerWidth - halfWidth - VIEWPORT_MARGIN,
        Math.max(halfWidth + VIEWPORT_MARGIN, rect.left + rect.width / 2)
      );
      const opensBelow = rect.top < 56;
      window.dispatchEvent(new CustomEvent(OPEN_TOOLTIP_EVENT, { detail: tooltipId }));
      setPosition({
        left,
        top: opensBelow ? rect.bottom + 8 : rect.top - 8,
        opensBelow,
      });
    }, delay);
  };

  useEffect(() => () => clearTimer(), []);

  useEffect(() => {
    const closeOtherTooltip = (event) => {
      if (event.detail !== tooltipId) hideTooltip();
    };
    window.addEventListener(OPEN_TOOLTIP_EVENT, closeOtherTooltip);
    return () => window.removeEventListener(OPEN_TOOLTIP_EVENT, closeOtherTooltip);
  }, [tooltipId]);

  useEffect(() => {
    if (!position) return undefined;
    const close = () => hideTooltip();
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [position]);

  if (!text || !isValidElement(children)) return children;

  const naturallyFocusable = typeof children.type === 'string' && INTERACTIVE_ELEMENTS.has(children.type);
  const describedBy = [children.props['aria-describedby'], tooltipId].filter(Boolean).join(' ');
  const trigger = cloneElement(children, {
    title: undefined,
    tabIndex: children.props.tabIndex ?? (naturallyFocusable ? undefined : 0),
    'aria-describedby': describedBy,
    'data-player-name-tooltip': text,
    onMouseEnter: mergeHandler(children.props.onMouseEnter, (event) => showTooltip(event, hoverDelay)),
    onMouseLeave: mergeHandler(children.props.onMouseLeave, hideTooltip),
    onFocus: mergeHandler(children.props.onFocus, (event) => showTooltip(event, 0)),
    onBlur: mergeHandler(children.props.onBlur, hideTooltip),
    onPointerDown: mergeHandler(children.props.onPointerDown, hideTooltip),
    onDragStart: mergeHandler(children.props.onDragStart, hideTooltip),
  });

  return (
    <>
      {trigger}
      {position && typeof document !== 'undefined' ? createPortal(
        <div
          id={tooltipId}
          role="tooltip"
          className="pointer-events-none fixed z-[10000] max-w-[min(20rem,calc(100vw-1.5rem))] whitespace-nowrap rounded-lg border border-white/10 bg-[#07111f]/[0.98] px-2.5 py-1.5 text-xs font-bold text-white shadow-[0_12px_38px_rgba(0,0,0,0.46)]"
          style={{
            left: position.left,
            top: position.top,
            transform: position.opensBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
          }}
        >
          {text}
        </div>,
        document.body
      ) : null}
    </>
  );
}
