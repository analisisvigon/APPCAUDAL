const safe = (value) => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ').replace(/[^a-zA-Z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '').slice(0, 70) || 'Sin_nombre';

export function seasonMemoryDownloadName(model) {
  const team = safe(model.context.displayName || model.context.teamName);
  const season = safe(String(model.context.seasonLabel || '').replace(/[/-]/g, '-'));
  const scope = model.selection === 'season' ? 'Memoria_Temporada'
    : `Informe_${safe(model.competitions[0]?.name || 'Competicion')}`;
  return `NEXO_CLUB_${team}_${season}_${scope}.pdf`;
}
