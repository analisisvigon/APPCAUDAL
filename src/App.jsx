import { useMemo, useState } from 'react';

const clubCrest =
  'https://tmssl.akamaized.net//images/wappen/head/13226.png?lm=1747769013';

const transfermarktPlayerImage =
  'https://img.a.transfermarkt.technology/portrait/medium/default.jpg?lm=1';

const samplePlayers = [
  { id: 1, name: 'Pablo D\u00edez', dob: '2002-02-13', number: 0, position: 'Portero', foot: 'Ambas', image: transfermarktPlayerImage },
  { id: 2, name: 'Roberto Jara', dob: '1998-09-10', number: 1, position: 'Portero', foot: 'Derecha', image: transfermarktPlayerImage },
  { id: 3, name: 'Javi Moral', dob: '2005-03-19', number: 13, position: 'Portero', foot: 'No indicada', image: transfermarktPlayerImage },
  { id: 4, name: 'Roberto Albuquerque', dob: '1993-11-04', number: 4, position: 'Defensa central', foot: 'No indicada', image: transfermarktPlayerImage },
  { id: 5, name: 'Agust\u00edn Porto', dob: '1995-03-20', number: 20, position: 'Defensa central', foot: 'No indicada', image: transfermarktPlayerImage },
  { id: 6, name: 'Mario S\u00e1nchez', dob: '2004-09-14', number: 5, position: 'Defensa central', foot: 'No indicada', image: transfermarktPlayerImage },
  { id: 7, name: 'Borja Rodr\u00edguez', dob: '1998-10-21', number: 19, position: 'Lateral izquierdo', foot: 'No indicada', image: transfermarktPlayerImage },
  { id: 8, name: 'Marcos Trabanco', dob: '2001-02-27', number: 2, position: 'Lateral derecho', foot: 'No indicada', image: transfermarktPlayerImage },
  { id: 9, name: 'Sergio Ord\u00f3\u00f1ez', dob: '2001-01-01', number: 21, position: 'Lateral derecho', foot: 'No indicada', image: transfermarktPlayerImage },
  { id: 10, name: 'Santi Cabrera', dob: '2005-01-01', number: 17, position: 'Lateral derecho', foot: 'No indicada', image: transfermarktPlayerImage },
  { id: 11, name: 'Vicente Antu\u00f1a', dob: '2005-01-01', number: 6, position: 'Mediocentro', foot: 'No indicada', image: transfermarktPlayerImage },
  { id: 12, name: 'Kike Fanjul', dob: '1993-12-24', number: 8, position: 'Mediocentro', foot: 'No indicada', image: transfermarktPlayerImage },
  { id: 13, name: 'Michael Oladipupo', dob: '2004-03-06', number: 24, position: 'Mediocentro', foot: 'No indicada', image: transfermarktPlayerImage },
  { id: 14, name: 'Iv\u00e1n Elena', dob: '1999-04-27', number: 22, position: 'Mediocentro ofensivo', foot: 'No indicada', image: transfermarktPlayerImage },
  { id: 15, name: 'Julio Delgado', dob: '1996-01-28', number: 18, position: 'Extremo izquierdo', foot: 'No indicada', image: transfermarktPlayerImage },
  { id: 16, name: 'Diego Boza', dob: '2002-08-23', number: 7, position: 'Extremo izquierdo', foot: 'No indicada', image: transfermarktPlayerImage },
  { id: 17, name: 'Nacho Velardi', dob: '1995-01-26', number: 10, position: 'Extremo derecho', foot: 'No indicada', image: transfermarktPlayerImage },
  { id: 18, name: 'Diego Montequ\u00edn', dob: '2002-01-01', number: 11, position: 'Extremo derecho', foot: 'No indicada', image: transfermarktPlayerImage },
  { id: 19, name: 'Claudio Medina', dob: '1993-09-04', number: 9, position: 'Delantero centro', foot: 'No indicada', image: transfermarktPlayerImage },
  { id: 20, name: 'Jairo C\u00e1rcaba', dob: '1992-05-27', number: 14, position: 'Delantero centro', foot: 'No indicada', image: transfermarktPlayerImage },
];

const positions = [
  'Portero',
  'Lateral derecho',
  'Lateral izquierdo',
  'Defensa central',
  'Central derecho',
  'Central izquierdo',
  'Pivote',
  'Mediocentro',
  'Mediocentro ofensivo',
  'Extremo derecho',
  'Extremo izquierdo',
  'Mediapunta',
  'Delantero centro',
  'Delantero',
];

const footOptions = ['Derecha', 'Izquierda', 'Ambas', 'No indicada'];

const squadGroups = [
  {
    title: 'Porteros',
    positions: ['Portero'],
  },
  {
    title: 'Defensas',
    positions: ['Lateral derecho', 'Lateral izquierdo', 'Defensa central', 'Central derecho', 'Central izquierdo'],
  },
  {
    title: 'Mediocentros',
    positions: ['Pivote', 'Mediocentro', 'Mediocentro ofensivo', 'Mediapunta'],
  },
  {
    title: 'Delanteros',
    positions: ['Extremo derecho', 'Extremo izquierdo', 'Delantero centro', 'Delantero'],
  },
];

const calculateAge = (dob) => {
  const birth = new Date(dob);
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  const dayDiff = now.getDate() - birth.getDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) years -= 1;
  return years;
};

const playerLabel = (dob) => (calculateAge(dob) < 23 ? 'Sub-23' : 'Senior');

const displayDorsal = (number) => (number ? number : '-');

function App() {
  const [activeTab, setActiveTab] = useState('Inicio');
  const [players, setPlayers] = useState(samplePlayers);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formState, setFormState] = useState({
    name: '',
    dob: '',
    number: '',
    position: 'Portero',
    foot: 'Derecha',
    image: '',
  });

  const editingPlayer = useMemo(
    () => players.find((player) => player.id === editingId) ?? null,
    [editingId, players]
  );

  const groupedPlayers = useMemo(
    () =>
      squadGroups.map((group) => ({
        ...group,
        players: players.filter((player) => group.positions.includes(player.position)),
      })),
    [players]
  );

  const openForm = (player = null) => {
    if (player) {
      setEditingId(player.id);
      setFormState({
        name: player.name,
        dob: player.dob,
        number: player.number,
        position: player.position,
        foot: player.foot,
        image: player.image,
      });
    } else {
      setEditingId(null);
      setFormState({
        name: '',
        dob: '',
        number: '',
        position: 'Portero',
        foot: 'Derecha',
        image: '',
      });
    }
    setIsPanelOpen(true);
  };

  const closeForm = () => {
    setIsPanelOpen(false);
    setEditingId(null);
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormState((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const payload = {
      id: editingId ?? Date.now(),
      name: formState.name.trim() || 'Jugador sin nombre',
      dob: formState.dob,
      number: Number(formState.number) || 0,
      position: formState.position,
      foot: formState.foot,
      image: formState.image.trim(),
    };

    if (editingId) {
      setPlayers((current) => current.map((player) => (player.id === editingId ? payload : player)));
    } else {
      setPlayers((current) => [payload, ...current]);
    }
    closeForm();
  };

  const handleDelete = (player) => {
    const confirmed = window.confirm(`Â¿Eliminar a ${player.name}? Esta acciÃ³n no se puede deshacer.`);
    if (!confirmed) return;
    setPlayers((current) => current.filter((item) => item.id !== player.id));
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-caudal-950 via-caudal-900 to-[#05101f] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 pb-8 pt-6 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-col gap-4 rounded-3xl border border-white/5 bg-white/5 p-5 shadow-glow backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.34em] text-slate-400">Entrenador</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">C.D. Caudal de Mieres</h1>
            <p className="mt-1 text-sm text-slate-400">Mieres, Asturias</p>
          </div>
          <nav className="flex flex-wrap gap-3">
            {['Inicio', 'Plantilla'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                  activeTab === tab
                    ? 'bg-electric text-slate-950 shadow-[0_15px_35px_rgba(79,140,255,0.22)]'
                    : 'bg-white/5 text-slate-300 hover:bg-white/10'
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>
        </header>

        {activeTab === 'Inicio' ? (
          <main className="grid gap-6 lg:grid-cols-[1.3fr_0.9fr]">
            <section className="space-y-6 rounded-3xl border border-white/5 bg-white/5 p-6 shadow-glow backdrop-blur-md">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-3xl bg-white p-2 shadow-sm">
                  <img src={clubCrest} alt="Escudo del C.D. Caudal" className="h-full w-full object-contain" />
                </div>
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Bienvenida</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Â¡Bienvenido, cuerpo tÃ©cnico!</h2>
                </div>
              </div>
              <div className="space-y-3 text-slate-300">
                <p>Esta es la base para gestionar tu plantilla de manera Ã¡gil y deportiva.</p>
                <p>Gestiona alineaciones, jugadores y rÃ¡pida informaciÃ³n de la plantilla sin necesidad de backend.</p>
              </div>
              <button
                onClick={() => setActiveTab('Plantilla')}
                className="mt-4 inline-flex items-center justify-center rounded-3xl bg-electric px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-[#3c76dc]"
              >
                Gestionar plantilla
              </button>
            </section>
            <section className="rounded-3xl border border-white/5 bg-white/5 p-6 shadow-glow backdrop-blur-md">
              <div className="flex items-center gap-4">
                <div className="h-20 w-20 rounded-3xl bg-[#15224d] p-4 shadow-inner">
                  <img
                    src={clubCrest}
                    alt="Escudo del equipo"
                    className="h-full w-full rounded-2xl object-cover"
                  />
                </div>
                <div>
                  <p className="text-sm uppercase tracking-[0.35em] text-slate-400">Escudo</p>
                  <h3 className="mt-2 text-xl font-semibold text-white">C.D. Caudal</h3>
                </div>
              </div>
              <div className="mt-6 space-y-4 rounded-3xl border border-white/10 bg-caudal-900/80 p-5">
                <p className="text-sm text-slate-300">Plantilla profesional con enfoque joven, organizada para entrenamientos y prÃ³ximos pasos.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-3xl bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Jugadores</p>
                    <p className="mt-2 text-3xl font-semibold text-white">{players.length}</p>
                  </div>
                  <div className="rounded-3xl bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Sub-23</p>
                    <p className="mt-2 text-3xl font-semibold text-white">{players.filter((player) => calculateAge(player.dob) < 23).length}</p>
                  </div>
                </div>
              </div>
            </section>
          </main>
        ) : (
          <main className="space-y-6">
            <section className="rounded-3xl border border-white/5 bg-white/5 p-6 shadow-glow backdrop-blur-md">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Plantilla</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">GestiÃ³n de jugadores</h2>
                </div>
                <button
                  onClick={() => openForm(null)}
                  className="inline-flex items-center justify-center rounded-3xl bg-electric px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-[#3c76dc]"
                >
                  Nuevo jugador
                </button>
              </div>
            </section>

            <div className="space-y-6">
              {groupedPlayers.map((group) => (
                <section key={group.title} className="space-y-4">
                  <div className="flex items-end justify-between border-b border-white/10 pb-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Demarcacion</p>
                      <h3 className="mt-1 text-xl font-semibold text-white">{group.title}</h3>
                    </div>
                    <span className="rounded-2xl bg-white/10 px-3 py-1 text-sm font-semibold text-slate-200">
                      {group.players.length}
                    </span>
                  </div>

                  {group.players.length > 0 ? (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {group.players.map((player) => (
                        <article key={player.id} className="group rounded-3xl border border-white/5 bg-[#091428]/80 p-4 shadow-glow transition hover:-translate-y-1 hover:border-electric/40">
                  <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-3xl bg-slate-800 text-lg font-bold text-slate-200">
                      {player.image ? (
                        <img src={player.image} alt={player.name} className="h-full w-full object-cover" />
                      ) : (
                        <span>{player.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">#{displayDorsal(player.number)}</p>
                      <h3 className="truncate text-lg font-semibold text-white">{player.name}</h3>
                      <p className="text-sm text-slate-400">{player.position}</p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 rounded-3xl border border-white/5 bg-white/5 p-4 text-sm text-slate-300">
                    <div className="flex items-center justify-between">
                      <span>Dorsal</span>
                              <strong className="text-white">{displayDorsal(player.number)}</strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Pierna</span>
                      <strong className="text-white">{player.foot}</strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Edad</span>
                      <strong className="text-white">{calculateAge(player.dob)} aÃ±os</strong>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl bg-[#10254d] px-3 py-2 text-xs uppercase tracking-[0.25em] text-electric">
                      <span>{playerLabel(player.dob)}</span>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      onClick={() => openForm(player)}
                      className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/15"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(player)}
                      className="rounded-2xl bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-500/15"
                    >
                      Eliminar
                    </button>
                  </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-5 py-6 text-sm text-slate-400">
                      No hay jugadores en este grupo.
                    </div>
                  )}
                </section>
              ))}
            </div>
          </main>
        )}
      </div>

      {isPanelOpen ? (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/50 px-4 py-6 backdrop-blur-sm sm:px-6">
          <div className="mx-auto flex h-full max-w-3xl flex-col rounded-3xl bg-caudal-950 shadow-glow">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-slate-400">{editingId ? 'Editar jugador' : 'Nuevo jugador'}</p>
                <h3 className="mt-2 text-xl font-semibold text-white">Formulario de jugador</h3>
              </div>
              <button onClick={closeForm} className="rounded-full bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10">
                Cerrar
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-5 px-6 py-6 sm:px-8">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Nombre completo</span>
                  <input
                    required
                    name="name"
                    value={formState.name}
                    onChange={handleChange}
                    className="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-inner placeholder:text-slate-500"
                    placeholder="Ej. Pablo NÃºÃ±ez"
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Fecha de nacimiento</span>
                  <input
                    required
                    type="date"
                    name="dob"
                    value={formState.dob}
                    onChange={handleChange}
                    className="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-inner"
                  />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Dorsal</span>
                  <input
                    required
                    type="number"
                    name="number"
                    min="1"
                    value={formState.number}
                    onChange={handleChange}
                    className="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-inner"
                    placeholder="7"
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span>PosiciÃ³n</span>
                  <select
                    required
                    name="position"
                    value={formState.position}
                    onChange={handleChange}
                    className="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-inner"
                  >
                    {positions.map((position) => (
                      <option key={position} value={position}>
                        {position}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Pierna hÃ¡bil</span>
                  <select
                    required
                    name="foot"
                    value={formState.foot}
                    onChange={handleChange}
                    className="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-inner"
                  >
                    {footOptions.map((foot) => (
                      <option key={foot} value={foot}>
                        {foot}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="space-y-2 text-sm text-slate-300">
                <span>URL de imagen</span>
                <input
                  name="image"
                  type="url"
                  value={formState.image}
                  onChange={handleChange}
                  className="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-inner"
                  placeholder="https://..."
                />
              </label>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                <button
                  type="button"
                  onClick={closeForm}
                  className="inline-flex items-center justify-center rounded-3xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-3xl bg-electric px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-[#3c76dc]"
                >
                  Guardar jugador
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default App;

