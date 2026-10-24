import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { STAFF_NAV_GROUPS } from './appNavigation.js';

const paths = {
  home: <><path d="m3 10 9-7 9 7v10H3z" /><path d="M9 20v-7h6v7" /></>,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 6a3 3 0 0 1 0 6m1 3a5 5 0 0 1 3 5" /></>,
  profile: <><circle cx="12" cy="8" r="3" /><path d="M5 21v-2a7 7 0 0 1 14 0v2M4 3h16" /></>,
  shield: <><path d="M12 2 3 6v6c0 5 3.5 8.5 9 10 5.5-1.5 9-5 9-10V6z" /><path d="m8 12 3 3 5-6" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 10h18m-13 4h3" /></>,
  training: <><path d="M4 18h16M6 14l3-3 3 2 4-6 3 2" /><circle cx="6" cy="14" r="1" /><circle cx="19" cy="9" r="1" /></>,
  tasks: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="m7 9 1.5 1.5L11 8m2 1h4m-10 7 1.5 1.5L11 15m2 1h4" /></>,
  library: <><path d="M4 4h5v16H4zm5 0h5v16H9zm7 1 4-1 2 16-4 1z" /></>,
  ball: <><circle cx="12" cy="12" r="9" /><path d="m12 8 4 3-1.5 4h-5L8 11zm0 0-2-5m6 8 5-1m-6 5 3 5m-9-5-3 5m2-9-5-1" /></>,
  chart: <><path d="M3 20h18M5 17v-5h3v5m3 0V7h3v10m3 0v-8h3v8" /></>,
  group: <><circle cx="8" cy="8" r="2.5" /><circle cx="16" cy="8" r="2.5" /><path d="M2 20v-2a6 6 0 0 1 12 0v2m-1-7a6 6 0 0 1 9 5v2h-5" /></>,
  clipboard: <><rect x="5" y="4" width="14" height="18" rx="2" /><path d="M9 4V2h6v2m-6 7h6m-6 4h6m-6 4h4" /></>,
  medical: <><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" /></>,
  receipt: <><path d="M5 2h14v20l-3-2-4 2-4-2-3 2zM8 8h8m-8 4h8m-8 4h5" /></>,
  assistant: <><path d="M4 4h16v13H9l-5 4zM8 9h8m-8 4h5" /></>,
  logout: <><path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" /><path d="M14 16l4-4-4-4m4 4H9" /></>,
};

function NavIcon({ name }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0">
    {paths[name]}
  </svg>;
}

function SidebarBody({ collapsed, mobile = false, activeTab, onSelect, onToggle, onClose, onOpenLito, onSignOut, userEmail, onTooltip, closeRef, club }) {
  return <>
    <div className={`flex items-center ${collapsed ? 'flex-col justify-center' : 'justify-between'} gap-2 border-b border-white/10 px-3 py-4`}>
      <div className={`flex min-w-0 items-center ${collapsed ? 'justify-center' : 'gap-2'}`}>
        <img src="/branding/nexo-symbol-dark.png" alt="" className="h-9 w-9 shrink-0 object-contain" />
        {!collapsed ? <span className="truncate text-xs font-black uppercase tracking-[0.16em] text-white">NEXO CLUB</span> : null}
      </div>
      {mobile ? <button ref={closeRef} type="button" onClick={onClose} aria-label="Cerrar menú" className="rounded-xl border border-white/10 p-2 text-slate-200 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric">✕</button>
        : <button type="button" onClick={onToggle} aria-label={collapsed ? 'Desplegar menú' : 'Plegar menú'} title={collapsed ? 'Desplegar menú' : 'Plegar menú'} aria-expanded={!collapsed}
          className="rounded-xl border border-white/10 p-2 text-slate-200 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric">{collapsed ? '›' : '‹'}</button>}
    </div>
    <div className={`flex items-center border-b border-white/10 px-3 py-4 ${collapsed ? 'justify-center' : 'gap-3'}`}>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-1.5">
        <img src={club.crest} alt={`Escudo de ${club.name}`} className="h-full w-full object-contain" />
      </span>
      {!collapsed ? <div className="min-w-0"><p className="truncate text-sm font-black text-white">{club.name}</p>
        <p className="truncate text-[11px] font-bold text-caudal-electric">{club.category}</p>
        <p className="mt-0.5 truncate text-[11px] text-slate-400">{club.location}</p></div> : null}
    </div>
    <nav aria-label={mobile ? 'Menú de módulos' : 'Menú lateral de módulos'} onScroll={() => onTooltip?.(null)} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-2 py-4">
      {STAFF_NAV_GROUPS.map((group) => <div key={group.title}>
        {!collapsed ? <h2 className="mb-1 px-3 text-[10px] font-black uppercase tracking-[0.19em] text-slate-500">{group.title}</h2> : <div className="mx-auto mb-2 h-px w-6 bg-white/10" aria-hidden="true" />}
        <div className="space-y-0.5">{group.items.map((item) => <button key={item.name} type="button" onClick={() => onSelect(item.name)}
          aria-current={activeTab === item.name ? 'page' : undefined} aria-label={collapsed ? item.name : undefined}
          onMouseEnter={collapsed ? (event) => onTooltip?.({ name: item.name, top: event.currentTarget.getBoundingClientRect().top }) : undefined}
          onMouseLeave={collapsed ? (event) => { if (document.activeElement !== event.currentTarget) onTooltip?.(null); } : undefined}
          onFocus={collapsed ? (event) => onTooltip?.({ name: item.name, top: event.currentTarget.getBoundingClientRect().top }) : undefined}
          onBlur={collapsed ? () => onTooltip?.(null) : undefined}
          className={`group flex min-h-11 w-full items-center rounded-xl text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric ${collapsed ? 'justify-center px-2' : 'gap-3 px-3'} ${activeTab === item.name ? 'bg-caudal-electric text-slate-950 shadow-[0_8px_22px_rgba(79,140,255,0.18)]' : 'text-slate-300 hover:bg-white/[0.08] hover:text-white'}`}>
          <NavIcon name={item.icon} />{!collapsed ? <span className="truncate text-sm font-semibold">{item.name}</span> : null}
        </button>)}</div>
      </div>)}
    </nav>
    <div className="shrink-0 border-t border-white/10 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
      {onOpenLito ? <button type="button" onClick={onOpenLito} aria-label={collapsed ? 'Abrir Lito' : undefined} title={collapsed ? 'Abrir Lito' : undefined}
        className={`mb-1 flex min-h-11 w-full items-center rounded-xl text-slate-300 hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric xl:hidden ${collapsed ? 'justify-center' : 'gap-3 px-3'}`}>
        <NavIcon name="assistant" />{!collapsed ? <span className="text-sm font-semibold">Lito</span> : null}
      </button> : null}
      {!collapsed ? <div className="min-w-0 px-3 pb-2">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Sesión iniciada</p>
        <p className="truncate text-xs font-semibold text-slate-200" title={userEmail}>{userEmail}</p>
      </div> : null}
      <button type="button" onClick={onSignOut} aria-label="Cerrar sesión" title={collapsed ? 'Cerrar sesión' : undefined}
        onMouseEnter={collapsed ? (event) => onTooltip?.({ name: 'Cerrar sesión', top: event.currentTarget.getBoundingClientRect().top }) : undefined}
        onMouseLeave={collapsed ? () => onTooltip?.(null) : undefined}
        onFocus={collapsed ? (event) => onTooltip?.({ name: 'Cerrar sesión', top: event.currentTarget.getBoundingClientRect().top }) : undefined}
        onBlur={collapsed ? () => onTooltip?.(null) : undefined}
        className={`flex min-h-11 w-full items-center rounded-xl text-red-100 transition hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric ${collapsed ? 'justify-center' : 'gap-3 px-3'}`}>
        <NavIcon name="logout" />{!collapsed ? <span className="text-sm font-semibold">Cerrar sesión</span> : null}
      </button>
    </div>
  </>;
}

export default function AppSidebar({ collapsed, mobileOpen, activeTab, onSelect, onToggle, onClose, onOpenLito, onSignOut, userEmail, club }) {
  const mobilePanelRef = useRef(null);
  const closeButtonRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const [tooltip, setTooltip] = useState(null);
  onCloseRef.current = onClose;
  useEffect(() => setTooltip(null), [collapsed]);
  useEffect(() => {
    if (!mobileOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    const desktopViewport = window.matchMedia('(min-width: 768px)');
    const closeOnDesktop = () => { if (desktopViewport.matches) onCloseRef.current(); };
    desktopViewport.addEventListener('change', closeOnDesktop);
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== 'Tab') return;
      const buttons = [...(mobilePanelRef.current?.querySelectorAll('button:not([disabled])') || [])];
      if (!buttons.length) return;
      if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0].focus(); }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', handleKeyDown); desktopViewport.removeEventListener('change', closeOnDesktop); previousFocus?.focus?.(); };
  }, [mobileOpen]);

  return <>
    <aside className={`app-staff-sidebar fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-white/10 bg-[#071225] shadow-[18px_0_50px_rgba(0,0,0,0.18)] transition-[width] duration-200 md:flex ${collapsed ? 'w-[76px]' : 'w-[256px]'}`}>
      <SidebarBody collapsed={collapsed} activeTab={activeTab} onSelect={onSelect} onToggle={onToggle} onOpenLito={onOpenLito} onSignOut={onSignOut} userEmail={userEmail} onTooltip={setTooltip} club={club} />
    </aside>
    {mobileOpen ? <div className="fixed inset-0 z-[80] md:hidden">
      <button type="button" aria-label="Cerrar menú al pulsar fuera" onClick={onClose} className="absolute inset-0 h-full w-full bg-black/70 backdrop-blur-sm" />
      <aside ref={mobilePanelRef} role="dialog" aria-modal="true" aria-label="Menú de NEXO CLUB" className="relative flex h-full w-[min(85vw,320px)] flex-col border-r border-white/10 bg-[#071225] shadow-2xl">
        <SidebarBody mobile activeTab={activeTab} onSelect={onSelect} onClose={onClose} onOpenLito={onOpenLito} onSignOut={onSignOut} userEmail={userEmail} closeRef={closeButtonRef} club={club} />
      </aside>
    </div> : null}
    {collapsed && tooltip && createPortal(<span role="tooltip" className="pointer-events-none fixed z-[60] rounded-lg border border-white/15 bg-[#10223c] px-3 py-2 text-xs font-semibold text-white shadow-xl"
      style={{ top: tooltip.top, left: 82 }}>{tooltip.name}</span>, document.body)}
  </>;
}
