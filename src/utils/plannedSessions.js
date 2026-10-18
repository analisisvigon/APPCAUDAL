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
    if (item.kind !== 'free') continue;
    const list = bySlot.get(item.slot_id) || [];
    list.push({
      id: item.id,
      title: text(item.free_title),
      description: text(item.free_description),
      comments: text(item.free_comments),
      url: text(item.free_url),
      minutes: text(item.activity_minutes),
      sort_order: item.sort_order,
    });
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
      if (!item.title.trim() || item.title.length > 160) {
        add(`${task}: escribe un título de hasta 160 caracteres.`, 'title', slot.id, item.id);
      }
      if (item.description.length > 10000) add(`${task}: la descripción supera 10000 caracteres.`, 'description', slot.id, item.id);
      if (item.comments.length > 5000) add(`${task}: los comentarios superan 5000 caracteres.`, 'comments', slot.id, item.id);
      if (item.url && (item.url.length > 2048 || !/^https:\/\/[^\s<>]+$/.test(item.url))) {
        add(`${task}: utiliza un enlace HTTPS de hasta 2048 caracteres.`, 'url', slot.id, item.id);
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
    items: slot.items.map((item, index) => ({
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
