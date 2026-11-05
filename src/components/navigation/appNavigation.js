// Solo presentación. App.jsx conserva la selección y las transiciones entre módulos.
export function isLocalVideoLabEnvironment({ dev, hostname }) {
  return Boolean(dev && ['localhost', '127.0.0.1', '[::1]'].includes(hostname));
}

export const LOCAL_VIDEO_LAB_ENABLED = isLocalVideoLabEnvironment({
  dev: import.meta.env?.DEV,
  hostname: typeof window === 'undefined' ? '' : window.location.hostname,
});

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
    ...(LOCAL_VIDEO_LAB_ENABLED ? [{ name: 'Videoanálisis', icon: 'video' }] : []),
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
