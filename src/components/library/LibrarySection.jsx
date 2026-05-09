import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import SetPieceDiagramCanvas from '../print/SetPieceDiagramCanvas';
import SetPieceDiagramEditor from '../print/SetPieceDiagramEditor';
import LibraryPrintSheet from './LibraryPrintSheet';

export const libraryCategories = [
  'ABP Ofensiva',
  'ABP Defensiva',
  'Ejercicios técnicos',
  'Ejercicios tácticos',
  'Juegos reducidos',
  'Posesiones',
  'Finalización',
  'Ruedas de pase',
  'Activación',
  'Fuerza / físico',
  'Estrategia',
  'Otros',
];

const emptyDraft = {
  nombre: '',
  tipo: 'Ejercicio',
  categoria: 'Ejercicios técnicos',
  descripcion: '',
  objetivo: '',
  variantes: '',
  dimensiones: '',
  jugadores: '',
  duracion: '',
  material: '',
  elements: [],
};

export default function LibrarySection({ players = [] }) {
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState(emptyDraft);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('Todas');
  const [typeFilter, setTypeFilter] = useState('Todos');
  const [printPerPage, setPrintPerPage] = useState(2);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const loadLibrary = async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: loadError } = await supabase
        .from('training_library')
        .select('*')
        .order('updated_at', { ascending: false });
      if (loadError) throw loadError;
      setItems(data || []);
    } catch (loadError) {
      console.error('Error cargando biblioteca desde Supabase:', loadError);
      setError(loadError.message || 'No se pudo cargar la biblioteca.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLibrary();
  }, []);

  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesSearch = !normalizedSearch || [item.nombre, item.descripcion, item.objetivo, item.tipo, item.categoria].some((value) => String(value || '').toLowerCase().includes(normalizedSearch));
      const matchesCategory = categoryFilter === 'Todas' || item.categoria === categoryFilter;
      const matchesType = typeFilter === 'Todos' || item.tipo === typeFilter;
      return matchesSearch && matchesCategory && matchesType;
    });
  }, [items, search, categoryFilter, typeFilter]);

  const libraryTypes = useMemo(() => ['Todos', ...Array.from(new Set(items.map((item) => item.tipo).filter(Boolean)))], [items]);
  const selectedItem = items.find((item) => item.id === selectedId) || null;

  const startNew = () => {
    setSelectedId('');
    setDraft(emptyDraft);
    setStatus('');
    setError('');
  };

  const editItem = (item) => {
    setSelectedId(item.id);
    setDraft({
      nombre: item.nombre || '',
      tipo: item.tipo || 'Ejercicio',
      categoria: item.categoria || 'Otros',
      descripcion: item.descripcion || '',
      objetivo: item.objetivo || '',
      variantes: item.variantes || '',
      dimensiones: item.dimensiones || '',
      jugadores: item.jugadores || '',
      duracion: item.duracion || '',
      material: item.material || '',
      elements: Array.isArray(item.elements) ? item.elements : [],
    });
    setStatus('');
    setError('');
  };

  const saveItem = async () => {
    setSaving(true);
    setError('');
    setStatus('');
    try {
      const payload = {
        nombre: draft.nombre.trim() || 'Ejercicio sin nombre',
        tipo: draft.tipo.trim() || 'Ejercicio',
        categoria: draft.categoria,
        descripcion: draft.descripcion,
        objetivo: draft.objetivo,
        variantes: draft.variantes,
        dimensiones: draft.dimensiones,
        jugadores: draft.jugadores,
        duracion: draft.duracion,
        material: draft.material,
        elements: Array.isArray(draft.elements) ? draft.elements : [],
      };
      const request = selectedId
        ? supabase.from('training_library').update(payload).eq('id', selectedId).select('*').single()
        : supabase.from('training_library').insert(payload).select('*').single();
      const { data, error: saveError } = await request;
      if (saveError) throw saveError;
      setItems((current) => selectedId ? current.map((item) => (item.id === selectedId ? data : item)) : [data, ...current]);
      setSelectedId(data.id);
      setStatus('Guardado en biblioteca.');
    } catch (saveError) {
      console.error('Error guardando en biblioteca:', saveError);
      setError(saveError.message || 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const duplicateItem = async (item) => {
    setSaving(true);
    setError('');
    try {
      const payload = {
        nombre: `${item.nombre || 'Elemento'} copia`,
        tipo: item.tipo,
        categoria: item.categoria,
        descripcion: item.descripcion,
        objetivo: item.objetivo,
        variantes: item.variantes,
        dimensiones: item.dimensiones,
        jugadores: item.jugadores,
        duracion: item.duracion,
        material: item.material,
        elements: JSON.parse(JSON.stringify(Array.isArray(item.elements) ? item.elements : [])),
      };
      const { data, error: duplicateError } = await supabase.from('training_library').insert(payload).select('*').single();
      if (duplicateError) throw duplicateError;
      setItems((current) => [data, ...current]);
      editItem(data);
      setStatus('Elemento duplicado.');
    } catch (duplicateError) {
      console.error('Error duplicando biblioteca:', duplicateError);
      setError(duplicateError.message || 'No se pudo duplicar.');
    } finally {
      setSaving(false);
    }
  };

  const printLibrary = () => window.print();

  return (
    <main className="space-y-6">
      <section className="print-hidden rounded-3xl border border-white/5 bg-white/5 p-6 shadow-glow backdrop-blur-md">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Biblioteca</p>
            <h2 className="mt-2 text-3xl font-semibold text-white">Biblioteca táctica y de entrenamiento</h2>
            <p className="mt-2 text-sm text-slate-400">Guarda, reutiliza, duplica e imprime tareas, ABP y ejercicios con dibujo táctico SVG.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={startNew} className="rounded-2xl bg-white/10 px-5 py-3 text-sm font-bold text-white">Crear ejercicio nuevo</button>
            <button type="button" onClick={saveItem} disabled={saving} className="rounded-2xl bg-caudal-electric px-5 py-3 text-sm font-black text-slate-950 disabled:opacity-60">{saving ? 'Guardando...' : 'Guardar ejercicio'}</button>
          </div>
        </div>
        {loading ? <p className="mt-4 text-sm text-slate-400">Cargando biblioteca desde Supabase...</p> : null}
        {error ? <p className="mt-4 rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</p> : null}
        {status ? <p className="mt-4 rounded-2xl bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">{status}</p> : null}
      </section>

      <section className="print-hidden grid gap-6 xl:grid-cols-[0.9fr_1.2fr]">
        <div className="space-y-4 rounded-3xl border border-white/5 bg-[#091428]/80 p-5 shadow-glow">
          <div className="grid gap-3 sm:grid-cols-2">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500" />
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="rounded-2xl border border-white/10 bg-white px-4 py-3 text-sm font-bold text-slate-950">
              <option>Todas</option>
              {libraryCategories.map((category) => <option key={category}>{category}</option>)}
            </select>
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="rounded-2xl border border-white/10 bg-white px-4 py-3 text-sm font-bold text-slate-950">
              {libraryTypes.map((type) => <option key={type}>{type}</option>)}
            </select>
            <select value={printPerPage} onChange={(event) => setPrintPerPage(Number(event.target.value))} className="rounded-2xl border border-white/10 bg-white px-4 py-3 text-sm font-bold text-slate-950">
              <option value={1}>Imprimir 1 por hoja</option>
              <option value={2}>Imprimir 2 por hoja</option>
              <option value={4}>Imprimir 4 por hoja</option>
            </select>
          </div>
          <button type="button" onClick={printLibrary} className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm font-bold text-white">Imprimir selección</button>

          <div className="grid gap-3">
            {filteredItems.map((item) => (
              <button key={item.id} type="button" onClick={() => editItem(item)} className={`rounded-3xl border p-4 text-left transition ${selectedId === item.id ? 'border-caudal-electric bg-caudal-electric/10' : 'border-white/5 bg-white/5 hover:bg-white/10'}`}>
                <div className="grid grid-cols-[120px_1fr] gap-4">
                  <div className="rounded-2xl bg-white p-2 text-black">
                    <SetPieceDiagramCanvas elements={item.elements || []} readOnly />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-white">{item.nombre}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.14em] text-caudal-electric">{item.categoria || item.tipo}</p>
                    <p className="mt-2 line-clamp-2 text-xs text-slate-400">{item.descripcion || item.objetivo || 'Sin descripción'}</p>
                    <button type="button" onClick={(event) => { event.stopPropagation(); duplicateItem(item); }} className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-xs font-bold text-white">Duplicar</button>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4 rounded-3xl border border-white/5 bg-[#091428]/80 p-5 shadow-glow">
          <div className="grid gap-3 md:grid-cols-2">
            <input value={draft.nombre} onChange={(event) => setDraft((current) => ({ ...current, nombre: event.target.value }))} placeholder="Nombre" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500" />
            <input value={draft.tipo} onChange={(event) => setDraft((current) => ({ ...current, tipo: event.target.value }))} placeholder="Tipo" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500" />
            <select value={draft.categoria} onChange={(event) => setDraft((current) => ({ ...current, categoria: event.target.value }))} className="rounded-2xl border border-white/10 bg-white px-4 py-3 text-sm font-bold text-slate-950">
              {libraryCategories.map((category) => <option key={category}>{category}</option>)}
            </select>
            <input value={draft.duracion} onChange={(event) => setDraft((current) => ({ ...current, duracion: event.target.value }))} placeholder="Duración" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500" />
            <input value={draft.jugadores} onChange={(event) => setDraft((current) => ({ ...current, jugadores: event.target.value }))} placeholder="Jugadores" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500" />
            <input value={draft.dimensiones} onChange={(event) => setDraft((current) => ({ ...current, dimensiones: event.target.value }))} placeholder="Dimensiones" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500" />
            <input value={draft.material} onChange={(event) => setDraft((current) => ({ ...current, material: event.target.value }))} placeholder="Material" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 md:col-span-2" />
          </div>
          <textarea value={draft.objetivo} onChange={(event) => setDraft((current) => ({ ...current, objetivo: event.target.value }))} placeholder="Objetivo" className="min-h-[80px] w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500" />
          <textarea value={draft.descripcion} onChange={(event) => setDraft((current) => ({ ...current, descripcion: event.target.value }))} placeholder="Descripción" className="min-h-[100px] w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500" />
          <textarea value={draft.variantes} onChange={(event) => setDraft((current) => ({ ...current, variantes: event.target.value }))} placeholder="Variantes futuras / progresiones" className="min-h-[80px] w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500" />
          <SetPieceDiagramEditor diagram={{ ...draft, titulo: draft.nombre, consigna: draft.descripcion }} players={players} onChange={(next) => setDraft((current) => ({ ...current, nombre: next.titulo || current.nombre, descripcion: next.consigna || current.descripcion, elements: next.elements || [] }))} />
        </div>
      </section>

      <div className="print-sheet-frame">
        <LibraryPrintSheet items={filteredItems.length ? filteredItems : (selectedItem ? [selectedItem] : [])} perPage={printPerPage} />
      </div>
    </main>
  );
}
