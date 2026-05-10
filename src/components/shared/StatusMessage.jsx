export default function StatusMessage({ status, className = '' }) {
  if (!status) return null;

  const normalized = String(status).toLowerCase();
  const tone = normalized.includes('error') || normalized.includes('no se pudo')
    ? 'border-red-500/20 bg-red-500/10 text-red-100'
    : normalized.includes('guardado') || normalized.includes('✓')
      ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100'
      : 'border-white/10 bg-white/5 text-slate-300';

  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${tone} ${className}`}>
      {status}
    </div>
  );
}
