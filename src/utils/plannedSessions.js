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

export const validatePlannedEditor = (editor, season) => {
  const errors = [];
  if (!editor.session_date || editor.session_date < season.starts_on ||
      editor.session_date > season.ends_on) {
    errors.push('La fecha debe estar dentro de la temporada seleccionada.');
  }
  const seenSlots = new Set();
  const seenItems = new Set();
  for (const slot of editor.slots) {
    if (!PLANNED_PHASES.some((phase) => phase.key === slot.phase) ||
        !slot.id || seenSlots.has(slot.id)) errors.push('Hay una franja sin identidad o fase válida.');
    seenSlots.add(slot.id);
    const minutes = positiveInteger(slot.duration);
    if (!minutes || minutes > 2147483647) errors.push('Cada franja necesita una duración positiva en minutos.');
    if (editor.planning_state === 'confirmed' && !slot.items.length) {
      errors.push('Una sesión confirmada no puede tener franjas sin actividades.');
    }
    for (const item of slot.items) {
      if (!item.id || seenItems.has(item.id)) errors.push('Hay una actividad sin identidad o repetida.');
      seenItems.add(item.id);
      if (!item.title.trim() || item.title.length > 160) {
        errors.push('Cada actividad necesita un título de hasta 160 caracteres.');
      }
      if (item.description.length > 10000 || item.comments.length > 5000) {
        errors.push('La descripción o los comentarios superan el límite permitido.');
      }
      if (item.url && (item.url.length > 2048 || !/^https:\/\/[^\s<>]+$/.test(item.url))) {
        errors.push('El enlace de la actividad debe ser HTTPS.');
      }
      if (item.minutes !== '') {
        const itemMinutes = positiveInteger(item.minutes);
        if (!itemMinutes || itemMinutes > minutes) {
          errors.push('La duración de una actividad debe ser positiva y no superar su franja.');
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
    if (editor.header[field]?.length > max) errors.push(`El campo ${field} supera ${max} caracteres.`);
  }
  return [...new Set(errors)];
};

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
