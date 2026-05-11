export default function StatusMessage({ status, className = '' }) {
  if (!status) return null;

  const normalized = String(status).toLowerCase();
  const tone = normalized.includes('error') || normalized.includes('no se pudo')
    ? 'status-error'
    : normalized.includes('guardado') || normalized.includes('✓')
      ? 'status-success'
      : 'status-info';

  return (
    <div className={`status-message ${tone} ${className}`}>
      {status}
    </div>
  );
}
