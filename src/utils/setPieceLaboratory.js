import {
  cloneSetPieceElementsWithFreshIds,
  getSetPieceTacticalMeta,
  setSetPieceTacticalMeta,
} from './setPieceProfessional.js';

export const SET_PIECE_LAB_CATEGORY = 'ABP Laboratorio';

export const TRAINING_LIBRARY_SECTIONS = Object.freeze({
  EXERCISES: 'exercises',
  SET_PIECES: 'set-pieces',
});

export const SET_PIECE_LAB_TYPES = Object.freeze([
  { id: 'corner_ofensivo', label: 'Córner ofensivo', category: SET_PIECE_LAB_CATEGORY },
  { id: 'falta_lateral_ofensiva', label: 'Falta lateral ofensiva', category: SET_PIECE_LAB_CATEGORY },
  { id: 'saque_banda_ofensivo', label: 'Saque de banda ofensivo', category: SET_PIECE_LAB_CATEGORY },
  { id: 'saque_inicio_ofensivo', label: 'Saque de inicio', category: SET_PIECE_LAB_CATEGORY },
  { id: 'corner_defensivo', label: 'Córner defensivo', category: SET_PIECE_LAB_CATEGORY },
  { id: 'falta_lateral_defensiva', label: 'Falta lateral defensiva', category: SET_PIECE_LAB_CATEGORY },
  { id: 'saque_banda_defensivo', label: 'Saque de banda defensivo', category: SET_PIECE_LAB_CATEGORY },
]);

export const SET_PIECE_LAB_ZONES = Object.freeze(['Primer palo', 'Zona media', 'Segundo palo', 'En corto', 'Frontal']);
export const SET_PIECE_LAB_MECHANISMS = Object.freeze(['Bloqueo', 'Arrastre', 'Ataque de zona']);
export const SET_PIECE_LAB_MARKINGS = Object.freeze(['Zonal', 'Individual', 'Mixto']);
export const SET_PIECE_LAB_STATUSES = Object.freeze([
  { id: 'draft', label: 'Borrador' },
  { id: 'ready', label: 'Lista para usar' },
  { id: 'archived', label: 'Archivada' },
]);

const clean = (value) => String(value || '').trim();
export const normalizeTrainingLibraryClassification = (value) => clean(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
  .replace(/[._/\\:;()[\]{}-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toLocaleLowerCase('es');

const SET_PIECE_CATEGORY_KEYS = new Set([
  'abp ofensiva',
  'abp ofensivo',
  'abp defensiva',
  'abp defensivo',
  'abp laboratorio',
  'laboratorio abp',
  'accion a balon parado',
  'acciones a balon parado',
  'balon parado',
]);

const SET_PIECE_TYPE_KEYS = new Set([
  ...SET_PIECE_LAB_TYPES.map((entry) => normalizeTrainingLibraryClassification(entry.id)),
  'abp',
  'abp ofensiva',
  'abp ofensivo',
  'abp defensiva',
  'abp defensivo',
  'accion a balon parado',
  'acciones a balon parado',
]);
const createId = () => globalThis.crypto?.randomUUID?.() || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (token) => {
  const random = Math.floor(Math.random() * 16);
  const value = token === 'x' ? random : (random & 0x3) | 0x8;
  return value.toString(16);
});

export const isSetPieceLibraryItem = (item) => (
  SET_PIECE_CATEGORY_KEYS.has(normalizeTrainingLibraryClassification(item?.categoria))
  || SET_PIECE_TYPE_KEYS.has(normalizeTrainingLibraryClassification(item?.tipo))
);

export const isSetPieceLaboratoryItem = isSetPieceLibraryItem;

export const getTrainingLibrarySection = (item) => (
  isSetPieceLibraryItem(item) ? TRAINING_LIBRARY_SECTIONS.SET_PIECES : TRAINING_LIBRARY_SECTIONS.EXERCISES
);

export const partitionTrainingLibraryItems = (items = []) => (Array.isArray(items) ? items : []).reduce((partition, item) => {
  partition[getTrainingLibrarySection(item)].push(item);
  return partition;
}, { [TRAINING_LIBRARY_SECTIONS.EXERCISES]: [], [TRAINING_LIBRARY_SECTIONS.SET_PIECES]: [] });

export const getSetPieceLabType = (type) => SET_PIECE_LAB_TYPES.find((entry) => entry.id === type) || SET_PIECE_LAB_TYPES[0];

export const getSetPieceLaboratoryMeta = (itemOrElements) => {
  const item = Array.isArray(itemOrElements) ? null : itemOrElements;
  const elements = Array.isArray(itemOrElements) ? itemOrElements : item?.elements;
  const meta = getSetPieceTacticalMeta(elements);
  return {
    ...meta,
    libraryId: meta.libraryId || clean(item?.id),
    libraryVersion: meta.libraryVersion || clean(item?.updated_at),
    libraryCreatedAt: meta.libraryCreatedAt || clean(item?.created_at),
    libraryUpdatedAt: meta.libraryUpdatedAt || clean(item?.updated_at),
    linkStatus: 'master',
    libraryZone: SET_PIECE_LAB_ZONES.includes(meta.libraryZone) ? meta.libraryZone : '',
    libraryMechanism: SET_PIECE_LAB_MECHANISMS.includes(meta.libraryMechanism) ? meta.libraryMechanism : '',
    libraryMarking: SET_PIECE_LAB_MARKINGS.includes(meta.libraryMarking) ? meta.libraryMarking : '',
    libraryStatus: SET_PIECE_LAB_STATUSES.some((status) => status.id === meta.libraryStatus)
      ? meta.libraryStatus
      : 'draft',
    libraryFavorite: Boolean(meta.libraryFavorite),
  };
};

export const validateSetPieceLaboratoryMeta = (meta) => {
  if (meta.libraryStatus !== 'ready') return [];
  return [
    !SET_PIECE_LAB_ZONES.includes(meta.libraryZone) ? 'Zona objetivo' : '',
    !SET_PIECE_LAB_MECHANISMS.includes(meta.libraryMechanism) ? 'Mecanismo principal' : '',
    !SET_PIECE_LAB_MARKINGS.includes(meta.libraryMarking) ? 'Marcaje rival' : '',
  ].filter(Boolean);
};

export const createSetPieceLaboratoryDraft = (type = SET_PIECE_LAB_TYPES[0].id) => {
  const now = new Date().toISOString();
  const id = createId();
  const meta = {
    ...getSetPieceTacticalMeta([]),
    libraryId: id,
    libraryVersion: now,
    linkStatus: 'master',
    libraryStatus: 'draft',
    libraryFavorite: false,
    libraryCreatedAt: now,
    libraryUpdatedAt: now,
  };
  return {
    id,
    nombre: '',
    tipo: type,
    categoria: getSetPieceLabType(type).category,
    descripcion: '',
    objetivo: '',
    variantes: '',
    dimensiones: '',
    jugadores: '',
    duracion: '',
    material: '',
    elements: setSetPieceTacticalMeta([], meta),
    created_at: now,
    updated_at: now,
    isNew: true,
  };
};

export const prepareSetPieceLaboratoryItem = (item) => {
  const sourceMeta = getSetPieceLaboratoryMeta(item);
  const meta = {
    ...sourceMeta,
    objective: sourceMeta.objective || clean(item?.objetivo),
    generalInstruction: sourceMeta.generalInstruction || clean(item?.descripcion),
    alternative: sourceMeta.alternative || clean(item?.variantes),
  };
  return {
    ...item,
    nombre: clean(item?.nombre),
    tipo: getSetPieceLabType(item?.tipo).id,
    categoria: clean(item?.categoria) || SET_PIECE_LAB_CATEGORY,
    elements: setSetPieceTacticalMeta(item?.elements, meta),
  };
};

export const buildSetPieceLaboratoryPayload = (draft) => {
  const now = new Date().toISOString();
  const sourceMeta = getSetPieceLaboratoryMeta(draft);
  const meta = {
    ...sourceMeta,
    objective: sourceMeta.objective,
    generalInstruction: sourceMeta.generalInstruction,
    alternative: sourceMeta.alternative,
    libraryId: clean(draft.id),
    libraryVersion: now,
    libraryCreatedAt: sourceMeta.libraryCreatedAt || clean(draft.created_at) || now,
    libraryUpdatedAt: now,
    linkStatus: 'master',
  };
  return {
    id: draft.id,
    nombre: clean(draft.nombre) || 'Jugada ABP sin nombre',
    tipo: getSetPieceLabType(draft.tipo).id,
    categoria: isSetPieceLibraryItem(draft) ? clean(draft.categoria) : SET_PIECE_LAB_CATEGORY,
    descripcion: meta.generalInstruction,
    objetivo: meta.objective,
    variantes: meta.alternative,
    dimensiones: '',
    jugadores: '',
    duracion: '',
    material: '',
    elements: setSetPieceTacticalMeta(draft.elements, meta),
  };
};

export const duplicateSetPieceLaboratoryItem = (item) => {
  const now = new Date().toISOString();
  const id = createId();
  const clonedElements = cloneSetPieceElementsWithFreshIds(item.elements);
  const meta = {
    ...getSetPieceLaboratoryMeta(clonedElements),
    libraryId: id,
    libraryVersion: now,
    libraryCreatedAt: now,
    libraryUpdatedAt: now,
    linkStatus: 'master',
  };
  return {
    ...item,
    id,
    nombre: `${clean(item.nombre) || 'Jugada ABP'} copia`,
    elements: setSetPieceTacticalMeta(clonedElements, meta),
    created_at: now,
    updated_at: now,
    isNew: true,
  };
};

export const filterAndSortSetPieceLaboratoryItems = (items, controls = {}) => {
  const query = clean(controls.search).toLocaleLowerCase('es');
  const filtered = items.filter((item) => {
    const meta = getSetPieceLaboratoryMeta(item);
    const matchesSearch = !query || [item.nombre, meta.objective || item.objetivo, meta.generalInstruction || item.descripcion]
      .some((value) => clean(value).toLocaleLowerCase('es').includes(query));
    return matchesSearch
      && (!controls.zone || meta.libraryZone === controls.zone)
      && (!controls.mechanism || meta.libraryMechanism === controls.mechanism)
      && (!controls.marking || meta.libraryMarking === controls.marking)
      && (!controls.status || meta.libraryStatus === controls.status)
      && (!controls.favorites || meta.libraryFavorite);
  });
  const sort = controls.sort || 'updated';
  return [...filtered].sort((a, b) => {
    const metaA = getSetPieceLaboratoryMeta(a);
    const metaB = getSetPieceLaboratoryMeta(b);
    if (sort === 'name') return clean(a.nombre).localeCompare(clean(b.nombre), 'es');
    if (sort === 'type') return getSetPieceLabType(a.tipo).label.localeCompare(getSetPieceLabType(b.tipo).label, 'es');
    if (sort === 'favorites') return Number(metaB.libraryFavorite) - Number(metaA.libraryFavorite) || clean(b.updated_at).localeCompare(clean(a.updated_at));
    return clean(b.updated_at || metaB.libraryUpdatedAt).localeCompare(clean(a.updated_at || metaA.libraryUpdatedAt));
  });
};
