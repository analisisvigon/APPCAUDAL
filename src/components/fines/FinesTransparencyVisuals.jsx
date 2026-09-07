import { formatFinesCurrency } from '../../utils/finesPresentation';

const numberValue = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

export function FinesHorizontalRanking({
  title,
  subtitle,
  rows = [],
  labelKey,
  valueKey,
  formatValue = formatFinesCurrency,
  emptyText = 'Sin datos suficientes.',
  limit = 5,
  tone = 'bg-caudal-electric',
}) {
  const ranked = [...rows]
    .filter((row) => row?.[labelKey] && numberValue(row?.[valueKey]) > 0)
    .sort((left, right) => numberValue(right[valueKey]) - numberValue(left[valueKey]) || String(left[labelKey]).localeCompare(String(right[labelKey]), 'es'))
    .slice(0, limit);
  const maximum = Math.max(0, ...ranked.map((row) => numberValue(row[valueKey])));

  return (
    <section className="min-w-0 rounded-2xl border border-white/[0.07] bg-black/15 p-3.5 sm:p-4">
      <h4 className="text-xs font-black text-white">{title}</h4>
      {subtitle ? <p className="mt-1 text-[10px] leading-4 text-slate-500">{subtitle}</p> : null}
      {!ranked.length ? <p className="mt-4 rounded-xl border border-dashed border-white/[0.08] px-3 py-6 text-center text-xs font-bold text-slate-500">{emptyText}</p> : null}
      {ranked.length ? (
        <ol className="mt-4 space-y-3" aria-label={title}>
          {ranked.map((row, index) => {
            const value = numberValue(row[valueKey]);
            const width = maximum > 0 ? Math.max(4, (value / maximum) * 100) : 0;
            return (
              <li key={`${row[labelKey]}-${index}`}>
                <div className="mb-1 flex items-center justify-between gap-3 text-[11px]">
                  <span className="min-w-0 truncate font-bold text-slate-300"><span className="mr-1.5 text-slate-600">{index + 1}.</span>{row[labelKey]}</span>
                  <span className="shrink-0 font-black tabular-nums text-white">{formatValue(value)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]"><div className={`h-full rounded-full ${tone}`} style={{ width: `${width}%` }} /></div>
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}

export function FinesStatusDistribution({ summary = {} }) {
  const segments = [
    { key: 'unpaid_count', label: 'Pendientes', value: numberValue(summary.unpaid_count), tone: 'bg-amber-300', text: 'text-amber-100' },
    { key: 'partial_count', label: 'Parciales', value: numberValue(summary.partial_count), tone: 'bg-orange-300', text: 'text-orange-100' },
    { key: 'paid_count', label: 'Pagadas', value: numberValue(summary.paid_count), tone: 'bg-emerald-300', text: 'text-emerald-200' },
    { key: 'cancelled_count', label: 'Anuladas', value: numberValue(summary.cancelled_count ?? summary.cancelled_fines), tone: 'bg-slate-500', text: 'text-slate-300' },
  ];
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const overdue = numberValue(summary.overdue_count);

  return (
    <section className="min-w-0 rounded-2xl border border-white/[0.07] bg-black/15 p-3.5 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div><h4 className="text-xs font-black text-white">Distribución por estados</h4><p className="mt-1 text-[10px] leading-4 text-slate-500">Las vencidas forman parte de las multas pendientes o parciales.</p></div>
        {overdue > 0 ? <span className="shrink-0 rounded-full border border-red-300/20 bg-red-400/10 px-2 py-1 text-[9px] font-black uppercase text-red-100">{overdue} vencidas</span> : null}
      </div>
      {total > 0 ? <div className="mt-4 flex h-4 overflow-hidden rounded-full bg-white/[0.06]" role="img" aria-label="Distribución visual de multas por estado">{segments.filter((segment) => segment.value > 0).map((segment) => <div key={segment.key} className={segment.tone} style={{ width: `${(segment.value / total) * 100}%` }} title={`${segment.label}: ${segment.value}`} />)}</div> : <p className="mt-4 rounded-xl border border-dashed border-white/[0.08] px-3 py-6 text-center text-xs font-bold text-slate-500">Todavía no hay estados que representar.</p>}
      <dl className="mt-3 grid grid-cols-2 gap-2">
        {segments.map((segment) => <div key={segment.key} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.035] px-2.5 py-2"><dt className={`text-[9px] font-black uppercase ${segment.text}`}>{segment.label}</dt><dd className="text-xs font-black tabular-nums text-white">{segment.value}</dd></div>)}
      </dl>
    </section>
  );
}
