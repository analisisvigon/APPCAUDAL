const safeArray = (value) => Array.isArray(value) ? value : [];

function EmptyEvidence() {
  return (
    <div className="border border-dashed border-white/12 bg-black/10 p-5 text-sm font-semibold text-slate-400">
      Sin información suficiente. Guarda jugadas con pases, movimientos o descripciones verificables para generar evidencias.
    </div>
  );
}

function Ranking({ rows, empty, renderMeta }) {
  if (!safeArray(rows).length) return <p className="text-xs font-semibold text-slate-500">{empty}</p>;
  return (
    <div className="space-y-2">
      {rows.slice(0, 8).map((row, index) => (
        <div key={row.key || row.id || row.label} className="flex items-center justify-between gap-3 border-b border-white/8 pb-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-slate-100">{index + 1}. {row.label || row.name}</p>
            {renderMeta?.(row) ? <p className="mt-0.5 text-[10px] font-bold text-slate-500">{renderMeta(row)}</p> : null}
          </div>
          <span className="shrink-0 border border-caudal-electric/20 bg-caudal-electric/10 px-2 py-1 text-xs font-black text-caudal-electric">
            {row.count ?? row.playCount}
          </span>
        </div>
      ))}
    </div>
  );
}

function EvidenceCard({ title, children }) {
  return (
    <section className="border border-white/10 bg-[#091428]/82 p-4">
      <p className="mb-4 text-[10px] font-black uppercase tracking-[0.18em] text-caudal-electric">{title}</p>
      {children}
    </section>
  );
}

export default function TacticalEvidencePanel({ report }) {
  const playCount = Number(report?.playCount || 0);
  if (!playCount) return (
    <section className="border border-caudal-electric/15 bg-[#091428]/90 p-5 xl:col-span-2">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-caudal-electric">Motor de evidencias tácticas</p>
      <h3 className="mt-1 text-xl font-black text-white">Evidencias</h3>
      <div className="mt-4"><EmptyEvidence /></div>
    </section>
  );

  return (
    <div className="grid gap-4 xl:col-span-2 md:grid-cols-2 xl:grid-cols-3">
      <section className="border border-caudal-electric/20 bg-[#091428]/95 p-5 md:col-span-2 xl:col-span-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-caudal-electric">Motor de evidencias tácticas</p>
            <h3 className="mt-1 text-xl font-black text-white">Evidencias generadas desde jugadas reales</h3>
          </div>
          <div className="flex gap-2 text-[10px] font-black uppercase text-slate-300">
            <span className="border border-white/10 bg-white/[0.04] px-2 py-1">{playCount} jugadas</span>
            <span className="border border-white/10 bg-white/[0.04] px-2 py-1">{safeArray(report.sources).length} fuentes</span>
          </div>
        </div>
      </section>

      <EvidenceCard title="Patrones detectados">
        <Ranking rows={report.patterns} empty="Sin patrones repetidos." renderMeta={(row) => row.phase} />
      </EvidenceCard>

      <EvidenceCard title="Conexiones frecuentes">
        <Ranking rows={report.connections} empty="Sin pases o conexiones explícitas identificables." renderMeta={(row) => `${row.playIds.length} jugada${row.playIds.length === 1 ? '' : 's'}`} />
      </EvidenceCard>

      <EvidenceCard title="Jugadores más implicados">
        <Ranking rows={report.players} empty="Sin participantes identificables." renderMeta={(row) => `${row.connectionsCreated} creadas · ${row.connectionsReceived} recibidas`} />
      </EvidenceCard>

      <EvidenceCard title="Bandas utilizadas">
        <div className="space-y-3">
          {safeArray(report.zones?.broad).map((row) => (
            <div key={row.key}>
              <div className="flex justify-between gap-3 text-xs font-black text-slate-200">
                <span>{row.label}</span>
                <span>{row.percentage} %</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden bg-white/[0.06]">
                <div className="h-full bg-caudal-electric" style={{ width: `${row.percentage}%` }} />
              </div>
              <p className="mt-1 text-[10px] font-semibold text-slate-500">{row.count} acciones registradas</p>
            </div>
          ))}
        </div>
      </EvidenceCard>

      <EvidenceCard title="Movimientos repetidos">
        <Ranking rows={report.movements} empty="Sin movimientos clasificables." renderMeta={(row) => row.source === 'description' ? 'Descripción registrada' : 'Geometría de la jugada'} />
      </EvidenceCard>

      <EvidenceCard title="Riesgos detectados">
        {safeArray(report.risks).length ? (
          <div className="space-y-3">
            {report.risks.map((risk) => (
              <div key={risk.id} className="border border-amber-300/15 bg-amber-300/[0.055] p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-black leading-5 text-amber-50">{risk.conclusion}</p>
                  <span className="shrink-0 text-[9px] font-black uppercase text-amber-200">{risk.confidence}</span>
                </div>
                <p className="mt-2 text-xs font-semibold text-slate-300">{risk.evidence.join(' · ')}</p>
              </div>
            ))}
          </div>
        ) : <p className="text-xs font-semibold text-slate-500">La muestra actual no alcanza los umbrales para señalar riesgos.</p>}
      </EvidenceCard>
    </div>
  );
}
