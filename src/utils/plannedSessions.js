export const PLANNED_PHASES = [
  { key: 'activation', label: 'Activación' },
  { key: 'main', label: 'Parte principal' },
  { key: 'cooldown', label: 'Vuelta a la calma' },
];

export const PLANNED_HEADER_FIELDS = [
  'starts_at', 'location', 'period_label', 'morphology_pattern',
  'next_opponent_label', 'objectives', 'notes', 'material', 'staff_observations',
];

const text = (value) => value == null ? '' : String(value);
const timeInput = (value) => text(value).slice(0, 5);
const positiveInteger = (value) => {
  const valueText = text(value).trim();
  return /^[1-9]\d*$/.test(valueText) ? Number(valueText) : null;
};

export const hasPlannedLibraryItems = (editor) => Boolean(editor?.slots?.some((slot) =>
  slot.items.some((item) => item.kind === 'library_task')));

export const canWritePlannedContext = (membership, context) =>
  membership?.is_active === true && ['owner', 'admin'].includes(membership?.role) &&
  context?.status === 'open';

export const getPlannedLibrarySource = (item) => item?.snapshot?.source || item?.preview || {};
export const getPlannedLibraryValue = (item, field) =>
  Object.prototype.hasOwnProperty.call(item?.working || {}, field)
    ? item.working[field] : getPlannedLibrarySource(item)[field];

export const deriveSessionMaterial = (slots = []) => {
  const found = new Set();
  const materials = [];
  for (const slot of slots) for (const item of slot.items || []) {
    const written = item.kind === 'library_task' ? getPlannedLibraryValue(item, 'material') : '';
    for (const part of String(written || '').split(/[,;\n]+/)) {
      const material = part.trim().replace(/\s+/g, ' ');
      const key = material.toLocaleLowerCase('es');
      if (material && !found.has(key)) { found.add(key); materials.push(material); }
    }
  }
  return materials.join(', ');
};

const stableJson = (value) => Array.isArray(value) ? value.map(stableJson)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableJson(value[key])]))
    : value;

export const assertPlanned03cReload = (expected, actual, revision) => {
  const expectedItems = expected.slots.flatMap((slot) => slot.items);
  const actualItems = actual.slots.flatMap((slot) => slot.items);
  const actualById = new Map(actualItems.map((item) => [item.id, item]));
  const orderedExpected = PLANNED_PHASES.flatMap((phase) =>
    expected.slots.filter((slot) => slot.phase === phase.key));
  const sameSlots = orderedExpected.length === actual.slots.length &&
    orderedExpected.every((slot, index) => {
      const received = actual.slots[index];
      return received?.id === slot.id && received.phase === slot.phase &&
        Number(received.duration) === Number(slot.duration) &&
        received.items.map((item) => item.id).join(',') === slot.items.map((item) => item.id).join(',');
    });
  if (actual.revision !== revision || !sameSlots ||
      (expected.session_number != null && actual.session_number !== expected.session_number) ||
      expectedItems.length !== actualItems.length ||
      expectedItems.some((item) => {
        const received = actualById.get(item.id);
        return !received || received.kind !== item.kind ||
          (item.kind === 'library_task' && (!received.snapshot ||
            received.sourceTaskId !== item.sourceTaskId ||
            JSON.stringify(stableJson(received.working)) !== JSON.stringify(stableJson(item.working))));
      })) throw new Error('La lectura posterior no coincide con el guardado 03C; recarga antes de continuar.');
};

export const createPlannedLibraryItem = (id, task) => ({
  id, kind: 'library_task', sourceTaskId: task.id, snapshot: null,
  preview: Object.fromEntries([
    'name', 'description', 'objective', 'material', 'technical_content',
    'tactical_content', 'observations', 'editor_payload', 'duration_minutes',
    'space_width_m', 'space_length_m',
  ].map((field) => [field, task[field]])),
  working: {}, minutes: '',
});

export const createEmptyPlannedEditor = () => ({
  id: null,
  revision: null,
  planning_state: 'draft',
  session_number: null,
  session_date: '',
  header: Object.fromEntries(PLANNED_HEADER_FIELDS.map((field) => [field, ''])),
  slots: [],
});

export const hydratePlannedEditor = (session, slots = [], items = []) => {
  const bySlot = new Map();
  for (const item of items) {
    const list = bySlot.get(item.slot_id) || [];
    if (item.kind === 'free') list.push({
      id: item.id,
      kind: 'free',
      title: text(item.free_title),
      description: text(item.free_description),
      comments: text(item.free_comments),
      url: text(item.free_url),
      minutes: text(item.activity_minutes),
      sort_order: item.sort_order,
    });
    else if (item.kind === 'library_task') list.push({
      id: item.id, kind: 'library_task',
      sourceTaskId: item.source_task_uuid_snapshot,
      snapshot: item.task_snapshot, working: item.task_snapshot?.working || {},
      minutes: text(item.activity_minutes), sort_order: item.sort_order,
    });
    else list.push({ id: item.id, kind: item.kind, sort_order: item.sort_order });
    bySlot.set(item.slot_id, list);
  }
  const header = Object.fromEntries(PLANNED_HEADER_FIELDS.map((field) => [
    field, field === 'starts_at' ? timeInput(session[field]) : text(session[field]),
  ]));
  return {
    id: session.id,
    revision: session.revision,
    planning_state: session.planning_state,
    session_number: session.session_number,
    session_date: text(session.session_date),
    header,
    slots: [...slots].sort((a, b) =>
      PLANNED_PHASES.findIndex((phase) => phase.key === a.phase) -
        PLANNED_PHASES.findIndex((phase) => phase.key === b.phase) ||
      a.sort_order - b.sort_order || a.id.localeCompare(b.id)).map((slot) => ({
      id: slot.id,
      phase: slot.phase,
      duration: text(slot.duration_minutes),
      items: (bySlot.get(slot.id) || []).sort((a, b) =>
        a.sort_order - b.sort_order || a.id.localeCompare(b.id)),
    })),
  };
};

export const getPlannedDuration = (slots = []) =>
  slots.reduce((total, slot) => total + (Number(slot.duration_minutes ?? slot.duration) || 0), 0);

export const getPlannedEditorIssues = (editor, season) => {
  const issues = [];
  const add = (message, field, slotId = null, itemId = null) =>
    issues.push({ message, field, slotId, itemId });
  if (!editor.session_date || editor.session_date < season.starts_on ||
      editor.session_date > season.ends_on) {
    add('La fecha debe estar dentro de la temporada seleccionada.', 'session_date');
  }
  const seenSlots = new Set();
  const seenItems = new Set();
  const orderedSlots = [
    ...PLANNED_PHASES.flatMap((phase) => editor.slots.filter((slot) => slot.phase === phase.key)),
    ...editor.slots.filter((slot) => !PLANNED_PHASES.some((phase) => phase.key === slot.phase)),
  ];
  for (const [slotIndex, slot] of orderedSlots.entries()) {
    const exercise = `Ejercicio ${slotIndex + 1}`;
    if (!PLANNED_PHASES.some((phase) => phase.key === slot.phase) ||
        !slot.id || seenSlots.has(slot.id)) add(`${exercise}: identidad o fase inválida.`, 'phase', slot.id);
    seenSlots.add(slot.id);
    const minutes = positiveInteger(slot.duration);
    if (!minutes || minutes > 2147483647) add(`${exercise}: indica una duración positiva en minutos.`, 'duration', slot.id);
    if (!slot.items.length) add(`${exercise}: la Tarea A es obligatoria.`, 'items', slot.id);
    if (slot.items.length > 2) add(`${exercise}: 03B admite un máximo de dos tareas.`, 'items', slot.id);
    for (const [itemIndex, item] of slot.items.entries()) {
      const task = `${exercise}, Tarea ${String.fromCharCode(65 + itemIndex)}`;
      if (!item.id || seenItems.has(item.id)) add(`${task}: identidad inválida o repetida.`, 'id', slot.id, item.id);
      seenItems.add(item.id);
      if (item.kind === 'library_task') {
        if (!item.sourceTaskId || (!item.snapshot && !item.preview))
          add(`${task}: falta el origen o la copia de Biblioteca.`, 'library', slot.id, item.id);
        if (item.snapshot && (item.snapshot.source_task_id !== item.sourceTaskId ||
            item.snapshot.snapshot_version !== 1 || !item.snapshot.source || !item.snapshot.working))
          add(`${task}: snapshot de Biblioteca incompatible.`, 'library', slot.id, item.id);
        const name = text(getPlannedLibraryValue(item, 'name'));
        if (!name.trim() || name.length > 160)
          add(`${task}: escribe un nombre de hasta 160 caracteres.`, 'name', slot.id, item.id);
      } else if (item.kind !== 'free') {
        add(`${task}: tipo de tarea no admitido.`, 'library', slot.id, item.id);
      } else {
        if (!item.title.trim() || item.title.length > 160) {
          add(`${task}: escribe un título de hasta 160 caracteres.`, 'title', slot.id, item.id);
        }
        if (item.description.length > 10000) add(`${task}: la descripción supera 10000 caracteres.`, 'description', slot.id, item.id);
        if (item.comments.length > 5000) add(`${task}: los comentarios superan 5000 caracteres.`, 'comments', slot.id, item.id);
        if (item.url && (item.url.length > 2048 || !/^https:\/\/[^\s<>]+$/.test(item.url))) {
          add(`${task}: utiliza un enlace HTTPS de hasta 2048 caracteres.`, 'url', slot.id, item.id);
        }
      }
      if (item.minutes !== '') {
        const itemMinutes = positiveInteger(item.minutes);
        if (!itemMinutes || itemMinutes > minutes) {
          add(`${task}: la duración propia debe ser positiva y no superar el ejercicio.`, 'minutes', slot.id, item.id);
        }
      }
    }
  }
  const headerLimits = {
    location: 300, period_label: 160, morphology_pattern: 160,
    next_opponent_label: 300, objectives: 10000, notes: 10000,
    material: 5000, staff_observations: 10000,
  };
  for (const [field, max] of Object.entries(headerLimits)) {
    if (editor.header[field]?.length > max) add(`El campo ${field} supera ${max} caracteres.`, field);
  }
  if (editor.header.starts_at && !/^([01]\d|2[0-3]):[0-5]\d$/.test(editor.header.starts_at)) {
    add('La hora de inicio debe tener formato HH:MM.', 'starts_at');
  }
  return issues;
};

export const validatePlannedEditor = (editor, season) =>
  [...new Set(getPlannedEditorIssues(editor, season).map((issue) => issue.message))];

export const buildPlannedSavePayload = (editor, original) => {
  const p_header = {};
  for (const field of PLANNED_HEADER_FIELDS) {
    const next = editor.header[field] || '';
    const previous = original?.header[field] || '';
    if (next !== previous) p_header[field] = next || null;
  }
  const originalSlots = new Set((original?.slots || []).map((slot) => slot.id));
  const originalItems = new Set((original?.slots || []).flatMap((slot) => slot.items.map((item) => item.id)));
  const desiredSlots = new Set(editor.slots.map((slot) => slot.id));
  const desiredItems = new Set(editor.slots.flatMap((slot) => slot.items.map((item) => item.id)));
  const p_slots = editor.slots.map((slot) => ({
    id: slot.id,
    phase: slot.phase,
    sort_order: editor.slots.filter((other) => other.phase === slot.phase)
      .findIndex((other) => other.id === slot.id),
    duration_minutes: Number(slot.duration),
    items: slot.items.map((item, index) => item.kind === 'library_task' ? {
      id: item.id,
      sort_order: index,
      kind: 'library_task',
      activity_minutes: item.minutes === '' ? null : Number(item.minutes),
      ...(!item.snapshot ? { source_task_id: item.sourceTaskId } : (() => {
        const previous = original?.slots.flatMap((row) => row.items).find((row) => row.id === item.id);
        const patch = Object.fromEntries(Object.entries(item.working || {})
          .filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(previous?.working?.[key])));
        return Object.keys(patch).length ? { working: patch } : {};
      })()),
    } : ({
      id: item.id,
      sort_order: index,
      kind: 'free',
      free_title: item.title,
      free_description: item.description || null,
      free_comments: item.comments || null,
      free_url: item.url || null,
      activity_minutes: item.minutes === '' ? null : Number(item.minutes),
    })),
  }));
  return {
    p_session_id: editor.id,
    p_expected_revision: editor.revision,
    p_session_date: editor.session_date,
    p_header,
    p_slots,
    p_requested_number: null,
    p_removed_slot_ids: [...originalSlots].filter((id) => !desiredSlots.has(id)),
    p_removed_item_ids: [...originalItems].filter((id) => !desiredItems.has(id)),
  };
};
