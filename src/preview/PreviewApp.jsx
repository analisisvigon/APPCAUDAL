import React, { useEffect, useMemo, useState } from 'react';
import CtsCoreApp from '../sports/CtsCoreApp';
import TeamSelector from '../sports/TeamSelector';
import { loadAuthorizedSportsContexts, verifySportsContext } from '../sports/authorizedContext';
import { DEMO_ACTIVE_CTS_ID, DEMO_ARCHIVE_CTS_ID, createDemoClient } from './demoClient';

const client = createDemoClient();
const coreSections = ['Inicio', 'Plantilla', 'Partidos'];
const pendingSections = [
  'PRE', 'POST', 'Dossier', 'Rendimiento', 'Análisis', 'Lito', 'Sesiones',
  'Perfiles', 'Equipos', 'Fisio', 'Multas', 'Registro Delegado', 'Análisis Grupal',
];
const personalSections = ['Biblioteca de Tareas', 'Biblioteca ABP'];
const resources = Object.freeze([
  { id: 'task-01', section: 'Biblioteca de Tareas', name: 'Rondo de orientación · DEMO',
    subtitle: 'Activación · 18 minutos', detail: 'Ejercicio ficticio para visualizar una biblioteca personal reutilizable en cualquier equipo.' },
  { id: 'task-02', section: 'Biblioteca de Tareas', name: 'Salida de balón · DEMO',
    subtitle: 'Tarea táctica · 25 minutos', detail: 'Ficha de demostración. La futura biblioteca personal no dependerá de la temporada seleccionada.' },
  { id: 'abp-01', section: 'Biblioteca ABP', name: 'Córner al primer palo · DEMO',
    subtitle: 'ABP ofensiva', detail: 'Jugada ficticia. La conexión con la biblioteca real requiere permisos personales en backend.' },
  { id: 'abp-02', section: 'Biblioteca ABP', name: 'Defensa de falta lateral · DEMO',
    subtitle: 'ABP defensiva', detail: 'Recurso de muestra visible tanto desde el equipo activo como desde el archivo.' },
]);

function NavGroup({ title, sections, activeSection, onSelect, pending = false }) {
  return <div className="mt-7">
    <p className="px-3 text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">{title}</p>
    <div className="mt-3 grid gap-1">
      {sections.map((name) => <button type="button" key={name} onClick={() => onSelect(name)}
        aria-current={activeSection === name ? 'page' : undefined}
        className={`flex min-h-11 items-center justify-between rounded-xl px-3 text-left text-sm font-semibold transition ${activeSection === name
          ? 'bg-caudal-electric text-slate-950' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}>
        <span>{name}</span>{pending && <span className="text-[10px] font-bold opacity-60">Próximamente</span>}
      </button>)}
    </div>
  </div>;
}

function PersonalLibrary({ section }) {
  const [selectedId, setSelectedId] = useState(null);
  const items = resources.filter((item) => item.section === section);
  const selected = items.find((item) => item.id === selectedId);
  return <div className="mt-7">
    <div className="rounded-2xl border border-caudal-electric/20 bg-caudal-electric/[0.07] p-5">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-caudal-electric">Mis recursos · Espacio personal</p>
      <h2 className="mt-2 text-xl font-black">{section}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-300">Esta biblioteca te acompaña cuando cambias de club o temporada. Los elementos mostrados son ficticios y esta vista no guarda cambios.</p>
    </div>
    <div className="mt-5 grid gap-4 md:grid-cols-2">
      {items.map((item) => <button type="button" key={item.id} onClick={() => setSelectedId(item.id)}
        className={`rounded-2xl border p-5 text-left transition ${selectedId === item.id
          ? 'border-caudal-electric bg-caudal-electric/10' : 'border-white/10 bg-[#0b1930] hover:border-white/30'}`}>
        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-caudal-electric">Recurso personal</span>
        <strong className="mt-3 block text-lg">{item.name}</strong>
        <span className="mt-2 block text-sm text-slate-400">{item.subtitle}</span>
      </button>)}
    </div>
    {selected && <section className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-6">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Vista de recurso · DEMO</p>
      <h3 className="mt-2 text-xl font-bold">{selected.name}</h3>
      <p className="mt-3 text-sm leading-6 text-slate-300">{selected.detail}</p>
    </section>}
  </div>;
}

export default function PreviewApp() {
  const [contexts, setContexts] = useState([]);
  const [contextId, setContextId] = useState(DEMO_ACTIVE_CTS_ID);
  const [section, setSection] = useState('Inicio');
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selectorError, setSelectorError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    void loadAuthorizedSportsContexts(client).then(setContexts);
  }, []);

  const context = useMemo(() => contexts.find((item) => item.id === contextId), [contexts, contextId]);
  const archived = contextId === DEMO_ARCHIVE_CTS_ID;
  const selectContext = async (id) => {
    try {
      const verified = await verifySportsContext(client, id);
      setContextId(verified.id);
      setSection('Inicio');
      setSelectorOpen(false);
      setMenuOpen(false);
      setSelectorError('');
    } catch {
      setSelectorError('El espacio de demostración no está disponible.');
    }
  };
  const navigate = (name) => { setSection(name); setMenuOpen(false); };

  if (selectorOpen) return <>
    <div className="bg-amber-400 px-4 py-2 text-center text-xs font-black uppercase tracking-[0.15em] text-slate-950">Previsualización local · Datos ficticios · Sin conexión a Supabase</div>
    <TeamSelector contexts={contexts} preferredId={DEMO_ACTIVE_CTS_ID} onSelect={selectContext}
      description="Estos dos espacios son ficticios y solo existen en esta previsualización."
      onExit={() => setSelectorOpen(false)} exitLabel="Volver" error={selectorError} />
  </>;

  return <div className="min-h-screen bg-[#02070f] text-slate-100">
    <div className="bg-amber-400 px-4 py-2 text-center text-[11px] font-black uppercase tracking-[0.15em] text-slate-950">Previsualización local · Todos los jugadores y partidos son ficticios · No guarda datos</div>
    <div className="mx-auto flex max-w-[1600px] flex-col lg:min-h-screen lg:flex-row">
      <aside className={`${menuOpen ? 'block' : 'hidden'} border-b border-white/10 bg-[#071326] px-4 pb-6 pt-5 lg:block lg:w-72 lg:shrink-0 lg:border-b-0 lg:border-r lg:px-5`}>
        <img src="/branding/nexo-lockup-dark.png" alt="NEXO CLUB" className="h-16 w-auto" />
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{archived ? 'Archivo de consulta' : 'Equipo activo'}</p>
          <p className="mt-2 text-base font-black">{context?.teamName || 'Cargando demo…'}</p>
          <p className="mt-1 text-xs text-slate-400">{context?.clubName} · {context?.seasonLabel}</p>
          <button type="button" onClick={() => setSelectorOpen(true)} className="mt-4 w-full rounded-xl border border-white/20 px-3 py-2 text-sm font-bold hover:bg-white/10">Cambiar espacio</button>
        </div>
        <NavGroup title="Equipo y temporada" sections={coreSections} activeSection={section} onSelect={navigate} />
        <NavGroup title="Mis recursos permanentes" sections={personalSections} activeSection={section} onSelect={navigate} />
        <NavGroup title="Módulos pendientes" sections={pendingSections} activeSection={section} onSelect={navigate} pending />
      </aside>

      <div className="min-w-0 flex-1">
        <header className="border-b border-white/10 bg-[#061122]/90 px-4 py-5 sm:px-7">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button type="button" aria-label="Abrir menú" onClick={() => setMenuOpen((value) => !value)} className="rounded-xl border border-white/20 px-3 py-2 lg:hidden">☰</button>
              <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-caudal-electric">{archived ? 'Club anterior · Solo consulta en esta demo' : 'Espacio de trabajo activo'}</p>
                <h1 className="mt-1 text-xl font-black sm:text-2xl">{section}</h1></div>
            </div>
            <div className="flex flex-wrap gap-2">
              {archived ? <button type="button" onClick={() => void selectContext(DEMO_ACTIVE_CTS_ID)} className="rounded-xl bg-caudal-electric px-4 py-2 text-sm font-black text-slate-950">Volver a Libia</button>
                : <button type="button" onClick={() => void selectContext(DEMO_ARCHIVE_CTS_ID)} className="rounded-xl border border-white/20 px-4 py-2 text-sm font-bold hover:bg-white/10">Ver histórico Caudal</button>}
            </div>
          </div>
          <p className="mt-3 text-sm text-slate-400">{context?.teamName || 'Equipo de demostración'} · {context?.seasonLabel || 'Temporada demo'} {archived ? '· Archivo' : '· Activo'}</p>
        </header>

        <div className="mx-auto max-w-6xl px-4 pb-12 pt-6 sm:px-7">
          {archived && <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">Estás viendo un archivo simulado. Aquí solo hay navegación de consulta; la protección real del histórico en backend sigue pendiente.</div>}
          {coreSections.includes(section) && <CtsCoreApp key={contextId} client={client} contextId={contextId}
            embedded activeTab={section} onTabChange={navigate} />}
          {personalSections.includes(section) && <PersonalLibrary section={section} />}
          {pendingSections.includes(section) && <section className="mt-7 rounded-3xl border border-white/10 bg-[#0b1930] p-7 sm:p-10">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Pendiente de adaptar al CTS</p>
            <h2 className="mt-3 text-2xl font-black">{section}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Esta sección formará parte de la aplicación del equipo activo. En la previsualización permanece cerrada porque sus consultas y guardados reales todavía necesitan autorización por equipo y temporada en backend.</p>
          </section>}
        </div>
      </div>
    </div>
  </div>;
}
