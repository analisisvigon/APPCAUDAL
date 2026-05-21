const splitLines = (value, limit = 6) =>
  String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, limit);

const formatDate = (value) => {
  if (!value) return 'Fecha pendiente';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
};

const pageLabels = {
  pressure: 'Plan de presion',
  vigilances: 'Vigilancias',
  transitions: 'Transiciones',
  talk: 'Charla rapida',
  halftime: 'Descanso',
  rival: 'Resumen rival',
  staff: 'Notas de staff',
};

const sheetProfiles = {
  Vestuario: { label: 'Vestuario', density: 'large' },
  Banquillo: { label: 'Banquillo', density: 'compact' },
  Staff: { label: 'Staff', density: 'dense' },
  Charla: { label: 'Charla', density: 'large' },
  'Resumen rival': { label: 'Resumen rival', density: 'dense' },
};

export default function DossierTacticalSheet({ match, pageId, dossierType = 'Staff', keys = [], staffNotes = [] }) {
  const profile = sheetProfiles[dossierType] || sheetProfiles.Staff;
  const title = pageLabels[pageId] || 'Hoja tactica';
  const rival = match?.opponent || 'Rival';

  const pageContent = {
    pressure: [
      { title: 'Saltos', items: splitLines(match?.prePlanTrigger || match?.planSinBalon || 'Saltar cuando el rival juegue hacia fuera.\nCerrar pase interior.\nVigilar segunda jugada.', 5) },
      { title: 'Altura', items: splitLines(match?.preRivalDefensiveBlock || match?.preRivalPressure || 'Ajustar altura segun salida rival.\nNo partir al equipo.', 4) },
      { title: 'Recordatorios', items: staffNotes.slice(0, 5) },
    ],
    vigilances: [
      { title: 'Emparejamientos', items: splitLines(match?.preKeyMatchupsTable || match?.prePlanAvoid || 'Vigilar jugador diferencial.\nCerrar pase interior.\nControlar segunda jugada.', 6) },
      { title: 'Riesgos', items: splitLines(match?.preRivalStrengths || match?.preRivalTransitions || match?.prePlanAvoid, 5) },
      { title: 'Notas staff', items: staffNotes.slice(0, 5) },
    ],
    transitions: [
      { title: 'Tras perdida', items: splitLines(match?.planTransiciones || match?.prePlanAvoid || 'Primer pase hacia fuera.\nCerrar dentro.\nFalta tactica si el equipo queda abierto.', 5) },
      { title: 'Tras robo', items: splitLines(match?.planConBalon || match?.prePlanTrigger || 'Primer pase vertical si hay ventaja.\nActivar lado debil.', 5) },
      { title: 'Banquillo', items: ['Mirar cansancio de extremos', 'Preparar cambio si el equipo se parte', 'Recordar vigilancia tras ABP'] },
    ],
    talk: [
      { title: 'Claves del partido', items: keys.slice(0, 3) },
      { title: 'Mensajes cortos', items: splitLines(match?.planObjetivo || match?.planClave || 'Competir segunda jugada.\nAtacar con paciencia.\nNo regalar transiciones.', 4) },
      { title: 'Ultima frase', items: ['Salir juntos', 'Primer duelo fuerte', 'Comunicar cada ajuste'] },
    ],
    halftime: [
      { title: 'Que funciona', items: ['', '', '', ''] },
      { title: 'Que corregir', items: ['', '', '', ''] },
      { title: 'Ajuste ofensivo', items: ['', '', ''] },
      { title: 'Ajuste defensivo', items: ['', '', ''] },
      { title: 'Cambios previstos', items: ['', '', ''] },
    ],
    rival: [
      { title: 'Estructura rival', items: [`Sistema: ${match?.preRivalSystem || 'Pendiente'}`, `Bloque: ${match?.preRivalDefensiveBlock || 'Pendiente'}`, `Presion: ${match?.preRivalPressure || 'Pendiente'}`] },
      { title: 'Amenazas', items: splitLines(match?.preRivalStrengths || match?.preRivalTransitions || 'Pendiente de completar scouting rival.', 5) },
      { title: 'Donde atacar', items: splitLines(match?.preRivalWeaknesses || match?.prePlanAdjustment || 'Buscar debilidad detectada en PRE.', 5) },
    ],
    staff: [
      { title: 'Vigilancias', items: staffNotes.slice(0, 6) },
      { title: 'Cambios previstos', items: splitLines(match?.postIndividualObservations || 'Min 60: revisar energia de banda.\nPreparar ajuste si el rival cambia sistema.', 4) },
      { title: 'Riesgos', items: splitLines(match?.prePlanAvoid || match?.preRivalStrengths, 5) },
    ],
  }[pageId] || [];

  return (
    <article className={`lineup-print-sheet print-sheet-a4 operational-print-sheet dossier-${profile.density}`}>
      <header className="operational-print-header">
        <div>
          <p className="print-sheet-kicker">DOSSIER · {profile.label}</p>
          <h1>{title}</h1>
        </div>
        <div className="print-sheet-meta">
          <p><strong>Partido:</strong> C.D. Caudal - {rival}</p>
          <p><strong>Fecha:</strong> {formatDate(match?.date)}</p>
          <p><strong>Sistema:</strong> {match?.preCaudalSystem || match?.statsSystem || 'Pendiente'}</p>
          <p><strong>Rival:</strong> {match?.preRivalSystem || 'Pendiente'}</p>
        </div>
      </header>

      <section className="operational-key-strip">
        {(keys.length ? keys : ['Clave pendiente', 'Ajuste pendiente', 'Riesgo pendiente']).slice(0, 3).map((key, index) => (
          <div key={`${key}-${index}`}>
            <span>{index + 1}</span>
            <p>{key}</p>
          </div>
        ))}
      </section>

      <section className={`operational-grid operational-grid-${pageId}`}>
        {pageContent.map((block) => (
          <div key={block.title} className="operational-box">
            <h2>{block.title}</h2>
            <ul>
              {(block.items.length ? block.items : ['', '', '']).map((item, index) => (
                <li key={`${block.title}-${index}`} className={!item ? 'blank-line' : ''}>{item || ' '}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </article>
  );
}
