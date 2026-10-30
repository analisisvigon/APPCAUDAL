// Solo presentación. App.jsx conserva la selección y las transiciones entre módulos.
export const STAFF_NAV_GROUPS = Object.freeze([
  { title: 'PRINCIPAL', items: [{ name: 'Inicio', icon: 'home' }] },
  { title: 'EQUIPO', items: [
    { name: 'Plantilla', icon: 'users' },
  ] },
  { title: 'PLANIFICACIÓN', items: [
    { name: 'Calendario', icon: 'calendar' },
    { name: 'Microciclos', icon: 'calendar' },
    { name: 'Sesiones', icon: 'training' },
    { name: 'Tareas', icon: 'tasks' },
    { name: 'Biblioteca', icon: 'library' },
  ] },
  { title: 'COMPETICIÓN', items: [
    { name: 'Equipos', icon: 'shield' },
    { name: 'Perfiles', icon: 'profile' },
    { name: 'Partidos', icon: 'ball' },
  ] },
  { title: 'ANÁLISIS', items: [
    { name: 'Rendimiento', icon: 'chart' },
    { name: 'Análisis Grupal', icon: 'group' },
    { name: 'Registro Delegado', icon: 'clipboard' },
  ] },
  { title: 'GESTIÓN', items: [
    { name: 'Fisio', icon: 'medical' },
    { name: 'Multas', icon: 'receipt' },
  ] },
]);

export const STAFF_NAV_TABS = STAFF_NAV_GROUPS.flatMap((group) => group.items.map((item) => item.name));
