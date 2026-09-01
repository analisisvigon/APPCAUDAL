export default function PlayerAnalysisZoneMap({ zones = [], compact = false, emptyLabel = 'Sin zonas registradas' }) {
  const safeZones = Array.isArray(zones) ? zones : [];
  const hasData = safeZones.some((zone) => Number(zone?.count) > 0);
  return (
    <div className={`relative w-full overflow-hidden rounded-[1.15rem] border border-emerald-100/15 bg-[linear-gradient(180deg,#0b5a42,#064432_48%,#073a30)] ${compact ? 'aspect-[3/2]' : 'aspect-[68/92]'}`}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-[3%] rounded border border-white/45">
        <span className="absolute left-0 right-0 top-1/2 border-t border-white/35" />
        {!compact ? <span className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/35" /> : null}
      </div>
      <span className="absolute right-3 top-2 z-10 text-[7px] font-black uppercase tracking-[0.1em] text-white/65">Ataque ↑</span>
      <div className="absolute inset-[3%] grid grid-cols-3 grid-rows-3">
        {safeZones.map((zone) => (
          <div key={zone.value} className={`flex min-w-0 flex-col items-center justify-center border border-white/[0.07] px-0.5 text-center ${zone.count > 0 ? 'bg-caudal-electric/25' : ''}`}>
            {zone.count > 0 ? (
              <>
                <span className="whitespace-pre-line text-[7px] font-black uppercase leading-[1.05] text-white/85 min-[390px]:text-[8px]">{zone.label}</span>
                <strong className="mt-1 text-base font-black text-white">{zone.count}</strong>
              </>
            ) : null}
          </div>
        ))}
      </div>
      {!hasData ? <p className="absolute left-1/2 top-1/2 z-20 w-3/4 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-white/15 bg-slate-950/70 px-3 py-2 text-center text-[10px] font-bold text-white/75">{emptyLabel}</p> : null}
    </div>
  );
}
